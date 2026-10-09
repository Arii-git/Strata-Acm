"use client";

import { useMemo } from "react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import type { AccountRow, ListResponse } from "@/lib/api/types";
import { useApi } from "@/lib/api/client";
import { Button, ErrorState, Loading, Metric, MetricGroup, StatusPill, buttonClass } from "@/components/ui";
import { SignalSmallMultiples, type SignalItem } from "@/components/diagrams/SignalSmallMultiples";
import { ChannelMap } from "@/components/diagrams/ChannelMap";
import { RegionTileMap, type RegionTile } from "@/components/diagrams/RegionTileMap";
import { fmtDate, fmtINR, fmtNum, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { humanizeList } from "./text";
import type { LevelItem } from "@/components/features/problems/levels";
import { AgentSteps, Hypotheses, InvestigationStatus, Narrative, RunInvestigation, useInvestigate } from "./AgentTrace";
import { ApprovalBar } from "./ApprovalBar";
import { CausalMap } from "./CausalMap";
import { ConsequencePanel, expectedResult, NO_BASIS } from "./ConsequencePanel";
import { DecisionResult, type DecisionOutcome } from "./DecisionResult";
import { Disclosure } from "./Disclosure";
import { BlastRadiusTable, EvidenceList } from "./EvidenceTab";
import { MemoryTab } from "./MemoryTab";
import { DecisionsList, OutcomesTable, PlanDrafts, PlanOrigin, PlanSteps, TasksTable, planApprovals } from "./PlanTab";
import { PIPE, PIPE_INDEX, type PipeKey } from "./pipeline";
import { fmtEvidenceValue, fmtHours, type WbIncident } from "./shared";

export interface StageProps {
  inc: WbIncident;
  /** reload the case + its events after an action */
  onChanged: () => void;
  /** an evidence chip was clicked: show it on the Detected step */
  onChip: (id: string) => void;
  highlight: string | null;
  decision: DecisionOutcome | null;
  onDecided: (o: DecisionOutcome) => void;
  go: (k: PipeKey) => void;
  level: LevelItem | null;
}

/** Heading + the one-line "What happened here" for a stage. The heading takes focus when the user moves stage. */
function StageHead({ k, what, whatTestId }: { k: PipeKey; what: React.ReactNode; whatTestId?: string }) {
  const def = PIPE[PIPE_INDEX[k]];
  return (
    <header className="case-stage-head">
      <p className="case-stage-head__step">Step {PIPE_INDEX[k] + 1} of {PIPE.length}</p>
      <h2 id="case-stage-heading" className="case-stage-head__title" tabIndex={-1}>
        {def.label}
        <span className="case-stage-head__q">{def.question}</span>
      </h2>
      <p className="case-what" data-testid={whatTestId ?? "stage-what"}>
        <span className="case-what__label">What happened here</span>
        <span className="case-what__text">{what}</span>
      </p>
    </header>
  );
}

function GoButton({ to, go, children, primary }: { to: PipeKey; go: (k: PipeKey) => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <Button variant={primary ? "primary" : "secondary"} onClick={() => go(to)}>
      {children} <IconArrowRight size={16} stroke={1.75} aria-hidden="true" />
    </Button>
  );
}

/* ------------------------------------------------------------------ 1. Detected */

function DetectedStage({ inc, highlight }: StageProps) {
  const accounts = useApi<ListResponse<AccountRow>>("/accounts");
  const items = useMemo<SignalItem[]>(() => inc.evidence.map((e) => {
    const v = fmtEvidenceValue(e);
    return { id: e.id, label: e.label, source: e.source, role: e.role, series: e.series, headline: v.headline, detail: v.detail };
  }), [inc.evidence]);
  const typeById = useMemo(() => Object.fromEntries((accounts.data?.items ?? []).map((a) => [String(a.id), a.type])), [accounts.data]);
  const regions = useMemo<RegionTile[]>(() => {
    const m = new Map<string, RegionTile>();
    for (const a of accounts.data?.items ?? []) {
      const r = m.get(a.region) ?? { name: a.region, accounts: 0, value_12w: 0 };
      r.accounts += 1;
      r.value_12w += a.value_12w || 0;
      m.set(a.region, r);
    }
    const aff = m.get(inc.region);
    if (aff) aff.exposed = inc.blast_radius.length;
    return [...m.values()];
  }, [accounts.data, inc.region, inc.blast_radius.length]);

  const where = inc.scope === "account" ? (inc.account_name || "this account") : inc.scope === "region" ? `the ${inc.region} region` : `this ${humanize(inc.scope).toLowerCase()}`;
  const what = `${fmtNum(inc.n_sources)} separate system${inc.n_sources === 1 ? "" : "s"} (${humanizeList(inc.sources)}) moved away from normal at the same time for ${where}.`;
  const critical = inc.severity === "critical";
  const supporting = inc.evidence.filter((e) => e.role !== "context").length;

  return (
    <>
      <StageHead k="detected" what={what} />
      {inc.regulatory_sensitive ? (
        <div role="note" className="case-route-only">
          <strong>Route-only: QA Head + four-eyes.</strong> STRATA routes this case and records decisions. It gives no clinical advice.
        </div>
      ) : null}

      <MetricGroup title="Why it matters">
        <Metric
          id="risk_score" label="Risk score" value={fmtNum(inc.risk_score)} unit="of 100"
          tone={critical ? "critical" : inc.severity === "high" || inc.severity === "elevated" ? "elevated" : "default"}
          meaning={`${fmtNum(inc.n_sources)} independent systems agree; signals are combined and scaled by how many agree.`}
          implication={critical ? "Critical: act today." : "Higher means more systems agree something is wrong."}
          provenance="computed"
        />
        <Metric
          id="value_at_stake" label="₹ exposed" value={fmtINR(inc.value_at_stake)}
          meaning="Normal 12-week order value of the affected scope."
          implication="Exposure, not a forecast of loss."
          provenance="computed"
        />
        <Metric
          id="silent_period_days" label="Silent period" value={inc.silent_period_days != null ? fmtNum(inc.silent_period_days, 0) : "—"} unit="days"
          compare={`Onset ${fmtDate(inc.onset_estimated_at)} · detected ${fmtDate(inc.first_detected_at)} (simulated)`}
          meaning={inc.silent_period_basis || "Days the problem existed before a weekly manual review would have caught it."}
          implication="Roughly how much earlier STRATA surfaced it."
          provenance="assumption"
        />
      </MetricGroup>

      <section className="case-block" aria-labelledby="blk-signals">
        <h3 id="blk-signals" className="case-block__title">Signals against their own normal</h3>
        <SignalSmallMultiples items={items} sources={inc.sources} riskScore={inc.risk_score} severity={inc.severity} onset={inc.onset_estimated_at} />
      </section>

      {inc.scope === "region" && accounts.data ? (
        <section className="case-block" aria-labelledby="blk-region">
          <h3 id="blk-region" className="case-block__title">Affected region</h3>
          <RegionTileMap regions={regions} affected={inc.region} />
        </section>
      ) : null}

      <div className="case-more-group">
        <Disclosure label="Who else is exposed" hint={`${fmtNum(inc.blast_radius.length)} other account${inc.blast_radius.length === 1 ? "" : "s"}`}>
          {accounts.loading && !accounts.data ? <Loading rows={3} label="Loading account types" /> : accounts.error && !accounts.data ? (
            <ErrorState error={accounts.error} onRetry={accounts.reload} title="Could not load account types" />
          ) : (
            <ChannelMap accountType={inc.account_type} accountName={inc.account_name} blast={inc.blast_radius} typeById={typeById} />
          )}
          <BlastRadiusTable blast={inc.blast_radius} />
        </Disclosure>
        <Disclosure label="Every signal, with IDs" hint={`${fmtNum(supporting)} scored · ${fmtNum(inc.evidence.length - supporting)} context`} forceOpen={!!highlight} testId="evidence-list">
          <EvidenceList evidence={inc.evidence} highlight={highlight} />
        </Disclosure>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 2. Investigate */

function InvestigateStage({ inc, onChanged, onChip }: StageProps) {
  const inv = inc.investigation;
  if (!inv) {
    return (
      <>
        <StageHead k="investigate" what="Not investigated yet. No cause has been ranked." />
        <RunInvestigation incident={inc} onChanged={onChanged} />
      </>
    );
  }
  const what = `Most likely cause: ${humanize(inv.cause)} (rule confidence ${inv.cause_confidence.toFixed(2)}). ${fmtNum(inv.hypotheses.length)} possible causes were checked.`;
  return (
    <>
      <StageHead k="investigate" what={what} whatTestId="why-takeaway" />
      <InvestigationStatus incident={inc} onChanged={onChanged} />
      <section className="case-block" aria-labelledby="blk-narr">
        <h3 id="blk-narr" className="case-block__title">What the agents found</h3>
        <Narrative incident={inc} onChip={onChip} />
      </section>
      <div className="case-more-group">
        <Disclosure label="How the evidence leads to the cause" hint="map">
          <CausalMap incident={inc} />
        </Disclosure>
        <Disclosure label="All causes checked" hint={`${fmtNum(inv.hypotheses.length)} hypotheses`}>
          <Hypotheses incident={inc} onChip={onChip} />
        </Disclosure>
        <Disclosure label="Agent steps" hint={`${fmtNum(inv.steps.length)} steps`}>
          <AgentSteps incident={inc} onChip={onChip} />
        </Disclosure>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 3. Recall */

function RecallStage({ inc, go }: StageProps) {
  const inv = inc.investigation;
  if (!inv) {
    return (
      <>
        <StageHead k="recall" what="Memory is searched during the investigation, which has not run yet." />
        <div><GoButton to="investigate" go={go} primary>Go to Investigate</GoButton></div>
      </>
    );
  }
  const best = [...inv.memory_matches].sort((a, b) => b.similarity - a.similarity)[0];
  const what = best
    ? `Closest past case: ${best.ref} (similarity ${best.similarity.toFixed(2)}), outcome ${humanize(best.outcome).toLowerCase()}.`
    : "No similar past case was found in memory.";
  const expected = expectedResult(inc);
  return (
    <>
      <StageHead k="recall" what={what} />
      <p className="case-callout">{expected === NO_BASIS ? "No past case has the same cause, so STRATA makes no prediction." : expected}</p>
      <MemoryTab matches={inv.memory_matches} retrieval={inv.retrieval} />
    </>
  );
}

/* ------------------------------------------------------------------ 4. Plan */

function RerunButton({ inc, onChanged, label }: { inc: WbIncident; onChanged: () => void; label: string }) {
  const { run, running, err } = useInvestigate(inc, onChanged);
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <Button variant="primary" onClick={run} disabled={running}>{running ? "Running investigation" : label}</Button>
      {err ? <span className="caption case-error" role="alert">{err}</span> : null}
    </div>
  );
}

const PLAN_STATUS: Record<string, string> = {
  awaiting_approval: "It is waiting for a decision.",
  approved: "It was approved; its tasks are running.",
  modified: "It was approved with changes; its tasks are running.",
  rejected: "It was rejected. Re-run the investigation to draft a new one.",
  superseded: "A newer plan replaced it.",
};

function PlanStage({ inc, onChanged, onChip, go }: StageProps) {
  const plan = inc.plan;
  if (!plan) {
    return (
      <>
        <StageHead k="plan" what={inc.investigation ? "No plan is waiting. Re-run the investigation to draft one." : "No plan yet. The plan is drafted during the investigation."} />
        {inc.investigation ? <RerunButton inc={inc} onChanged={onChanged} label="Re-run investigation" /> : <div><GoButton to="investigate" go={go} primary>Go to Investigate</GoButton></div>}
      </>
    );
  }
  const owners = [...new Set(plan.steps.map((s) => personaLabel(s.owner_role)))];
  const what = `Plan ${plan.id} has ${fmtNum(plan.steps.length)} step${plan.steps.length === 1 ? "" : "s"} for ${humanizeList(owners)}. ${PLAN_STATUS[plan.status] ?? humanize(plan.status) + "."}`;
  const firstDue = Math.min(...plan.steps.map((s) => s.due_in_hours));
  return (
    <>
      <StageHead k="plan" what={what} />
      <p className="case-callout"><b>Goal:</b> {plan.expected_outcome}</p>
      <PlanSteps plan={plan} onChip={onChip} />
      {plan.status === "rejected" ? <RerunButton inc={inc} onChanged={onChanged} label="Draft a new plan" /> : null}
      {plan.status === "awaiting_approval" ? (
        <div><GoButton to="approve" go={go} primary>Review and decide</GoButton></div>
      ) : null}
      <div className="case-more-group">
        <Disclosure label="Message drafts" hint={`${fmtNum(plan.drafts.length)} · simulated, not sent`}>
          <PlanDrafts plan={plan} onChip={onChip} />
        </Disclosure>
        <Disclosure label="Where this plan came from" hint={Number.isFinite(firstDue) ? `first step due ${fmtHours(firstDue)} after approval` : undefined}>
          <PlanOrigin plan={plan} />
        </Disclosure>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 5. Approve */

function ApproveStage({ inc, decision, onDecided, go, level }: StageProps) {
  const plan = inc.plan;
  const justDecided = decision && plan && decision.planId === plan.id ? decision : null;
  const auto = level?.auto_decision ?? null;
  const autoNote = auto ? (
    <div className="case-callout" data-testid="agent-decision">
      <b>Agent decision ({humanize(level?.status ?? "").toLowerCase()}):</b> {humanize(auto.decision)}. {auto.rationale}
      <span className="caption" style={{ display: "block" }}>Recorded {fmtDate(auto.at, true)}. A person can still change it.</span>
    </div>
  ) : null;

  if (!plan) {
    return (
      <>
        <StageHead k="approve" what="Nothing to approve yet. A plan appears here after the investigation." />
        <div><GoButton to={inc.investigation ? "plan" : "investigate"} go={go} primary>{inc.investigation ? "Go to Plan" : "Go to Investigate"}</GoButton></div>
      </>
    );
  }
  const approvals = planApprovals(inc, plan);

  if (justDecided) {
    return (
      <>
        <StageHead k="approve" what={justDecided.response.message} />
        <DecisionResult result={justDecided} incident={inc} />
        {justDecided.response.tasks_created > 0 ? <div><GoButton to="act" go={go} primary>See what was set in motion</GoButton></div> : null}
        {approvals.length ? <Disclosure label="Decisions so far" hint={fmtNum(approvals.length)}><DecisionsList approvals={approvals} /></Disclosure> : null}
      </>
    );
  }

  if (plan.status === "awaiting_approval") {
    const who = `${personaLabel(plan.requires_role)}${plan.four_eyes ? " and a second, different approver" : ""}`;
    return (
      <>
        <StageHead k="approve" what={`Plan ${plan.id} waits for ${who}. Nothing happens until a named person decides.`} />
        {autoNote}
        <ConsequencePanel incident={inc} plan={plan} />
        <ApprovalBar plan={plan} onDecided={onDecided} />
        {approvals.length ? <Disclosure label="Decisions so far" hint={fmtNum(approvals.length)}><DecisionsList approvals={approvals} /></Disclosure> : null}
      </>
    );
  }

  const last = approvals[approvals.length - 1];
  const what = `Plan ${plan.id} was ${humanize(plan.status).toLowerCase()}${last ? ` by ${last.decided_by} (${personaLabel(last.decider_role)}) on ${fmtDate(last.decided_at, true)}` : ""}.`;
  return (
    <>
      <StageHead k="approve" what={what} />
      {autoNote}
      <DecisionsList approvals={approvals} />
    </>
  );
}

/* ------------------------------------------------------------------ 6. Act */

function ActStage({ inc, go }: StageProps) {
  const tasks = inc.tasks.filter((t) => !t.channel.endsWith("_draft"));
  const drafts = inc.tasks.filter((t) => t.channel.endsWith("_draft"));
  if (!inc.tasks.length) {
    const awaiting = inc.plan?.status === "awaiting_approval";
    return (
      <>
        <StageHead k="act" what={awaiting ? "Nothing is in motion yet: the plan is waiting for a decision." : "No tasks yet. Tasks are created when a plan is approved."} />
        {awaiting ? <div><GoButton to="approve" go={go} primary>Go to Approve</GoButton></div> : null}
      </>
    );
  }
  const done = inc.tasks.filter((t) => t.status === "done").length;
  const what = `${fmtNum(tasks.length)} task${tasks.length === 1 ? "" : "s"} and ${fmtNum(drafts.length)} draft${drafts.length === 1 ? "" : "s"} were created for their owners; ${fmtNum(done)} done. Simulated: nothing was sent.`;
  return (
    <>
      <StageHead k="act" what={what} />
      <ul className="case-tasks">
        {inc.tasks.map((t) => (
          <li key={t.id} className="case-tasks__item">
            <div className="case-tasks__main">
              <span className="case-tasks__title">{t.title}</span>
              <span className="caption" style={{ maxWidth: "none" }}>
                <span className="mono">{t.id}</span> · {personaLabel(t.owner_role)} · {t.channel.endsWith("_draft") ? `${t.channel === "whatsapp_draft" ? "WhatsApp" : "Email"} draft` : "task"} · due {fmtDate(t.due_at, true)}
              </span>
            </div>
            <StatusPill status={t.status} />
          </li>
        ))}
      </ul>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link href="/app/workflows" className={buttonClass("secondary", "sm")}>Open Workflows &amp; handoffs</Link>
        <span className="caption">The result is checked when the tasks fall due.</span>
      </div>
      <Disclosure label="All tasks as a table" hint="sortable"><TasksTable tasks={inc.tasks} /></Disclosure>
    </>
  );
}

/* ------------------------------------------------------------------ 7. Learn */

function LearnStage({ inc }: StageProps) {
  const learned = inc.stage === "learned";
  if (!inc.outcomes.length) {
    return (
      <>
        <StageHead k="learn" what="No outcome yet. The result is checked when the tasks fall due." />
        <p className="case-prose">
          In the Simulation lab you can move the simulated clock forward to see an illustrative outcome and watch STRATA write it into memory.
        </p>
        <div className="row"><Link href="/app/lab" className={buttonClass("secondary", "sm")}>Open the Simulation lab</Link></div>
      </>
    );
  }
  const improved = inc.outcomes.filter((o) => o.verdict === "improved").length;
  const what = `${fmtNum(inc.outcomes.length)} result${inc.outcomes.length === 1 ? "" : "s"} recorded, ${fmtNum(improved)} improved.${learned ? " The lesson is stored in memory for the next similar case." : " STRATA is writing it into memory."}`;
  return (
    <>
      <StageHead k="learn" what={what} />
      <OutcomesTable outcomes={inc.outcomes} />
      <div className="row"><Link href="/app/memory" className={buttonClass("secondary", "sm")}>Open Organizational Memory</Link></div>
    </>
  );
}

const VIEWS: Record<PipeKey, (p: StageProps) => React.ReactElement> = {
  detected: DetectedStage,
  investigate: InvestigateStage,
  recall: RecallStage,
  plan: PlanStage,
  approve: ApproveStage,
  act: ActStage,
  learn: LearnStage,
};

export function StageView({ stage, ...props }: StageProps & { stage: PipeKey }) {
  const View = VIEWS[stage];
  return <View {...props} />;
}
