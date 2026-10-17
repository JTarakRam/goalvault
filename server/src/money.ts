import type { Frequency, Paise } from "./types.js";

export const rupeesToPaise = (rupees: number): Paise => Math.round(rupees * 100);

export const formatINR = (paise: Paise): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    paise / 100,
  );

const DAY_MS = 86_400_000;

/** Adds one contribution period to a date. Monthly clamps to the last valid day (Jan 31 -> Feb 28). */
export function addPeriod(date: Date, frequency: Frequency): Date {
  const d = new Date(date.getTime());
  if (frequency === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return d;
}

/** Number of contribution periods between `from` and `deadline` (inclusive of the first debit). */
export function periodsUntil(from: Date, deadline: Date, frequency: Frequency): number {
  if (deadline.getTime() <= from.getTime()) return 1;
  let count = 0;
  let cursor = new Date(from.getTime());
  while (cursor.getTime() <= deadline.getTime() && count < 10_000) {
    count++;
    cursor = addPeriod(cursor, frequency);
  }
  return Math.max(1, count);
}

/**
 * Suggested per-period contribution to reach `remaining` by the deadline,
 * rounded up to the next whole rupee so the user never falls short.
 */
export function suggestContribution(remaining: Paise, from: Date, deadline: Date, frequency: Frequency): Paise {
  if (remaining <= 0) return 0;
  const periods = periodsUntil(from, deadline, frequency);
  return Math.ceil(remaining / periods / 100) * 100;
}

/** Projected completion date if the user keeps contributing `amount` every period. */
export function projectedCompletion(remaining: Paise, amount: Paise, from: Date, frequency: Frequency): Date | null {
  if (remaining <= 0) return from;
  if (amount <= 0) return null;
  const periods = Math.ceil(remaining / amount);
  let d = new Date(from.getTime());
  for (let i = 1; i < periods; i++) d = addPeriod(d, frequency);
  return d;
}

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);
