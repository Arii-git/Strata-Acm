"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowLeft, IconArrowRight, IconCheck, IconX } from "@tabler/icons-react";
import { useFeatures } from "@/lib/features";
import { GUIDED_STEPS } from "./steps";
import { useGuided } from "./GuidedProvider";

/** Persistent bottom bar for the guided path (A23). Rendered by AppShell while guided mode is on. */
export function GuidedBar() {
  const g = useGuided();
  const pathname = usePathname() ?? "";
  const { has, loaded } = useFeatures();
  if (!g.active || (loaded && !has("A23"))) return null;

  const total = GUIDED_STEPS.length;
  const step = GUIDED_STEPS[g.step];
  const n = g.step + 1;
  const last = n === total;
  const href = g.stepHref(g.step);
  const onStepPage = pathname === href.split("?")[0];

  return (
    <aside className="guided-bar" data-testid="guided-bar" aria-label="Guided path">
      <div className="guided-bar__inner">
        <div className="guided-bar__head">
          <span className="guided-bar__kicker">Guided path{g.ref ? <span className="mono"> · {g.ref}</span> : null}</span>
          <span className="guided-bar__count" data-testid="guided-step">Step {n} of {total}</span>
        </div>
        <div className="guided-bar__progress" role="progressbar" aria-label="Guided path progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={n} aria-valuetext={`Step ${n} of ${total}: ${step.title}`}>
          <span className="guided-bar__fill" style={{ width: `${(n / total) * 100}%` }} />
        </div>
        <div className="guided-bar__body" aria-live="polite">
          <h2 className="guided-bar__title">{step.title}</h2>
          <p className="guided-bar__text">{step.body}</p>
          {!g.ref ? <p className="guided-bar__text muted">{g.startError ? `Could not load cases (${g.startError}). ` : ""}No open case was found, so the steps open the Problems board instead.</p> : null}
          {!onStepPage ? <Link href={href} className="guided-bar__jump">Open this step&apos;s page</Link> : null}
        </div>
        <div className="guided-bar__actions">
          <button type="button" className="btn btn--ghost" onClick={g.exit} data-testid="guided-exit">
            <IconX size={16} stroke={1.5} aria-hidden="true" /> Exit
          </button>
          <button type="button" className="btn btn--secondary" onClick={g.back} disabled={g.step === 0} data-testid="guided-back">
            <IconArrowLeft size={16} stroke={1.5} aria-hidden="true" /> Back
          </button>
          <button type="button" className="btn btn--primary" onClick={g.next} data-testid="guided-next">
            {last ? <>Finish <IconCheck size={16} stroke={1.5} aria-hidden="true" /></> : <>Next <IconArrowRight size={16} stroke={1.5} aria-hidden="true" /></>}
          </button>
        </div>
      </div>
    </aside>
  );
}
