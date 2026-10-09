"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button, DataTable, ProvenanceBadge, StatusPill, type ColumnDef } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { Chips, prefersReducedMotion, type WbIncident } from "./shared";

const AGENT_LABEL: Record<string, string> = { sentinel: "Sentinel", investigator: "Investigator", memory: "Memory", orchestrator: "Orchestrator" };
type Inv = NonNullable<WbIncident["investigation"]>;
type Hyp = Inv["hypotheses"][number];

function timeOf(iso: string): string {
  // ISO timestamps in mono; keep seconds + ms so the sequence is visible.
  const m = /T(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/.exec(iso);
  return m ? m[1] : fmtDate(iso, true);
}

/** POST /incidents/{id}/investigate, then reload the case. */
export function useInvestigate(incident: WbIncident, onChanged: () => void) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = useCallback(async () => {
    setRunning(true);
    setErr(null);
    try {
      await apiPost(`/incidents/${encodeURIComponent(incident.id)}/investigate`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [incident.id, onChanged]);
  return { run, running, err };
}

/** The one call to action before a case is investigated. */
export function RunInvestigation({ incident, onChanged }: { incident: WbIncident; onChanged: () => void }) {
  const { run, running, err } = useInvestigate(incident, onChanged);
  return (
    <div className="run-investigation" data-testid="run-investigation">
      <p className="case-prose">
        The agents confirm the signals, rank the likely cause, look up similar past cases and draft a plan.
        Nothing is sent; a person decides.
      </p>
      <div>
        <Button variant="primary" onClick={run} disabled={running}>{running ? "Running investigation" : "Run investigation"}</Button>
      </div>
      {err ? <p className="caption case-error" role="alert">{err}</p> : null}
    </div>
  );
}

/** Small re-run control + validator status, shown once an investigation exists. */
export function InvestigationStatus({ incident, onChanged }: { incident: WbIncident; onChanged: () => void }) {
  const inv = incident.investigation;
  const { run, running, err } = useInvestigate(incident, onChanged);
  if (!inv) return null;
  return (
    <div className="case-inline-status">
      <StatusPill status={inv.grounding_ok ? "ok" : "failed"} label={inv.grounding_ok ? "Every sentence cites evidence" : "Evidence check failed"} />
      <span className="chip chip--mono">{inv.run_id}</span>
      <Button size="sm" variant="ghost" onClick={run} disabled={running}>{running ? "Re-running" : "Re-run"}</Button>
      {err ? <span className="caption case-error" role="alert">{err}</span> : null}
    </div>
  );
}

/** The cited narrative: each sentence with the evidence chips it rests on. */
export function Narrative({ incident, onChip }: { incident: WbIncident; onChip: (id: string) => void }) {
  const inv = incident.investigation;
  const labels = useMemo(() => Object.fromEntries(incident.evidence.map((e) => [e.id, e.label])), [incident.evidence]);
  if (!inv) return null;
  return (
    <ul className="case-narrative" aria-label="What the agents found">
      {inv.narrative.map((n, i) => (
        <li key={i}>
          <p>{n.text}</p>
          <Chips ids={n.evidence_ids} onChip={onChip} labels={labels} />
        </li>
      ))}
    </ul>
  );
}

/** The agent steps, in order. Animates in (180 ms per step) when a new run arrives after mount; instant with reduced motion. */
export function AgentSteps({ incident, onChip }: { incident: WbIncident; onChip: (id: string) => void }) {
  const inv = incident.investigation;
  const labels = useMemo(() => Object.fromEntries(incident.evidence.map((e) => [e.id, e.label])), [incident.evidence]);
  const firstRun = useRef(inv?.run_id ?? null);
  const [shown, setShown] = useState(99);

  useEffect(() => {
    if (!inv || inv.run_id === firstRun.current) return;
    firstRun.current = inv.run_id;
    if (prefersReducedMotion()) { setShown(99); return; }
    setShown(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= inv.steps.length) window.clearInterval(t);
    }, 180);
    return () => window.clearInterval(t);
  }, [inv]);

  if (!inv) return null;
  return (
    <div className="stack">
      <ol className="agent-steps">
        {inv.steps.slice(0, shown).map((s, i) => (
          <li key={`${s.agent}-${i}`} className="agent-steps__item">
            <div className="agent-steps__head">
              <strong>{i + 1}. {AGENT_LABEL[s.agent] ?? humanize(s.agent)}</strong>
              <span className="row">
                <span className="mono caption">{timeOf(s.started_at)} → {timeOf(s.finished_at)}</span>
                <StatusPill status={s.status} />
              </span>
            </div>
            <p className="case-prose">{s.summary}</p>
            {s.evidence_ids.length ? <Chips ids={s.evidence_ids} onChip={onChip} labels={labels} /> : null}
          </li>
        ))}
      </ol>
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-2)" }}>
        <span className="chip chip--mono">source: {inv.source}</span>
        <span className="chip chip--mono">retrieval: {inv.retrieval}</span>
        <span className="chip chip--mono">mode: {inv.mode}</span>
      </div>
      {inv.grounding_notes?.length ? (
        <ul className="caption" style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
          {inv.grounding_notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** Candidate causes with the conditions met and unmet. */
export function Hypotheses({ incident, onChip }: { incident: WbIncident; onChip: (id: string) => void }) {
  const inv = incident.investigation;
  const hypCols = useMemo<ColumnDef<Hyp>[]>(() => [
    { id: "cause", header: "Cause", accessorKey: "cause", cell: (c) => humanize(c.row.original.cause) },
    { id: "confidence", header: "Confidence", accessorKey: "confidence", meta: { numeric: true }, cell: (c) => c.row.original.confidence.toFixed(2) },
    {
      id: "met", header: "Conditions met", accessorFn: (r) => r.conditions.filter((x) => x.met).length,
      cell: (c) => (
        <div className="stack" style={{ gap: "var(--sp-1)", padding: "var(--sp-1) 0" }}>
          {c.row.original.conditions.filter((x) => x.met).map((x) => (
            <div key={x.text} className="row" style={{ flexWrap: "wrap" }}><span>{x.text}</span><Chips ids={x.evidence_ids} onChip={onChip} /></div>
          ))}
        </div>
      ),
    },
    {
      id: "unmet", header: "Unmet", accessorFn: (r) => r.conditions.filter((x) => !x.met).length,
      cell: (c) => {
        const un = c.row.original.conditions.filter((x) => !x.met);
        return un.length ? <div className="stack" style={{ gap: "var(--sp-1)" }}>{un.map((x) => <span key={x.text} className="muted">{x.text}</span>)}</div> : <span className="muted">none</span>;
      },
    },
  ], [onChip]);
  if (!inv) return null;
  return (
    <div className="stack" style={{ gap: "var(--sp-2)" }}>
      <DataTable
        columns={hypCols}
        data={inv.hypotheses}
        provenance="computed"
        caption="Candidate causes from the fixed list, scored by which conditions the evidence meets. The top row is the working cause; unmet conditions would weaken it."
        initialSort={[{ id: "confidence", desc: true }]}
      />
      <div className="row"><ProvenanceBadge provenance="computed" /><span className="caption">Confidence is a rule score, not a probability.</span></div>
    </div>
  );
}

/** Everything about the investigation in one block (kept for callers outside the case pipeline). */
export function AgentTrace({ incident, onChanged, onChip }: { incident: WbIncident; onChanged: () => void; onChip: (id: string) => void }) {
  if (!incident.investigation) return <RunInvestigation incident={incident} onChanged={onChanged} />;
  return (
    <div className="stack">
      <InvestigationStatus incident={incident} onChanged={onChanged} />
      <Narrative incident={incident} onChip={onChip} />
      <AgentSteps incident={incident} onChip={onChip} />
      <Hypotheses incident={incident} onChip={onChip} />
    </div>
  );
}
