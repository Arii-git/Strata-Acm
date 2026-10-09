"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, DataTable, EmptyState, ProvenanceBadge, TermHint, type ColumnDef } from "@/components/ui";
import { fmtINR, fmtNum, humanize } from "@/lib/format";
import { fmtEvidenceValue, type BlastRow, type WbEvidence } from "./shared";

export function EvidenceTab({ evidence, blast, highlight }: { evidence: WbEvidence[]; blast: BlastRow[]; highlight: string | null }) {
  // The list is collapsed by default (it is long); an evidence chip elsewhere opens it and scrolls to the item.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!highlight) return;
    setOpen(true);
    const t = window.setTimeout(() => {
      document.getElementById(`ev-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const blastCols = useMemo<ColumnDef<BlastRow>[]>(() => [
    {
      id: "account", header: "Account", accessorKey: "account_name",
      cell: (c) => <Link href={`/app/accounts/${c.row.original.account_id}`} onClick={(ev) => ev.stopPropagation()}>{c.row.original.account_name}</Link>,
    },
    { id: "basis", header: "Basis", accessorKey: "exposure_basis", cell: (c) => `${humanize(c.row.original.exposure_basis)}${c.row.original.sku ? ` (${c.row.original.sku})` : ""}` },
    { id: "exposure_value", header: "Exposure", accessorKey: "exposure_value", meta: { numeric: true }, cell: (c) => fmtINR(c.row.original.exposure_value) },
  ], []);

  if (!evidence.length) return <EmptyState title="No evidence attached" body="The detector stored no evidence items for this incident." />;

  return (
    <div className="stack">
      <details className="details" open={open} onToggle={(ev) => setOpen((ev.currentTarget as HTMLDetailsElement).open)} data-testid="evidence-list">
        <summary className="details__summary">Evidence list: all {evidence.length} signals with values, definitions and IDs</summary>
        <div className="details__body">
      <p className="caption" style={{ margin: 0 }}>Each item has an <TermHint term="evidence_id" label="evidence ID" />; sentences on the Why tab cite these IDs.</p>
      {evidence.map((e) => {
        const v = fmtEvidenceValue(e);
        const hl = highlight === e.id;
        return (
          <section
            key={e.id}
            id={`ev-${e.id}`}
            className="card"
            style={{
              borderColor: hl ? "var(--indigo-600)" : undefined,
              boxShadow: hl ? "var(--focus-ring)" : undefined,
              opacity: e.role === "context" ? 0.92 : 1,
            }}
          >
            <div>
              <div className="stack" style={{ gap: "var(--sp-2)" }}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <strong>{e.label}</strong>
                    <span className="chip chip--mono">{e.source}</span>
                    <span className="chip">{e.role === "context" ? "context (not scored)" : e.role}</span>
                  </div>
                  <ProvenanceBadge provenance="computed" />
                </div>
                <div className="mono caption">{e.id}</div>
                <div className="row" style={{ alignItems: "baseline", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                  <span className="num" style={{ fontSize: "var(--fs-20)", fontWeight: 600 }}>{v.headline}</span>
                  <span className="muted num">{v.detail}</span>
                </div>
                <div className="row caption" style={{ gap: "var(--sp-3)", flexWrap: "wrap" }}>
                  <span>robust z <span className="mono">{fmtNum(e.robust_z, 2)}</span> <TermHint term="robust_z" /></span>
                  <span>direction <strong>{e.direction}</strong></span>
                  <span>scope {humanize(e.scope)}{e.scope_key ? ` ${e.scope_key}` : ""}</span>
                </div>
                <p className="caption" style={{ margin: 0 }}>{e.caption}</p>
                {e.note ? <p className="caption muted" style={{ margin: 0 }}>{e.note}</p> : null}
                {e.definition ? <p className="caption muted mono" style={{ margin: 0 }}>{e.definition}</p> : null}
              </div>
            </div>
          </section>
        );
      })}
        </div>
      </details>
      <Card title="Blast radius: other accounts exposed">
        {blast.length ? (
          <DataTable
            columns={blastCols}
            data={blast}
            provenance="computed"
            caption="What it is: other accounts exposed to the same root problem (for example the same SKU shortage), with their baseline 12-week order value. What it implies: exposure, not predicted loss; these accounts may need the same action before they complain."
            initialSort={[{ id: "exposure_value", desc: true }]}
          />
        ) : <EmptyState title="No other accounts exposed" body="The engine found no shared-cause exposure beyond this scope." />}
      </Card>
    </div>
  );
}
