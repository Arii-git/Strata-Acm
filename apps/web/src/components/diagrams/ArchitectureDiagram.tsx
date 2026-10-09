import { useId } from "react";

/**
 * What is built, left to right: Sources → Data & intelligence → AI reasoning → Application.
 * Planned (not built) parts are drawn dashed and labelled "planned". Colours from tokens only.
 */
interface Box { label: string; sub?: string; planned?: boolean }
interface Column { title: string; note: string; boxes: Box[] }

const COLUMNS: Column[] = [
  { title: "Sources", note: "synthetic data", boxes: [
    { label: "Orders" }, { label: "Support tickets" }, { label: "CRM visits and calls" }, { label: "Inventory" },
    { label: "Workforce" }, { label: "Finance" }, { label: "Documents and SOPs" },
  ] },
  { title: "Data & intelligence", note: "runs on this machine", boxes: [
    { label: "File store + SQLite", sub: "seeded data and case state" },
    { label: "Signal engine", sub: "each number vs its own normal" },
    { label: "Memory search", sub: "TF-IDF, no external key" },
    { label: "Hash-chained audit log", sub: "tamper-evident history" },
    { label: "PostgreSQL + pgvector", sub: "planned", planned: true },
    { label: "Embeddings API", sub: "planned", planned: true },
  ] },
  { title: "AI reasoning", note: "explicit state machine", boxes: [
    { label: "Sentinel", sub: "groups signals into a case" },
    { label: "Investigator", sub: "ranks causes with evidence" },
    { label: "Memory", sub: "finds similar past cases" },
    { label: "Orchestrator", sub: "drafts the plan" },
    { label: "Evidence-or-Silence check", sub: "drops any uncited sentence" },
    { label: "Human approval gate", sub: "nothing runs until approved" },
    { label: "LLM adapter", sub: "planned; template text today", planned: true },
  ] },
  { title: "Application", note: "this console", boxes: [
    { label: "Problems, cases, approvals", sub: "what you are using now" },
    { label: "Tasks and drafts", sub: "simulated; nothing is sent" },
    { label: "Outcomes into memory", sub: "the loop closes" },
  ] },
];

const W = 1000;
const H = 520;
const COL_W = 220;
const GAP = (W - 20 - COL_W * 4) / 3;
const TOP = 40;
const PANEL_H = 420;
const BOX_H = 44;
const BOX_GAP = 6;

export function ArchitectureDiagram() {
  const uid = useId().replace(/:/g, "");
  const titleId = `arch-title-${uid}`;
  const descId = `arch-desc-${uid}`;
  const arrowId = `arch-arrow-${uid}`;
  const colX = (i: number) => 10 + i * (COL_W + GAP);
  const text = COLUMNS.map((c) => `${c.title} (${c.note}): ${c.boxes.map((b) => (b.planned ? `${b.label} (planned, not built)` : b.label)).join(", ")}.`).join(" ");

  return (
    <figure className="diagram diagram--architecture" data-testid="diagram-architecture">
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram__svg" role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>STRATA architecture: what is built and what is planned</title>
        <desc id={descId}>{`Data flows left to right. ${text} Dashed boxes are planned and not built.`}</desc>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--ink-3)" }} />
          </marker>
        </defs>

        {COLUMNS.map((c, ci) => {
          const x = colX(ci);
          return (
            <g key={c.title}>
              <rect x={x} y={TOP} width={COL_W} height={PANEL_H} rx={8} style={{ fill: "var(--surface-2)", stroke: "var(--line)", strokeWidth: 1 }} />
              <text x={x + 14} y={TOP + 26} style={{ fill: "var(--ink)", fontFamily: "var(--font-brand)", fontWeight: 600, fontSize: 16 }}>{c.title}</text>
              <text x={x + 14} y={TOP + 46} style={{ fill: "var(--ink-3)", fontSize: 13 }}>{c.note}</text>
              {c.boxes.map((b, bi) => {
                const by = TOP + 60 + bi * (BOX_H + BOX_GAP);
                const compact = ci === 0;
                const h = compact ? 40 : BOX_H;
                const yy = compact ? TOP + 60 + bi * (40 + 8) : by;
                return (
                  <g key={b.label}>
                    <rect x={x + 10} y={yy} width={COL_W - 20} height={h} rx={6}
                      style={{
                        fill: b.planned ? "var(--surface)" : b.label === "Human approval gate" ? "var(--indigo-50)" : "var(--surface)",
                        stroke: b.planned ? "var(--ink-3)" : b.label === "Human approval gate" ? "var(--indigo-600)" : "var(--line-strong)",
                        strokeWidth: 1.25,
                        strokeDasharray: b.planned ? "6 4" : undefined,
                      }} />
                    <text x={x + 22} y={b.sub ? yy + 18 : yy + h / 2 + 5} style={{ fill: b.planned ? "var(--ink-2)" : "var(--ink)", fontWeight: 600, fontSize: 13.5 }}>{b.label}</text>
                    {b.sub ? <text x={x + 22} y={yy + 35} style={{ fill: "var(--ink-3)", fontSize: 12, fontStyle: b.planned ? "italic" : undefined }}>{b.sub}</text> : null}
                  </g>
                );
              })}
            </g>
          );
        })}

        {[0, 1, 2].map((i) => {
          const x1 = colX(i) + COL_W + 4;
          const x2 = colX(i + 1) - 4;
          const y = TOP + PANEL_H / 2;
          return <line key={`a-${i}`} x1={x1} y1={y} x2={x2} y2={y} style={{ stroke: "var(--ink-3)", strokeWidth: 2 }} markerEnd={`url(#${arrowId})`} />;
        })}

        <g aria-hidden="true">
          <rect x={10} y={TOP + PANEL_H + 22} width={28} height={16} rx={3} style={{ fill: "var(--surface)", stroke: "var(--line-strong)", strokeWidth: 1.25 }} />
          <text x={46} y={TOP + PANEL_H + 35} style={{ fill: "var(--ink-2)", fontSize: 13 }}>Built and running in this prototype</text>
          <rect x={330} y={TOP + PANEL_H + 22} width={28} height={16} rx={3} style={{ fill: "var(--surface)", stroke: "var(--ink-3)", strokeWidth: 1.25, strokeDasharray: "6 4" }} />
          <text x={366} y={TOP + PANEL_H + 35} style={{ fill: "var(--ink-2)", fontSize: 13 }}>Planned, not built</text>
        </g>
      </svg>
      <figcaption className="caption diagram__caption">
        Data moves left to right. Everything solid runs on this machine with synthetic data and no external keys; dashed boxes are planned and not built.
      </figcaption>
    </figure>
  );
}
