export function ProgressBar({ value, pending = 0, thin }: { value: number; pending?: number; thin?: boolean }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const pend = Math.min(100 - pct, Math.max(0, pending * 100));
  return (
    <div className={`bar ${thin ? "thin" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
      {pend > 0 && <i className="pending" style={{ left: `${pct}%`, width: `${pend}%` }} title="Processing" />}
    </div>
  );
}

/** Reference-style ring: thin outer track, teal progress arc, value in the middle. */
export function Ring({ value, children, size = 210 }: { value: number; children: React.ReactNode; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r + 9} fill="none" stroke="var(--ink)" strokeWidth="1.2" opacity=".85" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e8e1" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Milestones({ reached, progress }: { reached: number[]; progress: number }) {
  return (
    <div className="milestones" aria-label="Milestones">
      {[25, 50, 75, 100].map((m) => {
        const done = reached.includes(m) || progress * 100 >= m;
        return (
          <div key={m} className={`milestone ${done ? "done" : ""}`}>
            <i>{done ? "✓" : m}</i>
            {m === 100 ? "Goal" : `${m}%`}
          </div>
        );
      })}
    </div>
  );
}
