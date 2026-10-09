"use client";

import Link from "next/link";
import {
  ChartFrame,
  DataTable,
  Details,
  EChart,
  ErrorState,
  Loading,
  Metric,
  MetricGroup,
  PageTemplate,
  SeverityPill,
  buttonClass,
  chartColor,
  type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { useApi } from "@/lib/api/client";
import type { Provenance, Severity } from "@/lib/api/types";
import { fmtDate, fmtINR, fmtNum, fmtPct } from "@/lib/format";
import { useViewMode } from "@/lib/viewmode";

interface Pillar { key: string; label: string; value: number; delta_4w: number | null; meaning: string; implication: string; provenance: Provenance }
interface Mover { account_id: number | string; account_name: string; signal_key: string; label: string; delta: number; severity: Severity; ref?: string }
interface MixRow { type: string; label: string; count: number; value_12w: number }
interface HealthLive {
  index: { value: number; delta_4w: number | null; provenance: Provenance };
  pillars: Pillar[];
  movers: Mover[];
  activity: { weeks: string[]; orders: number[]; tickets: number[]; visits: number[] };
  mix: MixRow[];
}

const fmtDelta = (d: number | null) => (d === null || d === undefined ? "n/a, point-in-time" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtNum(Math.abs(d), 1)} pts 4w`);
const changeWord = (d: number | null) => (d === null ? "no 4-week comparison" : d < 0 ? `down ${fmtNum(Math.abs(d), 1)} in 4 weeks` : d > 0 ? `up ${fmtNum(d, 1)} in 4 weeks` : "unchanged in 4 weeks");

function takeaway(d: HealthLive): string {
  const withDelta = d.pillars.filter((p) => typeof p.delta_4w === "number");
  const fell = [...withDelta].sort((a, b) => (a.delta_4w as number) - (b.delta_4w as number))[0];
  const lowest = [...d.pillars].sort((a, b) => a.value - b.value)[0];
  const parts: string[] = [];
  if (fell && (fell.delta_4w as number) < 0) parts.push(`${fell.label} fell most: ${fmtNum(fell.value, 1)}, ${changeWord(fell.delta_4w)}`);
  if (lowest && lowest !== fell) parts.push(`${lowest.label} is lowest at ${fmtNum(lowest.value, 1)}`);
  if (!parts.length) return `Business Health is ${fmtNum(d.index.value, 1)} of 100; no pillar fell in the last 4 weeks.`;
  return `${parts.join("; ")}.`;
}

export default function HealthPage() {
  const { mode } = useViewMode();
  const open = mode === "detailed";
  const { data, error, loading, reload } = useApi<HealthLive>("/portfolio/health");

  const moverCols: ColumnDef<Mover>[] = [
    { id: "account_name", accessorKey: "account_name", header: "Account", cell: (c) => <Link href={`/app/accounts/${c.row.original.account_id}`}>{c.row.original.account_name}</Link> },
    { id: "label", accessorKey: "label", header: "Signal" },
    { id: "delta", accessorKey: "delta", header: "Change vs normal", meta: { numeric: true }, cell: (c) => fmtPct(c.row.original.delta) },
    { id: "severity", accessorKey: "severity", header: "Severity", cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "ref", accessorKey: "ref", header: "Incident", cell: (c) => (c.row.original.ref ? <Link href={`/app/incidents/${c.row.original.ref}`}>{c.row.original.ref}</Link> : "—") },
  ];
  const mixCols: ColumnDef<MixRow>[] = [
    { id: "label", accessorKey: "label", header: "Account type" },
    { id: "count", accessorKey: "count", header: "Accounts", meta: { numeric: true } },
    { id: "value_12w", accessorKey: "value_12w", header: "12-week order value", meta: { numeric: true }, cell: (c) => fmtINR(c.row.original.value_12w) },
  ];
  const pillarCols: ColumnDef<Pillar>[] = [
    { id: "label", accessorKey: "label", header: "Pillar" },
    { id: "value", accessorKey: "value", header: "Score (of 100)", meta: { numeric: true }, cell: (c) => fmtNum(c.row.original.value, 1) },
    { id: "delta_4w", accessorFn: (p) => p.delta_4w ?? 0, header: "Change, 4 weeks", meta: { numeric: true }, cell: (c) => fmtDelta(c.row.original.delta_4w) },
    { id: "meaning", accessorKey: "meaning", header: "What it measures", enableSorting: false, cell: (c) => <span className="caption">{c.row.original.meaning}</span> },
    { id: "implication", accessorKey: "implication", header: "What a fall implies", enableSorting: false, cell: (c) => <span className="caption">{c.row.original.implication}</span> },
  ];

  const title = "Business Health";
  const question = "Is the business healthy right now, and what is dragging it?";
  if (loading && !data) return <PageTemplate explainKey="health" title={title} question={question} visual={{ takeaway: "Loading…", node: <Loading rows={6} /> }} />;
  if (error) return <PageTemplate explainKey="health" title={title} question={question} visual={{ takeaway: "Health could not be loaded.", node: <ErrorState error={error} onRetry={reload} /> }} />;
  if (!data || !data.pillars?.length) {
    return <PageTemplate explainKey="health" title={title} question={question} visual={{ takeaway: "No health data yet.", node: <ArtEmptyState art="data" title="No health data" body="Business Health appears once the engine has read at least 4 weeks of orders, support, field and finance data." /> }} />;
  }

  const lowest = [...data.pillars].sort((a, b) => a.value - b.value)[0];
  const withDelta = data.pillars.filter((p) => typeof p.delta_4w === "number");
  const fell = [...withDelta].sort((a, b) => (a.delta_4w as number) - (b.delta_4w as number))[0];

  return (
    <PageTemplate
      explainKey="health"
      title={title}
      question={question}
      glance={
        <MetricGroup title="At a glance">
          <Metric
            id="business_health_index" label="Business Health Index" value={fmtNum(data.index.value, 1)} unit="of 100"
            compare={data.index.delta_4w === null ? "no 4-week comparison" : `vs 4 weeks ago: ${fmtDelta(data.index.delta_4w)}`}
            provenance={data.index.provenance}
            meaning="Mean of the five pillars, each scaled 0–100."
            implication="A falling index means at least one pillar is slipping; the bars show which one."
            next={{ label: "Problems behind it", href: "/app/problems" }}
          />
          <Metric
            id="pillar_lowest" label={`Lowest pillar: ${lowest.label}`} value={fmtNum(lowest.value, 1)} unit="of 100"
            compare={lowest.delta_4w === null ? "no 4-week comparison" : `vs 4 weeks ago: ${fmtDelta(lowest.delta_4w)}`}
            provenance={lowest.provenance} meaning={lowest.meaning} implication={lowest.implication}
            tone={lowest.value < 60 ? "elevated" : "default"}
            next={{ label: "Accounts by risk", href: "/app/accounts" }}
          />
          {fell ? (
            <Metric
              id="pillar_biggest_fall" label={`Fell most: ${fell.label}`} value={fmtNum(fell.value, 1)} unit="of 100"
              compare={`vs 4 weeks ago: ${fmtDelta(fell.delta_4w)}`}
              provenance={fell.provenance} meaning={fell.meaning} implication={fell.implication}
              next={{ label: "Problems behind it", href: "/app/problems" }}
            />
          ) : null}
        </MetricGroup>
      }
      visual={{
        takeaway: takeaway(data),
        node: (
          <ChartFrame
            title="Five pillars"
            meaning="Each pillar is a 0–100 score computed from the last 4 weeks of source data."
            implication="The shortest bar is what is dragging the index; hover for its definition."
            provenance="computed"
            height={240}
          >
            <EChart
              ariaLabel={`Pillar scores: ${data.pillars.map((p) => `${p.label} ${fmtNum(p.value, 1)}`).join(", ")}`}
              option={{
                grid: { left: 170, right: 170, top: 8, bottom: 8 },
                xAxis: { type: "value", min: 0, max: 100, show: false },
                yAxis: { type: "category", inverse: true, data: data.pillars.map((p) => p.label), axisTick: { show: false } },
                tooltip: {
                  trigger: "item",
                  formatter: (p: unknown) => {
                    const pl = data.pillars[(p as { dataIndex: number }).dataIndex];
                    return `<b>${pl.label}</b>: ${fmtNum(pl.value, 1)}<br/>${pl.meaning}<br/><i>${pl.implication}</i>`;
                  },
                  extraCssText: "max-width:320px;white-space:normal;",
                },
                series: [{
                  type: "bar",
                  barWidth: 18,
                  data: data.pillars.map((p) => ({ value: p.value, itemStyle: { color: p.value < 60 ? "var(--sev-high-fg)" : chartColor(1) } })),
                  label: {
                    show: true,
                    position: "right",
                    formatter: (p: { dataIndex: number }) => {
                      const pl = data.pillars[p.dataIndex];
                      return `${fmtNum(pl.value, 1)}  (${fmtDelta(pl.delta_4w)})${pl.value < 60 ? "  low" : ""}`;
                    },
                  },
                }],
              }}
            />
          </ChartFrame>
        ),
      }}
      actions={
        <>
          <Link className={buttonClass("primary")} href="/app/problems">Open the problems behind it</Link>
          {data.movers[0]?.ref ? <Link className={buttonClass("secondary")} href={`/app/incidents/${data.movers[0].ref}`}>Biggest mover: {data.movers[0].ref}</Link> : null}
          <Link className={buttonClass("ghost")} href="/app/sources">Check the data is fresh</Link>
        </>
      }
    >
      <Details title="The five pillars in detail" defaultOpen={open}>
        <DataTable columns={pillarCols} data={data.pillars} provenance="computed" caption="Each pillar's score, its 4-week change, what it measures and what a fall implies. 'n/a, point-in-time' means no earlier value was computed for that pillar." />
      </Details>
      <Details title="What moved most" defaultOpen={open}>
        <DataTable
          columns={moverCols}
          data={data.movers}
          provenance="computed"
          caption="Accounts whose strongest signal moved furthest from their own normal. Each links to the incident that groups the evidence."
          emptyText="No large movements this week."
        />
      </Details>
      <Details title="Activity, last 12 weeks" defaultOpen={open}>
        <ChartFrame
          title="Activity, last 12 weeks"
          meaning="Weekly units ordered (hundreds), support tickets and field visits across the portfolio."
          implication="Flat lines with a dip in one series point to where the slowdown sits."
          provenance="computed"
        >
          <EChart
            ariaLabel="Weekly orders, tickets and visits"
            option={{
              grid: { left: 48, right: 140, top: 16, bottom: 28 },
              xAxis: { type: "category", data: data.activity.weeks.map((w) => fmtDate(w)) },
              yAxis: { type: "value" },
              tooltip: { trigger: "axis" },
              series: ([
                ["Units ordered (00s)", data.activity.orders.map((v) => Math.round(v / 100)), 1],
                ["Tickets", data.activity.tickets, 2],
                ["Visits", data.activity.visits, 3],
              ] as const).map(([name, values, c]) => ({
                name,
                type: "line",
                showSymbol: false,
                data: values,
                lineStyle: { color: chartColor(c) },
                itemStyle: { color: chartColor(c) },
                endLabel: { show: true, formatter: name },
              })),
            }}
          />
        </ChartFrame>
      </Details>
      <Details title="Account-type mix" defaultOpen={open}>
        <DataTable
          columns={mixCols}
          data={data.mix}
          provenance="computed"
          caption="Accounts and baseline 12-week order value by channel type. Shows where the business is concentrated, so a problem in one type can be sized."
        />
      </Details>
    </PageTemplate>
  );
}
