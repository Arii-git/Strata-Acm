"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption, EChartsType } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <div className="skeleton__row" style={{ height: "100%" }} />,
});

/* ------------------------------------------------------------------ *
 * Colours: write them in options as CSS vars, e.g. "var(--chart-2)".  *
 * EChart resolves every "var(--x)" string from tokens.css at runtime. *
 * Size tokens ("var(--fs-11)") resolve to numbers (px).               *
 * ------------------------------------------------------------------ */

function readVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Token px size as a number, e.g. pxVar("--fs-11", 13) -> 13 (tokens v2). */
function pxVar(name: string, fallback: number): number {
  const n = parseFloat(readVar(name));
  return Number.isFinite(n) ? n : fallback;
}

const VAR_RE = /^var\((--[\w-]+)\)$/;
const PX_RE = /^\d+(\.\d+)?px$/;
function resolveVars<T>(v: T): T {
  if (typeof v === "string") {
    const m = VAR_RE.exec(v);
    if (!m) return v;
    const r = readVar(m[1]);
    if (!r) return v;
    return (PX_RE.test(r) ? parseFloat(r) : r) as T;
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

/** ECharts theme built from tokens.css (+ v2 sizes). No default palette; thin grid; Plex Sans; no legend. */
export function buildChartTheme(): Record<string, unknown> {
  const font = readVar("--font-ui") || "system-ui, sans-serif";
  const axis = readVar("--chart-axis");
  const grid = readVar("--chart-grid");
  const ink = readVar("--ink");
  const fsAxis = pxVar("--fs-11", 13);
  const fsText = pxVar("--fs-12", 14);
  const axisCommon = {
    axisLine: { show: true, lineStyle: { color: grid, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: axis, fontSize: fsAxis, fontFamily: font },
    splitLine: { show: true, lineStyle: { color: grid, width: 1 } },
    nameTextStyle: { color: axis, fontSize: fsAxis, fontFamily: font },
  };
  return {
    color: [1, 2, 3, 4, 5].map((n) => readVar(`--chart-${n}`)),
    backgroundColor: "transparent",
    textStyle: { fontFamily: font, fontSize: fsAxis, color: ink },
    title: { textStyle: { fontFamily: font, fontSize: fsText, color: ink, fontWeight: 600 } },
    legend: { show: false, textStyle: { color: axis, fontSize: fsAxis, fontFamily: font } },
    tooltip: {
      backgroundColor: readVar("--surface"),
      borderColor: readVar("--line-strong"),
      borderWidth: 1,
      textStyle: { color: ink, fontSize: fsText, fontFamily: font },
      extraCssText: `box-shadow:none;border-radius:${readVar("--r-md") || "6px"};`,
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

/* ------------------------------------------------------------------ *
 * Accessible data view: derive a plain table from an option, generic  *
 * over category axes, [x, y] pairs, pie data and dataset.source.      *
 * ------------------------------------------------------------------ */

export interface ChartTable {
  columns: string[];
  rows: string[][];
}

type AnyRec = Record<string, unknown>;
const first = (v: unknown): AnyRec | undefined => (Array.isArray(v) ? (v[0] as AnyRec | undefined) : (v as AnyRec | undefined));
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v ? [v] : []);

function cellText(v: unknown, timeAxis = false): string {
  if (v === null || v === undefined || v === "-") return "";
  if (typeof v === "number") {
    if (timeAxis && v > 1e11) return new Date(v).toISOString().slice(0, 10);
    return Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 100) / 100).toLocaleString("en-IN");
  }
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return cellText(v[v.length - 1], timeAxis);
  if (typeof v === "object") {
    const r = v as AnyRec;
    if ("value" in r) return cellText(r.value, timeAxis);
  }
  return String(v);
}

/** Returns null when the option has no tabular shape we can read honestly. */
export function chartOptionToTable(option: EChartsOption | null | undefined): ChartTable | null {
  if (!option) return null;
  const o = option as AnyRec;
  try {
    // 1. dataset.source
    const ds = first(o.dataset);
    if (ds && Array.isArray(ds.source) && ds.source.length) {
      const src = ds.source as unknown[];
      if (Array.isArray(src[0])) {
        const [head, ...body] = src as unknown[][];
        return { columns: head.map((h) => cellText(h)), rows: body.map((r) => r.map((c) => cellText(c))) };
      }
      if (src[0] && typeof src[0] === "object") {
        const cols = Object.keys(src[0] as AnyRec);
        return { columns: cols, rows: (src as AnyRec[]).map((r) => cols.map((c) => cellText(r[c]))) };
      }
    }

    const series = asArray(o.series).filter((s): s is AnyRec => !!s && typeof s === "object" && Array.isArray((s as AnyRec).data) && ((s as AnyRec).data as unknown[]).length > 0);
    if (!series.length) return null;
    const name = (s: AnyRec, i: number) => (typeof s.name === "string" && s.name ? s.name : series.length === 1 ? "Value" : `Series ${i + 1}`);

    // 2. pie / funnel / named points: [{ name, value }]
    if (series.length === 1 && ["pie", "funnel"].includes(String(series[0].type))) {
      const data = series[0].data as AnyRec[];
      return { columns: ["Category", name(series[0], 0)], rows: data.map((d) => [cellText(d?.name), cellText(d)]) };
    }

    // 3. category axis (x or y, for horizontal bars)
    const xa = first(o.xAxis);
    const ya = first(o.yAxis);
    const catAxis = xa && Array.isArray(xa.data) ? xa : ya && Array.isArray(ya.data) ? ya : undefined;
    if (catAxis) {
      const cats = catAxis.data as unknown[];
      const head = typeof catAxis.name === "string" && catAxis.name ? catAxis.name : "Category";
      return {
        columns: [head, ...series.map(name)],
        rows: cats.map((c, i) => [cellText(c), ...series.map((s) => cellText((s.data as unknown[])[i]))]),
      };
    }

    // 4. [x, y] pairs (time / value x axis): union of x values in first-seen order
    const timeAxis = xa?.type === "time";
    const xs: unknown[] = [];
    const seen = new Map<string, number>();
    const cols: Map<string, string>[] = series.map(() => new Map());
    series.forEach((s, si) => {
      for (const d of s.data as unknown[]) {
        const pair = Array.isArray(d) ? d : d && typeof d === "object" && Array.isArray((d as AnyRec).value) ? ((d as AnyRec).value as unknown[]) : null;
        if (!pair || pair.length < 2) continue;
        const key = cellText(pair[0], timeAxis);
        if (!seen.has(key)) { seen.set(key, xs.length); xs.push(pair[0]); }
        cols[si].set(key, cellText(pair[1]));
      }
    });
    if (!xs.length) {
      // plain value list with no axis labels
      const len = Math.max(...series.map((s) => (s.data as unknown[]).length));
      return {
        columns: ["#", ...series.map(name)],
        rows: Array.from({ length: len }, (_, i) => [String(i + 1), ...series.map((s) => cellText((s.data as unknown[])[i]))]),
      };
    }
    const head = typeof xa?.name === "string" && xa.name ? xa.name : timeAxis ? "Date" : "X";
    return {
      columns: [head, ...series.map(name)],
      rows: xs.map((x) => { const k = cellText(x, timeAxis); return [k, ...cols.map((c) => c.get(k) ?? "")]; }),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * ChartFrame <-> EChart link: ChartFrame provides its caption id      *
 * (aria-describedby), its title (default label) and a reporter that   *
 * receives the option for the "View as table" toggle.                 *
 * ------------------------------------------------------------------ */

export interface ChartA11yContextValue {
  describedBy?: string;
  label?: string;
  report?: (option: EChartsOption) => void;
}
export const ChartA11yContext = createContext<ChartA11yContextValue>({});

export interface EChartProps {
  option: EChartsOption;
  /** CSS height; default fills the parent (ChartFrame sets the height) */
  height?: number | string;
  /** accessible summary of what the chart shows (defaults to the ChartFrame title) */
  ariaLabel?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}

/**
 * Client-only ECharts with the STRATA token theme. Put it inside <ChartFrame>.
 * Mounts only once its box has a size, and resizes whenever the box changes size or becomes
 * visible again (tabs, <details>, drawers, tab switches), so it is never drawn blank.
 */
export function EChart({ option, height = "100%", ariaLabel, onEvents }: EChartProps) {
  const ctx = useContext(ChartA11yContext);
  const wrap = useRef<HTMLDivElement>(null);
  const inst = useRef<EChartsType | null>(null);
  const [shown, setShown] = useState(false);
  const [theme, setTheme] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { setTheme(buildChartTheme()); }, []);
  const opt = useMemo(() => (theme ? withDefaults(option) : null), [option, theme]);

  const report = ctx.report;
  useEffect(() => { report?.(option); }, [option, report]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        setShown(true);
        const i = inst.current;
        if (i && !i.isDisposed()) {
          try { i.resize(); } catch { /* chart mid-dispose */ }
        }
      });
    };
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    // <details> toggling does not always change this box's observed size in every engine
    document.addEventListener("toggle", check, true);
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("toggle", check, true);
      window.removeEventListener("resize", check);
    };
  }, []);

  const label = ariaLabel ?? ctx.label ?? "Chart";
  return (
    <div ref={wrap} role="img" aria-label={label} aria-describedby={ctx.describedBy} style={{ height, width: "100%", minWidth: 0 }}>
      {shown && theme && opt ? (
        <ReactECharts
          option={opt}
          theme={theme}
          notMerge
          lazyUpdate
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "svg" }}
          onEvents={onEvents}
          onChartReady={(i: EChartsType) => {
            inst.current = i;
            requestAnimationFrame(() => { if (!i.isDisposed()) { try { i.resize(); } catch { /* ignore */ } } });
          }}
        />
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
    label: { show: true, position: "insideEndTop" as const, formatter: label, color: "var(--ink-3)", fontSize: "var(--fs-11)" },
    data: [{ yAxis: value }],
  };
}

/** Token colour reference for series, e.g. itemStyle: { color: chartColor(2) } (2 = adverse/crimson). */
export const chartColor = (n: 1 | 2 | 3 | 4 | 5) => `var(--chart-${n})`;
