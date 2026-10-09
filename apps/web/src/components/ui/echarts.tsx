"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <div className="skeleton__row" style={{ height: "100%" }} />,
});

/* ------------------------------------------------------------------ *
 * Colours: write them in options as CSS vars, e.g. "var(--chart-2)".  *
 * EChart resolves every "var(--x)" string from tokens.css at runtime. *
 * ------------------------------------------------------------------ */

function readVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const VAR_RE = /^var\((--[\w-]+)\)$/;
function resolveVars<T>(v: T): T {
  if (typeof v === "string") {
    const m = VAR_RE.exec(v);
    return (m ? readVar(m[1]) || v : v) as T;
  }
  if (Array.isArray(v)) return v.map(resolveVars) as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = resolveVars(val);
    return out as T;
  }
  return v;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** ECharts theme built from tokens.css. No default palette; thin grid; Plex Sans 11px; no legend. */
export function buildChartTheme(): Record<string, unknown> {
  const font = readVar("--font-ui") || "system-ui, sans-serif";
  const axis = readVar("--chart-axis");
  const grid = readVar("--chart-grid");
  const ink = readVar("--ink");
  const axisCommon = {
    axisLine: { show: true, lineStyle: { color: grid, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: axis, fontSize: 11, fontFamily: font },
    splitLine: { show: true, lineStyle: { color: grid, width: 1 } },
    nameTextStyle: { color: axis, fontSize: 11, fontFamily: font },
  };
  return {
    color: [1, 2, 3, 4, 5].map((n) => readVar(`--chart-${n}`)),
    backgroundColor: "transparent",
    textStyle: { fontFamily: font, fontSize: 11, color: ink },
    title: { textStyle: { fontFamily: font, fontSize: 12, color: ink, fontWeight: 600 } },
    legend: { show: false, textStyle: { color: axis, fontSize: 11, fontFamily: font } },
    tooltip: {
      backgroundColor: readVar("--surface"),
      borderColor: readVar("--line-strong"),
      borderWidth: 1,
      textStyle: { color: ink, fontSize: 12, fontFamily: font },
      extraCssText: "box-shadow:none;border-radius:6px;",
    },
    categoryAxis: { ...axisCommon, splitLine: { show: false } },
    valueAxis: { ...axisCommon, axisLine: { show: false } },
    timeAxis: { ...axisCommon, splitLine: { show: false } },
    logAxis: axisCommon,
    line: { symbol: "none", lineStyle: { width: 2 }, smooth: false },
    bar: { barMaxWidth: 24, itemStyle: { borderRadius: [2, 2, 0, 0] } },
    gauge: { axisLine: { lineStyle: { color: [[1, grid]] } } },
  };
}

function withDefaults(option: EChartsOption): EChartsOption {
  const reduced = prefersReducedMotion();
  const o: EChartsOption = {
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    legend: { show: false },
    tooltip: { trigger: "axis" },
    ...option,
    animation: reduced ? false : option.animation ?? true,
    animationDuration: reduced ? 0 : 200,
    animationDurationUpdate: reduced ? 0 : 200,
    animationEasing: "cubicOut",
  };
  return resolveVars(o);
}

export interface EChartProps {
  option: EChartsOption;
  /** CSS height; default fills the parent (ChartFrame sets the height) */
  height?: number | string;
  /** accessible summary of what the chart shows */
  ariaLabel?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}

/** Client-only ECharts with the STRATA token theme. Put it inside <ChartFrame>. */
export function EChart({ option, height = "100%", ariaLabel, onEvents }: EChartProps) {
  const [theme, setTheme] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { setTheme(buildChartTheme()); }, []);
  const opt = useMemo(() => (theme ? withDefaults(option) : null), [option, theme]);
  return (
    <div role="img" aria-label={ariaLabel} style={{ height, width: "100%" }}>
      {theme && opt ? (
        <ReactECharts option={opt} theme={theme} notMerge lazyUpdate style={{ height: "100%", width: "100%" }} opts={{ renderer: "svg" }} onEvents={onEvents} />
      ) : null}
    </div>
  );
}

/** Dashed grey baseline for a line/bar series: series: [{ type: "line", data, markLine: baselineMarkLine(b, "Baseline") }] */
export function baselineMarkLine(value: number, label = "Baseline") {
  return {
    silent: true,
    symbol: "none",
    lineStyle: { type: "dashed" as const, color: "var(--ink-3)", width: 1 },
    label: { show: true, position: "insideEndTop" as const, formatter: label, color: "var(--ink-3)", fontSize: 11 },
    data: [{ yAxis: value }],
  };
}

/** Token colour reference for series, e.g. itemStyle: { color: chartColor(2) } (2 = adverse/crimson). */
export const chartColor = (n: 1 | 2 | 3 | 4 | 5) => `var(--chart-${n})`;
