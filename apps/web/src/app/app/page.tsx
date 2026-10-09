"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Caption,
  DataTable,
  EmptyState,
  ErrorState,
  EvidenceChip,
  Loading,
  Metric,
  PageHeader,
  SeverityPill,
  StatusPill,
  buttonClass,
  type ColumnDef,
} from "@/components/ui";
import { apiPost, qs, useApi } from "@/lib/api/client";
import type { HeldBack, Kind, Note, PersonaKey, Severity } from "@/lib/api/types";
import { fmtINR, fmtNum, humanize } from "@/lib/format";
import { usePersona } from "@/lib/persona";

// Local shapes (live engine JSON differs slightly from the shared types: account_id is numeric/null, ask has `message`).
interface BriefPriority {
  id: string; ref: string; title: string; kind: Kind; severity: Severity; risk_score: number;
  value_at_stake: number; n_sources: number; sources: string[]; account_id: number | string | null;
  account_name: string; status: string; owner_role: string; regulatory_sensitive: boolean;
}
interface BriefingLive {
  persona: PersonaKey; sim_now: string; greeting: string; role_label: string;
  signals_checked: number; sources_count: number; accounts_count: number;
  need_you: number; opportunities: number; qa_routed: number;
  summary: string; priorities: BriefPriority[]; held_back: HeldBack[]; notes_for_you: Note[];
}
interface AskCard { title: string; body: string; evidence: { id: string; label: string }[]; link: string | null }
interface AskLive { cards: AskCard[]; refused: boolean; message?: string | null }

const Q_CHANGED = "What changed since yesterday?";
const Q_MONEY = "Where are we quietly losing money?";

export default function BriefingPage() {
  const { persona } = usePersona();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<BriefingLive>(qs("/briefing", { persona }));
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskLive | null>(null);
  const [askErr, setAskErr] = useState<Error | null>(null);
  const [asking, setAsking] = useState(false);
  const [showHeld, setShowHeld] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    setAsked(text);
    setAsking(true);
    setAskErr(null);
    setAnswer(null);
    try {
      setAnswer(await apiPost<AskLive>("/ask", { question: text, persona }));
    } catch (e) {
      setAskErr(e as Error);
    } finally {
      setAsking(false);
    }
  }

  const top = data?.priorities.find((p) => p.kind === "risk") ?? data?.priorities[0];

  const columns: ColumnDef<BriefPriority>[] = [
    { id: "ref", accessorKey: "ref", header: "Ref", cell: (c) => <Link href={`/app/incidents/${c.row.original.ref}`}>{c.row.original.ref}</Link> },
    {
      id: "title", accessorKey: "title", header: "Item",
      cell: (c) => (
        <span className="row" style={{ flexWrap: "wrap" }}>
          <span>{c.row.original.title}</span>
          {c.row.original.kind === "opportunity" ? <StatusPill status="opportunity" tone="ok" label="Opportunity" /> : null}
          {c.row.original.regulatory_sensitive || c.row.original.owner_role === "qa_head" ? <StatusPill status="qa" tone="warn" label="Routed to QA" /> : null}
        </span>
      ),
    },
    { id: "severity", accessorKey: "severity", header: "Severity", cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "risk_score", accessorKey: "risk_score", header: "Risk", meta: { numeric: true, help: "Risk score 0-100 from weighted signal agreement" } },
    { id: "value_at_stake", accessorKey: "value_at_stake", header: "Exposure", meta: { numeric: true, help: "Baseline 12-week order value. Exposure, not predicted loss." }, cell: (c) => fmtINR(c.row.original.value_at_stake) },
    { id: "sources", accessorKey: "n_sources", header: "Sources", cell: (c) => `${c.row.original.n_sources} · ${c.row.original.sources.join(", ")}` },
  ];

  return (
    <>
      <PageHeader question="What needs me today?" title="Briefing" />
      {loading && !data ? <Loading rows={6} label="Loading briefing" /> : error ? <ErrorState error={error} onRetry={reload} /> : !data ? (
        <EmptyState title="No briefing yet" body="The engine returned no briefing for this role." />
      ) : (
        <div className="stack">
          <Card title={`${data.greeting}, ${data.role_label}.`} provenance="computed">
            <div className="stack" style={{ gap: "var(--sp-3)" }}>
              <p style={{ margin: 0, maxWidth: "72ch" }}>{data.summary}</p>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <Button variant="primary" disabled={!top} onClick={() => top && router.push(`/app/incidents/${top.ref}`)}>
                  Walk me through the top incident
                </Button>
                <Button onClick={() => ask(Q_CHANGED)}>{Q_CHANGED}</Button>
                <Button onClick={() => ask(Q_MONEY)}>{Q_MONEY}</Button>
              </div>
            </div>
          </Card>

          <div className="grid grid--3">
            <Metric label="Signals checked" value={fmtNum(data.signals_checked)} provenance="computed"
              meaning={`Signals evaluated overnight across ${fmtNum(data.accounts_count)} accounts and ${fmtNum(data.sources_count)} source systems.`}
              implication="Coverage of the scan; items below were the ones that crossed thresholds." />
            <Metric label="Need you" value={fmtNum(data.need_you)} provenance="computed" tone={data.need_you > 0 ? "elevated" : "default"}
              meaning="Risk items routed to this role today."
              implication={`${fmtNum(data.qa_routed)} quality-related items are routed to the QA head, not decided here.`} />
            <Metric label="Opportunities" value={fmtNum(data.opportunities)} provenance="computed"
              meaning="Growth gaps detected in the same scan."
              implication="Revenue we are not yet acting on; see Opportunity Radar." />
          </div>

          <Card title="Ask Strata" provenance="computed">
            <form className="row" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
              <input
                aria-label="Ask Strata a question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. top incident, losing money, what changed, opportunities"
                style={{ flex: 1, minWidth: 0, padding: "var(--sp-2) var(--sp-3)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", font: "inherit", background: "var(--surface)", color: "var(--ink)" }}
              />
              <Button type="submit" variant="primary" disabled={asking || !question.trim()}>Ask</Button>
            </form>
            <Caption meaning="Answers are built only from evidence the engine holds; each card cites its evidence IDs." implication="If nothing matches, Strata says so instead of guessing." />
            <div className="stack" style={{ marginTop: "var(--sp-3)", gap: "var(--sp-3)" }}>
              {asking ? <Loading rows={3} label="Answering" /> : askErr ? <ErrorState error={askErr} onRetry={() => asked && ask(asked)} title="Could not answer" /> : answer ? (
                answer.refused || answer.cards.length === 0 ? (
                  <EmptyState title="No evidence-backed answer" body={answer.message ?? "Strata answers only from evidence it holds."} />
                ) : (
                  <>
                    {asked ? <div className="caption">Answering: {asked}</div> : null}
                    <div className="grid grid--3">
                      {answer.cards.map((c, i) => (
                        <Card key={`${c.title}-${i}`} title={c.title} actions={c.link ? <Link className={buttonClass("secondary", "sm")} href={c.link}>Open</Link> : null}>
                          <p style={{ margin: "0 0 var(--sp-2)" }}>{c.body}</p>
                          <div className="row" style={{ flexWrap: "wrap" }}>
                            {c.evidence.map((ev) => <EvidenceChip key={ev.id} id={ev.id} label={ev.label} />)}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </>
                )
              ) : null}
            </div>
          </Card>

          <Card title="Today's priorities" provenance="computed">
            <DataTable
              columns={columns}
              data={data.priorities.slice(0, 7)}
              provenance="computed"
              caption="Ranked by exposure x confidence x urgency, capped by the daily Alert Budget. Exposure is the baseline 12-week order value of the affected scope: exposure, not predicted loss."
              onRowClick={(r) => router.push(`/app/incidents/${r.ref}`)}
              emptyText="Nothing needs you today."
            />
            <div style={{ marginTop: "var(--sp-3)" }}>
              <div className="row">
                <span>Alert Budget: {fmtNum(Math.min(data.priorities.length, 7))} shown, {fmtNum(data.held_back.length)} held back</span>
                {data.held_back.length > 0 ? (
                  <Button variant="ghost" size="sm" aria-expanded={showHeld} onClick={() => setShowHeld((s) => !s)}>{showHeld ? "Hide why" : "Why"}</Button>
                ) : null}
              </div>
              {showHeld ? (
                <ul className="caption" style={{ maxWidth: "none" }}>
                  {data.held_back.map((h) => (
                    <li key={h.ref}><Link className="mono" href={`/app/incidents/${h.ref}`}>{h.ref}</Link> {h.title}: {h.reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>

          {data.notes_for_you.length > 0 ? (
            <Card title="Notes for you">
              <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
                {data.notes_for_you.map((n, i) => (
                  <li key={n.id ?? i}>
                    <strong>{n.author}</strong> <span className="muted">({humanize(n.author_role)})</span>: {n.body}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
