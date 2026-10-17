import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { BackButton } from "../components/Nav";
import { Sheet } from "../components/Sheet";
import { api, type Goal, type Mandate, type MandateMethod } from "../lib/api";
import { FREQ_LABEL, rupees, shortDate } from "../lib/format";
import { useApp } from "../lib/store";

type Step = "method" | "review" | "done";

export function Autopay() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const nav = useNavigate();
  const { refresh, summary } = useApp();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<MandateMethod>("upi_autopay");
  const [payer, setPayer] = useState("");
  const [preview, setPreview] = useState<{ text: string; version: string; details: Record<string, string | number> } | null>(null);
  const [checks, setChecks] = useState({ amount: false, notice: false });
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.goal(id).then(setGoal).catch((e) => setError(e.message));
  }, [id]);

  if (!goal) return <main className="screen no-nav">{error ? <div className="error">{error}</div> : <div className="skeleton" />}</main>;
  const upiTooHigh = goal.contributionPaise > 15_000_00;

  const validPayer = method === "upi_autopay" ? /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(payer) : /^\d{9,18}$/.test(payer);

  const review = async () => {
    setError(null);
    try {
      setPreview(await api.mandatePreview(goal.id, method, payer));
      setChecks({ amount: false, notice: false });
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const authorize = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createMandate(goal.id, { method, payer, consentAccepted: true, consentVersion: preview.version });
      setMandate(res.mandate);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approve: boolean) => {
    if (!mandate) return;
    setBusy(true);
    try {
      await api.sandboxDecide(mandate.providerRef, approve);
      await refresh();
      setMandate(null);
      if (approve) setStep("done");
      else {
        setError("You declined the mandate in your UPI app. Nothing was debited. You can try again or save manually.");
        setStep("method");
      }
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <main className="screen no-nav" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="trophy" style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
          <Icon name="check" size={48} stroke={2.4} />
        </div>
        <p className="h1-pre">Autopay is</p>
        <h1 className="h1">all set</h1>
        <p className="muted" style={{ fontSize: 14, margin: "12px 0 24px" }}>
          {rupees(goal.contributionPaise)} {goal.frequency} for “{goal.name}”. We'll notify you 24 hours before each debit, and stop automatically when you hit your goal.
        </p>
        <button className="btn" onClick={() => nav(`/goal/${goal.id}`, { replace: true })}>View my goal</button>
      </main>
    );
  }

  return (
    <main className="screen no-nav">
      <BackButton to={step === "review" ? undefined : isNew ? "/" : `/goal/${goal.id}`} />
      {step === "method" && (
        <>
          {isNew && <span className="tag" style={{ marginTop: 10 }}>Goal created ✓</span>}
          <p className="h1-pre" style={{ marginTop: 12 }}>Save automatically</p>
          <h1 className="h1">Set up Autopay</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            {rupees(goal.contributionPaise)} {FREQ_LABEL[goal.frequency].toLowerCase()} for “{goal.name}”. You approve it once in your UPI or bank app.
          </p>

          <div style={{ margin: "20px 0" }}>
            <button className="choice" aria-pressed={method === "upi_autopay"} disabled={upiTooHigh} onClick={() => { setMethod("upi_autopay"); setPayer(""); }} style={upiTooHigh ? { opacity: 0.5 } : undefined}>
              <span className="radio" />
              <span>
                <b>UPI Autopay</b> <span className="tag">Recommended</span>
                <div className="muted" style={{ marginTop: 4 }}>Approve with your UPI PIN in GPay, PhonePe, Paytm or BHIM. Cancel anytime from your UPI app.{upiTooHigh && " Not available above ₹15,000 per debit."}</div>
              </span>
            </button>
            <button className="choice" aria-pressed={method === "enach"} onClick={() => { setMethod("enach"); setPayer(""); }}>
              <span className="radio" />
              <span>
                <b>Bank e-mandate (eNACH)</b>
                <div className="muted" style={{ marginTop: 4 }}>Authorise via net banking or debit card. Good for larger amounts.</div>
              </span>
            </button>
          </div>

          <label className="field">
            <span>{method === "upi_autopay" ? "Your UPI ID" : "Bank account number"}</span>
            <input
              className="input"
              value={payer}
              autoComplete="off"
              inputMode={method === "enach" ? "numeric" : "email"}
              placeholder={method === "upi_autopay" ? "yourname@okaxis" : "Account number"}
              onChange={(e) => setPayer(method === "enach" ? e.target.value.replace(/\D/g, "") : e.target.value.trim())}
            />
            <div className="hint">
              {method === "upi_autopay" ? "Sandbox tip: use an ID containing “fail” to simulate insufficient funds." : "We only keep the last 4 digits. Your bank handles authorisation."}
            </div>
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={!validPayer} onClick={review}>Review mandate</button>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => nav(`/goal/${goal.id}`, { replace: true })}>
            Not now, remind me to save manually
          </button>
        </>
      )}

      {step === "review" && preview && (
        <>
          <p className="h1-pre" style={{ marginTop: 12 }}>Please review</p>
          <h1 className="h1">Your consent</h1>
          <div className="card" style={{ marginTop: 18 }}>
            <div className="kv"><span>Goal</span><span>{goal.name}</span></div>
            <div className="kv"><span>Max per debit</span><span>{rupees(Number(preview.details.maxAmountPaise))}</span></div>
            <div className="kv"><span>Frequency</span><span>{FREQ_LABEL[goal.frequency]}</span></div>
            <div className="kv"><span>From</span><span>{String(preview.details.payerMasked)}</span></div>
            <div className="kv"><span>Valid</span><span>{shortDate(String(preview.details.startDate))} – {shortDate(String(preview.details.endDate))}</span></div>
            <div className="kv"><span>Paid into</span><span style={{ fontSize: 12 }}>Customer escrow A/c at partner bank</span></div>
          </div>
          <h2 className="h2" style={{ fontSize: 15, color: "var(--ink)", margin: "20px 0 8px" }}>Mandate terms (v{preview.version})</h2>
          <div className="consent-text">{preview.text}</div>
          <label className="checkbox">
            <input type="checkbox" checked={checks.amount} onChange={(e) => setChecks({ ...checks, amount: e.target.checked })} />
            <span>I authorise debits of up to <b>{rupees(Number(preview.details.maxAmountPaise))}</b> {goal.frequency} until my goal is reached or I cancel.</span>
          </label>
          <label className="checkbox" style={{ paddingTop: 0 }}>
            <input type="checkbox" checked={checks.notice} onChange={(e) => setChecks({ ...checks, notice: e.target.checked })} />
            <span>I understand I'll be notified 24 hours before each debit and can pause or cancel anytime.</span>
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={!checks.amount || !checks.notice || busy} onClick={authorize}>
            <Icon name="lock" size={18} /> Approve in {method === "upi_autopay" ? "UPI app" : "bank"}
          </button>
          <p className="muted small" style={{ textAlign: "center", marginTop: 10 }}>
            Consent is recorded with a timestamp. Nothing is debited today. {summary?.user.linkedBank && "Withdrawals go only to your verified bank account."}
          </p>
        </>
      )}

      <Sheet open={!!mandate} onClose={() => !busy && setMandate(null)} label="Approve mandate">
        {mandate && (
          <>
            <p className="tag warn" style={{ margin: "0 0 12px" }}>Sandbox · simulated {mandate.method === "upi_autopay" ? "UPI app" : "bank page"}</p>
            <div className="upi-mock">
              <div className="bank">{mandate.method === "upi_autopay" ? "UPI Autopay request" : "eNACH mandate"}</div>
              <div className="amt">{rupees(mandate.maxAmountPaise)}</div>
              <div className="muted">max · {mandate.frequency} · to GoalVault Escrow</div>
              <div className="muted small" style={{ marginTop: 4 }}>from {mandate.payerMasked}</div>
              <div className="pin" aria-hidden="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>
              <button className="btn" disabled={busy} onClick={() => decide(true)}>Approve with PIN</button>
              <button className="btn danger" style={{ marginTop: 10 }} disabled={busy} onClick={() => decide(false)}>Decline</button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  );
}
