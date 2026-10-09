"use client";

import { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORY, STAGE_INDEX, STAGES, type CategoryKey } from "@config/taxonomy";
import { ErrorState, Loading, PageTemplate, buttonClass } from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { AlertBudgetLine } from "@/components/features/problems/AlertBudgetLine";
import { ClassifyPanel } from "@/components/features/problems/ClassifyPanel";
import { ProblemBoard } from "@/components/features/problems/ProblemBoard";
import { ProblemFilters, type ProblemFilterState } from "@/components/features/problems/ProblemFilters";
import { ProblemTable } from "@/components/features/problems/ProblemTable";
import { ProblemsGlance } from "@/components/features/problems/ProblemsGlance";
import { atLeast, scopeText, sortProblems, type ProblemRow, type RisksPayload } from "@/components/features/problems/model";
import { qs, useApi } from "@/lib/api/client";
import type { Severity } from "@/lib/api/types";
import { fmtINR, fmtNum } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";

const SEVS: Severity[] = ["critical", "high", "elevated", "watch", "healthy"];

function takeaway(all: ProblemRow[], shown: ProblemRow[]): string {
  if (all.length === 0) return "No open problems or opportunities right now.";
  if (shown.length === 0) return `None of the ${fmtNum(all.length)} problems match these filters.`;
  const top = sortProblems(shown)[0];
  const byStage = STAGES.map((s) => ({ s, n: shown.filter((r) => r.stage === s.key).length })).sort((a, b) => b.n - a.n || STAGE_INDEX[a.s.key] - STAGE_INDEX[b.s.key])[0];
  const stagePart = byStage.n === shown.length ? `all ${fmtNum(shown.length)} are at ${byStage.s.label}` : `${fmtNum(byStage.n)} of ${fmtNum(shown.length)} are at ${byStage.s.label}`;
  return `${stagePart}. Start with ${top.ref}: ${CATEGORY[top.category]?.label ?? top.category}, ${top.severity}, ${scopeText(top)}, ${fmtINR(top.value_at_stake)} exposed.`
    .replace(/^./, (c) => c.toUpperCase());
}

function ProblemsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { persona } = usePersona();
  const { mode } = useViewMode();
  const incidents = useApi<{ items: ProblemRow[] }>("/incidents");
  const risks = useApi<RisksPayload>(qs("/risks", { persona }));

  const view = sp.get("view") === "list" ? "list" : "board";
  const showEmpty = sp.get("empty") === "1";
  const filters: ProblemFilterState = useMemo(() => {
    const cats = (sp.get("cat") ?? "").split(",").filter((c): c is CategoryKey => c in CATEGORY);
    const ms = sp.get("minsev") ?? "";
    return { cats, minSev: (SEVS as string[]).includes(ms) ? (ms as Severity) : "", owner: sp.get("owner") ?? "" };
  }, [sp]);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [router, pathname, sp]);

  const setFilters = (f: ProblemFilterState) => setParams({ cat: f.cats.join(",") || null, minsev: f.minSev || null, owner: f.owner || null });

  const all = useMemo(() => incidents.data?.items ?? [], [incidents.data]);
  const rows = useMemo(
    () => all.filter((r) => (filters.cats.length === 0 || filters.cats.includes(r.category)) && atLeast(r.severity, filters.minSev) && (!filters.owner || r.owner_role === filters.owner)),
    [all, filters],
  );
  const top = rows.length ? sortProblems(rows)[0] : null;
  const filtered = rows.length !== all.length;

  const viewToggle = (
    <div className="seg" role="group" aria-label="View">
      <button type="button" className="seg__btn" aria-pressed={view === "board"} onClick={() => setParams({ view: null })} data-testid="view-board">Board view</button>
      <button type="button" className="seg__btn" aria-pressed={view === "list"} onClick={() => setParams({ view: "list" })} data-testid="view-list">List view</button>
    </div>
  );

  const loading = incidents.loading && !incidents.data;
  const body = loading ? <Loading rows={8} label="Loading problems" />
    : incidents.error ? <ErrorState error={incidents.error} onRetry={incidents.reload} />
    : all.length === 0 ? (
      <ArtEmptyState art="customer" title="No open problems" body="When Sentinel finds signals from several systems moving together, a problem appears here in the Detected column, already classified by category and owner." />
    ) : (
      <div className="stack" style={{ gap: "var(--sp-3)" }}>
        <ProblemFilters rows={all} value={filters} onChange={setFilters} />
        <div className="problems-bar">
          <AlertBudgetLine data={risks.data} persona={persona} />
          <span className="row" style={{ gap: "var(--sp-3)", flexWrap: "wrap" }}>
            {filtered ? <span className="caption" style={{ maxWidth: "none" }}>Showing {fmtNum(rows.length)} of {fmtNum(all.length)}</span> : null}
            {filtered ? <button type="button" className="link-button" onClick={() => setFilters({ cats: [], minSev: "", owner: "" })}>Clear filters</button> : null}
            {view === "board" ? (
              <label className="row caption" style={{ maxWidth: "none", minHeight: 44 }}>
                <input type="checkbox" checked={showEmpty} onChange={(e) => setParams({ empty: e.target.checked ? "1" : null })} data-testid="show-empty-stages" />
                Show empty stages
              </label>
            ) : null}
          </span>
        </div>
        {rows.length === 0 ? (
          <ArtEmptyState
            art={filters.cats[0] ?? "customer"}
            title="No problems match these filters"
            body={filters.cats.length ? `Nothing open in ${filters.cats.map((c) => CATEGORY[c].label).join(", ")} at this severity and owner. Problems of this kind appear here when the engine detects them.` : "Widen the severity or owner filter to see more."}
            action={<button type="button" className={buttonClass("secondary", "sm")} onClick={() => setFilters({ cats: [], minSev: "", owner: "" })}>Clear filters</button>}
          />
        ) : view === "list" ? <ProblemTable rows={rows} /> : <ProblemBoard rows={rows} showEmpty={showEmpty} />}
      </div>
    );

  return (
    <PageTemplate
      explainKey="problems"
      title="Problems board"
      question="What needs attention, and where is each problem in the workflow?"
      headerActions={viewToggle}
      glance={incidents.data && all.length ? <ProblemsGlance rows={all} /> : undefined}
      visual={{ takeaway: incidents.data ? takeaway(all, rows) : "Loading problems…", node: body }}
      actions={top ? (
        <>
          <Link className={buttonClass("primary")} href={`/app/incidents/${top.ref}`}>Open {top.ref}</Link>
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
