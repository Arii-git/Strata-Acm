"use client";

import type { Icon } from "@tabler/icons-react";
import {
  IconCheck, IconChecklist, IconGavel, IconHistory, IconListCheck, IconRadar, IconSchool, IconSearch,
} from "@tabler/icons-react";
import { PIPE, PIPE_INDEX, stepStates, workflowLabel, type PipeKey } from "./pipeline";

const ICON: Record<PipeKey, Icon> = {
  detected: IconRadar,
  investigate: IconSearch,
  recall: IconHistory,
  plan: IconListCheck,
  approve: IconGavel,
  act: IconChecklist,
  learn: IconSchool,
};

/**
 * One horizontal stepper for the whole case: Detected → Investigate → Recall → Plan → Approve → Act → Learn.
 * Each step says done / now / next in words and with an icon (never colour alone). The step where the case
 * sits carries aria-current="step" and the engine's stage label ("Awaiting approval"); the step being viewed
 * is marked "Showing". Every step is a button.
 */
export function CasePipeline({ stage, viewing, onSelect }: { stage: string; viewing: PipeKey; onSelect: (k: PipeKey) => void }) {
  const states = stepStates(stage);
  const curIdx = states.indexOf("current");
  const nextIdx = curIdx >= 0 ? curIdx + 1 : -1;
  const closed = stage === "learned";
  return (
    <nav className="case-pipe" aria-label="Case pipeline">
      <ol className="case-pipe__list" data-testid="stage-tracker">
        {PIPE.map((p, i) => {
          const st = states[i];
          const isCase = st === "current" || (closed && i === PIPE.length - 1);
          const isView = viewing === p.key;
          const StepIcon = st === "done" && !isCase ? IconCheck : ICON[p.key];
          const meta = isCase ? (closed ? "Learned · closed" : `Now · ${workflowLabel(stage)}`) : st === "done" ? "Done" : i === nextIdx ? "Next" : "";
          return (
            <li
              key={p.key}
              className={`case-pipe__step case-pipe__step--${st}${isView ? " case-pipe__step--viewing" : ""}${isCase ? " case-pipe__step--case" : ""}`}
              aria-current={isCase ? "step" : undefined}
            >
              <button
                type="button"
                className="case-pipe__btn"
                onClick={() => onSelect(p.key)}
                data-testid={`pipe-${p.key}`}
                aria-describedby={`pipe-meta-${p.key}`}
              >
                <span className="case-pipe__dot" aria-hidden="true"><StepIcon size={16} stroke={1.75} /></span>
                <span className="case-pipe__text">
                  <span className="case-pipe__label">{p.label}</span>
                  <span className="case-pipe__meta" id={`pipe-meta-${p.key}`}>
                    {meta}
                    {isView ? <span className="case-pipe__showing">{meta ? " · " : ""}Showing</span> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function pipeLabel(k: PipeKey): string {
  return PIPE[PIPE_INDEX[k]].label;
}
