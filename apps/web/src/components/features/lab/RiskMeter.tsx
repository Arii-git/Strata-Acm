"use client";

import { LEVEL_LABEL, LEVEL_TONE, MODE_LABEL } from "./meta";

/** Risk level 1-5 as five cells; the current level is outlined and named in text (never colour-only). */
export function RiskMeter({ level, humanThreshold, autoMax, provisionalMax, regulatory }: {
  level: number | null; humanThreshold: number; autoMax: number; provisionalMax: number; regulatory?: boolean;
}) {
  const mode = level === null ? null : regulatory || level > provisionalMax ? "human_only" : level <= autoMax ? "auto" : "provisional";
  const valueText = level === null ? "No open risk" : `Level ${level}, ${LEVEL_LABEL[level]}`;
  return (
    <div className="lab-meter">
      <div className="lab-meter__head">
        <span className="section-label">Risk level</span>
        <span className="lab-meter__value" aria-hidden="true">{valueText}</span>
      </div>
      <div className="lab-meter__cells" role="meter" aria-label="Risk level" aria-valuemin={1} aria-valuemax={5} aria-valuenow={level ?? 0} aria-valuetext={valueText}>
        {[1, 2, 3, 4, 5].map((n) => {
          const state = level === null ? "off" : n < level ? "below" : n === level ? "on" : "off";
          return (
            <span key={n} className={`lab-meter__cell lab-meter__cell--${LEVEL_TONE[n]} lab-meter__cell--${state}`}>
              <span className="lab-meter__n">{n}</span>
              <span className="lab-meter__l">{LEVEL_LABEL[n]}</span>
            </span>
          );
        })}
      </div>
      <p className="lab-meter__policy caption">
        {level === null
          ? "Opens at the first alert; more agreeing alerts raise it."
          : level >= humanThreshold
            ? `Human gate required. ${MODE_LABEL[mode ?? "provisional"]}.${regulatory ? " Quality case: route-only to QA." : ""}`
            : "Below the human gate: the agent may decide on its own at the deadline."}
      </p>
    </div>
  );
}
