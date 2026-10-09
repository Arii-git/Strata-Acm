"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPost } from "@/lib/api/client";
import { Button, Card, DataTable, EmptyState, ProvenanceBadge, StatusPill, type ColumnDef } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { Chips, prefersReducedMotion, type WbIncident } from "./shared";

const AGENT_LABEL: Record<string, string> = { sentinel: "Sentinel", investigator: "Investigator", memory: "Memory", orchestrator: "Orchestrator" };
type Hyp = NonNullable<WbIncident["investigation"]>["hypotheses"][number];

function timeOf(iso: string): string {
  // ISO timestamps in mono; keep seconds + ms so the sequence is visible.
  const m = /T(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/.exec(iso);
  return m ? m[1] : fmtDate(iso, true);
}

export function AgentTrace({ incident, onChanged, onChip }: { incident: WbIncident; onChanged: () => void; onChip: (id: string) => void }) {
  const inv = incident.investigation;
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);
  const [shown, setShown] = useState(99);
  const labels = useMemo(() => Object.fromEntries(incident.evidence.map((e) => [e.id, e.label])), [incident.evidence]);

  useEffect(() => {
    if (!animate || !inv) return;
    if (prefersReducedMotion()) { setShown(99); setAnimate(false); return; }
    setShown(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= inv.steps.length) { window.clearInterval(t); setAnimate(false); }
    }, 180);
    return () => window.clearInterval(t);
  }, [animate, inv]);

  const run = async () => {
    setRunning(true);
    setErr(null);
    try {
      await apiPost(`/incidents/${encodeURIComponent(incident.id)}/investigate`);
      setAnimate(true);
      setShown(0);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

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

  if (!inv) {
    return (
      <Card title="Agent trace">
        <EmptyState
          title="Not yet investigated"
          body="Run the four agents: Sentinel confirms the signals, Investigator ranks causes from the fixed taxonomy, Memory retrieves similar past cases, Orchestrator drafts a plan for human approval."
          action={<Button variant="primary" onClick={run} disabled={running}>{running ? "Running investigation" : "Run investigation"}</Button>}
        />
        {err ? <p className="caption" role="alert" style={{ color: "var(--crimson-700)" }}>{err}</p> : null}
      </Card>
    );
  }

  const visible = animate ? inv.steps.slice(0, shown) : inv.steps;

  return (
    <div className="stack">
      <Card title="Agent steps" provenance="computed" actions={<span className="chip chip--mono">{inv.run_id}</span>}>
        <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: "var(--sp-3)" }}>
          {visible.map((s, i) => (
            <li key={`${s.agent}-${i}`} style={{ borderLeft: "2px solid var(--line-strong)", paddingLeft: "var(--sp-3)" }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <strong>{i + 1}. {AGENT_LABEL[s.agent] ?? humanize(s.agent)}</strong>
                <span className="row">
                  <span className="mono caption">{timeOf(s.started_at)} → {timeOf(s.finished_at)}</span>
                  <StatusPill status={s.status} />
                </span>
              </div>
              <p style={{ margin: "var(--sp-1) 0" }}>{s.summary}</p>
              {s.evidence_ids.length ? <Chips ids={s.evidence_ids} onChip={onChip} labels={labels} /> : null}
            </li>
          ))}
        </ol>
        <div className="row" style={{ marginTop: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
          <StatusPill
            status={inv.grounding_ok ? "ok" : "failed"}
            label={inv.grounding_ok ? "Evidence-or-Silence validator passed" : "Evidence-or-Silence validator failed"}
          />
          <span className="chip chip--mono">source: {inv.source}</span>
          <span className="chip chip--mono">retrieval: {inv.retrieval}</span>
          <span className="chip chip--mono">mode: {inv.mode}</span>
          <Button size="sm" variant="ghost" onClick={run} disabled={running}>{running ? "Re-running" : "Re-run investigation"}</Button>
        </div>
        {inv.grounding_notes?.length ? (
          <ul className="caption" style={{ margin: "var(--sp-2) 0 0", paddingLeft: "var(--sp-4)" }}>
            {inv.grounding_notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        ) : null}
        {err ? <p className="caption" role="alert" style={{ color: "var(--crimson-700)" }}>{err}</p> : null}
      </Card>

      <Card title="Narrative" provenance="computed">
        <p className="caption" style={{ marginTop: 0 }}>Every sentence carries the evidence it rests on; click a chip to open that item on the Evidence tab.</p>
        <div className="stack" style={{ gap: "var(--sp-3)" }}>
          {inv.narrative.map((n, i) => (
            <div key={i}>
              <p style={{ margin: "0 0 var(--sp-1)" }}>{n.text}</p>
              <Chips ids={n.evidence_ids} onChip={onChip} labels={labels} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Hypotheses">
        <DataTable
          columns={hypCols}
          data={inv.hypotheses}
          provenance="computed"
          caption="What it is: candidate causes from the fixed taxonomy, each scored by which of its conditions the evidence meets. What it implies: the top row is the working cause; unmet conditions are what would weaken it."
          initialSort={[{ id: "confidence", desc: true }]}
        />
        <div className="row" style={{ marginTop: "var(--sp-2)" }}><ProvenanceBadge provenance="computed" /><span className="caption">Confidence is a rule score, not a probability.</span></div>
      </Card>
    </div>
  );
}
