// Hand-written from docs/API.md (v0.1). Replace with generated schema.d.ts (`npm run gen:api`) when the engine OpenAPI is stable.

export type PersonaKey =
  | "operations_manager"
  | "account_manager"
  | "sales_manager"
  | "support_manager"
  | "business_head"
  | "qa_head";
export type Severity = "healthy" | "watch" | "elevated" | "high" | "critical";
export type Kind = "risk" | "opportunity";
export type Provenance = "computed" | "synthetic" | "illustrative" | "assumption";

export interface ListResponse<T> { items: T[] }

export interface Health {
  status: "ok";
  mode: "live" | "replay";
  store: string;
  llm_provider: string;
  retrieval: "tfidf" | "embeddings";
  sim_now: string;
  features: string[];
}

export interface Priority {
  incident_id: string; ref: string; title: string; kind: Kind; severity: Severity;
  risk_score: number; value_at_stake: number; n_sources: number;
  account_id: string; account_name: string; status: string; rank_score: number; regulatory_sensitive: boolean;
}
export interface HeldBack { ref: string; title: string; reason: string }
export interface Note {
  id?: string; author_role: string; author: string; body: string; mentions: string[];
  incident_id?: string | null; account_id?: string | null; created_at?: string;
}
export interface Briefing {
  persona: PersonaKey; sim_now: string; greeting: string; role_label: string;
  signals_checked: number; sources_count: number; accounts_count: number;
  need_you: number; opportunities: number; qa_routed: number;
  summary: string; priorities: Priority[]; held_back: HeldBack[]; notes_for_you: Note[];
}

export interface PortfolioHealth {
  index: { value: number; delta_4w: number; provenance: Provenance };
  pillars: { key: string; label: string; value: number; delta_4w: number; caption: string; provenance: Provenance }[];
  movers: { account_id: string; account_name: string; signal_key: string; label: string; delta: number; severity: Severity }[];
  activity: { weeks: string[]; orders: number[]; tickets: number[]; visits: number[] };
  mix: { type: string; label: string; count: number; value_12w: number }[];
}

export interface IncidentSummary {
  id: string; ref: string; kind: Kind; title: string;
  account_id: string; account_name: string; account_type: string; region: string;
  scope: string; scope_key: string; severity: Severity; risk_score: number;
  n_sources: number; sources: string[]; value_at_stake: number; status: string;
  cause: string | null; cause_confidence: number | null; driver: string;
  regulatory_sensitive: boolean; owner_role: string; age_days: number; rank_score: number;
  /** review 1: taxonomy (config/taxonomy.ts) */
  category?: string; category_label?: string; stage?: string; stage_label?: string; persistence_bonus?: boolean;
}
export interface RisksResponse extends ListResponse<IncidentSummary> {
  held_back: HeldBack[]; budget: number; shown: number; total: number;
}

export interface Series { labels: string[]; values: number[]; baseline: number }
export interface Evidence {
  id: string; signal_key: string; label: string; source: string; class: string; scope: string;
  value: number; baseline: number; robust_z: number; delta: number; direction: string;
  role: "supporting" | "contradicting" | "context"; caption: string; unit: string; series: Series | null;
}

export interface AgentStep {
  agent: "sentinel" | "investigator" | "memory" | "orchestrator";
  started_at: string; finished_at: string; summary: string; evidence_ids: string[]; status: "ok" | "failed";
}
export interface MemoryMatch {
  ref: string; title: string; kind: string; similarity: number;
  breakdown: { embedding: number; cause: number; pattern: number };
  resolution: string; outcome: string; authored_by: string;
}
export interface Investigation {
  run_id: string; steps: AgentStep[]; cause: string; cause_confidence: number;
  hypotheses: { cause: string; confidence: number; conditions: { text: string; met: boolean; evidence_ids: string[] }[] }[];
  memory_matches: MemoryMatch[];
  narrative: { text: string; evidence_ids: string[] }[];
  grounding_ok: boolean; grounding_notes: string[];
  source: "template" | "llm"; retrieval: "tfidf" | "embeddings"; mode: "live" | "replay";
}

export interface PlanStep { n: number; action: string; owner_role: string; due_in_hours: number; evidence_ids: string[]; source: "sop" | "memory" | "agent" }
export interface Draft { channel: "whatsapp_draft" | "email_draft"; to_role: string; subject: string; body: string; simulated: true }
export type PlanStatus = "awaiting_approval" | "approved" | "rejected" | "modified";
export interface Plan {
  id: string; incident_id: string; version: number; steps: PlanStep[];
  requires_role: string; four_eyes: boolean; value_at_stake: number; expected_outcome: string;
  drafts: Draft[]; status: PlanStatus;
}
export interface Approval {
  plan_id: string; incident_id: string; ref: string; title: string; severity: Severity;
  requires_role: string; four_eyes: boolean; approvals_so_far: number; waiting_hours: number; value_at_stake: number;
}
export type Decision = "approved" | "modified" | "rejected";
export interface DecisionRequest { decision: Decision; reason?: string; persona: PersonaKey; decided_by: string }
export interface DecisionResponse { ok: boolean; incident_status: string; tasks_created: number; message: string }

export interface Task {
  id: string; title: string; owner_role: string; due_at: string; status: string; channel: string; origin: string;
  account_id: string | null; incident_id: string | null; incident_ref: string | null;
  payload: Record<string, unknown>; simulated: true; created_at: string;
}
export interface Outcome {
  incident_id: string; ref: string; kpi: string; before_value: number; after_value: number;
  verdict: string; provenance: "illustrative"; notes: string; measured_at: string;
}

export interface IncidentDetail extends IncidentSummary {
  onset_estimated_at: string; first_detected_at: string; silent_period_days: number; silent_period_basis: string;
  evidence: Evidence[];
  blast_radius: { account_id: string; account_name: string; exposure_basis: string; exposure_value: number }[];
  investigation: Investigation | null; plan: Plan | null;
  approvals: Approval[]; tasks: Task[]; outcomes: Outcome[];
}

export interface MemoryItem {
  ref: string; kind: string; title: string; body: string; cause: string; account_type: string;
  outcome: string; authored_by: string; used_count: number; steps: string[];
}
export interface MemorySearchResponse { items: { ref: string; title: string; kind: string; score: number }[]; retrieval: string }
export interface AskResponse {
  cards: { title: string; body: string; evidence: { id: string; label: string }[]; link: string | null }[];
  refused: boolean;
}

export interface AccountRow {
  id: string; name: string; type: string; region: string; tier: string;
  value_12w: number; risk_score: number; severity: Severity; open_incidents: number;
}
export interface NextBestAction { rule_id: string; text: string; owner_role: string; draft_channel: string; due_in_hours: number; evidence_ids: string[] }
export interface AccountDetail {
  account: { id: string; name: string; type: string; region: string; city: string; tier: string; rep: string };
  value_12w: number;
  trend: { labels: string[]; units: number[]; baseline: number };
  signals: Evidence[];
  interactions: { occurred_at: string; kind: string; rep: string; duration_min: number }[];
  open_tasks: Task[]; next_best_actions: NextBestAction[]; notes: Note[]; incidents: IncidentSummary[];
}

export interface AuditRow {
  id: string | number; at: string; wall_at: string; actor_type: string; actor: string; action: string;
  entity_type: string; entity_id: string; detail: unknown; prev_hash: string; hash: string;
}
export interface AuditResponse extends ListResponse<AuditRow> { verified: boolean }
export interface AuditVerify { ok: boolean; checked: number; first_bad_id: string | number | null }

export interface TimeToActionResponse extends ListResponse<{ ref: string; detected_wall_at: string; approved_wall_at: string; seconds: number }> {
  median_seconds: number | null; n: number; manual_baseline_minutes: { value: number; provenance: "illustrative" };
}

export interface EvalRun {
  seed: number; is_holdout: boolean;
  metrics: { precision: number; recall: number; root_cause_acc: number; false_alarms: number };
  per_scenario: { id: string; title: string; kind: Kind; expected: string; detected: boolean; severity: Severity | null; cause: string | null; cause_ok: boolean; hit: boolean }[];
}
export interface EvalResponse { runs: EvalRun[]; caveat: string }

export interface Feed {
  system: string; label: string; last_ingested_at: string; expected_every_minutes: number;
  rows_last_run: number; duplicate_ratio: number; status: string; lag_multiple: number;
}
export interface CatalogSignal { key: string; class: string; source: string; definition: string; adverse: string; weight: number; caption: string; regulatory_sensitive: boolean }
export interface SourcesResponse { feeds: Feed[]; catalog: CatalogSignal[]; notices: { system: string; message: string }[] }

export interface LabAdvanceResponse { sim_now: string; outcomes_recorded: number; memory_written: string[] }
export interface NotebookEntry { id?: string; author: string; tried: string; happened: string; changed?: string; evidence?: string; created_at?: string }
export interface Routine { id: string; [k: string]: unknown }
