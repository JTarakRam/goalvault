import { newId, nowIso } from "./ids.js";
import type { DB } from "./store.js";
import type { LedgerEntry, Paise } from "./types.js";

/**
 * Double-entry ledger.
 *
 * Customer money lives ONLY in `asset:escrow_bank` (a partner-bank escrow / nodal account
 * opened in the name of the regulated entity for the benefit of customers). Each rupee there
 * is matched by a liability to a specific user's goal. The company's own money lives in
 * `asset:operating_bank` and the two are never posted against each other.
 */
export const ESCROW_ACCOUNT = "asset:escrow_bank";
export const OPERATING_ACCOUNT = "asset:operating_bank";
export const goalLiability = (userId: string, goalId: string) => `liability:user:${userId}:goal:${goalId}`;

export interface Posting {
  account: string;
  debitPaise?: Paise;
  creditPaise?: Paise;
}

export function post(db: DB, txnId: string, postings: Posting[]): LedgerEntry[] {
  const debits = postings.reduce((s, p) => s + (p.debitPaise ?? 0), 0);
  const credits = postings.reduce((s, p) => s + (p.creditPaise ?? 0), 0);
  if (debits !== credits || debits <= 0) throw new Error(`Unbalanced ledger posting for ${txnId}`);
  const touchesEscrow = postings.some((p) => p.account === ESCROW_ACCOUNT);
  const touchesOperating = postings.some((p) => p.account === OPERATING_ACCOUNT);
  if (touchesEscrow && touchesOperating) {
    throw new Error("Customer escrow funds may never be posted against operating funds");
  }
  const at = nowIso();
  const entries = postings.map((p) => ({
    id: newId("le"),
    txnId,
    account: p.account,
    debitPaise: p.debitPaise ?? 0,
    creditPaise: p.creditPaise ?? 0,
    at,
  }));
  db.ledger.push(...entries);
  return entries;
}

/** Natural balance: assets are debit-normal, liabilities are credit-normal. */
export function balance(db: DB, account: string): Paise {
  let dr = 0;
  let cr = 0;
  for (const e of db.ledger) {
    if (e.account !== account) continue;
    dr += e.debitPaise;
    cr += e.creditPaise;
  }
  return account.startsWith("asset:") ? dr - cr : cr - dr;
}

export const goalBalance = (db: DB, userId: string, goalId: string) => balance(db, goalLiability(userId, goalId));

/** Escrow must exactly equal the sum of what is owed to customers. */
export function reconcile(db: DB) {
  const escrow = balance(db, ESCROW_ACCOUNT);
  const liabilities = new Set(db.ledger.filter((e) => e.account.startsWith("liability:user:")).map((e) => e.account));
  let owed = 0;
  for (const acc of liabilities) owed += balance(db, acc);
  return { escrowPaise: escrow, customerLiabilitiesPaise: owed, balanced: escrow === owed };
}
