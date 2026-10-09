"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/ui";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityPill } from "@/components/ui/pills";
import { STAGE_INDEX } from "@config/taxonomy";
import { fmtINR } from "@/lib/format";
import { ageText, ownerText, scopeText, sevRank, stageText, type ProblemRow } from "./model";

const COLUMNS: ColumnDef<ProblemRow>[] = [
  {
    id: "ref", accessorKey: "ref", header: "Problem",
    cell: (c) => (
      <span className="stack" style={{ gap: 0 }}>
        <Link className="mono" href={`/app/incidents/${c.row.original.ref}`} onClick={(e) => e.stopPropagation()}>{c.row.original.ref}</Link>
        <span className="caption problem-table__title">{c.row.original.title}</span>
      </span>
    ),
  },
  { id: "category", accessorFn: (r) => r.category, header: "Category", cell: (c) => <span data-field="category"><CategoryChip category={c.row.original.category} size="sm" /></span> },
  { id: "severity", accessorFn: (r) => sevRank(r.severity), header: "Severity", cell: (c) => <span data-field="severity"><SeverityPill severity={c.row.original.severity} /></span> },
  { id: "stage", accessorFn: (r) => STAGE_INDEX[r.stage] ?? 0, header: "Stage", cell: (c) => <span data-field="stage">{stageText(c.row.original.stage)}</span> },
  { id: "scope", accessorFn: (r) => scopeText(r), header: "Account or scope", cell: (c) => <span data-field="scope">{scopeText(c.row.original)}</span> },
  { id: "owner", accessorFn: (r) => ownerText(r.owner_role), header: "Owner", cell: (c) => <span data-field="owner">{ownerText(c.row.original.owner_role)}</span> },
  { id: "age", accessorKey: "age_days", header: "Open for", meta: { numeric: true }, cell: (c) => <span data-field="age">{ageText(c.row.original.age_days)}</span> },
  {
    id: "exposure", accessorKey: "value_at_stake", header: "₹ exposed",
    meta: { numeric: true, help: "The scope's normal 12-week order value: what is at stake, not a forecast of loss." },
    cell: (c) => <span data-field="exposure">{fmtINR(c.row.original.value_at_stake)} exposed</span>,
  },
];

/** The problem list (List view on /app/problems and the whole of /app/risks). */
export function ProblemTable({ rows, caption, emptyText }: { rows: ProblemRow[]; caption?: string; emptyText?: string }) {
  const router = useRouter();
  return (
    <div data-testid="problem-table">
      <DataTable
        columns={COLUMNS}
        data={rows}
        provenance="computed"
        caption={caption ?? "Sorted by severity, then ₹ exposed. ₹ exposed is the scope's normal 12-week order value: exposure, not a forecast of loss. Click a column to re-sort; open a row for its case file."}
        initialSort={[{ id: "severity", desc: true }, { id: "exposure", desc: true }]}
        onRowClick={(r) => router.push(`/app/incidents/${r.ref}`)}
        emptyText={emptyText ?? "No problems match these filters."}
      />
    </div>
  );
}
