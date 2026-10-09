"use client";

import { useEffect, useState } from "react";
import { apiGet, qs, useApi, type ApiState } from "@/lib/api/client";
import type { AgentDecisionsResponse, AgentInfo, AgenticLevels, AgenticPolicy } from "./types";

/** Risk levels 1-5 for every open case (the engine also runs the Deadline Guardian on each call). */
export function useAgenticLevels(persona?: string | null): ApiState<AgenticLevels> {
  return useApi<AgenticLevels>(qs("/agentic/levels", { persona: persona ?? undefined }));
}

export function useAgenticPolicy(): ApiState<AgenticPolicy> {
  return useApi<AgenticPolicy>("/agentic/policy");
}

export function useAgentDecisions(): ApiState<AgentDecisionsResponse> {
  return useApi<AgentDecisionsResponse>("/agentic/decisions");
}

export function useAgentRegistry(): ApiState<AgentInfo[]> {
  return useApi<AgentInfo[]>("/agentic/agents");
}

/* ---- shared engine sim clock (/health sim_now), fetched at most every 30 s for all countdowns ---- */
let simNow: string | null = null;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
const subs = new Set<(v: string | null) => void>();

function loadSimNow(): void {
  if (inflight || Date.now() - fetchedAt < 30_000) return;
  inflight = apiGet<{ sim_now?: string }>("/health")
    .then((h) => { simNow = h.sim_now ?? null; })
    .catch(() => { /* keep the last value; countdowns fall back to "deadline <time>" */ })
    .finally(() => { fetchedAt = Date.now(); inflight = null; subs.forEach((f) => f(simNow)); });
}

/** Engine simulated clock as an ISO string (null until loaded). Pass `override` to skip the fetch. */
export function useSimNow(override?: string | null): string | null {
  const [v, setV] = useState<string | null>(override ?? simNow);
  useEffect(() => {
    if (override) { setV(override); return; }
    subs.add(setV);
    loadSimNow();
    return () => { subs.delete(setV); };
  }, [override]);
  return override ?? v;
}

/** Forget the cached sim clock (call after the Lab advances time). */
export function invalidateSimNow(): void { fetchedAt = 0; loadSimNow(); }
