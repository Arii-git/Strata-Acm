"use client";

import Link from "next/link";
import {
  DataTable,
  Details,
  ErrorState,
  Loading,
  Metric,
  MetricGroup,
  PageTemplate,
  ProvenanceBadge,
  StatusPill,
  buttonClass,
  type ColumnDef,
  type StatusTone,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { useApi } from "@/lib/api/client";
import type { Feed } from "@/lib/api/types";
import { fmtAgo, fmtNum, fmtPct, humanize } from "@/lib/format";
import { useViewMode } from "@/lib/viewmode";

interface CatalogLive {
  key: string; label?: string; class: string; source: string; definition: string; adverse: string;
  weight: number; caption: string; regulatory_sensitive: boolean; scope?: string;
}
interface SourcesLive { feeds: Feed[]; catalog: CatalogLive[]; notices: { system: string; message: string }[] }
interface HealthLive { sim_now: string }

const FEED_TONE: Record<string, StatusTone> = { fresh: "ok", ok: "ok", late: "warn", stale: "bad", duplicated: "warn", down: "bad" };
const isFresh = (f: Feed) => f.status === "fresh" || f.status === "ok";

const ORDERS_CONTRACT: { field: string; meaning: string }[] = [
  { field: "account_id", meaning: "B2B channel account identifier" },
  { field: "order_date", meaning: "date the order was placed" },
  { field: "sku", meaning: "product code" },
  { field: "qty_ordered", meaning: "units requested" },
  { field: "qty_filled", meaning: "units shipped" },
  { field: "value", meaning: "order value in INR" },
  { field: "promised_date", meaning: "committed delivery date" },
  { field: "delivered_date", meaning: "actual delivery date (blank if not yet delivered)" },
];

function takeaway(d: SourcesLive): string {
  const bad = d.feeds.filter((f) => !isFresh(f));
  if (bad.length) return `${fmtNum(bad.length)} of ${fmtNum(d.feeds.length)} feeds need attention (${bad.map((f) => `${f.label}: ${f.status}`).join("; ")}); signals that depend on them are paused.`;
  const slowest = [...d.feeds].sort((a, b) => b.lag_multiple - a.lag_multiple)[0];
  return `All ${fmtNum(d.feeds.length)} feeds are fresh; the closest to late is ${slowest.label} at ${fmtNum(slowest.lag_multiple, 2)}× its expected interval.`;
}

export default function SourcesPage() {
  const { mode } = useViewMode();
  const open = mode === "detailed";
  const { data, error, loading, reload } = useApi<SourcesLive>("/sources");
  const { data: health } = useApi<HealthLive>("/health");
  const now = health?.sim_now ?? new Date();

  const cols: ColumnDef<CatalogLive>[] = [
    {
      id: "label", accessorFn: (r) => r.label ?? humanize(r.key), header: "Signal",
      cell: (c) => (
        <span className="row" style={{ flexWrap: "wrap" }}>
          <span>{c.row.original.label ?? humanize(c.row.original.key)}</span>
          {c.row.original.regulatory_sensitive ? <StatusPill status="regulatory" tone="warn" label="Regulatory: QA only" /> : null}
        </span>
      ),
    },
    { id: "class", accessorKey: "class", header: "Class", cell: (c) => humanize(c.row.original.class) },
    { id: "source", accessorKey: "source", header: "Source", meta: { mono: true } },
    { id: "adverse", accessorKey: "adverse", header: "Adverse when", cell: (c) => (c.row.original.adverse === "down" ? "falls" : c.row.original.adverse === "up" ? "rises" : humanize(c.row.original.adverse)) },
    { id: "weight", accessorKey: "weight", header: "Weight", meta: { numeric: true, help: "Weight in the risk score" }, cell: (c) => fmtNum(c.row.original.weight, 2) },
    { id: "definition", accessorKey: "definition", header: "Definition", enableSorting: false, cell: (c) => <span className="caption" style={{ color: "var(--ink-2)" }}>{c.row.original.definition}</span> },
    { id: "caption", accessorKey: "caption", header: "In plain words", enableSorting: false, cell: (c) => <span className="caption">{c.row.original.caption}</span> },
  ];

  const title = "Sources & Signals";
  const question = "Can we trust what we are looking at?";
  if (loading && !data) return <PageTemplate explainKey="sources" title={title} question={question} visual={{ takeaway: "Loading…", node: <Loading rows={6} /> }} />;
  if (error) return <PageTemplate explainKey="sources" title={title} question={question} visual={{ takeaway: "Sources could not be loaded.", node: <ErrorState error={error} onRetry={reload} /> }} />;
  if (!data || data.feeds.length === 0) {
    return <PageTemplate explainKey="sources" title={title} question={question} visual={{ takeaway: "No sources connected.", node: <ArtEmptyState art="data" title="No sources" body="Connected feeds (orders, support, field CRM, stock, roster, receivables, documents) appear here with how fresh each one is." /> }} />;
  }

  const fresh = data.feeds.filter(isFresh).length;
  const notFresh = data.feeds.length - fresh;
  const dupes = data.feeds.filter((f) => f.duplicate_ratio > 0).length;
  const regulated = data.catalog.filter((c) => c.regulatory_sensitive).length;

  return (
    <PageTemplate
      explainKey="sources"
      title={title}
      question={question}
      glance={
        <MetricGroup title="At a glance">
          <Metric
            id="feeds_fresh" label="Feeds on time" value={fmtNum(fresh)} unit={`of ${fmtNum(data.feeds.length)} feeds`}
            compare="arrived within their expected interval"
            meaning="A feed is fresh when its last load is newer than its expected interval."
            implication={notFresh ? "Late or stale feeds pause the signals built on them." : "Signals are computed on current data."}
            provenance="computed" tone={notFresh ? "elevated" : "healthy"}
            next={{ label: "Data-quality problems", href: "/app/problems?cat=data" }}
          />
          <Metric
            id="feeds_with_duplicates" label="Feeds with duplicates" value={fmtNum(dupes)} unit={`of ${fmtNum(data.feeds.length)} feeds`}
            compare="rows repeated in the last load"
            meaning="Share of feeds whose last load repeated rows already seen."
            implication={dupes ? "Duplicated rows inflate counts; STRATA pauses judgement on that feed." : "No duplicated loads; counts are trustworthy."}
            provenance="computed"
            next={{ label: "Data-quality problems", href: "/app/problems?cat=data" }}
          />
          <Metric
            id="signals_catalogued" label="Signals in the catalog" value={fmtNum(data.catalog.length)} unit="signals"
            compare={`${fmtNum(regulated)} regulatory-sensitive (QA only)`}
            meaning="Signals defined in the catalog. Not every catalog signal is computed in this build; see the catalog table."
            implication="Each problem cites computed signals as its evidence."
            provenance="computed"
          />
        </MetricGroup>
      }
      visual={{
        takeaway: takeaway(data),
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            {data.notices.length > 0 ? (
              <div role="alert" className="card" style={{ borderColor: "var(--amber-600)", background: "var(--amber-100)" }}>
                <strong>Data Health Guard</strong>
                <ul style={{ margin: "var(--sp-2) 0 0", paddingLeft: "var(--sp-4)" }}>
                  {data.notices.map((n, i) => <li key={`${n.system}-${i}`}><span className="mono">{n.system}</span>: {n.message}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="feed-grid" aria-label="Connected feeds">
              {data.feeds.map((f) => (
                <div key={f.system} className="feed-tile">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong>{f.label}</strong>
                    <StatusPill status={f.status} tone={FEED_TONE[f.status]} />
                  </div>
                  <div className="caption">Last load {fmtAgo(f.last_ingested_at, now)} · expected every {fmtNum(f.expected_every_minutes)} min</div>
                  <div className="caption">{fmtNum(f.rows_last_run)} rows · {fmtPct(f.duplicate_ratio, { signed: false, digits: 1 })} duplicates · {fmtNum(f.lag_multiple, 2)}× interval</div>
                  <div className="caption">{f.lag_multiple > 1 ? "Late: signals from this source may be stale." : "On schedule: signals from this source are current."}</div>
                </div>
              ))}
            </div>
            <div className="row"><ProvenanceBadge provenance="synthetic" /><span className="caption">Feed timings are synthetic: generated with the dataset, not read from Altygen systems.</span></div>
          </div>
        ),
      }}
      actions={
        <>
          {notFresh ? <Link className={buttonClass("primary")} href="/app/problems?cat=data">Fix stale feeds first</Link> : <Link className={buttonClass("primary")} href="/app/problems">Feeds are fresh: open the problems</Link>}
          <Link className={buttonClass("ghost")} href="/app/help">What each signal means</Link>
        </>
      }
    >
      <Details title="Signal catalog" defaultOpen={open}>
        <DataTable
          columns={cols}
          data={data.catalog}
          provenance="assumption"
          caption="Every signal STRATA computes, its source, which direction is bad, and its weight in the risk score. Weights are design assumptions, not fitted values."
          maxHeight={520}
        />
      </Details>
      <Details title="Connect a source: orders export contract" defaultOpen={open}>
        <p className="caption" style={{ marginTop: 0 }}>
          To connect a real orders or invoicing export, provide one row per order line with these fields. STRATA derives order volume, fill rate and delivery delay from them; no patient data is needed or accepted.
        </p>
        <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
          {ORDERS_CONTRACT.map((f) => <li key={f.field}><span className="mono">{f.field}</span>: {f.meaning}</li>)}
        </ul>
      </Details>
    </PageTemplate>
  );
}
