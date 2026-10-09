"use client";

import { Suspense } from "react";
import Link from "next/link";
import { CATEGORY, STAGE_INDEX, STAGES } from "@config/taxonomy";
import { ErrorState, Loading, PageTemplate, buttonClass } from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { AlertBudgetLine } from "@/components/features/problems/AlertBudgetLine";
import { ClassifyPanel } from "@/components/features/problems/ClassifyPanel";
import { ProblemBoard } from "@/components/features/problems/ProblemBoard";
import { ProblemFilters } from "@/components/features/problems/ProblemFilters";
import { ProblemTable } from "@/components/features/problems/ProblemTable";
import { ProblemsGlance } from "@/components/features/problems/ProblemsGlance";
import { useAgenticLevels } from "@/components/features/problems/levels";
import { sortProblems, type ProblemRow, type RisksPayload } from "@/components/features/problems/model";
import { NO_FILTERS, useProblemFilters } from "@/components/features/problems/useProblemFilters";
import { caseHref } from "@/components/features/workbench/pipeline";
import { qs, useApi } from "@/lib/api/client";
import { fmtINR, fmtNum } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";

function takeaway(all: ProblemRow[], shown: ProblemRow[]): string {
  if (all.length === 0) return "No open problems or opportunities right now.";
  if (shown.length === 0) return `None of the ${fmtNum(all.length)} problems match these filters.`;
  const top = sortProblems(shown)[0];
  const byStage = STAGES.map((s) => ({ s, n: shown.filter((r) => r.stage === s.key).length })).sort((a, b) => b.n - a.n || STAGE_INDEX[a.s.key] - STAGE_INDEX[b.s.key])[0];
  const stagePart = byStage.n === shown.length ? `All ${fmtNum(shown.length)} are at ${byStage.s.label}` : `Most are at ${byStage.s.label} (${fmtNum(byStage.n)} of ${fmtNum(shown.length)})`;
  return `${stagePart}. Start with ${top.ref}: ${(CATEGORY[top.category]?.label ?? top.category).toLowerCase()}, ${top.severity}, ${fmtINR(top.value_at_stake)} exposed.`;
}

function ProblemsInner() {
  const { persona } = usePersona();
  const { mode } = useViewMode();
  const incidents = useApi<{ items: ProblemRow[] }>("/incidents");
  const risks = useApi<RisksPayload>(qs("/risks", { persona }));
  const levels = useAgenticLevels();
  const { filters, setFilters, setParams, apply, sp } = useProblemFilters();

  const view = sp.get("view") === "list" ? "list" : "board";
  const showEmpty = sp.get("empty") === "1";
  const all = incidents.data?.items ?? [];
  const rows = apply(all);
  const top = rows.length ? sortProblems(rows)[0] : null;

  const viewToggle = (
    <div className="seg" role="group" aria-label="View">
      <button type="button" className="seg__btn" aria-pressed={view === "board"} onClick={() => setParams({ view: null })} data-testid="view-board">Board</button>
      <button type="button" className="seg__btn" aria-pressed={view === "list"} onClick={() => setParams({ view: "list" })} data-testid="view-list">List</button>
    </div>
  );

  const loading = incidents.loading && !incidents.data;
  const body = loading ? <Loading rows={8} label="Loading problems" />
    : incidents.error ? <ErrorState error={incidents.error} onRetry={incidents.reload} />
    : all.length === 0 ? (
      <ArtEmptyState art="customer" title="No open problems" body="When several systems move together, a problem appears here in Detected, already classified." />
    ) : (
      <div className="problems-view">
        <ProblemFilters rows={all} value={filters} onChange={setFilters} shown={rows.length} />
        <div className="problems-bar">
          <AlertBudgetLine data={risks.data} persona={persona} />
          {view === "board" ? (
            <label className="problems-bar__toggle">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setParams({ empty: e.target.checked ? "1" : null })} data-testid="show-empty-stages" />
              Show empty stages
            </label>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <ArtEmptyState
            art={filters.cats[0] ?? "customer"}
            title="No problems match these filters"
            body={filters.cats.length ? `Nothing open in ${filters.cats.map((c) => CATEGORY[c].label).join(", ")} at this severity and owner.` : "Widen the severity or owner filter to see more."}
            action={<button type="button" className={buttonClass("secondary", "sm")} onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}
          />
        ) : view === "list" ? <ProblemTable rows={rows} levels={levels} /> : <ProblemBoard rows={rows} showEmpty={showEmpty} levels={levels} />}
      </div>
    );

  return (
    <PageTemplate
      explainKey="problems"
      title="Problems"
      question="What needs attention, and where is each problem?"
      headerActions={viewToggle}
      glance={incidents.data && all.length ? <ProblemsGlance rows={all} /> : undefined}
      visual={{ takeaway: incidents.data ? takeaway(all, rows) : "Loading problems…", node: body }}
      actions={top ? (
        <>
          <Link className={buttonClass("primary")} href={caseHref(top.ref, top.stage)}>Open {top.ref}</Link>
          <Link className={buttonClass("secondary")} href="/app/approvals">Plans waiting for approval</Link>
          <Link className={buttonClass("ghost")} href="/app/risks">My ranked list</Link>
        </>
      ) : undefined}
    >
      <ClassifyPanel defaultOpen={mode === "detailed"} />
    </PageTemplate>
  );
}

export default function ProblemsPage() {
  return (
    <Suspense fallback={<Loading rows={8} label="Loading problems" />}>
      <ProblemsInner />
    </Suspense>
  );
}
