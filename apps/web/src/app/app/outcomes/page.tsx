"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CategoryChip, ChartFrame, DataTable, Details, EChart, ErrorState, Loading, Metric, MetricGroup, PageTemplate, ProvenanceBadge, StatusPill, buttonClass,
  type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { stageText, type ProblemRow } from "@/components/features/problems/model";
import { useApi } from "@/lib/api/client";
import { fmtDate, fmtNum, fmtPct, humanize } from "@/lib/format";
import { useViewMode } from "@/lib/viewmode";
import type { EChartsOption } from "echarts";

interface OutcomeRow {
  id: string; incident_id: string; ref: string; kpi: string; before_value: number; after_value: number;
  verdict: string; provenance: "illustrative"; notes: string; measured_at: string;
}
interface MemoryOutcome { ref: string; kind: string; title: string; body: string; cause: string | null; outcome: string; authored_by: string; resolution?: string }

const CAVEAT = "Scripted counterfactual from the Simulation Lab's fast-forward — not a measured result.";

export default function OutcomesPage() {
  const { mode } = useViewMode();
  const open = mode === "detailed";
  const outcomes = useApi<{ items: OutcomeRow[] }>("/outcomes");
  const memory = useApi<{ items: MemoryOutcome[] }>("/memory/items?kind=outcome");
  const incidents = useApi<{ items: ProblemRow[] }>("/incidents");
  const items = useMemo(() => outcomes.data?.items ?? [], [outcomes.data]);
  const byRef = useMemo(() => new Map((incidents.data?.items ?? []).map((i) => [i.ref, i])), [incidents.data]);
  const improved = items.filter((o) => o.verdict === "improved").length;
  const learned = memory.data?.items.length ?? 0;

  const columns = useMemo<ColumnDef<OutcomeRow>[]>(() => [
    { accessorKey: "ref", header: "Incident", cell: (c) => <Link className="mono" href={`/app/incidents/${c.getValue<string>()}`} onClick={(e) => e.stopPropagation()}>{c.getValue<string>()}</Link> },
    {
      id: "category", header: "Category", accessorFn: (o) => byRef.get(o.ref)?.category ?? "",
      cell: (c) => { const inc = byRef.get(c.row.original.ref); return inc ? <CategoryChip category={inc.category} size="sm" /> : <span className="muted">—</span>; },
    },
    { id: "stage", header: "Stage", accessorFn: (o) => byRef.get(o.ref)?.stage ?? "", cell: (c) => { const inc = byRef.get(c.row.original.ref); return inc ? stageText(inc.stage) : "—"; } },
    { accessorKey: "kpi", header: "KPI" },
    { accessorKey: "before_value", header: "Before", meta: { numeric: true }, cell: (c) => fmtPct(c.getValue<number>()) },
    { accessorKey: "after_value", header: "After", meta: { numeric: true }, cell: (c) => fmtPct(c.getValue<number>()) },
    { accessorKey: "verdict", header: "Verdict", cell: (c) => { const v = c.getValue<string>(); return <StatusPill status={v} tone={v === "improved" ? "ok" : v === "worsened" ? "bad" : "neutral"} label={humanize(v)} />; } },
    { accessorKey: "measured_at", header: "Measured (sim)", cell: (c) => fmtDate(c.getValue<string>(), true) },
    { accessorKey: "notes", header: "Notes", cell: (c) => <span className="caption">{c.getValue<string>()}</span> },
  ], [byRef]);

  const option = useMemo<EChartsOption>(() => {
    const labels = items.map((o) => `${o.kpi} · ${o.ref.replace(/^INC-\d{4}-/, "#")}`);
    return {
      grid: { left: 48, right: 16, top: 24, bottom: 48, containLabel: true },
      xAxis: { type: "category", data: labels, axisLabel: { interval: 0 } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => fmtPct(v) } },
      tooltip: { trigger: "axis", valueFormatter: (v) => fmtPct(Number(v)) },
      series: [
        { name: "Before", type: "bar", data: items.map((o) => o.before_value), itemStyle: { color: "var(--chart-4)" }, label: { show: true, position: "bottom", formatter: (p) => `Before\n${fmtPct(Number(p.value))}`, fontSize: 11, lineHeight: 14 } },
        { name: "After (scripted)", type: "bar", data: items.map((o) => o.after_value), itemStyle: { color: "var(--chart-1)" }, label: { show: true, position: "bottom", formatter: (p) => `After\n${fmtPct(Number(p.value))}`, fontSize: 11, lineHeight: 14 } },
      ],
    };
  }, [items]);

  const best = [...items].sort((a, b) => Math.abs(a.after_value) - Math.abs(b.after_value))[0];
  const takeaway = !outcomes.data ? "Loading outcomes…"
    : !items.length ? "No outcome recorded yet: approve a plan, then fast-forward in the Simulation Lab."
    : `${fmtNum(improved)} of ${fmtNum(items.length)} recorded outcome${items.length === 1 ? "" : "s"} improved in the scripted fast-forward (illustrative); ${best.ref} ${best.kpi} went from ${fmtPct(best.before_value)} to ${fmtPct(best.after_value)} vs baseline.`;

  return (
    <PageTemplate
      explainKey="outcomes"
      title="Outcomes"
      question="Did our actions work?"
      glance={items.length ? (
        <MetricGroup title="At a glance">
          <Metric id="outcomes_recorded" label="Outcomes recorded" value={fmtNum(items.length)} unit={items.length === 1 ? "outcome" : "outcomes"}
            compare="after the Lab's 14-day fast-forward"
            meaning="KPI after-values recorded for approved plans."
            implication="Each one is written to memory for the next similar case." provenance="illustrative" />
          <Metric id="outcomes_improved" label="Improved" value={fmtNum(improved)} unit={`of ${fmtNum(items.length)}`}
            compare="KPI moved back toward its baseline"
            meaning="Outcomes whose scripted after-value is closer to normal than before."
            implication="Illustrative: shows the loop closing, not a measured business result." provenance="illustrative" />
          <Metric id="outcomes_in_memory" label="Added to memory" value={fmtNum(learned)} unit={learned === 1 ? "item" : "items"}
            compare="outcome records written by the learning loop"
            meaning="Outcome items STRATA wrote into Organizational Memory."
            implication="The next similar incident retrieves these as precedent." provenance="illustrative"
            next={{ label: "Open memory", href: "/app/memory" }} />
        </MetricGroup>
      ) : undefined}
      visual={{
        takeaway,
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <div className="row"><ProvenanceBadge provenance="illustrative" /><p className="caption" style={{ maxWidth: "none", color: "var(--ink-2)", margin: 0 }}>{CAVEAT}</p></div>
            {outcomes.loading && !outcomes.data ? <Loading rows={5} label="Loading outcomes" />
              : outcomes.error ? <ErrorState error={outcomes.error} onRetry={outcomes.reload} />
              : items.length === 0 ? (
                <ArtEmptyState
                  art="outcome"
                  title="No outcomes recorded yet"
                  body="Outcomes appear after a human approves a plan and the Simulation Lab fast-forwards the simulated clock: a before/after bar per KPI. They are scripted counterfactuals, not measured results."
                  action={<Link className={buttonClass("primary", "sm")} href="/app/lab">Open the Simulation Lab</Link>}
                />
              ) : (
                <ChartFrame
                  title="KPI before vs after (per incident)"
                  meaning="Each pair shows a leading KPI's change versus its baseline before the plan, and after the Lab's 14-day fast-forward."
                  implication="Bars closer to zero after the plan mean the scripted recovery happened in the simulation. This is an illustrative counterfactual, not a measured result."
                  provenance="illustrative"
                  height={260}
                >
                  <EChart option={option} ariaLabel="Bar chart of KPI change before and after the plan, per incident" />
                </ChartFrame>
              )}
          </div>
        ),
      }}
      actions={
        <>
          <Link className={buttonClass("primary")} href={items.length ? "/app/memory" : "/app/lab"}>{items.length ? "Check it was added to memory" : "Run the loop in the Lab"}</Link>
          <Link className={buttonClass("secondary")} href="/app/approvals">Plans waiting for approval</Link>
        </>
      }
    >
      {items.length ? (
        <Details title={`Outcome records (${fmtNum(items.length)})`} defaultOpen={open}>
          <DataTable
            columns={columns}
            data={items}
            provenance="illustrative"
            caption={`What it is: each KPI's change vs baseline before the plan and after the simulated fast-forward. What it implies: whether the approved plan is expected to have worked. ${CAVEAT}`}
          />
        </Details>
      ) : null}
      <Details title={`Added to memory (${fmtNum(learned)})`} defaultOpen={open}>
        <div className="row"><ProvenanceBadge provenance="illustrative" />
          <p className="caption" style={{ margin: 0 }}>What it is: outcome records the learning loop wrote to Organizational Memory after the fast-forward. What it implies: the next similar incident will retrieve this case when the planner looks for precedent.</p>
        </div>
        {memory.loading && !memory.data ? <Loading rows={2} />
          : memory.error ? <ErrorState error={memory.error} onRetry={memory.reload} />
          : learned === 0 ? <p className="muted" style={{ fontSize: "var(--fs-13)" }}>Nothing written yet.</p>
          : (
            <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
      </Details>
    </PageTemplate>
  );
}
