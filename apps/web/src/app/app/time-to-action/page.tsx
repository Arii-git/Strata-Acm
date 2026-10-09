"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ChartFrame, DataTable, Details, EChart, ErrorState, Loading, Metric, MetricGroup, PageTemplate, buttonClass, chartColor, type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { useApi } from "@/lib/api/client";
import { fmtDate, fmtDuration, fmtNum } from "@/lib/format";
import { useViewMode } from "@/lib/viewmode";

interface TtaItem { ref: string; detected_wall_at: string; approved_wall_at: string; seconds: number }
interface SilentPeriod { ref: string; title: string; silent_period_days: number; basis: string }
interface TtaResponse {
  items: TtaItem[];
  median_seconds: number | null;
  n: number;
  manual_baseline_minutes: { value: number; provenance: "illustrative"; note?: string };
  silent_periods?: SilentPeriod[];
}

const TITLE = "Time-to-Action";
const QUESTION = "How fast do we get from signal to executing workflow?";
const refLink = (ref: string) => <Link className="mono" href={`/app/incidents/${ref}`} onClick={(e) => e.stopPropagation()}>{ref}</Link>;

function takeaway(d: TtaResponse): string {
  const sp = [...(d.silent_periods ?? [])].sort((a, b) => b.silent_period_days - a.silent_period_days);
  const longest = sp[0];
  const silentPart = longest ? `the longest silent period is ${fmtNum(longest.silent_period_days)} days (${longest.ref}, assumption-based)` : "";
  if (d.median_seconds === null || d.n === 0) {
    return `No plan approved yet, so time-to-action is not measured${silentPart ? `; ${silentPart}` : ""}.`;
  }
  const base = d.manual_baseline_minutes.value * 60;
  const cmp = d.median_seconds < base ? "faster than" : "slower than";
  return `Median signal-to-approval is ${fmtDuration(d.median_seconds)} over ${fmtNum(d.n)} plan${d.n === 1 ? "" : "s"}, ${cmp} the ${fmtNum(d.manual_baseline_minutes.value)}-minute illustrative baseline${silentPart ? `; ${silentPart}` : ""}.`;
}

export default function TimeToActionPage() {
  const { mode } = useViewMode();
  const open = mode === "detailed";
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

  if (loading && !data) return <PageTemplate explainKey="time-to-action" title={TITLE} question={QUESTION} visual={{ takeaway: "Loading…", node: <Loading rows={6} /> }} />;
  if (error || !data) return <PageTemplate explainKey="time-to-action" title={TITLE} question={QUESTION} visual={{ takeaway: "Time-to-action could not be loaded.", node: <ErrorState error={error} onRetry={reload} /> }} />;

  const base = data.manual_baseline_minutes;
  const silent = [...(data.silent_periods ?? [])].sort((a, b) => b.silent_period_days - a.silent_period_days);
  const longest = silent[0];

  return (
    <PageTemplate
      explainKey="time-to-action"
      title={TITLE}
      question={QUESTION}
      glance={
        <MetricGroup title="At a glance">
          <Metric
            id="time_to_action_median" label="STRATA: signal → approval" value={data.median_seconds === null ? "n/a" : fmtDuration(data.median_seconds)}
            unit="median" compare={`n = ${fmtNum(data.n)} approved plan${data.n === 1 ? "" : "s"}`}
            meaning={`Measured from wall-clock audit timestamps between detection and human approval, across ${data.n} approved plan${data.n === 1 ? "" : "s"}.`}
            implication={data.median_seconds === null ? "No plan has been approved yet, so there is nothing to measure. Approve a plan to produce the first data point." : "This includes the time a human spent reading the evidence and deciding. A small n is a demo, not a benchmark."}
            provenance="computed" next={{ label: "Plans waiting", href: "/app/approvals" }}
          />
          <Metric
            id="manual_baseline_minutes" label="Manual baseline" value={fmtNum(base.value)} unit="min"
            compare="reference only, not measured"
            meaning={base.note ?? "Reference figure for the manual process."}
            implication="This is an illustrative reference, not a measurement. Compare with care."
            provenance={base.provenance}
          />
          {longest ? (
            <Metric
              id="silent_period_days" label="Longest silent period" value={fmtNum(longest.silent_period_days)} unit="days"
              compare={`${longest.ref}; ${fmtNum(silent.length)} problems measured`}
              meaning="Days a problem existed before a weekly manual review of order totals would have caught it."
              implication="The head start early detection could give, under the stated assumption."
              provenance="assumption" next={{ label: `Open ${longest.ref}`, href: `/app/incidents/${longest.ref}` }}
            />
          ) : null}
        </MetricGroup>
      }
      visual={{
        takeaway: takeaway(data),
        node: silent.length ? (
          <ChartFrame
            title="Silent period per problem (days)"
            meaning="Days from estimated onset until a weekly manual review of order totals would flag it (assumption: flags a >25% month-on-month drop)."
            implication="Longer bars are problems a manual review would have found latest; that is the head start STRATA can give."
            provenance="assumption"
            height={Math.max(160, silent.length * 34 + 24)}
          >
            <EChart
              ariaLabel={`Silent period per problem: ${silent.map((s) => `${s.ref} ${fmtNum(s.silent_period_days)} days`).join(", ")}`}
              option={{
                grid: { left: 120, right: 64, top: 8, bottom: 8 },
                xAxis: { type: "value", show: false },
                yAxis: { type: "category", inverse: true, data: silent.map((s) => s.ref), axisTick: { show: false } },
                tooltip: { trigger: "item", formatter: (p: unknown) => { const s = silent[(p as { dataIndex: number }).dataIndex]; return `<b>${s.ref}</b>: ${fmtNum(s.silent_period_days)} days<br/>${s.title}`; }, extraCssText: "max-width:320px;white-space:normal;" },
                series: [{ type: "bar", barWidth: 16, data: silent.map((s) => s.silent_period_days), itemStyle: { color: chartColor(1) }, label: { show: true, position: "right", formatter: (p: { value?: unknown }) => `${fmtNum(Number(p.value))} d` } }],
              }}
            />
          </ChartFrame>
        ) : (
          <ArtEmptyState art="tasks" title="No silent periods computed" body="Silent periods appear for each detected problem once its onset can be estimated from the order history." />
        ),
      }}
      actions={
        <>
          <Link className={buttonClass("primary")} href="/app/approvals">Approve a plan to measure time-to-action</Link>
          <Link className={buttonClass("secondary")} href="/app/problems">Open the problems</Link>
        </>
      }
    >
      <Details title={`Approved plans (${fmtNum(data.items.length)})`} defaultOpen={open}>
        {data.items.length === 0 ? (
          <ArtEmptyState art="tasks" title="No approved plans yet" body="Time-to-action is measured once a human approves an incident plan: one row per plan, from detection to approval." action={<Link className={buttonClass("secondary", "sm")} href="/app/approvals">Go to Approvals</Link>} />
        ) : (
          <DataTable
            columns={itemCols}
            data={data.items}
            provenance="computed"
            caption="What it is: for each approved plan, the wall-clock time from detection to human approval, read from the audit trail. What it implies: how quickly a signal becomes an executing workflow in this demo."
          />
        )}
      </Details>
      <Details title={`Silent periods (${fmtNum(silent.length)})`} defaultOpen={open}>
        <DataTable
          columns={silentCols}
          data={data.silent_periods ?? []}
          provenance="assumption"
          emptyText="No silent periods computed."
          caption="What it is: how long each problem would have stayed invisible to a weekly manual review of order totals (stated assumption in the Basis column). What it implies: the head start early detection could give, under that assumption."
          initialSort={[{ id: "silent_period_days", desc: true }]}
        />
      </Details>
    </PageTemplate>
  );
}
