import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { api, type Txn } from "../lib/api";
import { rupeesPlain, shortDate, time } from "../lib/format";
import { useApp } from "../lib/store";

export function TxnRow({ t, showGoal = true }: { t: Txn; showGoal?: boolean }) {
  const isIn = t.type === "contribution";
  const label = isIn ? (t.source === "autopay" ? "Autopay saving" : "Top-up") : "Withdrawal to bank";
  return (
    <div className="list-item">
      <span className={`goal-icon sm ${isIn ? "brand" : ""}`}>
        <Icon name={isIn ? (t.source === "autopay" ? "upi" : "topup") : "withdraw"} size={20} />
      </span>
      <div className="grow" style={{ flex: 1, minWidth: 0 }}>
        <div className="title">{showGoal ? t.goalName : label}</div>
        <div className="sub">
          {showGoal ? `${label} · ` : ""}{time(t.createdAt)}
          {t.status === "failed" && <span style={{ color: "var(--danger)" }}> · Failed: {t.failureReason}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className={`num ${t.status === "failed" ? "muted" : isIn ? "pos" : "neg"}`} style={{ fontWeight: 600, textDecoration: t.status === "failed" ? "line-through" : undefined }}>
          {isIn ? "+" : "-"}{rupeesPlain(t.amountPaise)}
        </div>
        {t.status === "pending" && <span className="tag warn">Processing</span>}
      </div>
    </div>
  );
}

export function Activity() {
  const { summary } = useApp();
  const [txns, setTxns] = useState<Txn[] | null>(null);
  useEffect(() => {
    api.transactions().then(setTxns);
  }, [summary?.now]);

  const groups = new Map<string, Txn[]>();
  for (const t of txns ?? []) {
    const k = shortDate(t.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  return (
    <main className="screen">
      <p className="h1-pre">Your money</p>
      <h1 className="h1">Activity</h1>
      {summary && (
        <div className="card" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><div className="muted">Saved this month</div><div className="h3 pos num">+₹{rupeesPlain(summary.savedThisMonthPaise)}</div></div>
          <div><div className="muted">Withdrawn</div><div className="h3 neg num">-₹{rupeesPlain(summary.withdrawnThisMonthPaise)}</div></div>
        </div>
      )}
      <h2 className="h2">Transactions</h2>
      {txns === null && <div className="skeleton" />}
      {txns?.length === 0 && <p className="muted">Nothing yet. Savings and withdrawals will appear here.</p>}
      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <div className="date-head">{day}</div>
          <div className="list">{list.map((t) => <TxnRow key={t.id} t={t} />)}</div>
        </section>
      ))}
    </main>
  );
}
