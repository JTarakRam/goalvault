import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { SandboxBar } from "../components/SandboxBar";
import { api, type Mandate, type Trust as TrustData } from "../lib/api";
import { rupees, shortDate } from "../lib/format";
import { useApp } from "../lib/store";

const STATUS: Record<Mandate["status"], [string, string]> = {
  active: ["Active", ""],
  paused: ["Paused", "grey"],
  pending_authorization: ["Awaiting approval", "warn"],
  revoked: ["Cancelled", "grey"],
  failed: ["Declined", "red"],
};

export function Trust() {
  const { summary, refresh, toast } = useApp();
  const [data, setData] = useState<TrustData | null>(null);
  const load = () => api.trust().then(setData);
  useEffect(() => {
    load();
  }, [summary?.now]);

  const revoke = async (m: Mandate) => {
    if (!window.confirm(`Cancel Autopay for "${m.goalName}"? Your saved money stays in the goal.`)) return;
    await api.revokeMandate(m.id);
    await Promise.all([load(), refresh()]);
    toast("Autopay cancelled");
  };

  const live = data?.mandates.filter((m) => m.status !== "revoked" && m.status !== "failed") ?? [];
  const past = data?.mandates.filter((m) => m.status === "revoked" || m.status === "failed") ?? [];

  return (
    <main className="screen">
      <p className="h1-pre">Trust &</p>
      <h1 className="h1">Safety</h1>

      <section className="trust-hero" style={{ marginTop: 18 }}>
        <Icon name="shield" size={28} />
        <h3>Your savings are ring-fenced</h3>
        <p>Money you save is collected by a licensed payment partner and held in a dedicated customer escrow account at a partner bank, separate from GoalVault's own operating account. We can't spend, lend or invest it.</p>
        <div className="flow" aria-label="How money flows">
          <div><b>Your bank</b>UPI / eNACH</div>
          <Icon name="chevron" size={16} />
          <div><b>Escrow A/c</b>Partner bank</div>
          <Icon name="chevron" size={16} />
          <div><b>Your bank</b>On withdrawal</div>
        </div>
      </section>

      {data && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row">
            <span className="goal-icon sm brand"><Icon name={data.reconciliation.balanced ? "check" : "info"} size={20} /></span>
            <div className="grow">
              <div className="h3">{data.reconciliation.balanced ? "Fully reconciled" : "Reconciliation mismatch"}</div>
              <div className="muted">
                Escrow holds {rupees(data.reconciliation.escrowPaise)} for {rupees(data.reconciliation.customerLiabilitiesPaise)} owed to savers. Checked live against our ledger.
              </div>
            </div>
          </div>
        </div>
      )}

      <h2 className="h2">Your mandates</h2>
      {live.length === 0 && <p className="muted">No active Autopay mandates.</p>}
      {live.length > 0 && (
        <div className="list">
          {live.map((m) => (
            <div className="list-item" key={m.id}>
              <span className="goal-icon sm brand"><Icon name={m.method === "enach" ? "bank" : "upi"} size={18} /></span>
              <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{m.goalName}</div>
                <div className="sub">Up to {rupees(m.maxAmountPaise)} {m.frequency} · {m.payerMasked}</div>
                <div className="sub">Valid till {shortDate(m.endDate)} <span className={`tag ${STATUS[m.status][1]}`}>{STATUS[m.status][0]}</span></div>
              </div>
              <button className="btn sm danger" onClick={() => revoke(m)}>Cancel</button>
            </div>
          ))}
        </div>
      )}
      {past.length > 0 && <p className="muted small" style={{ marginTop: 8 }}>{past.length} past mandate{past.length > 1 ? "s" : ""} cancelled or declined.</p>}

      <h2 className="h2">Your consents</h2>
      <div className="list">
        {data?.consents.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="goal-icon sm"><Icon name="lock" size={18} /></span>
            <div className="grow" style={{ flex: 1, minWidth: 0 }}>
              <div className="title" style={{ textTransform: "capitalize" }}>{c.kind === "terms" ? "Terms & fund safety" : `${c.kind} consent`}</div>
              <div className="sub">v{c.version} · {shortDate(c.acceptedAt)} · #{c.textHash.slice(0, 10)}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="h2">Good to know</h2>
      <div className="card">
        {[
          ["Pre-debit alerts", "You're notified at least 24 hours before every automatic debit."],
          ["Hard limits", "We can never debit more than the per-debit amount you approved."],
          ["Stops on its own", "Autopay switches off the moment a goal is reached."],
          ["Withdraw anytime", "No lock-in or fees. Money only goes back to your verified account."],
          ["Your data", "We store only masked UPI IDs and account numbers. Payments are authorised in your own UPI/bank app."],
        ].map(([t, b]) => (
          <div className="kv" key={t} style={{ display: "block" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{t}</div>
            <div className="muted">{b}</div>
          </div>
        ))}
      </div>

      <h2 className="h2">Developer sandbox</h2>
      <SandboxBar />
      <p className="muted small">Payment provider: {data?.provider}. Time travel runs the debit scheduler so you can watch reminders, autopay debits, milestones and goal completion.</p>
    </main>
  );
}
