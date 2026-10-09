"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PageHeader, Card, Tabs, DataTable, EmptyState, ErrorState, Loading, StatusPill, Button, Caption, ProvenanceBadge,
  type ColumnDef,
} from "@/components/ui";
import { useApi, apiPatch, apiPost, qs } from "@/lib/api/client";
import { usePersona, personaLabel } from "@/lib/persona";
import { fmtDate, humanize } from "@/lib/format";
import type { Task } from "@/lib/api/types";

/* Local types (live engine shapes) */
interface NoteRow {
  id: string; created_at: string; author_role: string; author: string; body: string;
  mentions: string[]; incident_id: string | null; account_id: string | number | null;
}
interface RoutineRun { id: string; routine_id: string; ran_at_sim: string; outputs: string[]; simulated: boolean }
interface RoutineRow {
  id: string; name: string; cadence_days: number; creates: string; owner_role: string; status: string;
  approved_by?: string; approved_role?: string; approved_at?: string; last_run_sim?: string | null; runs: RoutineRun[];
}

const STATUSES = ["open", "in_progress", "blocked", "done"] as const;
const CHANNEL_LABEL: Record<string, string> = {
  task: "Task", whatsapp_draft: "WhatsApp draft", email_draft: "Email draft", digest: "Digest", note: "Note",
};
const DRAFT_CHANNELS = new Set(["whatsapp_draft", "email_draft"]);

const fieldStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", background: "var(--surface)",
  padding: "var(--sp-2) var(--sp-3)", fontSize: "var(--fs-14)",
};

function statusTone(s: string) {
  return s === "done" ? "ok" : s === "blocked" ? "bad" : s === "in_progress" ? "info" : "neutral";
}

/* ---------------------------------------------------------------- Tasks */
function TasksTab() {
  const { persona } = usePersona();
  const { data, error, loading, reload } = useApi<{ items: Task[] }>(qs("/workflows", { persona }));
  const [busy, setBusy] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState<string | null>(null);

  const setStatus = async (id: string, status: string) => {
    setBusy(id); setPatchErr(null);
    try { await apiPatch(`/workflows/${id}`, { status, persona }); reload(); }
    catch (e) { setPatchErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const columns = useMemo<ColumnDef<Task>[]>(() => [
    { accessorKey: "id", header: "ID", meta: { mono: true } },
    { accessorKey: "title", header: "Task" },
    { accessorKey: "owner_role", header: "Owner role", cell: (c) => personaLabel(c.getValue<string>()) },
    { accessorKey: "channel", header: "Channel", cell: (c) => CHANNEL_LABEL[c.getValue<string>()] ?? humanize(c.getValue<string>()) },
    { accessorKey: "origin", header: "Origin", cell: (c) => humanize(c.getValue<string>()) },
    { accessorKey: "due_at", header: "Due (sim)", cell: (c) => fmtDate(c.getValue<string>(), true) },
    {
      accessorKey: "status", header: "Status",
      cell: (c) => {
        const t = c.row.original;
        return (
          <select
            aria-label={`Status of ${t.id}`}
            value={t.status}
            disabled={busy === t.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStatus(t.id, e.target.value)}
            style={{ ...fieldStyle, width: "auto", padding: "2px var(--sp-2)", fontSize: "var(--fs-13)" }}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        );
      },
    },
    {
      accessorKey: "incident_ref", header: "Incident",
      cell: (c) => {
        const ref = c.getValue<string | null>();
        return ref ? <Link className="mono" href={`/app/incidents/${ref}`} onClick={(e) => e.stopPropagation()}>{ref}</Link> : <span className="muted">—</span>;
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busy, persona]);

  if (loading && !data) return <Loading rows={6} label="Loading tasks" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const items = data?.items ?? [];
  const drafts = items.filter((t) => DRAFT_CHANNELS.has(t.channel));

  return (
    <div className="stack">
      {patchErr ? <ErrorState error={new Error(patchErr)} title="Could not update the task" /> : null}
      {items.length === 0 ? (
        <EmptyState
          title="No tasks for this role yet"
          body="Tasks appear when a human approves an incident plan, or when an approved standing routine runs on the simulated clock."
          action={<Link href="/app/approvals">Go to Approvals</Link>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          provenance="synthetic"
          caption="What it is: every simulated task and draft owned by this role, created by approved plans or routines. What it implies: change the status as work moves; blocked items are the handoffs to chase first."
          initialSort={[{ id: "due_at", desc: false }]}
        />
      )}
      <Card title="Simulated outbox" provenance="synthetic">
        <Caption
          meaning="Drafts Strata prepared for a human to review and send through the usual channel."
          implication="Nothing here has been sent. Strata never contacts customers or suppliers itself."
        />
        {drafts.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--fs-13)" }}>No drafts for this role.</p>
        ) : (
          <div className="grid grid--2" style={{ marginTop: "var(--sp-3)" }}>
            {drafts.map((t) => <DraftCard key={t.id} task={t} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function DraftCard({ task }: { task: Task }) {
  const p = task.payload as { subject?: string; body?: string; to_role?: string };
  return (
    <article style={{ border: "1px solid var(--line-strong)", borderRadius: "var(--r-md)", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--line)" }} className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="pill pill--neutral">{CHANNEL_LABEL[task.channel] ?? humanize(task.channel)}</span>
          <span className="mono muted" style={{ fontSize: "var(--fs-12)" }}>{task.id}</span>
        </div>
        <div style={{ fontSize: "var(--fs-12)" }} className="muted">
          Owner: {personaLabel(task.owner_role)}{p.to_role ? ` · To: ${personaLabel(p.to_role)} (role)` : ""}
          {task.incident_ref ? <> · <Link className="mono" href={`/app/incidents/${task.incident_ref}`}>{task.incident_ref}</Link></> : null}
        </div>
        {p.subject ? <div style={{ fontWeight: 600, fontSize: "var(--fs-14)" }}>{p.subject}</div> : null}
      </div>
      <p style={{ padding: "var(--sp-3) var(--sp-4)", margin: 0, fontSize: "var(--fs-13)", whiteSpace: "pre-wrap", flex: 1 }}>{p.body ?? task.title}</p>
      <div style={{ padding: "var(--sp-2) var(--sp-4)", borderTop: "1px solid var(--line)", background: "var(--surface-2)", fontSize: "var(--fs-12)" }} className="muted">
        Simulated — not sent
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- Notes */
function NotesTab() {
  const { persona, label } = usePersona();
  const { data, error, loading, reload } = useApi<{ items: NoteRow[] }>("/notes");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true); setPostErr(null);
    try {
      await apiPost("/notes", { author_role: persona, author: label, body: body.trim(), mentions: [] });
      setBody(""); reload();
    } catch (err) { setPostErr(err instanceof Error ? err.message : String(err)); }
    finally { setPosting(false); }
  };

  return (
    <div className="grid grid--2" style={{ alignItems: "start" }}>
      <Card title="Leave a handoff note">
        <form onSubmit={submit} className="stack">
          <label className="stack" style={{ gap: "var(--sp-1)" }}>
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 500 }}>Note</span>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={fieldStyle}
              aria-describedby="note-hint"
            />
            <span id="note-hint" className="caption">Mention a role with @account_manager, @support_manager, @operations_manager… The engine extracts mentions.</span>
          </label>
          {postErr ? <p style={{ color: "var(--crimson-700)", fontSize: "var(--fs-13)" }}>Could not post: {postErr}</p> : null}
          <div className="row">
            <Button variant="primary" type="submit" disabled={posting || !body.trim()}>{posting ? "Posting…" : `Post as ${label}`}</Button>
          </div>
        </form>
      </Card>
      <Card title="Notes" provenance="synthetic">
        {loading && !data ? <Loading rows={4} label="Loading notes" />
          : error ? <ErrorState error={error} onRetry={reload} />
          : (data?.items.length ?? 0) === 0 ? <EmptyState title="No notes yet" body="Notes let one role hand context to another without a meeting." />
          : (
            <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data!.items.map((n) => (
                <li key={n.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "var(--sp-3)" }}>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--fs-13)" }}>{n.author} <span className="muted" style={{ fontWeight: 400 }}>· {personaLabel(n.author_role)}</span></span>
                    <span className="muted" style={{ fontSize: "var(--fs-12)" }}>{fmtDate(n.created_at, true)}</span>
                  </div>
                  <p style={{ margin: "var(--sp-1) 0", fontSize: "var(--fs-14)", whiteSpace: "pre-wrap" }}>{n.body}</p>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    {n.mentions.map((m) => <span key={m} className="chip">@{m}</span>)}
                    {n.incident_id ? <Link className="mono" style={{ fontSize: "var(--fs-12)" }} href={`/app/incidents/${n.incident_id}`}>{n.incident_id}</Link> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- Routines */
function RoutinesTab() {
  const { persona, label } = usePersona();
  const { data, error, loading, reload } = useApi<{ items: RoutineRow[] }>("/routines");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const approve = async (id: string) => {
    setBusy(id); setErr(null);
    try { await apiPost(`/routines/${id}/approve`, { persona, decided_by: label }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  if (loading && !data) return <Loading rows={4} label="Loading routines" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const items = data?.items ?? [];

  return (
    <div className="stack">
      <Caption
        meaning="Standing routines are approved once by a human, then run only on the simulated clock when the Simulation Lab advances time."
        implication="Their outputs are internal and simulated (tasks, drafts, digests, notes), nothing is sent, and every approval and run is written to the audit trail."
      />
      {err ? <ErrorState error={new Error(err)} title="Could not approve the routine" /> : null}
      {items.length === 0 ? <EmptyState title="No routines configured" body="Routines are defined in contracts/engagement_rules.yaml." /> : (
        <div className="grid grid--2">
          {items.map((r) => (
            <Card
              key={r.id}
              title={<><span className="mono" style={{ marginRight: "var(--sp-2)" }}>{r.id}</span>{r.name}</>}
              actions={<StatusPill status={r.status} tone={r.status === "approved" ? "ok" : "warn"} label={humanize(r.status)} />}
            >
              <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--sp-1) var(--sp-3)", fontSize: "var(--fs-13)", margin: 0 }}>
                <dt className="muted">Cadence</dt><dd style={{ margin: 0 }}>Every {r.cadence_days} simulated day{r.cadence_days === 1 ? "" : "s"}</dd>
                <dt className="muted">Creates</dt><dd style={{ margin: 0 }}>{r.creates}</dd>
                <dt className="muted">Owner role</dt><dd style={{ margin: 0 }}>{personaLabel(r.owner_role)}</dd>
                <dt className="muted">Approved</dt>
                <dd style={{ margin: 0 }}>{r.approved_by ? `${r.approved_by}${r.approved_role ? ` (${personaLabel(r.approved_role)})` : ""} · ${fmtDate(r.approved_at, true)}` : "Not yet"}</dd>
                <dt className="muted">Last run (sim)</dt><dd style={{ margin: 0 }}>{r.last_run_sim ? fmtDate(r.last_run_sim, true) : "Never"}</dd>
              </dl>
              {r.runs.length > 0 ? (
                <div style={{ marginTop: "var(--sp-3)" }}>
                  <div style={{ fontSize: "var(--fs-12)", fontWeight: 500 }} className="muted">Runs</div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "var(--fs-13)" }}>
                    {r.runs.map((run) => (
                      <li key={run.id} className="row" style={{ flexWrap: "wrap", marginTop: "var(--sp-1)" }}>
                        <span className="mono">{run.id}</span>
                        <span className="muted">{fmtDate(run.ran_at_sim, true)} (sim)</span>
                        {run.outputs.map((o) => <span key={o} className="chip chip--mono">{o}</span>)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.status !== "approved" ? (
                <div className="row" style={{ marginTop: "var(--sp-3)" }}>
                  <Button size="sm" variant="primary" disabled={busy === r.id} onClick={() => approve(r.id)}>
                    {busy === r.id ? "Approving…" : "Approve once"}
                  </Button>
                  <span className="caption">Approving as {label}.</span>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      <div className="row"><ProvenanceBadge provenance="synthetic" /><span className="caption">Routine runs and outputs exist only in the simulation.</span></div>
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <div className="stack">
      <PageHeader question="Who owns what, and what is stuck?" title="Workflows & Handoffs" />
      <Tabs
        tabs={[
          { id: "tasks", label: "Tasks", content: <TasksTab /> },
          { id: "notes", label: "Handoffs & Notes", content: <NotesTab /> },
          { id: "routines", label: "Standing Routines", content: <RoutinesTab /> },
        ]}
      />
    </div>
  );
}
