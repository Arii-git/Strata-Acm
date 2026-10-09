"use client";

import { Suspense } from "react";
import Link from "next/link";
import { EmptyState, ErrorState, Loading, Metric, MetricGroup, PageTemplate, buttonClass } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import { STAGE_INDEX } from "@config/taxonomy";
import { ProblemFilters } from "@/components/features/problems/ProblemFilters";
import { ProblemTable } from "@/components/features/problems/ProblemTable";
import { useAgenticLevels } from "@/components/features/problems/levels";
import { sortProblems, type ProblemRow } from "@/components/features/problems/model";
import { NO_FILTERS, useProblemFilters } from "@/components/features/problems/useProblemFilters";
import { caseHref } from "@/components/features/workbench/pipeline";
import { useApi } from "@/lib/api/client";

/** Every case, as one calm list with the same filters and columns as the Problems list view. */
function CasesInner() {
  const { data, error, loading, reload } = useApi<{ items: ProblemRow[] }>("/incidents");
  const levels = useAgenticLevels();
  const { filters, setFilters, apply } = useProblemFilters();
  const items = data?.items ?? [];
  const rows = apply(items);

  const open = items.filter((i) => (STAGE_INDEX[i.stage] ?? 0) < STAGE_INDEX.outcome_recorded).length;
  const detected = items.filter((i) => i.stage === "detected").length;
  const waiting = items.filter((i) => i.stage === "awaiting_approval").length;
  const top = rows.length ? sortProblems(rows)[0] : null;

  const glance = items.length ? (
    <MetricGroup title="Where the cases stand">
      <Metric label="Open cases" value={fmtNum(open)} meaning="Not yet at Outcome recorded." implication="Each has an owner role." provenance="computed" />
      <Metric label="Not yet investigated" value={fmtNum(detected)} meaning="Still at Detected." implication="Open one and run the investigation." provenance="computed" tone={detected ? "elevated" : "default"} />
      <Metric label="Waiting for a decision" value={fmtNum(waiting)} meaning="A plan awaits approval." implication="Nothing happens until a person decides." provenance="computed" next={{ label: "Open approvals", href: "/app/approvals" }} />
    </MetricGroup>
  ) : undefined;

  const takeaway = !data ? "Loading cases…"
    : !items.length ? "No cases are open."
    : `${fmtNum(open)} open, ${fmtNum(waiting)} waiting for a decision${top ? `. Most urgent: ${top.ref}.` : "."}`;

  return (
    <PageTemplate
      explainKey="case"
      title="Cases"
      question="What is open, where does each case stand, and who owns it?"
      glance={glance}
      visual={{
        takeaway,
        node: loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
          <EmptyState title="No cases" body="The detector has not opened any cases for the current simulated window." />
        ) : (
          <div className="problems-view">
            <ProblemFilters rows={items} value={filters} onChange={setFilters} shown={rows.length} />
            {rows.length ? <ProblemTable rows={rows} levels={levels} /> : (
              <EmptyState title="No cases match these filters" action={<button type="button" className={buttonClass("secondary", "sm")} onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>} />
            )}
          </div>
        ),
      }}
      actions={top ? (
        <>
          <Link className={buttonClass("primary")} href={caseHref(top.ref, top.stage)}>Open {top.ref}</Link>
          <Link className={buttonClass("secondary")} href="/app/problems">Board by stage</Link>
        </>
      ) : undefined}
    />
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<Loading rows={8} label="Loading cases" />}>
      <CasesInner />
    </Suspense>
  );
}
