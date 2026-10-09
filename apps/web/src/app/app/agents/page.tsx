"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Details, ErrorState, Metric, MetricGroup, PageTemplate, StatusPill } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import {
  AgentDecisionLog, LevelStrip, PolicyEditor, useAgentDecisions, useAgentRegistry, useAgenticLevels, type AgentInfo,
} from "@/components/features/agentic";
import { fmtNum } from "@/lib/format";

const AUTONOMY: Record<AgentInfo["autonomy"], { label: string; tone: "neutral" | "info" | "warn" }> = {
  suggests: { label: "Suggests only", tone: "neutral" },
  "acts with approval": { label: "Acts after a person approves", tone: "info" },
  "acts at deadline": { label: "Acts when a deadline passes", tone: "warn" },
};

const PAGE_NAME: Record<string, string> = {
  "/app": "Home", "/app/incidents": "Cases", "/app/risks": "Risks", "/app/memory": "Memory", "/app/approvals": "Approvals",
  "/app/workflows": "Workflows", "/app/agents": "AI agents", "/app/briefing": "Briefing", "/app/lab": "Simulation lab",
};

export default function AgentsPage() {
  const reg = useAgentRegistry();
  const log = useAgentDecisions();
  const lv = useAgenticLevels(null);

  const reloadAll = () => { log.reload(); lv.reload(); };
  const decisions = useMemo(() => log.data?.items ?? [], [log.data]);
  const auto = decisions.filter((d) => d.kind === "auto").length;
  const pending = decisions.filter((d) => d.kind === "provisional" && d.status === "active").length;
  const escalated = decisions.filter((d) => d.kind === "escalation").length;
  const open = lv.data?.items.length ?? 0;
  const human = lv.data ? lv.data.items.filter((x) => x.level >= lv.data!.policy.human_threshold).length : 0;

  const glance = log.data ? (
    <MetricGroup title="What the agents did">
      <Metric label="Decided by the agent" value={fmtNum(auto)} provenance="computed"
        meaning="Cases the Deadline Guardian decided because no one decided in time (low risk only)."
        implication="Each one lists its reasons and evidence below." />
      <Metric label="Waiting for your OK" value={fmtNum(pending)} tone={pending ? "elevated" : "default"} provenance="computed"
        meaning="Provisional steps: internal tasks prepared at the deadline, nothing sent."
        implication={pending ? "Confirm or undo them below." : "Nothing to confirm."} />
      <Metric label="Escalated" value={fmtNum(escalated)} tone={escalated ? "critical" : "default"} provenance="computed"
        meaning="High-risk or regulatory cases that passed their deadline; sent to the Business Head."
        implication="The agent never decides these." />
    </MetricGroup>
  ) : undefined;

  return (
    <PageTemplate
      explainKey="agents"
      title="AI agents"
      question="Where does AI work for me, and how much may it decide on its own?"
      glance={glance}
      visual={lv.data ? {
        takeaway: `${open} open case${open === 1 ? "" : "s"}; ${human} at level ${lv.data.policy.human_threshold} or above, so a person is asked first.`,
        node: <LevelStrip counts={lv.data.counts} />,
      } : undefined}
    >
      {(reg.loading && !reg.data) || (log.loading && !log.data) ? <StrataLoader label="Loading the agents" /> : null}
      {reg.error ? <ErrorState error={reg.error} onRetry={reg.reload} /> : null}

      {reg.data ? (
        <section aria-labelledby="ag-reg-h" className="ag-section">
          <h2 id="ag-reg-h" className="section-label">The agents</h2>
          <ul className="ag-cards" data-testid="agent-registry">
            {reg.data.map((a) => (
              <li key={a.key} className="ag-card">
                <div className="ag-card__head">
                  <h3 className="ag-card__name">{a.name}</h3>
                  <StatusPill status={a.autonomy} tone={AUTONOMY[a.autonomy]?.tone ?? "neutral"} label={AUTONOMY[a.autonomy]?.label ?? a.autonomy} />
                </div>
                <p className="ag-card__job">{a.job}</p>
                <p className="ag-card__saves"><span className="ag-card__k">Saves you</span> {a.saves}</p>
                <p className="ag-card__where">
                  <span className="ag-card__k">Where</span>{" "}
                  {a.where.map((h, i) => <span key={h}>{i ? ", " : ""}<Link href={h}>{PAGE_NAME[h] ?? h}</Link></span>)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="ag-log-h" className="ag-section">
        <h2 id="ag-log-h" className="section-label">Recent agent decisions</h2>
        {log.error ? <ErrorState error={log.error} onRetry={log.reload} /> : null}
        {log.data ? <AgentDecisionLog items={decisions} onChanged={reloadAll} /> : null}
        <p className="caption">Every agent action is in the tamper-evident <Link href="/app/audit">audit log</Link>. Tasks and drafts are simulated; nothing is sent to customers.</p>
      </section>

      <Details title="Decision policy (set by the Business Head)">
        <PolicyEditor />
      </Details>
    </PageTemplate>
  );
}
