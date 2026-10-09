"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, EvidenceChip, announce } from "@/components/ui";
import { DeadlineCountdown, ProvisionalActions, RiskLevelBadge, useActor, type AgenticItem } from "@/components/features/agentic";
import { apiPost } from "@/lib/api/client";
import { fmtINR } from "@/lib/format";
import { personaLabel } from "@/lib/persona";

type Busy = "approve" | "reject" | "delegate" | "plan" | null;

function allowedRoles(req: string): string[] {
  return req === "qa_head" ? ["qa_head"] : [req, "operations_manager", "business_head"];
}

/** One case waiting for a decision: level, deadline, what the agent will do, and the three choices. */
export function ApprovalRow({ item, simNow, onChanged }: { item: AgenticItem; simNow: string | null; onChanged: () => void }) {
  const actor = useActor();
  const [busy, setBusy] = useState<Busy>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const hasOpenPlan = item.plan_id !== null && item.plan_status === "awaiting_approval";
  const roles = allowedRoles(item.requires_role);
  const mayDecide = roles.includes(actor.persona);
  const humanOnly = item.mode === "human_only";
  const provisional = item.status === "provisional" && item.auto_decision?.kind === "provisional";
  const needed = item.four_eyes ? 2 : 1;
  const delegateHint = `delegate-hint-${item.ref}`;
  const roleHint = `role-hint-${item.ref}`;

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<{ message?: string }>, okText: string) {
    setBusy(kind);
    setNote(null);
    try {
      const r = await fn();
      const text = r.message ?? okText;
      setNote({ ok: true, text });
      announce(text);
      setRejecting(false);
      setReason("");
      onChanged();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Something went wrong.";
      setNote({ ok: false, text });
      announce(text, "assertive");
    } finally {
      setBusy(null);
    }
  }

  const decide = (decision: "approved" | "rejected") =>
    run(decision === "approved" ? "approve" : "reject",
      () => apiPost(`/plans/${encodeURIComponent(item.plan_id ?? "")}/decision`, {
        decision, reason: decision === "rejected" ? reason.trim() : undefined, persona: actor.persona, decided_by: actor.by,
      }), decision === "approved" ? "Approved." : "Rejected.");

  const delegate = () => run("delegate",
    () => apiPost<{ decision: { rationale: string } }>(`/agentic/levels/${encodeURIComponent(item.ref)}/delegate`, actor)
      .then((r) => ({ message: `The agent acted: ${r.decision.rationale}` })), "The agent acted.");

  const draftPlan = () => run("plan", () => apiPost(`/incidents/${encodeURIComponent(item.ref)}/plan`).then(() => ({ message: "Plan drafted. Review it below." })), "Plan drafted.");

  return (
    <li className={`aq__row aq__row--l${item.level}`} data-testid="approval-card">
      <div className="aq__top">
        <RiskLevelBadge level={item.level} />
        <Link href={`/app/incidents/${encodeURIComponent(item.ref)}?tab=todo`} className="aq__title">{item.title}</Link>
        <span className="aq__deadline"><DeadlineCountdown deadline={item.decision_deadline} mode={item.mode} now={simNow} status={item.status} /></span>
      </div>
      <p className="aq__meta">
        <span className="mono">{item.ref}{item.plan_id ? ` · ${item.plan_id}` : ""}</span>
        {item.account_name ? <span>{item.account_name}</span> : null}
        <span>Needs {personaLabel(item.requires_role)}</span>
        {item.four_eyes ? <span>Four-eyes: {item.approvals_so_far} of {needed}</span> : null}
        <span>{fmtINR(item.value_at_stake)} exposed <span className="caption">(not a forecast)</span></span>
      </p>
      <p className={`aq__mode aq__mode--${item.status}`}>{item.mode_line}</p>

      {item.auto_decision && item.status !== "awaiting_human" ? (
        <div className="aq__agent">
          <span className="section-label">Agent rationale</span>
          <p>{item.auto_decision.rationale}</p>
          {item.auto_decision.evidence_ids.length ? (
            <span className="ag-log__ev" aria-label="Evidence used">
              {item.auto_decision.evidence_ids.slice(0, 3).map((id) => <EvidenceChip key={id} id={id} />)}
            </span>
          ) : null}
        </div>
      ) : null}

      <details className="aq__why">
        <summary>Why level {item.level}?</summary>
        <ul>{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </details>

      {provisional && item.auto_decision ? (
        <ProvisionalActions decisionId={item.auto_decision.id} onDone={() => onChanged()} />
      ) : (
        <div className="ag-actions">
          {hasOpenPlan ? (
            <>
              <Button variant="primary" size="sm" disabled={busy !== null || !mayDecide} aria-describedby={!mayDecide ? roleHint : undefined}
                onClick={() => decide("approved")}>{busy === "approve" ? "Approving…" : "Approve"}</Button>
              <Button variant="secondary" size="sm" disabled={busy !== null || !mayDecide} aria-expanded={rejecting}
                aria-describedby={!mayDecide ? roleHint : undefined} onClick={() => setRejecting((v) => !v)}>Reject</Button>
            </>
          ) : item.plan_id === null ? (
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={draftPlan}>{busy === "plan" ? "Drafting…" : "Draft the plan"}</Button>
          ) : null}
          <Button variant="ghost" size="sm" disabled={busy !== null || humanOnly || item.status !== "awaiting_human"}
            aria-describedby={humanOnly ? delegateHint : undefined} onClick={delegate}>
            {busy === "delegate" ? "Agent is deciding…" : "Let the agent decide"}
          </Button>
          {humanOnly ? <span id={delegateHint} className="caption">Humans only for this case.</span> : null}
          {!mayDecide && hasOpenPlan ? <span id={roleHint} className="caption">Only {roles.map(personaLabel).join(" / ")} can approve.</span> : null}
        </div>
      )}

      {rejecting ? (
        <form className="aq__reject" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) decide("rejected"); }}>
          <label htmlFor={`reason-${item.ref}`}>Why reject? It is saved as a lesson for next time.</label>
          <div className="row">
            <input id={`reason-${item.ref}`} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
            <Button type="submit" variant="danger" size="sm" disabled={!reason.trim() || busy !== null}>{busy === "reject" ? "Rejecting…" : "Reject plan"}</Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {note ? <p role="status" className={note.ok ? "aq__ok" : "aq__err"}>{note.text}</p> : null}
    </li>
  );
}
