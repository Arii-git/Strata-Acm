"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CategoryChip,
  ChartFrame,
  DataTable,
  Details,
  EChart,
  ErrorState,
  EvidenceChip,
  Loading,
  Metric,
  MetricGroup,
  PageTemplate,
  SeverityPill,
  StatusPill,
  TermHint,
  baselineMarkLine,
  buttonClass,
  chartColor,
  type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { stageText } from "@/components/features/problems/model";
import { useApi } from "@/lib/api/client";
import type { Note, Severity, Task } from "@/lib/api/types";
import { fmtDate, fmtINR, fmtNum, fmtPct, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";

interface SignalLive {
  id: string; signal_key: string; label: string; source: string; value: number; baseline: number;
  robust_z: number; delta: number; direction: string; unit: string; caption?: string; definition?: string; note?: string;
}
interface NbaLive { rule_id: string; text: string; owner_role: string; draft_channel: string; due_in_hours: number; evidence_ids: string[]; authored_by?: string }
interface IncidentLite {
  id: string; ref: string; title: string; severity: Severity; status: string; risk_score: number; value_at_stake: number; driver: string;
  category?: string; stage?: string; owner_role?: string; age_days?: number;
}
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
const QUESTION = "How is this customer doing and what should we do next for them?";

function fmtSignal(v: number, unit: string): string {
  if (unit === "ratio") return fmtPct(v, { signed: false, digits: 1 });
  if (unit === "days") return `${fmtNum(v, 1)} d`;
  return fmtNum(v, Math.abs(v) < 100 ? 1 : 0);
}

function trendTakeaway(d: AccountDetailLive): string {
  const u = d.trend.units;
  if (!u.length || !d.trend.baseline) return "No order history for this account yet.";
  const last = u.slice(-4);
  const avg = last.reduce((s, v) => s + v, 0) / last.length;
  const ch = avg / d.trend.baseline - 1;
  const dir = Math.abs(ch) < 0.05 ? "close to" : ch < 0 ? `${fmtPct(Math.abs(ch), { signed: false })} below` : `${fmtPct(ch, { signed: false })} above`;
  return `Last ${last.length} weeks averaged ${fmtNum(avg)} units a week, ${dir} this account's own normal of ${fmtNum(d.trend.baseline)}.`;
}

export default function AccountProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { mode } = useViewMode();
  const open = mode === "detailed";
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

  if (loading && !data) return <PageTemplate explainKey="account" title="Account" question={QUESTION} visual={{ takeaway: "Loading…", node: <Loading rows={8} /> }} />;
  if (error) return <PageTemplate explainKey="account" title="Account" question={QUESTION} visual={{ takeaway: "This account could not be loaded.", node: <ErrorState error={error} onRetry={reload} /> }} />;
  if (!data) return <PageTemplate explainKey="account" title="Account" question={QUESTION} visual={{ takeaway: "Account not found.", node: <ArtEmptyState art="customer" title="Account not found" body="Check the account ID, or open the Accounts list." action={<Link className={buttonClass("secondary", "sm")} href="/app/accounts">All accounts</Link>} /> }} />;

  const a = data.account;
  const adverse = data.signals.filter((s) => s.direction === "adverse").length;
  const topInc = data.incidents[0];
  const nba = data.next_best_actions.slice(0, 3);

  return (
    <PageTemplate
      explainKey="account"
      title={a.name}
      question={QUESTION}
      glance={
        <MetricGroup title="At a glance">
          <Metric
            id="account_value_12w" label="₹ exposed" value={fmtINR(data.value_12w)} unit="normal 12-week orders"
            compare="this account's baseline, not a forecast"
            meaning="Baseline 12-week order value for this account."
            implication="This is the exposure if the relationship degrades: exposure, not predicted loss."
            provenance="computed"
          />
          <Metric
            id="adverse_signals" label="Signals off normal" value={fmtNum(adverse)} unit={`of ${fmtNum(data.signals.length)} signals`}
            compare="adverse vs this account's own normal"
            meaning="Signals moving in the bad direction compared with this account's history."
            implication={adverse >= 2 ? "Several adverse signals together form a pattern, not noise." : "One or no adverse signal: watch, do not act yet."}
            provenance="computed" tone={adverse >= 3 ? "elevated" : "default"}
          />
          <Metric
            id="account_open_problems" label="Open problems" value={fmtNum(data.incidents.length)} unit={data.incidents.length === 1 ? "problem" : "problems"}
            compare="naming this account"
            meaning="Problems on the board scoped to this account."
            implication={data.incidents.length ? "Open the case file to see the cause and plan." : "Nothing raised for this account."}
            provenance="computed"
            next={topInc ? { label: `Open ${topInc.ref}`, href: `/app/incidents/${topInc.ref}` } : undefined}
          />
        </MetricGroup>
      }
      visual={{
        takeaway: trendTakeaway(data),
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <p className="caption" style={{ margin: 0, maxWidth: "none" }}>
              <span className="mono">{a.id}</span> · {a.type_label ?? humanize(a.type)} · Tier {a.tier} · {a.city}, {a.region} · Rep: {a.rep}{a.rep_active === false ? " (vacant)" : ""}
            </p>
            <ChartFrame
              title="Units ordered, last 26 weeks"
              meaning="Weekly units ordered by this account; the dashed line is its own baseline weekly mean."
              implication="A sustained run below the dashed line is a real decline, not a bad week."
              provenance="synthetic"
            >
              <EChart
                ariaLabel={trendTakeaway(data)}
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
          </div>
        ),
      }}
      actions={
        nba.length || topInc ? (
          <div className="stack" style={{ gap: "var(--sp-3)", width: "100%" }}>
            {nba[0] ? (
              <div className="nba-line">
                <span className="caption mono" style={{ letterSpacing: ".04em" }}>{nba[0].authored_by ?? "DRAFT - TEAM TO REVIEW"} · {nba[0].rule_id}</span>
                <span>{nba[0].text}</span>
                <span className="caption" style={{ maxWidth: "none" }}>Owner: {personaLabel(nba[0].owner_role)} · {CHANNEL[nba[0].draft_channel] ?? humanize(nba[0].draft_channel)} · due in {fmtNum(nba[0].due_in_hours)} h · simulated, not sent</span>
              </div>
            ) : null}
            <div className="row" style={{ flexWrap: "wrap" }}>
              {topInc ? <Link className={buttonClass("primary")} href={`/app/incidents/${topInc.ref}`}>Open {topInc.ref}</Link> : null}
              <Link className={buttonClass("secondary")} href="/app/workflows">Tasks and handoffs</Link>
            </div>
          </div>
        ) : undefined
      }
    >
      <Details title={`Linked problems (${fmtNum(data.incidents.length)})`} defaultOpen={open || data.incidents.length > 0}>
        {data.incidents.length === 0 ? <ArtEmptyState art="customer" title="No problems for this account" body="A problem appears here when two or more of this account's signals move off its normal together." /> : (
          <ul className="linked-incidents">
            {data.incidents.map((i) => (
              <li key={i.ref}>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {i.category ? <CategoryChip category={i.category} size="sm" /> : null}
                  <SeverityPill severity={i.severity} />
                  {i.stage ? <span className="caption" style={{ maxWidth: "none" }}>Stage: {stageText(i.stage)}</span> : <StatusPill status={i.status} />}
                  <Link className="mono" href={`/app/incidents/${i.ref}`}>{i.ref}</Link>
                </div>
                <div>{i.title}</div>
                <div className="caption" style={{ maxWidth: "none" }}>
                  {i.owner_role ? `Owner: ${personaLabel(i.owner_role)} · ` : ""}{typeof i.age_days === "number" ? `open ${fmtNum(i.age_days)} days · ` : ""}{fmtINR(i.value_at_stake)} exposed <TermHint term="exposure" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Details>
      <Details title={`Next-best actions (${fmtNum(data.next_best_actions.length)})`} defaultOpen={open}>
        {nba.length === 0 ? <ArtEmptyState art="tasks" title="No suggested actions" body="Engagement rules suggest actions when a signal crosses its rule; none fired for this account." /> : (
          <div className="grid grid--3">
            {nba.map((n) => (
              <div key={n.rule_id} className="card stack" style={{ gap: "var(--sp-2)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="caption mono" style={{ letterSpacing: ".04em" }}>{n.authored_by ?? "DRAFT - TEAM TO REVIEW"}</span>
                  <span className="caption mono">{n.rule_id}</span>
                </div>
                <div>{n.text}</div>
                <div className="caption" style={{ maxWidth: "none" }}>
                  Owner: {personaLabel(n.owner_role)} · {CHANNEL[n.draft_channel] ?? humanize(n.draft_channel)} · due in {fmtNum(n.due_in_hours)} h
                </div>
                <div className="row" style={{ flexWrap: "wrap" }}>{n.evidence_ids.map((e) => <EvidenceChip key={e} id={e} />)}</div>
                <div className="caption">Simulated: not sent.</div>
              </div>
            ))}
          </div>
        )}
      </Details>
      <Details title={`Signals (${fmtNum(data.signals.length)})`} defaultOpen={open}>
        <DataTable
          columns={sigCols}
          data={data.signals}
          provenance="computed"
          caption="Each signal compared with this account's own normal. Robust z beyond about 3 is unusual; several adverse signals together form a pattern."
        />
      </Details>
      <Details title="Last 10 interactions" defaultOpen={open}>
        <DataTable
          columns={intCols}
          data={data.interactions.slice(0, 10)}
          provenance="synthetic"
          caption="Most recent field and support touchpoints. A thinning list often precedes falling orders."
          emptyText="No recent interactions."
        />
      </Details>
      <Details title="Open tasks and notes" defaultOpen={open}>
        {data.open_tasks.length === 0 ? <span className="caption">No open tasks.</span> : (
          <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
            {data.open_tasks.map((t) => (
              <li key={t.id}>
                <span className="mono">{t.id}</span> {t.title}
                <div className="caption">{personaLabel(t.owner_role)} · due {fmtDate(t.due_at, true)} · <StatusPill status={t.status} />{t.incident_ref ? <> · <Link className="mono" href={`/app/incidents/${t.incident_ref}`}>{t.incident_ref}</Link></> : null}</div>
              </li>
            ))}
          </ul>
        )}
        <strong>Notes</strong>
        {data.notes.length === 0 ? <span className="caption">No notes yet.</span> : (
          <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
            {data.notes.map((n, i) => <li key={n.id ?? i}><strong>{n.author}</strong> <span className="muted">({personaLabel(n.author_role)})</span>: {n.body}</li>)}
          </ul>
        )}
      </Details>
      <p className="caption">{data.customer_definition ?? "A customer in STRATA is a B2B channel account; no patient data is used."}</p>
    </PageTemplate>
  );
}
