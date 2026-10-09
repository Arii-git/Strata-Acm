"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api/client";
import type { IncidentSummary, ListResponse, Severity } from "@/lib/api/types";
import { GUIDED_STEPS } from "./steps";

/** Guided path state (A23). Persisted in localStorage so it survives page changes and reloads. */
export interface GuidedState { active: boolean; step: number; ref: string | null }

interface GuidedCtx extends GuidedState {
  /** resolves the top critical case, then opens step 1 */
  start: () => Promise<void>;
  starting: boolean;
  startError: string | null;
  next: () => void;
  back: () => void;
  exit: () => void;
  stepHref: (i: number) => string;
}

const KEY = "strata.guided";
const OFF: GuidedState = { active: false, step: 0, ref: null };
const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, elevated: 2, watch: 1, healthy: 0 };

const Ctx = createContext<GuidedCtx | null>(null);

function save(s: GuidedState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: state lives in memory only */ }
}

/** The hero case: highest-severity open risk, ties broken by risk score. Not hard-coded. */
export async function resolveTopCase(): Promise<string | null> {
  const res = await apiGet<ListResponse<IncidentSummary>>("/incidents");
  const risks = (res.items ?? []).filter((i) => i.kind === "risk");
  risks.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0) || b.risk_score - a.risk_score);
  return risks[0]?.ref ?? null;
}

export function GuidedProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuidedState>(OFF);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as Partial<GuidedState>;
      if (v && v.active && typeof v.step === "number") {
        setState({ active: true, step: Math.min(Math.max(0, v.step), GUIDED_STEPS.length - 1), ref: typeof v.ref === "string" ? v.ref : null });
      }
    } catch { /* corrupt or unavailable storage: stay off */ }
  }, []);

  const update = useCallback((s: GuidedState) => { setState(s); save(s); }, []);
  const stepHref = useCallback((i: number) => GUIDED_STEPS[i].href(state.ref), [state.ref]);

  const start = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    let ref: string | null = null;
    try {
      ref = await resolveTopCase();
    } catch (e) {
      setStartError((e as Error).message || "Could not load cases.");
    }
    const s = { active: true, step: 0, ref };
    update(s);
    setStarting(false);
    router.push(GUIDED_STEPS[0].href(ref));
  }, [router, update]);

  const go = useCallback((step: number) => {
    const s = { ...state, step };
    update(s);
    router.push(GUIDED_STEPS[step].href(s.ref));
  }, [router, state, update]);

  const next = useCallback(() => {
    if (state.step >= GUIDED_STEPS.length - 1) { update(OFF); return; }
    go(state.step + 1);
  }, [go, state.step, update]);
  const back = useCallback(() => { if (state.step > 0) go(state.step - 1); }, [go, state.step]);
  const exit = useCallback(() => update(OFF), [update]);

  const value = useMemo<GuidedCtx>(
    () => ({ ...state, start, starting, startError, next, back, exit, stepHref }),
    [state, start, starting, startError, next, back, exit, stepHref],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuided(): GuidedCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGuided must be used inside <GuidedProvider>");
  return c;
}
