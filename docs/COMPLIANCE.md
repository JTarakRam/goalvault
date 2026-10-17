# Payments, consent & fund safety

GoalVault moves real customer money in production, so the design keeps that money in someone
else's regulated account, makes every debit something the user explicitly approved, and keeps
an auditable record of all of it. This document covers how the code does that and what a
production launch still needs.

> **Not legal advice.** Regulations change. Before launch, confirm the operating model with
> counsel and your sponsor bank / payment aggregator.

## 1. Where the money lives

```
User's bank ──UPI Autopay / eNACH──▶  Customer Escrow A/c  ──IMPS payout──▶  User's own bank
                                     (partner bank, held for
                                      the benefit of customers)

GoalVault Operating A/c  ◀── fees/revenue only. Never receives or pays customer savings.
```

* GoalVault does **not** hold customer funds in its own account. Collections settle into an
  escrow / nodal account operated with a licensed **Payment Aggregator** (RBI PA guidelines) or a
  sponsor bank. The operating account is separate.
* The app has no access to "use" savings. There is no lending, investing or float income on
  them, and the UI says plainly that savings are **not a bank deposit and earn no interest**.
  If you later want interest, partner with a bank (RD/FD) or a SEBI-registered product. That
  is a different regulatory model.
* **Withdrawals go only to the source / verified account.** This blocks account-takeover cash-outs
  and is standard AML practice.

## 2. Double-entry ledger (`server/src/ledger.ts`)

| Event | Debit | Credit |
|---|---|---|
| Contribution captured | `asset:escrow_bank` | `liability:user:{u}:goal:{g}` |
| Withdrawal paid out | `liability:user:{u}:goal:{g}` | `asset:escrow_bank` |

* Balances are always **derived from ledger entries**, never stored as a mutable number.
* Every posting must balance, and **a posting that touches both escrow and operating accounts is
  rejected in code**.
* `reconcile()` checks that escrow equals the total owed to customers. It is shown live in the
  app's Safety tab. In production, run it daily against the bank statement (T+1) and alert on
  any difference.

## 3. Mandates & consent

**UPI Autopay (NPCI recurring mandates)**
* The user authorises the mandate **in their own UPI app with their UPI PIN**. GoalVault never sees
  credentials.
* The mandate is created with a **max amount equal to the contribution** the user chose, plus a
  frequency, start date and end date (the goal deadline).
* **Pre-debit notification ≥ 24h before every debit** is enforced in `runScheduler()`. A debit
  can't execute unless a notice for that cycle went out at least 24h earlier.
* Debits above ₹15,000 need an additional authentication factor (AFA) for each debit, so the app
  routes larger contributions to eNACH.
* Users can pause or revoke from GoalVault or from their UPI app.

**eNACH (NPCI e-mandate via net banking / debit card)** follows the same model, with
authorisation on the bank's page.

**Consent records (`server/src/consent.ts`)**
* Consent texts are versioned. Each acceptance stores the version, a **SHA-256 hash of the exact
  rendered text**, a timestamp, IP and user agent. If the version changes, the client must show
  the new text again (`consent_outdated`).
* The UI shows a plain-language summary (amount, frequency, source, validity, destination) **and**
  the full mandate text, and the user must tick two separate boxes.

**Changing the plan never quietly widens consent.** If an edit raises the amount above the
mandate cap or changes the frequency, the old mandate is revoked and the user re-authorises.

## 4. Payment safety

* **Idempotency:** every money-moving request needs an `Idempotency-Key`. Scheduler debits are
  keyed by `goal + cycle`, so retries and double taps can't double-charge.
* **Webhooks:** HMAC-SHA256 over `timestamp.body`, compared in constant time, with a 5-minute
  timestamp tolerance, **event-id replay protection** and an amount cross-check against the
  pending transaction. Money state changes only through verified webhooks.
* **Auto-stop:** the mandate is revoked as soon as the goal is reached, and the final debit is
  capped at the remaining amount.
* **Failures:** a failed debit is recorded and the user is notified. There is no silent retry and
  no "catch-up" double debit.

## 5. Data protection (DPDP Act 2023)

* Only masked UPI IDs and account numbers are stored. No card data, so the app is out of PCI
  scope.
* Purpose-limited consent, audit log (`db.audit`), and data export/erasure endpoints are needed
  before launch. Erasure must keep financial records for the retention periods PMLA requires.

## 6. Production checklist

- [ ] Sign up with a licensed Payment Aggregator / sponsor bank for UPI Autopay, eNACH and payouts; open the customer escrow account.
- [ ] Implement `PaymentProvider` for that partner (`server/src/payments/types.ts`) and remove sandbox routes.
- [ ] KYC before first collection (Aadhaar OTP / CKYC / video KYC), sanctions screening, and transaction monitoring under PMLA.
- [ ] Replace the JSON store with Postgres; wrap ledger writes plus status changes in one SERIALIZABLE transaction; use an outbox for notifications.
- [ ] Real auth: phone OTP, device binding, short-lived tokens, rate limiting, and step-up auth for withdrawals and mandate changes.
- [ ] Push, SMS and email delivery for pre-debit notices, with delivery receipts logged.
- [ ] Daily escrow reconciliation against bank statements, with alerting.
- [ ] Grievance redressal officer, published T&Cs, privacy policy and refund policy.
- [ ] Security review and penetration test; secrets in a KMS; TLS everywhere.
