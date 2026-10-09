"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card, Button, buttonClass, SeverityPill, StatusPill, ProvenanceBadge, ErrorState, Caption, Details,
} from "@/components/ui";
import { useApi, apiPost, apiGet } from "@/lib/api/client";
import { fmtDate, fmtNum, humanize } from "@/lib/format";
import type { Severity } from "@/lib/api/types";

interface HealthResp { mode: "live" | "replay"; sim_now: string }
interface InjectResp { run_id: string; account_id: number; account_name: string; incident_ref: string | null; severity: Severity | null; risk_score: number | null }
interface InvestigateResp { cause: string | null; cause_confidence?: number | null; run_id?: string }
interface IncidentState { status: string; plan: { id: string; status: string } | null }
interface AdvanceResp {
  sim_now: string; outcomes_recorded: number; memory_written: string[];
  routine_outputs?: { routine_id: string; outputs: string[] }[];
}

function StepCard({ n, title, caption, done, children }: { n: number; title: string; caption: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Card
      title={<span className="row"><span className="mono" aria-hidden style={{ border: "1px solid var(--line-strong)", borderRadius: "var(--r-pill)", minWidth: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-12)" }}>{n}</span>Step {n}: {title}</span>}
      actions={done ? <StatusPill status="done" tone="ok" label="Done" /> : null}
    >
      <Caption meaning={caption} />
      <div className="stack" style={{ marginTop: "var(--sp-3)" }}>{children}</div>
    </Card>
  );
}

function errText(e: unknown) { return e instanceof Error ? e : new Error(String(e)); }

/** The original Lab: inject a pattern into the live synthetic data and walk one real case through the loop. */
export function LiveLoop() {
  const health = useApi<HealthResp>("/health");
  const replay = health.data?.mode === "replay";

  const [inject, setInject] = useState<InjectResp | null>(null);
  const [inv, setInv] = useState<InvestigateResp | null>(null);
  const [incState, setIncState] = useState<IncidentState | null>(null);
  const [adv, setAdv] = useState<AdvanceResp | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ step: string; error: Error } | null>(null);

  const run = async (step: string, fn: () => Promise<void>) => {
    setBusy(step); setErr(null);
    try { await fn(); } catch (e) { setErr({ step, error: errText(e) }); } finally { setBusy(null); }
  };

  const ref = inject?.incident_ref ?? null;

  const doInject = () => run("inject", async () => {
    const r = await apiPost<InjectResp>("/lab/inject", {});
    setInject(r); setInv(null); setIncState(null); setAdv(null); setResetDone(false);
  });
  const doInvestigate = () => run("investigate", async () => {
    if (!ref) return;
    setInv(await apiPost<InvestigateResp>(`/incidents/${encodeURIComponent(ref)}/investigate`, {}));
  });
  const checkApproval = () => run("approve", async () => {
    if (!ref) return;
    setIncState(await apiGet<IncidentState>(`/incidents/${encodeURIComponent(ref)}`));
  });
  const doAdvance = () => run("advance", async () => {
    setAdv(await apiPost<AdvanceResp>("/lab/advance", { days: 14 }));
    health.reload();
  });
  const doReset = () => {
    if (!window.confirm("Reset simulated state? This clears injected scenarios, investigations, approvals, tasks, outcomes and the simulated clock. Notebook entries and human-authored memory are never deleted.")) return;
    run("reset", async () => {
      await apiPost("/lab/reset", {});
      setInject(null); setInv(null); setIncState(null); setAdv(null); setResetDone(true);
      health.reload();
    });
  };

  const stepErr = (s: string) => (err?.step === s ? <ErrorState error={err.error} title="That step did not complete" /> : null);
  const approved = incState?.plan?.status === "approved" || incState?.status === "executing" || incState?.status === "resolved";

  const done = [!!inject, !!inv, approved, !!adv].filter(Boolean).length;
  const takeaway = !inject ? "Step 1 of 4: inject the supplier-delay pattern into a healthy stockist to start the loop."
    : !ref ? "The injected pattern was not detected; reset and try again."
    : !inv ? `Detected as ${ref}${inject.severity ? ` (${inject.severity})` : ""}. Step 2 of 4: investigate it.`
    : !approved ? `Likely cause: ${inv.cause ? humanize(inv.cause) : "undetermined"}. Step 3 of 4: a human approves the plan.`
    : !adv ? `${ref} plan approved. Step 4 of 4: fast-forward 14 simulated days to record the (scripted) outcome.`
    : `Loop closed: ${fmtNum(adv.outcomes_recorded)} outcome${adv.outcomes_recorded === 1 ? "" : "s"} recorded (illustrative), ${fmtNum(adv.memory_written.length)} memory item${adv.memory_written.length === 1 ? "" : "s"} written.`;

  return (
    <div className="stack lab-live">
      <div className="lab-live__head">
        <p className="lab-live__takeaway">{takeaway}</p>
        <span className="lab-live__progress"><strong className="num">{fmtNum(done)}</strong> of 4 steps <ProvenanceBadge provenance="computed" /></span>
      </div>
          <div className="stack">
      <div role="note" style={{ border: "1px solid var(--line-strong)", borderLeft: "4px solid var(--amber-600)", background: "var(--surface)", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-4)", fontSize: "var(--fs-13)" }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>Mode: {health.data ? humanize(health.data.mode) : "…"}</span>
          {health.data ? <span className="muted">· Simulated clock {fmtDate(health.data.sim_now, true)}</span> : null}
        </div>
        <p style={{ margin: "var(--sp-1) 0 0" }}>
          {replay
            ? "Replay mode: only pre-recorded runs are available. Injecting new scenarios may be unavailable."
            : "Everything here runs on synthetic data and a simulated clock. Fast-forward outcomes are scripted counterfactuals, not measured results. In replay mode only pre-recorded runs are available."}
        </p>
      </div>

      <StepCard n={1} title="Inject" done={!!inject}
        caption="Plants the S01 supplier-delay pattern into a healthy tier-A stockist that has no open incident. The detector then re-scans and should raise a new incident on its own.">
        <div className="row"><Button variant="primary" onClick={doInject} disabled={busy !== null}>{busy === "inject" ? "Injecting…" : "Inject supplier-delay pattern (S01 template) into a healthy stockist"}</Button></div>
        {stepErr("inject")}
        {inject ? (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--sp-1) var(--sp-3)", fontSize: "var(--fs-13)", margin: 0 }}>
            <dt className="muted">Lab run</dt><dd style={{ margin: 0 }} className="mono">{inject.run_id}</dd>
            <dt className="muted">Account</dt><dd style={{ margin: 0 }}><Link href={`/app/accounts/${inject.account_id}`}>{inject.account_name}</Link></dd>
            <dt className="muted">New incident</dt>
            <dd style={{ margin: 0 }}>{inject.incident_ref ? <Link className="mono" href={`/app/incidents/${inject.incident_ref}`}>{inject.incident_ref}</Link> : <span style={{ color: "var(--crimson-700)" }}>Not detected (the detector did not raise an incident)</span>}</dd>
            <dt className="muted">Severity</dt><dd style={{ margin: 0 }}>{inject.severity ? <SeverityPill severity={inject.severity} /> : "n/a"}</dd>
            <dt className="muted">Risk score</dt><dd style={{ margin: 0 }} className="num">{inject.risk_score === null ? "n/a" : fmtNum(inject.risk_score)} <ProvenanceBadge provenance="computed" /></dd>
          </dl>
        ) : null}
      </StepCard>

      <StepCard n={2} title="Investigate" done={!!inv}
        caption="Runs the agent pipeline on the new incident: it tests cause hypotheses against the evidence and retrieves similar past cases from memory.">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Button onClick={doInvestigate} disabled={!ref || busy !== null}>{busy === "investigate" ? "Investigating…" : "Investigate"}</Button>
          {ref ? <Link className={buttonClass("ghost", "sm")} href={`/app/incidents/${ref}?tab=trace`}>Open agent trace</Link> : <span className="caption">Inject first.</span>}
        </div>
        {stepErr("investigate")}
        {inv ? (
          <p style={{ margin: 0, fontSize: "var(--fs-14)" }}>
            Most likely cause: <strong>{inv.cause ? humanize(inv.cause) : "undetermined"}</strong>
            {typeof inv.cause_confidence === "number" ? <span className="muted"> (confidence {fmtNum(inv.cause_confidence * 100)} / 100)</span> : null}
          </p>
        ) : null}
      </StepCard>

      <StepCard n={3} title="Approve" done={approved}
        caption="A human must approve the plan in the incident's Plan tab. Strata never approves its own plans; approval creates simulated tasks and drafts only.">
        <div className="row" style={{ flexWrap: "wrap" }}>
          {ref ? <Link className={buttonClass("primary")} href={`/app/incidents/${ref}?tab=plan`}>Open the Plan tab to approve</Link> : <span className="caption">Inject and investigate first.</span>}
          <Button size="sm" variant="ghost" onClick={checkApproval} disabled={!ref || busy !== null}>Check approval status</Button>
        </div>
        {stepErr("approve")}
        {incState ? <p style={{ margin: 0, fontSize: "var(--fs-13)" }}>Incident status: <strong>{humanize(incState.status)}</strong>{incState.plan ? <> · Plan <span className="mono">{incState.plan.id}</span>: {humanize(incState.plan.status)}</> : " · No plan yet"}</p> : null}
      </StepCard>

      <StepCard n={4} title="Fast-forward" done={!!adv}
        caption="Moves the simulated clock 14 days. Executing incidents get scripted after-values, outcomes are written to memory, and approved standing routines run.">
        <div className="row"><Button onClick={doAdvance} disabled={busy !== null}>{busy === "advance" ? "Advancing…" : "Advance 14 simulated days"}</Button></div>
        {stepErr("advance")}
        {adv ? (
          <div className="stack" style={{ gap: "var(--sp-2)" }}>
            <div className="row"><ProvenanceBadge provenance="illustrative" /><span className="caption">Scripted counterfactual, not a measured result.</span></div>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--sp-1) var(--sp-3)", fontSize: "var(--fs-13)", margin: 0 }}>
              <dt className="muted">Simulated clock now</dt><dd style={{ margin: 0 }}>{fmtDate(adv.sim_now, true)}</dd>
              <dt className="muted">Outcomes recorded</dt><dd style={{ margin: 0 }} className="num">{fmtNum(adv.outcomes_recorded)}</dd>
              <dt className="muted">Memory written</dt>
              <dd style={{ margin: 0 }} className="row">{adv.memory_written.length ? adv.memory_written.map((m) => <span key={m} className="chip chip--mono">{m}</span>) : <span className="muted">none</span>}</dd>
              <dt className="muted">Routine outputs</dt>
              <dd style={{ margin: 0 }}>
                {adv.routine_outputs && adv.routine_outputs.length
                  ? adv.routine_outputs.map((r) => <div key={r.routine_id} className="row" style={{ flexWrap: "wrap" }}><span className="mono">{r.routine_id}</span>{r.outputs.map((o) => <span key={o} className="chip chip--mono">{o}</span>)}</div>)
                  : <span className="muted">none (no approved routines)</span>}
              </dd>
            </dl>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link className={buttonClass("ghost", "sm")} href="/app/outcomes">See Outcomes</Link>
              <Link className={buttonClass("ghost", "sm")} href="/app/workflows">See Workflows</Link>
            </div>
          </div>
        ) : null}
      </StepCard>

          </div>
      {ref ? <div className="row"><Link className={buttonClass("primary")} href={`/app/incidents/${ref}`}>Open {ref}</Link></div> : null}
      <Details title="Reset the simulation" defaultOpen={resetDone}>
      <StepCard n={5} title="Reset" done={resetDone}
        caption="Restores the simulated state so the demo can run again. It never deletes Engineering Notebook entries or human-authored memory.">
        <div className="row"><Button variant="danger" onClick={doReset} disabled={busy !== null}>{busy === "reset" ? "Resetting…" : "Reset simulated state"}</Button></div>
        {stepErr("reset")}
        {resetDone ? <p style={{ margin: 0, fontSize: "var(--fs-13)" }}>Simulated state restored.</p> : null}
      </StepCard>
      </Details>
    </div>
  );
}
