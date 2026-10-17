import { useState } from "react";
import { useApp } from "../lib/store";
import { EmptyGoals, GoalCard } from "./Home";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
] as const;

export function Goals() {
  const { summary } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const goals = (summary?.goals ?? []).filter((g) => filter === "all" || g.status === filter);
  return (
    <main className="screen">
      <p className="h1-pre">Savings</p>
      <h1 className="h1">Goals</h1>
      <div className="chips" style={{ margin: "18px 0" }}>
        {FILTERS.map((f) => (
          <button key={f.key} className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      {summary && summary.goals.length === 0 && <EmptyGoals />}
      {summary && summary.goals.length > 0 && goals.length === 0 && <p className="muted empty">Nothing here yet.</p>}
      {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
    </main>
  );
}
