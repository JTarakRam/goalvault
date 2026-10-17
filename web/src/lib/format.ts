import type { Category, Frequency } from "./api";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const rupees = (paise: number) => inr.format(paise / 100);
export const rupeesPlain = (paise: number) => new Intl.NumberFormat("en-IN").format(Math.round(paise / 100));

export const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const dayMonth = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export const FREQ_LABEL: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
export const FREQ_UNIT: Record<Frequency, string> = { daily: "day", weekly: "week", monthly: "month" };

export const CATEGORY_LABEL: Record<Category, string> = {
  laptop: "Laptop",
  smartphone: "Smartphone",
  travel: "Travel",
  education: "Course",
  gadget: "Gadget",
  other: "Something else",
};

/** Mirrors the server: contribution per period, rounded up to whole rupees. */
export function suggest(targetRupees: number, deadline: string, frequency: Frequency): number {
  const end = new Date(`${deadline}T23:59:59`);
  const now = new Date();
  if (!targetRupees || end <= now) return 0;
  let periods = 0;
  const d = new Date(now);
  while (d <= end && periods < 10000) {
    periods++;
    if (frequency === "daily") d.setDate(d.getDate() + 1);
    else if (frequency === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  }
  return Math.ceil(targetRupees / Math.max(1, periods));
}

export const isoInDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
