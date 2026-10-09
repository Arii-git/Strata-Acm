"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Details, EmptyState, ErrorState, PageTemplate, buttonClass } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import {
  LevelStrip, RiskLevelBadge, simClockText, useAgenticLevels, type AgenticItem, type RiskLevel,
} from "@/components/features/agentic";
import { usePersona } from "@/lib/persona";
import { ApprovalRow } from "./ApprovalRow";

/** Needs a person now: waiting, provisional (confirm/undo), escalated, or deferred by the agent with the plan still open. */
function needsDecision(x: AgenticItem): boolean {
  if (x.status === "awaiting_human" || x.status === "provisional" || x.status === "escalated") return true;
  return x.status === "auto_decided" && x.plan_status === "awaiting_approval";
}

function byLevelThenDeadline(a: AgenticItem, b: AgenticItem): number {
  return b.level - a.level || String(a.decision_deadline).localeCompare(String(b.decision_deadline));
}

export default function ApprovalsPage() {
  const { persona } = usePersona();
  const { data, error, loading, reload } = useAgenticLevels(persona);
  const [only, setOnly] = useState<RiskLevel | null>(null);

  const queue = useMemo(() => (data?.items ?? []).filter(needsDecision).sort(byLevelThenDeadline), [data]);
  const handled = useMemo(() => (data?.items ?? []).filter((x) => !needsDecision(x)), [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const x of queue) c[String(x.level)] += 1;
    return c;
  }, [queue]);
  const shown = only ? queue.filter((x) => x.level === only) : queue;

  const next = queue.find((x) => x.status === "awaiting_human" && !x.deadline_passed);
  const provisional = queue.filter((x) => x.status === "provisional").length;
  const escalated = queue.filter((x) => x.status === "escalated").length;
  const takeaway = !queue.length ? "Nothing is waiting for you."
    : `${queue.length} case${queue.length === 1 ? "" : "s"} need${queue.length === 1 ? "s" : ""} a decision`
      + (next ? `; next deadline ${simClockText(next.decision_deadline)} (${next.ref}, level ${next.level})` : "")
      + (provisional ? `; ${provisional} agent step${provisional === 1 ? "" : "s"} to confirm or undo` : "")
      + (escalated ? `; ${escalated} escalated` : "") + ".";

  return (
    <PageTemplate
      explainKey="approvals"
      title="Approvals"
      question="What needs my decision, and what happens if I don't decide in time?"
      glance={data && queue.length ? <LevelStrip counts={counts} selected={only} onSelect={setOnly}
        caption="Cases waiting for a decision, by risk level. Press a level to show only that level." /> : undefined}
      visual={data ? {
        takeaway,
        node: !queue.length ? (
          <EmptyState title="Nothing waiting."
            body="Cases appear here when Risk Triage gives them a level and a decision deadline."
            action={<Link href="/app/incidents" className={buttonClass("secondary", "sm")}>Open the cases</Link>} />
        ) : (
          <ul className="aq" aria-label="Cases waiting for a decision, highest level first" data-testid="approval-list">
            {shown.map((x) => <ApprovalRow key={x.ref} item={x} simNow={data.sim_now} onChanged={reload} />)}
          </ul>
        ),
      } : undefined}
    >
      {loading && !data ? <StrataLoader label="Loading decisions" /> : null}
      {error && !data ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <p className="caption aq__clock">
            Times use the simulated clock (now {simClockText(data.sim_now)}). Deadlines are set by the Business Head.{" "}
            <Link href="/app/agents">How the agents decide</Link>
          </p>
          {handled.length ? (
            <Details title={`Handled (${handled.length})`}>
              <ul className="aq-done">
                {handled.map((x) => (
                  <li key={x.ref}>
                    <RiskLevelBadge level={x.level} compact />
                    <Link href={`/app/incidents/${encodeURIComponent(x.ref)}`}>{x.title}</Link>
                    <span className="caption">{x.mode_line}</span>
                  </li>
                ))}
              </ul>
            </Details>
          ) : null}
        </>
      ) : null}
    </PageTemplate>
  );
}
