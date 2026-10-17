import { Link, useNavigate } from "react-router-dom";
import { GoalIcon, Icon } from "../components/Icon";
import { ProgressBar } from "../components/Progress";
import { SandboxBar } from "../components/SandboxBar";
import type { Goal } from "../lib/api";
import { dayMonth, FREQ_UNIT, rupees, rupeesPlain } from "../lib/format";
import { useApp } from "../lib/store";

export function Home() {
  const { summary } = useApp();
  const nav = useNavigate();
  if (!summary) return <main className="screen"><div className="skeleton" /></main>;
  const first = summary.user.name.split(" ")[0];
  const initials = summary.user.name.split(" ").map((s) => s[0]).join("").slice(0, 2);
  const active = summary.goals.filter((g) => g.status === "active" || g.status === "paused");
  const done = summary.goals.filter((g) => g.status === "completed");
  const bestStreak = Math.max(0, ...summary.goals.map((g) => g.streak));

  return (
    <main className="screen">
      <div className="topbar">
        <div className="welcome">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div>
            <p className="eyebrow">Welcome back</p>
            <p className="name">{first}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" aria-label={`Notifications${summary.unread ? `, ${summary.unread} unread` : ""}`} onClick={() => nav("/alerts")}>
            <Icon name="bell" size={26} />
            {summary.unread > 0 && <span className="dot" />}
          </button>
        </div>
      </div>

      <SandboxBar />

      <section className="balance" aria-label="Total saved">
        <div className="label">Total saved</div>
        <div className="amount num">₹{rupeesPlain(summary.totalSavedPaise)}</div>
        <span className="pill-select">
          <Icon name="lock" size={14} /> Held in customer escrow
        </span>
        <div className="stats">
          <div>This month<strong className="num">+{rupeesPlain(summary.savedThisMonthPaise)} ↑</strong></div>
          <div>Active goals<strong>{summary.activeGoals}</strong></div>
          <div>Best streak<strong>{bestStreak} 🔥</strong></div>
        </div>
      </section>

      {summary.upcoming.length > 0 && (
        <>
          <h2 className="h2">Next autopay</h2>
          <div className="card row">
            <span className="goal-icon sm brand"><Icon name="calendar" size={20} /></span>
            <div className="grow">
              <div className="h3">{rupees(summary.upcoming[0].amountPaise)} · {summary.upcoming[0].goalName}</div>
              <div className="muted">On {dayMonth(summary.upcoming[0].at)}. You'll get a reminder 24h before.</div>
            </div>
          </div>
        </>
      )}

      <h2 className="h2" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        Your goals
        {summary.goals.length > 0 && <Link to="/goals" className="muted" style={{ fontWeight: 500 }}>See all</Link>}
      </h2>
      {active.length === 0 && done.length === 0 && <EmptyGoals />}
      {active.map((g) => <GoalCard key={g.id} goal={g} />)}
      {done.slice(0, 2).map((g) => <GoalCard key={g.id} goal={g} />)}
    </main>
  );
}

export function EmptyGoals() {
  const nav = useNavigate();
  return (
    <div className="card empty">
      <GoalIcon category="laptop" brand />
      <div className="h3">What are you saving for?</div>
      <p className="muted" style={{ margin: "6px 0 16px" }}>Start with a goal. Even ₹50 a day adds up to ₹18,250 in a year.</p>
      <button className="btn" onClick={() => nav("/new")}><Icon name="plus" size={18} /> Create a goal</button>
    </div>
  );
}

export function GoalCard({ goal }: { goal: Goal }) {
  const status =
    goal.status === "completed" ? <span className="tag">Completed 🎉</span>
    : goal.status === "paused" ? <span className="tag grey">Paused</span>
    : goal.status === "withdrawn" ? <span className="tag grey">Closed</span>
    : goal.mandate?.status === "active" ? <span className="tag">Autopay on</span>
    : goal.mandate?.status === "pending_authorization" ? <span className="tag warn">Awaiting approval</span>
    : <span className="tag warn">Manual</span>;
  return (
    <Link to={`/goal/${goal.id}`} className="card goal-card">
      <div className="head">
        <GoalIcon category={goal.category} />
        <div className="grow" style={{ flex: 1, minWidth: 0 }}>
          <div className="h3" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{goal.name}</div>
          <div className="muted">{rupees(goal.contributionPaise)}/{FREQ_UNIT[goal.frequency]}</div>
        </div>
        {status}
      </div>
      <ProgressBar value={goal.progress} pending={goal.pendingPaise / goal.targetPaise} />
      <div className="meta">
        <span><b style={{ color: "var(--ink)" }}>{rupees(goal.savedPaise)}</b> of {rupees(goal.targetPaise)}</span>
        <span>{goal.status === "active" && !goal.onTrack ? <span style={{ color: "var(--warn)" }}>Behind schedule</span> : `By ${dayMonth(goal.deadline)}`}</span>
      </div>
    </Link>
  );
}
