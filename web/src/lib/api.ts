export type Frequency = "daily" | "weekly" | "monthly";
export type Category = "laptop" | "smartphone" | "travel" | "education" | "gadget" | "other";
export type GoalStatus = "active" | "paused" | "completed" | "withdrawn";
export type MandateMethod = "upi_autopay" | "enach";

export interface Mandate {
  id: string;
  goalId: string;
  goalName?: string;
  method: MandateMethod;
  payerMasked: string;
  maxAmountPaise: number;
  frequency: Frequency;
  startDate: string;
  endDate: string;
  status: "pending_authorization" | "active" | "paused" | "revoked" | "failed";
  providerRef: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  category: Category;
  targetPaise: number;
  deadline: string;
  frequency: Frequency;
  contributionPaise: number;
  status: GoalStatus;
  nextDebitAt: string | null;
  milestonesReached: number[];
  createdAt: string;
  completedAt: string | null;
  savedPaise: number;
  remainingPaise: number;
  pendingPaise: number;
  progress: number;
  mandate: Mandate | null;
  projectedCompletion: string | null;
  onTrack: boolean;
  streak: number;
}

export interface Summary {
  user: { name: string; linkedBank: { bankName: string; accountMasked: string } };
  termsAccepted: boolean;
  totalSavedPaise: number;
  savedThisMonthPaise: number;
  withdrawnThisMonthPaise: number;
  activeGoals: number;
  goals: Goal[];
  upcoming: { goalId: string; goalName: string; at: string; amountPaise: number }[];
  unread: number;
  now: string;
}

export interface Txn {
  id: string;
  goalId: string;
  goalName: string;
  type: "contribution" | "withdrawal";
  source: "autopay" | "manual" | "payout";
  amountPaise: number;
  status: "pending" | "success" | "failed";
  failureReason: string | null;
  createdAt: string;
}

export interface Notice {
  id: string;
  goalId: string | null;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface Trust {
  reconciliation: { escrowPaise: number; customerLiabilitiesPaise: number; balanced: boolean };
  mandates: Mandate[];
  consents: { id: string; kind: string; version: string; textHash: string; acceptedAt: string }[];
  provider: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "gv_token";
let token: string | null = null;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
} catch {
  /* storage unavailable */
}

async function signIn() {
  const res = await fetch("/api/auth/demo", { method: "POST" });
  token = (await res.json()).token;
  try {
    sessionStorage.setItem(TOKEN_KEY, token!);
  } catch {
    /* ignore */
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, retry = true): Promise<T> {
  if (!token) await signIn();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry) {
    token = null;
    return request(method, path, body, headers, false);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? "Request failed");
  return data as T;
}

/** One key per user intent, so a double tap or network retry can never move money twice. */
export const newIdempotencyKey = () => crypto.randomUUID();

export const api = {
  summary: () => request<Summary>("GET", "/me/summary"),
  acceptTerms: () => request("POST", "/me/terms"),
  createGoal: (b: { name: string; category: Category; targetRupees: number; deadline: string; frequency: Frequency; contributionRupees?: number }) =>
    request<Goal>("POST", "/goals", b),
  goal: (id: string) => request<Goal>("GET", `/goals/${id}`),
  editGoal: (id: string, b: Partial<{ name: string; targetRupees: number; deadline: string; frequency: Frequency; contributionRupees: number }>) =>
    request<{ goal: Goal; requiresReauthorization: boolean }>("PATCH", `/goals/${id}`, b),
  pause: (id: string) => request<Goal>("POST", `/goals/${id}/pause`),
  resume: (id: string) => request<Goal>("POST", `/goals/${id}/resume`),
  mandatePreview: (id: string, method: MandateMethod, payer: string) =>
    request<{ text: string; version: string; details: Record<string, string | number> }>(
      "GET",
      `/goals/${id}/mandate/preview?method=${method}&payer=${encodeURIComponent(payer)}`,
    ),
  createMandate: (id: string, b: { method: MandateMethod; payer: string; consentAccepted: true; consentVersion: string }) =>
    request<{ mandate: Mandate; authorizationUrl: string }>("POST", `/goals/${id}/mandate`, b),
  revokeMandate: (id: string) => request<Mandate>("POST", `/mandates/${id}/revoke`),
  contribute: (id: string, amountRupees: number, payer: string, key: string) =>
    request<Txn>("POST", `/goals/${id}/contribute`, { amountRupees, payer }, { "idempotency-key": key }),
  withdraw: (id: string, amountRupees: number, key: string) =>
    request<Txn>("POST", `/goals/${id}/withdraw`, { amountRupees }, { "idempotency-key": key }),
  transactions: (goalId?: string) => request<Txn[]>("GET", `/transactions${goalId ? `?goalId=${goalId}` : ""}`),
  notifications: () => request<Notice[]>("GET", "/notifications"),
  markRead: () => request("POST", "/notifications/read"),
  trust: () => request<Trust>("GET", "/trust"),
  sandboxDecide: (ref: string, approve: boolean) => request("POST", `/sandbox/mandates/${ref}/${approve ? "approve" : "decline"}`),
  sandboxAdvance: (days: number) => request<{ now: string }>("POST", "/sandbox/advance", { days }),
  sandboxFlush: () => request("POST", "/sandbox/flush").catch(() => undefined),
};
