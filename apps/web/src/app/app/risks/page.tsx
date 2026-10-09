"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import {
  DataTable, Details, ErrorState, Loading, Metric, MetricGroup, PageTemplate, buttonClass, type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { AlertBudgetLine } from "@/components/features/problems/AlertBudgetLine";
import { ClassifyPanel } from "@/components/features/problems/ClassifyPanel";
import { ProblemFilters } from "@/components/features/problems/ProblemFilters";
import { ProblemTable } from "@/components/features/problems/ProblemTable";
import { useAgenticLevels } from "@/components/features/problems/levels";
import { scopeText, type ProblemRow, type RisksPayload } from "@/components/features/problems/model";
import { useProblemFilters } from "@/components/features/problems/useProblemFilters";
import { caseHref } from "@/components/features/workbench/pipeline";
import { CATEGORY } from "@config/taxonomy";
import { qs, useApi } from "@/lib/api/client";
import type { Kind } from "@/lib/api/types";
import { fmtINR, fmtNum, humanize } from "@/lib/format";
import { personaLabel, usePersona } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";

const causeText = (r: ProblemRow) => (!r.cause || r.cause === "not_investigated" ? "not yet investigated" : humanize(r.cause));

const RANK_COLS: ColumnDef<ProblemRow>[] = [
  { id: "ref", accessorKey: "ref", header: "Ref", cell: (c) => <Link className="mono" href={caseHref(c.row.original.ref, c.row.original.stage)}>{c.row.original.ref}</Link> },
  { id: "risk_score", accessorKey: "risk_score", header: "Risk score", meta: { numeric: true, help: "0–100: independent signals combined; one system alone stays at or below elevated." } },
  { id: "sources", accessorKey: "n_sources", header: "Systems agreeing", cell: (c) => `${c.row.original.n_sources} · ${c.row.original.sources.join(", ")}` },
  {
    id: "driver", accessorKey: "driver", header: "Driver / cause",
    cell: (c) => (
      <span className="stack" style={{ gap: 0 }}>
        <span>likely driver: {c.row.original.driver}</span>
        <span className="caption">cause: {causeText(c.row.original)}</span>
      </span>
    ),
  },
  { id: "regulatory", accessorKey: "regulatory_sensitive", header: "Routing", cell: (c) => (c.row.original.regulatory_sensitive ? "QA only (regulatory)" : "Normal") },
  { id: "rank_score", accessorKey: "rank_score", header: "Rank score", meta: { numeric: true, help: "exposure × confidence × urgency" }, cell: (c) => fmtNum(c.row.original.rank_score) },
];

function RisksInner() {
  const { persona } = usePersona();
  const { mode } = useViewMode();
  const { data, error, loading, reload } = useApi<RisksPayload>(qs("/risks", { persona }));
  const levels = useAgenticLevels();
  const { filters, setFilters, apply } = useProblemFilters();
  const [kind, setKind] = useState<"" | Kind>("");

  const byKind = (data?.items ?? []).filter((r) => !kind || r.kind === kind);
  const rows = apply(byKind);
  const top = data?.items[0] ?? null;
  const hot = (data?.items ?? []).filter((r) => r.severity === "critical" || r.severity === "high").length;
  const role = personaLabel(persona);

  const takeaway = !data ? "Loading your list…"
    : data.items.length === 0 ? `Nothing on the list for ${role} today.`
    : `Top of the ${role} list: ${top!.ref}, ${(CATEGORY[top!.category]?.label ?? top!.category).toLowerCase()}, ${scopeText(top!)}, ${fmtINR(top!.value_at_stake)} exposed.`;

  return (
    <PageTemplate
      explainKey="risks"
      title="Ranked list"
      question="Which items need my action, in what order?"
      headerActions={
        <label className="problems-bar__toggle">
          Show
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as "" | Kind)}>
            <option value="">Everything</option>
            <option value="risk">Problems</option>
            <option value="opportunity">Opportunities</option>
          </select>
        </label>
      }
      glance={data && data.total > 0 ? (
        <MetricGroup title="Your list today">
          <Metric
            id="alert_shown" label="Shown to you" value={fmtNum(data.shown)} unit={`of ${fmtNum(data.budget)} budget`}
            compare={`${fmtNum(data.total)} ranked for ${role}`}
            meaning="Items left after the daily Alert Budget."
            implication="Work them top to bottom."
            provenance="computed" next={{ label: "Open the top item", href: top ? caseHref(top.ref, top.stage) : "/app/problems" }}
          />
          <Metric
            id="alert_held_back" label="Held back" value={fmtNum(data.held_back.length)}
            meaning="Ranked for this role but over today's budget."
            implication={data.held_back.length ? "Still on the Problems board." : "Everything fits."}
            provenance="computed" next={{ label: "See all on the board", href: "/app/problems" }}
          />
          <Metric
            id="critical_high" label="Critical or high" value={fmtNum(hot)} unit={`of ${fmtNum(data.shown)}`}
            meaning="Items at the top two severity levels."
            implication={hot ? "Open these first." : "Nothing urgent for this role."}
            provenance="computed" tone={hot ? "critical" : "default"} next={{ label: "Show on the board", href: "/app/problems?view=list&minsev=high" }}
          />
        </MetricGroup>
      ) : undefined}
      visual={{
        takeaway,
        node: loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
          <ArtEmptyState art="customer" title={`No items for ${role}`} body="Items appear once the Alert Budget ranks them for this role. Switch role in the top bar, or open the board." action={<Link className={buttonClass("secondary", "sm")} href="/app/problems">Open the Problems board</Link>} />
        ) : (
          <div className="problems-view">
            <ProblemFilters rows={byKind} value={filters} onChange={setFilters} shown={rows.length} />
            <AlertBudgetLine data={data} persona={persona} />
            <ProblemTable rows={rows} levels={levels} caption="This role's ranked list (exposure × confidence × urgency). ₹ exposed is the scope's normal 12-week order value: exposure, not a forecast of loss." emptyText="No items match." />
          </div>
        ),
      }}
      actions={top ? (
        <>
          <Link className={buttonClass("primary")} href={caseHref(top.ref, top.stage)}>Open {top.ref}</Link>
          <Link className={buttonClass("secondary")} href="/app/problems">Board by stage</Link>
        </>
      ) : undefined}
    >
      {data && data.items.length ? (
        <Details title="Why each item is ranked here" defaultOpen={mode === "detailed"}>
          <DataTable
            columns={RANK_COLS}
            data={rows}
            provenance="computed"
            caption="Risk score, how many systems agree, the likely driver and the ranking score. The cause stays 'not yet investigated' until the Investigator runs."
            initialSort={[{ id: "rank_score", desc: true }]}
          />
        </Details>
      ) : null}
      <ClassifyPanel defaultOpen={mode === "detailed"} />
    </PageTemplate>
  );
}

export default function RisksPage() {
  return (
    <Suspense fallback={<Loading rows={8} label="Loading your list" />}>
      <RisksInner />
    </Suspense>
  );
}
