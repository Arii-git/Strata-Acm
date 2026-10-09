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
        compare={`${fmtNum(qa)} routed to QA`}
        meaning="Raised and not yet at Learned."
        implication="Each has an owner role."
        provenance="computed"
        next={{ label: "See the list", href: "/app/problems?view=list" }}
      />
      <Metric
        id="critical_high"
        label="Critical or high"
        value={fmtNum(hot.length)}
        unit={`of ${fmtNum(open.length)}`}
        meaning="Several systems agree something is badly off normal."
        implication={hot.length ? "Open these first." : "Nothing urgent right now."}
        provenance="computed"
        tone={hot.length ? "critical" : "default"}
        next={{ label: "Show them", href: "/app/problems?view=list&minsev=high" }}
      />
      <Metric
        id="opportunities_count"
        label="Opportunities"
        value={fmtNum(opps.length)}
        meaning="Accounts growing in related lines, counted apart from problems."
        implication="A cross-sell visit is the usual first step."
        provenance="computed"
        next={{ label: "Open opportunities", href: "/app/opportunities" }}
      />
    </MetricGroup>
  );
}
