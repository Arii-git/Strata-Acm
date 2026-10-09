"use client";

import Link from "next/link";
import {
  Card,
  CategoryChip,
  Details,
  ErrorState,
  EvidenceChip,
  Loading,
  Metric,
  MetricGroup,
  PageTemplate,
  SeverityPill,
  TermHint,
  buttonClass,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { ProblemTable } from "@/components/features/problems/ProblemTable";
import { sortProblems, stageText, type ProblemRow } from "@/components/features/problems/model";
import { useApi } from "@/lib/api/client";
import { fmtINR, fmtNum, fmtPct, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";

interface OppEvidence { id: string; label: string; delta: number; robust_z: number; caption: string; definition?: string; note?: string; unit: string }
interface OppDetail { ref: string; evidence: OppEvidence[] }

const PLAY = "Targeted cross-sell visit + sample plan";

function OppCard({ o }: { o: ProblemRow }) {
  const { data, error, loading, reload } = useApi<OppDetail>(`/incidents/${o.ref}`);
  return (
    <Card
      title={<span><span className="mono">{o.ref}</span> {o.title}</span>}
      actions={<Link className={buttonClass("secondary", "sm")} href={`/app/incidents/${o.ref}`}>Open</Link>}
      provenance="computed"
    >
      <div className="grid grid--2">
        <div className="stack" style={{ gap: "var(--sp-2)" }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <CategoryChip category={o.category ?? "opportunity"} size="sm" />
            <SeverityPill severity={o.severity} />
            <span className="caption" style={{ maxWidth: "none" }}>Stage: {stageText(o.stage)}</span>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {o.account_id ? <Link href={`/app/accounts/${o.account_id}`}>{o.account_name}</Link> : <span>{o.account_name}</span>}
            <span className="muted">{[o.account_type && humanize(o.account_type), o.region].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="row" style={{ gap: "var(--sp-1)" }}>
            <strong className="num">{fmtINR(o.value_at_stake)}</strong> exposed <TermHint term="exposure" />
          </div>
          <div className="caption">The account&apos;s normal 12-week order value: what the cross-sell builds on, not a forecast of gain.</div>
          <div className="caption">Owner: {personaLabel(o.owner_role)} · detected {fmtNum(o.age_days)} days ago · source: {o.sources.join(", ")}</div>
        </div>
        <div className="stack" style={{ gap: "var(--sp-2)" }}>
          <strong>Evidence</strong>
          {loading && !data ? <Loading rows={2} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data || data.evidence.length === 0 ? (
            <span className="caption">No evidence attached.</span>
          ) : (
            data.evidence.map((e) => (
              <div key={e.id} className="stack" style={{ gap: "var(--sp-1)" }}>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <EvidenceChip id={e.id} label={e.label} />
                  <span className="num">{fmtPct(e.delta)} growth · z {fmtNum(e.robust_z, 2)}</span>
                </div>
                {e.note ? <div>{e.note}</div> : null}
                <div className="caption">{e.caption}</div>
              </div>
            ))
          )}
          <div className="card" style={{ background: "var(--surface-2)" }}>
            <div className="caption" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>Playbook suggestion</div>
            <div>{PLAY}</div>
            <div className="caption">A starting play from the playbook, for the team to review. Not sent or scheduled.</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function OpportunitiesPage() {
  const { mode } = useViewMode();
  const { data, error, loading, reload } = useApi<{ items: ProblemRow[] }>("/opportunities");
  const items = sortProblems(data?.items ?? []);
  const top = items[0];
  const totalExposed = items.reduce((s, o) => s + (o.value_at_stake || 0), 0);
  const accounts = new Set(items.map((o) => o.account_id).filter(Boolean)).size;

  const takeaway = !data ? "Loading…"
    : !items.length ? "No account currently shows growth with a product gap."
    : `${fmtNum(items.length)} open ${items.length === 1 ? "opportunity" : "opportunities"}; the largest is ${top.account_name} with ${fmtINR(top.value_at_stake)} exposed. Suggested play: ${PLAY.toLowerCase()}.`;

  return (
    <PageTemplate
      explainKey="opportunities"
      title="Opportunity Radar"
      question="Where is growth we are not acting on?"
      glance={items.length ? (
        <MetricGroup title="At a glance">
          <Metric
            id="opportunities_count" label="Open opportunities" value={fmtNum(items.length)} unit={items.length === 1 ? "opportunity" : "opportunities"}
            compare={`${fmtNum(accounts)} account${accounts === 1 ? "" : "s"}`}
            meaning="Accounts growing in related lines that do not buy a complementary line."
            implication="Each is a candidate for a cross-sell visit."
            provenance="computed" next={{ label: "Show on the board", href: "/app/problems?cat=opportunity" }}
          />
          <Metric
            id="opportunity_exposure" label="₹ exposed across them" value={fmtINR(totalExposed)} unit="12-week order value"
            compare="sum of the accounts' normal 12-week order value"
            meaning="The size of the relationships the cross-sell would build on."
            implication="Exposure, not a forecast of gain: it sizes the relationship, not the upside."
            provenance="computed" next={{ label: "Open the largest", href: `/app/incidents/${top.ref}` }}
          />
        </MetricGroup>
      ) : undefined}
      visual={{
        takeaway,
        node: loading && !data ? <Loading rows={4} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
          <ArtEmptyState art="opportunity" title="No open opportunities" body="An opportunity appears when an account grows in two or more therapy areas but buys nothing in a complementary one. None does right now." />
        ) : (
          <div className="stack">
            {items.slice(0, 3).map((o) => <OppCard key={o.ref} o={o} />)}
          </div>
        ),
      }}
      actions={top ? (
        <>
          <Link className={buttonClass("primary")} href={`/app/incidents/${top.ref}`}>Plan the cross-sell visit for {top.ref}</Link>
          {top.account_id ? <Link className={buttonClass("secondary")} href={`/app/accounts/${top.account_id}`}>Open the account</Link> : null}
        </>
      ) : undefined}
    >
      {items.length > 3 ? (
        <Details title={`All ${fmtNum(items.length)} opportunities`} defaultOpen={mode === "detailed"}>
          <ProblemTable rows={items} caption="Every open opportunity with the same fields as the Problems board. ₹ exposed is the account's normal 12-week order value, not a forecast of gain." />
        </Details>
      ) : null}
    </PageTemplate>
  );
}
