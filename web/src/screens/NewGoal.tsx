import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoalIcon } from "../components/Icon";
import { BackButton } from "../components/Nav";
import { api, type Category, type Frequency } from "../lib/api";
import { CATEGORY_LABEL, FREQ_LABEL, FREQ_UNIT, isoInDays, shortDate, suggest } from "../lib/format";
import { useApp } from "../lib/store";

const CATS: Category[] = ["laptop", "smartphone", "travel", "education", "gadget", "other"];
const PRESETS: Record<Category, { name: string; amount: number }> = {
  laptop: { name: "New laptop", amount: 60000 },
  smartphone: { name: "New phone", amount: 25000 },
  travel: { name: "Goa trip", amount: 30000 },
  education: { name: "Online course", amount: 8000 },
  gadget: { name: "Headphones", amount: 12000 },
  other: { name: "", amount: 5000 },
};
const WHEN = [
  { label: "3 months", days: 90 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
];

export function NewGoal() {
  const nav = useNavigate();
  const { refresh } = useApp();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category>("laptop");
  const [name, setName] = useState(PRESETS.laptop.name);
  const [target, setTarget] = useState(String(PRESETS.laptop.amount));
  const [deadline, setDeadline] = useState(isoInDays(182));
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [custom, setCustom] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targetN = Number(target) || 0;
  const suggested = useMemo(() => suggest(targetN, deadline, frequency), [targetN, deadline, frequency]);
  const contribution = custom ? Number(custom) || 0 : suggested;
  const periodsNeeded = contribution > 0 ? Math.ceil(targetN / contribution) : 0;

  const pickCategory = (c: Category) => {
    setCategory(c);
    if (!name || Object.values(PRESETS).some((p) => p.name === name)) setName(PRESETS[c].name);
    setTarget(String(PRESETS[c].amount));
  };

  const canNext = [name.trim().length > 0, targetN >= 100 && deadline > isoInDays(0), contribution >= 10 && contribution <= targetN][step];

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const goal = await api.createGoal({
        name: name.trim(),
        category,
        targetRupees: targetN,
        deadline,
        frequency,
        contributionRupees: custom ? contribution : undefined,
      });
      await refresh();
      nav(`/goal/${goal.id}/autopay?new=1`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="screen no-nav">
      <BackButton to={step === 0 ? "/" : undefined} />
      <div className="steps" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}
      </div>

      {step === 0 && (
        <>
          <p className="h1-pre">What are you</p>
          <h1 className="h1">saving for?</h1>
          <div className="cat-grid" style={{ margin: "22px 0" }}>
            {CATS.map((c) => (
              <button key={c} className="cat" aria-pressed={category === c} onClick={() => pickCategory(c)}>
                <GoalIcon category={c} size="sm" brand={category === c} />
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Give it a name</span>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. MacBook Air" />
          </label>
        </>
      )}

      {step === 1 && (
        <>
          <p className="h1-pre">How much, and</p>
          <h1 className="h1">by when?</h1>
          <label className="field" style={{ marginTop: 22 }}>
            <span>Target amount</span>
            <div className="money-input">
              <input className="input num" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} />
            </div>
          </label>
          <div className="field">
            <span>I want it in</span>
            <div className="chips">
              {WHEN.map((w) => (
                <button key={w.days} className="chip" aria-pressed={deadline === isoInDays(w.days)} onClick={() => setDeadline(isoInDays(w.days))}>{w.label}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Or pick a date</span>
            <input className="input" type="date" min={isoInDays(1)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </>
      )}

      {step === 2 && (
        <>
          <p className="h1-pre">Your saving</p>
          <h1 className="h1">plan</h1>
          <div className="field" style={{ marginTop: 22 }}>
            <span>How often?</span>
            <div className="chips">
              {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => (
                <button key={f} className="chip" aria-pressed={frequency === f} onClick={() => { setFrequency(f); setCustom(""); }}>{FREQ_LABEL[f]}</button>
              ))}
            </div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <p className="muted" style={{ margin: 0 }}>Save every {FREQ_UNIT[frequency]}</p>
            <div className="money-input" style={{ maxWidth: 220, margin: "8px auto" }}>
              <input
                className="input num"
                style={{ textAlign: "center" }}
                inputMode="numeric"
                aria-label={`Amount per ${FREQ_UNIT[frequency]}`}
                value={custom || String(suggested)}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <p className="small" style={{ margin: 0, color: "var(--ink-2)" }}>
              {custom ? (
                <>That's about <b>{periodsNeeded}</b> {FREQ_UNIT[frequency]}s to reach ₹{targetN.toLocaleString("en-IN")}.</>
              ) : (
                <>Suggested to reach <b>₹{targetN.toLocaleString("en-IN")}</b> by <b>{shortDate(deadline)}</b>.</>
              )}
            </p>
            {custom && <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setCustom("")}>Use suggestion</button>}
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            <span>💡</span>
            <span>Small and regular beats big and rare. You can change this, pause or withdraw anytime.</span>
          </div>
        </>
      )}

      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}
      <div style={{ marginTop: 24 }}>
        {step < 2 ? (
          <button className="btn" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
        ) : (
          <button className="btn" disabled={!canNext || busy} onClick={create}>{busy ? "Creating…" : "Create goal"}</button>
        )}
      </div>
    </main>
  );
}
