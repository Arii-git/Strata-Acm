"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconChevronDown, IconChevronUp, IconNotes } from "@tabler/icons-react";
import {
  Button, CategoryChip, Details, EmptyState, ErrorState, EvidenceChip, PageTemplate, ProvenanceBadge, SeverityPill, TermHint, buttonClass,
} from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import type { BriefPriority, BriefingLive } from "@/components/features/home";
import { apiPost, qs, useApi } from "@/lib/api/client";
import { fmtINR, fmtNum } from "@/lib/format";
import { personaLabel, usePersona } from "@/lib/persona";

interface AskCard { title: string; body: string; evidence: { id: string; label: string }[]; link: string | null }
interface AskLive { cards: AskCard[]; refused: boolean; message?: string | null }

const TOP = 3;

/** One line on why this item is here, built only from engine fields. */
function whyLine(p: BriefPriority): string {
  const systems = `${fmtNum(p.n_sources)} ${p.n_sources === 1 ? "system" : "systems"}`;
  const where = p.account_name ? ` at ${p.account_name}` : "";
  return `${p.category_label}${where}, seen in ${systems}.`;
}

/** The one primary action for a case, by where it is in the loop. */
function primaryAction(p: BriefPriority): { label: string; href: string } {
  const href = `/app/incidents/${encodeURIComponent(p.ref)}`;
  if (p.stage === "awaiting_approval") return { label: "Review the plan", href: "/app/approvals" };
  if (p.stage === "detected") return { label: "Investigate", href };
  return { label: "Open the case", href };
}

function PriorityCard({ p, rank }: { p: BriefPriority; rank: number }) {
  const act = primaryAction(p);
  return (
    <li className="bcard" data-testid="briefing-card">
      <div className="bcard__top">
        <span className="bcard__rank" aria-label={`Priority ${rank}`}>{rank}</span>
        <SeverityPill severity={p.severity} />
        <CategoryChip category={p.category} size="sm" />
      </div>
      <h3 className="bcard__title">
        <Link href={`/app/incidents/${encodeURIComponent(p.ref)}`}>{p.title}</Link>
      </h3>
      <p className="bcard__why">{whyLine(p)}</p>
      <dl className="bcard__facts">
        <div>
          <dt>Exposure</dt>
          <dd className="num">{fmtINR(p.value_at_stake)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{p.regulatory_sensitive || p.owner_role === "qa_head" ? "QA Head (routed)" : personaLabel(p.owner_role)}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{p.stage_label}</dd>
        </div>
      </dl>
      <div className="bcard__foot">
        <span className="mono bcard__ref">{p.ref}</span>
        <Link href={act.href} className={buttonClass(rank === 1 ? "primary" : "secondary", "sm")}>
          {act.label} <IconArrowRight size={16} stroke={1.5} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

function CompactRow({ p, rank }: { p: BriefPriority; rank: number }) {
  return (
    <li>
      <Link href={`/app/incidents/${encodeURIComponent(p.ref)}`} className="brow">
        <span className="brow__rank" aria-hidden="true">{rank}</span>
        <span className="brow__title">{p.title}</span>
        <SeverityPill severity={p.severity} />
        <span className="brow__money num">{fmtINR(p.value_at_stake)}</span>
        <IconArrowRight size={16} stroke={1.5} aria-hidden="true" className="brow__go" />
      </Link>
    </li>
  );
}

function AskStrata() {
  const { persona } = usePersona();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskLive | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask() {
    const q = question.trim();
    if (!q) return;
    setBusy(true); setErr(null); setAnswer(null);
    try { setAnswer(await apiPost<AskLive>("/ask", { question: q, persona })); } catch (e) { setErr(e as Error); } finally { setBusy(false); }
  }
  return (
    <div className="stack" style={{ gap: "var(--sp-3)" }}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <input aria-label="Ask STRATA a question" className="brief-ask__input" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. what changed, where are we losing money" />
        <Button type="submit" variant="primary" disabled={busy || !question.trim()}>Ask</Button>
      </form>
      <p className="caption">Answers come only from evidence the engine holds, with evidence IDs. If nothing matches, STRATA says so.</p>
      <div aria-live="polite">
        {busy ? <StrataLoader size="sm" label="Answering" /> : err ? <ErrorState error={err} onRetry={() => void ask()} title="Could not answer" /> : answer ? (
          answer.refused || answer.cards.length === 0 ? (
            <EmptyState title="No evidence-backed answer" body={answer.message ?? "STRATA answers only from evidence it holds."} />
          ) : (
            <ul className="bask">
              {answer.cards.map((c, i) => (
                <li key={`${c.title}-${i}`} className="bask__item">
                  <strong>{c.title}</strong>
                  <p>{c.body}</p>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    {c.evidence.map((ev) => <EvidenceChip key={ev.id} id={ev.id} label={ev.label} />)}
                    {c.link ? <Link href={c.link} className="bnotes__link">Open</Link> : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

export default function BriefingPage() {
  const { persona } = usePersona();
  const { data, error, loading, reload } = useApi<BriefingLive>(qs("/briefing", { persona }));
  const [more, setMore] = useState(false);

  const common = { explainKey: "briefing", title: "Today's briefing", question: "What needs me today?" };
  if (loading && !data) return <PageTemplate {...common}><StrataLoader size="lg" label="Preparing your briefing" /></PageTemplate>;
  if (error) return <PageTemplate {...common}><ErrorState error={error} onRetry={reload} /></PageTemplate>;
  if (!data) return <PageTemplate {...common}><EmptyState title="No briefing yet" body="The engine returned no briefing for this role." /></PageTemplate>;

  const items = data.priorities;
  const top = items.slice(0, TOP);
  const rest = items.slice(TOP);
  const scope = `${fmtNum(data.signals_checked)} signals across ${fmtNum(data.accounts_count)} accounts`;
  const headline = data.need_you > 0
    ? `${fmtNum(data.need_you)} ${data.need_you === 1 ? "item needs" : "items need"} you today, out of ${scope}.`
    : `Nothing needs you today, out of ${scope}.`;

  return (
    <PageTemplate {...common} visual={{ takeaway: headline, node: (
      <div className="brief2">
        <div className="brief2__main">
          <section aria-label="Scan summary" className="brief2__head">
            <p className="brief2__facts">
              <span><span className="num">{fmtNum(data.sources_count)}</span> source systems</span>
              <span><span className="num">{fmtNum(data.need_you)}</span> need you</span>
              <span><span className="num">{fmtNum(data.opportunities)}</span> {data.opportunities === 1 ? "opportunity" : "opportunities"}</span>
              {data.qa_routed > 0 ? <span><span className="num">{fmtNum(data.qa_routed)}</span> routed to QA</span> : null}
              <ProvenanceBadge provenance="computed" />
            </p>
          </section>

          <section aria-labelledby="brief-top" className="stack" style={{ gap: "var(--sp-3)" }}>
            <h2 id="brief-top" className="section-label">Top priorities</h2>
            {top.length === 0 ? (
              <EmptyState title="Nothing needs you today" body="No problem crossed the thresholds for your role in the last scan." />
            ) : (
              <ol className="bcards" data-testid="briefing-priorities">
                {top.map((p, i) => <PriorityCard key={p.ref} p={p} rank={i + 1} />)}
              </ol>
            )}
          </section>

          {rest.length > 0 ? (
            <section aria-label="More priorities" className="stack" style={{ gap: "var(--sp-2)" }}>
              <button type="button" className="btn btn--ghost bmore" aria-expanded={more} aria-controls="brief-rest" onClick={() => setMore((v) => !v)}>
                {more ? <IconChevronUp size={16} stroke={1.5} aria-hidden="true" /> : <IconChevronDown size={16} stroke={1.5} aria-hidden="true" />}
                {more ? "Show fewer" : `Show ${fmtNum(rest.length)} more`}
              </button>
              <ol id="brief-rest" className="brows" hidden={!more} start={TOP + 1}>
                {rest.map((p, i) => <CompactRow key={p.ref} p={p} rank={TOP + 1 + i} />)}
              </ol>
            </section>
          ) : null}

          <Details title={`Held back by the alert budget (${fmtNum(data.held_back.length)})`} testId="briefing-held-back">
            {data.held_back.length === 0 ? (
              <p className="caption">Nothing was held back today; every item fit in the budget.</p>
            ) : (
              <ul className="bheld">
                {data.held_back.map((h) => (
                  <li key={h.ref}>
                    <Link className="mono" href={`/app/incidents/${encodeURIComponent(h.ref)}`}>{h.ref}</Link> {h.title}
                    <span className="bheld__why">{h.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Details>

          <Details title="Ask STRATA a question">
            <AskStrata />
          </Details>
        </div>

        <aside className="brief2__side" aria-labelledby="brief-notes">
          <h2 id="brief-notes" className="section-label"><IconNotes size={16} stroke={1.5} aria-hidden="true" /> Notes for you</h2>
          {data.notes_for_you.length === 0 ? (
            <p className="home-quiet">No notes for you.</p>
          ) : (
            <ul className="bnotes">
              {data.notes_for_you.map((n, i) => (
                <li key={n.id ?? i} className="bnotes__item">
                  <span className="bnotes__who">{n.author} <span className="muted">· {personaLabel(n.author_role)}</span></span>
                  <span className="bnotes__body">{n.body}</span>
                  {n.incident_id ? <Link className="bnotes__link mono" href={`/app/incidents/${encodeURIComponent(n.incident_id)}`}>{n.incident_id}</Link> : null}
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/workflows" className="home-seeall">All notes and tasks <IconArrowRight size={16} stroke={1.5} aria-hidden="true" /></Link>
        </aside>
      </div>
    ) }} />
  );
}
