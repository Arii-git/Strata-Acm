"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconPlayerPause, IconPlayerPlay, IconPlayerSkipBack } from "@tabler/icons-react";
import { Button, ErrorState, Metric, MetricGroup, announce } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import { apiPost } from "@/lib/api/client";
import { DecisionCard } from "./DecisionCard";
import { EventFeed } from "./EventFeed";
import { LoopRing } from "./LoopRing";
import { CATEGORY_ICON, INDUSTRY_ICON, LEVEL_LABEL, fmtLag, fmtSimTime, prefersReducedMotion } from "./meta";
import { OutcomePanel } from "./OutcomePanel";
import { RiskMeter } from "./RiskMeter";
import { SimChart, valueAt } from "./SimChart";
import type { DecisionKey, KpiKey, SimRun, StageKey } from "./types";

const DECISIONS: DecisionKey[] = ["approve", "wait", "escalate"];
const SPEEDS = [1, 2, 4] as const;
/** Simulated days per real second at 1x: slow through the first three weeks (day detail), faster after. */
const rate = (day: number) => (day < 21 ? 1.2 : 6);

const fmtVal = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return true;
  if (tag === "INPUT") return (el as HTMLInputElement).type !== "range";
  return el.getAttribute("role") === "tab";
}

export function SimPlayer({ scenarioId, onExit, onCompare }: { scenarioId: string; onExit: () => void; onCompare: (category: string) => void }) {
  const [runs, setRuns] = useState<Partial<Record<DecisionKey, SimRun>> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [decision, setDecision] = useState<DecisionKey | null>(null);
  const [kpi, setKpi] = useState<KpiKey | null>(null);
  const outcomeRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // load all three gate branches up front: before the gate they are identical, so playback can start on any of them
  useEffect(() => {
    let live = true;
    setRuns(null); setError(null); setDecision(null); setKpi(null);
    tRef.current = 0; setT(0); setPlaying(false);
    Promise.all(DECISIONS.map((d) => apiPost<SimRun>("/sim/run", { scenario_id: scenarioId, decision: d })))
      .then((rs) => {
        if (!live) return;
        setRuns({ approve: rs[0], wait: rs[1], escalate: rs[2] });
        if (!prefersReducedMotion()) setPlaying(true);
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e : new Error(String(e))); });
    return () => { live = false; };
  }, [scenarioId, attempt]);

  const run = runs ? runs[decision ?? "approve"] ?? null : null;
  const total = run?.timeline.total_days ?? 1;
  const gateDay = run?.gate.day ?? Infinity;
  const finished = !!run && t >= total - 1e-6;
  const atGate = !!run && !decision && t >= gateDay - 1e-6;

  const seek = useCallback((next: number) => {
    if (!run) return;
    let v = Math.max(0, Math.min(total, next));
    if (!decision && v > gateDay) v = gateDay;
    tRef.current = v; setT(v);
  }, [run, total, decision, gateDay]);

  // playback loop
  useEffect(() => {
    if (!playing || !run) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = tRef.current;
      let next = cur + dt * rate(cur) * speed;
      let stop = false;
      if (!decision && next >= gateDay) { next = gateDay; stop = true; announce("Human gate reached. Choose a decision to continue."); }
      if (next >= total) { next = total; stop = true; }
      tRef.current = next;
      setT(next);
      if (stop) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, run, decision, gateDay, total]);

  // when the run ends, move focus to the outcome
  useEffect(() => {
    if (finished) {
      announce("Simulation finished. Outcome summary below.");
      const id = window.setTimeout(() => outcomeRef.current?.focus({ preventScroll: false }), 60);
      return () => window.clearTimeout(id);
    }
  }, [finished]);

  const togglePlay = useCallback(() => {
    if (!run) return;
    if (atGate) { rootRef.current?.querySelector<HTMLButtonElement>(".lab-opt")?.focus(); return; }
    if (finished) { tRef.current = 0; setT(0); setPlaying(true); return; }
    setPlaying((p) => !p);
  }, [run, atGate, finished]);

  // keyboard: space = play/pause, arrows = scrub (shift = a week)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      const onRange = e.target instanceof HTMLInputElement && e.target.type === "range";
      if (e.key === " " || e.code === "Space") { e.preventDefault(); togglePlay(); return; }
      if (onRange) return; // the range input scrubs natively
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        const step = e.shiftKey ? 7 : 1;
        seek(tRef.current + (e.key === "ArrowRight" ? step : -step));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePlay, seek]);

  const decide = (d: DecisionKey) => {
    setDecision(d);
    announce(`Decision: ${d === "approve" ? "plan approved" : d === "wait" ? "agent decides at deadline" : "escalated"}. Playback continues.`);
    setPlaying(true);
  };
  const changeDecision = () => { setDecision(null); setPlaying(false); tRef.current = gateDay; setT(gateDay); };
  const replay = () => { setDecision(null); tRef.current = 0; setT(0); setPlaying(true); rootRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); };

  // derived view state
  const events = run?.events ?? [];
  const count = useMemo(() => {
    let n = 0;
    while (n < events.length && events[n].day <= t + 1e-9) n++;
    return n;
  }, [events, t]);
  const { stage, visited, level } = useMemo(() => {
    const vis = new Set<StageKey>();
    let st: StageKey | null = null;
    let lv: number | null = null;
    for (let i = 0; i < count; i++) {
      const e = events[i];
      if (e.track === "without") continue;
      vis.add(e.stage);
      st = e.stage;
      if (e.risk_level !== null) lv = e.risk_level;
    }
    return { stage: st, visited: vis, level: lv };
  }, [events, count]);

  // chart time: quarter days early on, whole days later (fewer redraws)
  const tChart = t < 21 ? Math.round(t * 4) / 4 : Math.round(t);

  if (error) return <ErrorState error={error} title="Could not run this scenario" onRetry={() => setAttempt((a) => a + 1)} />;
  if (!run) return <div className="lab-loading"><StrataLoader size="lg" label="Building the scenario" /></div>;

  const sc = run.scenario;
  const shownKpi = kpi ?? run.primary_kpi;
  const prim = run.kpi_meta.find((m) => m.key === run.primary_kpi)!;
  const x = Math.min(t / 7, run.horizon_weeks);
  const vWith = valueAt(run.series.with_strata[run.primary_kpi], x);
  const vWithout = valueAt(run.series.without_strata[run.primary_kpi], x);
  const tl = run.timeline;
  const protectedSoFar = finished
    ? run.kpis.find((k) => k.key === "exposure_protected")?.value ?? 0
    : integrateGap(run, x);
  const IndIcon = INDUSTRY_ICON[sc.industry];
  const CatIcon = CATEGORY_ICON[sc.category];
  const pct = (d: number) => `${Math.min(100, (d / total) * 100)}%`;
  const caption = run.caption;

  return (
    <div className="lab-player" ref={rootRef} data-testid="sim-player">
      <header className="lab-player__head">
        <Button variant="ghost" size="sm" onClick={onExit} icon={<IconChevronLeft size={16} stroke={1.5} aria-hidden="true" />}>All scenarios</Button>
        <div className="lab-player__titles">
          <div className="lab-player__chips">
            <span className="lab-pill">{IndIcon ? <IndIcon size={14} stroke={1.5} aria-hidden="true" /> : null}{sc.industry_label}</span>
            <span className="lab-pill">{CatIcon ? <CatIcon size={14} stroke={1.5} aria-hidden="true" /> : null}{sc.category_label}</span>
            {sc.regulatory ? <span className="lab-pill lab-pill--qa">Route-only to QA</span> : null}
          </div>
          <h2 className="lab-player__title">{sc.title}</h2>
          <p className="lab-player__trigger">{sc.trigger}</p>
        </div>
      </header>

      <div className="lab-controls" role="group" aria-label="Playback">
        <Button variant="primary" size="sm" onClick={togglePlay} aria-pressed={playing}
          icon={playing ? <IconPlayerPause size={16} stroke={1.75} aria-hidden="true" /> : <IconPlayerPlay size={16} stroke={1.75} aria-hidden="true" />}>
          {playing ? "Pause" : finished ? "Replay" : atGate ? "Decide to continue" : "Play"}
        </Button>
        <Button variant="ghost" size="sm" onClick={replay} icon={<IconPlayerSkipBack size={16} stroke={1.5} aria-hidden="true" />}>Restart</Button>
        <div className="seg" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`seg__btn${speed === s ? " is-on" : ""}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>
        <div className="lab-scrub">
          <input type="range" min={0} max={total} step={0.25} value={t} aria-label="Simulated time"
            aria-valuetext={fmtSimTime(t)} onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }} />
          <div className="lab-scrub__marks" aria-hidden="true">
            <span className="lab-scrub__mark lab-scrub__mark--onset" style={{ left: pct(tl.onset_day) }} title="Trigger" />
            <span className="lab-scrub__mark lab-scrub__mark--gate" style={{ left: pct(gateDay) }} title="Human gate" />
            {tl.recovered_day_with !== null ? <span className="lab-scrub__mark lab-scrub__mark--rec" style={{ left: pct(tl.recovered_day_with) }} title="Recovered with STRATA" /> : null}
          </div>
        </div>
        <span className="lab-clock mono" aria-live="off">{fmtSimTime(t)} <span className="muted">/ {run.horizon_weeks} weeks</span></span>
      </div>
      <p className="caption lab-keys">Space plays or pauses. Left and right arrows step a day; with Shift, a week.</p>

      {decision ? (
        <p className="lab-chosen">
          Gate decision: <strong>{run.gate.options.find((o) => o.key === decision)?.label}</strong>
          <button type="button" className="lab-link" onClick={changeDecision}>Change decision</button>
        </p>
      ) : null}

      <div className="lab-stage">
        <div className="lab-stage__side">
          <LoopRing current={stage} visited={visited} time={fmtSimTime(t)}
            note={stage ? undefined : "The loop lights up stage by stage as the run plays."} />
          <RiskMeter level={level} humanThreshold={run.policy.human_threshold} autoMax={run.policy.auto_decide_max_level}
            provisionalMax={run.policy.provisional_max_level} regulatory={sc.regulatory} />
        </div>
        <div className="lab-stage__main">
          {atGate ? <DecisionCard run={run} onDecide={decide} /> : null}
          <MetricGroup title="Right now">
            <Metric label={prim.label} value={fmtVal(vWith)} unit={prim.unit}
              compare={`Without STRATA: ${fmtVal(vWithout)} · normal ${fmtVal(prim.base)}`}
              meaning="On the path with STRATA, at the playhead." implication={caption} provenance="illustrative" />
            <Metric label="Detected"
              value={t >= tl.detect_day_with ? fmtLag(tl.detect_day_with - tl.onset_day) : t >= tl.onset_day ? "Watching" : "No issue yet"}
              unit={t >= tl.detect_day_with ? "after the trigger" : undefined}
              compare={`Without STRATA: ${t >= tl.detect_day_without ? fmtLag(tl.detect_day_without - tl.onset_day) : "not noticed yet"}`}
              meaning="Time from the trigger to the first alert." implication={caption} provenance="illustrative" />
            <Metric label="Order value protected so far" value={`₹${fmtVal(protectedSoFar)}`} unit="lakh"
              compare={level ? `Risk now: L${level} ${LEVEL_LABEL[level]}` : undefined}
              meaning="STRATA path minus late-response path, summed to the playhead." implication={caption} provenance="illustrative" />
          </MetricGroup>
          <SimChart run={run} kpi={shownKpi} onKpi={setKpi} tDays={tChart} />
        </div>
        <div className="lab-stage__feed">
          <EventFeed events={events} count={count} />
        </div>
      </div>

      {finished && decision ? (
        <OutcomePanel ref={outcomeRef} run={run} decision={decision} onReplay={replay} onAnother={onExit} onCompare={() => onCompare(sc.category)} />
      ) : null}
    </div>
  );
}

/** Order value gap (with minus without) integrated over weeks up to x: ₹ lakh. */
function integrateGap(run: SimRun, x: number): number {
  const w = run.series.with_strata.revenue;
  const o = run.series.without_strata.revenue;
  let tot = 0;
  for (let i = 1; i < w.length; i++) {
    const x0 = w[i - 1][0];
    if (x0 >= x) break;
    const x1 = Math.min(w[i][0], x);
    const g0 = w[i - 1][1] - o[i - 1][1];
    const g1 = valueAt(w, x1) - valueAt(o, x1);
    tot += ((g0 + g1) / 2) * (x1 - x0);
  }
  return Math.round(tot * 10) / 10;
}
