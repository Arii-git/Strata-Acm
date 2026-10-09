"use client";

import "@/styles/lanes/agentic.css";
import { ProvenanceBadge } from "@/components/ui";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { LEVELS, type RiskLevel } from "./types";

/**
 * Counts per risk level as one compact strip. Each tile is a toggle when `onSelect` is given (filters a list).
 * Counts come straight from the engine (/agentic/levels counts), so the provenance is "computed".
 */
export function LevelStrip({ counts, selected, onSelect, caption }: {
  counts: Record<string, number>;
  selected?: RiskLevel | null;
  onSelect?: (lv: RiskLevel | null) => void;
  caption?: string;
}) {
  const total = LEVELS.reduce((s, lv) => s + (counts[String(lv)] ?? 0), 0);
  return (
    <section className="lvl-strip" aria-label="Open cases per risk level">
      <div className="lvl-strip__head">
        <h2 className="section-label">By risk level</h2>
        <ProvenanceBadge provenance="computed" />
      </div>
      <ul className="lvl-strip__tiles">
        {LEVELS.slice().reverse().map((lv) => {
          const n = counts[String(lv)] ?? 0;
          const pct = total ? Math.round((100 * n) / total) : 0;
          const body = (
            <>
              <RiskLevelBadge level={lv} />
              <span className="lvl-strip__n mono">{n}</span>
              <span className="lvl-strip__meter" aria-hidden="true"><span className={`lvl-strip__fill rl--${lv}`} style={{ width: `${pct}%` }} /></span>
            </>
          );
          return (
            <li key={lv}>
              {onSelect ? (
                <button type="button" className="lvl-strip__tile" aria-pressed={selected === lv}
                  onClick={() => onSelect(selected === lv ? null : lv)}
                  aria-label={`Level ${lv}: ${n} case${n === 1 ? "" : "s"}. ${selected === lv ? "Showing only this level; press to show all." : "Press to show only this level."}`}>
                  {body}
                </button>
              ) : <div className="lvl-strip__tile">{body}</div>}
            </li>
          );
        })}
      </ul>
      <p className="caption">{caption ?? "Open cases by risk level (1 Low to 5 Critical), from Risk Triage. From level 2 a human is asked first."}</p>
    </section>
  );
}
