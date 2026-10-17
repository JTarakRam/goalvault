import { beforeEach, describe, expect, it } from "vitest";
import { ESCROW_ACCOUNT, OPERATING_ACCOUNT, balance, post, reconcile } from "../src/ledger.js";
import { addPeriod, suggestContribution } from "../src/money.js";
import { SandboxProvider } from "../src/payments/sandbox.js";
import { sign, verify } from "../src/payments/webhook.js";
import { CONSENT_TEXTS } from "../src/consent.js";
import { GoalVault } from "../src/service.js";
import { Store } from "../src/store.js";

const SECRET = "test-secret";
const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const HOUR = 3_600_000;

function setup() {
  const store = new Store(null);
  const sandbox = new SandboxProvider(SECRET);
  const app = new GoalVault(store, sandbox);
  sandbox.attach(async (raw, sig) => {
    app.handleWebhook(verify(SECRET, raw, sig));
  });
  const user = app.ensureDemoUser();
  app.acceptTerms(user.id, meta);
  const advance = async (hours: number) => {
    for (let i = 0; i < hours; i++) {
      app.clock.offsetMs += HOUR;
      await app.runScheduler();
      await sandbox.flush();
    }
  };
  return { app, store, sandbox, user, advance };
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function goalWithAutopay(ctx: ReturnType<typeof setup>, payer = "alex@okaxis", target = 1000_00, contribution = 300_00) {
  const goal = ctx.app.createGoal(ctx.user.id, {
    name: "Laptop",
    category: "laptop",
    targetPaise: target,
    deadline: inDays(60),
    frequency: "daily",
    contributionPaise: contribution,
  });
  const { mandate } = await ctx.app.createMandate(
    ctx.user.id,
    goal.id,
    { method: "upi_autopay", payer, consentAccepted: true, consentVersion: CONSENT_TEXTS.mandate.version },
    meta,
  );
  ctx.sandbox.approve(mandate.providerRef, true);
  await ctx.sandbox.flush();
  return { goal, mandate };
}

describe("money", () => {
  it("rounds suggested contributions up to whole rupees", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-10T23:59:59Z");
    expect(suggestContribution(1000_00, from, to, "daily")).toBe(100_00);
    expect(suggestContribution(1001_00, from, to, "daily") % 100).toBe(0);
  });
  it("clamps monthly periods to month end", () => {
    expect(addPeriod(new Date("2026-01-31T00:00:00Z"), "monthly").toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("ledger", () => {
  it("rejects unbalanced postings and escrow/operating mixing", () => {
    const { store } = setup();
    expect(() => post(store.data, "t1", [{ account: ESCROW_ACCOUNT, debitPaise: 100 }])).toThrow(/Unbalanced/);
    expect(() =>
      post(store.data, "t2", [
        { account: ESCROW_ACCOUNT, debitPaise: 100 },
        { account: OPERATING_ACCOUNT, creditPaise: 100 },
      ]),
    ).toThrow(/never be posted/);
  });
});

describe("webhooks", () => {
  it("verifies signatures and rejects tampering or stale timestamps", () => {
    const body = JSON.stringify({ id: "evt_1", type: "mandate.authorized", created: 0, data: { providerRef: "x" } });
    const sig = sign(SECRET, body);
    expect(verify(SECRET, body, sig).id).toBe("evt_1");
    expect(() => verify(SECRET, body.replace("x", "y"), sig)).toThrow(/Invalid/);
    expect(() => verify("wrong", body, sig)).toThrow(/Invalid/);
    const old = sign(SECRET, body, Math.floor(Date.now() / 1000) - 3600);
    expect(() => verify(SECRET, body, old)).toThrow(/tolerance/);
  });
});

describe("autopay lifecycle", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("requires explicit consent and records a hashed consent", async () => {
    const goal = ctx.app.createGoal(ctx.user.id, { name: "Phone", category: "smartphone", targetPaise: 5000_00, deadline: inDays(30), frequency: "weekly" });
    await expect(
      ctx.app.createMandate(ctx.user.id, goal.id, { method: "upi_autopay", payer: "a@ok", consentAccepted: false, consentVersion: CONSENT_TEXTS.mandate.version }, meta),
    ).rejects.toThrow(/consent/i);
    await ctx.app.createMandate(ctx.user.id, goal.id, { method: "upi_autopay", payer: "alex@okaxis", consentAccepted: true, consentVersion: CONSENT_TEXTS.mandate.version }, meta);
    const consent = ctx.store.data.consents.find((c) => c.kind === "mandate")!;
    expect(consent.textHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ctx.store.data.mandates[0]!.payerMasked).not.toContain("alex@");
  });

  it("sends a pre-debit notice 24h before and never debits sooner", async () => {
    const { goal } = await goalWithAutopay(ctx);
    await ctx.advance(1);
    expect(ctx.store.data.notifications.some((n) => n.kind === "pre_debit")).toBe(true);
    await ctx.advance(22);
    expect(ctx.store.data.transactions).toHaveLength(0);
    await ctx.advance(2);
    expect(ctx.app.goalView(ctx.app.goal(ctx.user.id, goal.id)).savedPaise).toBe(300_00);
  });

  it("caps the last debit, completes the goal, revokes autopay and keeps escrow reconciled", async () => {
    const { goal, mandate } = await goalWithAutopay(ctx);
    await ctx.advance(24 * 6);
    const view = ctx.app.goalView(ctx.app.goal(ctx.user.id, goal.id));
    expect(view.savedPaise).toBe(1000_00); // 300 + 300 + 300 + 100
    expect(view.status).toBe("completed");
    expect(ctx.store.data.mandates.find((m) => m.id === mandate.id)!.status).toBe("revoked");
    expect(view.milestonesReached).toEqual([25, 50, 75, 100]);
    expect(reconcile(ctx.store.data)).toMatchObject({ escrowPaise: 1000_00, balanced: true });
    expect(balance(ctx.store.data, OPERATING_ACCOUNT)).toBe(0);
  });

  it("pausing stops debits", async () => {
    const { goal } = await goalWithAutopay(ctx);
    await ctx.app.pauseGoal(ctx.user.id, goal.id);
    await ctx.advance(24 * 5);
    expect(ctx.store.data.transactions).toHaveLength(0);
  });

  it("failed debits notify and do not touch the ledger", async () => {
    await goalWithAutopay(ctx, "fail@okaxis");
    await ctx.advance(26);
    expect(ctx.store.data.transactions[0]!.status).toBe("failed");
    expect(ctx.store.data.ledger).toHaveLength(0);
    expect(ctx.store.data.notifications.some((n) => n.kind === "debit_failed")).toBe(true);
  });

  it("raising the contribution above the mandate limit requires re-authorization", async () => {
    const { goal } = await goalWithAutopay(ctx);
    const res = ctx.app.editGoal(ctx.user.id, goal.id, { contributionPaise: 500_00 });
    expect(res.requiresReauthorization).toBe(true);
    expect(res.goal.mandateId).toBeNull();
  });

  it("withdrawals are idempotent, capped at balance and settle out of escrow", async () => {
    const { goal } = await goalWithAutopay(ctx);
    await ctx.advance(26);
    await expect(ctx.app.withdraw(ctx.user.id, goal.id, 999_00, "key-12345678", meta)).rejects.toThrow(/up to/);
    const t1 = await ctx.app.withdraw(ctx.user.id, goal.id, 100_00, "key-abcdefgh", meta);
    const t2 = await ctx.app.withdraw(ctx.user.id, goal.id, 100_00, "key-abcdefgh", meta);
    expect(t2.id).toBe(t1.id);
    await ctx.sandbox.flush();
    expect(ctx.app.goalView(ctx.app.goal(ctx.user.id, goal.id)).savedPaise).toBe(200_00);
    expect(reconcile(ctx.store.data).balanced).toBe(true);
  });

  it("ignores replayed webhook events", async () => {
    const goal = ctx.app.createGoal(ctx.user.id, { name: "Trip", category: "travel", targetPaise: 1000_00, deadline: inDays(30), frequency: "weekly" });
    const txn = await ctx.app.contributeOnce(ctx.user.id, goal.id, 100_00, "alex@okaxis", "manual-12345678");
    const event = { id: "evt_dup", type: "payment.captured" as const, created: 0, data: { providerRef: "p", txnId: txn.id, amountPaise: 100_00 } };
    ctx.app.handleWebhook(event);
    expect(ctx.app.handleWebhook(event).duplicate).toBe(true);
    expect(ctx.app.goalView(ctx.app.goal(ctx.user.id, goal.id)).savedPaise).toBe(100_00);
  });
});
