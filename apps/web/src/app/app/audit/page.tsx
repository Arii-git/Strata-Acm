"use client";

import { useMemo, useState } from "react";
import { PageHeader, DataTable, ErrorState, Loading, StatusPill, Button, buttonClass, Caption, type ColumnDef } from "@/components/ui";
import { useApi, apiGet, API_BASE } from "@/lib/api/client";
import { fmtDate, humanize } from "@/lib/format";
import type { AuditRow } from "@/lib/api/types";

interface AuditResp { items: AuditRow[]; verified: boolean }
interface VerifyResp { ok: boolean; checked: number; first_bad_id: string | number | null }

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", background: "var(--surface)",
  padding: "var(--sp-1) var(--sp-2)", fontSize: "var(--fs-13)",
};

function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n)}…` : s; }

export default function AuditPage() {
  const { data, error, loading, reload } = useApi<AuditResp>("/audit");
  const [actorType, setActorType] = useState("");
  const [action, setAction] = useState("");
  const [verify, setVerify] = useState<VerifyResp | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<Error | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const actorTypes = useMemo(() => [...new Set(items.map((r) => r.actor_type))].sort(), [items]);
  const actions = useMemo(() => [...new Set(items.map((r) => r.action))].sort(), [items]);
  const filtered = useMemo(
    () => items.filter((r) => (!actorType || r.actor_type === actorType) && (!action || r.action === action)),
    [items, actorType, action],
  );

  const runVerify = async () => {
    setVerifying(true); setVerifyErr(null);
    try { setVerify(await apiGet<VerifyResp>("/audit/verify")); }
    catch (e) { setVerifyErr(e instanceof Error ? e : new Error(String(e))); }
    finally { setVerifying(false); }
  };

  const columns = useMemo<ColumnDef<AuditRow>[]>(() => [
    { accessorKey: "id", header: "ID", meta: { mono: true, numeric: true } },
    { accessorKey: "at", header: "At (sim)", cell: (c) => fmtDate(c.getValue<string>(), true) },
    { accessorKey: "wall_at", header: "Wall clock", cell: (c) => <span className="muted">{fmtDate(c.getValue<string>(), true)}</span> },
    { accessorKey: "actor_type", header: "Actor type", cell: (c) => humanize(c.getValue<string>()) },
    { accessorKey: "actor", header: "Actor" },
    { accessorKey: "action", header: "Action", cell: (c) => <span className="mono">{c.getValue<string>()}</span> },
    { id: "entity", header: "Entity", accessorFn: (r) => `${r.entity_type}:${r.entity_id}`, cell: (c) => <span><span className="muted">{c.row.original.entity_type}</span> <span className="mono">{c.row.original.entity_id}</span></span> },
    {
      id: "detail", header: "Detail", accessorFn: (r) => JSON.stringify(r.detail ?? null),
      cell: (c) => { const full = c.getValue<string>(); return <span className="mono" title={full} style={{ fontSize: "var(--fs-12)" }}>{truncate(full, 60)}</span>; },
    },
    { accessorKey: "hash", header: "Hash", cell: (c) => <span className="mono" title={c.getValue<string>()}>{c.getValue<string>().slice(0, 10)}</span> },
  ], []);

  const chainPill = () => {
    if (verify) {
      return verify.ok
        ? <StatusPill status="verified" tone="ok" label={`Hash chain verified (${verify.checked} rows)`} />
        : <StatusPill status="broken" tone="bad" label={`Chain broken at row ${verify.first_bad_id ?? "?"}`} />;
    }
    if (!data) return null;
    return data.verified
      ? <StatusPill status="verified" tone="ok" label={`Hash chain verified (${items.length} rows)`} />
      : <StatusPill status="broken" tone="bad" label="Chain broken (run Verify chain for the row)" />;
  };

  return (
    <div className="stack">
      <PageHeader question="Who or what decided, when, based on what?" title="Audit Trail">
        <a className={buttonClass("secondary", "sm")} href={`${API_BASE}/audit.csv`} download>Export CSV</a>
        <Button size="sm" onClick={runVerify} disabled={verifying}>{verifying ? "Verifying…" : "Verify chain"}</Button>
      </PageHeader>
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
        {chainPill()}
        <Caption meaning="Each row stores the hash of the previous row, so any edit or deletion breaks the chain from that row on." />
      </div>
      {verifyErr ? <ErrorState error={verifyErr} title="Could not verify the chain" onRetry={runVerify} /> : null}
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <label className="row" style={{ fontSize: "var(--fs-13)" }}>
          Actor type
          <select value={actorType} onChange={(e) => setActorType(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            {actorTypes.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
          </select>
        </label>
        <label className="row" style={{ fontSize: "var(--fs-13)" }}>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <span className="caption">{filtered.length} of {items.length} rows</span>
      </div>
      {loading && !data ? <Loading rows={8} label="Loading audit trail" />
        : error ? <ErrorState error={error} onRetry={reload} />
        : (
          <DataTable
            columns={columns}
            data={filtered}
            provenance="computed"
            emptyText="No audit rows match these filters."
            initialSort={[{ id: "id", desc: true }]}
            maxHeight={640}
            caption="What it is: every detection, agent step, human decision, task change and Lab action, in an append-only hash chain with simulated and wall-clock times. What it implies: any decision can be traced to who or what made it and the evidence it cited."
          />
        )}
    </div>
  );
}
