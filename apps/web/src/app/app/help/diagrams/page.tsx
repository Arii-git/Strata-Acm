"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CATEGORIES } from "@config/taxonomy";
import { ErrorState, Loading, PageTemplate, ProvenanceBadge, StageTracker } from "@/components/ui";
import { useApi } from "@/lib/api/client";
import type { AccountRow, ListResponse, MemoryMatch, PlanStep, Series } from "@/lib/api/types";
import { LoopDiagram } from "@/components/diagrams/LoopDiagram";
import { ArchitectureDiagram } from "@/components/diagrams/ArchitectureDiagram";
import { ConsequenceFlow, type ConsequenceDraft, type ConsequenceStep } from "@/components/diagrams/ConsequenceFlow";
import { SignalSmallMultiples, type SignalItem } from "@/components/diagrams/SignalSmallMultiples";
import { ChannelMap } from "@/components/diagrams/ChannelMap";
import { RegionTileMap, type RegionTile } from "@/components/diagrams/RegionTileMap";
import { SimilarityBars } from "@/components/diagrams/SimilarityBars";
import { EmptyStateArt, type EmptyArtKey } from "@/components/diagrams/EmptyStateArt";
import { NoisyOrDiagram, witnessP, type NoisyOrWitness } from "@/components/diagrams/NoisyOrDiagram";

const HERO = "INC-2026-0001";

/** Diagrams expected in components/diagrams (lanes A, B, C, D). All present at the time of writing; a missing one is listed here as pending. */
const PENDING: string[] = [];

const EMPTY_KEYS: EmptyArtKey[] = [
  ...CATEGORIES.map((c) => c.key as EmptyArtKey),
  "tasks", "outcome", "memory", "audit", "notebook",
];

interface Summary { ref: string; scope: string; region: string; stage?: string; kind: string }
interface Ev { id: string; signal_key: string; label: string; source: string; role: string; direction: string; robust_z: number | null; series: Series | null }
interface Inc {
  ref: string; account_name: string | null; account_type: string | null; region: string; scope: string; stage?: string;
  risk_score: number; severity: string; sources: string[]; onset_estimated_at: string | null;
  evidence: Ev[];
  blast_radius: { account_id: string | number; exposure_value: number }[];
  investigation: { memory_matches: MemoryMatch[] } | null;
  plan: { steps: PlanStep[]; drafts: ConsequenceDraft[]; requires_role: string; four_eyes: boolean } | null;
}
interface Sop { ref: string; title: string; steps: ConsequenceStep[] }

function Section({ id, title, caption, provenance, children }: { id: string; title: string; caption: string; provenance?: "computed" | "illustrative" | "synthetic" | "assumption"; children: React.ReactNode }) {
  return (
    <section className="gallery__item" aria-labelledby={`g-${id}`} data-testid={`gallery-${id}`}>
      <h2 id={`g-${id}`}>{title}</h2>
      <p className="caption">{caption} {provenance ? <ProvenanceBadge provenance={provenance} /> : null}</p>
      {children}
    </section>
  );
}

export default function DiagramGalleryPage() {
  const list = useApi<ListResponse<Summary>>("/incidents");
  const hero = useApi<Inc>(`/incidents/${HERO}`);
  const accounts = useApi<ListResponse<AccountRow>>("/accounts");
  const catalog = useApi<ListResponse<{ key: string; weight: number }>>("/signals/catalog");
  const sops = useApi<ListResponse<Sop>>("/memory/items?kind=sop");

  // A case that already has an investigation (and maybe a plan), else the hero case. Read-only: the gallery never runs agents.
  const investigatedRef = list.data?.items.find((i) => i.stage && i.stage !== "detected")?.ref ?? null;
  const worked = useApi<Inc>(investigatedRef && investigatedRef !== HERO ? `/incidents/${investigatedRef}` : null);
  const caseInc = investigatedRef === HERO ? hero.data : worked.data;
  const regionInc = list.data?.items.find((i) => i.scope === "region") ?? null;

  const signalItems = useMemo<SignalItem[]>(() => (hero.data?.evidence ?? []).map((e) => ({
    id: e.id, label: e.label, source: e.source, role: e.role, series: e.series,
  })), [hero.data]);
  const typeById = useMemo(() => Object.fromEntries((accounts.data?.items ?? []).map((a) => [String(a.id), a.type])), [accounts.data]);
  const affectedRegion = regionInc?.region ?? hero.data?.region ?? null;
  const regions = useMemo<RegionTile[]>(() => {
    const m = new Map<string, RegionTile>();
    for (const a of accounts.data?.items ?? []) {
      const r = m.get(a.region) ?? { name: a.region, accounts: 0, value_12w: 0 };
      r.accounts += 1;
      r.value_12w += a.value_12w || 0;
      m.set(a.region, r);
    }
    return [...m.values()];
  }, [accounts.data]);
  const witnesses = useMemo<NoisyOrWitness[]>(() => {
    const w = new Map((catalog.data?.items ?? []).map((c) => [c.key, c.weight]));
    return (hero.data?.evidence ?? [])
      .filter((e) => e.role === "supporting" && e.direction === "adverse" && e.robust_z !== null && w.has(e.signal_key))
      .map((e) => ({ id: e.id, label: e.label, source: e.source, weight: w.get(e.signal_key) ?? 0, z: e.robust_z ?? 0, p: witnessP(w.get(e.signal_key) ?? 0, e.robust_z ?? 0) }))
      .sort((a, b) => b.p - a.p);
  }, [hero.data, catalog.data]);

  const plan = caseInc?.plan ?? null;
  const sop = sops.data?.items[0] ?? null;
  const matches = caseInc?.investigation?.memory_matches ?? null;

  const loading = hero.loading || list.loading || accounts.loading;
  const err = hero.error ?? list.error ?? accounts.error;

  return (
    <PageTemplate
      explainKey="diagrams"
      title="Diagram gallery"
      question="What does each diagram in STRATA show, and does it render?"
      visual={{
        takeaway: `${9 - PENDING.length} of 9 diagram components are built and shown below${PENDING.length ? `; pending: ${PENDING.join(", ")}` : ""}. Diagrams with data use live engine values for ${HERO}.`,
        node: loading && !hero.data ? <Loading rows={4} label="Loading sample data for the diagrams" /> : err ? <ErrorState error={err} onRetry={() => { hero.reload(); list.reload(); accounts.reload(); }} /> : null,
      }}
      actions={
        <>
          <Link href="/app/help" className="btn btn--secondary">Glossary</Link>
          <Link href="/app/help/decides" className="btn btn--secondary">How STRATA decides</Link>
        </>
      }
    >
      <div className="gallery">
        <Section id="loop" title="1. The STRATA loop" caption="Observe → Detect → Investigate → Remember → Act → Learn. Each step links to its page.">
          <LoopDiagram />
        </Section>

        <Section id="stages" title="2. Workflow stage tracker" caption={`The seven workflow stages, shown for ${HERO} at its current stage.`} provenance="computed">
          {hero.data ? <StageTracker stage={hero.data.stage ?? "detected"} /> : null}
        </Section>

        <Section id="signals" title="3. Signals against the account's own normal" caption={`Small multiples for ${HERO}: each signal's weekly series with the account's dashed baseline, the systems that agree and the combined score.`} provenance="computed">
          {hero.data ? (
            <SignalSmallMultiples items={signalItems} sources={hero.data.sources} riskScore={hero.data.risk_score} severity={hero.data.severity} onset={hero.data.onset_estimated_at} />
          ) : null}
        </Section>

        <Section id="noisy-or" title="4. Noisy-OR witnesses" caption={`How the witnesses for ${HERO} combine into one score (a schematic with symbols only is shown until the data loads).`} provenance="computed">
          {hero.data && catalog.data ? <NoisyOrDiagram witnesses={witnesses} engineScore={hero.data.risk_score} /> : <NoisyOrDiagram />}
        </Section>

        <Section id="channel" title="5. Channel map and blast radius" caption={`the client → stockists → chemist chains, hospital pharmacies and clinics (account types only), with ${HERO}'s affected type and exposed accounts.`} provenance="computed">
          {hero.data && accounts.data ? (
            <ChannelMap accountType={hero.data.account_type} accountName={hero.data.account_name} blast={hero.data.blast_radius} typeById={typeById} />
          ) : null}
        </Section>

        <Section id="region" title="6. Region tiles" caption={regionInc ? `Schematic region tiles with the affected region of ${regionInc.ref}.` : `Schematic region tiles; no regional incident is open, so ${HERO}'s region is highlighted.`} provenance="computed">
          {accounts.data ? <RegionTileMap regions={regions} affected={affectedRegion} /> : null}
        </Section>

        <Section id="similarity" title="7. Memory similarity bars" caption={matches ? `Past cases retrieved for ${caseInc?.ref}: 0.5 × text match + 0.3 × same cause + 0.2 × same signals.` : "No case has been investigated yet, so there are no retrieved matches to show. Run the investigation on a case to fill this diagram."} provenance={matches ? "computed" : undefined}>
          <SimilarityBars matches={matches ?? []} />
        </Section>

        <Section id="consequence" title="8. What happens after approval" caption={plan ? `Built from the plan for ${caseInc?.ref}: tasks, drafts, check-in, outcome and memory. Everything is simulated; nothing is sent.` : sop ? `No plan exists yet, so this sample uses the steps of ${sop.ref} (${sop.title}, a DRAFT SOP) with no drafts. Everything is simulated; nothing is sent.` : "Waiting for sample steps."} provenance={plan ? "computed" : "synthetic"}>
          {plan ? (
            <ConsequenceFlow steps={plan.steps} drafts={plan.drafts} requiresRole={plan.requires_role} fourEyes={plan.four_eyes} />
          ) : sop ? (
            <ConsequenceFlow steps={sop.steps} drafts={[]} requiresRole="operations_manager" fourEyes={false} />
          ) : null}
        </Section>

        <Section id="architecture" title="9. How it is built" caption="Only what is built is drawn as built: file store and SQLite, an explicit state machine, keyless TF-IDF retrieval. Planned parts are dashed and labelled planned.">
          <ArchitectureDiagram />
        </Section>

        <Section id="empty" title="10. Empty-state illustrations" caption="Line drawings shown when a list is empty, one per problem category and page kind. Decorative; the text beside them carries the meaning.">
          <ul className="row" style={{ flexWrap: "wrap", gap: "var(--sp-4)", listStyle: "none", margin: 0, padding: 0 }}>
            {EMPTY_KEYS.map((k) => (
              <li key={k} className="stack" style={{ alignItems: "center", gap: "var(--sp-1)" }}>
                <EmptyStateArt category={k} size={96} />
                <span className="caption">{k}</span>
              </li>
            ))}
          </ul>
        </Section>

        {PENDING.length ? (
          <section className="gallery__item" aria-labelledby="g-pending">
            <h2 id="g-pending">Pending</h2>
            <ul className="gallery__pending">{PENDING.map((p) => <li key={p}>{p} (not built yet)</li>)}</ul>
          </section>
        ) : null}
      </div>
    </PageTemplate>
  );
}
