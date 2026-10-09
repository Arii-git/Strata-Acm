import { IconCheck } from "@tabler/icons-react";
import { STAGES, STAGE_INDEX, type StageKey } from "@config/taxonomy";

/**
 * The 7 workflow stages with the current one highlighted and completed ones ticked.
 * `timestamps` (stage key → ISO time) comes from /events; "investigating" and "plan_ready" are skipped as
 * done when the case went straight to a plan.
 */
export function StageTracker({ stage, timestamps = {} }: { stage: string; timestamps?: Partial<Record<StageKey, string>> }) {
  const cur = STAGE_INDEX[stage as StageKey] ?? 0;
  return (
    <ol className="stage-tracker" aria-label="Workflow stage" data-testid="stage-tracker">
      {STAGES.map((s, i) => {
        const state = i < cur ? "done" : i === cur ? "current" : "todo";
        const ts = timestamps[s.key];
        return (
          <li key={s.key} className={`stage-tracker__step stage-tracker__step--${state}`} aria-current={state === "current" ? "step" : undefined} title={s.meaning}>
            <span className="stage-tracker__dot" aria-hidden="true">{state === "done" ? <IconCheck size={14} stroke={2} /> : i + 1}</span>
            <span className="stage-tracker__label">{s.label}</span>
            <span className="stage-tracker__meta">
              {state === "done" ? (ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "done") : state === "current" ? "now" : ""}
            </span>
            <span className="sr-only">{state === "done" ? "completed" : state === "current" ? "current stage" : "not started"}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function stageLabel(stage: string): string {
  return STAGES[STAGE_INDEX[stage as StageKey] ?? 0].label;
}
