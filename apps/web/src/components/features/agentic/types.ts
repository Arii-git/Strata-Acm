/** Shapes returned by the engine's /agentic/* router (services/engine/strata_engine/agentic.py). */
export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type AgenticMode = "auto" | "provisional" | "human_only";
export type AgenticStatus = "awaiting_human" | "auto_decided" | "provisional" | "decided" | "escalated";

export const LEVEL_LABEL: Record<RiskLevel, string> = { 1: "Low", 2: "Moderate", 3: "Elevated", 4: "High", 5: "Critical" };
export const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];

export function asLevel(n: number | null | undefined): RiskLevel {
  const v = Math.round(Number(n));
  return (v >= 1 && v <= 5 ? v : 2) as RiskLevel;
}

export interface AgenticPolicy {
  default_level: number;
  human_threshold: number;
  deadlines_hours: Record<string, number>;
  auto_decide_max_level: number;
  provisional_max_level: number;
  email_min_level: number;
  updated_by: string | null;
  updated_at: string | null;
}

export interface AgentDecisionRef {
  id: string;
  kind: "auto" | "provisional" | "escalation";
  decision: string;
  rationale: string;
  at: string;
  evidence_ids: string[];
  status: string;
}

export interface AgenticItem {
  ref: string;
  title: string;
  kind: string;
  severity: string;
  level: RiskLevel;
  level_label: string;
  reasons: string[];
  alerts_count: number;
  decision_deadline: string | null;
  deadline_passed: boolean;
  mode: AgenticMode;
  status: AgenticStatus;
  mode_line: string;
  auto_decision: AgentDecisionRef | null;
  override: { level: number; reason: string; by: string; at: string } | null;
  regulatory_sensitive: boolean;
  owner_role: string;
  account_id: number | null;
  account_name: string;
  value_at_stake: number;
  plan_id: string | null;
  plan_status: string | null;
  requires_role: string;
  four_eyes: boolean;
  approvals_so_far: number;
  agent_disabled: boolean;
  started_at: string;
}

export interface AgenticLevels {
  items: AgenticItem[];
  counts: Record<string, number>;
  policy: AgenticPolicy;
  sim_now: string;
  acted: AgentDecision[];
}

export interface AgentDecision {
  id: string;
  ref: string;
  title?: string;
  kind: "auto" | "provisional" | "escalation";
  decision: string;
  rationale: string;
  level: RiskLevel;
  level_label: string;
  mode: AgenticMode;
  plan_id: string | null;
  evidence_ids: string[];
  task_ids: string[];
  trigger: string;
  status: "active" | "final" | "undone" | "confirmed" | "superseded";
  at: string;
  closed_by?: string;
}

export interface AgentNotification {
  id: string;
  at: string;
  roles: string[];
  subject: string;
  via: "email" | "in_app";
  kind: string;
  ref: string | null;
}

export interface AgentDecisionsResponse { items: AgentDecision[]; notifications: AgentNotification[]; sim_now: string }

export interface AgentInfo {
  key: string;
  name: string;
  job: string;
  where: string[];
  autonomy: "suggests" | "acts with approval" | "acts at deadline";
  saves: string;
}
