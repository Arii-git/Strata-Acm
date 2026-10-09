"use client";

import { forwardRef } from "react";
import { IconArrowsLeftRight, IconLayoutGrid, IconRotate } from "@tabler/icons-react";
import { Button, Caption, Metric, MetricGroup, ProvenanceBadge } from "@/components/ui";
import { fmtLag, fmtSigned, fmtSimTime, fmtWeeks } from "./meta";
import type { DecisionKey, SimKpi, SimRun } from "./types";

const DECISION_LABEL: Record<DecisionKey, string> = { approve: "Approve plan", wait: "Let the agent decide", escalate: "Escalate" };

function k(run: SimRun, key: SimKpi["key"]): SimKpi | undefined {
  return run.kpis.find((x) => x.key === key);
}

/** End-of-run summary: with vs without STRATA (illustrative), the playbook used, and the other gate choices. */
export const OutcomePanel = forwardRef<HTMLHeadingElement, {
  run: SimRun; decision: DecisionKey; onReplay: () => void; onAnother: () => void; onCompare: () => void;
}>(function OutcomePanel({ run, decision, onReplay, onAnother, onCompare }, ref) {
  const det = k(run, "days_to_detect");
  const peak = k(run, "peak_impact");
  const rec = k(run, "weeks_to_recover");
  const prot = k(run, "exposure_protected");
  const compl = k(run, "complaints_avoided");
  const H = run.horizon_weeks;
  const primary = run.kpi_meta.find((m) => m.key === run.primary_kpi);
  const cap = run.caption;

  return (
    <section className="lab-outcome" aria-labelledby="lab-outcome-title" data-testid="sim-outcome">
      <div className="lab-outcome__head">
        <h2 id="lab-outcome-title" ref={ref} tabIndex={-1} className="lab-outcome__title">What STRATA changed</h2>
        <ProvenanceBadge provenance="illustrative" />
      </div>
      <p className="lab-outcome__summary">{run.summary}</p>

      <div className="lab-outcome__groups">
        <MetricGroup title="Speed">
          <Metric label="Time to detect" value={fmtLag(det?.with)} compare={`Without STRATA: ${fmtLag(det?.without)}`}
            meaning="From the trigger to the first alert." implication={cap} provenance="illustrative" tone="healthy" />
          <Metric label="Time to recover" value={fmtWeeks(rec?.with ?? null, H)} compare={`Without STRATA: ${fmtWeeks(rec?.without ?? null, H)}`}
            meaning={`Weeks until ${primary?.label.toLowerCase() ?? "the main measure"} is back near normal.`} implication={cap} provenance="illustrative" />
        </MetricGroup>
        <MetricGroup title="Impact">
          <Metric label={`Worst change in ${primary?.label.toLowerCase() ?? "main measure"}`} value={`${fmtSigned(peak?.with ?? 0)}%`}
            compare={`Without STRATA: ${fmtSigned(peak?.without ?? 0)}%`}
            meaning="Largest gap from normal at any point in the run." implication={cap} provenance="illustrative" />
          <Metric label="Order value protected" value={`₹${(prot?.value ?? 0).toLocaleString("en-IN")}`} unit="lakh"
            compare={`Complaints avoided: ${(compl?.value ?? 0).toLocaleString("en-IN")}`}
            meaning="Order value on the STRATA path minus the late-response path, summed over the horizon." implication={cap} provenance="illustrative" />
        </MetricGroup>
      </div>

      <div className="lab-outcome__cols">
        <div className="lab-outcome__block">
          <div className="lab-outcome__blockhead">
            <h3 className="section-label">Your gate decision vs the alternatives</h3>
            <ProvenanceBadge provenance="illustrative" />
          </div>
          <div className="lab-table-wrap" tabIndex={0} role="region" aria-label="Gate decisions compared">
            <table className="lab-table">
              <thead>
                <tr><th scope="col">Decision</th><th scope="col">Work starts</th><th scope="col">Recovery</th><th scope="col">Worst change</th><th scope="col">Extra cost</th></tr>
              </thead>
              <tbody>
                {(Object.keys(run.branches) as DecisionKey[]).map((d) => {
                  const b = run.branches[d];
                  return (
                    <tr key={d} className={d === decision ? "is-chosen" : undefined} aria-current={d === decision ? "true" : undefined}>
                      <th scope="row">{DECISION_LABEL[d]}{d === decision ? <span className="lab-table__you">your choice</span> : null}</th>
                      <td className="num">{fmtSimTime(b.action_day)}</td>
                      <td className="num">{fmtWeeks(b.weeks_to_recover, H)}</td>
                      <td className="num">{fmtSigned(b.peak_impact_pct)}%</td>
                      <td className="num">{b.extra_cost_pct ? `+${b.extra_cost_pct}% while it runs` : "none"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Caption meaning="Each row replays the same scenario with a different choice at the human gate." implication={cap} />
        </div>
        <div className="lab-outcome__block">
          <h3 className="section-label">Playbook used</h3>
          <ol className="lab-playbook">
            {run.scenario.playbook.map((s) => (
              <li key={s.step}>
                <span className="lab-playbook__n">{s.step}</span>
                <span className="lab-playbook__body"><strong>{s.action}</strong><span className="caption">{s.owner_label} · {s.scope === "external" ? "external, drafted for review (simulated)" : "internal"}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="row lab-outcome__actions">
        <Button variant="primary" onClick={onAnother} icon={<IconLayoutGrid size={16} stroke={1.5} aria-hidden="true" />}>Run another</Button>
        <Button onClick={onCompare} icon={<IconArrowsLeftRight size={16} stroke={1.5} aria-hidden="true" />}>Compare industries</Button>
        <Button variant="ghost" onClick={onReplay} icon={<IconRotate size={16} stroke={1.5} aria-hidden="true" />}>Replay</Button>
      </div>
    </section>
  );
});
