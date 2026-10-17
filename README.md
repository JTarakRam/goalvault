# GoalVault

**Save small amounts automatically for the things you want: a laptop, a phone, a trip.**

GoalVault is a mobile-first, goal-based savings app. Users set a goal and a deadline. The app
suggests a daily, weekly or monthly amount, and saving runs on its own through **UPI Autopay** or
a **bank e-mandate**. Savings are **ring-fenced in a customer escrow account**, separate from the
company's own funds.

## Features

- **Goals:** pick a category, target and deadline. The app suggests a per-period amount, which you can edit.
- **Automatic contributions:** UPI Autopay (≤ ₹15,000 per debit) or eNACH. Approval happens in the user's UPI/bank app.
- **Clear consent:** a plain-language summary, the full versioned mandate text and two explicit checkboxes. Each consent is stored with a hash of the text the user saw.
- **Progress tracking:** progress ring and bars, 25/50/75/100% milestones, streaks, on-pace projection.
- **Reminders:** pre-debit notice ≥ 24h before every autopay (NPCI requirement), reminders for manual goals, success and failure alerts.
- **Celebrations:** confetti and a summary when a goal completes. Autopay switches off automatically.
- **Full control:** pause or resume, edit (asks for re-authorisation if the change exceeds the approved limit), top up, and withdraw anytime with no fees, only to the verified source account.
- **Safety centre:** how money flows, live escrow reconciliation, active mandates with one-tap cancel, consent history.

## Design

The visual language follows the reference brand: cream canvas (`#F4F7EE`), teal brand colour
(`#1FA385`), Poppins, outlined teal pill chips, a teal gradient balance card with dashed rules,
line-art circular icons, a ring chart, and a tinted bottom bar with a raised centre FAB.

## Architecture

```
web/      React + Vite + TypeScript PWA (mobile-first)
server/   Node + Express + TypeScript API
  src/ledger.ts            double-entry ledger, escrow ⟂ operating guard, reconciliation
  src/service.ts           goals, mandates, debits, withdrawals, scheduler, notifications
  src/consent.ts           versioned consent texts
  src/payments/            provider interface, sandbox provider, signed webhooks
docs/COMPLIANCE.md         fund segregation, consent, NPCI/RBI notes, production checklist
```

All amounts are integer paise. Money state changes **only** through HMAC-verified provider
webhooks, and every money-moving call is idempotent.

## Run it

```bash
npm install
npm run dev        # API on :4000, app on http://localhost:5173
npm test           # server unit tests (ledger, scheduler compliance, webhooks, flows)
npm run build      # build both; `npm start -w server` then serves web/dist too
```

The repo ships with a **sandbox payment provider**, so no real money moves. In the app:

1. Accept the terms, then create a goal.
2. Set up UPI Autopay with any UPI ID (an ID containing `fail` simulates insufficient funds) and approve in the simulated UPI sheet.
3. Use the **Sandbox +1 day / +7 days** controls to fast-forward. You'll see pre-debit notices, debits, milestones and finally the completion celebration.

## Going to production

The sandbox stands in for a licensed payment aggregator / sponsor bank. See
[`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the escrow model, consent design and the launch
checklist (KYC, a real provider adapter, Postgres, auth, reconciliation).
