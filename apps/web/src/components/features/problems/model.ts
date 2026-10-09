import { CATEGORY, STAGES, STAGE_INDEX, type CategoryKey, type StageKey } from "@config/taxonomy";
import type { HeldBack, Kind, Severity } from "@/lib/api/types";
import { personaLabel } from "@/lib/persona";
import { humanize } from "@/lib/format";

/** Incident summary as the engine returns it (with the taxonomy fields from docs/API.md). */
export interface ProblemRow {
  id: string; ref: string; kind: Kind; title: string;
  account_id: number | string | null; account_name: string; account_type?: string | null; region: string | null;
  scope: string; scope_key: string; severity: Severity; risk_score: number;
  n_sources: number; sources: string[]; value_at_stake: number; status: string;
  cause: string | null; cause_confidence: number | null; driver: string;
  regulatory_sensitive: boolean; owner_role: string; age_days: number; rank_score: number;
  category: CategoryKey; category_label?: string; stage: StageKey; stage_label?: string;
}
export interface RisksPayload { items: ProblemRow[]; held_back: HeldBack[]; budget: number; shown: number; total: number }

/** Highest first. */
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "elevated", "watch", "healthy"];
export const sevRank = (s: Severity) => SEVERITY_ORDER.length - SEVERITY_ORDER.indexOf(s);

/** Severity first, then ₹ exposed. */
export function sortProblems(rows: ProblemRow[]): ProblemRow[] {
  return [...rows].sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || b.value_at_stake - a.value_at_stake);
}

/** "Northwind … 4821" for account scope; "Region: Punjab", "Rep 118", "Batch B-ANM02-2608" otherwise. */
export function scopeText(r: Pick<ProblemRow, "scope" | "scope_key" | "account_name" | "region">): string {
  switch (r.scope) {
    case "account": return r.account_name || `Account ${r.scope_key}`;
    case "region": return `Region: ${r.region ?? r.scope_key}`;
    case "rep": return `Rep ${r.scope_key} (territory)`;
    case "batch": return `Batch ${r.scope_key}`;
    case "portfolio": return "Whole portfolio";
    default: return r.account_name || `${r.scope} ${r.scope_key}`;
  }
}

export const ownerText = (role: string) => personaLabel(role);
export const ageText = (d: number) => `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`;
export const stageText = (s: string) => STAGES[STAGE_INDEX[s as StageKey] ?? 0].label;
export const categoryKey = (c: string): CategoryKey => (c in CATEGORY ? (c as CategoryKey) : "customer");

/** Minimum-severity filter: "high" keeps critical + high. */
export function atLeast(sev: Severity, min: Severity | ""): boolean {
  return !min || sevRank(sev) >= sevRank(min);
}

/** One plain line of why: the investigated cause if known, else the likely driver, with how many systems agree. */
export function reasonText(r: Pick<ProblemRow, "cause" | "driver" | "n_sources">): string {
  const why = r.cause && r.cause !== "not_investigated" ? `cause: ${humanize(r.cause).toLowerCase()}` : r.driver ? `likely driver: ${r.driver}` : "not yet investigated";
  return `${r.n_sources === 1 ? "1 system" : `${r.n_sources} systems agree`} · ${why}`;
}
