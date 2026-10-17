import type { Consent } from "./types.js";

/**
 * Versioned consent texts. The exact rendered text is hashed and stored with each consent
 * record. Bump `version` whenever wording changes so users re-consent to the new terms.
 */
export const CONSENT_TEXTS: Record<Consent["kind"], { version: string; template: string }> = {
  terms: {
    version: "2026-10-01",
    template: [
      "Your savings are collected by our licensed payment partner and held in a dedicated customer escrow account at a scheduled commercial bank.",
      "This account is separate from GoalVault's own operating accounts. GoalVault cannot use your money for its expenses, lend it, or invest it.",
      "Your money is always yours: you can pause, edit or withdraw at any time with no penalty. Withdrawals go only to your verified bank account.",
      "Savings in GoalVault are not a bank deposit and do not earn interest.",
    ].join("\n"),
  },
  mandate: {
    version: "2026-10-01",
    template: [
      "I authorise GoalVault, via its payment partner, to debit up to {{maxAmount}} {{frequency}} from {{payerMasked}} using {{method}}",
      "for my goal \"{{goalName}}\", from {{startDate}} until {{endDate}} or until the goal is reached, whichever comes first.",
      "Funds will be credited to: {{beneficiary}}.",
      "I will receive a notification at least 24 hours before every debit. I can pause or cancel this mandate at any time from the app or my UPI/bank app.",
    ].join(" "),
  },
  withdrawal: {
    version: "2026-10-01",
    template: "I request withdrawal of {{amount}} from \"{{goalName}}\" to {{destination}}.",
  },
};

const METHOD_LABEL: Record<string, string> = { upi_autopay: "UPI Autopay", enach: "bank e-mandate (eNACH)" };

export function renderConsent(kind: Consent["kind"], details: Record<string, unknown>) {
  return CONSENT_TEXTS[kind].template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = details[k];
    if (k === "method") return METHOD_LABEL[String(v)] ?? String(v);
    return v === undefined ? "" : String(v);
  });
}
