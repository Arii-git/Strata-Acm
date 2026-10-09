"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ListResponse } from "@/lib/api/types";
import { useApi } from "@/lib/api/client";
import { DataTable, EmptyState, ErrorState, Loading, Metric, PageHeader, SeverityPill, StatusPill, type ColumnDef } from "@/components/ui";
import { fmtNum, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { isNotInvestigated, type WbIncidentSummary } from "@/components/features/workbench/shared";

export default function IncidentsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<ListResponse<WbIncidentSummary>>("/incidents");
  const items = useMemo(() => data?.items ?? [], [data]);

  const columns = useMemo<ColumnDef<WbIncidentSummary>[]>(() => [
    { id: "ref", header: "Ref", accessorKey: "ref" },
    { id: "title", header: "Title", accessorKey: "title", cell: (c) => <span>{c.row.original.title}</span> },
    { id: "kind", header: "Kind", accessorKey: "kind", cell: (c) => humanize(c.row.original.kind) },
    { id: "severity", header: "Severity", accessorFn: (r) => r.risk_score, cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "risk_score", header: "Risk", accessorKey: "risk_score", meta: { numeric: true, help: "Noisy-OR of independent signals x source-diversity factor (0-100)" }, cell: (c) => fmtNum(c.row.original.risk_score) },
    { id: "n_sources", header: "Sources", accessorKey: "n_sources", meta: { numeric: true }, cell: (c) => <span title={c.row.original.sources.join(", ")}>{c.row.original.n_sources}</span> },
    { id: "status", header: "Status", accessorKey: "status", cell: (c) => <StatusPill status={c.row.original.status} /> },
    {
      id: "cause", header: "Cause", accessorFn: (r) => r.cause ?? "",
      cell: (c) => isNotInvestigated(c.row.original.cause) ? <span className="muted">not yet investigated</span> : humanize(c.row.original.cause),
    },
    { id: "owner_role", header: "Owner", accessorKey: "owner_role", cell: (c) => personaLabel(c.row.original.owner_role) },
    {
      id: "qa", header: "QA-routed", accessorFn: (r) => (r.regulatory_sensitive ? 1 : 0),
      cell: (c) => c.row.original.regulatory_sensitive ? <StatusPill status="qa" tone="warn" label="QA Head route-only" /> : <span className="muted">-</span>,
    },
  ], []);

  const open = items.filter((i) => !["closed", "resolved"].includes(i.status)).length;
  const uninvestigated = items.filter((i) => isNotInvestigated(i.cause)).length;
  const qa = items.filter((i) => i.regulatory_sensitive).length;

  return (
    <div className="stack">
      <PageHeader question="What is open and who owns it?" title="Incident Workbench" />
      {loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState title="No incidents" body="The detector has not opened any incidents for the current simulated window." />
      ) : (
        <>
          <div className="grid grid--3">
            <Metric label="Open incidents" value={fmtNum(open)} meaning="Incidents not yet closed or resolved." implication="Each one has a named owner role below." provenance="computed" />
            <Metric label="Not yet investigated" value={fmtNum(uninvestigated)} meaning="Incidents with no agent investigation run yet." implication="Open one and run the investigation to get a cause and a plan." provenance="computed" tone={uninvestigated ? "elevated" : "default"} />
            <Metric label="QA-routed" value={fmtNum(qa)} meaning="Regulatory-sensitive incidents routed to the QA Head." implication="Route-only: Strata proposes no clinical action on these." provenance="computed" />
          </div>
          <DataTable
            columns={columns}
            data={items}
            provenance="computed"
            caption="What it is: every incident the detector opened, ranked by risk. What it implies: the owner role is accountable for the next step; 'not yet investigated' rows have no cause yet. Open a row for evidence, cause, memory and plan."
            onRowClick={(r) => router.push(`/app/incidents/${encodeURIComponent(r.id)}`)}
            initialSort={[{ id: "risk_score", desc: true }]}
          />
        </>
      )}
    </div>
  );
}
