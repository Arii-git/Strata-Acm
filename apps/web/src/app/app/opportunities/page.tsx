"use client";

import Link from "next/link";
import {
  Card,
  EmptyState,
  ErrorState,
  EvidenceChip,
  Loading,
  Metric,
  PageHeader,
  SeverityPill,
  buttonClass,
} from "@/components/ui";
import { useApi } from "@/lib/api/client";
import type { Severity } from "@/lib/api/types";
import { fmtINR, fmtNum, fmtPct, humanize } from "@/lib/format";

interface OppRow {
  id: string; ref: string; title: string; account_id: number | string | null; account_name: string;
  account_type: string | null; region: string | null; severity: Severity; risk_score: number;
  value_at_stake: number; sources: string[]; owner_role: string; age_days: number;
}
interface OppEvidence { id: string; label: string; delta: number; robust_z: number; caption: string; definition?: string; note?: string; unit: string }
interface OppDetail { ref: string; evidence: OppEvidence[] }

const PLAY = "Targeted cross-sell visit + sample plan";

function OppCard({ o }: { o: OppRow }) {
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
            <SeverityPill severity={o.severity} />
            {o.account_id ? <Link href={`/app/accounts/${o.account_id}`}>{o.account_name}</Link> : <span>{o.account_name}</span>}
            <span className="muted">{[o.account_type && humanize(o.account_type), o.region].filter(Boolean).join(" · ")}</span>
          </div>
          <Metric
            label="Exposure"
            value={fmtINR(o.value_at_stake)}
            provenance="computed"
            meaning="Baseline 12-week order value of this account: exposure, not predicted gain or loss."
            implication="Sizes the relationship the cross-sell would build on."
          />
          <div className="caption">Owner: {humanize(o.owner_role)} · detected {fmtNum(o.age_days)} days ago · source: {o.sources.join(", ")}</div>
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
  const { data, error, loading, reload } = useApi<{ items: OppRow[] }>("/opportunities");
  return (
    <>
      <PageHeader question="Where is growth we are not acting on?" title="Opportunity Radar" />
      {loading && !data ? <Loading rows={4} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
        <EmptyState title="No open opportunities" body="No account currently shows growth with a product gap." />
      ) : (
        <div className="stack">
          {data.items.slice(0, 6).map((o) => <OppCard key={o.ref} o={o} />)}
        </div>
      )}
    </>
  );
}
