"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/api/client";
import { Card, ErrorState, Loading, Metric, PageHeader, SeverityPill, StatusPill, Tabs, buttonClass } from "@/components/ui";
import { fmtDate, fmtINR, fmtNum, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import type { WbIncident } from "@/components/features/workbench/shared";
import { EvidenceTab } from "@/components/features/workbench/EvidenceTab";
import { CausalMap } from "@/components/features/workbench/CausalMap";
import { AgentTrace } from "@/components/features/workbench/AgentTrace";
import { MemoryTab } from "@/components/features/workbench/MemoryTab";
import { PlanTab } from "@/components/features/workbench/PlanTab";
import { ApprovalBar } from "@/components/features/workbench/ApprovalBar";

const TAB_IDS = ["evidence", "map", "trace", "memory", "plan"];

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params.id ?? ""));
  const { data, error, loading, reload } = useApi<WbIncident>(id ? `/incidents/${encodeURIComponent(id)}` : null);
  const [tab, setTab] = useState("evidence");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

  useEffect(() => {
    // Deep link: /app/incidents/{id}?tab=plan (read on the client; avoids a Suspense boundary for useSearchParams).
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TAB_IDS.includes(t)) setTab(t);
  }, [id]);

  const onChip = useCallback((evId: string) => {
    setHighlight(evId);
    setTab("evidence");
  }, []);

  if (loading && !data) return <div className="stack"><PageHeader question="What is happening, why, what did we do last time, what should we do?" title="Incident Workbench" /><Loading rows={10} /></div>;
  if (error && !data) return <div className="stack"><PageHeader question="What is happening, why, what did we do last time, what should we do?" title="Incident Workbench" /><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const inc = data;
  const plan = inc.plan;
  const awaiting = plan?.status === "awaiting_approval";
  const critical = inc.severity === "critical";

  return (
    <div className="stack">
      <PageHeader question="What is happening, why, what did we do last time, what should we do?" title="Incident Workbench">
        <Link href="/app/incidents" className={buttonClass("ghost", "sm")}>All incidents</Link>
      </PageHeader>

      <Card>
        <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
          <span className="mono" style={{ fontSize: "var(--fs-13)" }}>{inc.ref}</span>
          <SeverityPill severity={inc.severity} />
          <StatusPill status={inc.status} />
          <span className="chip">{humanize(inc.kind)}</span>
          <span className="caption">Owner: {personaLabel(inc.owner_role)}</span>
          {inc.account_id != null ? <Link href={`/app/accounts/${inc.account_id}`} className="caption">Open account</Link> : null}
        </div>
        <h2 style={{ margin: "0 0 var(--sp-4)", fontSize: "var(--fs-20)", fontWeight: 600 }}>{inc.title}</h2>
        <div className="grid grid--3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Metric
            label="Risk score" value={fmtNum(inc.risk_score)} tone={critical ? "critical" : inc.severity === "high" || inc.severity === "elevated" ? "elevated" : "default"}
            meaning="Noisy-OR of independent adverse signals, multiplied by a source-diversity factor (0-100)."
            implication={critical ? "Critical: act now." : "Higher means more independent systems agree something is wrong."}
            provenance="computed"
          />
          <Metric label="Source systems" value={fmtNum(inc.n_sources)} meaning={`Independent systems moving together: ${inc.sources.join(", ")}.`} implication="Two or more systems agreeing is a pattern, not noise." provenance="computed" />
          <Metric label="Revenue exposure" value={fmtINR(inc.value_at_stake)} meaning="Baseline 12-week order value of the affected scope." implication="Exposure, not predicted loss: what is in play if the account drifts away." provenance="computed" />
          <Metric label="Silent period" value={`${fmtNum(inc.silent_period_days, 0)} days`} meaning={inc.silent_period_basis} implication="Roughly how much earlier Strata surfaced this than a manual review would." provenance="assumption" />
          <Metric label="Estimated onset" value={fmtDate(inc.onset_estimated_at)} meaning={`First detected ${fmtDate(inc.first_detected_at, true)} (simulated clock).`} implication="Evidence before this date is the account's own baseline." provenance="computed" />
        </div>
      </Card>

      {inc.regulatory_sensitive ? (
        <div role="alert" className="card" style={{ borderColor: "var(--amber-600)", background: "var(--amber-100)" }}>
          <strong>Route-only: QA Head + four-eyes. Strata gives no clinical advice.</strong>
          <p className="caption" style={{ margin: "var(--sp-1) 0 0" }}>This incident touches a regulatory-sensitive signal. Strata routes it to the QA Head and records decisions; it proposes no clinical or product-quality action.</p>
        </div>
      ) : null}

      {decisionMsg ? <div role="status" className="card" style={{ borderColor: "var(--green-600)" }}>{decisionMsg}</div> : null}

      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); if (t !== "evidence") setHighlight(null); }}
        tabs={[
          { id: "evidence", label: `Evidence (${inc.evidence.length})`, content: <EvidenceTab evidence={inc.evidence} blast={inc.blast_radius} highlight={highlight} /> },
          { id: "map", label: "Causal map", content: <CausalMap incident={inc} /> },
          { id: "trace", label: "Agent trace", content: <AgentTrace incident={inc} onChanged={reload} onChip={onChip} /> },
          { id: "memory", label: "Memory", content: <MemoryTab matches={inc.investigation?.memory_matches ?? null} retrieval={inc.investigation?.retrieval} /> },
          { id: "plan", label: awaiting ? "Plan (awaiting approval)" : "Plan", content: <PlanTab incident={inc} onChanged={reload} onChip={onChip} /> },
        ]}
      />

      {plan && awaiting ? <ApprovalBar plan={plan} onDecided={(m) => { setDecisionMsg(m); reload(); }} /> : null}
    </div>
  );
}
