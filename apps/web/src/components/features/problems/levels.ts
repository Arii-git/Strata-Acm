"use client";

import { useMemo } from "react";
import { qs, useApi } from "@/lib/api/client";
import { usePersona } from "@/lib/persona";
import { fmtDate, humanize } from "@/lib/format";
import type { RiskLevel } from "@/components/features/agentic";

/** One row of GET /agentic/levels (contract: docs/NIGHT_BUILD.md, agentic lane). */
export interface LevelItem {
  ref: string;
  title: string;
  level: number;
  level_label: string;
  reasons: string[];
  alerts_count: number;
  decision_deadline: string | null;
  mode: "auto" | "provisional" | "human_only" | string;
  status: "awaiting_human" | "auto_decided" | "provisional" | "decided" | "escalated" | string;
  auto_decision?: { decision: string; rationale: string; at: string; evidence_ids: string[] } | null;
}

interface LevelsPayload { items: LevelItem[] }

/**
 * Risk levels by case ref, or null while loading / when the endpoint is missing or fails.
 * Callers hide the level widgets on null; errors are deliberately silent (the endpoint is optional).
 */
export function useAgenticLevels(): Map<string, LevelItem> | null {
  const { persona } = usePersona();
  const { data } = useApi<LevelsPayload>(qs("/agentic/levels", { persona }));
  return useMemo(() => {
    if (!data || !Array.isArray(data.items)) return null;
    return new Map(data.items.filter((i) => i && typeof i.ref === "string").map((i) => [i.ref, i]));
  }, [data]);
}

export function toRiskLevel(n: number | null | undefined): RiskLevel {
  const v = Math.round(Number(n) || 2);
  return Math.min(5, Math.max(1, v)) as RiskLevel;
}

/** "9 Oct 2026 14:00" on the deadline's own clock (sim time; no timezone shift). */
function deadlineText(iso: string): string {
  const full = fmtDate(iso, true);
  return full === "—" ? iso : full;
}

/** One plain line: where the decision stands and what the agent will do if nobody decides. */
export function agentStatusLine(item: LevelItem): string {
  const by = item.decision_deadline ? deadlineText(item.decision_deadline) : null;
  switch (item.status) {
    case "awaiting_human":
      if (item.mode === "provisional") return by ? `Awaiting you. If no decision by ${by}, the agent takes a provisional decision.` : "Awaiting you. The agent may take a provisional decision.";
      if (item.mode === "auto") return by ? `Awaiting you. If no decision by ${by}, the agent decides on its own (low level).` : "Awaiting you. The agent may decide on its own (low level).";
      return by ? `Awaiting you. Level ${item.level} needs a person; it escalates if undecided by ${by}.` : `Awaiting you. Level ${item.level} needs a person.`;
    case "provisional":
      return item.auto_decision ? `The agent took a provisional decision: ${humanize(item.auto_decision.decision).toLowerCase()}. Confirm or change it.` : "The agent took a provisional decision. Confirm or change it.";
    case "auto_decided":
      return item.auto_decision ? `The agent decided: ${humanize(item.auto_decision.decision).toLowerCase()}.` : "The agent decided under the low-level policy.";
    case "escalated":
      return "Escalated: the deadline passed without a decision.";
    case "decided":
      return "Decided by a person.";
    default:
      return humanize(item.status);
  }
}
