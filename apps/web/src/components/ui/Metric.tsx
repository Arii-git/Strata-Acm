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
  /** Pre-formatted delta text, e.g. fmtPct(-0.31) gives "−31%" */
  delta?: string;
  /** Delta colouring: "up" = good (green text), "down" = bad (crimson-700 text). */
  deltaTone?: "up" | "down" | "neutral";
  tone?: "default" | "critical" | "healthy" | "elevated";
}

export function Metric({ label, value, meaning, implication, provenance, delta, deltaTone = "neutral", tone = "default" }: MetricProps) {
  return (
    <div className="metric">
      <div className="metric__label">
        <span>{label}</span>
        <ProvenanceBadge provenance={provenance} />
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: "var(--sp-2)" }}>
        <span className={`metric__value${tone !== "default" ? ` metric__value--${tone}` : ""}`}>{value}</span>
        {delta ? <span className={`metric__delta metric__delta--${deltaTone}`}>{delta}</span> : null}
      </div>
      <Caption meaning={meaning} implication={implication} />
    </div>
  );
}
