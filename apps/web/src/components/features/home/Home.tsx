"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconBuildingStore, IconChecklist, IconCircleCheck, IconCircle, IconListSearch, IconMapRoute, IconNews, IconRadar,
  IconSitemap, IconTrendingUp, type Icon,
} from "@tabler/icons-react";
import { buttonClass } from "@/components/ui/Button";
import { apiGet, qs } from "@/lib/api/client";
import type { PersonaKey } from "@/lib/api/types";
import { useFeatures } from "@/lib/features";
import { PERSONAS, usePersona } from "@/lib/persona";
import { useGuided } from "@/components/features/guided";

/** What each persona sees (mirrors the engine's visible_to rule in app.py). */
export const PERSONA_LINES: Record<PersonaKey, string> = {
  operations_manager: "Every problem and opportunity; supply, stock and data-feed problems are yours to own.",
  account_manager: "Problems on single customer accounts, such as falling orders or overdue payments.",
  sales_manager: "Growth opportunities, plus anything you own.",
  support_manager: "Anything involving support tickets: slow replies and rising complaints.",
  business_head: "Every problem and opportunity across the business.",
  qa_head: "Quality and possible patient-safety reports. These go only to you, with a second reviewer.",
};

export function WelcomeCard() {
  const { label } = usePersona();
  const { has, loaded } = useFeatures();
  const guided = useGuided();
  return (
    <section className="card home-welcome" aria-labelledby="home-welcome-title" data-testid="home-welcome">
      <div className="home-welcome__mark" aria-hidden="true"><span className="brand-mark" /></div>
      <div className="home-welcome__body">
        <h2 id="home-welcome-title" className="home-welcome__title">Welcome, {label}.</h2>
        <p className="home-welcome__text">
          I&apos;m STRATA. I watch your business data, flag problems early, explain them, and only act when you approve.
          Where would you like to start?
        </p>
        <div className="row home-welcome__actions">
          <Link href="/app/briefing" className={buttonClass("secondary")} data-testid="show-briefing">
            <IconNews size={18} stroke={1.5} aria-hidden="true" /> Show today&apos;s briefing
          </Link>
          {loaded && has("A23") ? (
            <button type="button" className={buttonClass("primary")} onClick={() => void guided.start()} disabled={guided.starting} data-testid="start-guided">
              <IconMapRoute size={18} stroke={1.5} aria-hidden="true" /> {guided.starting ? "Finding the top case…" : "Take the guided path"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PersonaPicker() {
  const { persona, setPersona } = usePersona();
  return (
    <fieldset className="home-personas" data-testid="persona-picker">
      <legend className="section-label">Who are you today?</legend>
      <p className="caption home-personas__hint">Your role decides which problems you see first. You can change it any time in the top bar.</p>
      <div className="home-personas__grid">
        {PERSONAS.map((p) => {
          const on = p.key === persona;
          return (
            <label key={p.key} className={`home-persona${on ? " is-on" : ""}`}>
              <input type="radio" name="home-persona" value={p.key} checked={on} onChange={() => setPersona(p.key)} className="sr-only" />
              <span className="home-persona__icon" aria-hidden="true">
                {on ? <IconCircleCheck size={20} stroke={1.5} /> : <IconCircle size={20} stroke={1.5} />}
              </span>
              <span className="home-persona__text">
                <span className="home-persona__name">{p.label}{on ? <span className="home-persona__sel"> · selected</span> : null}</span>
                <span className="home-persona__line">{PERSONA_LINES[p.key]}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface Path { id: string; icon: Icon; title: string; body: string; button: string; href?: string; topCase?: boolean }

const PATHS: Path[] = [
  { id: "attention", icon: IconRadar, title: "See what needs attention", body: "Every open problem, sorted by stage and severity, so you can pick what to work on.", button: "Open the Problems board", href: "/app/problems" },
  { id: "one-problem", icon: IconListSearch, title: "Understand one problem", body: "Open the top case for your role: what happened, why, and what to do.", button: "Open the top case", topCase: true },
  { id: "growth", icon: IconTrendingUp, title: "Find growth", body: "Customers growing in related products who do not yet buy a matching line.", button: "Open Opportunities", href: "/app/opportunities" },
  { id: "approvals", icon: IconChecklist, title: "Review plans waiting for me", body: "Plans STRATA drafted that need a person to approve, change or reject.", button: "Open Approvals", href: "/app/approvals" },
  { id: "customers", icon: IconBuildingStore, title: "Check on customers", body: "Look up any customer account and how it is doing against its own normal.", button: "Open Accounts", href: "/app/accounts" },
  { id: "trust", icon: IconSitemap, title: "See how STRATA works and why to trust it", body: "The loop, what is built, the safeguards, and an honest evaluation.", button: "Open How STRATA works", href: "/app/how-it-works" },
];

function TopCaseButton({ label }: { label: string }) {
  const router = useRouter();
  const { persona } = usePersona();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    setErr(null);
    try {
      const b = await apiGet<{ priorities: { ref: string; kind: string }[] }>(qs("/briefing", { persona }));
      const top = b.priorities.find((p) => p.kind === "risk") ?? b.priorities[0];
      router.push(top ? `/app/incidents/${encodeURIComponent(top.ref)}` : "/app/problems");
    } catch (e) {
      setErr((e as Error).message || "Could not load the briefing.");
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={buttonClass("secondary")} onClick={() => void open()} disabled={busy} data-testid="path-top-case">
        {busy ? "Finding the top case…" : label}
      </button>
      {err ? <p className="caption" role="alert">Could not find the top case ({err}). <Link href="/app/problems">Open the Problems board instead</Link>.</p> : null}
    </>
  );
}

export function PathCards() {
  return (
    <section aria-labelledby="home-paths-title" className="home-paths">
      <h2 id="home-paths-title" className="section-label">Choose a path</h2>
      <ul className="home-paths__grid">
        {PATHS.map((p) => {
          const Ico = p.icon;
          return (
            <li key={p.id} className="card home-path" data-testid={`path-${p.id}`}>
              <span className="home-path__icon" aria-hidden="true"><Ico size={32} stroke={1.25} /></span>
              <h3 className="home-path__title">{p.title}</h3>
              <p className="home-path__body">{p.body}</p>
              <div className="home-path__action">
                {p.topCase ? <TopCaseButton label={p.button} /> : <Link href={p.href ?? "/app"} className={buttonClass("secondary")}>{p.button}</Link>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
