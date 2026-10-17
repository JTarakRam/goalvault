import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GoalIcon, Icon } from "../components/Icon";
import { BackButton } from "../components/Nav";
import { Milestones, Ring } from "../components/Progress";
import { Sheet } from "../components/Sheet";
import { api, newIdempotencyKey, type Frequency, type Goal, type Txn } from "../lib/api";
import { dayMonth, FREQ_LABEL, FREQ_UNIT, rupees, rupeesPlain, shortDate, time } from "../lib/format";
import { useApp } from "../lib/store";
import { TxnRow } from "./Activity";

type SheetKind = "topup" | "edit" | "withdraw" | null;

export function GoalDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { refresh, toast, summary } = useApp();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, t] = await Promise.all([api.goal(id), api.transactions(id)]);
      setGoal(g);
      setTxns(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  // Reload whenever the global summary changes (polling, sandbox time travel).
  useEffect(() => {
    load();
  }, [load, summary?.now]);

  if (!goal) return <main className="screen no-nav">{error ? <div className="error">{error}</div> : <div className="skeleton" />}</main>;

  const after = async (msg: string) => {
    setSheet(null);
    await Promise.all([load(), refresh()]);
    toast(msg);
  };

  const togglePause = async () => {
    try {
      if (goal.status === "paused") {
        await api.resume(goal.id);
        await after("Resumed. Your next saving is scheduled.");
      } else {
        await api.pause(goal.id);
        await after("Paused. No debits until you resume.");
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const open = goal.status === "active" || goal.status === "paused";
  const mandate = goal.mandate;
  const autopayOn = mandate?.status === "active";

  return (
    <main className="screen no-nav">
      <div className="topbar" style={{ marginBottom: 6 }}>
        <BackButton to="/" />
        {goal.status === "completed" && <span className="tag">Completed 🎉</span>}
        {goal.status === "paused" && <span className="tag grey">Paused</span>}
        {goal.status === "withdrawn" && <span className="tag grey">Closed</span>}
      </div>

      <div className="row">
        <GoalIcon category={goal.category} />
        <div className="grow">
          <h1 className="h1" style={{ fontSize: 26 }}>{goal.name}</h1>
          <div className="muted">Target {rupees(goal.targetPaise)} by {shortDate(goal.deadline)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <Ring value={goal.progress}>
          <strong className="num">{rupeesPlain(goal.savedPaise)}</strong>
          <span>{Math.floor(goal.progress * 100)}% saved</span>
        </Ring>
        {goal.pendingPaise > 0 && <p className="muted small" style={{ textAlign: "center", margin: 0 }}>+ {rupees(goal.pendingPaise)} processing</p>}
        <Milestones reached={goal.milestonesReached} progress={goal.progress} />
        <div className="actions">
          <button className="action" disabled={!open || goal.remainingPaise === 0} onClick={() => setSheet("topup")}>
            <span className="ic"><Icon name="topup" /></span>Top up
          </button>
          <button className="action" disabled={!open} onClick={togglePause}>
            <span className="ic"><Icon name={goal.status === "paused" ? "play" : "pause"} /></span>
            {goal.status === "paused" ? "Resume" : "Pause"}
          </button>
          <button className="action" disabled={!open} onClick={() => setSheet("edit")}>
            <span className="ic"><Icon name="edit" /></span>Edit
          </button>
          <button className="action" disabled={goal.savedPaise === 0} onClick={() => setSheet("withdraw")}>
            <span className="ic"><Icon name="withdraw" /></span>Withdraw
          </button>
        </div>
      </div>

      <div className="card">
        <div className="kv"><span>Plan</span><span>{rupees(goal.contributionPaise)} / {FREQ_UNIT[goal.frequency]}</span></div>
        <div className="kv"><span>Still to save</span><span>{rupees(goal.remainingPaise)}</span></div>
        {goal.status === "active" && goal.nextDebitAt && (
          <div className="kv"><span>{autopayOn ? "Next autopay" : "Next reminder"}</span><span>{dayMonth(goal.nextDebitAt)}, {time(goal.nextDebitAt)}</span></div>
        )}
        {goal.projectedCompletion && (
          <div className="kv">
            <span>On pace to finish</span>
            <span style={{ color: goal.onTrack ? "var(--brand-strong)" : "var(--warn)" }}>{shortDate(goal.projectedCompletion)}{goal.onTrack ? " ✓" : " · behind"}</span>
          </div>
        )}
        <div className="kv"><span>Streak</span><span>{goal.streak} in a row 🔥</span></div>
      </div>

      {open && (
        <div className="card row" style={{ alignItems: "flex-start" }}>
          <span className="goal-icon sm brand"><Icon name={mandate?.method === "enach" ? "bank" : "upi"} size={20} /></span>
          <div className="grow">
            {autopayOn || mandate?.status === "paused" ? (
              <>
                <div className="h3">{mandate.method === "upi_autopay" ? "UPI Autopay" : "eNACH mandate"} {mandate.status === "paused" ? "paused" : "on"}</div>
                <div className="muted">Up to {rupees(mandate.maxAmountPaise)} {mandate.frequency} from {mandate.payerMasked}</div>
              </>
            ) : mandate?.status === "pending_authorization" ? (
              <>
                <div className="h3">Waiting for your approval</div>
                <div className="muted">Approve the request in your UPI/bank app to start.</div>
              </>
            ) : (
              <>
                <div className="h3">Autopay is off</div>
                <div className="muted">We'll remind you each {FREQ_UNIT[goal.frequency]}. Turn on Autopay to never miss one.</div>
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => nav(`/goal/${goal.id}/autopay`)}>Turn on Autopay</button>
              </>
            )}
          </div>
        </div>
      )}

      <h2 className="h2">Transactions</h2>
      {txns.length === 0 ? (
        <p className="muted">No transactions yet. Your first saving will show up here.</p>
      ) : (
        <div className="list">{txns.map((t) => <TxnRow key={t.id} t={t} showGoal={false} />)}</div>
      )}

      <TopUpSheet open={sheet === "topup"} goal={goal} onClose={() => setSheet(null)} onDone={after} />
      <EditSheet open={sheet === "edit"} goal={goal} onClose={() => setSheet(null)} onDone={(msg, reauth) => (reauth ? nav(`/goal/${goal.id}/autopay`) : after(msg))} />
      <WithdrawSheet open={sheet === "withdraw"} goal={goal} bank={summary?.user.linkedBank} onClose={() => setSheet(null)} onDone={after} />
    </main>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function TopUpSheet({ open, goal, onClose, onDone }: { open: boolean; goal: Goal; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const key = useRef(newIdempotencyKey());
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (open) {
      setAmount(String(Math.min(goal.contributionPaise, goal.remainingPaise) / 100));
      key.current = newIdempotencyKey();
    }
  }, [open, goal.contributionPaise, goal.remainingPaise]);
  const n = Number(amount) || 0;
  return (
    <Sheet open={open} onClose={onClose} label="Top up">
      <h2 className="h3" style={{ fontSize: 20, marginBottom: 14 }}>Add money to {goal.name}</h2>
      <label className="field">
        <span>Amount</span>
        <div className="money-input"><input className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="hint">Up to {rupees(goal.remainingPaise)} more needed.</div>
      </label>
      <label className="field">
        <span>Pay from UPI ID</span>
        <input className="input" value={payer} placeholder="yourname@okaxis" onChange={(e) => setPayer(e.target.value.trim())} />
      </label>
      {error && <div className="error">{error}</div>}
      <button
        className="btn"
        disabled={busy || n < 10 || !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(payer)}
        onClick={() =>
          run(async () => {
            await api.contribute(goal.id, n, payer, key.current);
            await api.sandboxFlush();
            onDone(`₹${n.toLocaleString("en-IN")} added to ${goal.name}`);
          })
        }
      >
        Pay ₹{n.toLocaleString("en-IN")}
      </button>
      <p className="muted small" style={{ textAlign: "center" }}>One-time UPI payment into your goal's escrow balance.</p>
    </Sheet>
  );
}

function EditSheet({ open, goal, onClose, onDone }: { open: boolean; goal: Goal; onClose: () => void; onDone: (m: string, reauth: boolean) => void }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState(goal.deadline);
  const [frequency, setFrequency] = useState<Frequency>(goal.frequency);
  const [amount, setAmount] = useState("");
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (!open) return;
    setName(goal.name);
    setTarget(String(goal.targetPaise / 100));
    setDeadline(goal.deadline);
    setFrequency(goal.frequency);
    setAmount(String(goal.contributionPaise / 100));
  }, [open, goal]);

  const m = goal.mandate;
  const needsReauth = !!m && m.status !== "revoked" && m.status !== "failed" && ((Number(amount) || 0) * 100 > m.maxAmountPaise || frequency !== m.frequency);

  return (
    <Sheet open={open} onClose={onClose} label="Edit goal">
      <h2 className="h3" style={{ fontSize: 20, marginBottom: 14 }}>Edit goal</h2>
      <label className="field"><span>Name</span><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field">
        <span>Target</span>
        <div className="money-input"><input className="input num" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} /></div>
      </label>
      <label className="field"><span>Deadline</span><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      <div className="field">
        <span>Frequency</span>
        <div className="chips">
          {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => (
            <button key={f} className="chip" aria-pressed={frequency === f} onClick={() => setFrequency(f)}>{FREQ_LABEL[f]}</button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Amount per {FREQ_UNIT[frequency]}</span>
        <div className="money-input"><input className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></div>
      </label>
      {needsReauth && (
        <div className="notice warn" style={{ marginBottom: 14 }}>
          <Icon name="info" size={18} />
          <span>This is outside your current Autopay approval (up to {rupees(m!.maxAmountPaise)} {m!.frequency}). We'll cancel it and ask you to approve a new one. We never debit more than you approved.</span>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <button
        className="btn"
        disabled={busy || !name.trim()}
        onClick={() =>
          run(async () => {
            const res = await api.editGoal(goal.id, {
              name: name.trim(),
              targetRupees: Number(target),
              deadline,
              frequency,
              contributionRupees: Number(amount),
            });
            onDone("Goal updated", res.requiresReauthorization);
          })
        }
      >
        {needsReauth ? "Save & re-authorise Autopay" : "Save changes"}
      </button>
    </Sheet>
  );
}

function WithdrawSheet({
  open,
  goal,
  bank,
  onClose,
  onDone,
}: {
  open: boolean;
  goal: Goal;
  bank?: { bankName: string; accountMasked: string };
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState(false);
  const key = useRef(newIdempotencyKey());
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (open) {
      setAmount(String(goal.savedPaise / 100));
      setConfirm(false);
      key.current = newIdempotencyKey();
    }
  }, [open, goal.savedPaise]);
  const n = Number(amount) || 0;
  const full = n * 100 === goal.savedPaise;
  const closes = full && goal.status !== "completed";

  return (
    <Sheet open={open} onClose={onClose} label="Withdraw">
      <h2 className="h3" style={{ fontSize: 20, marginBottom: 14 }}>{confirm ? "Confirm withdrawal" : "Withdraw savings"}</h2>
      {!confirm ? (
        <>
          <label className="field">
            <span>Amount</span>
            <div className="money-input"><input className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="hint">Available: {rupees(goal.savedPaise)} · No fees, no penalty.</div>
          </label>
          <div className="chips" style={{ marginBottom: 18 }}>
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} className="chip" aria-pressed={n * 100 === Math.floor((goal.savedPaise * f) / 100) * 100} onClick={() => setAmount(String(Math.floor((goal.savedPaise * f) / 100)))}>
                {f === 1 ? "All" : `${f * 100}%`}
              </button>
            ))}
          </div>
          <button className="btn" disabled={n <= 0 || n * 100 > goal.savedPaise} onClick={() => setConfirm(true)}>Continue</button>
        </>
      ) : (
        <>
          <div className="card">
            <div className="kv"><span>Amount</span><span>₹{n.toLocaleString("en-IN")}</span></div>
            <div className="kv"><span>To</span><span>{bank ? `${bank.bankName} ${bank.accountMasked}` : "Your verified bank"}</span></div>
            <div className="kv"><span>Fee</span><span>₹0</span></div>
            <div className="kv"><span>Left in goal</span><span>{rupees(goal.savedPaise - n * 100)}</span></div>
          </div>
          {closes && (
            <div className="notice warn" style={{ margin: "14px 0" }}>
              <Icon name="info" size={18} />
              <span>Withdrawing everything closes this goal and cancels its Autopay. You can always start a new one.</span>
            </div>
          )}
          <p className="muted small" style={{ margin: "14px 0" }}>For your safety, money can only go back to your own verified account.</p>
          {error && <div className="error">{error}</div>}
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.withdraw(goal.id, n, key.current);
                await api.sandboxFlush();
                onDone(`₹${n.toLocaleString("en-IN")} is on its way to your bank`);
              })
            }
          >
            {busy ? "Processing…" : `Withdraw ₹${n.toLocaleString("en-IN")}`}
          </button>
          <button className="btn ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => setConfirm(false)}>Back</button>
        </>
      )}
    </Sheet>
  );
}
