"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DataTable, Details, ErrorState, Loading, Metric, MetricGroup, PageTemplate, ProvenanceBadge, SeverityPill, buttonClass, type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { useApi } from "@/lib/api/client";
import { fmtPct, fmtNum, humanize } from "@/lib/format";
import type { Severity } from "@/lib/api/types";
import { useViewMode } from "@/lib/viewmode";

interface Scenario {
  id: string; title: string; kind: string; planted: boolean; expected: string; detected: boolean; incidents: string[];
  severity: Severity | null; risk_score: number | null; cause: string | null; truth_cause: string | null;
  cause_ok: boolean | null; hit: boolean | null; note: string;
  /** IsolationForest corroboration: true/false, or null = not applicable (region/portfolio scopes, not planted). */
  if_flagged?: boolean | null;
}
interface Run {
  seed: number; is_holdout: boolean;
  metrics: {
    precision: number; recall: number; root_cause_acc: number; incidents?: number; false_alarms: number;
    false_alarm_refs?: string[]; scenarios_planted?: number; scenarios_detected?: number;
    if_corroborated?: number; if_checked?: number;
  };
  hero_deltas?: Record<string, number>;
  per_scenario: Scenario[];
}
interface EvalResp { runs: Run[]; caveat: string; lead_time?: string; isolation_forest?: string }

/* Deck targets for the hero scenario (S01). Labelled "deck target" in the UI; pass/fail is computed here. */
const HERO_TARGETS: { key: string; label: string; target: number }[] = [
  { key: "order_volume_delta", label: "Orders", target: -0.31 },
  { key: "complaint_count_delta", label: "Complaints", target: 0.47 },
  { key: "response_time_delta", label: "Response time", target: 0.22 },
  { key: "interaction_frequency_delta", label: "Touchpoints", target: -0.40 },
];
const TOLERANCE = 0.08;

interface HeroRow { key: string; label: string; target: number; actual: number | null; pass: boolean | null }

type ResultKind = "hit" | "silent" | "miss" | "false_alarm" | "cut";
function resultOf(s: Scenario): ResultKind {
  if (!s.planted || s.hit === null) return "cut";
  if (s.hit) return s.expected === "silent" ? "silent" : "hit";
  return s.expected === "silent" ? "false_alarm" : "miss";
}
const RESULT_LABEL: Record<ResultKind, string> = {
  hit: "Hit", silent: "Correctly silent", miss: "MISS", false_alarm: "False alarm", cut: "Not planted in this build",
};

function ResultCell({ s }: { s: Scenario | undefined }) {
  if (!s) return <span className="muted">—</span>;
  const r = resultOf(s);
  if (r === "miss" || r === "false_alarm") {
    return <span style={{ color: "var(--crimson-700)", fontWeight: 600 }}>{r === "miss" ? "MISS (not detected)" : "False alarm (decoy flagged)"}</span>;
  }
  if (r === "cut") return <span className="muted">{RESULT_LABEL[r]}</span>;
  return <span style={{ color: "var(--green-700)" }}>{RESULT_LABEL[r]}</span>;
}

/** Words, not colour: Yes / No / — (not applicable). */
function mlText(s: Scenario | undefined): string {
  if (!s || s.if_flagged === null || s.if_flagged === undefined || resultOf(s) === "cut") return "—";
  return s.if_flagged ? "Yes" : "No";
}

/** Computed from the run: where the model disagrees with the rules (why it does not decide). */
function mlSummary(run: Run): string {
  const ps = run.per_scenario.filter((s) => resultOf(s) !== "cut");
  const decoys = ps.filter((s) => s.expected === "silent" && s.if_flagged === true).map((s) => s.id);
  const missed = ps.filter((s) => resultOf(s) === "miss" && s.if_flagged === true).map((s) => s.id);
  const unflagged = ps.filter((s) => resultOf(s) === "hit" && s.if_flagged === false).map((s) => s.id);
  const parts: string[] = [];
  if (decoys.length) parts.push(`it flags decoy ${decoys.join(", ")} (would be a false alarm)`);
  if (missed.length) parts.push(`it flags ${missed.join(", ")}, which the rules missed`);
  if (unflagged.length) parts.push(`it does not flag ${unflagged.join(", ")}, which the rules found`);
  return parts.length ? `${parts.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) : "It agrees with the rules on every applicable scenario.";
}

function runName(r: Run) {
  return r.is_holdout ? `Hold-out B (seed ${r.seed}, never tuned)` : `Seed A (seed ${r.seed}, used for tuning)`;
}

function RunSection({ run, defaultOpen }: { run: Run; defaultOpen: boolean }) {
  const m = run.metrics;
  const columns = useMemo<ColumnDef<Scenario>[]>(() => {
    const dim = (s: Scenario) => (resultOf(s) === "cut" ? { color: "var(--ink-3)" } : undefined);
    return [
      { accessorKey: "id", header: "ID", meta: { mono: true }, cell: (c) => <span style={dim(c.row.original)}>{c.getValue<string>()}</span> },
      { accessorKey: "title", header: "Scenario", cell: (c) => <span style={dim(c.row.original)}>{c.getValue<string>()}{c.row.original.note ? <span className="caption" style={{ display: "block" }}>{c.row.original.note}</span> : null}</span> },
      { accessorKey: "kind", header: "Kind", cell: (c) => <span style={dim(c.row.original)}>{humanize(c.getValue<string>())}</span> },
      { accessorKey: "expected", header: "Expected", cell: (c) => <span style={dim(c.row.original)}>{humanize(c.getValue<string>())}</span> },
      {
        accessorKey: "detected", header: "Detected",
        cell: (c) => {
          const s = c.row.original;
          if (resultOf(s) === "cut") return <span className="muted">—</span>;
          return s.detected ? (
            <span className="row" style={{ flexWrap: "wrap" }}>Yes{s.incidents.map((ref) => <Link key={ref} className="mono" href={`/app/incidents/${ref}`} onClick={(e) => e.stopPropagation()}>{ref}</Link>)}</span>
          ) : "No";
        },
      },
      { accessorKey: "severity", header: "Severity", cell: (c) => { const v = c.getValue<Severity | null>(); return v ? <SeverityPill severity={v} /> : <span className="muted">—</span>; } },
      {
        id: "cause", header: "Cause vs truth",
        cell: (c) => {
          const s = c.row.original;
          if (resultOf(s) === "cut") return <span className="muted">truth: {humanize(s.truth_cause)}</span>;
          if (!s.cause && !s.truth_cause) return <span className="muted">—</span>;
          return (
            <span>
              {s.cause ? humanize(s.cause) : "none"} <span className="muted">vs</span> {s.truth_cause ? humanize(s.truth_cause) : "none"}
              {s.cause_ok === false ? <span style={{ color: "var(--crimson-700)", fontWeight: 600 }}> (wrong cause)</span> : null}
            </span>
          );
        },
      },
      { id: "result", header: "Result", accessorFn: (s) => RESULT_LABEL[resultOf(s)], cell: (c) => <ResultCell s={c.row.original} /> },
      { id: "ml", header: "ML also flagged?", accessorFn: (s) => mlText(s), meta: { help: "IsolationForest corroboration only; it never decides detection. — = not applicable (region or portfolio scope, or not planted)." } },
    ];
  }, []);

  const hero = run.hero_deltas ?? {};
  const heroRows: HeroRow[] = HERO_TARGETS.map((t) => {
    const actual = hero[t.key];
    const has = typeof actual === "number";
    return { ...t, actual: has ? actual : null, pass: has ? Math.abs(actual - t.target) <= TOLERANCE : null };
  });

  const heroCols = useMemo<ColumnDef<HeroRow>[]>(() => [
    { accessorKey: "label", header: "Signal" },
    { accessorKey: "actual", header: "Generated", meta: { numeric: true }, cell: (c) => (c.getValue<number | null>() === null ? "n/a" : fmtPct(c.getValue<number>())) },
    { accessorKey: "target", header: "Deck target", meta: { numeric: true }, cell: (c) => fmtPct(c.getValue<number>()) },
    {
      id: "pass", header: `Within ±${fmtPct(TOLERANCE, { signed: false })}`, accessorFn: (h) => (h.pass === null ? "n/a" : h.pass ? "Pass" : "Fail"),
      cell: (c) => {
        const p = c.row.original.pass;
        return p === null ? <span className="muted">n/a</span> : p ? <span style={{ color: "var(--green-700)" }}>Pass</span> : <span style={{ color: "var(--crimson-700)", fontWeight: 600 }}>Fail</span>;
      },
    },
  ], []);

  return (
    <Details title={runName(run)} defaultOpen={defaultOpen}>
      <div className="row"><ProvenanceBadge provenance="computed" /><span className="caption">Scored by <span className="mono">npm run eval</span> against the planted scenarios.</span></div>
      <MetricGroup title={`${runName(run)}: detection`}>
        <Metric id="precision" label="Precision" value={fmtPct(m.precision, { signed: false })} unit="of raised incidents"
          compare={`${fmtNum(m.incidents ?? 0)} incidents raised`}
          meaning="Share of raised incidents that match a planted scenario."
          implication="Lower precision means more noise for the team to triage." provenance="computed" />
        <Metric id="recall" label="Recall" value={fmtPct(m.recall, { signed: false })} unit="of planted scenarios"
          compare={`${m.scenarios_detected ?? "n/a"} of ${m.scenarios_planted ?? "n/a"} planted`}
          meaning="Share of planted scenarios that STRATA detected."
          implication="Missed scenarios are problems the team would still find late." provenance="computed" />
        <Metric id="root_cause_acc" label="Root-cause accuracy" value={fmtPct(m.root_cause_acc, { signed: false })} unit="of detected"
          compare="stated cause vs planted cause"
          meaning="Of detected scenarios, share where the stated cause matches the planted cause."
          implication="A wrong cause sends the plan to the wrong owner." provenance="computed" />
      </MetricGroup>
      <MetricGroup title={`${runName(run)}: noise and corroboration`}>
        <Metric id="false_alarms" label="False alarms" value={fmtNum(m.false_alarms)} unit={m.false_alarms === 1 ? "incident" : "incidents"}
          compare="incidents with no matching planted scenario"
          meaning={m.false_alarm_refs && m.false_alarm_refs.length ? `Incidents with no matching planted scenario: ${m.false_alarm_refs.join(", ")}.` : "Incidents with no matching planted scenario."}
          implication={`Scenarios detected: ${m.scenarios_detected ?? "n/a"} of ${m.scenarios_planted ?? "n/a"} planted.`}
          provenance="computed" tone={m.false_alarms > 0 ? "elevated" : "default"}
          next={m.false_alarm_refs?.[0] ? { label: `Open ${m.false_alarm_refs[0]}`, href: `/app/incidents/${m.false_alarm_refs[0]}` } : undefined} />
        {typeof m.if_corroborated === "number" ? (
          <Metric id="if_corroborated" label="ML also flagged" value={fmtNum(m.if_corroborated)} unit={`of ${fmtNum(m.if_checked ?? 0)} checked`}
            compare="planted accounts IsolationForest also ranked in its top 5%"
            meaning="Secondary corroboration from an unsupervised model over each account's signal z-scores."
            implication={`Rules and statistics decide; ML only corroborates. ${mlSummary(run)}`}
            provenance="computed" />
        ) : null}
      </MetricGroup>
      <DataTable
        columns={columns}
        data={run.per_scenario}
        provenance="computed"
        caption="What it is: each planted scenario (S01–S12) and whether STRATA found it with the right cause; decoys should stay silent. What it implies: misses and false alarms are labelled in text, and scenarios not planted in this build are greyed out and excluded from the scores. 'ML also flagged?' is corroboration only."
      />
      <div>
        <h3 style={{ fontSize: "var(--fs-14)", margin: "0 0 var(--sp-2)" }}>Hero scenario (S01) deltas vs deck target</h3>
        <DataTable
          columns={heroCols}
          data={heroRows}
          provenance="computed"
          caption="What it is: the hero scenario's generated signal changes compared with the figures quoted in the deck (deck target). What it implies: whether the synthetic data reproduces the story we tell; a fail means the deck number needs revising."
        />
      </div>
    </Details>
  );
}

interface CompareRow { id: string; title: string; a?: Scenario; b?: Scenario }

export default function EvaluationPage() {
  const { mode } = useViewMode();
  const open = mode === "detailed";
  const { data, error, loading, reload } = useApi<EvalResp>("/eval/latest");

  const runs = useMemo(() => [...(data?.runs ?? [])].sort((a, b) => Number(a.is_holdout) - Number(b.is_holdout)), [data]);
  const seedA = runs.find((r) => !r.is_holdout);
  const holdB = runs.find((r) => r.is_holdout) ?? runs[runs.length - 1];

  const compareRows = useMemo<CompareRow[]>(() => {
    const ids = new Map<string, string>();
    runs.forEach((r) => r.per_scenario.forEach((s) => ids.set(s.id, s.title)));
    return [...ids.entries()].map(([id, title]) => ({ id, title, a: seedA?.per_scenario.find((s) => s.id === id), b: holdB?.per_scenario.find((s) => s.id === id) }));
  }, [runs, seedA, holdB]);

  const compareCols = useMemo<ColumnDef<CompareRow>[]>(() => [
    { accessorKey: "id", header: "ID", meta: { mono: true } },
    { accessorKey: "title", header: "Scenario" },
    { id: "a", header: "Seed A (tuned)", accessorFn: (r) => (r.a ? RESULT_LABEL[resultOf(r.a)] : ""), cell: (c) => <ResultCell s={c.row.original.a} /> },
    { id: "b", header: "Hold-out B", accessorFn: (r) => (r.b ? RESULT_LABEL[resultOf(r.b)] : ""), cell: (c) => <ResultCell s={c.row.original.b} /> },
    { id: "ml", header: "ML also flagged? (B)", accessorFn: (r) => mlText(r.b), meta: { help: "IsolationForest corroboration on hold-out B. Yes / No / — (not applicable)." } },
  ], []);

  const title = "Evaluation";
  const question = "How good is Strata, honestly?";
  if (loading && !data) return <PageTemplate explainKey="evaluation" title={title} question={question} visual={{ takeaway: "Loading…", node: <Loading rows={8} label="Loading evaluation" /> }} />;
  if (error) return <PageTemplate explainKey="evaluation" title={title} question={question} visual={{ takeaway: "Evaluation could not be loaded.", node: <ErrorState error={error} onRetry={reload} /> }} />;
  if (!data || !holdB) {
    return <PageTemplate explainKey="evaluation" title={title} question={question} visual={{ takeaway: "No evaluation run yet.", node: <ArtEmptyState art="data" title="No evaluation run yet" body="Run the evaluation script (npm run eval) to score STRATA against the planted scenarios on seed A and the hold-out seed B." /> }} />;
  }

  const mB = holdB.metrics;
  const misses = holdB.per_scenario.filter((s) => resultOf(s) === "miss");
  const fas = mB.false_alarm_refs ?? [];
  const takeaway = `Hold-out B: found ${mB.scenarios_detected ?? "n/a"} of ${mB.scenarios_planted ?? "n/a"} planted scenarios${misses.length ? `, missed ${misses.map((s) => s.id).join(", ")}` : ""}; ${fmtNum(mB.false_alarms)} false alarm${mB.false_alarms === 1 ? "" : "s"}${fas.length ? ` (${fas.join(", ")})` : ""}; root cause right in ${fmtPct(mB.root_cause_acc, { signed: false })} of detections.`;
  const cmpA = (k: "precision" | "recall" | "root_cause_acc") => (seedA ? `Seed A (tuned): ${fmtPct(seedA.metrics[k], { signed: false })}` : "no seed A run");

  return (
    <PageTemplate
      explainKey="evaluation"
      title={title}
      question={question}
      glance={
        <MetricGroup title="Hold-out B at a glance">
          <Metric id="recall" label="Recall" value={fmtPct(mB.recall, { signed: false })} unit="of planted scenarios" compare={cmpA("recall")}
            meaning="Share of planted scenarios that STRATA detected on the hold-out seed."
            implication="Missed scenarios are problems the team would still find late." provenance="computed" />
          <Metric id="precision" label="Precision" value={fmtPct(mB.precision, { signed: false })} unit="of raised incidents" compare={cmpA("precision")}
            meaning="Share of raised incidents that match a planted scenario."
            implication="Lower precision means more noise for the team to triage." provenance="computed" />
          <Metric id="root_cause_acc" label="Root-cause accuracy" value={fmtPct(mB.root_cause_acc, { signed: false })} unit="of detected" compare={cmpA("root_cause_acc")}
            meaning="Of detected scenarios, share where the stated cause matches the planted cause."
            implication="A wrong cause sends the plan to the wrong owner." provenance="computed" />
        </MetricGroup>
      }
      visual={{
        takeaway,
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <div role="note" className="eval-note">
              <div style={{ fontWeight: 600, fontSize: "var(--fs-14)", marginBottom: "var(--sp-1)" }}>Read this first</div>
              <p style={{ margin: 0, fontSize: "var(--fs-14)", color: "var(--ink)" }}>{data.caveat}</p>
              <p className="caption" style={{ marginTop: "var(--sp-2)" }}>Lead time: {data.lead_time ?? "not computed in this build (needs a weekly backtest)."}</p>
            </div>
            <DataTable
              columns={compareCols}
              data={compareRows}
              provenance="computed"
              caption="What it is: every planted scenario and decoy, scored on the tuned seed A and the never-tuned hold-out B. What it implies: misses and false alarms are written out in words. 'ML also flagged?' is IsolationForest corroboration only: rules and statistics decide."
            />
          </div>
        ),
      }}
      actions={
        <>
          {misses[0]?.incidents?.[0] ? <Link className={buttonClass("primary")} href={`/app/incidents/${misses[0].incidents[0]}`}>Open the miss</Link> : null}
          {fas[0] ? <Link className={buttonClass(misses[0]?.incidents?.[0] ? "secondary" : "primary")} href={`/app/incidents/${fas[0]}`}>Open the false alarm {fas[0]}</Link> : null}
          <Link className={buttonClass("ghost")} href="/app/problems">See today&apos;s problems</Link>
        </>
      }
    >
      {data.isolation_forest ? (
        <Details title="Machine-learning corroboration (IsolationForest)" defaultOpen={open}>
          <p className="caption" style={{ margin: 0, maxWidth: "none" }}>{data.isolation_forest}</p>
          <p className="caption" style={{ margin: 0, maxWidth: "none" }}>
            Rules and statistics decide; ML only corroborates. Hold-out B: {mlSummary(holdB)} That is why it is shown as a column, not used as a detector.
          </p>
        </Details>
      ) : null}
      {runs.map((r) => <RunSection key={`${r.seed}-${r.is_holdout}`} run={r} defaultOpen={open} />)}
      <Details title="What we got wrong" defaultOpen={open}>
        <p className="muted" style={{ fontSize: "var(--fs-14)", margin: 0 }}>To be written by the team (human-authored).</p>
      </Details>
    </PageTemplate>
  );
}
