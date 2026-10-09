"use client";

import { useEffect, useMemo, useState } from "react";
import type { ListResponse, MemorySearchResponse } from "@/lib/api/types";
import { qs, useApi } from "@/lib/api/client";
import { Card, DataTable, Drawer, EmptyState, ErrorState, Loading, Metric, PageHeader, StatusPill, type ColumnDef } from "@/components/ui";
import { fmtNum, humanize } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { DRAFT_AUTHOR, MEMORY_NOTE, inputStyle, labelStyle, type WbMemoryItem } from "@/components/features/workbench/shared";
import { AuthorCell } from "@/components/features/workbench/MemoryTab";

const KINDS = ["all", "incident", "sop", "outcome", "resolution"] as const;
type Row = WbMemoryItem & { score?: number };

export default function MemoryPage() {
  const { data, error, loading, reload } = useApi<ListResponse<WbMemoryItem>>("/memory/items");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const search = useApi<MemorySearchResponse>(debounced ? qs("/memory/search", { q: debounced }) : null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const rows: Row[] = useMemo(() => {
    let base: Row[] = items;
    if (debounced && search.data) {
      const byRef = new Map(items.map((i) => [i.ref, i]));
      base = search.data.items.flatMap((h) => {
        const it = byRef.get(h.ref);
        return it ? [{ ...it, score: h.score }] : [];
      });
    }
    return kind === "all" ? base : base.filter((i) => i.kind === kind);
  }, [items, kind, debounced, search.data]);

  const drafts = items.filter((i) => i.authored_by === DRAFT_AUTHOR).length;
  const system = items.filter((i) => i.authored_by === "strata-system").length;

  const cols = useMemo<ColumnDef<Row>[]>(() => {
    const c: ColumnDef<Row>[] = [
      { id: "ref", header: "Ref", accessorKey: "ref" },
      { id: "kind", header: "Kind", accessorKey: "kind", cell: (x) => humanize(x.row.original.kind) },
      { id: "title", header: "Title", accessorKey: "title" },
      { id: "cause", header: "Cause", accessorKey: "cause", cell: (x) => (x.row.original.cause ? humanize(x.row.original.cause) : <span className="muted">-</span>) },
      { id: "outcome", header: "Outcome", accessorKey: "outcome", cell: (x) => (x.row.original.outcome ? humanize(x.row.original.outcome) : <span className="muted">-</span>) },
      { id: "authored_by", header: "Authored by", accessorKey: "authored_by", cell: (x) => <AuthorCell author={x.row.original.authored_by} /> },
      { id: "used_count", header: "Used", accessorKey: "used_count", meta: { numeric: true, help: "Times retrieved into an investigation" } },
    ];
    if (debounced) c.splice(1, 0, { id: "score", header: "Match", accessorKey: "score", meta: { numeric: true }, cell: (x) => x.row.original.score?.toFixed(3) ?? "-" });
    return c;
  }, [debounced]);

  return (
    <div className="stack">
      <PageHeader question="What have we learned and what is missing?" title="Organizational Memory" />
      <div role="note" className="card" style={{ borderColor: "var(--amber-600)", background: "var(--amber-100)" }}>
        <strong>Seed memory is a draft.</strong>
        <p className="caption" style={{ margin: "var(--sp-1) 0 0" }}>{MEMORY_NOTE}</p>
      </div>
      {loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState title="Memory is empty" body="No incidents, SOPs or outcomes have been loaded or learned yet." />
      ) : (
        <>
          <div className="grid grid--3">
            <Metric label="Memory items" value={fmtNum(items.length)} meaning="Past incidents, SOPs, outcomes and resolutions the agents can retrieve." implication="More, better-written items give the Memory agent better precedents." provenance="computed" />
            <Metric label="Still DRAFT" value={fmtNum(drafts)} tone={drafts ? "elevated" : "default"} meaning={`Items authored "${DRAFT_AUTHOR}" (counted from this list).`} implication="These need a team rewrite before anyone relies on them." provenance="computed" />
            <Metric label="Learned by Strata" value={fmtNum(system)} meaning="Items written by the learning loop after an outcome was recorded." implication="Grows as approved plans produce outcomes in the Lab." provenance="computed" />
          </div>
          <Card>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)", alignItems: "flex-end", marginBottom: "var(--sp-3)" }}>
              <label style={{ ...labelStyle, flex: "1 1 260px" }}>
                Search memory ({search.data?.retrieval ?? "tfidf"} retrieval)
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. supplier delay stockist" style={inputStyle} />
              </label>
              <div className="row" role="group" aria-label="Filter by kind" style={{ flexWrap: "wrap" }}>
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="chip"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    style={{ cursor: "pointer", borderColor: kind === k ? "var(--indigo-600)" : undefined, background: kind === k ? "var(--indigo-50)" : undefined }}
                  >
                    {k === "all" ? "All" : humanize(k)}
                  </button>
                ))}
              </div>
            </div>
            {search.error ? <ErrorState error={search.error} title="Search failed" /> : search.loading && debounced ? <Loading rows={4} label="Searching" /> : (
              <DataTable
                columns={cols}
                data={rows}
                provenance="synthetic"
                caption="What it is: the organization's memory of past incidents, SOPs and outcomes, which the Memory agent retrieves during investigations. What it implies: high 'Used' items shape plans most, so DRAFT items there should be reviewed first; open a row for its body and steps."
                onRowClick={(r) => setOpen(r)}
                initialSort={debounced ? [{ id: "score", desc: true }] : [{ id: "used_count", desc: true }]}
                emptyText={debounced ? "No memory items match this search." : "No items of this kind."}
              />
            )}
          </Card>
        </>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `${open.ref} · ${open.title}` : ""}>
        {open ? (
          <div className="stack">
            <div className="row" style={{ flexWrap: "wrap" }}>
              <span className="chip">{humanize(open.kind)}</span>
              <AuthorCell author={open.authored_by} />
              {open.outcome ? <StatusPill status={open.outcome} label={humanize(open.outcome)} /> : null}
              {open.date ? <span className="mono caption">{open.date}</span> : null}
            </div>
            {open.cause ? <div className="caption">Cause: <strong>{humanize(open.cause)}</strong>{open.account_type ? ` · account type ${humanize(open.account_type)}` : ""}</div> : null}
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{open.body}</p>
            {open.resolution ? <div><strong>Resolution</strong><p style={{ margin: "var(--sp-1) 0 0" }}>{open.resolution}</p></div> : null}
            {open.steps?.length ? (
              <div>
                <strong>Steps</strong>
                <ol style={{ margin: "var(--sp-1) 0 0", paddingLeft: "var(--sp-5)" }}>
                  {open.steps.map((s, i) => typeof s === "string" ? <li key={i}>{s}</li> : (
                    <li key={i}>{s.action}{s.owner_role ? <span className="caption"> ({personaLabel(s.owner_role)})</span> : null}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {open.signals?.length ? (
              <div>
                <strong>Signals</strong>
                <div className="row" style={{ flexWrap: "wrap", marginTop: "var(--sp-1)" }}>{open.signals.map((s) => <span key={s} className="chip chip--mono">{s}</span>)}</div>
              </div>
            ) : null}
            <p className="caption muted" style={{ margin: 0 }}>Retrieved {fmtNum(open.used_count)} times into investigations.</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
