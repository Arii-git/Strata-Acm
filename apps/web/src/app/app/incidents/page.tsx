"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ListResponse } from "@/lib/api/types";
import { useApi } from "@/lib/api/client";
import {
  CategoryChip, DataTable, EmptyState, ErrorState, Loading, Metric, MetricGroup, PageTemplate, SeverityPill, StatusPill, type ColumnDef,
} from "@/components/ui";
import { fmtINR, fmtNum, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { CATEGORY, STAGES, STAGE_INDEX, type CategoryKey, type StageKey } from "@config/taxonomy";
import { isNotInvestigated, type WbIncidentSummary } from "@/components/features/workbench/shared";

function stageIdx(s: string): number {
  return STAGE_INDEX[s as StageKey] ?? 0;
}

export default function IncidentsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<ListResponse<WbIncidentSummary>>("/incidents");
  const items = useMemo(() => data?.items ?? [], [data]);

  const columns = useMemo<ColumnDef<WbIncidentSummary>[]>(() => [
    { id: "ref", header: "Ref", accessorKey: "ref" },
    { id: "title", header: "Case", accessorKey: "title", cell: (c) => <span>{c.row.original.title}</span> },
    {
      id: "category", header: "Category", accessorFn: (r) => CATEGORY[r.category as CategoryKey]?.label ?? r.category,
      cell: (c) => <CategoryChip category={c.row.original.category} size="sm" />,
    },
    { id: "severity", header: "Severity", accessorFn: (r) => r.risk_score, cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    {
      id: "stage", header: "Stage", accessorFn: (r) => stageIdx(r.stage),
      meta: { help: "Where the case is in the 7-step workflow: Detected → Investigating → Plan ready → Awaiting approval → In progress → Outcome recorded → Learned" },
      cell: (c) => {
        const i = stageIdx(c.row.original.stage);
        return <span><b>{STAGES[i].label}</b> <span className="caption">step {i + 1} of {STAGES.length}</span></span>;
      },
    },
    { id: "risk_score", header: "Risk", accessorKey: "risk_score", meta: { numeric: true, help: "0–100: independent signals combined (noisy-OR) and scaled by how many systems agree" }, cell: (c) => fmtNum(c.row.original.risk_score) },
    { id: "value_at_stake", header: "₹ exposed", accessorKey: "value_at_stake", meta: { numeric: true, help: "Baseline 12-week order value: exposure, not a forecast" }, cell: (c) => fmtINR(c.row.original.value_at_stake) },
    {
      id: "cause", header: "Cause", accessorFn: (r) => r.cause ?? "",
      cell: (c) => isNotInvestigated(c.row.original.cause) ? <span className="muted">not yet investigated</span> : humanize(c.row.original.cause),
    },
    { id: "owner_role", header: "Owner", accessorKey: "owner_role", cell: (c) => personaLabel(c.row.original.owner_role) },
    {
      id: "qa", header: "QA-routed", accessorFn: (r) => (r.regulatory_sensitive ? 1 : 0),
      cell: (c) => c.row.original.regulatory_sensitive ? <StatusPill status="qa" tone="warn" label="QA Head route-only" /> : <span className="muted">no</span>,
    },
  ], []);

  const open = items.filter((i) => stageIdx(i.stage) < STAGE_INDEX.outcome_recorded).length;
  const detected = items.filter((i) => i.stage === "detected").length;
  const waiting = items.filter((i) => i.stage === "awaiting_approval").length;

  const glance = items.length ? (
    <MetricGroup title="Where the open cases stand">
      <Metric label="Open cases" value={fmtNum(open)} meaning="Cases not yet at 'Outcome recorded'." implication="Each one has a named owner role below." provenance="computed" />
      <Metric label="Not yet investigated" value={fmtNum(detected)} meaning="Cases still at the Detected stage." implication="Open one and run the investigation to get a cause and a plan." provenance="computed" tone={detected ? "elevated" : "default"} />
      <Metric label="Waiting for a decision" value={fmtNum(waiting)} meaning="Cases with a plan awaiting approval." implication="Nothing happens until a named person approves." provenance="computed" next={{ label: "Open approvals", href: "/app/approvals" }} />
    </MetricGroup>
  ) : undefined;

  return (
    <PageTemplate explainKey="case" title="Cases" question="What is open, where is each case in the workflow, and who owns it?" glance={glance}>
      {loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState title="No cases" body="The detector has not opened any cases for the current simulated window." />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          provenance="computed"
          caption="What it is: every case the detector opened, with its category, workflow stage and owner. What it implies: the owner role is accountable for the next step; 'not yet investigated' rows have no cause yet. Open a row for the case file."
          onRowClick={(r) => router.push(`/app/incidents/${encodeURIComponent(r.id)}`)}
          initialSort={[{ id: "risk_score", desc: true }]}
        />
      )}
    </PageTemplate>
  );
}
