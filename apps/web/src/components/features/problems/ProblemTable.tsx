"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "@/components/ui";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityPill } from "@/components/ui/pills";
import { RiskLevelBadge } from "@/components/features/agentic";
import { caseHref } from "@/components/features/workbench/pipeline";
import { STAGE_INDEX } from "@config/taxonomy";
import { fmtINR } from "@/lib/format";
import { toRiskLevel, type LevelItem } from "./levels";
import { ageText, ownerText, reasonText, scopeText, sevRank, stageText, type ProblemRow } from "./model";

/**
 * The problem list (List view on /app/problems, /app/incidents and /app/risks). Six calm columns:
 * problem (title, ref · scope, one line of why), category, urgency (level + severity), stage, owner (+ age), ₹ exposed.
 * Every row keeps the seven data-field markers. A row opens the case at the step where it sits.
 */
export function ProblemTable({
  rows, caption, emptyText, levels,
}: { rows: ProblemRow[]; caption?: string; emptyText?: string; levels?: Map<string, LevelItem> | null }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<ProblemRow>[]>(() => [
    {
      id: "ref", accessorKey: "title", header: "Problem", meta: { mono: false },
      cell: (c) => {
        const r = c.row.original;
        const lv = levels?.get(r.ref);
        return (
          <span className="problem-table__cell">
            <Link className="problem-table__title" href={caseHref(r.ref, r.stage)} onClick={(e) => e.stopPropagation()}>{r.title}</Link>
            <span className="problem-table__sub"><span className="mono">{r.ref}</span> · <span data-field="scope">{scopeText(r)}</span></span>
            <span className="problem-table__why">{lv?.reasons?.[0] || reasonText(r)}</span>
          </span>
        );
      },
    },
    { id: "category", accessorFn: (r) => r.category, header: "Category", cell: (c) => <span data-field="category"><CategoryChip category={c.row.original.category} size="sm" /></span> },
    {
      id: "severity", header: levels ? "Level" : "Severity",
      accessorFn: (r) => (levels?.get(r.ref)?.level ?? 0) * 10 + sevRank(r.severity),
      meta: { help: levels ? "Risk level 1–5 from the agentic policy, then severity from the detector." : "Detector severity: how many systems agree and how far off normal." },
      cell: (c) => {
        const lv = levels?.get(c.row.original.ref);
        return (
          <span className="problem-table__urgency">
            {lv ? <RiskLevelBadge level={toRiskLevel(lv.level)} compact /> : null}
            <span data-field="severity"><SeverityPill severity={c.row.original.severity} /></span>
          </span>
        );
      },
    },
    { id: "stage", accessorFn: (r) => STAGE_INDEX[r.stage] ?? 0, header: "Stage", cell: (c) => <span data-field="stage">{stageText(c.row.original.stage)}</span> },
    {
      id: "owner", accessorFn: (r) => ownerText(r.owner_role), header: "Owner",
      cell: (c) => (
        <span className="problem-table__cell">
          <span data-field="owner">{ownerText(c.row.original.owner_role)}</span>
          <span className="problem-table__sub">open <span data-field="age">{ageText(c.row.original.age_days)}</span></span>
        </span>
      ),
    },
    {
      id: "exposure", accessorKey: "value_at_stake", header: "₹ exposed",
      meta: { numeric: true, help: "The scope's normal 12-week order value: what is at stake, not a forecast of loss." },
      cell: (c) => <span data-field="exposure"><span className="num">{fmtINR(c.row.original.value_at_stake)}</span> <span className="sr-only">exposed</span></span>,
    },
  ], [levels]);

  return (
    <div data-testid="problem-table" className="problem-table">
      <DataTable
        columns={columns}
        data={rows}
        provenance="computed"
        caption={caption ?? "Most urgent first. ₹ exposed is the scope's normal 12-week order value: exposure, not a forecast of loss. Open a row for its case."}
        initialSort={[{ id: "severity", desc: true }, { id: "exposure", desc: true }]}
        onRowClick={(r) => router.push(caseHref(r.ref, r.stage))}
        emptyText={emptyText ?? "No problems match these filters."}
      />
    </div>
  );
}
