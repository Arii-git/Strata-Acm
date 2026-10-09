"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Card,
  ChartFrame,
  DataTable,
  EChart,
  EmptyState,
  ErrorState,
  EvidenceChip,
  Loading,
  Metric,
  PageHeader,
  SeverityPill,
  StatusPill,
  baselineMarkLine,
  chartColor,
  type ColumnDef,
} from "@/components/ui";
import { useApi } from "@/lib/api/client";
import type { Note, Severity, Task } from "@/lib/api/types";
import { fmtDate, fmtINR, fmtNum, fmtPct, humanize } from "@/lib/format";

interface SignalLive {
  id: string; signal_key: string; label: string; source: string; value: number; baseline: number;
  robust_z: number; delta: number; direction: string; unit: string; caption?: string; definition?: string; note?: string;
}
interface NbaLive { rule_id: string; text: string; owner_role: string; draft_channel: string; due_in_hours: number; evidence_ids: string[]; authored_by?: string }
interface IncidentLite { id: string; ref: string; title: string; severity: Severity; status: string; risk_score: number; value_at_stake: number; driver: string }
interface Interaction { occurred_at: string; kind: string; rep: string; duration_min: number; prescriber?: boolean }
interface AccountDetailLive {
  account: { id: number | string; name: string; type: string; type_label?: string; region: string; city: string; tier: string; rep: string; rep_active?: boolean };
  value_12w: number;
  trend: { labels: string[]; units: number[]; baseline: number };
  signals: SignalLive[];
  interactions: Interaction[];
  open_tasks: Task[];
  next_best_actions: NbaLive[];
  notes: Note[];
  incidents: IncidentLite[];
  customer_definition?: string;
}

const CHANNEL: Record<string, string> = { whatsapp_draft: "WhatsApp draft", email_draft: "Email draft", task: "Task" };
const DIR_TONE: Record<string, "bad" | "ok" | "neutral"> = { adverse: "bad", favourable: "ok", neutral: "neutral" };

function fmtSignal(v: number, unit: string): string {
  if (unit === "ratio") return fmtPct(v, { signed: false, digits: 1 });
  if (unit === "days") return `${fmtNum(v, 1)} d`;
  return fmtNum(v, Math.abs(v) < 100 ? 1 : 0);
}

export default function AccountProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, error, loading, reload } = useApi<AccountDetailLive>(id ? `/accounts/${encodeURIComponent(id)}` : null);

  const sigCols: ColumnDef<SignalLive>[] = [
    { id: "label", accessorKey: "label", header: "Signal", cell: (c) => <span title={c.row.original.definition}>{c.row.original.label}</span> },
    { id: "value", accessorKey: "value", header: "Value", meta: { numeric: true }, cell: (c) => fmtSignal(c.row.original.value, c.row.original.unit) },
    { id: "baseline", accessorKey: "baseline", header: "Baseline", meta: { numeric: true }, cell: (c) => fmtSignal(c.row.original.baseline, c.row.original.unit) },
    {
      id: "delta", accessorKey: "delta", header: "Change", meta: { numeric: true },
      cell: (c) => (c.row.original.unit === "pct" || c.row.original.unit === "ratio" ? fmtPct(c.row.original.delta) : fmtNum(c.row.original.delta, 2)),
    },
    { id: "robust_z", accessorKey: "robust_z", header: "Robust z", meta: { numeric: true, help: "Distance from this account's own normal, in robust standard deviations" }, cell: (c) => fmtNum(c.row.original.robust_z, 2) },
    { id: "direction", accessorKey: "direction", header: "Direction", cell: (c) => <StatusPill status={c.row.original.direction} tone={DIR_TONE[c.row.original.direction] ?? "neutral"} /> },
  ];
  const intCols: ColumnDef<Interaction>[] = [
    { id: "occurred_at", accessorKey: "occurred_at", header: "When", meta: { mono: true }, cell: (c) => fmtDate(c.row.original.occurred_at, true) },
    { id: "kind", accessorKey: "kind", header: "Kind", cell: (c) => humanize(c.row.original.kind) },
    { id: "rep", accessorKey: "rep", header: "Rep" },
    { id: "duration_min", accessorKey: "duration_min", header: "Minutes", meta: { numeric: true } },
  ];

  if (loading && !data) return (<><PageHeader question="How is this customer doing and what should we do next for them?" title="Account" /><Loading rows={8} /></>);
  if (error) return (<><PageHeader question="How is this customer doing and what should we do next for them?" title="Account" /><ErrorState error={error} onRetry={reload} /></>);
  if (!data) return (<><PageHeader question="How is this customer doing and what should we do next for them?" title="Account" /><EmptyState title="Account not found" /></>);

  const a = data.account;
  return (
    <>
      <PageHeader question="How is this customer doing and what should we do next for them?" title={a.name} />
      <div className="stack">
        <div className="grid grid--3">
          <Card title="Profile">
            <div className="stack" style={{ gap: "var(--sp-1)" }}>
              <div><span className="mono">{a.id}</span> · {a.type_label ?? humanize(a.type)} · Tier {a.tier}</div>
              <div>{a.city}, {a.region}</div>
              <div>Rep: {a.rep}{a.rep_active === false ? " (vacant)" : ""}</div>
            </div>
          </Card>
          <Metric
            label="12-week order value"
            value={fmtINR(data.value_12w)}
            provenance="synthetic"
            meaning="Baseline 12-week order value for this account."
            implication="This is the exposure if the relationship degrades: exposure, not predicted loss."
          />
          <Card title="Linked incidents">
            {data.incidents.length === 0 ? <span className="caption">No incidents for this account.</span> : (
              <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
                {data.incidents.map((i) => (
                  <li key={i.ref}>
                    <Link className="mono" href={`/app/incidents/${i.ref}`}>{i.ref}</Link> <SeverityPill severity={i.severity} /> <StatusPill status={i.status} />
                    <div className="caption">{i.title}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid--2">
          <ChartFrame
            title="Units ordered, last 26 weeks"
            meaning="Weekly units ordered by this account; the dashed line is its own baseline weekly mean."
            implication="A sustained run below the dashed line is a real decline, not a bad week."
            provenance="synthetic"
          >
            <EChart
              ariaLabel="Weekly units vs baseline"
              option={{
                grid: { left: 48, right: 72, top: 16, bottom: 28 },
                xAxis: { type: "category", data: data.trend.labels.map((l) => fmtDate(l)) },
                yAxis: { type: "value" },
                tooltip: { trigger: "axis" },
                series: [{
                  name: "Units",
                  type: "line",
                  showSymbol: false,
                  data: data.trend.units,
                  lineStyle: { color: chartColor(1) },
                  itemStyle: { color: chartColor(1) },
                  endLabel: { show: true, formatter: "Units" },
                  markLine: baselineMarkLine(data.trend.baseline, "Baseline"),
                }],
              }}
            />
          </ChartFrame>
          <Card title="Next-best actions">
            {data.next_best_actions.length === 0 ? <EmptyState title="No suggested actions" body="No rule fired for this account." /> : (
              <div className="stack" style={{ gap: "var(--sp-3)" }}>
                {data.next_best_actions.slice(0, 3).map((n) => (
                  <div key={n.rule_id} className="card stack" style={{ gap: "var(--sp-2)" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="caption mono" style={{ letterSpacing: ".04em" }}>{n.authored_by ?? "DRAFT - TEAM TO REVIEW"}</span>
                      <span className="caption mono">{n.rule_id}</span>
                    </div>
                    <div>{n.text}</div>
                    <div className="caption" style={{ maxWidth: "none" }}>
                      Owner: {humanize(n.owner_role)} · {CHANNEL[n.draft_channel] ?? humanize(n.draft_channel)} · due in {fmtNum(n.due_in_hours)} h
                    </div>
                    <div className="row" style={{ flexWrap: "wrap" }}>{n.evidence_ids.map((e) => <EvidenceChip key={e} id={e} />)}</div>
                    <div className="caption">Simulated: not sent.</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title="Signals">
          <DataTable
            columns={sigCols}
            data={data.signals}
            provenance="computed"
            caption="Each signal compared with this account's own normal. Robust z beyond about 3 is unusual; several adverse signals together form a pattern."
          />
        </Card>

        <div className="grid grid--2">
          <Card title="Last 10 interactions">
            <DataTable
              columns={intCols}
              data={data.interactions.slice(0, 10)}
              provenance="synthetic"
              caption="Most recent field and support touchpoints. A thinning list often precedes falling orders."
              emptyText="No recent interactions."
            />
          </Card>
          <Card title="Open tasks and notes">
            <div className="stack" style={{ gap: "var(--sp-3)" }}>
              {data.open_tasks.length === 0 ? <span className="caption">No open tasks.</span> : (
                <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
                  {data.open_tasks.map((t) => (
                    <li key={t.id}>
                      <span className="mono">{t.id}</span> {t.title}
                      <div className="caption">{humanize(t.owner_role)} · due {fmtDate(t.due_at, true)} · <StatusPill status={t.status} />{t.incident_ref ? <> · <Link className="mono" href={`/app/incidents/${t.incident_ref}`}>{t.incident_ref}</Link></> : null}</div>
                    </li>
                  ))}
                </ul>
              )}
              <strong>Notes</strong>
              {data.notes.length === 0 ? <span className="caption">No notes yet.</span> : (
                <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
                  {data.notes.map((n, i) => <li key={n.id ?? i}><strong>{n.author}</strong> <span className="muted">({humanize(n.author_role)})</span>: {n.body}</li>)}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <p className="caption">{data.customer_definition ?? "A customer in STRATA is a B2B channel account; no patient data is used."}</p>
      </div>
    </>
  );
}
