"use client";

import { qs, useApi, type ApiState } from "@/lib/api/client";
import type { EventItem } from "@/components/ui";
import { STAGES, type StageKey } from "@config/taxonomy";

export interface EventsResponse {
  items: EventItem[];
  types: Record<string, { label: string; icon: string; template: string }>;
}

/** GET /events (classified, causal order). `incident` filters to one case; `limit` keeps the latest N. */
export function useEvents(incident?: string | null, limit?: number): ApiState<EventsResponse> {
  return useApi<EventsResponse>(qs("/events", { incident: incident ?? undefined, limit }));
}

/**
 * Stage timestamps for StageTracker: the first event with a given `stage_index` gives that stage's time
 * (wall clock, i.e. when the click happened). Index maps to STAGES order in config/taxonomy.ts.
 */
export function stageTimestamps(events: EventItem[] | undefined | null): Partial<Record<StageKey, string>> {
  const out: Partial<Record<StageKey, string>> = {};
  for (const e of events ?? []) {
    if (e.stage_index == null) continue;
    const s = STAGES[e.stage_index];
    if (s && !out[s.key]) out[s.key] = e.wall_at;
  }
  return out;
}
