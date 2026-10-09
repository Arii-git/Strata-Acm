"use client";

import { humanize } from "@/lib/format";
import { AgentTrace } from "./AgentTrace";
import { CausalMap } from "./CausalMap";
import { MemoryTab } from "./MemoryTab";
import type { WbIncident } from "./shared";

/** Tab 2 — Why and what we did last time: agent steps, cited narrative, hypotheses, causal map, memory. */
export function WhyTab({ incident, onChanged, onChip }: { incident: WbIncident; onChanged: () => void; onChip: (id: string) => void }) {
  const inv = incident.investigation;
  if (!inv) return <div className="stack case-tab"><AgentTrace incident={incident} onChanged={onChanged} onChip={onChip} /></div>;

  const best = [...inv.memory_matches].sort((a, b) => b.similarity - a.similarity)[0];
  const takeaway = `Most likely cause: ${humanize(inv.cause)} (rule confidence ${inv.cause_confidence.toFixed(2)}).` +
    (best ? ` Closest past case: ${best.ref} (similarity ${best.similarity.toFixed(2)}), outcome ${humanize(best.outcome).toLowerCase()}.` : " No similar past case found.");
  return (
    <div className="stack case-tab">
      <p className="takeaway" data-testid="why-takeaway">{takeaway}</p>
      <AgentTrace incident={incident} onChanged={onChanged} onChip={onChip} />
      <section className="case-section" aria-labelledby="sec-map">
        <h3 id="sec-map" className="case-section__title">How the evidence leads to the cause</h3>
        <CausalMap incident={incident} />
      </section>
      <MemoryTab matches={inv.memory_matches} retrieval={inv.retrieval} />
    </div>
  );
}
