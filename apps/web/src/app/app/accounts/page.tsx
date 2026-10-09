"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  SeverityPill,
  type ColumnDef,
} from "@/components/ui";
import { qs, useApi } from "@/lib/api/client";
import type { Severity } from "@/lib/api/types";
import { fmtINR } from "@/lib/format";

interface AccountLive {
  id: number | string; name: string; type: string; type_label?: string; region: string; tier: string;
  value_12w: number; risk_score: number; severity: Severity; open_incidents: number;
}

const ctl = { padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--ink)", font: "inherit" } as const;

const CUSTOMER_DEFINITION =
  "A customer in STRATA is a B2B channel account of a nephrology pharma company: stockist, chemist chain, hospital pharmacy or nephrology clinic. No patient data is used.";

export default function AccountsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [type, setType] = useState("");
  const [region, setRegion] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Unfiltered list only to derive filter options from the engine (no hard-coded lists).
  const all = useApi<{ items: AccountLive[] }>("/accounts");
  const { data, error, loading, reload } = useApi<{ items: AccountLive[] }>(qs("/accounts", { q: debQ, type, region }));

  const types = useMemo(() => {
    const m = new Map<string, string>();
    (all.data?.items ?? []).forEach((a) => m.set(a.type, a.type_label ?? a.type));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all.data]);
  const regions = useMemo(() => [...new Set((all.data?.items ?? []).map((a) => a.region))].sort(), [all.data]);

  const cols: ColumnDef<AccountLive>[] = [
    { id: "id", accessorKey: "id", header: "ID" },
    { id: "name", accessorKey: "name", header: "Name", cell: (c) => <Link href={`/app/accounts/${c.row.original.id}`}>{c.row.original.name}</Link> },
    { id: "type_label", accessorFn: (r) => r.type_label ?? r.type, header: "Type" },
    { id: "region", accessorKey: "region", header: "Region" },
    { id: "tier", accessorKey: "tier", header: "Tier" },
    { id: "value_12w", accessorKey: "value_12w", header: "12-week value", meta: { numeric: true }, cell: (c) => fmtINR(c.row.original.value_12w) },
    { id: "risk_score", accessorKey: "risk_score", header: "Risk", meta: { numeric: true } },
    { id: "severity", accessorKey: "severity", header: "Severity", cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "open_incidents", accessorKey: "open_incidents", header: "Open incidents", meta: { numeric: true } },
  ];

  return (
    <>
      <PageHeader question="Which customers should we look at?" title="Accounts" />
      <div className="stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input aria-label="Search accounts" placeholder="Search by name or ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...ctl, minWidth: 240 }} />
          <select aria-label="Account type" style={ctl} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label="Region" style={ctl} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Card title="Accounts">
          {loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
            <EmptyState title="No accounts match" body="Try a different search or clear the filters." />
          ) : (
            <DataTable
              columns={cols}
              data={data.items}
              provenance="synthetic"
              caption="Channel accounts with their baseline 12-week order value and current risk. Sorted by risk so the accounts to look at first are on top."
              initialSort={[{ id: "risk_score", desc: true }]}
              onRowClick={(r) => router.push(`/app/accounts/${r.id}`)}
              maxHeight={560}
            />
          )}
        </Card>
        <p className="caption">{CUSTOMER_DEFINITION}</p>
      </div>
    </>
  );
}
