/** All monetary values are integer paise (1 INR = 100 paise) to avoid float drift. */
export type Paise = number;

export type Frequency = "daily" | "weekly" | "monthly";
export type GoalCategory = "laptop" | "smartphone" | "travel" | "education" | "gadget" | "other";
export type GoalStatus = "active" | "paused" | "completed" | "withdrawn";

export interface User {
  id: string;
  name: string;
  phone: string;
  /** Funds are only accepted after KYC (PMLA). Sandbox users are pre-verified. */
  kycStatus: "pending" | "verified";
  /** Masked refund destination; withdrawals go back to the source account only. */
  linkedBank: { bankName: string; accountMasked: string; ifsc: string };
  createdAt: string;
}

export interface Goal {
  id: string;
  userId: string;
  name: string;
  category: GoalCategory;
  targetPaise: Paise;
  deadline: string; // ISO date (YYYY-MM-DD)
  frequency: Frequency;
  contributionPaise: Paise;
  status: GoalStatus;
  mandateId: string | null;
  nextDebitAt: string | null; // ISO datetime
  milestonesReached: number[]; // e.g. [25, 50]
  createdAt: string;
  completedAt: string | null;
}

export type MandateMethod = "upi_autopay" | "enach";
export type MandateStatus = "pending_authorization" | "active" | "paused" | "revoked" | "failed";

export interface Mandate {
  id: string;
  userId: string;
  goalId: string;
  method: MandateMethod;
  /** UPI VPA (masked) or bank account (masked). We never store full account numbers. */
  payerMasked: string;
  /** Upper bound the user agreed to per debit. Debits above this are impossible. */
  maxAmountPaise: Paise;
  frequency: Frequency;
  startDate: string;
  endDate: string;
  status: MandateStatus;
  providerRef: string;
  consentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Consent {
  id: string;
  userId: string;
  kind: "terms" | "mandate" | "withdrawal";
  version: string;
  /** SHA-256 of the exact text the user saw, so the record is tamper-evident. */
  textHash: string;
  details: Record<string, unknown>;
  acceptedAt: string;
  ip: string;
  userAgent: string;
}

export type TxnType = "contribution" | "withdrawal";
export type TxnStatus = "pending" | "success" | "failed";

export interface Transaction {
  id: string;
  userId: string;
  goalId: string;
  type: TxnType;
  source: "autopay" | "manual" | "payout";
  amountPaise: Paise;
  status: TxnStatus;
  providerRef: string | null;
  idempotencyKey: string;
  failureReason: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface LedgerEntry {
  id: string;
  txnId: string;
  account: string;
  debitPaise: Paise;
  creditPaise: Paise;
  at: string;
}

export type NotificationKind =
  | "pre_debit"
  | "reminder"
  | "debit_success"
  | "debit_failed"
  | "milestone"
  | "completed"
  | "withdrawal"
  | "mandate";

export interface Notification {
  id: string;
  userId: string;
  goalId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Used to make scheduler-generated notices idempotent per debit cycle. */
  dedupeKey: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  userId: string | null;
  action: string;
  meta: Record<string, unknown>;
  at: string;
}
