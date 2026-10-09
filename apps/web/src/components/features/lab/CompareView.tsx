"use client";

import { IconChevronLeft } from "@tabler/icons-react";
import { Button, DataTable, ErrorState, Metric, MetricGroup, type ColumnDef } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import { useApi } from "@/lib/api/client";
import { fmtNum } from "@/lib/format";
import { fmtWeeks } from "./meta";
import type { CompareRow, SimCompare } from "./types";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const days = (v: number) => `${fmtNum(Math.round(v * 10) / 10)} d`;

const COLUMNS: ColumnDef<CompareRow, unknown>[] = [
  { accessorKey: "industry_label", header: "Business type" },
  { accessorKey: "title", header: "Scenario" },
  { id: "detect", header: "Spotted after (with / without)", meta: { numeric: true },
    accessorFn: (r) => r.detect_days_with, cell: ({ row: { original: r } }) => `${days(r.detect_days_with)} / ${days(r.detect_days_without)}` },
  { id: "recover", header: "Recovered in (with / without)", meta: { numeric: true },
    accessorFn: (r) => r.weeks_to_recover_with ?? 999,
    cell: ({ row: { original: r } }) => `${fmtWeeks(r.weeks_to_recover_with, r.horizon_weeks)} / ${fmtWeeks(r.weeks_to_recover_without, r.horizon_weeks)}` },
  { id: "peak", header: "Worst dip (with / without)", meta: { numeric: true },
    accessorFn: (r) => r.peak_impact_with, cell: ({ row: { original: r } }) => `${fmtNum(r.peak_impact_with)}% / ${fmtNum(r.peak_impact_without)}%` },
];

/** One issue type across every business type: how much sooner it is spotted and how much faster it recovers. */
export function CompareView({ category, onBack, onOpen }: { category: string; onBack: () => void; onOpen: (scenarioId: string) => void }) {
  const q = useApi<SimCompare>(`/sim/compare?category=${encodeURIComponent(category)}`);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <div className="lab-loading"><StrataLoader size="lg" label="Comparing business types" /></div>;
  const rows = q.data.rows;
  const sooner = avg(rows.map((r) => r.detect_days_without - r.detect_days_with));
  const dipCut = avg(rows.map((r) => r.peak_impact_without - r.peak_impact_with));

  return (
    <div className="stack lab-compare">
      <div className="row lab-compare__head">
        <Button variant="ghost" size="sm" onClick={onBack}><IconChevronLeft size={16} aria-hidden="true" /> All scenarios</Button>
        <h2 className="lab-compare__title">{q.data.category_label} across {rows.length} business types</h2>
      </div>
      <MetricGroup title="Across business types">
        <Metric label="Business types" value={fmtNum(rows.length)} unit="compared"
          meaning="How many business types have a scenario of this kind." implication="Pick a row to watch that one play out."
          provenance="illustrative" />
        <Metric label="Spotted sooner" value={fmtNum(Math.round(sooner * 10) / 10)} unit="days on average"
          meaning="Average head start from catching the early signal instead of hearing about it late."
          implication="An earlier start is what makes the rest of the recovery shorter." provenance="illustrative" />
        <Metric label="Smaller worst dip" value={fmtNum(Math.round(dipCut * 10) / 10)} unit="points on average"
          meaning="How much smaller the worst drop in the main number is when someone acts early."
          implication="Scripted what-if, not a measured result." provenance="illustrative" />
      </MetricGroup>
      <DataTable columns={COLUMNS} data={rows} provenance="illustrative" caption={q.data.caption}
        onRowClick={(r) => onOpen(r.scenario_id)} initialSort={[{ id: "detect", desc: false }]} />
    </div>
  );
}
