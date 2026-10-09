import type { Severity } from "@/lib/api/types";
import { humanize } from "@/lib/format";

const SEV_LABEL: Record<Severity, string> = { healthy: "Healthy", watch: "Watch", elevated: "Elevated", high: "High", critical: "Critical" };

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span className={`pill pill--${severity}`}>
      <span className="pill__dot" aria-hidden="true" />
      {SEV_LABEL[severity] ?? humanize(severity)}
    </span>
  );
}

export type StatusTone = "neutral" | "info" | "ok" | "warn" | "bad";
const STATUS_TONE: Record<string, StatusTone> = {
  open: "info", new: "info", investigating: "info", awaiting_approval: "warn", pending: "warn", todo: "neutral",
  in_progress: "info", approved: "ok", done: "ok", resolved: "ok", closed: "neutral", modified: "warn",
  rejected: "bad", failed: "bad", blocked: "bad", stale: "warn", late: "bad", ok: "ok", healthy: "ok", degraded: "warn", down: "bad",
};

/** Generic status pill (dot + text). Tone is inferred from common status strings; override with `tone`. */
export function StatusPill({ status, tone, label }: { status: string; tone?: StatusTone; label?: string }) {
  const t = tone ?? STATUS_TONE[status] ?? "neutral";
  return (
    <span className={`pill pill--${t}`}>
      <span className="pill__dot" aria-hidden="true" />
      {label ?? humanize(status)}
    </span>
  );
}

export function EvidenceChip({ id, label, onClick }: { id: string; label?: string; onClick?: (id: string) => void }) {
  const inner = (
    <>
      <span>{id}</span>
      {label ? <span className="ev-chip__label">{label}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="ev-chip" onClick={() => onClick(id)} title={label ? `${id}: ${label}` : id}>{inner}</button>
  ) : (
    <span className="ev-chip" title={label ? `${id}: ${label}` : id}>{inner}</span>
  );
}
