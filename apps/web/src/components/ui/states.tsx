import { IconAlertTriangle, IconInbox } from "@tabler/icons-react";
import { Button } from "./Button";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="state" role="status">
      <IconInbox size={20} stroke={1.5} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
      <div className="state__title">{title}</div>
      {body ? <p className="caption">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Could not load this view" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  return (
    <div className="state state--error" role="alert">
      <IconAlertTriangle size={20} stroke={1.5} aria-hidden="true" style={{ color: "var(--crimson-700)" }} />
      <div className="state__title">{title}</div>
      <p className="caption">{msg}</p>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button> : null}
    </div>
  );
}

/** Skeleton rows; no spinner. */
export function Loading({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__row" style={{ width: `${100 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  );
}
