import { useMemo } from "react";
import { Icon } from "./Icon";
import type { Goal } from "../lib/api";
import { rupees } from "../lib/format";

const COLORS = ["#1fa385", "#7ccfb8", "#f5b83d", "#e2392d", "#138a6f", "#ffffff"];

export function Celebration({ goal, onClose, onWithdraw }: { goal: Goal; onClose: () => void; onWithdraw: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
      })),
    [],
  );
  const days = Math.max(1, Math.round((new Date(goal.completedAt ?? Date.now()).getTime() - new Date(goal.createdAt).getTime()) / 86_400_000));
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label="Goal completed">
      <div className="confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <i
            key={i}
            style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, transform: `rotate(${p.rotate}deg)` }}
          />
        ))}
      </div>
      <div className="card">
        <div className="trophy">
          <Icon name="trophy" size={44} stroke={1.6} />
        </div>
        <p className="eyebrow">You did it!</p>
        <h2 className="h1" style={{ fontSize: 26, margin: "4px 0 8px" }}>{goal.name}</h2>
        <p style={{ margin: "0 0 4px", fontSize: 15 }}>
          You saved <b>{rupees(goal.savedPaise)}</b> in {days} {days === 1 ? "day" : "days"}.
        </p>
        <p className="muted" style={{ margin: "0 0 20px" }}>Autopay has been switched off automatically. No more debits for this goal.</p>
        <button className="btn" onClick={onWithdraw}>Withdraw to my bank</button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>Keep it saved for now</button>
      </div>
    </div>
  );
}
