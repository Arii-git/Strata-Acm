"use client";

import Link from "next/link";
import { IconCloudOff, IconFileDescription, IconShieldHalf, IconUserCheck, type Icon } from "@tabler/icons-react";
import { PageTemplate, buttonClass } from "@/components/ui";
import { LoopDiagram } from "@/components/diagrams/LoopDiagram";
import { ArchitectureDiagram } from "@/components/diagrams/ArchitectureDiagram";
import { useGuided } from "@/components/features/guided";
import { useFeatures } from "@/lib/features";

const PROMISES: { icon: Icon; title: string; body: string; link: { href: string; label: string } }[] = [
  { icon: IconUserCheck, title: "STRATA only acts after a human approves",
    body: "Agents draft plans; nothing runs until the role allowed to decide presses Approve. A rejection needs a reason, and that reason is remembered.",
    link: { href: "/app/approvals", label: "See plans waiting for approval" } },
  { icon: IconFileDescription, title: "Every sentence cites evidence",
    body: "Each explanation sentence must point to an evidence ID that exists for the case, and every number in it must appear in that evidence. Sentences that fail the check are dropped, not shown.",
    link: { href: "/app/help", label: "What is an evidence ID?" } },
  { icon: IconCloudOff, title: "Nothing is sent outside",
    body: "Tasks, emails and messages are simulated drafts that stay on this machine. The data is synthetic and none of it belongs to Altygen.",
    link: { href: "/app/workflows", label: "See the simulated tasks" } },
  { icon: IconShieldHalf, title: "Quality and safety go only to the QA Head",
    body: "Batch complaints and possible patient reactions are routed, not handled: only the QA Head sees them, a second reviewer must confirm, and STRATA gives no clinical advice.",
    link: { href: "/app/problems", label: "See the Problems board" } },
];

export default function HowItWorksPage() {
  const { has, loaded } = useFeatures();
  const guided = useGuided();
  return (
    <PageTemplate
      explainKey="how-it-works"
      title="How STRATA works"
      question="How does STRATA work, and why can I trust it?"
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
      <section aria-labelledby="hiw-loop" className="stack hiw-section">
        <h2 id="hiw-loop" className="section-label">The loop</h2>
        <p className="hiw-lead">STRATA repeats the same six steps for every problem. Click a step to open the page where it happens.</p>
        <LoopDiagram />
      </section>

      <section aria-labelledby="hiw-arch" className="stack hiw-section">
        <h2 id="hiw-arch" className="section-label">What is built</h2>
        <p className="hiw-lead">Only parts that run in this prototype are drawn solid. Planned parts are dashed and labelled.</p>
        <ArchitectureDiagram />
      </section>

      <section aria-labelledby="hiw-trust" className="stack hiw-section">
        <h2 id="hiw-trust" className="section-label">Why you can trust it</h2>
        <ul className="hiw-promises">
          {PROMISES.map((p) => {
            const Ico = p.icon;
            return (
              <li key={p.title} className="card hiw-promise">
                <span className="home-path__icon" aria-hidden="true"><Ico size={28} stroke={1.25} /></span>
                <h3 className="home-path__title">{p.title}</h3>
                <p className="home-path__body">{p.body}</p>
                <Link href={p.link.href} className="hiw-promise__link">{p.link.label}</Link>
              </li>
            );
          })}
        </ul>
      </section>
    </PageTemplate>
  );
}
