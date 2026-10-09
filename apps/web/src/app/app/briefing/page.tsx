"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import {
  Button, Caption, Card, CategoryChip, Details, EmptyState, ErrorState, EventRow, EvidenceChip, Loading, Metric, MetricGroup,
  PageTemplate, SeverityPill, TermHint, buttonClass, type EventItem,
} from "@/components/ui";
import { apiPost, qs, useApi } from "@/lib/api/client";
import type { HeldBack, Kind, Note, PersonaKey, Severity } from "@/lib/api/types";
import { fmtINR, fmtNum } from "@/lib/format";
import { personaLabel, usePersona } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";

// Live engine shapes (account_id is numeric/null; ask has `message`; priorities carry category + stage).
interface BriefPriority {
  id: string; ref: string; title: string; kind: Kind; severity: Severity; risk_score: number;
  value_at_stake: number; n_sources: number; sources: string[]; account_id: number | string | null;
  account_name: string; status: string; owner_role: string; regulatory_sensitive: boolean;
  category: string; category_label: string; stage: string; stage_label: string;
}
interface BriefingLive {
  persona: PersonaKey; sim_now: string; greeting: string; role_label: string;
  signals_checked: number; sources_count: number; accounts_count: number;
  need_you: number; opportunities: number; qa_routed: number;
  summary: string; priorities: BriefPriority[]; held_back: HeldBack[]; notes_for_you: Note[];
}
interface AskCard { title: string; body: string; evidence: { id: string; label: string }[]; link: string | null }
interface AskLive { cards: AskCard[]; refused: boolean; message?: string | null }
interface EventsLive { items: EventItem[] }

const Q_CHANGED = "What changed since yesterday?";
const Q_MONEY = "Where are we quietly losing money?";
const BUDGET = 7;

function PriorityList({ items }: { items: BriefPriority[] }) {
  if (items.length === 0) return <EmptyState title="Nothing needs you today" body="No problem crossed the thresholds for your role in the last scan." />;
  return (
    <ol className="brief-list" data-testid="briefing-priorities">
      {items.map((p, i) => (
        <li key={p.ref} className="brief-item">
          <Link href={`/app/incidents/${encodeURIComponent(p.ref)}`} className="brief-item__link">
            <span className="brief-item__rank" aria-hidden="true">{i + 1}</span>
            <span className="brief-item__main">
              <span className="brief-item__tags">
                <CategoryChip category={p.category} size="sm" />
                <SeverityPill severity={p.severity} />
                <span className="brief-item__stage">Stage: {p.stage_label}</span>
                {p.regulatory_sensitive || p.owner_role === "qa_head" ? <span className="brief-item__stage">Routed to QA Head</span> : null}
              </span>
              <span className="brief-item__title">{p.title}</span>
              <span className="brief-item__meta">
                <span className="mono">{p.ref}</span> · owner: {personaLabel(p.owner_role)} · seen in {fmtNum(p.n_sources)} {p.n_sources === 1 ? "system" : "systems"}
              </span>
            </span>
            <span className="brief-item__money">
              <span className="num">{fmtINR(p.value_at_stake)}</span>
              <span className="brief-item__money-label">exposed</span>
            </span>
            <IconArrowRight size={18} stroke={1.5} aria-hidden="true" className="brief-item__go" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function RecentActivity() {
  const { data, error, loading, reload } = useApi<EventsLive>(qs("/events", { limit: 15 }));
  if (loading && !data) return <Loading rows={4} label="Loading recent activity" />;
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load activity" />;
  if (!data || data.items.length === 0) return <EmptyState title="No activity yet" body="Detections, decisions and outcomes will appear here as they happen." />;
  return (
    <>
      <p className="caption">The last {fmtNum(data.items.length)} classified events, oldest first. Each opens the page where it happened.</p>
      <ul className="event-list" data-testid="briefing-events">
        {data.items.map((e) => <EventRow key={e.id} event={e} />)}
      </ul>
    </>
  );
}

export default function BriefingPage() {
  const { persona } = usePersona();
  const { mode } = useViewMode();
  const { data, error, loading, reload } = useApi<BriefingLive>(qs("/briefing", { persona }));
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskLive | null>(null);
  const [askErr, setAskErr] = useState<Error | null>(null);
  const [asking, setAsking] = useState(false);

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

  const common = { explainKey: "briefing", title: "Today's briefing", question: "What needs me today?" };
  if (loading && !data) return <PageTemplate {...common}><Loading rows={6} label="Loading briefing" /></PageTemplate>;
  if (error) return <PageTemplate {...common}><ErrorState error={error} onRetry={reload} /></PageTemplate>;
  if (!data) return <PageTemplate {...common}><EmptyState title="No briefing yet" body="The engine returned no briefing for this role." /></PageTemplate>;

  const shown = data.priorities.slice(0, BUDGET);
  const top = shown.find((p) => p.kind === "risk") ?? shown[0];

  return (
    <PageTemplate
      {...common}
      glance={
        <MetricGroup title="Since the last scan">
          <Metric id="signals_checked" label="Signals checked" value={fmtNum(data.signals_checked)} unit="signals" provenance="computed"
            compare={`across ${fmtNum(data.accounts_count)} accounts and ${fmtNum(data.sources_count)} source systems`}
            meaning="How much STRATA looked at in the latest scan."
            implication="Coverage only; the short list below is what crossed the thresholds."
            next={{ label: "See the sources", href: "/app/sources" }} />
          <Metric id="need_you" label="Need you" value={fmtNum(data.need_you)} unit="items" provenance="computed" tone={data.need_you > 0 ? "elevated" : "default"}
            compare={`against a daily budget of ${BUDGET} per role`}
            meaning="Risk items routed to your role today."
            implication={data.qa_routed > 0 ? `${fmtNum(data.qa_routed)} quality reports go to the QA Head and are not decided here.` : "Open the top item first."}
            next={{ label: "Open the Problems board", href: "/app/problems" }} />
          <Metric id="opportunities_count" label="Opportunities" value={fmtNum(data.opportunities)} unit="items" provenance="computed"
            compare="growth with a product gap, found in the same scan"
            meaning="Positive changes worth a sales conversation."
            implication="Revenue not yet acted on."
            next={{ label: "Open Opportunities", href: "/app/opportunities" }} />
        </MetricGroup>
      }
      visual={{
        takeaway: `${data.greeting}, ${data.role_label}. ${data.summary}`,
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <h2 className="section-label">Today&apos;s priorities</h2>
            <PriorityList items={shown} />
            <p className="caption">
              Ranked by exposure × confidence × urgency, at most {BUDGET} per role (<TermHint term="alert_budget" label="Alert Budget" />).
              &quot;Exposed&quot; is the normal 12-week order value of the affected customers: money at risk, not a predicted loss <TermHint term="exposure" />.
            </p>
          </div>
        ),
      }}
      actions={
        <>
          {top ? <Link href={`/app/incidents/${encodeURIComponent(top.ref)}`} className={buttonClass("primary")}>Open the top case ({top.ref})</Link> : null}
          <Button onClick={() => void ask(Q_CHANGED)}>{Q_CHANGED}</Button>
          <Button onClick={() => void ask(Q_MONEY)}>{Q_MONEY}</Button>
        </>
      }
    >
      <Card title="Ask STRATA" provenance="computed">
        <form className="row" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
          <input
            aria-label="Ask STRATA a question"
            className="brief-ask__input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. top incident, losing money, what changed, opportunities"
          />
          <Button type="submit" variant="primary" disabled={asking || !question.trim()}>Ask</Button>
        </form>
        <Caption meaning="Answers are built only from evidence the engine holds; each card cites its evidence IDs." implication="If nothing matches, STRATA says so instead of guessing." />
        <div className="stack" style={{ marginTop: "var(--sp-3)", gap: "var(--sp-3)" }} aria-live="polite">
          {asking ? <Loading rows={3} label="Answering" /> : askErr ? <ErrorState error={askErr} onRetry={() => asked && void ask(asked)} title="Could not answer" /> : answer ? (
            answer.refused || answer.cards.length === 0 ? (
              <EmptyState title="No evidence-backed answer" body={answer.message ?? "STRATA answers only from evidence it holds."} />
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

      <Details title={`Held back today: ${fmtNum(shown.length)} shown, ${fmtNum(data.held_back.length)} held back (see why)`} testId="briefing-held-back" defaultOpen={mode === "detailed"}>
        {data.held_back.length === 0 ? (
          <p className="caption">Nothing was held back today; every item fit in the budget.</p>
        ) : (
          <ul className="plain-list">
            {data.held_back.map((h) => (
              <li key={h.ref}><Link className="mono" href={`/app/incidents/${encodeURIComponent(h.ref)}`}>{h.ref}</Link> {h.title}: {h.reason}</li>
            ))}
          </ul>
        )}
      </Details>

      {data.notes_for_you.length > 0 ? (
        <Details title={`Notes for you (${fmtNum(data.notes_for_you.length)})`} defaultOpen>
          <ul className="plain-list">
            {data.notes_for_you.map((n, i) => (
              <li key={n.id ?? i}><strong>{n.author}</strong> <span className="muted">({personaLabel(n.author_role)})</span>: {n.body}</li>
            ))}
          </ul>
        </Details>
      ) : null}

      <Details title="Recent activity" testId="briefing-activity" defaultOpen={mode === "detailed"}>
        <RecentActivity />
      </Details>
    </PageTemplate>
  );
}
