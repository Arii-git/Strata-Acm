"use client";

import { useState } from "react";
import Link from "next/link";
import { IconFlask, IconInfoCircle, IconMapRoute, IconNews } from "@tabler/icons-react";
import { ErrorState, ExplainDrawer, Metric, MetricGroup, buttonClass } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import { useGuided } from "@/components/features/guided";
import { qs, useApi } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useFeatures } from "@/lib/features";
import { fmtDate, fmtINR, fmtNum } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { TypedText, useActiveSection } from "./motion";
import { MissedSection, NumbersSection, PeriodSection, PipelineSection, TrendsSection } from "./HomeSections";
import { numberById, type BriefingLive, type Digest } from "./types";
import { useLastVisit } from "./useLastVisit";

const TOC: { id: string; label: string }[] = [
  { id: "home-today", label: "Today" },
  { id: "home-yesterday", label: "Yesterday" },
  { id: "home-week", label: "Last 7 days" },
  { id: "home-pipeline", label: "Pipeline" },
  { id: "home-trends", label: "Trends" },
  { id: "home-numbers", label: "Numbers" },
  { id: "home-missed", label: "Missed" },
];

function firstName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || null;
}

/** 2–3 plain sentences, every number taken from /briefing and /digest (no free text, no LLM). */
function summaryText(b: BriefingLive, today: Digest | null): string {
  const s1 = `Overnight I checked ${fmtNum(b.signals_checked)} signals across ${fmtNum(b.accounts_count)} accounts and ${fmtNum(b.sources_count)} source systems.`;
  const s2 = today?.headline ?? b.summary;
  const top = b.priorities.find((p) => p.kind === "risk") ?? b.priorities[0];
  const s3 = top ? `The first thing to look at: ${top.title}.` : "Nothing crossed the thresholds for your role.";
  return `${s1} ${s2} ${s3}`;
}

function Toc() {
  const active = useActiveSection(TOC.map((t) => t.id));
  return (
    <nav className="home-toc" aria-label="On this page">
      <ol>
        {TOC.map((t) => (
          <li key={t.id}>
            <a href={`#${t.id}`} className={`home-toc__link${active === t.id ? " is-active" : ""}`} aria-current={active === t.id ? "location" : undefined}>
              <span className="home-toc__dot" aria-hidden="true" />
              <span className="home-toc__label">{t.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Hero({ briefing, today }: { briefing: BriefingLive; today: Digest | null }) {
  const { user } = useAuth();
  const { label } = usePersona();
  const { has, loaded } = useFeatures();
  const guided = useGuided();
  const [explain, setExplain] = useState(false);
  const who = firstName(user?.name) ?? label;
  const open = numberById(today, "open_problems");
  const exposure = numberById(today, "value_at_stake");
  const waiting = numberById(today, "approvals_waiting");

  return (
    <section id="home-today" className="home-hero" aria-labelledby="home-hero-title" data-testid="home-welcome">
      <div className="home-hero__top">
        <p className="home-hero__kicker">
          {fmtDate(today?.as_of ?? briefing.sim_now)}{user?.company_name ? ` · ${user.company_name}` : ""} · {briefing.role_label}
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExplain(true)} data-testid="explain-button">
          <IconInfoCircle size={16} stroke={1.5} aria-hidden="true" /> About this page
        </button>
      </div>
      <h1 id="home-hero-title" className="home-hero__title">{briefing.greeting}, {who}.</h1>
      <TypedText className="home-hero__summary" text={summaryText(briefing, today)} />

      {open && exposure && waiting ? (
        <div className="home-hero__metrics">
          <MetricGroup title="Right now">
            <Metric id="open_problems" label={open.label} value={fmtNum(open.value)} unit="items" provenance={open.provenance}
              tone={open.value > 0 ? "elevated" : "default"} meaning={open.meaning}
              implication="The briefing shows the top three first." next={{ label: "Open the briefing", href: "/app/briefing" }} />
            <Metric id="value_at_stake" label={exposure.label} value={fmtINR(exposure.value)} provenance={exposure.provenance}
              meaning={exposure.meaning} implication="It sizes what is at stake; it is not a forecast."
              next={{ label: "See the cases", href: "/app/problems" }} />
            <Metric id="approvals_waiting" label={waiting.label} value={fmtNum(waiting.value)} unit="plans" provenance={waiting.provenance}
              meaning={waiting.meaning} implication={waiting.value > 0 ? "Nothing runs until a person decides." : "No plan is waiting on anyone."}
              next={{ label: "Open Approvals", href: "/app/approvals" }} />
          </MetricGroup>
        </div>
      ) : null}

      <div className="home-hero__actions" role="group" aria-label="Where to start">
        <Link href="/app/briefing" className={buttonClass("primary")} data-testid="show-briefing">
          <IconNews size={18} stroke={1.5} aria-hidden="true" /> Open today&apos;s briefing
        </Link>
        {loaded && has("A23") ? (
          <button type="button" className={buttonClass("secondary")} onClick={() => void guided.start()} disabled={guided.starting} data-testid="start-guided">
            <IconMapRoute size={18} stroke={1.5} aria-hidden="true" /> {guided.starting ? "Finding the top case…" : "Take the guided path"}
          </button>
        ) : null}
        <Link href="/app/lab" className={buttonClass("secondary")} data-testid="run-simulation">
          <IconFlask size={18} stroke={1.5} aria-hidden="true" /> Run a simulation
        </Link>
      </div>
      {guided.startError ? <p className="caption" role="alert">{guided.startError}</p> : null}
      <ExplainDrawer pageKey="home" open={explain} onClose={() => setExplain(false)} />
    </section>
  );
}

/** Home: a calm opening about today, then quiet sections that rise in as you scroll. */
export function HomeView() {
  const { persona } = usePersona();
  const since = useLastVisit();
  const briefing = useApi<BriefingLive>(qs("/briefing", { persona }));
  const today = useApi<Digest>(since === undefined ? null : qs("/digest", { persona, period: "today", since: since ?? undefined }));
  const yesterday = useApi<Digest>(qs("/digest", { persona, period: "yesterday" }));
  const week = useApi<Digest>(qs("/digest", { persona, period: "week" }));
  const todayState = { ...today, loading: today.loading || since === undefined };

  return (
    <div className="home2" data-testid="home">
      <div className="home2__main">
        {briefing.error ? (
          <ErrorState error={briefing.error} onRetry={briefing.reload} title="Could not load today's summary" />
        ) : !briefing.data || (todayState.loading && !today.data && !today.error) ? (
          <div className="home-hero home-hero--loading"><StrataLoader size="lg" label="Reading today's data" /></div>
        ) : (
          <Hero briefing={briefing.data} today={today.data} />
        )}

        <PeriodSection id="home-yesterday" title="Yesterday" st={yesterday}
          statIds={["new_problems", "tickets_opened", "complaints_opened", "decisions_made"]}
          seeAll={{ href: "/app/audit", label: "See all activity" }} />
        <PeriodSection id="home-week" title="Last 7 days" st={week}
          statIds={["new_problems", "decisions_made", "outcomes_recorded"]}
          seeAll={{ href: "/app/problems", label: "See all problems" }} />
        <PipelineSection st={todayState} />
        <TrendsSection st={week} />
        <NumbersSection st={week} />
        <MissedSection st={todayState} firstVisit={since === null} />
      </div>
      <Toc />
    </div>
  );
}
