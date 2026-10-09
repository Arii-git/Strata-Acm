"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Card, DataTable, Details, ErrorState, Loading, Metric, MetricGroup, PageTemplate, StatusPill, Button, Caption, ProvenanceBadge, buttonClass,
  type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { useApi, apiPatch, apiPost, qs, type ApiState } from "@/lib/api/client";
import { usePersona, personaLabel } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";
import { fmtDate, fmtNum, humanize } from "@/lib/format";
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

/* ---------------------------------------------------------------- Tasks */
function TasksTable({ tasks }: { tasks: ApiState<{ items: Task[] }> }) {
  const { persona } = usePersona();
  const { data, error, loading, reload } = tasks;
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
            className="select"
            value={t.status}
            disabled={busy === t.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStatus(t.id, e.target.value)}
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

  return (
    <div className="stack">
      {patchErr ? <ErrorState error={new Error(patchErr)} title="Could not update the task" /> : null}
      {items.length === 0 ? (
        <ArtEmptyState
          art="tasks"
          title="No tasks for this role yet"
          body="Tasks appear when a human approves an incident plan, or when an approved standing routine runs on the simulated clock."
          action={<Link className={buttonClass("secondary", "sm")} href="/app/approvals">Go to Approvals</Link>}
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
    </div>
  );
}

function Outbox({ tasks }: { tasks: Task[] }) {
  const drafts = tasks.filter((t) => DRAFT_CHANNELS.has(t.channel));
  return (
    <div className="stack">
      <div className="row"><ProvenanceBadge provenance="synthetic" />
        <Caption
          meaning="Drafts STRATA prepared for a human to review and send through the usual channel."
          implication="Nothing here has been sent. STRATA never contacts customers or suppliers itself."
        />
      </div>
      {drafts.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--fs-13)" }}>No drafts for this role.</p>
      ) : (
        <div className="grid grid--2">
          {drafts.map((t) => <DraftCard key={t.id} task={t} />)}
        </div>
      )}
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
function NotesSection() {
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
        <form onSubmit={submit} className="stack" id="handoff-note">
          <label className="stack" style={{ gap: "var(--sp-1)" }}>
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 500 }}>Note</span>
            <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} style={fieldStyle} aria-describedby="note-hint" />
            <span id="note-hint" className="caption">Mention a role with @account_manager, @support_manager, @operations_manager… The engine extracts mentions.</span>
          </label>
          {postErr ? <p role="alert" style={{ color: "var(--crimson-700)", fontSize: "var(--fs-13)" }}>Could not post: {postErr}</p> : null}
          <div className="row">
            <Button variant="primary" type="submit" disabled={posting || !body.trim()}>{posting ? "Posting…" : `Post as ${label}`}</Button>
          </div>
        </form>
      </Card>
      <Card title="Notes" provenance="synthetic">
        {loading && !data ? <Loading rows={4} label="Loading notes" />
          : error ? <ErrorState error={error} onRetry={reload} />
          : (data?.items.length ?? 0) === 0 ? <ArtEmptyState art="notebook" title="No notes yet" body="Notes let one role hand context to another without a meeting." />
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
function RoutinesSection({ routines }: { routines: ApiState<{ items: RoutineRow[] }> }) {
  const { persona, label } = usePersona();
  const { data, error, loading, reload } = routines;
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
      {items.length === 0 ? <ArtEmptyState art="tasks" title="No routines configured" body="Routines are defined in contracts/engagement_rules.yaml." /> : (
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

function takeaway(tasks: Task[] | null, role: string): string {
  if (!tasks) return "Loading tasks…";
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) return tasks.length ? `All ${fmtNum(tasks.length)} tasks for ${role} are done.` : `No tasks for ${role} yet; they appear after a plan is approved.`;
  const blocked = open.filter((t) => t.status === "blocked").length;
  const next = [...open].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  return `${fmtNum(open.length)} open task${open.length === 1 ? "" : "s"} for ${role}${blocked ? `, ${fmtNum(blocked)} blocked` : ""}; next due: ${next.title} (${fmtDate(next.due_at, true)}, simulated).`;
}

export default function WorkflowsPage() {
  const { persona, label } = usePersona();
  const { mode } = useViewMode();
  const open = mode === "detailed";
  const tasks = useApi<{ items: Task[] }>(qs("/workflows", { persona }));
  const routines = useApi<{ items: RoutineRow[] }>("/routines");
  const items = tasks.data?.items ?? [];
  const openTasks = items.filter((t) => t.status !== "done");
  const blocked = openTasks.filter((t) => t.status === "blocked").length;
  const drafts = items.filter((t) => DRAFT_CHANNELS.has(t.channel)).length;
  const rItems = routines.data?.items ?? [];
  const approvedR = rItems.filter((r) => r.status === "approved").length;

  return (
    <PageTemplate
      explainKey="workflows"
      title="Workflows & Handoffs"
      question="Who owns what, and what is stuck?"
      glance={tasks.data ? (
        <MetricGroup title="At a glance">
          <Metric id="tasks_open" label="Open tasks" value={fmtNum(openTasks.length)} unit={openTasks.length === 1 ? "task" : "tasks"}
            compare={`for ${label}; ${fmtNum(blocked)} blocked`}
            meaning="Simulated tasks owned by this role that are not done."
            implication={blocked ? "Chase the blocked handoffs first." : "Nothing is blocked."}
            provenance="computed" next={{ label: "Plans waiting for approval", href: "/app/approvals" }} />
          <Metric id="drafts_waiting" label="Drafts to review" value={fmtNum(drafts)} unit={drafts === 1 ? "draft" : "drafts"}
            compare="WhatsApp and email drafts, never sent"
            meaning="Messages STRATA prepared for a human to review and send through the usual channel."
            implication="Nothing is sent automatically." provenance="computed" />
          <Metric id="routines_approved" label="Routines approved" value={fmtNum(approvedR)} unit={`of ${fmtNum(rItems.length)}`}
            compare="standing routines a human approved once"
            meaning="Routines run only on the simulated clock after one human approval."
            implication={approvedR < rItems.length ? "Unapproved routines never run." : "All routines will run when the Lab advances time."}
            provenance="computed" next={{ label: "Advance time in the Lab", href: "/app/lab" }} />
        </MetricGroup>
      ) : undefined}
      visual={{ takeaway: takeaway(tasks.data?.items ?? null, label), node: <TasksTable tasks={tasks} /> }}
      actions={
        <>
          <Link className={buttonClass("primary")} href="/app/approvals">Review plans waiting for approval</Link>
          <a className={buttonClass("secondary")} href="#handoff-note">Leave a handoff note</a>
        </>
      }
    >
      <Details title={`Simulated outbox (${fmtNum(drafts)})`} defaultOpen={open}>
        <Outbox tasks={items} />
      </Details>
      <Details title="Handoffs & notes" defaultOpen={open}>
        <NotesSection />
      </Details>
      <Details title={`Standing routines (${fmtNum(approvedR)} of ${fmtNum(rItems.length)} approved)`} defaultOpen={open}>
        <RoutinesSection routines={routines} />
      </Details>
    </PageTemplate>
  );
}
