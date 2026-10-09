"use client";

import Link from "next/link";
import type { Decision, DecisionResponse } from "@/lib/api/types";
import { buttonClass } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import type { WbIncident } from "./shared";

export interface DecisionOutcome { decision: Decision; planId: string; response: DecisionResponse }

/** What the decision actually created, from the engine's response plus the reloaded incident (tasks for this plan). */
export function DecisionResult({ result, incident }: { result: DecisionOutcome; incident: WbIncident }) {
  const created = result.response.tasks_created > 0 ? incident.tasks.filter((t) => (t.plan_id ? t.plan_id === result.planId : true)) : [];
  const tasks = created.filter((t) => !t.channel.endsWith("_draft"));
  const drafts = created.filter((t) => t.channel.endsWith("_draft"));
  const verb = result.decision === "approved" ? "approved" : result.decision === "modified" ? "modified" : "rejected";
  return (
    <section className="decision-result" role="status" aria-live="polite" data-testid="decision-result" aria-labelledby="decision-result-title">
      <h3 id="decision-result-title" className="decision-result__title">Decision recorded: plan {result.planId} {verb}</h3>
      <p style={{ margin: 0 }}>{result.response.message}</p>
      {result.response.tasks_created > 0 ? (
        <div className="grid grid--2" style={{ alignItems: "start" }}>
          <div>
            <h4 className="section-label">{tasks.length} task{tasks.length === 1 ? "" : "s"} created</h4>
            <ul className="decision-result__list">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href="/app/workflows"><span className="mono">{t.id}</span> {t.title}</Link>
                  <span className="caption"> · {personaLabel(t.owner_role)} · due {fmtDate(t.due_at, true)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="section-label">{drafts.length} draft{drafts.length === 1 ? "" : "s"} prepared (simulated, not sent)</h4>
            {drafts.length ? (
              <ul className="decision-result__list">
                {drafts.map((t) => (
                  <li key={t.id}>
                    <Link href="/app/workflows"><span className="mono">{t.id}</span> {t.title}</Link>
                    <span className="caption"> · {t.channel === "whatsapp_draft" ? "WhatsApp" : "Email"} draft to {personaLabel(t.owner_role)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="caption">No drafts in this plan.</p>}
          </div>
        </div>
      ) : (
        <p className="caption" style={{ margin: 0 }}>
          {result.decision === "rejected"
            ? "No tasks were created. Re-run the investigation (Investigate step) to draft a new plan."
            : "No tasks yet: a second, different approver must confirm before anything is created."}
        </p>
      )}
      {result.response.tasks_created > 0 ? (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href="/app/workflows" className={buttonClass("secondary", "sm")}>Open Workflows &amp; handoffs</Link>
          <span className="caption">Owners work these tasks; the result is checked when they fall due.</span>
        </div>
      ) : null}
    </section>
  );
}
