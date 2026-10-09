"use client";

import { STAGE_META } from "./meta";
import type { StageKey } from "./types";

const C = 140;
const R = 96;
const GAP = 5; // degrees between segments

function polar(deg: number, r = R): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function arc(a0: number, a1: number): string {
  const [x0, y0] = polar(a0);
  const [x1, y1] = polar(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * The STRATA loop as a ring of six stages. The current stage is lit, visited stages are tinted, the rest are quiet.
 * Purely presentational: the parent decides the stage from the event feed.
 */
export function LoopRing({ current, visited, time, note }: { current: StageKey | null; visited: ReadonlySet<StageKey>; time: string; note?: string }) {
  const cur = STAGE_META.find((s) => s.key === current);
  const done = STAGE_META.filter((s) => visited.has(s.key) && s.key !== current).map((s) => s.label);
  const label = `STRATA loop. ${cur ? `Current stage: ${cur.label}.` : "Not started."}${done.length ? ` Visited: ${done.join(", ")}.` : ""}`;
  return (
    <figure className="lab-ring" aria-label={label} role="img">
      <svg viewBox="0 0 280 280" className="lab-ring__svg" aria-hidden="true" focusable="false">
        <circle cx={C} cy={C} r={R} className="lab-ring__track" />
        {STAGE_META.map((s, i) => {
          const a0 = i * 60 + GAP / 2;
          const a1 = (i + 1) * 60 - GAP / 2;
          const state = s.key === current ? "current" : visited.has(s.key) ? "done" : "todo";
          const [lx, ly] = polar(i * 60 + 30, R + 30);
          const Icon = s.icon;
          const [ix, iy] = polar(i * 60 + 30, R);
          return (
            <g key={s.key} className={`lab-ring__seg lab-ring__seg--${state}`}>
              <path d={arc(a0, a1)} className="lab-ring__arc" />
              <g transform={`translate(${(ix - 8).toFixed(2)} ${(iy - 8).toFixed(2)})`} className="lab-ring__icon">
                <Icon size={16} stroke={2} />
              </g>
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="lab-ring__label">{s.label}</text>
            </g>
          );
        })}
        <text x={C} y={C - 10} textAnchor="middle" className="lab-ring__now">{cur ? cur.label : "Ready"}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="lab-ring__time">{time}</text>
      </svg>
      {note ? <figcaption className="lab-ring__note">{note}</figcaption> : null}
    </figure>
  );
}
