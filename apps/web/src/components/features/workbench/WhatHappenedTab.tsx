"use client";

import { useMemo } from "react";
import type { AccountRow, ListResponse } from "@/lib/api/types";
import { useApi } from "@/lib/api/client";
import { ErrorState, Loading, TermHint } from "@/components/ui";
import { SignalSmallMultiples, type SignalItem } from "@/components/diagrams/SignalSmallMultiples";
import { ChannelMap } from "@/components/diagrams/ChannelMap";
import { RegionTileMap, type RegionTile } from "@/components/diagrams/RegionTileMap";
import { EvidenceTab } from "./EvidenceTab";
import { fmtEvidenceValue, type WbIncident } from "./shared";

/** Tab 1 — What happened: signals vs their own baseline, where the case sits in the channel, the evidence. */
export function WhatHappenedTab({ incident, highlight }: { incident: WbIncident; highlight: string | null }) {
  const accounts = useApi<ListResponse<AccountRow>>("/accounts");
  const items = useMemo<SignalItem[]>(() => incident.evidence.map((e) => {
    const v = fmtEvidenceValue(e);
    return { id: e.id, label: e.label, source: e.source, role: e.role, series: e.series, headline: v.headline, detail: v.detail };
  }), [incident.evidence]);

  const typeById = useMemo(() => Object.fromEntries((accounts.data?.items ?? []).map((a) => [String(a.id), a.type])), [accounts.data]);
  const regions = useMemo<RegionTile[]>(() => {
    const m = new Map<string, RegionTile>();
    for (const a of accounts.data?.items ?? []) {
      const r = m.get(a.region) ?? { name: a.region, accounts: 0, value_12w: 0 };
      r.accounts += 1;
      r.value_12w += a.value_12w || 0;
      m.set(a.region, r);
    }
    const aff = m.get(incident.region);
    if (aff) aff.exposed = incident.blast_radius.length;
    return [...m.values()];
  }, [accounts.data, incident.region, incident.blast_radius.length]);

  const isRegion = incident.scope === "region";
  return (
    <div className="stack case-tab">
      <section className="case-section" aria-labelledby="sec-signals">
        <h3 id="sec-signals" className="case-section__title">Signals against this {incident.scope === "account" ? "account" : "scope"}&apos;s own normal</h3>
        <SignalSmallMultiples
          items={items} sources={incident.sources} riskScore={incident.risk_score} severity={incident.severity} onset={incident.onset_estimated_at}
        />
      </section>

      <section className="case-section" aria-labelledby="sec-channel">
        <h3 id="sec-channel" className="case-section__title">Where this sits in the channel <TermHint term="blast_radius" label="and who else is exposed" /></h3>
        {accounts.loading && !accounts.data ? <Loading rows={3} label="Loading account types" /> : accounts.error && !accounts.data ? (
          <ErrorState error={accounts.error} onRetry={accounts.reload} title="Could not load account types" />
        ) : (
          <ChannelMap accountType={incident.account_type} accountName={incident.account_name} blast={incident.blast_radius} typeById={typeById} />
        )}
      </section>

      {isRegion ? (
        <section className="case-section" aria-labelledby="sec-region">
          <h3 id="sec-region" className="case-section__title">Affected region</h3>
          {accounts.data ? <RegionTileMap regions={regions} affected={incident.region} /> : null}
        </section>
      ) : null}

      <EvidenceTab evidence={incident.evidence} blast={incident.blast_radius} highlight={highlight} />
    </div>
  );
}
