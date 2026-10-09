"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  SeverityPill,
  StatusPill,
  buttonClass,
  type ColumnDef,
} from "@/components/ui";
import { qs, useApi } from "@/lib/api/client";
import type { HeldBack, Kind, Severity } from "@/lib/api/types";
import { fmtINR, fmtNum, humanize } from "@/lib/format";
import { usePersona } from "@/lib/persona";

interface RiskRow {
  id: string; ref: string; kind: Kind; title: string; account_id: number | string | null; account_name: string;
  scope: string; scope_key: string; region: string | null; severity: Severity; risk_score: number;
  n_sources: number; sources: string[]; value_at_stake: number; status: string;
  cause: string | null; cause_confidence: number | null; driver: string;
  regulatory_sensitive: boolean; owner_role: string; age_days: number; rank_score: number;
}
interface RisksLive { items: RiskRow[]; held_back: HeldBack[]; budget: number; shown: number; total: number }

const SEVERITIES: Severity[] = ["critical", "high", "elevated", "watch", "healthy"];
const selectStyle = { padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--ink)", font: "inherit" } as const;

const causeText = (r: RiskRow) => (!r.cause || r.cause === "not_investigated" ? "not yet investigated" : humanize(r.cause));

export default function RisksPage() {
  const { persona } = usePersona();
  const { data, error, loading, reload } = useApi<RisksLive>(qs("/risks", { persona }));
  const [kind, setKind] = useState<"" | Kind>("");
  const [sev, setSev] = useState<"" | Severity>("");
  const [showHeld, setShowHeld] = useState(false);
  const [sel, setSel] = useState<RiskRow | null>(null);

  const rows = useMemo(
    () => (data?.items ?? []).filter((r) => (!kind || r.kind === kind) && (!sev || r.severity === sev)),
    [data, kind, sev],
  );

  const cols: ColumnDef<RiskRow>[] = [
    { id: "ref", accessorKey: "ref", header: "Ref" },
    { id: "title", accessorKey: "title", header: "Title" },
    { id: "severity", accessorFn: (r) => SEVERITIES.length - SEVERITIES.indexOf(r.severity), header: "Severity", cell: (c) => <SeverityPill severity={c.row.original.severity} /> },
    { id: "risk_score", accessorKey: "risk_score", header: "Risk", meta: { numeric: true } },
    { id: "value_at_stake", accessorKey: "value_at_stake", header: "Exposure", meta: { numeric: true, help: "Baseline 12-week order value. Exposure, not predicted loss." }, cell: (c) => fmtINR(c.row.original.value_at_stake) },
    { id: "sources", accessorKey: "n_sources", header: "Sources", cell: (c) => `${c.row.original.n_sources} · ${c.row.original.sources.join(", ")}` },
    {
      id: "driver", accessorKey: "driver", header: "Driver / cause",
      cell: (c) => (
        <span className="stack" style={{ gap: 0 }}>
          <span>likely driver: {c.row.original.driver}</span>
          <span className="caption">cause: {causeText(c.row.original)}</span>
        </span>
      ),
    },
    { id: "owner_role", accessorKey: "owner_role", header: "Owner", cell: (c) => humanize(c.row.original.owner_role) },
    { id: "age_days", accessorKey: "age_days", header: "Age (d)", meta: { numeric: true } },
    { id: "status", accessorKey: "status", header: "Status", cell: (c) => <StatusPill status={c.row.original.status} /> },
  ];

  return (
    <>
      <PageHeader question="Which accounts need action, in what order?" title="Risk Register">
        <label className="row caption" style={{ maxWidth: "none" }}>
          Kind
          <select style={selectStyle} value={kind} onChange={(e) => setKind(e.target.value as "" | Kind)}>
            <option value="">All</option>
            <option value="risk">Risk</option>
            <option value="opportunity">Opportunity</option>
          </select>
        </label>
        <label className="row caption" style={{ maxWidth: "none" }}>
          Severity
          <select style={selectStyle} value={sev} onChange={(e) => setSev(e.target.value as "" | Severity)}>
            <option value="">All</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        </label>
      </PageHeader>
      {loading && !data ? <Loading rows={8} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data ? (
        <EmptyState title="No register" />
      ) : (
        <div className="stack">
          <div className="card">
            <div className="row">
              <span>Alert Budget: {fmtNum(data.shown)} shown of {fmtNum(data.total)}, {fmtNum(data.held_back.length)} held back</span>
              {data.held_back.length > 0 ? (
                <Button variant="ghost" size="sm" aria-expanded={showHeld} onClick={() => setShowHeld((s) => !s)}>{showHeld ? "Hide why" : "Why"}</Button>
              ) : null}
            </div>
            <div className="caption">The daily budget is {fmtNum(data.budget)} items; lower-ranked items are held back so the list stays actionable.</div>
            {showHeld ? (
              <ul className="caption" style={{ maxWidth: "none" }}>
                {data.held_back.map((h) => <li key={h.ref}><Link className="mono" href={`/app/incidents/${h.ref}`}>{h.ref}</Link> {h.title}: {h.reason}</li>)}
              </ul>
            ) : null}
          </div>
          <Card title="Ranked register">
            <DataTable
              columns={cols}
              data={rows}
              provenance="computed"
              caption="Ranked by exposure x confidence x urgency. Exposure is the baseline 12-week order value of the scope: exposure, not predicted loss. Driver is descriptive; cause stays 'not yet investigated' until the Investigator runs."
              onRowClick={setSel}
              emptyText="No items match these filters."
            />
          </Card>
        </div>
      )}
      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? <span><span className="mono">{sel.ref}</span> {sel.title}</span> : ""}
        footer={sel ? <Link className={buttonClass("primary")} href={`/app/incidents/${sel.ref}`}>Open in Workbench</Link> : null}
      >
        {sel ? (
          <div className="stack" style={{ gap: "var(--sp-2)" }}>
            <div className="row"><SeverityPill severity={sel.severity} /><StatusPill status={sel.status} /></div>
            <div>Risk score {fmtNum(sel.risk_score)} · exposure {fmtINR(sel.value_at_stake)} (baseline 12-week order value, not a loss forecast)</div>
            <div>Scope: {humanize(sel.scope)} {sel.account_id ? <Link href={`/app/accounts/${sel.account_id}`}>{sel.account_name}</Link> : sel.region ?? sel.scope_key}</div>
            <div>{sel.n_sources} source systems agree: {sel.sources.join(", ")}</div>
            <div>Likely driver: {sel.driver}; cause: {causeText(sel)}</div>
            <div>Owner: {humanize(sel.owner_role)} · open {fmtNum(sel.age_days)} days{sel.regulatory_sensitive ? " · regulatory-sensitive, routed to QA" : ""}</div>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
