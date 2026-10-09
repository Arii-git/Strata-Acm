"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader, Metric, DataTable, EmptyState, ErrorState, Loading, type ColumnDef } from "@/components/ui";
import { useApi } from "@/lib/api/client";
import { fmtDate, fmtDuration, fmtNum } from "@/lib/format";

interface TtaItem { ref: string; detected_wall_at: string; approved_wall_at: string; seconds: number }
interface SilentPeriod { ref: string; title: string; silent_period_days: number; basis: string }
interface TtaResponse {
  items: TtaItem[];
  median_seconds: number | null;
  n: number;
  manual_baseline_minutes: { value: number; provenance: "illustrative"; note?: string };
  silent_periods?: SilentPeriod[];
}

const refLink = (ref: string) => <Link className="mono" href={`/app/incidents/${ref}`} onClick={(e) => e.stopPropagation()}>{ref}</Link>;

export default function TimeToActionPage() {
  const { data, error, loading, reload } = useApi<TtaResponse>("/time-to-action");

  const itemCols = useMemo<ColumnDef<TtaItem>[]>(() => [
    { accessorKey: "ref", header: "Incident", cell: (c) => refLink(c.getValue<string>()) },
    { accessorKey: "detected_wall_at", header: "Detected (wall clock)", cell: (c) => fmtDate(c.getValue<string>(), true) },
    { accessorKey: "approved_wall_at", header: "Approved (wall clock)", cell: (c) => fmtDate(c.getValue<string>(), true) },
    { accessorKey: "seconds", header: "Signal → approval", meta: { numeric: true }, cell: (c) => fmtDuration(c.getValue<number>()) },
  ], []);

  const silentCols = useMemo<ColumnDef<SilentPeriod>[]>(() => [
    { accessorKey: "ref", header: "Incident", cell: (c) => refLink(c.getValue<string>()) },
    { accessorKey: "title", header: "Title" },
    { accessorKey: "silent_period_days", header: "Silent period (days)", meta: { numeric: true }, cell: (c) => fmtNum(c.getValue<number>()) },
    { accessorKey: "basis", header: "Basis", cell: (c) => <span className="caption">{c.getValue<string>()}</span> },
  ], []);

  if (loading && !data) return (<div className="stack"><PageHeader question="How fast do we get from signal to executing workflow?" title="Time-to-Action" /><Loading rows={6} /></div>);
  if (error || !data) return (<div className="stack"><PageHeader question="How fast do we get from signal to executing workflow?" title="Time-to-Action" /><ErrorState error={error} onRetry={reload} /></div>);

  const base = data.manual_baseline_minutes;
  return (
    <div className="stack">
      <PageHeader question="How fast do we get from signal to executing workflow?" title="Time-to-Action" />
      <div className="grid grid--2">
        <Metric
          label={`Strata: median signal → approval (n = ${data.n})`}
          value={data.median_seconds === null ? "n/a" : fmtDuration(data.median_seconds)}
          meaning={`Measured from wall-clock audit timestamps between detection and human approval, across ${data.n} approved plan${data.n === 1 ? "" : "s"}.`}
          implication={data.median_seconds === null ? "No plan has been approved yet, so there is nothing to measure. Approve a plan to produce the first data point." : "This includes the time a human spent reading the evidence and deciding. A small n is a demo, not a benchmark."}
          provenance="computed"
        />
        <Metric
          label="Manual baseline"
          value={`${fmtNum(base.value)} min`}
          meaning={base.note ?? "Reference figure for the manual process."}
          implication="This is an illustrative reference, not a measurement. Compare with care."
          provenance={base.provenance}
        />
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="No approved plans yet" body="Time-to-action is measured once a human approves an incident plan." action={<Link href="/app/approvals">Go to Approvals</Link>} />
      ) : (
        <DataTable
          columns={itemCols}
          data={data.items}
          provenance="computed"
          caption="What it is: for each approved plan, the wall-clock time from detection to human approval, read from the audit trail. What it implies: how quickly a signal becomes an executing workflow in this demo."
        />
      )}
      <DataTable
        columns={silentCols}
        data={data.silent_periods ?? []}
        provenance="assumption"
        emptyText="No silent periods computed."
        caption="What it is: how long each problem would have stayed invisible to a weekly manual review of order totals (stated assumption in the Basis column). What it implies: the head start early detection could give, under that assumption."
        initialSort={[{ id: "silent_period_days", desc: true }]}
      />
    </div>
  );
}
