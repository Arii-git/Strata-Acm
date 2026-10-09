"use client";

import { memo } from "react";
import { ACTOR_META, LEVEL_LABEL, LEVEL_TONE, STAGE_META, fmtSimTime } from "./meta";
import type { SimEvent } from "./types";

const STAGE = Object.fromEntries(STAGE_META.map((s) => [s.key, s]));

/** The run's events up to the playhead, newest first. Re-renders only when the visible count changes. */
export const EventFeed = memo(function EventFeed({ events, count }: { events: SimEvent[]; count: number }) {
  const shown = events.slice(0, count).reverse();
  return (
    <div className="lab-feed">
      <div className="lab-feed__head">
        <h3 className="section-label">What is happening</h3>
        <span className="caption">{count} of {events.length} events</span>
      </div>
      {shown.length === 0 ? <p className="caption lab-feed__empty">Press Play. Events appear here as the simulated weeks pass.</p> : null}
      <ol className="lab-feed__list" aria-label="Simulation events, newest first">
        {shown.map((e) => {
          const st = STAGE[e.stage];
          const Icon = st?.icon;
          const actor = ACTOR_META[e.actor];
          const ActorIcon = actor.icon;
          const without = e.track === "without";
          return (
            <li key={e.id} className={`lab-ev lab-ev--${e.stage}${without ? " lab-ev--without" : ""}${e.kind === "gate" ? " lab-ev--gate" : ""}`}>
              <span className="lab-ev__stage" aria-hidden="true">{Icon ? <Icon size={16} stroke={1.75} /> : null}</span>
              <div className="lab-ev__body">
                <div className="lab-ev__meta">
                  <span className="mono">{fmtSimTime(e.day)}</span>
                  <span>· {st?.label}</span>
                  <span className="lab-ev__actor"><ActorIcon size={14} stroke={1.5} aria-hidden="true" />{e.role ? e.role.replace(/_/g, " ") : actor.label}</span>
                  {without ? <span className="lab-ev__tag">Without STRATA</span> : null}
                  {e.risk_level !== null && !without ? (
                    <span className={`lab-lvl lab-lvl--${LEVEL_TONE[e.risk_level]}`}>L{e.risk_level} {LEVEL_LABEL[e.risk_level]}</span>
                  ) : null}
                </div>
                <div className="lab-ev__title">{e.title}</div>
                <div className="lab-ev__detail">{e.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
