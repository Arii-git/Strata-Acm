/** Shapes of the engine's /sim/* responses (services/engine/strata_engine/simulation.py). All outcomes are illustrative. */
import type { Provenance } from "@/lib/api/types";

export type StageKey = "observe" | "detect" | "investigate" | "remember" | "act" | "learn";
export type DecisionKey = "approve" | "wait" | "escalate";
export type KpiKey = "revenue" | "service_level" | "backlog" | "complaints" | "dso" | "cost_to_serve";
export type GateMode = "auto" | "provisional" | "human_only";
export type Trajectory = "baseline" | "without_strata" | "with_strata";

export interface SimPolicy {
  default_level: number;
  human_threshold: number;
  deadlines_hours: Record<string, number>;
  auto_decide_max_level: number;
  provisional_max_level: number;
  email_min_level: number;
}

export interface CatalogScenario {
  id: string;
  industry: string;
  category: string;
  title: string;
  one_liner: string;
  trigger: string;
  horizon_weeks: number;
  start_level: number;
  peak_level: number;
  primary_kpi: KpiKey;
  regulatory: boolean;
}

export interface SimCatalog {
  industries: { key: string; label: string; blurb: string; count: number }[];
  categories: { key: string; label: string; count: number }[];
  stages: { key: StageKey; label: string }[];
  scenarios: CatalogScenario[];
  policy: SimPolicy;
  caption: string;
  provenance: Provenance;
}

export interface GateOption { key: DecisionKey; label: string; effect: string }

export interface GateDecision {
  id: string;
  required_role: string;
  required_role_label: string;
  deadline_hours: number;
  level: number;
  mode: GateMode;
  options: GateOption[];
  chosen: DecisionKey;
}

export interface SimEvent {
  id: string;
  day: number;
  week: number;
  stage: StageKey;
  title: string;
  detail: string;
  actor: "agent" | "human" | "external" | "system";
  risk_level: number | null;
  kind: string;
  track: "with" | "without" | "both";
  decision?: GateDecision;
  role?: string;
  roles?: string[];
  branch?: DecisionKey;
  scope?: "internal" | "external";
  side_level?: number;
  level_change?: [number | null, number];
}

export interface PlaybookStep { step: number; owner_role: string; owner_label: string; action: string; scope: "internal" | "external" }

export interface SimKpi {
  key: "days_to_detect" | "peak_impact" | "weeks_to_recover" | "exposure_protected" | "complaints_avoided";
  label: string;
  unit: string;
  better: string;
  with?: number | null;
  without?: number | null;
  value?: number | null;
  provenance: Provenance;
  caption: string;
}

export interface BranchSummary {
  decision: DecisionKey;
  mode: GateMode;
  decided_day: number;
  action_day: number;
  weeks_to_recover: number | null;
  peak_impact_pct: number;
  exposure_protected: number;
  extra_cost_pct: number;
  provenance: Provenance;
}

export interface KpiMeta { key: KpiKey; label: string; unit: string; good: "up" | "down"; base: number }

export type Point = [number, number];

export interface SimRun {
  scenario: CatalogScenario & {
    industry_label: string;
    category_label: string;
    context: Record<string, string>;
    playbook: PlaybookStep[];
    owner_role: string;
    owner_label: string;
  };
  horizon_weeks: number;
  seed: number;
  decision: DecisionKey;
  weeks: { week: number; label: string; start_day: number }[];
  kpi_meta: KpiMeta[];
  primary_kpi: KpiKey;
  series: Record<Trajectory, Record<KpiKey, Point[]>>;
  events: SimEvent[];
  gate: GateDecision & { day: number; event_id: string };
  timeline: {
    onset_day: number;
    detect_day_with: number;
    detect_day_without: number;
    action_day_with: number;
    action_day_without: number;
    recovered_day_with: number | null;
    recovered_day_without: number | null;
    total_days: number;
  };
  kpis: SimKpi[];
  branches: Record<DecisionKey, BranchSummary>;
  policy: SimPolicy;
  summary: string;
  caption: string;
  provenance: Provenance;
}

export interface CompareRow {
  scenario_id: string;
  industry: string;
  industry_label: string;
  title: string;
  horizon_weeks: number;
  primary_kpi: KpiKey;
  detect_days_with: number;
  detect_days_without: number;
  weeks_to_recover_with: number | null;
  weeks_to_recover_without: number | null;
  peak_impact_with: number;
  peak_impact_without: number;
  exposure_protected: number;
}

export interface SimCompare { category: string; category_label: string; rows: CompareRow[]; caption: string; provenance: Provenance }
