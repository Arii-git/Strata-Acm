"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { ReactFlow, Position, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChartFrame } from "@/components/ui";
import { humanize } from "@/lib/format";
import { fmtEvidenceValue, isNotInvestigated, type WbIncident } from "./shared";

const SOURCE_ORDER = ["orders", "support", "crm", "inventory", "finance"];
const COL_X = [0, 230, 520, 790];
const ROW_H = 74;
const NODE_W = 200;

const baseNode: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  padding: "var(--sp-2) var(--sp-3)",
  width: NODE_W,
  fontSize: "var(--fs-12)",
  color: "var(--ink)",
  textAlign: "left",
  boxShadow: "none",
};

function card(title: ReactNode, sub?: ReactNode): ReactNode {
  return (
    <div>
      <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{title}</div>
      {sub ? <div style={{ color: "var(--ink-2)", fontSize: "var(--fs-11)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

export function CausalMap({ incident }: { incident: WbIncident }) {
  const { nodes, edges, height } = useMemo(() => {
    const ev = incident.evidence;
    const present = new Set([...incident.sources, ...ev.map((e) => e.source)]);
    const sources = [...SOURCE_ORDER.filter((s) => present.has(s)), ...[...present].filter((s) => !SOURCE_ORDER.includes(s))];
    const rows = Math.max(ev.length, sources.length, 1);
    const totalH = rows * ROW_H;
    const centerY = (n: number, i: number) => (totalH - n * ROW_H) / 2 + i * ROW_H;

    const common = { draggable: false, selectable: false, connectable: false, sourcePosition: Position.Right, targetPosition: Position.Left };
    const nodes: Node[] = [];
    sources.forEach((s, i) => nodes.push({
      id: `src-${s}`, position: { x: COL_X[0], y: centerY(sources.length, i) }, ...common,
      type: "input", data: { label: card(humanize(s), "source system") }, style: { ...baseNode, background: "var(--surface-2)" },
    }));
    ev.forEach((e, i) => {
      const v = fmtEvidenceValue(e);
      nodes.push({
        id: `ev-${e.id}`, position: { x: COL_X[1], y: centerY(ev.length, i) }, ...common,
        data: { label: card(e.label, `${v.headline} · ${e.role === "context" ? "context" : e.role}`) },
        style: { ...baseNode, borderStyle: e.role === "context" ? "dashed" : "solid", width: 230 },
      });
    });
    const uninvestigated = isNotInvestigated(incident.cause);
    const critical = incident.severity === "critical";
    nodes.push({
      id: "cause", position: { x: COL_X[2] + 30, y: totalH / 2 - 30 }, ...common,
      data: {
        label: card(
          uninvestigated ? "Not yet investigated" : humanize(incident.cause),
          uninvestigated ? "run the investigation to rank causes" : `cause · confidence ${incident.cause_confidence != null ? incident.cause_confidence.toFixed(2) : "-"}`,
        ),
      },
      style: {
        ...baseNode,
        borderColor: critical && !uninvestigated ? "var(--crimson-700)" : "var(--line-strong)",
        borderStyle: uninvestigated ? "dashed" : "solid",
        color: uninvestigated ? "var(--ink-2)" : "var(--ink)",
      },
    });
    const scopeLabel = incident.account_name || `${humanize(incident.scope)} ${incident.region ?? ""}`.trim();
    nodes.push({
      id: "scope", position: { x: COL_X[3], y: totalH / 2 - 30 }, ...common, type: "output",
      data: { label: card(scopeLabel, `${humanize(incident.scope)} · ${incident.region}`) },
      style: baseNode,
    });

    const edgeBase = { type: "smoothstep", pathOptions: { borderRadius: 0 }, style: { stroke: "var(--ink-3)", strokeWidth: 1 } };
    const edges: Edge[] = [];
    ev.forEach((e) => {
      edges.push({ id: `e-src-${e.id}`, source: `src-${e.source}`, target: `ev-${e.id}`, ...edgeBase });
      edges.push({
        id: `e-ev-${e.id}`, source: `ev-${e.id}`, target: "cause", ...edgeBase,
        style: { ...edgeBase.style, strokeDasharray: e.role === "context" || uninvestigated ? "4 3" : undefined },
      });
    });
    edges.push({ id: "e-cause-scope", source: "cause", target: "scope", ...edgeBase, style: { stroke: "var(--ink-2)", strokeWidth: 1.5 } });
    return { nodes, edges, height: Math.max(320, Math.min(640, totalH + 60)) };
  }, [incident]);

  return (
    <ChartFrame
      title="Causal process map"
      meaning="Left to right: source systems, the signals each one produced, the investigated cause, and the account or scope affected."
      implication="Solid links fed the score; dashed links are context or not yet tied to a cause. A cause backed by several independent systems is harder to dismiss."
      provenance="computed"
      height={height}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        aria-label="Causal process map"
      />
    </ChartFrame>
  );
}
