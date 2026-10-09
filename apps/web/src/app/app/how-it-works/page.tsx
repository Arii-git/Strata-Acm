"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft, IconArrowRight, IconBooks, IconChecklist, IconClockHour4, IconFileDescription, IconLink, IconListSearch,
  IconMessageQuestion, IconRadar, IconShieldHalf, IconUserCheck, type Icon,
} from "@tabler/icons-react";
import { Details, PageTemplate, buttonClass } from "@/components/ui";
import { LOOP_STAGES, LoopDiagram } from "@/components/diagrams/LoopDiagram";
import { ArchitectureDiagram } from "@/components/diagrams/ArchitectureDiagram";
import { useGuided } from "@/components/features/guided";
import { useFeatures } from "@/lib/features";

const AGENTS: { icon: Icon; name: string; line: string }[] = [
  { icon: IconRadar, name: "Sentinel", line: "Watches every signal against each customer's own normal and flags problems seen in several systems." },
  { icon: IconListSearch, name: "Investigator", line: "Ranks the likely causes and cites the evidence for each one." },
  { icon: IconBooks, name: "Memory", line: "Recalls similar past cases and the procedures that worked." },
  { icon: IconChecklist, name: "Orchestrator", line: "Drafts the plan and routes it to the role allowed to approve it." },
  { icon: IconClockHour4, name: "Risk and deadline agent", line: "Gives each case a risk level from 1 to 5 and a decision deadline." },
  { icon: IconMessageQuestion, name: "Assistant", line: "Answers questions in plain words and points to the evidence behind them." },
];

const LEVELS: { n: number; label: string }[] = [
  { n: 1, label: "Low" }, { n: 2, label: "Moderate" }, { n: 3, label: "Elevated" }, { n: 4, label: "High" }, { n: 5, label: "Critical" },
];

const SAFEGUARDS: { icon: Icon; title: string; body: string; link: { href: string; label: string } }[] = [
  { icon: IconUserCheck, title: "A person approves",
    body: "Agents draft plans. Nothing runs until the right role presses Approve, and a rejection needs a reason.",
    link: { href: "/app/approvals", label: "Plans waiting for approval" } },
  { icon: IconShieldHalf, title: "Risk levels 1 to 5",
    body: "Every case gets a level; Moderate (2) is the default. Higher levels get shorter deadlines, and the Business Head sets the policy.",
    link: { href: "/app/approvals", label: "See levels on cases" } },
  { icon: IconFileDescription, title: "Evidence or silence",
    body: "Each sentence must cite an evidence ID, and each number must appear in that evidence. Anything else is dropped.",
    link: { href: "/app/help", label: "What is an evidence ID?" } },
  { icon: IconLink, title: "A full audit trail",
    body: "Every detection, decision and action is written to a hash-chained log that anyone can verify.",
    link: { href: "/app/audit", label: "Open the audit log" } },
];

function Stepper({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  const s = LOOP_STAGES[step];
  const Ico = s.icon;
  return (
    <div className="hiw-stepper">
      <ol className="hiw-steps" aria-label="The six steps">
        {LOOP_STAGES.map((st, i) => (
          <li key={st.key}>
            <button type="button" className={`hiw-step${i === step ? " is-on" : ""}`} aria-current={i === step ? "step" : undefined}
              aria-controls="hiw-step-panel" onClick={() => setStep(i)}>
              <span className="hiw-step__n" aria-hidden="true">{i + 1}</span>
              <span className="hiw-step__label">{st.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div id="hiw-step-panel" className="hiw-panel" aria-live="polite">
        <span className="hiw-panel__icon" aria-hidden="true"><Ico size={22} stroke={1.5} /></span>
        <div className="hiw-panel__body">
          <p className="hiw-panel__kicker">Step {step + 1} of {LOOP_STAGES.length}</p>
          <h3 className="hiw-panel__title">{s.label}: {s.line.toLowerCase()}</h3>
          <p className="hiw-panel__text">{s.alt}</p>
          <div className="hiw-panel__nav">
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              <IconArrowLeft size={16} stroke={1.5} aria-hidden="true" /> Back
            </button>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setStep(Math.min(LOOP_STAGES.length - 1, step + 1))} disabled={step === LOOP_STAGES.length - 1}>
              Next <IconArrowRight size={16} stroke={1.5} aria-hidden="true" />
            </button>
            <Link href={s.href} className="hiw-panel__open">Open where it happens</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  const { has, loaded } = useFeatures();
  const guided = useGuided();
  const [step, setStep] = useState(0);
  return (
    <PageTemplate
      explainKey="how-it-works"
      title="How STRATA works"
      question="How does STRATA work, and why can I trust it?"
      visual={{
        takeaway: "The brains behind STRATA: one loop of six steps, and a person approves every action.",
        node: (
          <div className="hiw-hero">
            <LoopDiagram activeKey={LOOP_STAGES[step].key} />
            <Stepper step={step} setStep={setStep} />
          </div>
        ),
      }}
      actions={
        <>
          {loaded && has("A23") ? (
            <button type="button" className={buttonClass("primary")} onClick={() => void guided.start()} disabled={guided.starting}>
              {guided.starting ? "Finding the top case…" : "Take the guided path"}
            </button>
          ) : null}
          <Link href="/app/evaluation" className={buttonClass("secondary")}>How good is it, honestly?</Link>
          <Link href="/app/help" className={buttonClass("secondary")}>Help and glossary</Link>
        </>
      }
    >
      <section aria-labelledby="hiw-agents" className="hiw-section">
        <h2 id="hiw-agents" className="hiw-section__title">The agents</h2>
        <ul className="hiw-agents">
          {AGENTS.map((a) => {
            const Ico = a.icon;
            return (
              <li key={a.name} className="hiw-agent">
                <span className="hiw-agent__icon" aria-hidden="true"><Ico size={20} stroke={1.5} /></span>
                <span className="hiw-agent__text"><strong>{a.name}</strong> {a.line}</span>
              </li>
            );
          })}
        </ul>
        <Link href="/app/agents" className="home-seeall">Where each agent works <IconArrowRight size={16} stroke={1.5} aria-hidden="true" /></Link>
      </section>

      <section aria-labelledby="hiw-safe" className="hiw-section">
        <h2 id="hiw-safe" className="hiw-section__title">The safeguards</h2>
        <ul className="hiw-safeguards">
          {SAFEGUARDS.map((g) => {
            const Ico = g.icon;
            return (
              <li key={g.title} className="hiw-safe">
                <span className="hiw-safe__icon" aria-hidden="true"><Ico size={22} stroke={1.5} /></span>
                <h3 className="hiw-safe__title">{g.title}</h3>
                <p className="hiw-safe__body">{g.body}</p>
                {g.title.startsWith("Risk") ? (
                  <ol className="hiw-levels" aria-label="Risk levels">
                    {LEVELS.map((l) => (
                      <li key={l.n} className={`hiw-level${l.n === 2 ? " is-default" : ""}`}>
                        <span className="hiw-level__n">{l.n}</span> {l.label}{l.n === 2 ? <span className="sr-only"> (default)</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <Link href={g.link.href} className="hiw-safe__link">{g.link.label}</Link>
              </li>
            );
          })}
        </ul>
        <p className="caption">Quality and possible patient-safety reports are routed only to the QA Head, with a second reviewer. STRATA gives no clinical advice.</p>
      </section>

      <Details title="What is built (architecture)">
        <p className="caption">Only parts that run in this prototype are drawn solid. Planned parts are dashed and labelled.</p>
        <ArchitectureDiagram />
      </Details>
    </PageTemplate>
  );
}
