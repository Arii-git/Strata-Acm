"use client";

import Link from "next/link";
import {
  Card,
  ChartFrame,
  DataTable,
  EChart,
  EmptyState,
  ErrorState,
  Loading,
  Metric,
  PageHeader,
  SeverityPill,
  chartColor,
  type ColumnDef,
} from "@/components/ui";
import { useApi } from "@/lib/api/client";
import type { Provenance, Severity } from "@/lib/api/types";
import { fmtDate, fmtINR, fmtNum, fmtPct } from "@/lib/format";

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

export default function HealthPage() {
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

  return (
    <>
      <PageHeader question="Is the business healthy right now, and what is dragging it?" title="Business Health" />
      {loading && !data ? <Loading rows={6} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data ? (
        <EmptyState title="No health data" body="The engine returned no portfolio health." />
      ) : (
        <div className="stack">
          <div className="grid grid--3">
            <Metric
              label="Business Health Index"
              value={fmtNum(data.index.value, 1)}
              delta={fmtDelta(data.index.delta_4w)}
              deltaTone={data.index.delta_4w === null ? "neutral" : data.index.delta_4w < 0 ? "down" : "up"}
              provenance={data.index.provenance}
              meaning="Mean of the five pillars below, each scaled 0-100."
              implication="A falling index means at least one pillar is slipping; the bars show which one."
            />
            <div style={{ gridColumn: "span 2" }}>
              <ChartFrame
                title="Five pillars"
                meaning="Each pillar is a 0-100 score computed from the last 4 weeks of source data."
                implication="The shortest bar is what is dragging the index; hover for its definition."
                provenance="computed"
                height={220}
              >
                <EChart
                  ariaLabel="Pillar scores"
                  option={{
                    grid: { left: 150, right: 140, top: 8, bottom: 8 },
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
                      barWidth: 16,
                      data: data.pillars.map((p) => ({ value: p.value, itemStyle: { color: p.value < 60 ? "var(--sev-high-fg)" : chartColor(1) } })),
                      label: {
                        show: true,
                        position: "right",
                        formatter: (p: { dataIndex: number }) => {
                          const pl = data.pillars[p.dataIndex];
                          return `${fmtNum(pl.value, 1)}  (${fmtDelta(pl.delta_4w)})`;
                        },
                      },
                    }],
                  }}
                />
              </ChartFrame>
            </div>
          </div>

          <div className="grid grid--3">
            {data.pillars.map((p) => (
              <Metric
                key={p.key}
                label={p.label}
                value={fmtNum(p.value, 1)}
                delta={fmtDelta(p.delta_4w)}
                deltaTone={p.delta_4w === null ? "neutral" : p.delta_4w < 0 ? "down" : "up"}
                provenance={p.provenance}
                meaning={p.meaning}
                implication={p.implication}
              />
            ))}
          </div>

          <Card title="What moved most">
            <DataTable
              columns={moverCols}
              data={data.movers}
              provenance="computed"
              caption="Accounts whose strongest signal moved furthest from their own normal. Each links to the incident that groups the evidence."
              emptyText="No large movements this week."
            />
          </Card>

          <div className="grid grid--2">
            <ChartFrame
              title="Activity, last 12 weeks"
              meaning="Weekly units ordered (hundreds), support tickets and field visits across the portfolio."
              implication="Flat lines with a dip in one series point to where the slowdown sits."
              provenance="computed"
            >
              <EChart
                ariaLabel="Weekly orders, tickets and visits"
                option={{
                  grid: { left: 48, right: 64, top: 16, bottom: 28 },
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
            <Card title="Account-type mix">
              <DataTable
                columns={mixCols}
                data={data.mix}
                provenance="computed"
                caption="Accounts and baseline 12-week order value by channel type. Shows where the business is concentrated, so a problem in one type can be sized."
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
