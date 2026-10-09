"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { IconChartBar, IconTable } from "@tabler/icons-react";
import type { EChartsOption } from "echarts";
import type { Provenance } from "@/lib/api/types";
import { Caption, ProvenanceBadge } from "./Caption";
import { ChartA11yContext, chartOptionToTable, type ChartTable } from "./echarts";

export interface ChartFrameProps {
  title: string;
  meaning: string;
  implication: string;
  provenance: Provenance;
  children: React.ReactNode;
  /** px height of the chart area (default 240) */
  height?: number;
  actions?: React.ReactNode;
}

/**
 * Every chart sits in a ChartFrame: title, provenance badge, the chart, and the meaning/implication caption.
 * Accessibility: the chart is described by the caption (aria-describedby), and "View as table" swaps the
 * chart for a plain data table derived from the <EChart> option inside it.
 */
export function ChartFrame({ title, meaning, implication, provenance, children, height = 240, actions }: ChartFrameProps) {
  const uid = useId();
  const capId = `${uid}-caption`;
  const tableId = `${uid}-table`;
  const [asTable, setAsTable] = useState(false);
  const [table, setTable] = useState<ChartTable | null>(null);
  const lastKey = useRef("");

  const report = useCallback((option: EChartsOption) => {
    const t = chartOptionToTable(option);
    const key = JSON.stringify(t);
    if (key !== lastKey.current) {
      lastKey.current = key;
      setTable(t);
    }
  }, []);
  const ctx = useMemo(() => ({ describedBy: capId, label: title, report }), [capId, title, report]);

  return (
    <figure className="chart-frame" style={{ margin: 0 }}>
      <div className="chart-frame__head">
        <figcaption className="chart-frame__title">{title}</figcaption>
        <div className="row">
          {actions}
          <button
            type="button"
            className="btn btn--ghost btn--sm chart-frame__toggle"
            aria-expanded={asTable}
            aria-controls={tableId}
            onClick={() => setAsTable((v) => !v)}
            data-testid="chart-table-toggle"
          >
            {asTable ? <IconChartBar size={16} stroke={1.5} aria-hidden="true" /> : <IconTable size={16} stroke={1.5} aria-hidden="true" />}
            {asTable ? "View as chart" : "View as table"}
            <span className="sr-only">: {title}</span>
          </button>
          <ProvenanceBadge provenance={provenance} />
        </div>
      </div>
      <ChartA11yContext.Provider value={ctx}>
        <div className="chart-frame__plot" style={{ height, width: "100%" }} hidden={asTable}>{children}</div>
      </ChartA11yContext.Provider>
      <div id={tableId} hidden={!asTable}>
        {asTable ? (
          table && table.rows.length ? (
            <div className="chart-table" style={{ maxHeight: Math.max(height, 240) }} tabIndex={0} role="region" aria-label={`${title}: data table`}>
              <table>
                <caption className="sr-only">{title}: the data behind the chart</caption>
                <thead>
                  <tr>{table.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (ci === 0 ? <th key={ci} scope="row">{c}</th> : <td key={ci} className="is-num">{c}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="caption" role="status">Table not available for this chart. The caption below describes what it shows.</p>
          )
        ) : null}
      </div>
      <Caption id={capId} meaning={meaning} implication={implication} />
    </figure>
  );
}
