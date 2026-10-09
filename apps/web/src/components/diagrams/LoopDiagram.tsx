"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import {
  IconBooks, IconChecklist, IconListSearch, IconPlugConnected, IconRadar, IconTargetArrow, type Icon,
} from "@tabler/icons-react";

/** The STRATA loop: Observe → Detect → Investigate → Remember → Act → Learn. Each stage links to its page. */
export const LOOP_STAGES: { key: string; label: string; line: string; href: string; icon: Icon; alt: string }[] = [
  { key: "observe", label: "Observe", line: "Read the data feeds", href: "/app/sources", icon: IconPlugConnected, alt: "STRATA reads orders, support, CRM, stock, field and finance data and checks it is fresh." },
  { key: "detect", label: "Detect", line: "Flag unusual change", href: "/app/problems", icon: IconRadar, alt: "It compares each number with the customer's own normal and flags problems seen in several systems at once." },
  { key: "investigate", label: "Investigate", line: "Find the likely cause", href: "/app/incidents", icon: IconListSearch, alt: "Agents rank possible causes and cite the evidence for each." },
  { key: "remember", label: "Remember", line: "Recall similar cases", href: "/app/memory", icon: IconBooks, alt: "It looks up similar past cases and procedures in organizational memory." },
  { key: "act", label: "Act", line: "Plan; you approve", href: "/app/approvals", icon: IconChecklist, alt: "It drafts a plan; nothing runs until a person approves it." },
  { key: "learn", label: "Learn", line: "Record what worked", href: "/app/outcomes", icon: IconTargetArrow, alt: "The result is recorded and written back into memory for the next case." },
];

const W = 760;
const H = 330;
const CX = W / 2;
const CY = 168;
const RX = 270;
const RY = 112;
const BW = 190;
const BH = 64;
// clockwise from upper-left
const ANGLES = [-150, -90, -30, 30, 90, 150];

function pos(i: number) {
  const a = (ANGLES[i] * Math.PI) / 180;
  return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
}

/** Shorten the centre-to-centre segment so it starts and ends at the box edges (plus a gap). */
function edge(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const hw = BW / 2 + 6;
  const hh = BH / 2 + 6;
  const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  return { x1: from.x + dx * t, y1: from.y + dy * t, x2: to.x - dx * t, y2: to.y - dy * t };
}

export function LoopDiagram({ caption = true }: { caption?: boolean }) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const titleId = `loop-title-${uid}`;
  const descId = `loop-desc-${uid}`;
  const arrowId = `loop-arrow-${uid}`;
  const pts = LOOP_STAGES.map((_, i) => pos(i));

  return (
    <figure className="diagram diagram--loop" data-testid="diagram-loop">
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram__svg" role="group" aria-labelledby={titleId} aria-describedby={descId}>
        <title id={titleId}>The STRATA loop: six stages, each a link to its page</title>
        <desc id={descId}>{LOOP_STAGES.map((s, i) => `${i + 1}. ${s.label}: ${s.alt}`).join(" ")} Then the loop starts again.</desc>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--ink-3)" }} />
          </marker>
        </defs>

        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const e = edge(p, q);
          return (
            <line key={`edge-${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              style={{ stroke: "var(--line-strong)", strokeWidth: 2 }} markerEnd={`url(#${arrowId})`} />
          );
        })}

        <g aria-hidden="true">
          <text x={CX} y={CY - 8} textAnchor="middle" style={{ fill: "var(--ink-2)", fontFamily: "var(--font-brand)", fontWeight: 600, fontSize: 15 }}>One loop, every day</text>
          <text x={CX} y={CY + 16} textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 13 }}>Nothing is acted on without</text>
          <text x={CX} y={CY + 34} textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 13 }}>a person&apos;s approval</text>
        </g>

        {LOOP_STAGES.map((s, i) => {
          const p = pts[i];
          const Ico = s.icon;
          const x = p.x - BW / 2;
          const y = p.y - BH / 2;
          return (
            <a
              key={s.key}
              href={s.href}
              className="diagram__link"
              aria-label={`${i + 1}. ${s.label}: ${s.line}. Opens ${s.href.replace("/app/", "")}.`}
              onClick={(ev) => {
                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
                ev.preventDefault();
                router.push(s.href);
              }}
            >
              <rect x={x} y={y} width={BW} height={BH} rx={6} className="diagram__box"
                style={{ fill: s.key === "act" ? "var(--indigo-50)" : "var(--surface)", stroke: s.key === "act" ? "var(--indigo-600)" : "var(--line-strong)", strokeWidth: 1.5 }} />
              <circle cx={x + 22} cy={p.y} r={14} style={{ fill: "var(--indigo-800)" }} />
              <text x={x + 22} y={p.y + 5} textAnchor="middle" style={{ fill: "var(--ink-inverse)", fontSize: 13, fontWeight: 600 }}>{i + 1}</text>
              <Ico x={x + BW - 28} y={y + 8} size={20} stroke={1.5} style={{ color: "var(--indigo-700)" }} aria-hidden="true" />
              <text x={x + 44} y={p.y - 4} style={{ fill: "var(--ink)", fontFamily: "var(--font-brand)", fontWeight: 600, fontSize: 16 }}>{s.label}</text>
              <text x={x + 44} y={p.y + 16} style={{ fill: "var(--ink-3)", fontSize: 13 }}>{s.line}</text>
            </a>
          );
        })}
      </svg>
      {caption ? (
        <figcaption className="caption diagram__caption">
          How STRATA works, step by step. Click a step to open the page where it happens. Step 5 is the approval gate: STRATA drafts, a person decides.
        </figcaption>
      ) : null}
    </figure>
  );
}
