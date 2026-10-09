import type { Provenance } from "@/lib/api/types";
import { Caption, ProvenanceBadge } from "./Caption";

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

export function ChartFrame({ title, meaning, implication, provenance, children, height = 240, actions }: ChartFrameProps) {
  return (
    <figure className="chart-frame" style={{ margin: 0 }}>
      <div className="chart-frame__head">
        <figcaption className="chart-frame__title">{title}</figcaption>
        <div className="row">
          {actions}
          <ProvenanceBadge provenance={provenance} />
        </div>
      </div>
      <div style={{ height, width: "100%" }}>{children}</div>
      <Caption meaning={meaning} implication={implication} />
    </figure>
  );
}
