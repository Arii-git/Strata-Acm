"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader, Card, Metric, DataTable, ErrorState, Loading, EmptyState, SeverityPill, type ColumnDef } from "@/components/ui";
import { useApi } from "@/lib/api/client";
import { fmtPct, fmtNum, humanize } from "@/lib/format";
import type { Severity } from "@/lib/api/types";

interface Scenario {
  id: string; title: string; kind: string; planted: boolean; expected: string; detected: boolean; incidents: string[];
  severity: Severity | null; risk_score: number | null; cause: string | null; truth_cause: string | null;
  cause_ok: boolean | null; hit: boolean | null; note: string;
}
interface Run {
  seed: number; is_holdout: boolean;
  metrics: {
    precision: number; recall: number; root_cause_acc: number; incidents?: number; false_alarms: number;
    false_alarm_refs?: string[]; scenarios_planted?: number; scenarios_detected?: number;
  };
  hero_deltas?: Record<string, number>;
  per_scenario: Scenario[];
}
interface EvalResp { runs: Run[]; caveat: string }

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

function ResultCell({ s }: { s: Scenario }) {
  const r = resultOf(s);
  if (r === "miss" || r === "false_alarm") {
    return <span style={{ color: "var(--crimson-700)", fontWeight: 600 }}>{r === "miss" ? "MISS (not detected)" : "False alarm (decoy flagged)"}</span>;
  }
  if (r === "cut") return <span className="muted">{RESULT_LABEL[r]}</span>;
  return <span style={{ color: "var(--green-700)" }}>{RESULT_LABEL[r]}</span>;
}

function runName(r: Run) {
  return r.is_holdout ? `Hold-out B (seed ${r.seed}, never tuned)` : `Seed A (seed ${r.seed}, used for tuning)`;
}

function RunSection({ run }: { run: Run }) {
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
    <Card title={runName(run)} provenance="computed">
      <div className="stack">
        <div className="grid grid--4">
          <Metric label="Precision" value={fmtPct(m.precision, { signed: false })}
            meaning="Share of raised incidents that match a planted scenario."
            implication="Lower precision means more noise for the team to triage." provenance="computed" />
          <Metric label="Recall" value={fmtPct(m.recall, { signed: false })}
            meaning="Share of planted scenarios that Strata detected."
            implication="Missed scenarios are problems the team would still find late." provenance="computed" />
          <Metric label="Root-cause accuracy" value={fmtPct(m.root_cause_acc, { signed: false })}
            meaning="Of detected scenarios, share where the stated cause matches the planted cause."
            implication="A wrong cause sends the plan to the wrong owner." provenance="computed" />
          <Metric label="False alarms" value={fmtNum(m.false_alarms)}
            meaning={m.false_alarm_refs && m.false_alarm_refs.length ? `Incidents with no matching planted scenario: ${m.false_alarm_refs.join(", ")}.` : "Incidents with no matching planted scenario."}
            implication={`Scenarios detected: ${m.scenarios_detected ?? "n/a"} of ${m.scenarios_planted ?? "n/a"} planted.`}
            provenance="computed" tone={m.false_alarms > 0 ? "elevated" : "default"} />
        </div>
        <DataTable
          columns={columns}
          data={run.per_scenario}
          provenance="computed"
          caption="What it is: each planted scenario (S01–S12) and whether Strata found it with the right cause; decoys should stay silent. What it implies: misses and false alarms are labelled in text, and scenarios not planted in this build are greyed out and excluded from the scores."
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
      </div>
    </Card>
  );
}

export default function EvaluationPage() {
  const { data, error, loading, reload } = useApi<EvalResp>("/eval/latest");

  return (
    <div className="stack">
      <PageHeader question="How good is Strata, honestly?" title="Evaluation" />
      {loading && !data ? <Loading rows={8} label="Loading evaluation" />
        : error ? <ErrorState error={error} onRetry={reload} />
        : !data || data.runs.length === 0 ? <EmptyState title="No evaluation run yet" body="Run the evaluation script to score Strata against the planted scenarios." />
        : (
          <>
            <div role="note" style={{ border: "1px solid var(--line-strong)", borderLeft: "4px solid var(--amber-600)", background: "var(--surface)", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-4)" }}>
              <div style={{ fontWeight: 600, fontSize: "var(--fs-14)", marginBottom: "var(--sp-1)" }}>Read this first</div>
              <p style={{ margin: 0, fontSize: "var(--fs-14)", color: "var(--ink)" }}>{data.caveat}</p>
              <p className="caption" style={{ marginTop: "var(--sp-2)" }}>Lead time: not computed in this build (needs a weekly backtest).</p>
            </div>
            {[...data.runs].sort((a, b) => Number(a.is_holdout) - Number(b.is_holdout)).map((r) => <RunSection key={`${r.seed}-${r.is_holdout}`} run={r} />)}
            <Card title="What we got wrong">
              <p className="muted" style={{ fontSize: "var(--fs-14)", margin: 0 }}>To be written by the team (human-authored).</p>
            </Card>
          </>
        )}
    </div>
  );
}
