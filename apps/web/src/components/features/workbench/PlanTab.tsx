"use client";

import { useMemo, useState } from "react";
import type { Note } from "@/lib/api/types";
import { apiPost } from "@/lib/api/client";
import { usePersona, personaLabel } from "@/lib/persona";
import { Button, Card, DataTable, EmptyState, ProvenanceBadge, StatusPill, TermHint, type ColumnDef } from "@/components/ui";
import { fmtDate, fmtPct, humanize } from "@/lib/format";
import { Chips, fmtHours, inputStyle, labelStyle, type PlanApproval, type WbDraft, type WbIncident, type WbOutcome, type WbPlan, type WbTask } from "./shared";
import { ApprovalBar } from "./ApprovalBar";
import { ConsequencePanel } from "./ConsequencePanel";
import { DecisionResult, type DecisionOutcome } from "./DecisionResult";

export function DraftCard({ draft, onChip }: { draft: WbDraft; onChip: (id: string) => void }) {
  const kind = draft.channel === "whatsapp_draft" ? "WhatsApp draft" : "Email draft";
  return (
    <section className="draft-card">
      <header className="draft-card__head">
        <strong>{kind} → {personaLabel(draft.to_role)}</strong>
        <span className="chip chip--mono">{draft.channel}</span>
      </header>
      <div className="draft-card__body">
        {draft.subject ? <div className="draft-card__subject">{draft.subject}</div> : null}
        <p className="case-prose" style={{ whiteSpace: "pre-wrap" }}>{draft.body}</p>
        {draft.evidence_ids?.length ? <Chips ids={draft.evidence_ids} onChip={onChip} /> : null}
      </div>
      <footer className="draft-card__foot caption">Simulated — not sent</footer>
    </section>
  );
}

/** Notes on the case (hand-offs with @role_key). */
export function NotesPanel({ incident, onChanged }: { incident: WbIncident; onChanged: () => void }) {
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
    <div className="stack" style={{ gap: "var(--sp-3)" }}>
      {notes.length ? (
        <ul className="case-notes">
          {notes.map((n, i) => (
            <li key={n.id ?? i}>
              <div className="caption" style={{ maxWidth: "none" }}><strong>{n.author}</strong> ({personaLabel(n.author_role)}) <span className="mono">{n.created_at ? fmtDate(n.created_at, true) : ""}</span></div>
              <div>{n.body}</div>
              {n.mentions?.length ? <div className="caption">mentions: {n.mentions.map(personaLabel).join(", ")}</div> : null}
            </li>
          ))}
        </ul>
      ) : <p className="caption" style={{ margin: 0 }}>No notes yet.</p>}
      <form onSubmit={submit} className="stack" style={{ gap: "var(--sp-2)" }}>
        <label style={labelStyle}>
          Add a note as {label} (type @account_manager to hand off)
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} style={inputStyle} />
        </label>
        <div className="row">
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !body.trim()}>{busy ? "Posting" : "Post note"}</Button>
          {err ? <span className="caption case-error" role="alert">{err}</span> : null}
        </div>
      </form>
    </div>
  );
}

/** The plan's numbered steps: action, owner, due time, the evidence each acts on. */
export function PlanSteps({ plan, onChip }: { plan: WbPlan; onChip: (id: string) => void }) {
  return (
    <ol className="plan-steps" aria-label="Plan steps">
      {plan.steps.map((s) => (
        <li key={s.n} className="plan-steps__item">
          <span className="plan-steps__n" aria-hidden="true">{s.n}</span>
          <div className="stack" style={{ gap: "var(--sp-1)" }}>
            <span className="plan-steps__action">{s.action}</span>
            <span className="caption" style={{ maxWidth: "none" }}>
              <b>{personaLabel(s.owner_role)}</b> · due {fmtHours(s.due_in_hours)} after approval
            </span>
            <Chips ids={s.evidence_ids} onChip={onChip} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PlanOrigin({ plan }: { plan: WbPlan }) {
  const origin = [plan.sop_ref, plan.memory_ref].filter(Boolean).join(" and ") || "agent templates";
  return (
    <ul className="case-facts">
      <li><span>Built from</span> <b className="mono">{origin}</b></li>
      <li><span>Decided by</span> <b>{personaLabel(plan.requires_role)}</b>{plan.four_eyes ? <> with <TermHint term="four_eyes" label="four-eyes" /> (two different named approvers)</> : null}</li>
      <li><span>Each step</span> cites the evidence it acts on, and becomes a simulated task for its owner on approval.</li>
      <li><span>Step sources</span> {[...new Set(plan.steps.map((s) => s.source))].map((s) => <span key={s} className="chip chip--mono">{s}</span>)}</li>
    </ul>
  );
}

export function PlanDrafts({ plan, onChip }: { plan: WbPlan; onChip: (id: string) => void }) {
  if (!plan.drafts.length) return <p className="caption" style={{ margin: 0 }}>No message drafts in this plan.</p>;
  return <div className="grid grid--2">{plan.drafts.map((d, i) => <DraftCard key={i} draft={d} onChip={onChip} />)}</div>;
}

export function planApprovals(incident: WbIncident, plan: WbPlan): PlanApproval[] {
  return (plan.approvals ?? (incident.approvals as PlanApproval[]).filter((a) => "decided_by" in a)) as PlanApproval[];
}

export function DecisionsList({ approvals }: { approvals: PlanApproval[] }) {
  if (!approvals.length) return <p className="caption" style={{ margin: 0 }}>No decisions yet.</p>;
  return (
    <ul className="case-decisions">
      {approvals.map((a) => (
        <li key={a.id}>
          <strong>{humanize(a.decision)}</strong> by {a.decided_by} ({personaLabel(a.decider_role)}) <span className="mono caption">{fmtDate(a.decided_at, true)}</span>
          {a.reason ? <div className="caption">Reason: {a.reason}</div> : null}
        </li>
      ))}
    </ul>
  );
}

export function TasksTable({ tasks }: { tasks: WbTask[] }) {
  const taskCols = useMemo<ColumnDef<WbTask>[]>(() => [
    { id: "id", header: "Task", accessorKey: "id" },
    { id: "title", header: "Title", accessorKey: "title" },
    { id: "owner_role", header: "Owner", accessorKey: "owner_role", cell: (c) => personaLabel(c.row.original.owner_role) },
    { id: "channel", header: "Channel", accessorKey: "channel", cell: (c) => humanize(c.row.original.channel) },
    { id: "due_at", header: "Due", accessorKey: "due_at", meta: { mono: true }, cell: (c) => fmtDate(c.row.original.due_at, true) },
    { id: "status", header: "Status", accessorKey: "status", cell: (c) => <StatusPill status={c.row.original.status} /> },
  ], []);
  return <DataTable columns={taskCols} data={tasks} provenance="synthetic" caption="Simulated tasks and drafts created on approval. Each owner has a dated item in Workflows; nothing was sent externally." />;
}

export function OutcomesTable({ outcomes }: { outcomes: WbOutcome[] }) {
  const outCols = useMemo<ColumnDef<WbOutcome>[]>(() => [
    { id: "kpi", header: "KPI", accessorKey: "kpi" },
    { id: "before_value", header: "Before", accessorKey: "before_value", meta: { numeric: true }, cell: (c) => fmtPct(c.row.original.before_value) },
    { id: "after_value", header: "After", accessorKey: "after_value", meta: { numeric: true }, cell: (c) => fmtPct(c.row.original.after_value) },
    { id: "verdict", header: "Verdict", accessorKey: "verdict", cell: (c) => <StatusPill status={c.row.original.verdict} tone={c.row.original.verdict === "improved" ? "ok" : "warn"} /> },
    { id: "measured_at", header: "Measured", accessorKey: "measured_at", meta: { mono: true }, cell: (c) => fmtDate(c.row.original.measured_at) },
    { id: "notes", header: "Notes", accessorKey: "notes", cell: (c) => <span className="caption">{c.row.original.notes}</span> },
  ], []);
  return (
    <div className="stack" style={{ gap: "var(--sp-2)" }}>
      <DataTable columns={outCols} data={outcomes} provenance="illustrative" caption="Before/after KPI after simulated days in the Lab. Illustrative counterfactual, not a measured result; it feeds the learning loop." />
      <div className="row"><ProvenanceBadge provenance="illustrative" /><span className="caption">Scripted counterfactual, not a measured result.</span></div>
    </div>
  );
}

/** Legacy all-in-one "What to do" block (kept for callers outside the case pipeline). */
export function PlanTab({
  incident, onChanged, onChip, decision, onDecided, onGoWhy,
}: {
  incident: WbIncident; onChanged: () => void; onChip: (id: string) => void;
  decision: DecisionOutcome | null; onDecided: (o: DecisionOutcome) => void; onGoWhy: () => void;
}) {
  const plan = incident.plan;
  if (!plan) {
    return (
      <div className="stack">
        <EmptyState title="No plan yet" body="A plan with owners and due times is drafted when the investigation runs." action={<Button variant="primary" onClick={onGoWhy}>Go to the investigation</Button>} />
        <Card title="Notes"><NotesPanel incident={incident} onChanged={onChanged} /></Card>
      </div>
    );
  }
  const awaiting = plan.status === "awaiting_approval";
  return (
    <div className="stack">
      {decision && decision.planId === plan.id ? <DecisionResult result={decision} incident={incident} /> : null}
      <Card title={`Plan ${plan.id} (version ${plan.version})`} actions={<StatusPill status={plan.status} label={humanize(plan.status)} />}>
        <p className="case-prose"><b>Goal:</b> {plan.expected_outcome}</p>
        <PlanSteps plan={plan} onChip={onChip} />
      </Card>
      {plan.drafts.length ? <Card title="Message drafts (simulated, not sent)"><PlanDrafts plan={plan} onChip={onChip} /></Card> : null}
      {awaiting ? (<><ConsequencePanel incident={incident} plan={plan} /><ApprovalBar plan={plan} onDecided={onDecided} /></>) : null}
      <Card title="Decisions so far"><DecisionsList approvals={planApprovals(incident, plan)} /></Card>
      {incident.tasks.length ? <Card title="Tasks created"><TasksTable tasks={incident.tasks} /></Card> : null}
      {incident.outcomes.length ? <Card title="Outcomes"><OutcomesTable outcomes={incident.outcomes} /></Card> : null}
      <Card title="Notes"><NotesPanel incident={incident} onChanged={onChanged} /></Card>
    </div>
  );
}
