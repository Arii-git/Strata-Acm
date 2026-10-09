"use client";

import { IconArrowRight } from "@tabler/icons-react";
import { TermHint } from "@/components/ui";
import { fmtDate, fmtNum, humanize } from "@/lib/format";

export interface SignalSeries { labels: string[]; values: number[]; baseline: number }
export interface SignalItem {
  id: string;
  label: string;
  source: string;
  role: string;
  series: SignalSeries | null;
  /** pre-formatted headline, e.g. "−31%" */
  headline?: string;
  /** pre-formatted comparison, e.g. "2,345 vs 3,415 baseline" */
  detail?: string;
}

const W = 260;
const H = 96;
const PAD = { l: 4, r: 4, t: 8, b: 16 };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Normal spread around the account's own baseline, computed from the weeks before the estimated onset
 * (1.4826 × median absolute deviation from baseline ≈ one standard deviation for normal data).
 * Returns null when there are too few pre-onset weeks or no spread — the chart then shows only the dashed baseline.
 */
export function normalSpread(s: SignalSeries, onset: string | null | undefined): number | null {
  const pre = onset ? s.values.filter((_, i) => s.labels[i] < onset) : s.values.slice(0, Math.max(0, s.values.length - 4));
  if (pre.length < 6) return null;
  const mad = median(pre.map((v) => Math.abs(v - s.baseline)));
  return mad > 0 ? 1.4826 * mad : null;
}

function Mini({ item, onset }: { item: SignalItem; onset?: string | null }) {
  const s = item.series!;
  const spread = normalSpread(s, onset);
  const lo = spread != null ? s.baseline - spread : s.baseline;
  const hi = spread != null ? s.baseline + spread : s.baseline;
  const all = [...s.values, lo, hi];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max === min) { max += 1; min -= 1; }
  const padY = (max - min) * 0.08;
  min -= padY; max += padY;
  const n = s.values.length;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const points = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const onsetIdx = onset ? s.labels.findIndex((l) => l >= onset) : -1;
  const recentFrom = onsetIdx > 0 ? onsetIdx : Math.max(0, n - 4);
  const recent = s.values.slice(recentFrom);
  const outside = spread != null ? recent.filter((v) => v < lo || v > hi).length : null;
  const last = s.values[n - 1];
  const alt = `${item.label} (${item.source}), ${n} weeks. Last week ${fmtNum(last, 1)} vs baseline ${fmtNum(s.baseline, 1)}.` +
    (outside != null ? ` ${outside} of the last ${recent.length} weeks are outside the normal band.` : " No normal band: too few weeks before onset to estimate the spread.");
  return (
    <li className="sm__item">
      <div className="sm__head">
        <b>{item.label}</b>
        <span className="chip chip--mono">{item.source}</span>
      </div>
      {item.headline ? <div className="sm__value"><span className="num">{item.headline}</span>{item.detail ? <span className="caption"> {item.detail}</span> : null}</div> : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="sm__svg" role="img" aria-label={alt}>
        <title>{alt}</title>
        {spread != null ? <rect className="sm__band" x={PAD.l} width={W - PAD.l - PAD.r} y={y(hi)} height={Math.max(1, y(lo) - y(hi))} /> : null}
        <line className="sm__baseline" x1={PAD.l} x2={W - PAD.r} y1={y(s.baseline)} y2={y(s.baseline)} />
        {onsetIdx > 0 ? (
          <g>
            <line className="sm__onset" x1={x(onsetIdx)} x2={x(onsetIdx)} y1={PAD.t} y2={H - PAD.b} />
            <text className="sm__axis" x={x(onsetIdx) + 3} y={PAD.t + 8}>onset</text>
          </g>
        ) : null}
        <polyline className="sm__line" points={points} />
        <circle className="sm__dot" cx={x(n - 1)} cy={y(last)} r={3} />
        <text className="sm__axis" x={PAD.l} y={H - 3}>{fmtDate(s.labels[0]).replace(/ \d{4}$/, "")}</text>
        <text className="sm__axis" x={W - PAD.r} y={H - 3} textAnchor="end">{fmtDate(s.labels[n - 1]).replace(/ \d{4}$/, "")}</text>
      </svg>
      <div className="caption">
        {outside != null ? `${outside} of the last ${recent.length} weeks outside the normal band.` : "Dashed line only: too few weeks before onset to estimate a normal band."}
      </div>
    </li>
  );
}

/**
 * One mini line chart per evidence signal with a weekly series, against the account's own baseline
 * (shaded normal band when the spread can be estimated, dashed baseline line always), plus the witness count
 * (independent source systems) and the combined risk score.
 */
export function SignalSmallMultiples({
  items, sources, riskScore, severity, onset,
}: { items: SignalItem[]; sources: string[]; riskScore: number; severity: string; onset?: string | null }) {
  const withSeries = items.filter((i) => i.series && i.series.values.length > 1);
  const without = items.filter((i) => !(i.series && i.series.values.length > 1));
  return (
    <figure className="diagram sm" data-testid="diagram-signals">
      <div className="sm__witness" aria-label="Independent witnesses combine into one risk score">
        <span className="sm__witness-label">{sources.length} independent {sources.length === 1 ? "system" : "systems"} saw something unusual:</span>
        <span className="row" style={{ flexWrap: "wrap", gap: "var(--sp-1)" }}>
          {sources.map((s) => <span key={s} className="chip">{humanize(s)}</span>)}
        </span>
        <IconArrowRight size={16} stroke={1.5} aria-hidden="true" />
        <span className="sm__risk">combined risk <b className="num">{fmtNum(riskScore)}</b> of 100 ({humanize(severity)}) <TermHint term="risk_score" /></span>
      </div>
      {withSeries.length ? (
        <ul className="sm__grid">{withSeries.map((i) => <Mini key={i.id} item={i} onset={onset} />)}</ul>
      ) : <p className="caption">No weekly series are stored for these signals.</p>}
      {without.length ? (
        <p className="caption">No weekly series (see the evidence list below): {without.map((i) => i.label).join(", ")}.</p>
      ) : null}
      <figcaption className="caption">
        Each small chart is one signal&apos;s weekly values (solid line). Dashed line: this account&apos;s own <TermHint term="baseline" label="baseline" />.
        Shaded band: its normal week-to-week spread (1.4826 × median absolute deviation of the weeks before the estimated onset{onset ? `, ${fmtDate(onset)}` : ""}), computed from the series shown.
      </figcaption>
    </figure>
  );
}
