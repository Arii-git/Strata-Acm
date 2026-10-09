"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWording } from "@/lib/industry";
import Link from "next/link";
import {
  DataTable,
  Details,
  ErrorState,
  Loading,
  Metric,
  MetricGroup,
  PageTemplate,
  SeverityPill,
  buttonClass,
  type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { qs, useApi } from "@/lib/api/client";
import type { Severity } from "@/lib/api/types";
import { fmtINR, fmtNum } from "@/lib/format";
import { useViewMode } from "@/lib/viewmode";

interface AccountLive {
  id: number | string; name: string; type: string; type_label?: string; region: string; tier: string;
  value_12w: number; risk_score: number; severity: Severity; open_incidents: number;
}


export default function AccountsPage() {
  const CUSTOMER_DEFINITION = useWording().customer;
  const router = useRouter();
  const { mode } = useViewMode();
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [type, setType] = useState("");
  const [region, setRegion] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Unfiltered list: derives filter options and the at-a-glance counts from the engine (no hard-coded lists).
  const all = useApi<{ items: AccountLive[] }>("/accounts");
  const { data, error, loading, reload } = useApi<{ items: AccountLive[] }>(qs("/accounts", { q: debQ, type, region }));

  const allItems = useMemo(() => all.data?.items ?? [], [all.data]);
  const types = useMemo(() => {
    const m = new Map<string, string>();
    allItems.forEach((a) => m.set(a.type, a.type_label ?? a.type));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allItems]);
  const regions = useMemo(() => [...new Set(allItems.map((a) => a.region))].sort(), [allItems]);
  const hot = allItems.filter((a) => a.severity === "critical" || a.severity === "high");
  const withOpen = allItems.filter((a) => a.open_incidents > 0);
  const top = [...allItems].sort((a, b) => b.risk_score - a.risk_score || b.value_12w - a.value_12w)[0];

  const cols: ColumnDef<AccountLive>[] = [
    { id: "id", accessorKey: "id", header: "ID" },
    { id: "name", accessorKey: "name", header: "Name", cell: (c) => <Link href={`/app/accounts/${c.row.original.id}`} onClick={(e) => e.stopPropagation()}>{c.row.original.name}</Link> },
    { id: "type_label", accessorFn: (r) => r.type_label ?? r.type, header: "Type" },
    { id: "region", accessorKey: "region", header: "Region" },
    { id: "tier", accessorKey: "tier", header: "Tier" },
    { id: "value_12w", accessorKey: "value_12w", header: "12-week value", meta: { numeric: true }, cell: (c) => fmtINR(c.row.original.value_12w) },
    { id: "risk_score", accessorKey: "risk_score", header: "Risk (0–100)", meta: { numeric: true } },
    { id: "severity", accessorKey: "severity", header: "Severity", cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "open_incidents", accessorKey: "open_incidents", header: "Open problems", meta: { numeric: true } },
  ];

  const takeaway = !all.data ? "Loading accounts…"
    : !allItems.length ? "No accounts loaded."
    : `${fmtNum(hot.length)} of ${fmtNum(allItems.length)} accounts are high or critical; ${top.name} is highest at risk ${fmtNum(top.risk_score)} with ${fmtINR(top.value_12w)} of normal 12-week orders.`;

  return (
    <PageTemplate
      explainKey="accounts"
      title="Accounts"
      question="Which customers should we look at?"
      glance={allItems.length ? (
        <MetricGroup title="At a glance">
          <Metric
            id="accounts_total" label="Channel accounts" value={fmtNum(allItems.length)} unit="accounts"
            compare={`${fmtNum(types.length)} types across ${fmtNum(regions.length)} regions`}
            meaning="Every B2B channel account STRATA watches."
            implication="Each is compared with its own normal, not with other accounts."
            provenance="computed"
          />
          <Metric
            id="accounts_high_risk" label="High or critical" value={fmtNum(hot.length)} unit={`of ${fmtNum(allItems.length)}`}
            compare="accounts at the top two severity levels"
            meaning="Accounts where several independent signals are off their own normal."
            implication={hot.length ? "Open these first: they carry the most risk." : "No account is high or critical."}
            provenance="computed" tone={hot.length ? "critical" : "default"}
            next={top ? { label: "Open the highest-risk account", href: `/app/accounts/${top.id}` } : undefined}
          />
          <Metric
            id="accounts_with_open_problems" label="With an open problem" value={fmtNum(withOpen.length)} unit={`of ${fmtNum(allItems.length)}`}
            compare="accounts named on at least one open problem"
            meaning="Accounts directly in scope of a problem on the board."
            implication="Regional, rep and batch problems can touch more accounts than this."
            provenance="computed" next={{ label: "See the problems", href: "/app/problems" }}
          />
        </MetricGroup>
      ) : undefined}
      visual={{
        takeaway,
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <input className="select" aria-label="Search accounts" placeholder="Search by name or ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
              <select className="select" aria-label="Account type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select className="select" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">All regions</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
              <ArtEmptyState art="customer" title="No accounts match" body="Accounts appear here by name, type and region. Try a different search or clear the filters." />
            ) : (
              <DataTable
                columns={cols}
                data={data.items}
                provenance="synthetic"
                caption="Channel accounts with their baseline 12-week order value and current risk. Sorted by risk so the accounts to look at first are on top."
                initialSort={[{ id: "risk_score", desc: true }]}
                onRowClick={(r) => router.push(`/app/accounts/${r.id}`)}
                maxHeight={480}
              />
            )}
          </div>
        ),
      }}
      actions={top ? (
        <>
          <Link className={buttonClass("primary")} href={`/app/accounts/${top.id}`}>Open {top.name}</Link>
          <Link className={buttonClass("secondary")} href="/app/problems">See their problems</Link>
        </>
      ) : undefined}
    >
      <Details title="What counts as a customer" defaultOpen={mode === "detailed"}>
        <p className="caption" style={{ margin: 0 }}>{CUSTOMER_DEFINITION}</p>
      </Details>
    </PageTemplate>
  );
}
