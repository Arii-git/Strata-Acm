import Link from "next/link";
import type { Provenance } from "@/lib/api/types";
import { Caption, ProvenanceBadge } from "./Caption";

export interface MetricProps {
  label: string;
  value: string | number;
  /** What this number is. REQUIRED. */
  meaning: string;
  /** What it implies / what to do about it. REQUIRED. */
  implication: string;
  /** Where the number comes from. REQUIRED. */
  provenance: Provenance;
  /** Metric-dictionary id (config/metrics.yaml). Every id used in source must exist there (tests). */
  id?: string;
  /** Unit shown after the value, e.g. "days", "%", "of 100". */
  unit?: string;
  /** What it is compared with, e.g. "vs this account's usual 4 weeks". */
  compare?: string;
  /** Next step: opens the rows behind the number. */
  next?: { label: string; href: string };
  /** Pre-formatted delta text, e.g. fmtPct(-0.31) gives "−31%" */
  delta?: string;
  /** Delta colouring: "up" = good (green text), "down" = bad (crimson-700 text). */
  deltaTone?: "up" | "down" | "neutral";
  tone?: "default" | "critical" | "healthy" | "elevated";
}

/** Must be rendered inside a <MetricGroup> (UX_SPEC U3; e2e checks there are no orphan metrics). */
export function Metric({ label, value, meaning, implication, provenance, id, unit, compare, next, delta, deltaTone = "neutral", tone = "default" }: MetricProps) {
  return (
    <div className="metric" data-metric={id ?? label}>
      <div className="metric__label">
        <span>{label}</span>
        <ProvenanceBadge provenance={provenance} />
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: "var(--sp-2)" }}>
        <span className={`metric__value${tone !== "default" ? ` metric__value--${tone}` : ""}`}>{value}</span>
        {unit ? <span className="metric__unit">{unit}</span> : null}
        {delta ? <span className={`metric__delta metric__delta--${deltaTone}`}>{delta}</span> : null}
      </div>
      {compare ? <div className="metric__compare">{compare}</div> : null}
      <Caption meaning={meaning} implication={implication} />
      {next ? <Link className="metric__next" href={next.href}>{next.label} →</Link> : null}
    </div>
  );
}
