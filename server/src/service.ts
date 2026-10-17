import { CONSENT_TEXTS, renderConsent } from "./consent.js";
import { newId, sha256 } from "./ids.js";
import { ESCROW_ACCOUNT, goalBalance, goalLiability, post, reconcile } from "./ledger.js";
import { addPeriod, formatINR, projectedCompletion, suggestContribution } from "./money.js";
import type { PaymentProvider, WebhookEvent } from "./payments/types.js";
import type { Store } from "./store.js";
import type {
  Consent,
  Frequency,
  Goal,
  GoalCategory,
  Mandate,
  MandateMethod,
  Notification,
  NotificationKind,
  Paise,
  Transaction,
  User,
} from "./types.js";

const HOUR = 3_600_000;
/** NPCI requires a pre-debit notification at least 24 hours before each UPI Autopay debit. */
export const PRE_DEBIT_NOTICE_MS = 24 * HOUR;
/** Debits above this need Additional Factor Authentication on UPI Autopay; we route them to eNACH. */
export const UPI_AUTOPAY_MAX_PAISE = 15_000_00;
export const MIN_CONTRIBUTION_PAISE = 10_00;
const MILESTONES = [25, 50, 75];

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "bad_request",
  ) {
    super(message);
  }
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

/** Clock with a sandbox-only offset so demos can "fast-forward" through debit cycles. */
export class Clock {
  offsetMs = 0;
  now() {
    return new Date(Date.now() + this.offsetMs);
  }
}

export class GoalVault {
  constructor(
    private store: Store,
    private provider: PaymentProvider,
    public clock = new Clock(),
  ) {}

  private get db() {
    return this.store.data;
  }
  private iso() {
    return this.clock.now().toISOString();
  }

  // ---------------------------------------------------------------- users & audit

  ensureDemoUser(): User {
    let user = this.db.users.find((u) => u.id === "usr_demo");
    if (!user) {
      user = {
        id: "usr_demo",
        name: "Alex Williams",
        phone: "+91 98XXXXXX21",
        kycStatus: "verified",
        linkedBank: { bankName: "Union Bank of India", accountMasked: "XXXX XXXX 4821", ifsc: "UBIN0XXXXXX" },
        createdAt: this.iso(),
      };
      this.db.users.push(user);
      this.store.save();
    }
    return user;
  }

  user(userId: string) {
    const user = this.db.users.find((u) => u.id === userId);
    if (!user) throw new AppError(404, "User not found", "not_found");
    return user;
  }

  private audit(userId: string | null, action: string, meta: Record<string, unknown> = {}) {
    this.db.audit.push({ id: newId("aud"), userId, action, meta, at: this.iso() });
  }

  private notify(
    userId: string,
    goalId: string | null,
    kind: NotificationKind,
    title: string,
    body: string,
    dedupeKey: string | null = null,
  ) {
    if (dedupeKey && this.db.notifications.some((n) => n.dedupeKey === dedupeKey)) return;
    const n: Notification = {
      id: newId("ntf"),
      userId,
      goalId,
      kind,
      title,
      body,
      dedupeKey,
      read: false,
      createdAt: this.iso(),
    };
    this.db.notifications.push(n);
    // Production: fan out to push (FCM/APNs), SMS and email here; the pre-debit notice is a regulatory message.
  }

  recordConsent(
    userId: string,
    kind: Consent["kind"],
    details: Record<string, unknown>,
    meta: RequestMeta,
  ): Consent {
    const tpl = CONSENT_TEXTS[kind];
    const text = renderConsent(kind, details);
    const consent: Consent = {
      id: newId("cns"),
      userId,
      kind,
      version: tpl.version,
      textHash: sha256(text),
      details,
      acceptedAt: this.iso(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    this.db.consents.push(consent);
    this.audit(userId, "consent.accepted", { consentId: consent.id, kind, version: tpl.version });
    return consent;
  }

  acceptTerms(userId: string, meta: RequestMeta) {
    const c = this.recordConsent(userId, "terms", {}, meta);
    this.store.save();
    return c;
  }

  hasAcceptedTerms(userId: string) {
    return this.db.consents.some((c) => c.userId === userId && c.kind === "terms" && c.version === CONSENT_TEXTS.terms.version);
  }

  // ---------------------------------------------------------------- goals

  goal(userId: string, goalId: string): Goal {
    const goal = this.db.goals.find((g) => g.id === goalId && g.userId === userId);
    if (!goal) throw new AppError(404, "Goal not found", "not_found");
    return goal;
  }

  private pendingContributions(goalId: string) {
    return this.db.transactions
      .filter((t) => t.goalId === goalId && t.type === "contribution" && t.status === "pending")
      .reduce((s, t) => s + t.amountPaise, 0);
  }
  private pendingWithdrawals(goalId: string) {
    return this.db.transactions
      .filter((t) => t.goalId === goalId && t.type === "withdrawal" && t.status === "pending")
      .reduce((s, t) => s + t.amountPaise, 0);
  }

  createGoal(
    userId: string,
    input: {
      name: string;
      category: GoalCategory;
      targetPaise: Paise;
      deadline: string;
      frequency: Frequency;
      contributionPaise?: Paise;
    },
  ): Goal {
    if (!this.hasAcceptedTerms(userId)) throw new AppError(403, "Please accept the terms first", "terms_required");
    const now = this.clock.now();
    const deadline = new Date(`${input.deadline}T23:59:59Z`);
    if (deadline.getTime() <= now.getTime()) throw new AppError(400, "Deadline must be in the future");
    const contribution =
      input.contributionPaise ?? suggestContribution(input.targetPaise, now, deadline, input.frequency);
    if (contribution < MIN_CONTRIBUTION_PAISE) throw new AppError(400, "Minimum contribution is ₹10");
    if (contribution > input.targetPaise) throw new AppError(400, "Contribution cannot exceed the target");
    const goal: Goal = {
      id: newId("goal"),
      userId,
      name: input.name.trim(),
      category: input.category,
      targetPaise: input.targetPaise,
      deadline: input.deadline,
      frequency: input.frequency,
      contributionPaise: contribution,
      status: "active",
      mandateId: null,
      // Manual-mode reminder schedule until autopay is authorized.
      nextDebitAt: new Date(now.getTime() + PRE_DEBIT_NOTICE_MS).toISOString(),
      milestonesReached: [],
      createdAt: now.toISOString(),
      completedAt: null,
    };
    this.db.goals.push(goal);
    this.audit(userId, "goal.created", { goalId: goal.id });
    this.store.save();
    return goal;
  }

  editGoal(
    userId: string,
    goalId: string,
    patch: Partial<Pick<Goal, "name" | "targetPaise" | "deadline" | "contributionPaise" | "frequency" | "category">>,
  ) {
    const goal = this.goal(userId, goalId);
    if (goal.status === "completed" || goal.status === "withdrawn") {
      throw new AppError(409, "Completed or closed goals cannot be edited");
    }
    const saved = goalBalance(this.db, userId, goalId);
    if (patch.targetPaise !== undefined && patch.targetPaise < saved) {
      throw new AppError(400, `Target cannot be below what you've already saved (${formatINR(saved)})`);
    }
    if (patch.deadline && new Date(`${patch.deadline}T23:59:59Z`) <= this.clock.now()) {
      throw new AppError(400, "Deadline must be in the future");
    }
    if (patch.contributionPaise !== undefined && patch.contributionPaise < MIN_CONTRIBUTION_PAISE) {
      throw new AppError(400, "Minimum contribution is ₹10");
    }
    Object.assign(goal, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));

    // A mandate is a consent for a specific max amount and frequency. If the user goes beyond
    // it we never silently debit more — we cancel it and ask them to authorize again.
    let requiresReauthorization = false;
    const mandate = goal.mandateId ? this.db.mandates.find((m) => m.id === goal.mandateId) : undefined;
    if (
      mandate &&
      mandate.status !== "revoked" &&
      (goal.contributionPaise > mandate.maxAmountPaise || goal.frequency !== mandate.frequency)
    ) {
      void this.provider.revokeMandate(mandate.providerRef);
      mandate.status = "revoked";
      mandate.updatedAt = this.iso();
      goal.mandateId = null;
      requiresReauthorization = true;
      this.notify(userId, goalId, "mandate", "Autopay needs re-authorization", `Your new plan for "${goal.name}" is above your previous Autopay limit. Approve a new mandate to keep saving automatically.`);
    }
    this.maybeComplete(goal);
    this.audit(userId, "goal.edited", { goalId, patch, requiresReauthorization });
    this.store.save();
    return { goal, requiresReauthorization };
  }

  async pauseGoal(userId: string, goalId: string) {
    const goal = this.goal(userId, goalId);
    if (goal.status !== "active") throw new AppError(409, "Only active goals can be paused");
    goal.status = "paused";
    goal.nextDebitAt = null;
    const mandate = this.activeMandate(goal);
    if (mandate) {
      await this.provider.pauseMandate(mandate.providerRef);
      mandate.status = "paused";
      mandate.updatedAt = this.iso();
    }
    this.audit(userId, "goal.paused", { goalId });
    this.notify(userId, goalId, "mandate", "Savings paused", `No debits will happen for "${goal.name}" until you resume.`);
    this.store.save();
    return goal;
  }

  async resumeGoal(userId: string, goalId: string) {
    const goal = this.goal(userId, goalId);
    if (goal.status !== "paused") throw new AppError(409, "Goal is not paused");
    goal.status = "active";
    goal.nextDebitAt = new Date(this.clock.now().getTime() + PRE_DEBIT_NOTICE_MS).toISOString();
    const mandate = goal.mandateId ? this.db.mandates.find((m) => m.id === goal.mandateId) : undefined;
    if (mandate && mandate.status === "paused") {
      await this.provider.resumeMandate(mandate.providerRef);
      mandate.status = "active";
      mandate.updatedAt = this.iso();
    }
    this.audit(userId, "goal.resumed", { goalId });
    this.store.save();
    return goal;
  }

  // ---------------------------------------------------------------- mandates

  private activeMandate(goal: Goal): Mandate | undefined {
    if (!goal.mandateId) return undefined;
    const m = this.db.mandates.find((x) => x.id === goal.mandateId);
    return m && m.status === "active" ? m : undefined;
  }

  consentPreview(userId: string, goalId: string, method: MandateMethod, payer: string) {
    const goal = this.goal(userId, goalId);
    const details = this.mandateDetails(goal, method, payer);
    return { details, text: renderConsent("mandate", details), version: CONSENT_TEXTS.mandate.version };
  }

  private mandateDetails(goal: Goal, method: MandateMethod, payer: string) {
    const start = this.clock.now();
    return {
      goalName: goal.name,
      method,
      payerMasked: maskPayer(method, payer),
      maxAmountPaise: goal.contributionPaise,
      maxAmount: formatINR(goal.contributionPaise),
      frequency: goal.frequency,
      startDate: start.toISOString().slice(0, 10),
      endDate: goal.deadline,
      beneficiary: "GoalVault Customer Escrow A/c (held at partner bank)",
    };
  }

  async createMandate(
    userId: string,
    goalId: string,
    input: { method: MandateMethod; payer: string; consentAccepted: boolean; consentVersion: string },
    meta: RequestMeta,
  ) {
    const goal = this.goal(userId, goalId);
    const user = this.user(userId);
    if (user.kycStatus !== "verified") throw new AppError(403, "Complete KYC before enabling Autopay", "kyc_required");
    if (goal.status !== "active") throw new AppError(409, "Autopay can only be set up on an active goal");
    if (this.activeMandate(goal)) throw new AppError(409, "This goal already has an active Autopay");
    if (!input.consentAccepted) throw new AppError(400, "Explicit consent is required to set up Autopay", "consent_required");
    if (input.consentVersion !== CONSENT_TEXTS.mandate.version) {
      throw new AppError(409, "The mandate terms changed. Please review them again.", "consent_outdated");
    }
    if (input.method === "upi_autopay" && goal.contributionPaise > UPI_AUTOPAY_MAX_PAISE) {
      throw new AppError(400, "UPI Autopay supports up to ₹15,000 per debit. Choose bank e-mandate (eNACH) instead.");
    }
    if (input.method === "upi_autopay" && !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(input.payer)) {
      throw new AppError(400, "Enter a valid UPI ID, e.g. name@okbank");
    }
    const details = this.mandateDetails(goal, input.method, input.payer);
    const consent = this.recordConsent(userId, "mandate", details, meta);
    const mandateId = newId("mdt");
    const { providerRef, authorizationUrl } = await this.provider.createMandate({
      mandateId,
      method: input.method,
      payer: input.payer,
      maxAmountPaise: details.maxAmountPaise,
      frequency: goal.frequency,
      startDate: details.startDate,
      endDate: details.endDate,
    });
    const mandate: Mandate = {
      id: mandateId,
      userId,
      goalId,
      method: input.method,
      payerMasked: details.payerMasked,
      maxAmountPaise: details.maxAmountPaise,
      frequency: goal.frequency,
      startDate: details.startDate,
      endDate: details.endDate,
      status: "pending_authorization",
      providerRef,
      consentId: consent.id,
      createdAt: this.iso(),
      updatedAt: this.iso(),
    };
    this.db.mandates.push(mandate);
    goal.mandateId = mandateId;
    this.audit(userId, "mandate.created", { mandateId, goalId, method: input.method });
    this.store.save();
    return { mandate, authorizationUrl };
  }

  async revokeMandate(userId: string, mandateId: string) {
    const mandate = this.db.mandates.find((m) => m.id === mandateId && m.userId === userId);
    if (!mandate) throw new AppError(404, "Mandate not found", "not_found");
    if (mandate.status === "revoked") return mandate;
    await this.provider.revokeMandate(mandate.providerRef);
    mandate.status = "revoked";
    mandate.updatedAt = this.iso();
    const goal = this.db.goals.find((g) => g.id === mandate.goalId);
    if (goal && goal.mandateId === mandate.id) goal.mandateId = null;
    this.audit(userId, "mandate.revoked", { mandateId });
    this.notify(userId, mandate.goalId, "mandate", "Autopay cancelled", "No further automatic debits will be made. Your saved money stays in your goal.");
    this.store.save();
    return mandate;
  }

  // ---------------------------------------------------------------- money movement

  async contributeOnce(userId: string, goalId: string, amountPaise: Paise, payer: string, idempotencyKey: string) {
    const goal = this.goal(userId, goalId);
    if (goal.status !== "active" && goal.status !== "paused") throw new AppError(409, "This goal is closed");
    const existing = this.db.transactions.find((t) => t.idempotencyKey === idempotencyKey && t.userId === userId);
    if (existing) return existing;
    const room = goal.targetPaise - goalBalance(this.db, userId, goalId) - this.pendingContributions(goalId);
    if (amountPaise < MIN_CONTRIBUTION_PAISE) throw new AppError(400, "Minimum top-up is ₹10");
    if (amountPaise > room) throw new AppError(400, `You only need ${formatINR(Math.max(0, room))} more for this goal`);
    const txn = this.newTxn(userId, goalId, "contribution", "manual", amountPaise, idempotencyKey);
    const { providerRef } = await this.provider.collectOnce({ payer, amountPaise, idempotencyKey, txnId: txn.id });
    txn.providerRef = providerRef;
    this.store.save();
    return txn;
  }

  async withdraw(userId: string, goalId: string, amountPaise: Paise, idempotencyKey: string, meta: RequestMeta) {
    const goal = this.goal(userId, goalId);
    const existing = this.db.transactions.find((t) => t.idempotencyKey === idempotencyKey && t.userId === userId);
    if (existing) return existing;
    const available = goalBalance(this.db, userId, goalId) - this.pendingWithdrawals(goalId);
    if (amountPaise <= 0 || amountPaise > available) {
      throw new AppError(400, `You can withdraw up to ${formatINR(Math.max(0, available))}`);
    }
    const user = this.user(userId);
    const destination = `${user.linkedBank.bankName} ${user.linkedBank.accountMasked}`;
    this.recordConsent(userId, "withdrawal", { goalName: goal.name, amount: formatINR(amountPaise), destination }, meta);
    const txn = this.newTxn(userId, goalId, "withdrawal", "payout", amountPaise, idempotencyKey);
    // Full withdrawal before completion closes the goal and stops all future debits.
    if (amountPaise === available && goal.status !== "completed") {
      goal.status = "withdrawn";
      goal.nextDebitAt = null;
      const m = goal.mandateId ? this.db.mandates.find((x) => x.id === goal.mandateId) : undefined;
      if (m && m.status !== "revoked") {
        await this.provider.revokeMandate(m.providerRef);
        m.status = "revoked";
        m.updatedAt = this.iso();
      }
    }
    const { providerRef } = await this.provider.payout({ amountPaise, idempotencyKey, txnId: txn.id, destination });
    txn.providerRef = providerRef;
    this.audit(userId, "withdrawal.requested", { goalId, txnId: txn.id, amountPaise });
    this.store.save();
    return txn;
  }

  private newTxn(
    userId: string,
    goalId: string,
    type: Transaction["type"],
    source: Transaction["source"],
    amountPaise: Paise,
    idempotencyKey: string,
  ): Transaction {
    const txn: Transaction = {
      id: newId("txn"),
      userId,
      goalId,
      type,
      source,
      amountPaise,
      status: "pending",
      providerRef: null,
      idempotencyKey,
      failureReason: null,
      createdAt: this.iso(),
      settledAt: null,
    };
    this.db.transactions.push(txn);
    return txn;
  }

  // ---------------------------------------------------------------- webhooks

  handleWebhook(event: WebhookEvent) {
    if (this.db.processedEvents.includes(event.id)) return { duplicate: true };
    this.db.processedEvents.push(event.id);

    switch (event.type) {
      case "mandate.authorized":
      case "mandate.rejected": {
        const m = this.db.mandates.find((x) => x.providerRef === event.data.providerRef);
        if (!m || m.status !== "pending_authorization") break;
        const goal = this.db.goals.find((g) => g.id === m.goalId)!;
        if (event.type === "mandate.authorized") {
          m.status = "active";
          // First debit only after the mandatory 24h pre-debit notice window.
          goal.nextDebitAt = new Date(this.clock.now().getTime() + PRE_DEBIT_NOTICE_MS).toISOString();
          this.notify(m.userId, goal.id, "mandate", "Autopay is on 🎉", `${formatINR(m.maxAmountPaise)} will be saved ${m.frequency} for "${goal.name}". You'll get a notice 24 hours before every debit.`);
        } else {
          m.status = "failed";
          if (goal.mandateId === m.id) goal.mandateId = null;
          this.notify(m.userId, goal.id, "mandate", "Autopay not set up", "The mandate was declined in your UPI/bank app. No money was debited.");
        }
        m.updatedAt = this.iso();
        break;
      }
      case "payment.captured":
      case "payment.failed":
      case "payout.processed":
      case "payout.failed": {
        const txn = this.db.transactions.find((t) => t.id === event.data.txnId);
        if (!txn || txn.status !== "pending") break;
        if (event.data.amountPaise !== txn.amountPaise) throw new AppError(400, "Amount mismatch in webhook");
        this.settle(txn, event);
        break;
      }
    }
    this.store.save();
    return { duplicate: false };
  }

  private settle(txn: Transaction, event: WebhookEvent & { data: { reason?: string } }) {
    const goal = this.db.goals.find((g) => g.id === txn.goalId)!;
    const liability = goalLiability(txn.userId, txn.goalId);
    txn.settledAt = this.iso();
    if (event.type === "payment.captured") {
      txn.status = "success";
      // Money lands in the escrow account and is owed to this user's goal.
      post(this.db, txn.id, [
        { account: ESCROW_ACCOUNT, debitPaise: txn.amountPaise },
        { account: liability, creditPaise: txn.amountPaise },
      ]);
      this.notify(txn.userId, goal.id, "debit_success", `${formatINR(txn.amountPaise)} saved`, `Added to "${goal.name}". Total: ${formatINR(goalBalance(this.db, txn.userId, goal.id))} of ${formatINR(goal.targetPaise)}.`);
      this.checkMilestones(goal);
      this.maybeComplete(goal);
    } else if (event.type === "payout.processed") {
      txn.status = "success";
      post(this.db, txn.id, [
        { account: liability, debitPaise: txn.amountPaise },
        { account: ESCROW_ACCOUNT, creditPaise: txn.amountPaise },
      ]);
      this.notify(txn.userId, goal.id, "withdrawal", `${formatINR(txn.amountPaise)} sent to your bank`, `Withdrawn from "${goal.name}". It usually reflects instantly via IMPS.`);
    } else {
      txn.status = "failed";
      txn.failureReason = event.data.reason ?? "Failed";
      if (txn.type === "contribution") {
        this.notify(txn.userId, goal.id, "debit_failed", "Couldn't save this time", `${formatINR(txn.amountPaise)} for "${goal.name}" failed: ${txn.failureReason}. We won't retry automatically; you can top up manually.`);
      } else {
        // Payout failed: money is still in escrow and still owed to the user.
        if (goal.status === "withdrawn") goal.status = "paused";
        this.notify(txn.userId, goal.id, "withdrawal", "Withdrawal failed", `Your money is safe in "${goal.name}". Reason: ${txn.failureReason}.`);
      }
    }
  }

  private checkMilestones(goal: Goal) {
    const pct = (goalBalance(this.db, goal.userId, goal.id) / goal.targetPaise) * 100;
    for (const m of MILESTONES) {
      if (pct >= m && !goal.milestonesReached.includes(m)) {
        goal.milestonesReached.push(m);
        const copy: Record<number, string> = {
          25: "A quarter of the way there. Great start!",
          50: "Halfway! Your habit is working.",
          75: "75% done. The finish line is in sight.",
        };
        this.notify(goal.userId, goal.id, "milestone", `${m}% of "${goal.name}"`, copy[m]!);
      }
    }
  }

  private maybeComplete(goal: Goal) {
    if (goal.status === "completed" || goal.status === "withdrawn") return;
    if (goalBalance(this.db, goal.userId, goal.id) < goal.targetPaise) return;
    goal.status = "completed";
    goal.completedAt = this.iso();
    goal.nextDebitAt = null;
    if (!goal.milestonesReached.includes(100)) goal.milestonesReached.push(100);
    const m = goal.mandateId ? this.db.mandates.find((x) => x.id === goal.mandateId) : undefined;
    if (m && m.status !== "revoked") {
      // Stop debiting the moment the goal is reached.
      void this.provider.revokeMandate(m.providerRef);
      m.status = "revoked";
      m.updatedAt = this.iso();
    }
    this.notify(goal.userId, goal.id, "completed", `Goal reached: ${goal.name} 🎉`, `You saved ${formatINR(goal.targetPaise)}. Autopay has been switched off. Withdraw whenever you're ready to buy.`);
  }

  // ---------------------------------------------------------------- scheduler

  /**
   * Idempotent tick. For each active goal:
   *  - 24h before a due debit: send the pre-debit notice (or a reminder for manual goals)
   *  - when due and the notice is ≥24h old: execute the debit (keyed by goal+cycle) and schedule the next.
   */
  async runScheduler() {
    const now = this.clock.now();
    for (const goal of this.db.goals) {
      if (goal.status !== "active" || !goal.nextDebitAt) continue;
      const due = new Date(goal.nextDebitAt);
      const cycleKey = `${goal.id}:${goal.nextDebitAt}`;
      const mandate = this.activeMandate(goal);
      const remaining =
        goal.targetPaise - goalBalance(this.db, goal.userId, goal.id) - this.pendingContributions(goal.id);
      if (remaining <= 0) continue;
      const amount = Math.min(goal.contributionPaise, remaining);

      if (now.getTime() >= due.getTime() - PRE_DEBIT_NOTICE_MS) {
        if (mandate) {
          this.notify(goal.userId, goal.id, "pre_debit", `Upcoming Autopay: ${formatINR(amount)}`, `On ${fmtDate(due)} we'll save ${formatINR(amount)} for "${goal.name}" from ${mandate.payerMasked}. Want to skip? Pause the goal before then.`, `pre:${cycleKey}`);
        } else {
          this.notify(goal.userId, goal.id, "reminder", `Time to save for ${goal.name}`, `Your ${goal.frequency} saving of ${formatINR(amount)} is due. Top up now, or turn on Autopay so you never miss one.`, `rem:${cycleKey}`);
        }
      }
      if (now.getTime() < due.getTime()) continue;

      if (mandate) {
        const notice = this.db.notifications.find((n) => n.dedupeKey === `pre:${cycleKey}`);
        if (!notice || now.getTime() - new Date(notice.createdAt).getTime() < PRE_DEBIT_NOTICE_MS) continue;
        const idempotencyKey = `autopay:${cycleKey}`;
        if (!this.db.transactions.some((t) => t.idempotencyKey === idempotencyKey)) {
          const txn = this.newTxn(goal.userId, goal.id, "contribution", "autopay", amount, idempotencyKey);
          const { providerRef } = await this.provider.executeDebit({
            mandateRef: mandate.providerRef,
            amountPaise: amount,
            idempotencyKey,
            txnId: txn.id,
          });
          txn.providerRef = providerRef;
        }
      }
      goal.nextDebitAt = addPeriod(due, goal.frequency).toISOString();
    }
    this.store.save();
  }

  // ---------------------------------------------------------------- read models

  goalView(goal: Goal) {
    const saved = goalBalance(this.db, goal.userId, goal.id);
    const mandate = goal.mandateId ? this.db.mandates.find((m) => m.id === goal.mandateId) ?? null : null;
    const now = this.clock.now();
    const remaining = Math.max(0, goal.targetPaise - saved);
    const projected = projectedCompletion(remaining, goal.contributionPaise, goal.nextDebitAt ? new Date(goal.nextDebitAt) : now, goal.frequency);
    return {
      ...goal,
      savedPaise: saved,
      remainingPaise: remaining,
      progress: goal.targetPaise ? Math.min(1, saved / goal.targetPaise) : 0,
      pendingPaise: this.pendingContributions(goal.id),
      mandate,
      projectedCompletion: goal.status === "active" ? projected?.toISOString().slice(0, 10) ?? null : null,
      onTrack: goal.status !== "active" || !projected || projected.toISOString().slice(0, 10) <= goal.deadline,
      streak: this.streak(goal.id),
    };
  }

  /** Consecutive successful contributions, most recent first, ignoring pending ones. */
  private streak(goalId: string) {
    const txns = this.db.transactions
      .filter((t) => t.goalId === goalId && t.type === "contribution" && t.status !== "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let n = 0;
    for (const t of txns) {
      if (t.status !== "success") break;
      n++;
    }
    return n;
  }

  summary(userId: string) {
    const goals = this.db.goals.filter((g) => g.userId === userId).map((g) => this.goalView(g));
    const monthStart = this.iso().slice(0, 7);
    const txns = this.db.transactions.filter((t) => t.userId === userId && t.status === "success");
    const savedThisMonth = txns
      .filter((t) => t.type === "contribution" && (t.settledAt ?? "").startsWith(monthStart))
      .reduce((s, t) => s + t.amountPaise, 0);
    const withdrawnThisMonth = txns
      .filter((t) => t.type === "withdrawal" && (t.settledAt ?? "").startsWith(monthStart))
      .reduce((s, t) => s + t.amountPaise, 0);
    const upcoming = goals
      .filter((g) => g.status === "active" && g.nextDebitAt && g.mandate?.status === "active")
      .map((g) => ({ goalId: g.id, goalName: g.name, at: g.nextDebitAt!, amountPaise: Math.min(g.contributionPaise, g.remainingPaise) }))
      .sort((a, b) => a.at.localeCompare(b.at));
    return {
      user: this.user(userId),
      termsAccepted: this.hasAcceptedTerms(userId),
      totalSavedPaise: goals.reduce((s, g) => s + g.savedPaise, 0),
      savedThisMonthPaise: savedThisMonth,
      withdrawnThisMonthPaise: withdrawnThisMonth,
      activeGoals: goals.filter((g) => g.status === "active").length,
      goals,
      upcoming,
      unread: this.db.notifications.filter((n) => n.userId === userId && !n.read).length,
      now: this.iso(),
    };
  }

  transactions(userId: string, goalId?: string) {
    return this.db.transactions
      .filter((t) => t.userId === userId && (!goalId || t.goalId === goalId))
      .map((t) => ({ ...t, goalName: this.db.goals.find((g) => g.id === t.goalId)?.name ?? "" }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  notifications(userId: string) {
    return this.db.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  markRead(userId: string) {
    for (const n of this.db.notifications) if (n.userId === userId) n.read = true;
    this.store.save();
  }

  trust(userId: string) {
    return {
      reconciliation: reconcile(this.db),
      mandates: this.db.mandates
        .filter((m) => m.userId === userId)
        .map((m) => ({ ...m, goalName: this.db.goals.find((g) => g.id === m.goalId)?.name ?? "" }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      consents: this.db.consents.filter((c) => c.userId === userId).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt)),
      provider: this.provider.name,
    };
  }
}

export function maskPayer(method: MandateMethod, payer: string) {
  if (method === "upi_autopay") {
    const [name, handle] = payer.split("@");
    return `${name!.slice(0, 2)}${"•".repeat(Math.max(2, name!.length - 2))}@${handle}`;
  }
  return `A/c •••• ${payer.replace(/\D/g, "").slice(-4)}`;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
