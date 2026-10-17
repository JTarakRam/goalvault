import { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";

/** Clearly-labelled sandbox control to fast-forward the debit scheduler in demos. */
export function SandboxBar() {
  const { refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const go = async (days: number) => {
    setBusy(true);
    try {
      await api.sandboxAdvance(days);
      await refresh();
      toast(`Sandbox: moved ${days} day${days > 1 ? "s" : ""} forward`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sandbox-bar">
      <span>Sandbox · no real money</span>
      <span className="btns">
        <button disabled={busy} onClick={() => go(1)}>+1 day</button>
        <button disabled={busy} onClick={() => go(7)}>+7 days</button>
      </span>
    </div>
  );
}
