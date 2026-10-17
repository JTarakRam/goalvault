import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { BackButton } from "../components/Nav";
import { api, type Notice } from "../lib/api";
import { dayMonth, time } from "../lib/format";
import { useApp } from "../lib/store";

const KIND_ICON: Record<string, IconName> = {
  pre_debit: "calendar",
  reminder: "bell",
  debit_success: "check",
  debit_failed: "info",
  milestone: "flame",
  completed: "trophy",
  withdrawal: "withdraw",
  mandate: "upi",
};

export function Alerts() {
  const nav = useNavigate();
  const { refresh, summary } = useApp();
  const [items, setItems] = useState<Notice[] | null>(null);
  useEffect(() => {
    api.notifications().then((n) => {
      setItems(n);
      if (n.some((x) => !x.read)) api.markRead().then(refresh);
    });
  }, [refresh, summary?.now]);

  return (
    <main className="screen no-nav">
      <BackButton to="/" />
      <p className="h1-pre" style={{ marginTop: 8 }}>Updates</p>
      <h1 className="h1">Notifications</h1>
      <div className="list" style={{ marginTop: 18 }}>
        {items === null && <div className="skeleton" />}
        {items?.length === 0 && <p className="empty muted">You're all caught up.</p>}
        {items?.map((n) => (
          <button
            key={n.id}
            className="list-item"
            style={{ width: "100%", border: 0, borderBottom: "1px solid var(--line)", background: n.read ? "transparent" : "var(--brand-soft)", textAlign: "left", alignItems: "flex-start" }}
            onClick={() => n.goalId && nav(`/goal/${n.goalId}`)}
          >
            <span className={`goal-icon sm ${n.kind === "debit_failed" ? "" : "brand"}`} style={n.kind === "debit_failed" ? { borderColor: "var(--danger)", color: "var(--danger)" } : undefined}>
              <Icon name={KIND_ICON[n.kind] ?? "bell"} size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="title" style={{ display: "block", whiteSpace: "normal" }}>{n.title}</span>
              <span className="sub" style={{ display: "block", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{n.body}</span>
              <span className="sub">{dayMonth(n.createdAt)}, {time(n.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
