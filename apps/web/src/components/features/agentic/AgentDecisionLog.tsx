"use client";

import "@/styles/lanes/agentic.css";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, EvidenceChip, StatusPill, announce, type StatusTone } from "@/components/ui";
import { apiPost } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { personaLabel, usePersona } from "@/lib/persona";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { simClockText } from "./time";
import type { AgentDecision } from "./types";

const KIND_LABEL: Record<AgentDecision["kind"], string> = { auto: "Decided", provisional: "Provisional step", escalation: "Escalated" };
const STATUS: Record<AgentDecision["status"], { label: string; tone: StatusTone }> = {
  active: { label: "Waiting: confirm or undo", tone: "warn" },
  final: { label: "Done", tone: "ok" },
  undone: { label: "Undone by a person", tone: "neutral" },
  confirmed: { label: "Confirmed by a person", tone: "ok" },
  superseded: { label: "Replaced by a human decision", tone: "neutral" },
};

/** Who is acting, for agentic endpoints (bearer token wins on the engine; persona is the keyless fallback). */
export function useActor(): { persona: string; by: string } {
  const { persona } = usePersona();
  const { user } = useAuth();
  return { persona, by: user?.name || personaLabel(persona) };
}

/** Confirm or undo an active provisional decision. Calls back with the engine's message. */
export function ProvisionalActions({ decisionId, onDone, compact }: { decisionId: string; onDone?: (msg: string) => void; compact?: boolean }) {
  const actor = useActor();
  const [busy, setBusy] = useState<"confirm" | "undo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(kind: "confirm" | "undo") {
    setBusy(kind);
    setErr(null);
    try {
      const r = await apiPost<{ message: string }>(`/agentic/decisions/${encodeURIComponent(decisionId)}/${kind}`, actor);
      announce(r.message);
      onDone?.(r.message);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Failed";
      setErr(m);
      announce(m, "assertive");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="ag-actions">
      <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => run("confirm")}>{busy === "confirm" ? "Confirming…" : "Confirm"}</Button>
      <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => run("undo")}>{busy === "undo" ? "Undoing…" : compact ? "Undo" : "Undo the agent's step"}</Button>
      {err ? <span className="ag-err" role="alert">{err}</span> : null}
    </div>
  );
}

/** "Recent agent decisions": every auto decision, provisional step and escalation, with its rationale. */
export function AgentDecisionLog({ items, onChanged, limit = 12 }: { items: AgentDecision[]; onChanged?: () => void; limit?: number }) {
  if (!items.length) {
    return (
      <EmptyState title="No agent decisions yet."
        body="The agent only acts when a decision deadline passes with nobody deciding."
        next="Advance the simulated clock in the Lab to see what the agent does when time runs out." />
    );
  }
  return (
    <ol className="ag-log" data-testid="agent-decision-log">
      {items.slice(0, limit).map((d) => {
        const st = STATUS[d.status] ?? { label: d.status, tone: "neutral" as StatusTone };
        return (
          <li key={d.id} className={`ag-log__item ag-log__item--${d.kind}`}>
            <div className="ag-log__head">
              <span className={`ag-kind ag-kind--${d.kind}`}>{KIND_LABEL[d.kind]}{d.kind === "auto" ? `: ${d.decision}` : ""}</span>
              <RiskLevelBadge level={d.level} compact />
              <Link href={`/app/incidents/${encodeURIComponent(d.ref)}`} className="ag-log__title">{d.title ?? d.ref}</Link>
              <span className="mono caption">{d.ref} · {simClockText(d.at)}</span>
            </div>
            <p className="ag-log__why">{d.rationale}</p>
            <div className="ag-log__foot">
              <StatusPill status={d.status} tone={st.tone} label={st.label} />
              {d.trigger !== "deadline" ? <span className="caption">({d.trigger})</span> : null}
              {d.evidence_ids.length ? (
                <span className="ag-log__ev" aria-label="Evidence used">
                  {d.evidence_ids.slice(0, 3).map((id) => <EvidenceChip key={id} id={id} />)}
                </span>
              ) : null}
            </div>
            {d.kind === "provisional" && d.status === "active" ? <ProvisionalActions decisionId={d.id} onDone={() => onChanged?.()} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
