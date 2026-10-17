import { newId } from "../ids.js";
import type { PaymentProvider, WebhookEvent } from "./types.js";
import { sign } from "./webhook.js";

type Deliver = (rawBody: string, signature: string) => Promise<void>;

interface SandboxMandate {
  ref: string;
  payer: string;
  maxAmountPaise: number;
  status: "created" | "active" | "paused" | "revoked";
}

/**
 * In-process stand-in for a payment aggregator. It behaves like the real thing from the
 * app's point of view: mandates need explicit user approval, debits are asynchronous and
 * results arrive only through HMAC-signed webhooks that go through the same verification
 * path as production traffic.
 *
 * Test hooks: a payer containing "fail" (e.g. `fail@okaxis`) simulates insufficient funds.
 */
export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  private mandates = new Map<string, SandboxMandate>();
  private idempotency = new Map<string, string>();
  private queue: WebhookEvent[] = [];
  private deliver: Deliver | null = null;

  constructor(private secret: string) {}

  attach(deliver: Deliver) {
    this.deliver = deliver;
  }

  /** Deliver queued webhook events. Real providers do this over HTTPS with retries. */
  async flush() {
    while (this.queue.length) {
      const event = this.queue.shift()!;
      const raw = JSON.stringify(event);
      await this.deliver?.(raw, sign(this.secret, raw));
    }
  }

  private emit(type: WebhookEvent["type"], data: Record<string, unknown>) {
    this.queue.push({ id: newId("evt"), type, created: Math.floor(Date.now() / 1000), data } as WebhookEvent);
  }

  async createMandate(input: Parameters<PaymentProvider["createMandate"]>[0]) {
    const ref = newId("sbx_mdt");
    this.mandates.set(ref, { ref, payer: input.payer, maxAmountPaise: input.maxAmountPaise, status: "created" });
    return { providerRef: ref, authorizationUrl: `/sandbox/authorize/${ref}` };
  }

  /** Simulates the user approving (UPI PIN) or declining in their UPI / bank app. */
  approve(ref: string, approved: boolean) {
    const m = this.mandates.get(ref);
    if (!m || m.status !== "created") throw new Error("Unknown or already processed mandate");
    m.status = approved ? "active" : "revoked";
    this.emit(approved ? "mandate.authorized" : "mandate.rejected", { providerRef: ref });
  }

  async pauseMandate(ref: string) {
    const m = this.mandates.get(ref);
    if (m && m.status === "active") m.status = "paused";
  }
  async resumeMandate(ref: string) {
    const m = this.mandates.get(ref);
    if (m && m.status === "paused") m.status = "active";
  }
  async revokeMandate(ref: string) {
    const m = this.mandates.get(ref);
    if (m) m.status = "revoked";
  }

  async executeDebit(input: Parameters<PaymentProvider["executeDebit"]>[0]) {
    const seen = this.idempotency.get(input.idempotencyKey);
    if (seen) return { providerRef: seen };
    const ref = newId("sbx_pay");
    this.idempotency.set(input.idempotencyKey, ref);
    const m = this.mandates.get(input.mandateRef);
    const base = { providerRef: ref, txnId: input.txnId, amountPaise: input.amountPaise };
    if (!m || m.status !== "active") this.emit("payment.failed", { ...base, reason: "Mandate not active" });
    else if (input.amountPaise > m.maxAmountPaise)
      this.emit("payment.failed", { ...base, reason: "Amount exceeds mandate limit" });
    else if (m.payer.includes("fail")) this.emit("payment.failed", { ...base, reason: "Insufficient funds" });
    else this.emit("payment.captured", base);
    return { providerRef: ref };
  }

  async collectOnce(input: Parameters<PaymentProvider["collectOnce"]>[0]) {
    const seen = this.idempotency.get(input.idempotencyKey);
    if (seen) return { providerRef: seen };
    const ref = newId("sbx_col");
    this.idempotency.set(input.idempotencyKey, ref);
    const base = { providerRef: ref, txnId: input.txnId, amountPaise: input.amountPaise };
    if (input.payer.includes("fail")) this.emit("payment.failed", { ...base, reason: "Declined by payer" });
    else this.emit("payment.captured", base);
    return { providerRef: ref };
  }

  async payout(input: Parameters<PaymentProvider["payout"]>[0]) {
    const seen = this.idempotency.get(input.idempotencyKey);
    if (seen) return { providerRef: seen };
    const ref = newId("sbx_pout");
    this.idempotency.set(input.idempotencyKey, ref);
    this.emit("payout.processed", { providerRef: ref, txnId: input.txnId, amountPaise: input.amountPaise });
    return { providerRef: ref };
  }
}
