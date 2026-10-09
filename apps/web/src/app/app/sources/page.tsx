"use client";

import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Loading,
  Metric,
  PageHeader,
  StatusPill,
  type ColumnDef,
  type StatusTone,
} from "@/components/ui";
import { useApi } from "@/lib/api/client";
import type { Feed } from "@/lib/api/types";
import { fmtAgo, fmtNum, fmtPct, humanize } from "@/lib/format";

interface CatalogLive {
  key: string; label?: string; class: string; source: string; definition: string; adverse: string;
  weight: number; caption: string; regulatory_sensitive: boolean; scope?: string;
}
interface SourcesLive { feeds: Feed[]; catalog: CatalogLive[]; notices: { system: string; message: string }[] }
interface HealthLive { sim_now: string }

const FEED_TONE: Record<string, StatusTone> = { fresh: "ok", ok: "ok", late: "warn", stale: "bad", duplicated: "warn", down: "bad" };

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

export default function SourcesPage() {
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

  return (
    <>
      <PageHeader question="Can we trust what we are looking at?" title="Sources & Signals" />
      {loading && !data ? <Loading rows={6} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data ? (
        <EmptyState title="No sources" body="The engine reported no connected sources." />
      ) : (
        <div className="stack">
          {data.notices.length > 0 ? (
            <div role="alert" className="card" style={{ borderColor: "var(--amber-600)", background: "var(--amber-100)" }}>
              <strong>Data Health Guard</strong>
              <ul style={{ margin: "var(--sp-2) 0 0", paddingLeft: "var(--sp-4)" }}>
                {data.notices.map((n, i) => <li key={`${n.system}-${i}`}><span className="mono">{n.system}</span>: {n.message}</li>)}
              </ul>
            </div>
          ) : null}

          <Card title="Connected feeds" provenance="synthetic">
            <div className="grid grid--4">
              {data.feeds.map((f) => (
                <div key={f.system} className="card stack" style={{ gap: "var(--sp-2)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{f.label}</strong>
                    <StatusPill status={f.status} tone={FEED_TONE[f.status]} />
                  </div>
                  <div className="caption">Last ingested {fmtAgo(f.last_ingested_at, now)} · expected every {fmtNum(f.expected_every_minutes)} min</div>
                  <Metric
                    label="Rows last run"
                    value={fmtNum(f.rows_last_run)}
                    provenance="synthetic"
                    meaning={`Duplicate ratio ${fmtPct(f.duplicate_ratio, { signed: false, digits: 1 })}; lag ${fmtNum(f.lag_multiple, 2)}x the expected interval.`}
                    implication={f.lag_multiple > 1 ? "Feed is late: signals from this source may be stale." : "On schedule: signals from this source are current."}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Signal catalog">
            <DataTable
              columns={cols}
              data={data.catalog}
              provenance="assumption"
              caption="Every signal Strata computes, its source, which direction is bad, and its weight in the risk score. Weights are design assumptions, not fitted values."
              maxHeight={520}
            />
          </Card>

          <Card title="Connect a source: orders export contract">
            <p className="caption" style={{ marginTop: 0 }}>
              To connect a real orders or invoicing export, provide one row per order line with these fields. Strata derives order volume, fill rate and delivery delay from them; no patient data is needed or accepted.
            </p>
            <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
              {ORDERS_CONTRACT.map((f) => <li key={f.field}><span className="mono">{f.field}</span>: {f.meaning}</li>)}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
