import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Celebration } from "./components/Celebration";
import { BottomNav } from "./components/Nav";
import type { Goal } from "./lib/api";
import { AppProvider, useApp } from "./lib/store";
import { Activity } from "./screens/Activity";
import { Alerts } from "./screens/Alerts";
import { Autopay } from "./screens/Autopay";
import { GoalDetail } from "./screens/GoalDetail";
import { Goals } from "./screens/Goals";
import { Home } from "./screens/Home";
import { NewGoal } from "./screens/NewGoal";
import { Onboarding } from "./screens/Onboarding";
import { Trust } from "./screens/Trust";

const CELEBRATED_KEY = "gv_celebrated";
const readCelebrated = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? "[]");
  } catch {
    return [];
  }
};

function CelebrationWatcher() {
  const { summary } = useApp();
  const nav = useNavigate();
  const [goal, setGoal] = useState<Goal | null>(null);
  useEffect(() => {
    if (goal || !summary) return;
    const seen = readCelebrated();
    const next = summary.goals.find((g) => g.status === "completed" && !seen.includes(g.id));
    if (next) setGoal(next);
  }, [summary, goal]);
  if (!goal) return null;
  const close = () => {
    try {
      localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...readCelebrated(), goal.id]));
    } catch {
      /* ignore */
    }
    setGoal(null);
  };
  return (
    <Celebration
      goal={goal}
      onClose={close}
      onWithdraw={() => {
        close();
        nav(`/goal/${goal.id}`);
      }}
    />
  );
}

function Shell() {
  const { summary, error, refresh } = useApp();
  const { pathname } = useLocation();
  if (!summary) {
    return (
      <main className="screen no-nav">
        {error ? (
          <div className="card empty">
            <p className="h3">Can't reach GoalVault</p>
            <p className="muted">{error}. Your money is safe; this is just a connection issue.</p>
            <button className="btn" onClick={refresh}>Try again</button>
          </div>
        ) : (
          <div className="skeleton" style={{ marginTop: 60 }} />
        )}
      </main>
    );
  }
  if (!summary.termsAccepted) return <Onboarding />;
  const showNav = ["/", "/goals", "/activity", "/trust"].includes(pathname);
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/new" element={<NewGoal />} />
        <Route path="/goal/:id" element={<GoalDetail />} />
        <Route path="/goal/:id/autopay" element={<Autopay />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/trust" element={<Trust />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {showNav && <BottomNav />}
      <CelebrationWatcher />
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="shell">
        <AppProvider>
          <Shell />
        </AppProvider>
      </div>
    </HashRouter>
  );
}
