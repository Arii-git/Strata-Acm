"use client";

import { TermHint } from "@/components/ui";
import { humanize } from "@/lib/format";

export interface SimilarityMatch {
  ref: string;
  title: string;
  similarity: number;
  breakdown: { embedding: number; cause: number; pattern: number };
  outcome: string;
  authored_by: string;
}

const PARTS = [
  { key: "embedding", weight: 0.5, label: "text match", cls: "sim-bars__seg--text" },
  { key: "cause", weight: 0.3, label: "same cause", cls: "sim-bars__seg--cause" },
  { key: "pattern", weight: 0.2, label: "same signals", cls: "sim-bars__seg--pattern" },
] as const;

/**
 * Memory similarity as stacked bars: 0.5 × text match + 0.3 × same cause + 0.2 × same signals (full width = 1.0).
 * Segments differ by fill pattern and are labelled in text under each bar, so colour is never the only cue.
 */
export function SimilarityBars({ matches, limit = 5 }: { matches: SimilarityMatch[]; limit?: number }) {
  const rows = [...matches].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  return (
    <figure className="diagram sim-bars" data-testid="diagram-similarity">
      <div className="sim-bars__legend" aria-hidden="true">
        {PARTS.map((p) => <span key={p.key} className="sim-bars__key"><span className={`sim-bars__swatch ${p.cls}`} />{p.weight} × {p.label}</span>)}
      </div>
      {rows.length ? (
        <ol className="sim-bars__rows">
          {rows.map((m) => {
            const alt = `${m.ref}: similarity ${m.similarity.toFixed(2)} = 0.5 × text ${m.breakdown.embedding.toFixed(2)} + 0.3 × cause ${m.breakdown.cause.toFixed(2)} + 0.2 × signals ${m.breakdown.pattern.toFixed(2)}`;
            return (
              <li key={m.ref} className="sim-bars__row">
                <div className="sim-bars__label">
                  <span className="mono">{m.ref}</span> <span>{m.title}</span>
                  <span className="caption"> · outcome {humanize(m.outcome)}</span>
                </div>
                <div className="sim-bars__track" role="img" aria-label={alt}>
                  {PARTS.map((p) => {
                    const w = p.weight * Math.max(0, Math.min(1, m.breakdown[p.key])) * 100;
                    return w > 0 ? <span key={p.key} className={`sim-bars__seg ${p.cls}`} style={{ width: `${w}%` }} /> : null;
                  })}
                  <span className="sim-bars__value mono">{m.similarity.toFixed(2)}</span>
                </div>
                <div className="sim-bars__parts caption mono" aria-hidden="true">
                  {PARTS.map((p) => `${p.label} ${m.breakdown[p.key].toFixed(2)}`).join(" · ")}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p className="caption">No similar past cases were found.</p>}
      <figcaption className="caption">
        <TermHint term="similarity" label="How close each past case is." /> Similarity = 0.5 × text match (TF-IDF) + 0.3 × same cause + 0.2 × same signal pattern; a full bar would be 1.0.
      </figcaption>
    </figure>
  );
}
