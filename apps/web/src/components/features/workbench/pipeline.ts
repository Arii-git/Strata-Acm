import { STAGES, STAGE_INDEX, type StageKey } from "@config/taxonomy";

/**
 * The case pipeline as the user walks it: seven plain steps, one screen each.
 * The engine's workflow stage (config/taxonomy.ts) says where the case IS; this says which step the user LOOKS AT.
 */
export type PipeKey = "detected" | "investigate" | "recall" | "plan" | "approve" | "act" | "learn";

export interface PipeDef {
  key: PipeKey;
  label: string;
  /** one short line under the step heading: the question this step answers */
  question: string;
}

export const PIPE: PipeDef[] = [
  { key: "detected", label: "Detected", question: "What did STRATA notice?" },
  { key: "investigate", label: "Investigate", question: "Why is it happening?" },
  { key: "recall", label: "Recall", question: "What did we do last time?" },
  { key: "plan", label: "Plan", question: "Who should do what, by when?" },
  { key: "approve", label: "Approve", question: "Do we go ahead?" },
  { key: "act", label: "Act", question: "What was set in motion?" },
  { key: "learn", label: "Learn", question: "What happened, and what did we keep?" },
];

export const PIPE_INDEX: Record<PipeKey, number> = Object.fromEntries(PIPE.map((p, i) => [p.key, i])) as Record<PipeKey, number>;

export function isPipeKey(s: string | null | undefined): s is PipeKey {
  return !!s && s in PIPE_INDEX;
}

/** Workflow stage (engine) → the pipeline step where the case currently sits. */
const FROM_WORKFLOW: Record<StageKey, PipeKey> = {
  detected: "detected",
  investigating: "investigate",
  plan_ready: "plan",
  awaiting_approval: "approve",
  in_progress: "act",
  outcome_recorded: "learn",
  learned: "learn",
};

export function workflowKey(stage: string | null | undefined): StageKey {
  return (stage && stage in STAGE_INDEX ? stage : "detected") as StageKey;
}

export function pipeFromWorkflow(stage: string | null | undefined): PipeKey {
  return FROM_WORKFLOW[workflowKey(stage)];
}

export function workflowLabel(stage: string | null | undefined): string {
  return STAGES[STAGE_INDEX[workflowKey(stage)]].label;
}

/** Deep link to a case, opened at the step where it currently sits. */
export function caseHref(ref: string, stage?: string | null): string {
  return `/app/incidents/${encodeURIComponent(ref)}?stage=${pipeFromWorkflow(stage)}`;
}

/**
 * Read `?stage=` (or a legacy `?tab=` from older links: happened / why / todo / evidence / map / trace / memory / plan).
 * `planAwaiting` and `acted` resolve the old "What to do" tab to the step that holds the next action.
 */
export function parseStage(stage: string | null, tab: string | null, ctx: { planAwaiting: boolean; acted: boolean }): PipeKey | null {
  if (isPipeKey(stage)) return stage;
  switch (tab) {
    case "happened": case "evidence": return "detected";
    case "why": case "trace": case "map": return "investigate";
    case "memory": return "recall";
    case "plan": case "todo": return ctx.planAwaiting ? "approve" : ctx.acted ? "act" : "plan";
    default: return null;
  }
}

export type StepState = "done" | "current" | "upcoming";

/** done / current / upcoming for every step, from the workflow stage. "learned" marks every step done. */
export function stepStates(stage: string | null | undefined): StepState[] {
  const wk = workflowKey(stage);
  const cur = PIPE_INDEX[FROM_WORKFLOW[wk]];
  const closed = wk === "learned";
  return PIPE.map((_, i) => (i < cur || (closed && i === cur) ? "done" : i === cur ? "current" : "upcoming"));
}
