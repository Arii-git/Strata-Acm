"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconAlertTriangle, IconArrowRight, IconBooks, IconBulb, IconCheck, IconFlask, IconHourglass, IconLayoutSidebar,
  IconMessageCircle, IconPlayerSkipForward, IconRadar, IconTrophy, IconUserShield, IconArrowUpRight, type Icon,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";

/**
 * A five-level, game-style walkthrough of the real workflow. Every level is a tiny mock of a console screen with
 * one thing to do; doing it earns XP and unlocks the next level. Nothing here touches the engine.
 */

const XP_PER_LEVEL = 20;
const LEVELS = 5;

interface LevelProps { onWin: (note: string) => void }

/* ---------- Level 1: spot the problem on the briefing ---------- */
function SpotTheSignal({ onWin }: LevelProps) {
  const [miss, setMiss] = useState<string | null>(null);
  const rows: { id: string; title: string; level: string; tone: string; win?: boolean; why: string }[] = [
    { id: "a", title: "Price list request from a chemist chain", level: "L1 Low", tone: "healthy", why: "Routine. STRATA files it; nobody needs to drop everything." },
    { id: "b", title: "Orders and fill rate falling at a top stockist", level: "L4 High", tone: "high", win: true, why: "" },
    { id: "c", title: "One late delivery last Tuesday", level: "L2 Moderate", tone: "watch", why: "A single blip. STRATA watches it and only raises it if it repeats." },
  ];
  return (
    <div className="gt-mock">
      <div className="gt-mock__bar"><IconRadar size={16} aria-hidden="true" /> Today&apos;s briefing</div>
      <ul className="gt-rows">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" className={`gt-row${r.win ? " gt-row--hint" : ""}`} onClick={() => (r.win ? onWin("You picked the case that several systems agree on.") : setMiss(r.why))}>
              <span className={`gt-lvl gt-lvl--${r.tone}`}>{r.level}</span>
              <span>{r.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {miss ? <p className="gt-miss" role="status"><IconBulb size={16} aria-hidden="true" /> {miss} Try another.</p> : null}
    </div>
  );
}

/* ---------- Level 2: open all the evidence ---------- */
function ReadTheEvidence({ onWin }: LevelProps) {
  const ev = [
    { id: "orders", label: "Orders", text: "Weekly order value is down 39% against this account's own normal." },
    { id: "stock", label: "Inventory", text: "Fill rate on the main product fell from 96% to 71%." },
    { id: "support", label: "Support", text: "Three complaints in ten days about short supply." },
  ];
  const [open, setOpen] = useState<string[]>([]);
  const won = useRef(false);
  useEffect(() => {
    if (!won.current && open.length === ev.length) { won.current = true; onWin("Three systems agree, so it is a real problem, not noise."); }
  }, [open.length, ev.length, onWin]);
  return (
    <div className="gt-mock">
      <div className="gt-mock__bar"><IconAlertTriangle size={16} aria-hidden="true" /> Case INC-0001 · Evidence <span className="gt-mock__count">{open.length}/{ev.length} opened</span></div>
      <div className="gt-evidence">
        {ev.map((e) => {
          const on = open.includes(e.id);
          return (
            <button key={e.id} type="button" className={`gt-ev${on ? " is-open" : ""}`} aria-expanded={on} onClick={() => setOpen((o) => (o.includes(e.id) ? o : [...o, e.id]))}>
              <strong>{e.label}</strong>
              <span>{on ? e.text : "Tap to open"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Level 3: pick the matching past case ---------- */
function CheckMemory({ onWin }: LevelProps) {
  const [miss, setMiss] = useState(false);
  return (
    <div className="gt-mock">
      <div className="gt-mock__bar"><IconBooks size={16} aria-hidden="true" /> Memory · which past case matches?</div>
      <p className="gt-mock__q">The likely cause is a <strong>supplier delay</strong>. Pick the past case that helps most.</p>
      <div className="gt-choices">
        <button type="button" className="gt-choice" onClick={() => onWin("Reusing what worked last time saves hours of guesswork.")}>
          <strong>INC-017 · Supplier delay at a stockist</strong>
          <span>Reallocated stock, escalated the supplier, called the customer. Customer kept.</span>
        </button>
        <button type="button" className="gt-choice" onClick={() => setMiss(true)}>
          <strong>INC-009 · Festival-season dip</strong>
          <span>Whole market dipped for two weeks, then recovered by itself.</span>
        </button>
      </div>
      {miss ? <p className="gt-miss" role="status"><IconBulb size={16} aria-hidden="true" /> That dip was seasonal, a different cause. Try the other one.</p> : null}
    </div>
  );
}

/* ---------- Level 4: decide at the human gate ---------- */
function DecideAtGate({ onWin }: LevelProps) {
  const opts: { key: string; icon: Icon; label: string; effect: string; note: string }[] = [
    { key: "approve", icon: IconCheck, label: "Approve plan", effect: "Work starts in about 30 minutes.", note: "Fastest recovery. You stayed in control and STRATA did the legwork." },
    { key: "wait", icon: IconHourglass, label: "Let the agent decide", effect: "At the deadline the agent takes the safe step.", note: "Below level 2 the agent may act alone; at level 4 it escalates to your boss instead." },
    { key: "escalate", icon: IconArrowUpRight, label: "Escalate", effect: "Business Head reviews within 12 hours.", note: "Safer for big calls, but recovery starts later." },
  ];
  return (
    <div className="gt-mock">
      <div className="gt-mock__bar"><IconUserShield size={16} aria-hidden="true" /> Human gate · <span className="gt-lvl gt-lvl--high">L4 High</span> · deadline 4 h</div>
      <p className="gt-mock__q">STRATA drafted a 3-step plan. Nothing runs until a person decides. What do you do?</p>
      <div className="gt-gate">
        {opts.map((o) => {
          const Ico = o.icon;
          return (
            <button key={o.key} type="button" className={`gt-opt gt-opt--${o.key}`} onClick={() => onWin(o.note)}>
              <span className="gt-opt__label"><Ico size={16} aria-hidden="true" /> {o.label}</span>
              <span className="gt-opt__effect">{o.effect}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Level 5: find your way around ---------- */
function FindYourWay({ onWin }: LevelProps) {
  const spots: { id: string; icon: Icon; label: string; text: string }[] = [
    { id: "nav", icon: IconLayoutSidebar, label: "Sidebar", text: "Every page, grouped. Open a group to see its pages." },
    { id: "lab", icon: IconFlask, label: "Simulation Lab", text: "Play any business problem forward and compare with and without STRATA." },
    { id: "ask", icon: IconMessageCircle, label: "Ask STRATA", text: "The floating button on every page. Answers from your data, with sources." },
  ];
  const [seen, setSeen] = useState<string[]>([]);
  const won = useRef(false);
  useEffect(() => {
    if (!won.current && seen.length === spots.length) { won.current = true; onWin("You know where everything is. Time to sign in."); }
  }, [seen.length, spots.length, onWin]);
  const last = spots.find((s) => s.id === seen[seen.length - 1]);
  return (
    <div className="gt-mock gt-map">
      <div className="gt-mock__bar">Console map <span className="gt-mock__count">{seen.length}/{spots.length} found</span></div>
      <div className="gt-map__frame">
        <div className="gt-map__side">
          <Spot s={spots[0]} on={seen.includes("nav")} onClick={() => setSeen((x) => (x.includes("nav") ? x : [...x, "nav"]))} />
          <Spot s={spots[1]} on={seen.includes("lab")} onClick={() => setSeen((x) => (x.includes("lab") ? x : [...x, "lab"]))} />
        </div>
        <div className="gt-map__main">
          <span className="gt-map__ghost" /><span className="gt-map__ghost gt-map__ghost--short" /><span className="gt-map__ghost" />
          <div className="gt-map__ask"><Spot s={spots[2]} on={seen.includes("ask")} onClick={() => setSeen((x) => (x.includes("ask") ? x : [...x, "ask"]))} /></div>
        </div>
      </div>
      <p className="gt-map__tip" aria-live="polite">{last ? <><strong>{last.label}:</strong> {last.text}</> : "Tap the three glowing spots."}</p>
    </div>
  );
}

function Spot({ s, on, onClick }: { s: { icon: Icon; label: string }; on: boolean; onClick: () => void }) {
  const Ico = s.icon;
  return (
    <button type="button" className={`gt-spot${on ? " is-on" : ""}`} onClick={onClick} aria-pressed={on}>
      <Ico size={16} aria-hidden="true" /> {s.label}
    </button>
  );
}

const LEVEL_META = [
  { title: "Spot the signal", goal: "Pick the item that needs you first.", C: SpotTheSignal },
  { title: "Read the evidence", goal: "Open all three pieces of evidence.", C: ReadTheEvidence },
  { title: "Check memory", goal: "Find the past case that helps.", C: CheckMemory },
  { title: "Decide at the gate", goal: "You are the human in the loop. Choose.", C: DecideAtGate },
  { title: "Find your way", goal: "Find the three things you will use most.", C: FindYourWay },
] as const;

export function GameTutorial({ onDone }: { onDone: () => void }) {
  const [level, setLevel] = useState(0);
  const [won, setWon] = useState<string | null>(null);
  const [xp, setXp] = useState(0);
  const finished = level >= LEVELS;
  const nextRef = useRef<HTMLButtonElement>(null);

  const scored = useRef(-1); // the last level that already paid out XP
  const win = (note: string) => {
    setWon((w) => w ?? note);
    if (scored.current < level) { scored.current = level; setXp((x) => x + XP_PER_LEVEL); }
  };
  useEffect(() => { if (won) nextRef.current?.focus(); }, [won]);
  const next = () => { setWon(null); setLevel((l) => l + 1); };

  const pct = Math.round((xp / (LEVELS * XP_PER_LEVEL)) * 100);
  const meta = LEVEL_META[Math.min(level, LEVELS - 1)];
  const Level = meta.C;

  return (
    <div className="gt" data-testid="game-tutorial">
      <div className="gt-hud">
        <ol className="gt-dots" aria-label="Levels">
          {LEVEL_META.map((m, i) => (
            <li key={m.title} className={i < level ? "is-done" : i === level ? "is-now" : ""} aria-current={i === level ? "step" : undefined}>
              <span className="sr-only">Level {i + 1}: {m.title}{i < level ? " (done)" : ""}</span>
            </li>
          ))}
        </ol>
        <div className="gt-xp" role="meter" aria-label="Tutorial XP" aria-valuemin={0} aria-valuemax={LEVELS * XP_PER_LEVEL} aria-valuenow={xp}>
          <span className="gt-xp__bar"><span style={{ width: `${pct}%` }} /></span>
          <span className="gt-xp__n">{xp} XP</span>
        </div>
        {!finished ? <button type="button" className="gt-skip" onClick={onDone}><IconPlayerSkipForward size={14} aria-hidden="true" /> Skip</button> : null}
      </div>

      {finished ? (
        <div className="gt-win gt-win--final" role="status">
          <IconTrophy size={36} aria-hidden="true" />
          <h2>Tutorial complete · {xp} XP</h2>
          <p>You just did the whole STRATA loop: spot, investigate, remember, decide. The real console works the same way.</p>
          <Button variant="primary" onClick={onDone}>Choose your portal <IconArrowRight size={16} aria-hidden="true" /></Button>
        </div>
      ) : (
        <section className="gt-level" key={level} aria-labelledby="gt-title">
          <p className="gt-level__n">Level {level + 1} of {LEVELS}</p>
          <h2 id="gt-title" className="gt-level__title">{meta.title}</h2>
          <p className="gt-level__goal">{meta.goal}</p>
          <Level onWin={win} />
          {won ? (
            <div className="gt-win" role="status">
              <span className="gt-win__xp">+{XP_PER_LEVEL} XP</span>
              <p>{won}</p>
              <Button ref={nextRef} variant="primary" onClick={next}>{level === LEVELS - 1 ? "Finish" : "Next level"} <IconArrowRight size={16} aria-hidden="true" /></Button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
