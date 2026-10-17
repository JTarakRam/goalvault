import type { Frequency, MandateMethod, Paise } from "../types.js";

/**
 * Abstraction over a licensed payment aggregator / sponsor bank.
 * GoalVault never touches card/UPI credentials: authorization happens inside the user's
 * UPI app (UPI PIN) or their bank's eNACH page, and we only hold provider references.
 */
export interface PaymentProvider {
  readonly name: string;
  createMandate(input: {
    mandateId: string;
    method: MandateMethod;
    payer: string;
    maxAmountPaise: Paise;
    frequency: Frequency;
    startDate: string;
    endDate: string;
  }): Promise<{ providerRef: string; authorizationUrl: string }>;
  pauseMandate(providerRef: string): Promise<void>;
  resumeMandate(providerRef: string): Promise<void>;
  revokeMandate(providerRef: string): Promise<void>;
  /** Debit against an active mandate. Must be idempotent on `idempotencyKey`. */
  executeDebit(input: {
    mandateRef: string;
    amountPaise: Paise;
    idempotencyKey: string;
    txnId: string;
  }): Promise<{ providerRef: string }>;
  /** One-time UPI collect / intent payment for manual top-ups. */
  collectOnce(input: { payer: string; amountPaise: Paise; idempotencyKey: string; txnId: string }): Promise<{
    providerRef: string;
  }>;
  /** Payout from the escrow account back to the user's verified source account. */
  payout(input: { amountPaise: Paise; idempotencyKey: string; txnId: string; destination: string }): Promise<{
    providerRef: string;
  }>;
}

export type WebhookEvent =
  | { id: string; type: "mandate.authorized" | "mandate.rejected"; created: number; data: { providerRef: string } }
  | {
      id: string;
      type: "payment.captured" | "payment.failed";
      created: number;
      data: { providerRef: string; txnId: string; amountPaise: Paise; reason?: string };
    }
  | {
      id: string;
      type: "payout.processed" | "payout.failed";
      created: number;
      data: { providerRef: string; txnId: string; amountPaise: Paise; reason?: string };
    };
