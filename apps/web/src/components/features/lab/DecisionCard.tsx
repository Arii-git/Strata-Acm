"use client";

import { useEffect, useRef } from "react";
import { IconArrowUpRight, IconCheck, IconHourglass, IconUserShield } from "@tabler/icons-react";
import { LEVEL_LABEL, LEVEL_TONE, MODE_LABEL } from "./meta";
import type { DecisionKey, SimRun } from "./types";

const OPTION_ICON = { approve: IconCheck, wait: IconHourglass, escalate: IconArrowUpRight } as const;

/** Shown when playback reaches the human gate. The choice picks one of three pre-computed, deterministic branches. */
export function DecisionCard({ run, onDecide }: { run: SimRun; onDecide: (d: DecisionKey) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const g = run.gate;
  return (
    <section className="lab-gate" aria-labelledby="lab-gate-title" data-testid="sim-gate">
      <div className="lab-gate__head">
        <span className="lab-gate__icon" aria-hidden="true"><IconUserShield size={20} stroke={1.5} /></span>
        <div>
          <h3 id="lab-gate-title" className="lab-gate__title">Human gate: {g.required_role_label} decides</h3>
          <p className="lab-gate__sub">
            <span className={`lab-lvl lab-lvl--${LEVEL_TONE[g.level]}`}>L{g.level} {LEVEL_LABEL[g.level]}</span>
            <span>Deadline {g.deadline_hours} h</span>
            <span>· {MODE_LABEL[g.mode]}</span>
          </p>
        </div>
      </div>
      <ol className="lab-gate__plan">
        {run.scenario.playbook.map((s) => (
          <li key={s.step}><span className="lab-gate__who">{s.owner_label}</span>{s.action}<span className={`lab-scope lab-scope--${s.scope}`}>{s.scope}</span></li>
        ))}
      </ol>
      <div className="lab-gate__options" role="group" aria-label="Your decision">
        {g.options.map((o, i) => {
          const Icon = OPTION_ICON[o.key];
          return (
            <button key={o.key} ref={i === 0 ? first : undefined} type="button" className={`lab-opt lab-opt--${o.key}`} onClick={() => onDecide(o.key)}>
              <span className="lab-opt__label"><Icon size={16} stroke={1.75} aria-hidden="true" />{o.label}</span>
              <span className="lab-opt__effect">{o.effect}</span>
            </button>
          );
        })}
      </div>
      <p className="caption">Your choice changes what happens next. Each path is pre-declared and deterministic; outcomes are illustrative.</p>
    </section>
  );
}
