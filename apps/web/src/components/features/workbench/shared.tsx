"use client";

import type { CSSProperties } from "react";
import type { Approval, Evidence, IncidentDetail, Investigation, MemoryItem, Plan, PlanStep, Draft, Task, Outcome, Note } from "@/lib/api/types";
import { EvidenceChip } from "@/components/ui";
import { fmtNum, fmtPct } from "@/lib/format";

/* Local type extensions: live engine JSON differs from lib/api/types (do not edit the shared file). */
export type WbPlanStep = Omit<PlanStep, "source"> & { source: string };
export type WbDraft = Draft & { evidence_ids?: string[] };
export interface PlanApproval { id: string; plan_id: string; decided_by: string; decider_role: string; decision: string; reason: string | null; decided_at: string }
export type WbPlan = Omit<Plan, "steps" | "drafts"> & {
  steps: WbPlanStep[]; drafts: WbDraft[]; sop_ref?: string | null; memory_ref?: string | null; created_by_run?: string; approvals?: PlanApproval[];
};
export type WbEvidence = Evidence & { scope_key?: string; definition?: string; note?: string };
export type WbOutcome = Outcome & { id?: string };
export type WbTask = Omit<Task, "account_id"> & { account_id: string | number | null; plan_id?: string };
export interface BlastRow { account_id: string | number; account_name: string; exposure_basis: string; exposure_value: number; sku?: string; sku_fill_rate?: number }
export type WbIncident = Omit<IncidentDetail, "account_id" | "evidence" | "plan" | "approvals" | "tasks" | "outcomes" | "blast_radius" | "cause" | "account_type"> & {
  account_id: string | number | null;
  account_type: string | null;
  cause: string | null;
  evidence: WbEvidence[];
  blast_radius: BlastRow[];
  investigation: (Investigation & { hypotheses: { cause: string; confidence: number; conditions: { text: string; met: boolean; evidence_ids: string[]; kind?: string }[] }[] }) | null;
  plan: WbPlan | null;
  approvals: (Approval | PlanApproval)[];
  tasks: WbTask[];
  outcomes: WbOutcome[];
  notes?: Note[];
  /** review-1 fields (docs/API.md, "Added in review 1"); mirrored here until lib/api/types catches up */
  category: string;
  category_label?: string;
  stage: string;
  stage_label?: string;
};
export type WbIncidentSummary = Omit<WbIncident, "evidence" | "blast_radius" | "investigation" | "plan" | "approvals" | "tasks" | "outcomes" | "notes" | "onset_estimated_at" | "first_detected_at" | "silent_period_days" | "silent_period_basis">;
export type WbMemoryItem = Omit<MemoryItem, "steps"> & {
  steps: ({ n: number; action: string; owner_role?: string } | string)[];
  signals?: string[]; resolution?: string; date?: string;
};

export const DRAFT_AUTHOR = "DRAFT - TEAM TO REVIEW";

export function isNotInvestigated(cause: string | null | undefined): boolean {
  return !cause || cause === "not_investigated";
}

/** Format an evidence item's value by its catalog unit. */
export function fmtEvidenceValue(e: Pick<Evidence, "unit" | "value" | "baseline" | "delta">): { headline: string; detail: string } {
  switch (e.unit) {
    case "pct":
      return { headline: fmtPct(e.delta), detail: `${fmtNum(e.value)} vs ${fmtNum(e.baseline)} baseline` };
    case "ratio":
      return { headline: fmtPct(e.value, { signed: false }), detail: `vs ${fmtPct(e.baseline, { signed: false })} baseline` };
    case "days":
      return { headline: `${fmtNum(e.value, 1)} d`, detail: `vs ${fmtNum(e.baseline, 1)} d baseline` };
    default:
      return { headline: fmtNum(e.value, 1), detail: `vs ${fmtNum(e.baseline, 1)} baseline` };
  }
}

export function Chips({ ids, onChip, labels }: { ids: string[] | undefined; onChip?: (id: string) => void; labels?: Record<string, string> }) {
  const uniq = Array.from(new Set(ids ?? []));
  if (!uniq.length) return <span className="muted caption">no evidence ids</span>;
  return (
    <span className="row" style={{ flexWrap: "wrap", gap: "var(--sp-1)" }}>
      {uniq.map((id) => <EvidenceChip key={id} id={id} label={labels?.[id]} onClick={onChip} />)}
    </span>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "var(--sp-2) var(--sp-3)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--r-sm)",
  background: "var(--surface)",
  fontSize: "var(--fs-13)",
};

export const labelStyle: CSSProperties = { fontSize: "var(--fs-12)", color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: "var(--sp-1)" };

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** "4 h", "36 h", "14 d" — plan due times are given in hours by the engine. */
export function fmtHours(h: number): string {
  return h >= 48 ? `${fmtNum(h / 24, h % 24 ? 1 : 0)} d` : `${fmtNum(h)} h`;
}

/** Plain label for a memory item's author (DRAFT seed items stay labelled DRAFT). */
export function memoryAuthorLabel(author: string): string {
  if (author === DRAFT_AUTHOR) return "DRAFT memory item";
  if (author === "strata-system") return "learning-loop memory item";
  return `memory item by ${author}`;
}

export const MEMORY_NOTE =
  "Items authored \"DRAFT - TEAM TO REVIEW\" are seed drafts and must be rewritten by the team before they are trusted. Items authored \"strata-system\" are written by the learning loop after an outcome is recorded.";
