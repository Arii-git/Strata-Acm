/**
 * "Explain this page" content (A24), one entry per console page key. Plain language.
 * what = what this page is · read = how to read it · next = what to do next.
 * Lane L6 owns the wording; every page using PageTemplate must have an entry (checked by tests).
 */
export interface Explain { title: string; what: string; read: string[]; next: string }

export const EXPLAIN: Record<string, Explain> = {
  home: { title: "Start", what: "Your starting point. Nothing is analysed here; you choose where to go.", read: ["Each card is a path through the work.", "The loop diagram shows how STRATA works; click a step to open it."], next: "Pick the card that matches what you want to do, or take the guided path." },
  briefing: { title: "Today's briefing", what: "What STRATA found since the last scan, ranked for your role.", read: ["The list is limited to 7 items (Alert Budget) so nothing important drowns.", "Held-back items are listed with the reason."], next: "Open the top item, or ask a question in Ask Strata." },
  problems: { title: "Problems board", what: "Every open problem and opportunity, grouped by where it is in the workflow.", read: ["Columns are workflow stages.", "Each card shows category, severity, stage, owner, age and money exposed."], next: "Open a card in Detected or Awaiting approval." },
  risks: { title: "Problem list", what: "The same problems as a sortable table.", read: ["Ranked by exposure × confidence × urgency."], next: "Open the top row." },
  case: { title: "Case file", what: "One problem from detection to outcome.", read: ["The stage tracker shows where the case is.", "Tabs: what happened, why, what to do."], next: "Follow the 'What to do' tab." },
  health: { title: "Business health", what: "Overall health of the business as one index and five parts.", read: ["Each part is 0–100; higher is better."], next: "Open the part that dropped most." },
  sources: { title: "Sources & signals", what: "Whether the data STRATA reads is fresh and what each signal means.", read: ["A stale feed pauses the signals that depend on it."], next: "Fix stale feeds first." },
  opportunities: { title: "Opportunities", what: "Accounts growing in related lines that do not buy a complementary line.", read: ["Growth is measured against the account's own history."], next: "Plan the suggested cross-sell visit." },
  accounts: { title: "Accounts", what: "Every customer account with its risk.", read: ["Risk is 0–100; higher needs attention."], next: "Open an account with high risk." },
  account: { title: "Account", what: "One customer: trend, signals, interactions and next-best actions.", read: ["The dashed line is this account's own normal."], next: "Act on the top next-best action." },
  memory: { title: "Organizational memory", what: "Past incidents, SOPs and outcomes STRATA learns from.", read: ["DRAFT items must be rewritten by the team."], next: "Search for a similar case." },
  approvals: { title: "Approvals", what: "Plans waiting for a human decision.", read: ["Waiting time is decision debt."], next: "Open the oldest plan and decide." },
  workflows: { title: "Workflows & handoffs", what: "Tasks, drafts, notes and standing routines.", read: ["Everything is simulated; nothing is sent."], next: "Work your open tasks." },
  outcomes: { title: "Outcomes", what: "What happened after plans were carried out.", read: ["Lab results are scripted (illustrative), not measured."], next: "Check that the outcome was added to memory." },
  "time-to-action": { title: "Time-to-action", what: "How fast a detection becomes an approved plan.", read: ["Measured from real click timestamps."], next: "Compare with the manual baseline (illustrative)." },
  evaluation: { title: "Evaluation", what: "How well STRATA finds planted problems, including misses.", read: ["Seed B is a hold-out, not independent validation."], next: "Read the misses." },
  audit: { title: "Audit trail", what: "Every decision and action, hash-chained.", read: ["'Verified' means nothing was altered."], next: "Export CSV if needed." },
  lab: { title: "Simulation lab", what: "Inject a scenario and watch the loop work.", read: ["Results here are scripted and illustrative."], next: "Inject, investigate, approve, advance." },
  notebook: { title: "Engineering notebook", what: "Human-written notes on what the team tried.", read: ["STRATA never writes here."], next: "Add an entry." },
  help: { title: "Help & glossary", what: "What every number and term means.", read: ["Search or scroll the glossary."], next: "Return to the page you came from." },
  "how-it-works": { title: "How STRATA works", what: "The loop, the agents and the safeguards.", read: ["Only built parts are shown as built."], next: "Take the guided path." },
};
