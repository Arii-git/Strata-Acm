/** The six steps of the guided path (A23) through the top critical case. Text is plain language; no numbers. */
export interface GuidedStep {
  title: string;
  /** 2-3 plain sentences shown in the bottom bar */
  body: string;
  /** where Next takes you; `{ref}` is replaced by the case reference */
  href: (ref: string | null) => string;
}

const caseHref = (ref: string | null, tab: string) => (ref ? `/app/incidents/${encodeURIComponent(ref)}?tab=${tab}` : "/app/problems");

export const GUIDED_STEPS: GuidedStep[] = [
  {
    title: "What STRATA noticed",
    body: "STRATA compared each of this customer's numbers with the customer's own normal and saw several of them move the wrong way at the same time, in different systems. Each piece of evidence has an ID, so you can trace every claim back to the data.",
    href: (ref) => caseHref(ref, "happened"),
  },
  {
    title: "Why it happened",
    body: "The Investigator ranks possible causes from a fixed list and shows the evidence for and against each one. If the case has not been investigated yet, press Investigate on this page first.",
    href: (ref) => caseHref(ref, "why"),
  },
  {
    title: "What we did last time",
    body: "The Memory agent looks for similar past cases and procedures and shows what was done and how it ended. Seed memory items are marked DRAFT until the team rewrites them.",
    href: (ref) => caseHref(ref, "why"),
  },
  {
    title: "The plan",
    body: "The Orchestrator drafts a plan from the matching procedure: who does what and by when. The page also shows what happens if you approve, before you decide.",
    href: (ref) => caseHref(ref, "todo"),
  },
  {
    title: "Your decision",
    body: "Nothing happens until a person approves. You can approve, change the plan, or reject it with a reason; a rejection is remembered as evidence for next time.",
    href: (ref) => caseHref(ref, "todo"),
  },
  {
    title: "The result and what STRATA learned",
    body: "After approval, simulated tasks and drafts are created; nothing is sent outside. When the result is recorded it goes into memory, so the next similar case starts from it. Results from the Simulation lab are scripted and labelled illustrative.",
    href: () => "/app/outcomes",
  },
];
