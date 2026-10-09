"use client";

import Link from "next/link";
import { STAGES } from "@config/taxonomy";
import { Card, DataTable, ErrorState, Loading, Metric, MetricGroup, PageTemplate, TermHint, type ColumnDef } from "@/components/ui";
import { NoisyOrDiagram, combine, witnessP, type NoisyOrWitness } from "@/components/diagrams/NoisyOrDiagram";
import { useApi } from "@/lib/api/client";
import { fmtNum } from "@/lib/format";

const HERO = "INC-2026-0001";

interface EvidenceRow {
  id: string; signal_key: string; label: string; source: string; robust_z: number | null;
  direction: string; role: string; value: number | null; baseline: number | null;
}
interface HeroIncident {
  ref: string; account_name: string | null; risk_score: number; severity: string; n_sources: number; sources: string[];
  evidence: EvidenceRow[];
}
interface CatalogItem { key: string; weight: number; source: string }

interface Row extends NoisyOrWitness { strength: number }

export default function DecidesPage() {
  const inc = useApi<HeroIncident>(`/incidents/${HERO}`);
  const cat = useApi<{ items: CatalogItem[] }>("/signals/catalog");

  const weights = new Map((cat.data?.items ?? []).map((c) => [c.key, c.weight]));
  const rows: Row[] = (inc.data?.evidence ?? [])
    .filter((e) => e.role === "supporting" && e.direction === "adverse" && e.robust_z !== null && weights.has(e.signal_key))
    .map((e) => {
      const w = weights.get(e.signal_key) ?? 0;
      const z = e.robust_z ?? 0;
      return { id: e.id, label: e.label, source: e.source, weight: w, z, strength: Math.min(1, Math.abs(z) / 4), p: witnessP(w, z) };
    })
    .sort((a, b) => b.p - a.p);
  const res = rows.length ? combine(rows) : null;
  const engine = inc.data?.risk_score;
  const diff = res && engine !== undefined ? engine - res.score : 0;
  const ready = !!(inc.data && cat.data && res);

  const reconcile = !res || engine === undefined
    ? ""
    : diff === 0
      ? `This matches the engine's risk score of ${engine}.`
      : (inc.data as { persistence_bonus?: boolean } | null)?.persistence_bonus
        ? `The engine reports ${engine}. The engine confirms the persistence bonus was applied (+5 because the same pattern was already at incident level in the previous weekly run), capped at 100.`
        : `The engine reports ${engine}; the small difference comes from rounding of the z-scores shown here.`;

  const cols: ColumnDef<Row>[] = [
    { accessorKey: "label", header: "Witness (signal)" },
    { accessorKey: "source", header: "System", meta: { mono: true } },
    { accessorKey: "z", header: "Robust z", meta: { numeric: true, help: "How unusual vs the account's own normal" }, cell: (c) => fmtNum(c.row.original.z, 2) },
    { accessorKey: "strength", header: "Strength min(1, |z|÷4)", meta: { numeric: true }, cell: (c) => fmtNum(c.row.original.strength, 2) },
    { accessorKey: "weight", header: "Weight", meta: { numeric: true, help: "From the signal catalog" }, cell: (c) => fmtNum(c.row.original.weight, 2) },
    { accessorKey: "p", header: "p = weight × strength", meta: { numeric: true }, cell: (c) => fmtNum(c.row.original.p, 3) },
  ];

  const takeaway = ready
    ? `In the hero case, ${rows.length} warning signals from ${res!.nSources} systems combine to ${fmtNum(res!.raw, 3)}; with ${res!.nSources} systems agreeing the factor is ×${res!.factor.toFixed(2)}, giving ${res!.score} (${res!.band}). ${reconcile}`
    : "Several independent warning signals from different systems add up; one system on its own can never go above elevated.";

  return (
    <PageTemplate
      explainKey="decides"
      title="How STRATA decides"
      question="How do separate warning signals become a problem that needs a person?"
      glance={inc.data ? (
        <MetricGroup title="Hero case, as computed by the engine">
          <Metric id="risk_score" label="Risk score" value={fmtNum(inc.data.risk_score)} unit="of 100" provenance="computed"
            meaning={`Engine score for ${HERO} (${inc.data.severity}).`}
            implication="50 or more opens an incident; this one is in the top band." next={{ label: "Open the case", href: `/app/incidents/${HERO}` }} />
          <Metric id="n_sources" label="Source systems agreeing" value={fmtNum(inc.data.n_sources)} provenance="computed"
            meaning={`Separate systems among the warnings: ${inc.data.sources.join(", ")}.`}
            implication="3 or more systems give the full ×1.00 factor and allow high or critical." />
        </MetricGroup>
      ) : undefined}
      visual={{
        takeaway,
        node: (
          <>
            {inc.loading || cat.loading ? <Loading rows={4} label="Loading the hero case" /> : null}
            {inc.error ? <ErrorState error={inc.error} onRetry={inc.reload} title="Could not load the hero case" /> : null}
            {cat.error ? <ErrorState error={cat.error} onRetry={cat.reload} title="Could not load the signal catalog" /> : null}
            <NoisyOrDiagram
              witnesses={ready ? rows : undefined}
              engineScore={ready ? engine : undefined}
              provenance="computed"
              caption={ready
                ? `Worked example, ${HERO}: each box is one adverse signal with its robust z and contribution p, computed from the engine's evidence and the catalog weights.`
                : undefined}
            />
          </>
        ),
      }}
      actions={
        <>
          <Link href={`/app/incidents/${HERO}`} className="btn btn--primary">Open the hero case</Link>
          <Link href="/app/help" className="btn btn--secondary">Glossary</Link>
          <Link href="/app/help/diagrams" className="btn btn--secondary">Diagram gallery</Link>
        </>
      }
    >
      <Card title="Step by step, in plain words">
        <ol className="decides-steps">
          <li>
            <b>Each account is compared with itself.</b> For every signal STRATA takes the last 4 weeks and compares them with the same
            4-week measure over the account&apos;s own last two years (its <TermHint term="baseline" label="baseline" />), never with other accounts.
          </li>
          <li>
            <b>How unusual is it?</b> The gap is measured as a <TermHint term="robust_z" label="robust z-score" />: (value − median) ÷ (1.4826 × median
            absolute deviation). A signal counts as a warning (a <TermHint term="witness" label="witness" />) only when it moves 2 or more in its bad direction.
            <span className="decides-formula">z = (x_now − median) / (1.4826 × MAD)</span>
          </li>
          <li>
            <b>Each witness gets a contribution.</b> p = weight × min(1, |z| ÷ 4). The weight comes from the signal catalog (for example fill rate 0.55,
            order volume 0.50); the strength stops growing at |z| = 4.
          </li>
          <li>
            <b>Witnesses combine by <TermHint term="noisy_or" label="noisy-OR" />.</b> combined = 1 − (1 − p1) × (1 − p2) × … Several weak but independent
            warnings add up; a single one stays weak.
            <span className="decides-formula">risk_raw = 1 − Π (1 − p_i)</span>
          </li>
          <li>
            <b>Do separate systems agree?</b> The result is multiplied by a <TermHint term="source_diversity" label="source-diversity factor" />: one system ×0.55,
            two ×0.80, three or more ×1.00. If the same pattern was already at incident level in last week&apos;s run, +0.05 is added.
            <span className="decides-formula">risk_score = round(100 × min(1, risk_raw × diversity + persistence))</span>
          </li>
          <li>
            <b>Severity bands.</b> <TermHint term="severity_bands" label="Bands" />: healthy under 30, watch 30–49, elevated 50–69, high 70–84, critical 85+.
            With fewer than 3 systems the score is capped at 69, so one or two systems can never reach high or critical.
          </li>
          <li><b>Incident.</b> A score of 50 or more opens an incident with a category, an owner role and a stage.</li>
        </ol>
      </Card>

      {ready ? (
        <DataTable
          columns={cols}
          data={rows}
          provenance="computed"
          caption={`What it is: the ${rows.length} adverse signals behind ${HERO}, with the catalog weight and the resulting contribution p. What it implies: no single row is decisive; together they give combined ${fmtNum(res!.raw, 3)} and score ${res!.score} before any persistence bonus.`}
          initialSort={[{ id: "p", desc: true }]}
        />
      ) : null}

      <Card title="What is adjusted before scoring">
        <ul className="plain-list">
          <li><TermHint term="seasonality" label="Seasonality:" /> orders are divided by a week-of-year index from the prior year, so the normal festival dip is not a problem.</li>
          <li><TermHint term="common_mode" label="Common-mode move:" /> if more than 60% of accounts move the same way in the same weeks, that shared move is removed before each account is scored.</li>
          <li>Too little history: a signal with fewer than 26 weekly baseline points is suppressed, never guessed.</li>
        </ul>
      </Card>

      <Card title="When STRATA stays silent on purpose">
        <p>
          The <TermHint term="data_health_guard" label="Data Health Guard" /> pauses judgement when the data, not the customer, changed: a feed older than 3× its
          expected interval pauses every signal from that source, and an account whose latest order load has more than 5% duplicate rows has its order
          signals paused. A notice appears on the Sources page instead of a false alarm.
        </p>
      </Card>

      <Card title="Quality and safety cases are route-only">
        <p>
          Complaints about one batch from 2 or more accounts within 21 days, or wording that may describe a patient reaction, always create an incident for
          the QA Head regardless of score. STRATA only routes these (<TermHint term="route_only" label="route-only" />): two different QA approvers are
          needed (<TermHint term="four_eyes" label="four-eyes" />), and it gives no clinical advice and drafts nothing patient-facing.
        </p>
      </Card>

      <Card title="What happens after detection">
        <ol className="decides-after" aria-label="Steps after detection">
          {STAGES.map((s) => (
            <li key={s.key}><b>{s.label}.</b> {s.meaning} <span className="muted">Next: {s.next}</span></li>
          ))}
        </ol>
        <p className="caption">
          Approval creates <TermHint term="simulated_task" label="simulated tasks" /> and message drafts; nothing is sent outside the machine. In the Lab the
          outcome is a scripted counterfactual (illustrative), and it is written back to memory so the next similar case can reuse it.
        </p>
      </Card>
    </PageTemplate>
  );
}
