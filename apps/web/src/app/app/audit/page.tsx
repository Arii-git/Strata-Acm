"use client";

import { useMemo, useState } from "react";
import {
  DataTable, Details, ErrorState, Loading, Metric, MetricGroup, PageTemplate, StatusPill, Button, buttonClass, Caption, type ColumnDef,
} from "@/components/ui";
import { ArtEmptyState } from "@/components/diagrams/EmptyStateArt";
import { useApi, apiGet, API_BASE } from "@/lib/api/client";
import { fmtDate, fmtNum, humanize } from "@/lib/format";
import { useViewMode } from "@/lib/viewmode";
import type { AuditRow } from "@/lib/api/types";

interface AuditResp { items: AuditRow[]; verified: boolean }
interface VerifyResp { ok: boolean; checked: number; first_bad_id: string | number | null }

function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n)}…` : s; }

export default function AuditPage() {
  const { mode } = useViewMode();
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
  const humans = items.filter((r) => r.actor_type === "human").length;
  const latest = useMemo(() => [...items].sort((a, b) => Number(b.id) - Number(a.id))[0], [items]);

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

  const chainOk = verify ? verify.ok : data?.verified ?? null;
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

  const takeaway = !data ? "Loading the audit trail…"
    : !items.length ? "No decisions or actions recorded yet."
    : `${fmtNum(items.length)} rows, hash chain ${chainOk ? "verified (nothing altered)" : "BROKEN: something was altered"}; latest: ${latest.action} by ${latest.actor} (${humanize(latest.actor_type)}) at ${fmtDate(latest.at, true)} simulated.`;

  return (
    <PageTemplate
      explainKey="audit"
      title="Audit Trail"
      question="Who or what decided, when, based on what?"
      headerActions={
        <>
          <a className={buttonClass("secondary", "sm")} href={`${API_BASE}/audit.csv`} download>Export CSV</a>
          <Button size="sm" onClick={runVerify} disabled={verifying}>{verifying ? "Verifying…" : "Verify chain"}</Button>
        </>
      }
      glance={data && items.length ? (
        <MetricGroup title="At a glance">
          <Metric id="audit_rows" label="Audit rows" value={fmtNum(items.length)} unit="rows"
            compare={`${fmtNum(actions.length)} kinds of action`}
            meaning="Every detection, agent step, human decision, task change and Lab action recorded."
            implication="Any decision can be traced to who or what made it." provenance="computed" />
          <Metric id="audit_chain_verified" label="Hash chain" value={chainOk ? "Verified" : "Broken"} unit={verify ? `${fmtNum(verify.checked)} rows checked` : "on load"}
            compare="each row stores the previous row's hash"
            meaning="Verified means no row was edited or deleted after it was written."
            implication={chainOk ? "The trail can be trusted as written." : "Find the first bad row; everything after it is suspect."}
            provenance="computed" tone={chainOk ? "healthy" : "critical"} />
          <Metric id="audit_human_actions" label="Human actions" value={fmtNum(humans)} unit={`of ${fmtNum(items.length)}`}
            compare="rows where a person acted"
            meaning="Approvals, rejections, notes and other human steps in the trail."
            implication="STRATA never approves its own plans; every approval here is a human row."
            provenance="computed" />
        </MetricGroup>
      ) : undefined}
      visual={{
        takeaway,
        node: (
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
              {chainPill()}
              <Caption meaning="Each row stores the hash of the previous row, so any edit or deletion breaks the chain from that row on." />
            </div>
            {verifyErr ? <ErrorState error={verifyErr} title="Could not verify the chain" onRetry={runVerify} /> : null}
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
              <label className="row" style={{ fontSize: "var(--fs-13)" }}>
                Actor type
                <select className="select" value={actorType} onChange={(e) => setActorType(e.target.value)}>
                  <option value="">All</option>
                  {actorTypes.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
                </select>
              </label>
              <label className="row" style={{ fontSize: "var(--fs-13)" }}>
                Action
                <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
                  <option value="">All</option>
                  {actions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <span className="caption">{filtered.length} of {items.length} rows</span>
            </div>
            {loading && !data ? <Loading rows={8} label="Loading audit trail" />
              : error ? <ErrorState error={error} onRetry={reload} />
              : !items.length ? (
                <ArtEmptyState art="audit" title="No audit rows yet" body="Every detection, agent step, human decision and Lab action is written here as a hash-chained row, so it can be traced later." />
              ) : (
                <DataTable
                  columns={columns}
                  data={filtered}
                  provenance="computed"
                  emptyText="No audit rows match these filters."
                  initialSort={[{ id: "id", desc: true }]}
                  maxHeight={520}
                  caption="What it is: every detection, agent step, human decision, task change and Lab action, in an append-only hash chain with simulated and wall-clock times. What it implies: any decision can be traced to who or what made it and the evidence it cited."
                />
              )}
          </div>
        ),
      }}
      actions={
        <>
          <Button variant="primary" onClick={runVerify} disabled={verifying}>{verifying ? "Verifying…" : "Verify the chain now"}</Button>
          <a className={buttonClass("secondary")} href={`${API_BASE}/audit.csv`} download>Export CSV</a>
        </>
      }
    >
      <Details title="How the chain works" defaultOpen={mode === "detailed"}>
        <p className="caption" style={{ margin: 0 }}>
          Rows are append-only. Each row stores a hash of its own content plus the previous row&apos;s hash. Verify recomputes every hash from the first row;
          the first row whose stored hash does not match is reported, and every later row is suspect.
        </p>
      </Details>
    </PageTemplate>
  );
}
