"use client";

import { useState } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { ExplainDrawer } from "./ExplainDrawer";

/**
 * One page template (UX_SPEC U3). Order is fixed so pages read the same way everywhere:
 * header (title, the one question, Explain button) → At a glance (≤3 metrics, labelled) →
 * one main visual with a computed one-line takeaway → What to do → Details (collapsed in Simple mode).
 */
export interface PageTemplateProps {
  /** key into config/explain.ts */
  explainKey: string;
  title: string;
  question: string;
  /** optional right-aligned header controls (filters, toggles) */
  headerActions?: React.ReactNode;
  /** a <MetricGroup> with at most 3 metrics */
  glance?: React.ReactNode;
  /** the one main visual, with a computed one-sentence takeaway shown above it */
  visual?: { takeaway: string; node: React.ReactNode };
  /** primary actions as buttons/links */
  actions?: React.ReactNode;
  /** everything secondary: tables, evidence, logs (put them in <Details>) */
  children?: React.ReactNode;
}

export function PageTemplate({ explainKey, title, question, headerActions, glance, visual, actions, children }: PageTemplateProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="page-template page-enter" data-testid="page-template">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-header__title">{title}</h1>
          <p className="page-header__question">{question}</p>
        </div>
        <div className="page-header__actions">
          {headerActions}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)} data-testid="explain-button" aria-label="Explain this page" title="What this page shows and how to read it">
            <IconInfoCircle size={16} stroke={1.5} aria-hidden="true" /> Explain
          </button>
        </div>
      </header>
      {glance ? <div className="page-template__glance">{glance}</div> : null}
      {visual ? (
        <section className="page-template__visual" aria-label="Main view">
          <p className="takeaway" data-testid="takeaway">{visual.takeaway}</p>
          {visual.node}
        </section>
      ) : null}
      {actions ? (
        <section className="page-template__actions" aria-label="What to do">
          <h2 className="section-label">What to do</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>{actions}</div>
        </section>
      ) : null}
      {children ? <div className="page-template__details">{children}</div> : null}
      <ExplainDrawer pageKey={explainKey} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** A labelled group of at most 3 metrics. Every Metric must live inside one (checked by e2e). */
export function MetricGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="metric-group" data-metric-group aria-label={title}>
      <h2 className="section-label">{title}</h2>
      <div className="metric-group__grid">{children}</div>
    </section>
  );
}

/** Secondary content: collapsed by default in Simple mode (pass defaultOpen to override). */
export function Details({ title, children, defaultOpen, testId }: { title: string; children: React.ReactNode; defaultOpen?: boolean; testId?: string }) {
  return (
    <details className="details" open={defaultOpen} data-testid={testId}>
      <summary className="details__summary">{title}</summary>
      <div className="details__body">{children}</div>
    </details>
  );
}
