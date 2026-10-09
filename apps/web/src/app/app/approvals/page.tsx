"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Approval, ListResponse } from "@/lib/api/types";
import { qs, useApi } from "@/lib/api/client";
import {
  CategoryChip, EmptyState, ErrorState, Loading, Metric, MetricGroup, PageTemplate, SeverityPill, TermHint, buttonClass,
} from "@/components/ui";
import { fmtINR, fmtNum } from "@/lib/format";
import { personaLabel, usePersona } from "@/lib/persona";
import type { WbIncidentSummary } from "@/components/features/workbench/shared";

export default function ApprovalsPage() {
  const { persona, label } = usePersona();
  const { data, error, loading, reload } = useApi<ListResponse<Approval>>(qs("/approvals", { persona }));
  const cases = useApi<ListResponse<WbIncidentSummary>>("/incidents");
  const items = useMemo(() => [...(data?.items ?? [])].sort((a, b) => (b.waiting_hours || 0) - (a.waiting_hours || 0)), [data]);
  const byRef = useMemo(() => Object.fromEntries((cases.data?.items ?? []).map((c) => [c.ref, c])), [cases.data]);

  const maxWait = items.reduce((m, a) => Math.max(m, a.waiting_hours || 0), 0);
  const critical = items.filter((a) => a.severity === "critical").length;

  const glance = items.length ? (
    <MetricGroup title="Waiting for a decision">
      <Metric
        id="approvals_waiting" label="Plans waiting" value={fmtNum(items.length)} tone={critical ? "critical" : "default"}
        compare={critical ? `${critical} critical` : "none critical"}
        meaning={`Plans awaiting a decision that ${label} can see.`}
        implication={critical ? "Critical plans waiting: decide now." : "Each one is blocked until a named person decides."}
        provenance="computed"
      />
      <Metric
        id="oldest_wait_hours" label="Oldest wait" value={fmtNum(maxWait, 1)} unit="hours"
        compare="Simulated clock, since the plan was drafted"
        meaning="Decision debt: how long the oldest plan has been waiting."
        implication="Waiting time adds directly to time-to-action."
        provenance="computed"
      />
    </MetricGroup>
  ) : undefined;

  return (
    <PageTemplate explainKey="approvals" title="Approvals" question="What is waiting for a human decision, and for how long?" glance={glance}>
      {loading && !data ? <Loading rows={6} /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState
          title="Nothing waiting."
          body="Plans appear here after an investigation drafts one. Open a case at the Detected stage and run its investigation."
          action={<Link href="/app/incidents" className={buttonClass("secondary", "sm")}>Open the cases</Link>}
        />
      ) : (
        <section aria-label="Plans waiting for a decision">
          <ul className="approval-list" data-testid="approval-list">
            {items.map((a) => {
              const c = byRef[a.ref];
              const needed = a.four_eyes ? 2 : 1;
              return (
                <li key={a.plan_id} className="approval-card" data-testid="approval-card">
                  <div className="approval-card__head">
                    {c ? <CategoryChip category={c.category} size="sm" /> : null}
                    <SeverityPill severity={a.severity} />
                    <span className="mono caption">{a.ref} · {a.plan_id}</span>
                  </div>
                  <div className="approval-card__title">{a.title}</div>
                  <dl className="approval-card__facts">
                    <div><dt>Requires</dt><dd>{personaLabel(a.requires_role)}</dd></div>
                    <div>
                      <dt><TermHint term="four_eyes" label="Four-eyes" /></dt>
                      <dd>{a.four_eyes ? `Yes: two different approvers (${a.approvals_so_far} of ${needed} so far)` : `No: one approver (${a.approvals_so_far} of 1)`}</dd>
                    </div>
                    <div><dt>Waiting</dt><dd>{fmtNum(a.waiting_hours, 1)} h <span className="caption">(decision debt)</span></dd></div>
                    <div><dt>₹ exposed</dt><dd>{fmtINR(a.value_at_stake)} <span className="caption">(exposure, not a forecast)</span></dd></div>
                  </dl>
                  <div>
                    <Link href={`/app/incidents/${encodeURIComponent(a.ref)}?tab=todo`} className={buttonClass("primary", "sm")}>Review the plan and decide</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageTemplate>
  );
}
