import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, type Summary } from "./api";

interface Ctx {
  summary: Summary | null;
  error: string | null;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
}

const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<number>();

  const refresh = useCallback(async () => {
    try {
      setSummary(await api.summary());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <AppCtx.Provider value={{ summary, error, refresh, toast }}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </AppCtx.Provider>
  );
}
