"use client";

import { Suspense, useState } from "react";
import {
  IconArrowLeft, IconArrowRight, IconBuildingCommunity, IconChartBar, IconClipboardCheck,
  IconLogin, IconRoute, IconShieldCheck, IconUsersGroup,
} from "@tabler/icons-react";
import { DISTRICT } from "@config/district";
import { Button } from "@/components/ui/Button";
import { SignInCard } from "./(auth)/_components/SignInCard";
import { CardSkeleton } from "./(auth)/_components/shared";
import "@/styles/lanes/auth.css";

type Step = "starter" | "overview" | "tutorial" | "portal" | "login";
type Portal = "company" | "user";

const LOOP = [
  ["Observe", "Read the connected business signals."],
  ["Detect", "Spot changes worth a closer look."],
  ["Investigate", "Show the evidence and likely cause."],
  ["Remember", "Find similar cases and procedures."],
  ["Act", "Draft a plan for a person to approve."],
  ["Learn", "Record the outcome for next time."],
] as const;

const TOUR = [
  { icon: IconChartBar, title: "Start with the briefing", body: "See the few items that need your attention first. The short sentence below each number tells you what changed and why it matters." },
  { icon: IconRoute, title: "Open one case", body: "Follow the evidence, the likely cause and similar past work. Source IDs open the exact record behind an explanation." },
  { icon: IconClipboardCheck, title: "Decide, then track", body: "Approve, change or reject a proposed plan. STRATA records the decision and shows the resulting internal tasks." },
] as const;

export default function Landing() {
  const [step, setStep] = useState<Step>("starter");
  const [portal, setPortal] = useState<Portal>("company");
  const back = () => setStep(step === "overview" ? "starter" : step === "tutorial" ? "overview" : step === "portal" ? "tutorial" : "portal");

  return (
    <div className="lp">
      <header className="lp__top">
        <div className="lp__brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="lp__brand-name">STRATA</span>
          <span className="lp__district">{DISTRICT}</span>
        </div>
        {step !== "starter" ? <button type="button" className="lp__back" onClick={back}><IconArrowLeft size={16} aria-hidden="true" /> Back</button> : null}
      </header>

      <main id="main" className="lp__main lp__main--flow">
        {step === "starter" ? (
          <section className="lp-flow lp-flow--starter" aria-labelledby="landing-title">
            <p className="lp__eyebrow">Operational intelligence for business teams</p>
            <h1 id="landing-title" className="lp__wordmark">STRATA</h1>
            <p className="lp__tagline">See what changed. Understand why. Decide what happens next.</p>
            <div className="lp-starter-note">
              <IconBuildingCommunity size={20} aria-hidden="true" />
              <div><strong>Company starter</strong><span>Take a two-minute look at the workflow before choosing a portal.</span></div>
            </div>
            <div className="lp-actions">
              <Button variant="primary" onClick={() => setStep("overview")}>Continue <IconArrowRight size={16} aria-hidden="true" /></Button>
              <Button variant="ghost" onClick={() => setStep("portal")}>Log in <IconLogin size={16} aria-hidden="true" /></Button>
            </div>
          </section>
        ) : null}

        {step === "overview" ? (
          <section className="lp-flow" aria-labelledby="overview-title">
            <p className="lp__eyebrow">How STRATA works</p>
            <h1 id="overview-title" className="lp-flow__title">One calm loop from signal to decision.</h1>
            <ol className="lp-loop" aria-label="STRATA workflow">
              {LOOP.map(([title, body], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{body}</p></div></li>)}
            </ol>
            <div className="lp-actions"><Button variant="primary" onClick={() => setStep("tutorial")}>Take the tutorial <IconArrowRight size={16} aria-hidden="true" /></Button></div>
          </section>
        ) : null}

        {step === "tutorial" ? (
          <section className="lp-flow" aria-labelledby="tutorial-title">
            <p className="lp__eyebrow">Guided tutorial</p>
            <h1 id="tutorial-title" className="lp-flow__title">How to move through the console.</h1>
            <div className="lp-tour">
              {TOUR.map(({ icon: Icon, title, body }, index) => <article key={title} className="lp-tour__item"><span className="lp-tour__step">{index + 1}</span><Icon size={22} aria-hidden="true" /><h2>{title}</h2><p>{body}</p></article>)}
            </div>
            <div className="lp-safety"><IconShieldCheck size={18} aria-hidden="true" /><span>STRATA explains each number in plain words and only a person can approve a plan.</span></div>
            <div className="lp-actions"><Button variant="primary" onClick={() => setStep("portal")}>Choose a portal <IconArrowRight size={16} aria-hidden="true" /></Button></div>
          </section>
        ) : null}

        {step === "portal" ? (
          <section className="lp-flow" aria-labelledby="portal-title">
            <p className="lp__eyebrow">Login</p>
            <h1 id="portal-title" className="lp-flow__title">Choose the workspace that matches your role.</h1>
            <div className="lp-portals">
              <button type="button" className="lp-portal" onClick={() => { setPortal("company"); setStep("login"); }}>
                <IconBuildingCommunity size={24} aria-hidden="true" /><strong>Company portal</strong><span>For Business Heads managing a company workspace, membership and approvals.</span><em>Business Head access <IconArrowRight size={16} aria-hidden="true" /></em>
              </button>
              <button type="button" className="lp-portal" onClick={() => { setPortal("user"); setStep("login"); }}>
                <IconUsersGroup size={24} aria-hidden="true" /><strong>User portal</strong><span>For operations, account, sales, support and QA team members.</span><em>Team member access <IconArrowRight size={16} aria-hidden="true" /></em>
              </button>
            </div>
          </section>
        ) : null}

        {step === "login" ? (
          <section className="lp-flow lp-flow--login" aria-labelledby="login-title">
            <p className="lp__eyebrow">{portal === "company" ? "Company portal" : "User portal"}</p>
            <h1 id="login-title" className="lp-flow__title">{portal === "company" ? "Manage your company workspace." : "Enter your team workspace."}</h1>
            <p className="lp-flow__intro">{portal === "company" ? "Business Heads use their work account to manage company settings and approvals." : "Use the work account that belongs to your company join code."}</p>
            <Suspense fallback={<CardSkeleton />}><SignInCard portal={portal} /></Suspense>
          </section>
        ) : null}
      </main>

      <footer className="lp__foot">Prototype with synthetic data. Arihant Chordia · Yogesh R Mehta · The Industry Games 2026</footer>
    </div>
  );
}
