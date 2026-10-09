/**
 * StrataLoader: the STRATA loop as a calm loading mark. Six nodes on a ring (Observe → Detect → Investigate →
 * Remember → Act → Learn); a short arc travels the ring and each node lights as the arc reaches it.
 * md / lg also cycle the stage word beneath ("Observing…") plus `label`. Pure SVG + CSS (styles in globals.css,
 * `.sl-*`), tokens only. Reduced motion: a still ring with every node shown and the label as text.
 */

const STAGES = ["Observing", "Detecting", "Investigating", "Remembering", "Acting", "Learning"] as const;

const C = 32; // viewBox centre (0 0 64 64)
const R = 22; // ring radius
const NODES = STAGES.map((_, i) => {
  const a = ((-90 + i * 60) * Math.PI) / 180; // Observe at 12 o'clock, then clockwise
  return { x: +(C + R * Math.cos(a)).toFixed(2), y: +(C + R * Math.sin(a)).toFixed(2) };
});
const CIRC = 2 * Math.PI * R;
const ARC = CIRC / 7; // travelling pulse length

export interface StrataLoaderProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  fullscreen?: boolean;
}

export function StrataLoader({ label = "Loading", size = "md", fullscreen = false }: StrataLoaderProps) {
  const words = size !== "sm";
  const mark = (
    <svg className="sl-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle className="sl-ring" cx={C} cy={C} r={R} />
      {/* the arc's head starts at Observe (12 o'clock) and reaches each node as that node lights */}
      <g className="sl-orbit">
        <circle className="sl-pulse" cx={C} cy={C} r={R} strokeDasharray={`${ARC.toFixed(2)} ${(CIRC - ARC).toFixed(2)}`} transform={`rotate(${(-90 - (ARC / CIRC) * 360).toFixed(2)} ${C} ${C})`} />
      </g>
      {NODES.map((p, i) => (
        <circle key={i} className="sl-node" cx={p.x} cy={p.y} r={size === "sm" ? 4.2 : 3.4} style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
      {size !== "sm" ? <rect className="sl-core" x={C - 2.5} y={C - 2.5} width={5} height={5} rx={1} /> : null}
    </svg>
  );

  const body = (
    <span className={`sl sl--${size}`} role="status" aria-live="polite" data-testid="strata-loader">
      {mark}
      {words ? (
        <span className="sl-text">
          <span className="sl-words" aria-hidden="true">
            {STAGES.map((w, i) => (
              <span key={w} className="sl-word" style={{ animationDelay: `${i * 0.6}s` }}>{w}…</span>
            ))}
          </span>
          <span className="sl-label">{label}</span>
        </span>
      ) : (
        <span className="sr-only">{label}…</span>
      )}
    </span>
  );

  return fullscreen ? <div className="sl-screen" data-size={size}>{body}</div> : body;
}
