"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { ChartFrame, EChart, chartColor } from "@/components/ui";
import type { KpiKey, Point, SimRun } from "./types";

/** Value of a polyline at x (weeks), linear between points. */
export function valueAt(pts: Point[], x: number): number {
  if (!pts.length) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Points up to x, plus an interpolated head point at x so the line draws smoothly. */
function upTo(pts: Point[], x: number): Point[] {
  const out = pts.filter((p) => p[0] <= x);
  const last = out[out.length - 1];
  if (pts.length && (!last || last[0] < x) && x <= pts[pts.length - 1][0]) out.push([Math.round(x * 1000) / 1000, Math.round(valueAt(pts, x) * 100) / 100]);
  return out;
}

const fmtVal = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));

export function SimChart({ run, kpi, onKpi, tDays }: { run: SimRun; kpi: KpiKey; onKpi: (k: KpiKey) => void; tDays: number }) {
  const meta = run.kpi_meta.find((k) => k.key === kpi) ?? run.kpi_meta[0];
  const x = tDays / 7;
  const H = run.horizon_weeks;
  const tl = run.timeline;

  const option = useMemo<EChartsOption>(() => {
    const marks: { xAxis: number; label: { formatter: string } }[] = [];
    if (tDays >= tl.detect_day_with) marks.push({ xAxis: tl.detect_day_with / 7, label: { formatter: "Detected with STRATA" } });
    if (tDays >= tl.detect_day_without) marks.push({ xAxis: tl.detect_day_without / 7, label: { formatter: "Noticed without" } });
    const endLabel = (color: string) => ({ show: true, formatter: "{a}", color, fontSize: "var(--fs-11)", distance: 6 });
    return {
      animation: false,
      grid: { left: 8, right: 132, top: 28, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => (typeof v === "number" ? `${fmtVal(v)} ${meta.unit}` : String(v)) },
      xAxis: {
        type: "value", name: "Week", min: 0, max: H, interval: H > 16 ? 4 : 2,
        nameLocation: "end", nameGap: 8,
        axisLabel: { formatter: (v: number) => (v === 0 ? "Start" : `W${v}`) },
      },
      yAxis: { type: "value", scale: true, name: meta.unit, nameGap: 12, axisLabel: { formatter: (v: number) => fmtVal(v) } },
      series: [
        {
          name: "Normal (no incident)", type: "line", data: run.series.baseline[kpi], symbol: "none", silent: true,
          lineStyle: { type: "dashed", width: 1, color: "var(--ink-3)" }, itemStyle: { color: "var(--ink-3)" },
          endLabel: endLabel("var(--ink-3)"),
        },
        {
          name: "Without STRATA", type: "line", data: upTo(run.series.without_strata[kpi], x), symbol: "none",
          lineStyle: { width: 2, color: chartColor(2) }, itemStyle: { color: chartColor(2) },
          endLabel: endLabel("var(--crimson-700)"),
        },
        {
          name: "With STRATA", type: "line", data: upTo(run.series.with_strata[kpi], x), symbol: "none",
          lineStyle: { width: 3, color: chartColor(1) }, itemStyle: { color: chartColor(1) },
          endLabel: endLabel("var(--indigo-700)"),
          markLine: marks.length ? {
            silent: true, symbol: "none",
            lineStyle: { type: "dotted", width: 1, color: "var(--ink-3)" },
            label: { position: "insideEndTop", color: "var(--ink-2)", fontSize: "var(--fs-11)" },
            data: marks,
          } : undefined,
        },
      ],
    };
  }, [run, kpi, x, H, meta.unit, tDays, tl.detect_day_with, tl.detect_day_without]);

  const without = valueAt(run.series.without_strata[kpi], Math.min(x, H));
  const withS = valueAt(run.series.with_strata[kpi], Math.min(x, H));
  return (
    <ChartFrame
      title={`${meta.label}: three paths`}
      meaning={`Weekly ${meta.label.toLowerCase()} on three paths: normal (dashed), without STRATA (late detection, slow manual response) and with STRATA (early detection, gated plan). Daily points for the first three weeks.`}
      implication={x > 0.6 ? `Now: ${fmtVal(withS)} with STRATA vs ${fmtVal(without)} without (${meta.unit}). Scripted counterfactual from declared scenario parameters, not a measured result.` : "Scripted counterfactual from declared scenario parameters, not a measured result."}
      provenance="illustrative"
      height={300}
      actions={
        <div className="seg lab-kpi-seg" role="group" aria-label="Measure shown">
          {run.kpi_meta.map((k) => (
            <button key={k.key} type="button" className={`seg__btn${k.key === kpi ? " is-on" : ""}`} aria-pressed={k.key === kpi} onClick={() => onKpi(k.key)}>
              {k.label.replace(" (OTIF)", "")}
            </button>
          ))}
        </div>
      }
    >
      <EChart option={option} ariaLabel={`${meta.label} over ${H} weeks: normal, without STRATA and with STRATA`} />
    </ChartFrame>
  );
}
