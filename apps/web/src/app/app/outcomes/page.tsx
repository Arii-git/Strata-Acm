"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  PageHeader, Card, ChartFrame, EChart, DataTable, EmptyState, ErrorState, Loading, StatusPill, buttonClass,
  type ColumnDef,
} from "@/components/ui";
import { useApi } from "@/lib/api/client";
import { fmtDate, fmtPct, humanize } from "@/lib/format";
import type { EChartsOption } from "echarts";

interface OutcomeRow {
  id: string; incident_id: string; ref: string; kpi: string; before_value: number; after_value: number;
  verdict: string; provenance: "illustrative"; notes: string; measured_at: string;
}
interface MemoryOutcome { ref: string; kind: string; title: string; body: string; cause: string | null; outcome: string; authored_by: string; resolution?: string }

const CAVEAT = "Scripted counterfactual from the Simulation Lab's fast-forward — not a measured result.";

export default function OutcomesPage() {
  const outcomes = useApi<{ items: OutcomeRow[] }>("/outcomes");
  const memory = useApi<{ items: MemoryOutcome[] }>("/memory/items?kind=outcome");
  const items = useMemo(() => outcomes.data?.items ?? [], [outcomes.data]);

  const columns = useMemo<ColumnDef<OutcomeRow>[]>(() => [
    { accessorKey: "ref", header: "Incident", cell: (c) => <Link className="mono" href={`/app/incidents/${c.getValue<string>()}`} onClick={(e) => e.stopPropagation()}>{c.getValue<string>()}</Link> },
    { accessorKey: "kpi", header: "KPI" },
    { accessorKey: "before_value", header: "Before", meta: { numeric: true }, cell: (c) => fmtPct(c.getValue<number>()) },
    { accessorKey: "after_value", header: "After", meta: { numeric: true }, cell: (c) => fmtPct(c.getValue<number>()) },
    { accessorKey: "verdict", header: "Verdict", cell: (c) => { const v = c.getValue<string>(); return <StatusPill status={v} tone={v === "improved" ? "ok" : v === "worsened" ? "bad" : "neutral"} label={humanize(v)} />; } },
    { accessorKey: "measured_at", header: "Measured (sim)", cell: (c) => fmtDate(c.getValue<string>(), true) },
    { accessorKey: "notes", header: "Notes", cell: (c) => <span className="caption">{c.getValue<string>()}</span> },
  ], []);

  const option = useMemo<EChartsOption>(() => {
    const labels = items.map((o) => `${o.kpi} · ${o.ref.replace(/^INC-\d{4}-/, "#")}`);
    return {
      grid: { left: 48, right: 16, top: 24, bottom: 48, containLabel: true },
      xAxis: { type: "category", data: labels, axisLabel: { interval: 0 } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => fmtPct(v) } },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmtPct(Number(v)) },
      series: [
        { name: "Before", type: "bar", data: items.map((o) => o.before_value), itemStyle: { color: "var(--chart-4)" }, label: { show: true, position: "bottom", formatter: (p) => `Before ${fmtPct(Number(p.value))}` } },
        { name: "After (scripted)", type: "bar", data: items.map((o) => o.after_value), itemStyle: { color: "var(--chart-1)" }, label: { show: true, position: "bottom", formatter: (p) => `After ${fmtPct(Number(p.value))}` } },
      ],
    };
  }, [items]);

  return (
    <div className="stack">
      <PageHeader question="Did our actions work?" title="Outcomes" />
      <p className="caption" style={{ maxWidth: "none", color: "var(--ink-2)" }}>{CAVEAT}</p>

      {outcomes.loading && !outcomes.data ? <Loading rows={5} label="Loading outcomes" />
        : outcomes.error ? <ErrorState error={outcomes.error} onRetry={outcomes.reload} />
        : items.length === 0 ? (
          <EmptyState
            title="No outcomes recorded yet"
            body="Outcomes appear after a human approves a plan and the Simulation Lab fast-forwards the simulated clock. They are scripted counterfactuals, not measured results."
            action={<Link className={buttonClass("primary", "sm")} href="/app/lab">Open the Simulation Lab</Link>}
          />
        ) : (
          <>
            <ChartFrame
              title="KPI before vs after (per incident)"
              meaning="Each pair shows a leading KPI's change versus its baseline before the plan, and after the Lab's 14-day fast-forward."
              implication="Bars closer to zero after the plan mean the scripted recovery happened in the simulation. This is an illustrative counterfactual, not a measured result."
              provenance="illustrative"
              height={260}
            >
              <EChart option={option} ariaLabel="Bar chart of KPI change before and after the plan, per incident" />
            </ChartFrame>
            <DataTable
              columns={columns}
              data={items}
              provenance="illustrative"
              caption={`What it is: each KPI's change vs baseline before the plan and after the simulated fast-forward. What it implies: whether the approved plan is expected to have worked. ${CAVEAT}`}
            />
          </>
        )}

      <Card title="Added to memory" provenance="illustrative">
        <p className="caption">What it is: outcome records the learning loop wrote to Organizational Memory after the fast-forward. What it implies: the next similar incident will retrieve this case when the planner looks for precedent.</p>
        {memory.loading && !memory.data ? <Loading rows={2} />
          : memory.error ? <ErrorState error={memory.error} onRetry={memory.reload} />
          : (memory.data?.items.length ?? 0) === 0 ? <p className="muted" style={{ fontSize: "var(--fs-13)" }}>Nothing written yet.</p>
          : (
            <ul className="stack" style={{ listStyle: "none", margin: "var(--sp-3) 0 0", padding: 0 }}>
              {memory.data!.items.map((m) => (
                <li key={m.ref} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "var(--sp-3)" }}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: "var(--fs-13)" }}>{m.ref}</span>
                    <span style={{ fontWeight: 600, fontSize: "var(--fs-14)" }}>{m.title}</span>
                  </div>
                  <p style={{ margin: "var(--sp-1) 0", fontSize: "var(--fs-13)" }}>{m.body}</p>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    {m.cause ? <span className="chip">cause: {humanize(m.cause)}</span> : null}
                    <span className="chip">outcome: {humanize(m.outcome)}</span>
                    <span className="chip">written by: {m.authored_by}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}
