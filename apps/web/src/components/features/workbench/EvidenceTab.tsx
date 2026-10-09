"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, DataTable, EmptyState, ProvenanceBadge, TermHint, type ColumnDef } from "@/components/ui";
import { fmtINR, fmtNum, humanize } from "@/lib/format";
import { fmtEvidenceValue, type BlastRow, type WbEvidence } from "./shared";

/** Every evidence item as a calm card: value vs baseline, source, ID, definition. `highlight` outlines one item. */
export function EvidenceList({ evidence, highlight }: { evidence: WbEvidence[]; highlight: string | null }) {
  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => {
      document.getElementById(`ev-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [highlight]);

  if (!evidence.length) return <EmptyState title="No evidence attached" body="The detector stored no evidence items for this case." />;
  return (
    <div className="stack" style={{ gap: "var(--sp-3)" }}>
      <p className="caption" style={{ margin: 0 }}>Each item has an <TermHint term="evidence_id" label="evidence ID" />; every sentence the agents write cites these IDs.</p>
      <ul className="evidence-list">
        {evidence.map((e) => {
          const v = fmtEvidenceValue(e);
          return (
            <li key={e.id} id={`ev-${e.id}`} className={`evidence-item${highlight === e.id ? " evidence-item--hl" : ""}${e.role === "context" ? " evidence-item--context" : ""}`}>
              <div className="evidence-item__head">
                <strong>{e.label}</strong>
                <span className="chip chip--mono">{e.source}</span>
                <span className="chip">{e.role === "context" ? "context (not scored)" : e.role}</span>
                <span className="evidence-item__prov"><ProvenanceBadge provenance="computed" /></span>
              </div>
              <div className="evidence-item__value">
                <span className="num">{v.headline}</span>
                <span className="muted num">{v.detail}</span>
              </div>
              <p className="caption" style={{ margin: 0 }}>{e.caption}</p>
              <div className="row caption" style={{ gap: "var(--sp-3)", flexWrap: "wrap", maxWidth: "none" }}>
                <span className="mono">{e.id}</span>
                <span>robust z <span className="mono">{fmtNum(e.robust_z, 2)}</span> <TermHint term="robust_z" /></span>
                <span>direction <strong>{e.direction}</strong></span>
                <span>scope {humanize(e.scope)}{e.scope_key ? ` ${e.scope_key}` : ""}</span>
              </div>
              {e.note ? <p className="caption muted" style={{ margin: 0 }}>{e.note}</p> : null}
              {e.definition ? <p className="caption muted mono" style={{ margin: 0 }}>{e.definition}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Other accounts exposed to the same root problem. */
export function BlastRadiusTable({ blast }: { blast: BlastRow[] }) {
  const blastCols = useMemo<ColumnDef<BlastRow>[]>(() => [
    {
      id: "account", header: "Account", accessorKey: "account_name",
      cell: (c) => <Link href={`/app/accounts/${c.row.original.account_id}`} onClick={(ev) => ev.stopPropagation()}>{c.row.original.account_name}</Link>,
    },
    { id: "basis", header: "Basis", accessorKey: "exposure_basis", cell: (c) => `${humanize(c.row.original.exposure_basis)}${c.row.original.sku ? ` (${c.row.original.sku})` : ""}` },
    { id: "exposure_value", header: "Exposure", accessorKey: "exposure_value", meta: { numeric: true }, cell: (c) => fmtINR(c.row.original.exposure_value) },
  ], []);
  if (!blast.length) return <p className="caption" style={{ margin: 0 }}>No other accounts share this cause.</p>;
  return (
    <DataTable
      columns={blastCols}
      data={blast}
      provenance="computed"
      caption="Other accounts exposed to the same root problem, with their baseline 12-week order value. Exposure, not predicted loss."
      initialSort={[{ id: "exposure_value", desc: true }]}
    />
  );
}

/** Legacy composition: evidence list (collapsed) + blast radius. Kept for callers outside the case pipeline. */
export function EvidenceTab({ evidence, blast, highlight }: { evidence: WbEvidence[]; blast: BlastRow[]; highlight: string | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (highlight) setOpen(true); }, [highlight]);
  return (
    <div className="stack">
      <details className="details" open={open} onToggle={(ev) => setOpen((ev.currentTarget as HTMLDetailsElement).open)} data-testid="evidence-list">
        <summary className="details__summary">All {evidence.length} signals</summary>
        <div className="details__body"><EvidenceList evidence={evidence} highlight={highlight} /></div>
      </details>
      <Card title="Other accounts exposed"><BlastRadiusTable blast={blast} /></Card>
    </div>
  );
}
