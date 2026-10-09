"use client";

import { useMemo, useState } from "react";
import type { Note } from "@/lib/api/types";
import { apiPost } from "@/lib/api/client";
import { usePersona, personaLabel } from "@/lib/persona";
import { Button, Card, DataTable, EmptyState, ProvenanceBadge, StatusPill, TermHint, type ColumnDef } from "@/components/ui";
import { fmtDate, fmtPct, humanize } from "@/lib/format";
import { Chips, fmtHours, inputStyle, labelStyle, type PlanApproval, type WbDraft, type WbIncident, type WbOutcome, type WbTask } from "./shared";
import { ApprovalBar } from "./ApprovalBar";
import { ConsequencePanel } from "./ConsequencePanel";
import { DecisionResult, type DecisionOutcome } from "./DecisionResult";

export function DraftCard({ draft, onChip }: { draft: WbDraft; onChip: (id: string) => void }) {
  const kind = draft.channel === "whatsapp_draft" ? "WhatsApp draft" : "Email draft";
  return (
    <section style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--surface)" }}>
      <header className="row" style={{ justifyContent: "space-between", padding: "var(--sp-2) var(--sp-3)", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
        <strong style={{ fontSize: "var(--fs-13)" }}>{kind} → {personaLabel(draft.to_role)}</strong>
        <span className="chip chip--mono">{draft.channel}</span>
      </header>
      <div style={{ padding: "var(--sp-3)" }}>
        {draft.subject ? <div style={{ fontWeight: 600, marginBottom: "var(--sp-1)" }}>{draft.subject}</div> : null}
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{draft.body}</p>
        {draft.evidence_ids?.length ? <div style={{ marginTop: "var(--sp-2)" }}><Chips ids={draft.evidence_ids} onChip={onChip} /></div> : null}
      </div>
      <footer className="caption" style={{ padding: "var(--sp-2) var(--sp-3)", borderTop: "1px solid var(--line)" }}>Simulated — not sent</footer>
    </section>
  );
}

function NotesPanel({ incident, onChanged }: { incident: WbIncident; onChanged: () => void }) {
  const { persona, label } = usePersona();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const notes: Note[] = incident.notes ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/notes", { author_role: persona, author: label, body: body.trim(), mentions: [], incident_id: incident.id });
      setBody("");
      onChanged();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Notes on this incident">
      {notes.length ? (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: "0 0 var(--sp-3)", gap: "var(--sp-2)" }}>
          {notes.map((n, i) => (
            <li key={n.id ?? i} style={{ borderLeft: "2px solid var(--line-strong)", paddingLeft: "var(--sp-3)" }}>
              <div className="caption"><strong>{n.author}</strong> ({personaLabel(n.author_role)}) <span className="mono">{n.created_at ? fmtDate(n.created_at, true) : ""}</span></div>
              <div>{n.body}</div>
              {n.mentions?.length ? <div className="caption">mentions: {n.mentions.map(personaLabel).join(", ")}</div> : null}
            </li>
          ))}
        </ul>
      ) : <p className="caption muted">No notes yet.</p>}
      <form onSubmit={submit} className="stack" style={{ gap: "var(--sp-2)" }}>
        <label style={labelStyle}>
          Add a note as {label} (use @role_key, e.g. @account_manager, to hand off)
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} style={inputStyle} />
        </label>
        <div className="row">
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !body.trim()}>{busy ? "Posting" : "Post note"}</Button>
          {err ? <span className="caption" role="alert" style={{ color: "var(--crimson-700)" }}>{err}</span> : null}
        </div>
      </form>
    </Card>
  );
}

export function PlanTab({
  incident, onChanged, onChip, decision, onDecided, onGoWhy,
}: {
  incident: WbIncident; onChanged: () => void; onChip: (id: string) => void;
  decision: DecisionOutcome | null; onDecided: (o: DecisionOutcome) => void; onGoWhy: () => void;
}) {
  const plan = incident.plan;
  const taskCols = useMemo<ColumnDef<WbTask>[]>(() => [
    { id: "id", header: "Task", accessorKey: "id" },
    { id: "title", header: "Title", accessorKey: "title" },
    { id: "owner_role", header: "Owner", accessorKey: "owner_role", cell: (c) => personaLabel(c.row.original.owner_role) },
    { id: "channel", header: "Channel", accessorKey: "channel", cell: (c) => humanize(c.row.original.channel) },
    { id: "due_at", header: "Due", accessorKey: "due_at", meta: { mono: true }, cell: (c) => fmtDate(c.row.original.due_at, true) },
    { id: "status", header: "Status", accessorKey: "status", cell: (c) => <StatusPill status={c.row.original.status} /> },
  ], []);
  const outCols = useMemo<ColumnDef<WbOutcome>[]>(() => [
    { id: "kpi", header: "KPI", accessorKey: "kpi" },
    { id: "before_value", header: "Before", accessorKey: "before_value", meta: { numeric: true }, cell: (c) => fmtPct(c.row.original.before_value) },
    { id: "after_value", header: "After", accessorKey: "after_value", meta: { numeric: true }, cell: (c) => fmtPct(c.row.original.after_value) },
    { id: "verdict", header: "Verdict", accessorKey: "verdict", cell: (c) => <StatusPill status={c.row.original.verdict} tone={c.row.original.verdict === "improved" ? "ok" : "warn"} /> },
    { id: "measured_at", header: "Measured", accessorKey: "measured_at", meta: { mono: true }, cell: (c) => fmtDate(c.row.original.measured_at) },
    { id: "notes", header: "Notes", accessorKey: "notes", cell: (c) => <span className="caption">{c.row.original.notes}</span> },
  ], []);

  if (!plan) {
    return (
      <div className="stack case-tab">
        <EmptyState
          title="No plan yet"
          body="A plan with owners and due times is drafted when the investigation runs."
          action={<Button variant="primary" onClick={onGoWhy}>Go to: Why and what we did last time</Button>}
        />
        <NotesPanel incident={incident} onChanged={onChanged} />
      </div>
    );
  }

  const approvals = (plan.approvals ?? (incident.approvals as PlanApproval[]).filter((a) => "decided_by" in a)) as PlanApproval[];
  const awaiting = plan.status === "awaiting_approval";
  const origin = [plan.sop_ref, plan.memory_ref].filter(Boolean).join(" and ") || "agent templates";

  return (
    <div className="stack case-tab">
      {decision && decision.planId === plan.id ? <DecisionResult result={decision} incident={incident} /> : null}

      <section className="case-section" aria-labelledby="sec-plan">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3 id="sec-plan" className="case-section__title">Plan {plan.id} (version {plan.version})</h3>
          <StatusPill status={plan.status} label={humanize(plan.status)} />
        </div>
        <p style={{ margin: 0 }}><b>Goal:</b> {plan.expected_outcome}</p>
        <p className="caption" style={{ margin: 0 }}>
          Built from {origin}. Decided by {personaLabel(plan.requires_role)}{plan.four_eyes ? <> with <TermHint term="four_eyes" label="four-eyes" /> (two different named approvers)</> : ""}.
          Each step cites the evidence it acts on; on approval it becomes a simulated task for its owner.
        </p>
        <ol className="plan-steps" aria-label="Plan steps">
          {plan.steps.map((s) => (
            <li key={s.n} className="plan-steps__item">
              <span className="plan-steps__n" aria-hidden="true">{s.n}</span>
              <div className="stack" style={{ gap: "var(--sp-1)" }}>
                <span>{s.action}</span>
                <span className="caption">
                  Owner: <b>{personaLabel(s.owner_role)}</b> · due in <b>{fmtHours(s.due_in_hours)}</b> after approval · from <span className="mono">{s.source}</span>
                </span>
                <Chips ids={s.evidence_ids} onChip={onChip} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {plan.drafts.length ? (
        <section className="case-section" aria-labelledby="sec-drafts">
          <h3 id="sec-drafts" className="case-section__title">Message drafts (simulated, not sent)</h3>
          <div className="grid grid--2">{plan.drafts.map((d, i) => <DraftCard key={i} draft={d} onChip={onChip} />)}</div>
        </section>
      ) : null}

      {awaiting ? (
        <>
          <ConsequencePanel incident={incident} plan={plan} />
          <ApprovalBar plan={plan} onDecided={onDecided} />
        </>
      ) : null}

      <Card title="Decisions so far">
        {approvals.length ? (
          <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
            {approvals.map((a) => (
              <li key={a.id}>
                <strong>{humanize(a.decision)}</strong> by {a.decided_by} ({personaLabel(a.decider_role)}) <span className="mono caption">{fmtDate(a.decided_at, true)}</span>
                {a.reason ? <span className="caption"> reason: {a.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="caption muted" style={{ margin: 0 }}>No decisions yet.</p>}
      </Card>
      {incident.tasks.length ? (
        <Card title="Tasks created">
          <DataTable columns={taskCols} data={incident.tasks} provenance="synthetic" caption="What it is: simulated tasks and drafts created when the plan was approved. What it implies: each owner role now has a dated item in Workflows; nothing was sent externally." />
        </Card>
      ) : null}
      {incident.outcomes.length ? (
        <Card title="Outcomes">
          <DataTable columns={outCols} data={incident.outcomes} provenance="illustrative" caption="What it is: before/after KPI for this incident after simulated days in the Lab. What it implies: illustrative counterfactual, not a measured result; it feeds the learning loop." />
          <div className="row" style={{ marginTop: "var(--sp-2)" }}><ProvenanceBadge provenance="illustrative" /></div>
        </Card>
      ) : null}
      <NotesPanel incident={incident} onChanged={onChanged} />
    </div>
  );
}
