"use client";

import { ConsequenceFlow } from "@/components/diagrams/ConsequenceFlow";
import { humanize } from "@/lib/format";
import { memoryAuthorLabel, type WbIncident, type WbPlan } from "./shared";

export const NO_BASIS = "No basis yet — STRATA will record the result and learn from it.";

/**
 * Expected result, from real data only: the most similar memory match with the SAME cause as this case
 * (breakdown.cause = 1). Never a recovery time or ₹ figure.
 */
export function expectedResult(incident: WbIncident): string {
  const matches = incident.investigation?.memory_matches ?? [];
  const same = matches.filter((m) => m.breakdown.cause >= 0.999).sort((a, b) => b.similarity - a.similarity)[0];
  if (!same) return NO_BASIS;
  return `Last time (${same.ref}, ${memoryAuthorLabel(same.authored_by)}): ${same.resolution} → outcome ${humanize(same.outcome).toLowerCase()}.`;
}

/** "If you approve this plan": consequence flow + expected result + what reject/modify mean. Shown above the ApprovalBar. */
export function ConsequencePanel({ incident, plan }: { incident: WbIncident; plan: WbPlan }) {
  const expected = expectedResult(incident);
  return (
    <section className="consequence-panel" aria-labelledby="consequence-title" data-testid="consequence-panel">
      <h3 id="consequence-title" className="consequence-panel__title">If you approve this plan</h3>
      <ConsequenceFlow steps={plan.steps} drafts={plan.drafts} requiresRole={plan.requires_role} fourEyes={plan.four_eyes} />
      <div className="consequence-panel__expected">
        <h4 className="section-label">Expected result</h4>
        <p data-testid="expected-result" style={{ margin: 0 }}>{expected}</p>
        <p className="caption" style={{ margin: 0 }}>
          {expected === NO_BASIS
            ? "No past case with the same cause is in memory, so STRATA makes no prediction."
            : "The closest past case with the same cause. A reference, not a forecast."}
        </p>
      </div>
      <ul className="consequence-panel__rules">
        <li>Reject or modify: a reason is required. A rejection is remembered for next time; a change is kept in the audit trail.</li>
        {incident.regulatory_sensitive ? (
          <li data-testid="route-only"><b>Route-only: QA Head approves, a second QA reviewer confirms (four-eyes). STRATA gives no clinical advice.</b></li>
        ) : null}
      </ul>
    </section>
  );
}
