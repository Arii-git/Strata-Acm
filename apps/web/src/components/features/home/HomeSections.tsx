"use client";

import { useMemo } from "react";
import Link from "next/link";
import { IconArrowRight, IconChevronRight } from "@tabler/icons-react";
import type { EChartsOption } from "echarts";
import { ChartFrame, EChart, EmptyState, ErrorState, Metric, MetricGroup, ProvenanceBadge, SeverityPill, baselineMarkLine, chartColor } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import { fmtAgo, fmtDate, fmtINR, fmtNum, fmtPct } from "@/lib/format";
import { Reveal } from "./motion";
import { numberById, type Digest, type DigestNumber, type DigestSeries } from "./types";

/* ------------------------------------------------------------------ shared bits */

export function fmtValue(n: Pick<DigestNumber, "value" | "unit">): string {
  return n.unit === "INR" ? fmtINR(n.value) : fmtNum(n.value);
}

function SectionHead({ id, kicker, title, right }: { id: string; kicker?: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="home-sec__head">
      <div>
        {kicker ? <p className="home-sec__kicker">{kicker}</p> : null}
        <h2 id={id} className="home-sec__title">{title}</h2>
      </div>
      {right ? <div className="home-sec__right">{right}</div> : null}
    </header>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="home-seeall">
      {label} <IconArrowRight size={16} stroke={1.5} aria-hidden="true" />
    </Link>
  );
}

function windowLabel(d: Digest): string {
  return `${fmtDate(d.window.start, true)} to ${fmtDate(d.window.end, true)}, simulated time`;
}

/** A quiet row of small computed counts: one provenance badge for the row, each count's meaning on hover and for screen readers. */
function StatRow({ items }: { items: DigestNumber[] }) {
  if (!items.length) return null;
  return (
    <div className="home-stats-wrap">
      <dl className="home-stats">
        {items.map((n) => (
          <div key={n.id} className="home-stat" title={n.meaning}>
            <dt className="home-stat__label">{n.label}</dt>
            <dd className="home-stat__value num">
              {n.href ? <Link href={n.href}>{fmtValue(n)}</Link> : fmtValue(n)}
              <span className="sr-only">. {n.meaning}</span>
            </dd>
          </div>
        ))}
      </dl>
      <ProvenanceBadge provenance={items[0].provenance} />
    </div>
  );
}

function Highlights({ d, max = 3 }: { d: Digest; max?: number }) {
  if (!d.highlights.length) return <p className="home-quiet">Nothing stood out in this period.</p>;
  return (
    <ul className="home-highlights">
      {d.highlights.slice(0, max).map((h, i) => (
        <li key={`${h.href}-${i}`} className="home-highlight">
          <Link href={h.href} className="home-highlight__link">
            <span className="home-highlight__text">{h.text}</span>
            {h.severity ? <SeverityPill severity={h.severity} /> : null}
            <IconChevronRight size={16} stroke={1.5} aria-hidden="true" className="home-highlight__go" />
          </Link>
          {h.evidence_ids.length ? (
            <span className="home-highlight__ev mono" title="Evidence IDs behind this line">{h.evidence_ids.slice(0, 2).join(" · ")}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface Loadable { data: Digest | null; error: Error | null; loading: boolean; reload: () => void }

function SectionBody({ st, children }: { st: Loadable; children: (d: Digest) => React.ReactNode }) {
  if (st.loading && !st.data) return <StrataLoader size="sm" label="Reading the record" />;
  if (st.error) return <ErrorState error={st.error} onRetry={st.reload} title="Could not load this part" />;
  if (!st.data) return <EmptyState title="Nothing to show" />;
  return <>{children(st.data)}</>;
}

/* ------------------------------------------------------------------ Yesterday / Last 7 days */

export function PeriodSection({ id, title, st, statIds, seeAll }: {
  id: string; title: string; st: Loadable; statIds: string[]; seeAll: { href: string; label: string };
}) {
  const titleId = `${id}-title`;
  return (
    <Reveal id={id} labelledBy={titleId} className="home-sec">
      <SectionHead id={titleId} title={title} kicker={st.data ? windowLabel(st.data) : undefined} right={<SeeAll {...seeAll} />} />
      <SectionBody st={st}>
        {(d) => (
          <>
            <p className="home-sec__lead">{d.headline}</p>
            <StatRow items={statIds.map((k) => numberById(d, k)).filter((n): n is DigestNumber => !!n)} />
            <Highlights d={d} />
          </>
        )}
      </SectionBody>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ Pipeline */

export function PipelineSection({ st }: { st: Loadable }) {
  return (
    <Reveal id="home-pipeline" labelledBy="home-pipeline-title" className="home-sec">
      <SectionHead id="home-pipeline-title" kicker="Where every case is in the loop" title="Your pipeline" right={<SeeAll href="/app/problems" label="Open the Problems board" />} />
      <SectionBody st={st}>
        {(d) => {
          const total = d.pipeline.reduce((s, p) => s + p.count, 0);
          return (
            <>
              <ol className="home-flow" aria-label={`Cases by stage, ${fmtNum(total)} in total`}>
                {d.pipeline.map((p, i) => (
                  <li key={p.stage} className={`home-flow__item${p.count === 0 ? " is-zero" : ""}`}>
                    <Link href={p.href} className="home-flow__stage" title={p.meaning}>
                      <span className="home-flow__step" aria-hidden="true">{i + 1}</span>
                      <span className="home-flow__count num">{fmtNum(p.count)}</span>
                      <span className="home-flow__label">{p.label}</span>
                      <span className="sr-only">. {p.meaning}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="caption home-flow__caption">
                <ProvenanceBadge provenance="computed" /> Cases visible to your role, counted by stage. A stage opens its page.
              </p>
            </>
          );
        }}
      </SectionBody>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ Trends */

const shortDay = (iso: string) => fmtDate(iso).replace(/ \d{4}$/, "");

function orderOption(s: DigestSeries): EChartsOption {
  const vals = s.points.map((p) => p[1]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return {
    grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: "category", name: "Day", data: s.points.map((p) => shortDay(p[0])) },
    yAxis: { type: "value", axisLabel: { formatter: (v: number) => fmtINR(v, { digits: 0 }) } },
    tooltip: { trigger: "axis", valueFormatter: (v) => fmtINR(Number(v)) },
    series: [{
      type: "bar", name: s.name, data: vals, itemStyle: { color: chartColor(1) },
      markLine: baselineMarkLine(avg, `14-day average ${fmtINR(avg)}`),
    }],
  };
}

function serviceOption(tickets: DigestSeries, complaints: DigestSeries | undefined): EChartsOption {
  const line = (s: DigestSeries, color: string) => ({
    type: "line" as const, name: s.name.replace(" per day", ""), data: s.points.map((p) => p[1]), showSymbol: false,
    lineStyle: { color, width: 2 }, itemStyle: { color },
    endLabel: { show: true, formatter: "{a}", color: "var(--ink-2)", fontSize: "var(--fs-11)" },
  });
  return {
    grid: { left: 8, right: 96, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: "category", name: "Day", data: tickets.points.map((p) => shortDay(p[0])), boundaryGap: false },
    yAxis: { type: "value" },
    series: [line(tickets, chartColor(1)), ...(complaints ? [line(complaints, chartColor(2))] : [])],
  };
}

export function TrendsSection({ st }: { st: Loadable }) {
  return (
    <Reveal id="home-trends" labelledBy="home-trends-title" className="home-sec">
      <SectionHead id="home-trends-title" kicker="The last 14 full days" title="Trends" right={<SeeAll href="/app/health" label="Open Health" />} />
      <SectionBody st={st}>
        {(d) => {
          const orders = d.series.find((s) => s.key === "order_value");
          const tickets = d.series.find((s) => s.key === "tickets");
          const complaints = d.series.find((s) => s.key === "complaints");
          return (
            <div className="home-trends">
              {orders ? (
                <ChartFrame title="Order value per day" provenance={orders.provenance} height={220}
                  meaning={orders.meaning}
                  implication="Days at zero are days with no orders in the feed. A run of short bars is worth a look.">
                  <TrendChart option={orderOption(orders)} />
                </ChartFrame>
              ) : null}
              {tickets ? (
                <ChartFrame title="Support tickets and complaints per day" provenance={tickets.provenance} height={220}
                  meaning="Tickets and complaints opened each day, all accounts."
                  implication="Complaints climbing while tickets stay flat often points at a product or supply issue.">
                  <TrendChart option={serviceOption(tickets, complaints)} />
                </ChartFrame>
              ) : null}
            </div>
          );
        }}
      </SectionBody>
    </Reveal>
  );
}

function TrendChart({ option }: { option: EChartsOption }) {
  // keep the option identity stable between renders so ECharts does not redraw on every parent render
  const key = JSON.stringify(option, (_k, v) => (typeof v === "function" ? String(v) : v));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => option, [key]);
  return <EChart option={stable} />;
}

/* ------------------------------------------------------------------ Numbers that matter */

function deltaOf(n: DigestNumber | undefined): string | undefined {
  if (!n || n.previous === null || n.previous === undefined || n.previous === 0) return undefined;
  return fmtPct(n.value / n.previous - 1);
}
function toneOf(n: DigestNumber | undefined, goodWhenUp: boolean): "up" | "down" | "neutral" {
  if (!n || !n.previous) return "neutral";
  if (n.value === n.previous) return "neutral";
  return (n.value > n.previous) === goodWhenUp ? "up" : "down";
}

export function NumbersSection({ st }: { st: Loadable }) {
  return (
    <Reveal id="home-numbers" labelledBy="home-numbers-title" className="home-sec">
      <SectionHead id="home-numbers-title" kicker="Last 7 days against the 7 before" title="Numbers that matter" right={<SeeAll href="/app/health" label="See all health numbers" />} />
      <SectionBody st={st}>
        {(d) => {
          const ov = numberById(d, "order_value");
          const tk = numberById(d, "tickets_opened");
          const cp = numberById(d, "complaints_opened");
          if (!ov && !tk && !cp) return <EmptyState title="No weekly numbers yet" />;
          return (
            <MetricGroup title="This week">
              {ov ? (
                <Metric label={ov.label} value={fmtINR(ov.value)} provenance={ov.provenance}
                  delta={deltaOf(ov)} deltaTone={toneOf(ov, true)}
                  compare={ov.previous ? `vs ${fmtINR(ov.previous)} the week before` : undefined}
                  meaning={ov.meaning} implication="A steady fall across several days matters more than one quiet day."
                  next={{ label: "Open Health", href: "/app/health" }} />
              ) : null}
              {tk ? (
                <Metric label={tk.label} value={fmtNum(tk.value)} unit="tickets" provenance={tk.provenance}
                  delta={deltaOf(tk)} deltaTone={toneOf(tk, false)}
                  compare={tk.previous !== null && tk.previous !== undefined ? `vs ${fmtNum(tk.previous)} the week before` : undefined}
                  meaning={tk.meaning} implication="More tickets with the same team means slower replies."
                  next={{ label: "Open Health", href: "/app/health" }} />
              ) : null}
              {cp ? (
                <Metric label={cp.label} value={fmtNum(cp.value)} unit="complaints" provenance={cp.provenance}
                  delta={deltaOf(cp)} deltaTone={toneOf(cp, false)}
                  compare={cp.previous !== null && cp.previous !== undefined ? `vs ${fmtNum(cp.previous)} the week before` : undefined}
                  meaning={cp.meaning} implication="Complaints are an early sign; STRATA checks them against orders and stock."
                  next={{ label: "Open the Problems board", href: "/app/problems" }} />
              ) : null}
            </MetricGroup>
          );
        }}
      </SectionBody>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ Look what you missed */

export function MissedSection({ st, firstVisit }: { st: Loadable; firstVisit: boolean }) {
  return (
    <Reveal id="home-missed" labelledBy="home-missed-title" className="home-sec">
      <SectionHead id="home-missed-title" title="Look what you missed"
        kicker={st.data ? (firstVisit ? "In the last 24 hours" : `Since your last visit, ${fmtAgo(st.data.since)}`) : undefined}
        right={<SeeAll href="/app/audit" label="Full activity log" />} />
      <SectionBody st={st}>
        {(d) => d.missed.length === 0 ? (
          <p className="home-quiet">Nothing new since you were last here.</p>
        ) : (
          <>
            <ol className="home-timeline">
              {d.missed.slice(0, 5).map((m) => (
                <li key={m.id} className="home-timeline__item">
                  <span className="home-timeline__dot" aria-hidden="true" />
                  <div className="home-timeline__body">
                    <span className="home-timeline__meta">{m.label} · <time dateTime={m.at}>{fmtAgo(m.at)}</time></span>
                    <Link href={m.href} className="home-timeline__text">{m.text}</Link>
                  </div>
                </li>
              ))}
            </ol>
            {d.missed_total > 5 ? (
              <p className="caption"><ProvenanceBadge provenance="computed" /> {fmtNum(d.missed_total - 5)} more in the activity log.</p>
            ) : null}
          </>
        )}
      </SectionBody>
    </Reveal>
  );
}
