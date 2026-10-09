"use client";

import { useEffect, useState } from "react";
import { IconAlertTriangle, IconInbox } from "@tabler/icons-react";
import { Button } from "./Button";

/**
 * Empty state. Always say what to do next: pass `next` (plain sentence) and/or an `action` button/link.
 * Rendered as a polite status so screen readers hear it when a filter empties a list.
 */
export function EmptyState({ title, body, action, next }: { title: string; body?: string; action?: React.ReactNode; next?: string }) {
  return (
    <div className="state" role="status">
      <IconInbox size={20} stroke={1.5} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
      <div className="state__title">{title}</div>
      {body ? <p className="caption">{body}</p> : null}
      {next ? <p className="state__next"><span className="state__next-label">What to do next:</span> {next}</p> : null}
      {action}
    </div>
  );
}

/** Error state. Says what failed, then what to do next (default: retry, or check the engine is running). */
export function ErrorState({ error, onRetry, title = "Could not load this view", next }: { error: unknown; onRetry?: () => void; title?: string; next?: string }) {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  const hint = next ?? (onRetry
    ? "Press Retry. If it fails again, check that the engine is running (npm run dev), then reload the page."
    : "Check that the engine is running (npm run dev), then reload the page.");
  return (
    <div className="state state--error" role="alert">
      <IconAlertTriangle size={20} stroke={1.5} aria-hidden="true" style={{ color: "var(--crimson-700)" }} />
      <div className="state__title">{title}</div>
      <p className="caption">{msg}</p>
      <p className="state__next"><span className="state__next-label">What to do next:</span> {hint}</p>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button> : null}
    </div>
  );
}

/** Skeleton rows; no spinner. Announced once as a polite status; the region is aria-busy while loading. */
export function Loading({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__row" aria-hidden="true" style={{ width: `${100 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Live announcements (aria-live). <LiveRegion/> is mounted once in    *
 * app/layout.tsx. After any async action call, e.g.:                  *
 *   announce("Plan approved. Workflow tasks created.")                *
 *   announce("Could not approve: engine offline", "assertive")        *
 * ------------------------------------------------------------------ */

export type Politeness = "polite" | "assertive";
type Listener = (message: string, politeness: Politeness) => void;
const listeners = new Set<Listener>();
let queued: [string, Politeness] | null = null;

/** Speak a short message to screen-reader users. Safe to call from any client code; no-op on the server. */
export function announce(message: string, politeness: Politeness = "polite"): void {
  if (typeof window === "undefined" || !message) return;
  if (listeners.size === 0) { queued = [message, politeness]; return; }
  listeners.forEach((l) => l(message, politeness));
}

/** Visually hidden polite + assertive live regions. Mount once (the root layout does this). */
export function LiveRegion() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  useEffect(() => {
    const timers: number[] = [];
    const listener: Listener = (message, politeness) => {
      const set = politeness === "assertive" ? setAssertive : setPolite;
      // clear first so an identical repeated message is announced again
      set("");
      timers.push(window.setTimeout(() => set(message), 60));
      timers.push(window.setTimeout(() => set(""), 7000));
    };
    listeners.add(listener);
    if (queued) { const [m, p] = queued; queued = null; listener(m, p); }
    return () => { listeners.delete(listener); timers.forEach((t) => window.clearTimeout(t)); };
  }, []);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region">{polite}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{assertive}</div>
    </>
  );
}

/**
 * "Skip to main content": first focusable element on every page (mounted in app/layout.tsx).
 * Targets #main; falls back to the first <main> so pages without the id still work.
 */
export function SkipLink({ label = "Skip to main content" }: { label?: string }) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = (document.getElementById("main") ?? document.querySelector("main")) as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
    target.scrollIntoView({ block: "start" });
  };
  return <a href="#main" className="skip-link skip-link--global" onClick={onClick} data-testid="skip-link">{label}</a>;
}
