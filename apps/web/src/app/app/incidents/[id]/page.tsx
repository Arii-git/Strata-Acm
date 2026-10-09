"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/api/client";
import {
  Button, CategoryChip, ErrorState, Loading, Metric, MetricGroup, PageTemplate, SeverityPill, StageTracker, Tabs, TermHint, buttonClass,
} from "@/components/ui";
import { fmtDate, fmtINR, fmtNum, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { STAGES, STAGE_INDEX, type StageKey } from "@config/taxonomy";
import type { WbIncident } from "@/components/features/workbench/shared";
import { WhatHappenedTab } from "@/components/features/workbench/WhatHappenedTab";
import { WhyTab } from "@/components/features/workbench/WhyTab";
import { PlanTab } from "@/components/features/workbench/PlanTab";
import type { DecisionOutcome } from "@/components/features/workbench/DecisionResult";
import { CaseTimeline } from "@/components/features/events/CaseTimeline";
import { stageTimestamps, useEvents } from "@/components/features/events/useEvents";

type TabId = "happened" | "why" | "todo";
const TAB_IDS: TabId[] = ["happened", "why", "todo"];
/** Old deep links (?tab=evidence|map|trace|memory|plan) keep working. */
const LEGACY: Record<string, TabId> = { evidence: "happened", map: "why", trace: "why", memory: "why", plan: "todo" };

function readTab(): TabId | null {
  const t = new URLSearchParams(window.location.search).get("tab");
  if (!t) return null;
  if ((TAB_IDS as string[]).includes(t)) return t as TabId;
  return LEGACY[t] ?? null;
}

/** Which tab the next workflow step lives on, per stage. */
const NEXT_TAB: Record<StageKey, { tab: TabId; label: string }> = {
  detected: { tab: "why", label: "Run the investigation" },
  investigating: { tab: "why", label: "See the investigation" },
  plan_ready: { tab: "why", label: "Re-run the investigation" },
  awaiting_approval: { tab: "todo", label: "Review and decide on the plan" },
  in_progress: { tab: "todo", label: "See the tasks created" },
  outcome_recorded: { tab: "todo", label: "See the outcome" },
  learned: { tab: "why", label: "See what memory holds" },
};

/** Suspense boundary: useSearchParams needs one so ?tab= changes (e.g. from the guided path) switch tabs live. */
export default function CaseFilePage() {
  return (
    <Suspense fallback={null}>
      <CaseFile />
    </Suspense>
  );
}

function CaseFile() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params.id ?? ""));
  const { data, error, loading, reload } = useApi<WbIncident>(id ? `/incidents/${encodeURIComponent(id)}` : null);
  const events = useEvents(id || null);
  const reloadEvents = events.reload;
  const [tab, setTabState] = useState<TabId>("happened");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionOutcome | null>(null);

  const searchTab = useSearchParams().get("tab");
  useEffect(() => {
    // Deep link: /app/incidents/{id}?tab=happened|why|todo; re-runs when the query changes on the same page.
    const t = readTab();
    if (t) setTabState(t);
  }, [id, searchTab]);

  const setTab = useCallback((t: TabId) => {
    setTabState(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch { /* history unavailable */ }
  }, []);

  const reloadAll = useCallback(() => { reload(); reloadEvents(); }, [reload, reloadEvents]);

  const onChip = useCallback((evId: string) => {
    setHighlight(evId);
    setTab("happened");
  }, [setTab]);

  const onDecided = useCallback((o: DecisionOutcome) => {
    setDecision(o);
    reloadAll();
  }, [reloadAll]);

  const header = { explainKey: "case", title: "Case file", question: "What happened, why, and what should we do?" };
  if (loading && !data) return <PageTemplate {...header}><Loading rows={10} label="Loading the case" /></PageTemplate>;
  if (error && !data) return <PageTemplate {...header}><ErrorState error={error} onRetry={reload} title="Could not load this case" /></PageTemplate>;
  if (!data) return null;

  const inc = data;
  const stageKey = (inc.stage in STAGE_INDEX ? inc.stage : "detected") as StageKey;
  const stageDef = STAGES[STAGE_INDEX[stageKey]];
  const next = NEXT_TAB[stageKey];
  const critical = inc.severity === "critical";
  const awaiting = inc.plan?.status === "awaiting_approval";

  const glance = (
    <>
      <div className="case-meta" data-testid="case-meta">
        <span className="mono case-meta__ref">{inc.ref}</span>
        <CategoryChip category={inc.category} />
        <SeverityPill severity={inc.severity} />
        <span className="case-meta__owner">Owner: <b>{personaLabel(inc.owner_role)}</b></span>
        {inc.account_id != null ? <Link href={`/app/accounts/${inc.account_id}`} className="case-meta__link">Open account</Link> : null}
        <span className="caption">Scope: {humanize(inc.scope)}{inc.region ? ` · ${inc.region}` : ""}</span>
      </div>

      <section className="case-stage" aria-label="Where this case is in the workflow">
        <StageTracker stage={stageKey} timestamps={stageTimestamps(events.data?.items)} />
        <div className="case-stage__next" data-testid="stage-next">
          <span><b>Now: {stageDef.label}.</b> {stageDef.meaning}</span>
          <Button variant={stageKey === "detected" || awaiting ? "primary" : "secondary"} size="sm" onClick={() => setTab(next.tab)}>
            Next: {next.label}
          </Button>
        </div>
      </section>

      {inc.regulatory_sensitive ? (
        <div role="note" className="case-route-only">
          <strong>Route-only: QA Head + four-eyes. Strata gives no clinical advice.</strong>
          <span className="caption"> This case touches a regulatory-sensitive signal. STRATA routes it to the QA Head and records decisions; it proposes no clinical or product-quality action.</span>
        </div>
      ) : null}

      <MetricGroup title="Why this case matters">
        <Metric
          id="risk_score" label="Risk score" value={fmtNum(inc.risk_score)} unit="of 100"
          compare="3+ systems needed for high/critical"
          tone={critical ? "critical" : inc.severity === "high" || inc.severity === "elevated" ? "elevated" : "default"}
          meaning={`${inc.n_sources} independent system${inc.n_sources === 1 ? "" : "s"} (${inc.sources.join(", ")}) agree; their signals are combined (noisy-OR) and scaled by how many systems agree.`}
          implication={critical ? "Critical: act today." : "Higher means more independent systems agree something is wrong."}
          provenance="computed"
        />
        <Metric
          id="value_at_stake" label="₹ exposed" value={fmtINR(inc.value_at_stake)}
          compare="Baseline 12-week order value of the affected scope"
          meaning="What is at stake: the normal order value of the accounts in this case."
          implication="Exposure, not a forecast of what will be lost."
          provenance="computed"
        />
        <Metric
          id="silent_period_days" label="Silent period" value={inc.silent_period_days != null ? fmtNum(inc.silent_period_days, 0) : "—"} unit="days"
          compare={`Estimated onset ${fmtDate(inc.onset_estimated_at)}; detected ${fmtDate(inc.first_detected_at)} (simulated clock)`}
          meaning={inc.silent_period_basis || "Days the problem existed before a weekly manual review would have caught it."}
          implication="Roughly how much earlier STRATA surfaced this than a manual review would."
          provenance="assumption"
        />
      </MetricGroup>
      <p className="caption case-terms">
        What these mean: <TermHint term="risk_score" label="risk score" /> · <TermHint term="exposure" label="₹ exposed" /> · <TermHint term="silent_period" label="silent period" />
      </p>
    </>
  );

  return (
    <PageTemplate
      {...header}
      title={`Case file · ${inc.ref}`}
      question={inc.title}
      headerActions={<Link href="/app/incidents" className={buttonClass("ghost", "sm")}>All cases</Link>}
      glance={glance}
    >
      <div className="case-layout">
        <div className="case-layout__main">
          <Tabs
            value={tab}
            onChange={(t) => { setTab(t as TabId); if (t !== "happened") setHighlight(null); }}
            tabs={[
              { id: "happened", label: "What happened", content: <WhatHappenedTab incident={inc} highlight={highlight} /> },
              { id: "why", label: "Why and what we did last time", content: <WhyTab incident={inc} onChanged={reloadAll} onChip={onChip} /> },
              {
                id: "todo", label: awaiting ? "What to do (decision needed)" : "What to do",
                content: <PlanTab incident={inc} onChanged={reloadAll} onChip={onChip} decision={decision} onDecided={onDecided} onGoWhy={() => setTab("why")} />,
              },
            ]}
          />
        </div>
        <aside className="case-layout__rail" aria-label="Case timeline">
          <CaseTimeline incident={inc.ref} state={events} />
        </aside>
      </div>
    </PageTemplate>
  );
}
