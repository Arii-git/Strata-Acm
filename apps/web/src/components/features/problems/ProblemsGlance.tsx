import { Metric } from "@/components/ui/Metric";
import { MetricGroup } from "@/components/ui/PageTemplate";
import { fmtNum } from "@/lib/format";
import type { ProblemRow } from "./model";

/** "Right now": open problems, critical/high, opportunities. All counted from /incidents. */
export function ProblemsGlance({ rows }: { rows: ProblemRow[] }) {
  const open = rows.filter((r) => r.kind !== "opportunity" && r.stage !== "learned");
  const hot = open.filter((r) => r.severity === "critical" || r.severity === "high");
  const opps = rows.filter((r) => r.kind === "opportunity" && r.stage !== "learned");
  const qa = open.filter((r) => r.category === "quality").length;
  return (
    <MetricGroup title="Right now">
      <Metric
        id="open_problems"
        label="Open problems"
        value={fmtNum(open.length)}
        unit={open.length === 1 ? "problem" : "problems"}
        compare={`across all roles; ${fmtNum(qa)} routed to QA`}
        meaning="Risks STRATA raised that have not yet reached the Learned stage."
        implication="Each one has an owner role; the board shows where it is stuck."
        provenance="computed"
        next={{ label: "See the list", href: "/app/problems?view=list" }}
      />
      <Metric
        id="critical_high"
        label="Critical or high"
        value={fmtNum(hot.length)}
        unit={`of ${fmtNum(open.length)}`}
        compare="open problems at the top two severity levels"
        meaning="Problems where several source systems agree something is badly off its normal."
        implication={hot.length ? "Open these first; they carry the most ₹ exposed." : "Nothing urgent; work the watch-level items when you can."}
        provenance="computed"
        tone={hot.length ? "critical" : "default"}
        next={{ label: "Show them", href: "/app/problems?view=list&minsev=high" }}
      />
      <Metric
        id="opportunities_count"
        label="Opportunities"
        value={fmtNum(opps.length)}
        unit={opps.length === 1 ? "opportunity" : "opportunities"}
        compare="positive changes, counted apart from problems"
        meaning="Accounts growing in related lines that do not buy a complementary line."
        implication="A cross-sell visit is the usual first step."
        provenance="computed"
        next={{ label: "Open opportunities", href: "/app/opportunities" }}
      />
    </MetricGroup>
  );
}
