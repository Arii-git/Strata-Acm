"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Approval, ListResponse } from "@/lib/api/types";
import { qs, useApi } from "@/lib/api/client";
import { DataTable, EmptyState, ErrorState, Loading, Metric, PageHeader, SeverityPill, buttonClass, type ColumnDef } from "@/components/ui";
import { fmtINR, fmtNum } from "@/lib/format";
import { personaLabel, usePersona } from "@/lib/persona";

export default function ApprovalsPage() {
  const router = useRouter();
  const { persona, label } = usePersona();
  const { data, error, loading, reload } = useApi<ListResponse<Approval>>(qs("/approvals", { persona }));
  const items = useMemo(() => data?.items ?? [], [data]);

  const cols = useMemo<ColumnDef<Approval>[]>(() => [
    { id: "ref", header: "Ref", accessorKey: "ref" },
    { id: "title", header: "Title", accessorKey: "title" },
    { id: "severity", header: "Severity", accessorKey: "severity", cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "requires_role", header: "Requires", accessorKey: "requires_role", cell: (c) => personaLabel(c.row.original.requires_role) },
    { id: "four_eyes", header: "Four-eyes", accessorKey: "four_eyes", cell: (c) => (c.row.original.four_eyes ? "Yes, 2 approvers" : "No") },
    { id: "approvals_so_far", header: "Approvals so far", accessorKey: "approvals_so_far", meta: { numeric: true }, cell: (c) => `${c.row.original.approvals_so_far} of ${c.row.original.four_eyes ? 2 : 1}` },
    { id: "waiting_hours", header: "Waiting", accessorKey: "waiting_hours", meta: { numeric: true, help: "Decision debt: hours since the plan was proposed (simulated clock)" }, cell: (c) => `${fmtNum(c.row.original.waiting_hours, 1)} h` },
    { id: "value_at_stake", header: "Exposure", accessorKey: "value_at_stake", meta: { numeric: true }, cell: (c) => fmtINR(c.row.original.value_at_stake) },
  ], []);

  const totalExposure = items.reduce((s, a) => s + (a.value_at_stake || 0), 0);
  const maxWait = items.reduce((m, a) => Math.max(m, a.waiting_hours || 0), 0);
  const critical = items.filter((a) => a.severity === "critical").length;

  return (
    <div className="stack">
      <PageHeader question="What is waiting for a human decision, and for how long?" title="Approvals" />
      {loading && !data ? <Loading rows={6} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState
          title="Nothing waiting."
          body="Run an investigation from the Workbench to propose a plan."
          action={<Link href="/app/incidents" className={buttonClass("secondary", "sm")}>Open the Workbench</Link>}
        />
      ) : (
        <>
          <div className="grid grid--3">
            <Metric label="Plans waiting" value={fmtNum(items.length)} tone={critical ? "critical" : "default"} meaning={`Plans awaiting a decision visible to ${label}${critical ? `; ${critical} critical` : ""}.`} implication={critical ? "Critical plans waiting: decide now." : "Each one is blocked until a named human decides."} provenance="computed" />
            <Metric label="Longest wait" value={`${fmtNum(maxWait, 1)} h`} meaning="Decision debt: the oldest proposed plan's waiting time on the simulated clock." implication="Waiting time adds directly to time-to-action." provenance="computed" />
            <Metric label="Exposure waiting" value={fmtINR(totalExposure)} meaning="Sum of baseline 12-week order value behind the waiting plans." implication="Exposure, not predicted loss." provenance="computed" />
          </div>
          <DataTable
            columns={cols}
            data={items}
            provenance="computed"
            caption="What it is: every agent-proposed plan waiting for a human decision, with the role allowed to decide and how long it has waited (decision debt). What it implies: nothing executes until the required role approves; four-eyes plans need two different named approvers. Open a row to decide on its Plan tab."
            onRowClick={(r) => router.push(`/app/incidents/${encodeURIComponent(r.incident_id)}?tab=plan`)}
            initialSort={[{ id: "waiting_hours", desc: true }]}
          />
        </>
      )}
    </div>
  );
}
