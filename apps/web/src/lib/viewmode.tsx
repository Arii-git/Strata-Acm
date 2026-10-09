"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Simple (default) hides reviewer-only pages and collapses detail panels; Detailed shows everything. */
export type ViewMode = "simple" | "detailed";

const Ctx = createContext<{ mode: ViewMode; setMode: (m: ViewMode) => void }>({ mode: "simple", setMode: () => {} });
const KEY = "strata.viewmode";

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("simple");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "simple" || v === "detailed") setModeState(v);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);
  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
    try { window.localStorage.setItem(KEY, m); } catch { /* ignore */ }
  }, []);
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export function useViewMode() {
  return useContext(Ctx);
}
