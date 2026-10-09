"use client";

import { STAGES } from "@config/taxonomy";
import { ProblemCard } from "./ProblemCard";
import { sortProblems, type ProblemRow } from "./model";
import type { LevelItem } from "./levels";

/** One column per workflow stage. Empty stages are hidden unless `showEmpty`. Cards: severity, then ₹ exposed. */
export function ProblemBoard({ rows, showEmpty, levels }: { rows: ProblemRow[]; showEmpty: boolean; levels?: Map<string, LevelItem> | null }) {
  const cols = STAGES.map((s) => ({ stage: s, items: sortProblems(rows.filter((r) => r.stage === s.key)) }))
    .filter((c) => showEmpty || c.items.length > 0);
  const single = cols.length === 1;
  return (
    <div className={`problem-board${single ? " problem-board--single" : ""}`} data-testid="problem-board" style={{ ["--board-cols" as string]: String(Math.max(cols.length, 1)) }}>
      {cols.map(({ stage, items }) => (
        <section key={stage.key} className="problem-board__col" aria-label={`${stage.label}: ${items.length} problem${items.length === 1 ? "" : "s"}`} data-stage={stage.key}>
          <header className="problem-board__head" title={`${stage.meaning} Next: ${stage.next}`}>
            <h3 className="problem-board__title">{stage.label}</h3>
            <span className="problem-board__count num" aria-hidden="true">{items.length}</span>
          </header>
          {items.length === 0 ? (
            <p className="caption problem-board__empty">Nothing here.</p>
          ) : (
            <div className="problem-board__cards">
              {items.map((p) => <ProblemCard key={p.ref} p={p} level={levels?.get(p.ref) ?? null} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
