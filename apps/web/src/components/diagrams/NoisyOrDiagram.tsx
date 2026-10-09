import { useId } from "react";
import type { Provenance } from "@/lib/api/types";
import { ProvenanceBadge } from "@/components/ui/Caption";

/**
 * Noisy-OR "witnesses" diagram (lane L6/L7, item 11). Independent warning signals from different systems
 * each contribute p = weight × min(1, |robust z| / 4); combined = 1 − Π(1 − p); scaled by source diversity
 * (1 system ×0.55, 2 ×0.80, 3+ ×1.00); then banded. Original SVG on design tokens only (classes in lanes/help.css).
 * Without `witnesses` it draws the schematic (symbols only, no numbers). With them, every number shown is
 * passed in by the caller from engine data (label it with `provenance`).
 */
export interface NoisyOrWitness {
  id: string;
  label: string;
  source: string;
  weight: number;
  /** robust z-score of the signal */
  z: number;
  /** contribution p = weight × min(1, |z| / 4) */
  p: number;
}

export interface NoisyOrDiagramProps {
  witnesses?: NoisyOrWitness[];
  /** risk score the engine reported (0–100), if known */
  engineScore?: number;
  provenance?: Provenance;
  caption?: string;
}

export const DIVERSITY: Record<number, number> = { 1: 0.55, 2: 0.8 };
export const diversityFactor = (n: number) => (n <= 0 ? 0 : DIVERSITY[n] ?? 1);
export const witnessP = (weight: number, z: number) => weight * Math.min(1, Math.abs(z) / 4);
export function bandOf(score: number): string {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "elevated";
  if (score >= 30) return "watch";
  return "healthy";
}
/** Score before any persistence bonus, following signals.py noisy_or (cap 69 when fewer than 3 systems). */
export function combine(ws: { source: string; p: number }[]) {
  const raw = 1 - ws.reduce((acc, w) => acc * (1 - w.p), 1);
  const nSources = new Set(ws.map((w) => w.source)).size;
  const factor = diversityFactor(nSources);
  let score = Math.round(100 * Math.min(1, raw * factor));
  if (nSources < 3) score = Math.min(score, 69);
  return { raw, nSources, factor, score, band: bandOf(score) };
}

const SOURCE_CLASS: Record<string, string> = { orders: "1", inventory: "2", support: "3", crm: "4", finance: "5", workforce: "6" };
const BANDS: { key: string; from: number; to: number; label: string }[] = [
  { key: "healthy", from: 0, to: 30, label: "healthy <30" },
  { key: "watch", from: 30, to: 50, label: "watch 30–49" },
  { key: "elevated", from: 50, to: 70, label: "elevated 50–69" },
  { key: "high", from: 70, to: 85, label: "high 70–84" },
  { key: "critical", from: 85, to: 100, label: "critical 85+" },
];

const f2 = (x: number) => x.toFixed(2);
const sgn = (x: number) => (x < 0 ? `−${Math.abs(x).toFixed(2)}` : `+${x.toFixed(2)}`);

export function NoisyOrDiagram({ witnesses, engineScore, provenance = "computed", caption }: NoisyOrDiagramProps) {
  const uid = useId().replace(/:/g, "");
  const schematic = !witnesses || witnesses.length === 0;
  const rows: { key: string; title: string; sub: string; source: string }[] = schematic
    ? [
        { key: "a", title: "Witness 1 (e.g. orders)", sub: "p₁ = weight₁ × strength₁", source: "orders" },
        { key: "b", title: "Witness 2 (e.g. inventory)", sub: "p₂ = weight₂ × strength₂", source: "inventory" },
        { key: "c", title: "Witness 3 (e.g. support)", sub: "p₃ = weight₃ × strength₃", source: "support" },
      ]
    : witnesses.map((w) => ({ key: w.id, title: w.label, sub: `${w.source} · z ${sgn(w.z)} · p ${f2(w.p)}`, source: w.source }));
  const res = schematic ? null : combine(witnesses);

  const W = 900;
  const boxW = 250;
  const boxH = 40;
  const gap = 8;
  const top = 34;
  const stackH = rows.length * boxH + (rows.length - 1) * gap;
  const flowH = Math.max(stackH, 180);
  const midY = top + flowH / 2;
  const stackTop = top + (flowH - stackH) / 2;
  const bandY = top + flowH + 42;
  const H = bandY + 64;
  const cx = 316; const cw = 176; const ch = 104;
  const dx = 532; const dw = 200;
  const sx = 772; const sw = 118;
  const scale = (v: number) => 10 + (v / 100) * (W - 20);
  const shownScore = engineScore ?? res?.score;

  const textAlt = schematic
    ? "Schematic: several independent warning signals (witnesses) from different systems each give a contribution p = weight × strength, where strength = min(1, |robust z| ÷ 4). They combine as 1 − (1 − p1)(1 − p2)(1 − p3). The result is multiplied by a source-diversity factor (1 system 0.55, 2 systems 0.80, 3 or more 1.00) and turned into a 0–100 risk score. Bands: healthy under 30, watch 30–49, elevated 50–69, high 70–84, critical 85 and above; high and critical need 3 or more systems. 50 or more opens an incident."
    : `${rows.length} witnesses from ${res!.nSources} systems. Combined noisy-OR value ${f2(res!.raw)}; diversity factor ×${f2(res!.factor)}; computed score ${res!.score} (${res!.band})${engineScore !== undefined ? `; engine reports ${engineScore}` : ""}.`;

  return (
    <figure className="nod" data-testid="diagram-noisy-or">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`} className="nod__svg">
        <title id={`${uid}-t`}>Noisy-OR: independent witnesses combine into a risk score</title>
        <desc id={`${uid}-d`}>{textAlt}</desc>
        <defs>
          <marker id={`${uid}-arr`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="nod__arrowhead" />
          </marker>
        </defs>

        <text x={10} y={18} className="nod__head">1. Witnesses (adverse signals)</text>
        <text x={cx} y={18} className="nod__head">2. Combine</text>
        <text x={dx} y={18} className="nod__head">3. Systems agree?</text>
        <text x={sx} y={18} className="nod__head">4. Score</text>

        {rows.map((r, i) => {
          const y = stackTop + i * (boxH + gap);
          const yc = y + boxH / 2;
          const elbow = boxW + 10 + 30;
          return (
            <g key={r.key}>
              <rect x={10} y={y} width={boxW} height={boxH} rx={6} className={`nod__box nod__src--${SOURCE_CLASS[r.source] ?? "6"}`} />
              <rect x={10} y={y} width={5} height={boxH} className={`nod__tag nod__tagfill--${SOURCE_CLASS[r.source] ?? "6"}`} />
              <text x={22} y={y + 16} className="nod__t">{r.title.length > 34 ? `${r.title.slice(0, 33)}…` : r.title}</text>
              <text x={22} y={y + 32} className="nod__s">{r.sub}</text>
              <path d={`M${boxW + 10},${yc} H${elbow} V${midY} H${cx}`} className="nod__edge" markerEnd={i === 0 ? `url(#${uid}-arr)` : undefined} />
            </g>
          );
        })}

        <rect x={cx} y={midY - ch / 2} width={cw} height={ch} rx={6} className="nod__box nod__box--key" />
        <text x={cx + cw / 2} y={midY - 26} className="nod__t nod__c">Noisy-OR</text>
        <text x={cx + cw / 2} y={midY - 6} className="nod__s nod__c">1 − Π(1 − p)</text>
        <text x={cx + cw / 2} y={midY + 14} className="nod__s nod__c">independent warnings add up</text>
        <text x={cx + cw / 2} y={midY + 36} className={res ? "nod__v nod__c" : "nod__s nod__c"}>{res ? `= ${f2(res.raw)}` : "result between 0 and 1"}</text>

        <path d={`M${cx + cw},${midY} H${dx}`} className="nod__edge" markerEnd={`url(#${uid}-arr)`} />
        <rect x={dx} y={midY - ch / 2} width={dw} height={ch} rx={6} className="nod__box" />
        <text x={dx + dw / 2} y={midY - 26} className="nod__t nod__c">× source diversity</text>
        <text x={dx + dw / 2} y={midY - 6} className="nod__s nod__c">1 system ×0.55 · 2 systems ×0.80</text>
        <text x={dx + dw / 2} y={midY + 14} className="nod__s nod__c">3 or more systems ×1.00</text>
        <text x={dx + dw / 2} y={midY + 36} className={res ? "nod__v nod__c" : "nod__s nod__c"}>{res ? `${res.nSources} systems → ×${f2(res.factor)}` : "under 3 systems: max 69"}</text>

        <path d={`M${dx + dw},${midY} H${sx}`} className="nod__edge" markerEnd={`url(#${uid}-arr)`} />
        <rect x={sx} y={midY - ch / 2} width={sw} height={ch} rx={6} className="nod__box nod__box--key" />
        <text x={sx + sw / 2} y={midY - 26} className="nod__t nod__c">Risk score</text>
        <text x={sx + sw / 2} y={midY + 8} className="nod__big nod__c">{shownScore !== undefined ? shownScore : "0–100"}</text>
        <text x={sx + sw / 2} y={midY + 30} className="nod__s nod__c">{shownScore !== undefined ? bandOf(shownScore) : "50+ opens"}</text>
        <text x={sx + sw / 2} y={midY + 44} className="nod__s nod__c">{shownScore !== undefined ? (engineScore !== undefined ? "engine score" : "computed") : "an incident"}</text>

        <text x={10} y={bandY - 10} className="nod__head">5. Severity band (high and critical need 3+ systems)</text>
        {BANDS.map((b) => (
          <g key={b.key}>
            <rect x={scale(b.from)} y={bandY} width={scale(b.to) - scale(b.from)} height={26} className={`nod__band nod__band--${b.key}`} />
            <text x={(scale(b.from) + scale(b.to)) / 2} y={bandY + 17} className="nod__s nod__c nod__bandtext">{b.label}</text>
          </g>
        ))}
        <line x1={scale(50)} x2={scale(50)} y1={bandY - 4} y2={bandY + 30} className="nod__threshold" />
        <text x={scale(50)} y={bandY + 44} className="nod__s nod__c">incident threshold 50</text>
        {shownScore !== undefined ? (
          <g>
            <path d={`M${scale(shownScore) - 6},${bandY + 40} L${scale(shownScore)},${bandY + 28} L${scale(shownScore) + 6},${bandY + 40} z`} className="nod__marker" />
            <text x={Math.min(scale(shownScore), W - 40)} y={bandY + 56} className="nod__t nod__c">score {shownScore}</text>
          </g>
        ) : null}
      </svg>
      <figcaption className="nod__caption">
        <span>
          {caption ??
            "Several independent warnings from different systems add up; one system on its own can never go above elevated."}
        </span>{" "}
        {schematic ? null : <ProvenanceBadge provenance={provenance} />}
      </figcaption>
      <details className="details nod__alt">
        <summary className="details__summary">Text version of this diagram</summary>
        <div className="details__body">
          <p>{textAlt}</p>
          {schematic ? null : (
            <ol className="plain-list">
              {witnesses!.map((w) => (
                <li key={w.id}>
                  {w.label} ({w.source}): robust z {sgn(w.z)}, weight {f2(w.weight)}, p = {f2(w.weight)} × min(1, {Math.abs(w.z).toFixed(2)} ÷ 4) = {f2(w.p)}
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>
    </figure>
  );
}

export default NoisyOrDiagram;
