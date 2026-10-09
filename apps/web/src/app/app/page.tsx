"use client";

import { PageTemplate } from "@/components/ui";
import { LoopDiagram } from "@/components/diagrams/LoopDiagram";
import { PathCards, PersonaPicker, WelcomeCard } from "@/components/features/home";

/**
 * Home (review 1): a calm start screen. No numbers, charts or news here; the briefing opens only on
 * "Show today's briefing" (/app/briefing).
 */
export default function HomePage() {
  return (
    <PageTemplate explainKey="home" title="Home" question="Where would you like to start?">
      <div className="home">
        <WelcomeCard />
        <PersonaPicker />
        <PathCards />
        <section aria-labelledby="home-loop-title" className="home-loop">
          <h2 id="home-loop-title" className="section-label">How STRATA works, in one picture</h2>
          <LoopDiagram />
        </section>
      </div>
    </PageTemplate>
  );
}
