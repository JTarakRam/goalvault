import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { api } from "../lib/api";
import { useApp } from "../lib/store";

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: "goals", title: "Save for what you want", body: "Pick a goal, a date, and we'll work out a small daily, weekly or monthly amount." },
  { icon: "upi", title: "On autopilot, with your OK", body: "UPI Autopay or bank e-mandate, capped at the amount you approve. A heads-up 24 hours before every debit." },
  { icon: "shield", title: "Your money stays yours", body: "Held in a separate customer escrow account at a partner bank, never mixed with our company funds." },
  { icon: "withdraw", title: "Pause or withdraw anytime", body: "No lock-ins, no penalties. Withdrawals go straight back to your own bank account." },
];

export function Onboarding() {
  const { refresh } = useApp();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    try {
      await api.acceptTerms();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="screen no-nav">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <img src="/icon.svg" width={40} height={40} alt="" style={{ borderRadius: 12 }} />
        <strong style={{ fontSize: 18 }}>GoalVault</strong>
      </div>
      <p className="h1-pre" style={{ marginTop: 28 }}>Small amounts.</p>
      <h1 className="h1" style={{ fontSize: 36 }}>Big goals.</h1>
      <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>The laptop, the phone, the trip. Save a little at a time, automatically.</p>

      <div className="list" style={{ marginTop: 22 }}>
        {PROMISES.map((p) => (
          <div className="list-item" key={p.title} style={{ alignItems: "flex-start" }}>
            <span className="goal-icon sm brand"><Icon name={p.icon} size={20} /></span>
            <div className="grow">
              <div className="title" style={{ whiteSpace: "normal" }}>{p.title}</div>
              <div className="sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{p.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="notice" style={{ marginTop: 16 }}>
        <Icon name="info" size={18} />
        <span>GoalVault savings are not a bank deposit and do not earn interest. They are a safe place to set money aside for a purchase.</span>
      </div>

      <label className="checkbox" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I agree to the Terms of Use and Privacy Policy, and understand how my savings are held.</span>
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={!agree || busy} onClick={start}>
        {busy ? "Setting up…" : "Get started"}
      </button>
    </main>
  );
}
