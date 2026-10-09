"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES, STAGES } from "@config/taxonomy";
import { TERMS } from "@config/terms";
import { ErrorState, Loading, PageTemplate, ProvenanceBadge } from "@/components/ui";
import { useApi } from "@/lib/api/client";
import type { Provenance } from "@/lib/api/types";

/** One row of config/metrics.yaml as served by GET /metrics/dictionary. */
interface MetricDef {
  id: string;
  name: string;
  unit: string;
  formula: string;
  good_direction: "up" | "down" | "neither";
  compare: string;
  implies: string;
  action: string;
  provenance: Provenance;
  term?: string;
  group?: string;
  status?: string;
}

interface Entry {
  anchor: string;
  section: string;
  name: string;
  haystack: string;
  node: React.ReactNode;
}

const DIRECTION: Record<MetricDef["good_direction"], string> = {
  up: "Higher is better",
  down: "Lower is better",
  neither: "Neither: context decides",
};

const SECTION_INTRO: Record<string, string> = {
  Signals: "The warning signals STRATA computes from each source system. Each compares an account (or product, batch or region) with its own normal.",
  Detection: "Numbers on a case file: how strong the pattern is, how much is at stake, and how sure the cause is.",
  Briefing: "Numbers on today's briefing.",
  "Business health": "The Business Health Index and its five parts, each 0–100.",
  "Problems and approvals": "Workload numbers on the Problems, Approvals and Workflows pages.",
  "Time-to-action": "How fast a detection turns into an approved plan in this prototype.",
  Evaluation: "How well STRATA finds the problems planted in the synthetic data.",
  Outcomes: "What happened after a plan (in the Lab: scripted, illustrative).",
  "Memory and audit": "Organizational Memory, the audit trail and data feeds.",
  Terms: "Technical words used across STRATA, in plain language.",
  "Problem categories": "Every problem belongs to exactly one category, with a usual owner and first action.",
  "Workflow stages": "Every case moves through these stages in order.",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function MetricEntry({ m }: { m: MetricDef }) {
  return (
    <>
      <div className="help-entry__head">
        <h3 className="help-entry__name">{m.name}</h3>
        <ProvenanceBadge provenance={m.provenance} />
      </div>
      <p className="help-entry__text">{m.implies}</p>
      <p className="help-entry__text"><span className="help-dir">What to do:</span> {m.action}</p>
      {/* progressive disclosure: the working-out is one click away */}
      <details className="help-more">
        <summary>How it is worked out</summary>
        <dl className="help-entry__dl">
          <dt>Formula</dt><dd>{m.formula}</dd>
          <dt>Good direction</dt><dd>{DIRECTION[m.good_direction] ?? m.good_direction}</dd>
          <dt>Compared with</dt><dd>{m.compare}</dd>
          <dt>Unit</dt><dd>{m.unit}</dd>
        </dl>
        <span className="help-entry__id">{m.id}</span>
      </details>
      {m.status ? <p className="help-entry__note">{m.status}</p> : null}
      {m.term && TERMS[m.term] ? <a href={`#term-${m.term}`} className="help-entry__note">Related term: {TERMS[m.term].term}</a> : null}
    </>
  );
}

export default function HelpPage() {
  const { data, error, loading, reload } = useApi<{ items: MetricDef[] }>("/metrics/dictionary");
  const [q, setQ] = useState("");
  const inputId = useId();
  const countId = useId();

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    for (const m of data?.items ?? []) {
      out.push({
        anchor: `metric-${m.id}`, section: m.group ?? "Other metrics", name: m.name,
        haystack: [m.id, m.name, m.unit, m.formula, m.compare, m.implies, m.action, m.provenance, m.group ?? ""].join(" ").toLowerCase(),
        node: <MetricEntry m={m} />,
      });
    }
    for (const [key, t] of Object.entries(TERMS)) {
      out.push({
        anchor: `term-${key}`, section: "Terms", name: t.term, haystack: `${key} ${t.term} ${t.text}`.toLowerCase(),
        node: (
          <>
            <div className="help-entry__head"><h3 className="help-entry__name">{t.term}</h3></div>
            <span className="help-entry__id">term · {key}</span>
            <p className="help-entry__text">{t.text}</p>
          </>
        ),
      });
    }
    for (const c of CATEGORIES) {
      out.push({
        anchor: `category-${c.key}`, section: "Problem categories", name: c.label,
        haystack: `${c.key} ${c.label} ${c.meaning} ${c.owner} ${c.firstAction}`.toLowerCase(),
        node: (
          <>
            <div className="help-entry__head"><h3 className="help-entry__name">{c.label}</h3></div>
            <span className="help-entry__id">category · {c.key}{c.routeOnly ? " · route-only" : ""}</span>
            <dl className="help-entry__dl">
              <dt>What belongs here</dt><dd>{c.meaning}</dd>
              <dt>Usual owner</dt><dd>{c.owner}</dd>
              <dt>First action</dt><dd>{c.firstAction}</dd>
            </dl>
          </>
        ),
      });
    }
    STAGES.forEach((s, i) => {
      out.push({
        anchor: `stage-${s.key}`, section: "Workflow stages", name: s.label,
        haystack: `${s.key} ${s.label} ${s.meaning} ${s.next}`.toLowerCase(),
        node: (
          <>
            <div className="help-entry__head"><h3 className="help-entry__name">{i + 1}. {s.label}</h3></div>
            <span className="help-entry__id">stage · {s.key}</span>
            <dl className="help-entry__dl">
              <dt>What it means</dt><dd>{s.meaning}</dd>
              <dt>What happens next</dt><dd>{s.next}</dd>
            </dl>
          </>
        ),
      });
    });
    return out;
  }, [data]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? entries.filter((e) => needle.split(/\s+/).every((w) => e.haystack.includes(w))) : entries;
  const sections = useMemo(() => {
    const order: string[] = [];
    for (const e of entries) if (!order.includes(e.section)) order.push(e.section);
    return order;
  }, [entries]);

  // Deep links (#metric-risk_score) work once the dictionary has loaded.
  useEffect(() => {
    if (!data || typeof window === "undefined" || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) el.scrollIntoView({ block: "start" });
  }, [data]);

  const nMetrics = data?.items.length ?? 0;
  const nTerms = Object.keys(TERMS).length;
  const takeaway = data
    ? `${entries.length} entries: ${nMetrics} metrics and signals, ${nTerms} terms, ${CATEGORIES.length} problem categories and ${STAGES.length} workflow stages.`
    : "Loading the metric dictionary.";

  return (
    <PageTemplate
      explainKey="help"
      title="Help and glossary"
      question="What does this number or word mean, and what should I do about it?"
      visual={{
        takeaway,
        node: (
          <div className="stack">
            <div className="help-search" role="search">
              <label htmlFor={inputId}>Search the glossary</label>
              <input
                id={inputId}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. risk score, fill rate, baseline"
                aria-describedby={countId}
                data-testid="glossary-search"
                autoComplete="off"
              />
              <span id={countId} className="help-count" aria-live="polite" data-testid="glossary-count">
                {needle ? `${shown.length} of ${entries.length} entries match "${q.trim()}"` : `${entries.length} entries`}
              </span>
            </div>
            <nav aria-label="Glossary sections">
              <ul className="help-toc">
                {sections.map((s) => <li key={s}><a href={`#section-${slug(s)}`}>{s}</a></li>)}
              </ul>
            </nav>
          </div>
        ),
      }}
      actions={
        <>
          <Link href="/app/help/decides" className="btn btn--primary">How STRATA decides</Link>
          <Link href="/app/help/diagrams" className="btn btn--secondary">Diagram gallery</Link>
        </>
      }
    >
      {loading && !data ? <Loading rows={6} label="Loading the metric dictionary" /> : null}
      {error ? <ErrorState error={error} onRetry={reload} title="Could not load the metric dictionary" /> : null}
      <div className="stack" data-testid="glossary">
        {sections.map((s) => {
          const list = shown.filter((e) => e.section === s);
          if (!list.length) return null;
          return (
            <section key={s} className="help-group" id={`section-${slug(s)}`} aria-labelledby={`h-${slug(s)}`}>
              <h2 id={`h-${slug(s)}`}>{s}</h2>
              {SECTION_INTRO[s] ? <p className="caption">{SECTION_INTRO[s]}</p> : null}
              <ul className="help-list">
                {list.map((e) => (
                  <li key={e.anchor} id={e.anchor} className="help-entry" data-testid="glossary-entry">{e.node}</li>
                ))}
              </ul>
            </section>
          );
        })}
        {needle && shown.length === 0 ? <p className="caption" role="status">Nothing matches &quot;{q.trim()}&quot;. Try a shorter word.</p> : null}
      </div>
    </PageTemplate>
  );
}
