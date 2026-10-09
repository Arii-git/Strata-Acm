/**
 * "Explain this page" content (A24), one entry per console page key. Plain language.
 * what = what this page is (1–2 sentences) · read = how to read its numbers and visuals (2–4 bullets) ·
 * next = what to do next AND what happens after you do it.
 * Lane L6 owns the wording; every page using PageTemplate must have an entry (checked by tests).
 * Formulas follow docs/DEFEND_IT.md and config/metrics.yaml. All data is synthetic.
 */
export interface Explain { title: string; what: string; read: string[]; next: string }

export const EXPLAIN: Record<string, Explain> = {
  home: {
    title: "Start",
    what: "Your starting point. Nothing is analysed or ranked here; you choose where to go.",
    read: [
      "Each card is one path through the work: today's briefing, the problems board, the case file, or the Lab.",
      "The loop diagram shows the order STRATA works in: detect → investigate → plan → human approval → simulated tasks → outcome → memory.",
      "News and events appear only when you open them; nothing scrolls past on its own.",
    ],
    next: "Pick the card that matches what you want to do, or take the guided path. Opening a card only navigates; it changes nothing.",
  },
  briefing: {
    title: "Today's briefing",
    what: "What STRATA found in the latest scan, cut down to the few items your role should look at today.",
    read: [
      "Signals checked = how many signal values were evaluated; it shows coverage, not problems.",
      "Need you = risk items shown after the Alert Budget (at most 7 per role, ranked by exposure × confidence × urgency).",
      "Held-back items are listed with the reason, so nothing is silently dropped.",
      "Routed to QA = quality or possible patient-safety reports; STRATA only routes these.",
    ],
    next: "Open the top item to see its case file. Opening it changes nothing; the next step there is running the investigation.",
  },
  problems: {
    title: "Problems board",
    what: "Every open problem and opportunity, grouped by where it is in the workflow.",
    read: [
      "Columns are workflow stages, from Detected to Learned. A card moves right only when a person or the loop acts.",
      "Each card shows category, severity band, owner role, age and revenue exposure (normal 12-week order value, not a forecast).",
      "Severity: watch 30–49, elevated 50–69, high 70–84, critical 85+; high and critical need 3+ systems agreeing.",
    ],
    next: "Open a card in Detected (to investigate) or Awaiting approval (to decide). Approving creates simulated tasks; nothing is sent.",
  },
  risks: {
    title: "Problem list",
    what: "The same problems as a sortable table, ranked for your role.",
    read: [
      "Default order is exposure × confidence × urgency, the same ranking the Alert Budget uses.",
      "Risk score is 0–100 from combined independent signals; it is not a probability of loss.",
      "Sources = how many separate systems agree; more systems means less chance of a data glitch.",
    ],
    next: "Open the top row. From the case file you can run the investigation, which drafts a plan for human approval.",
  },
  case: {
    title: "Case file",
    what: "One problem from detection to outcome: what happened, why, what was done before, and what to do now.",
    read: [
      "The stage tracker shows where the case is in the loop.",
      "Each evidence row is one signal against this account's own normal (dashed line); robust z beyond 2 counts as a warning.",
      "Risk score combines the warnings (noisy-OR) and is scaled by how many systems agree. Revenue exposure is what is at stake, not a predicted loss.",
      "Silent period rests on an assumed manual review rule and is labelled assumption.",
    ],
    next: "Run the investigation, read the plan and similar past cases, then approve, modify or reject (reasons needed for the last two). Approval creates simulated tasks and drafts; nothing is sent. The outcome is checked later and written to memory.",
  },
  health: {
    title: "Business health",
    what: "Overall health of the business as one index and five parts, each 0–100.",
    read: [
      "The index is the simple average of the five parts; higher is better.",
      "Each part has its own formula: customer health, supply continuity (fill rate), service quality (replies within 8 hours), field coverage, commercial momentum (50 = flat after seasonality).",
      "The change shown is against 4 weeks earlier; customer health has no 4-week change yet (n/a).",
    ],
    next: "Open the part that dropped most, then the accounts listed as top movers. Nothing changes until you act on a case.",
  },
  sources: {
    title: "Sources and signals",
    what: "Whether the data STRATA reads is fresh, and what each signal measures in plain words.",
    read: [
      "Lag is time since last load divided by the expected interval; above 3 the feed is stale.",
      "A stale feed pauses every signal from that source (Data Health Guard), so a data fault cannot look like a customer problem.",
      "Weight is how much a signal can add to the risk score; data-health signals have weight 0.",
    ],
    next: "Fix stale or duplicated feeds first. When the data is fresh again, the paused signals resume on the next scan.",
  },
  opportunities: {
    title: "Opportunities",
    what: "Accounts growing in related product lines that do not buy a complementary line: a cross-sell gap.",
    read: [
      "Growth is measured against the account's own history, not against other accounts.",
      "Exposure is the account's normal 12-week order value; it sizes the relationship, it does not forecast new sales.",
    ],
    next: "Open the opportunity and plan the suggested visit. Any task created is simulated and goes to the Sales Manager's list.",
  },
  accounts: {
    title: "Accounts",
    what: "Every customer account (all fictional) with its current risk.",
    read: [
      "Risk is 0–100; 50 or more means an open incident.",
      "12-week order value sizes the relationship; it is not a forecast.",
      "Sort or filter by type and region to find clusters.",
    ],
    next: "Open an account with high risk to see its trend, signals and next-best actions.",
  },
  account: {
    title: "Account",
    what: "One customer: order trend, signals, recent interactions and up to 3 next-best actions.",
    read: [
      "The dashed line is this account's own normal (baseline), adjusted for season.",
      "Each signal shows its change against that normal and its robust z; beyond 2 counts as a warning.",
      "Next-best actions come from fixed engagement rules (ER01–ER07) and cite the evidence they use.",
    ],
    next: "Act on the top next-best action or open the linked incident. Tasks created are simulated; nothing is sent to the customer.",
  },
  memory: {
    title: "Organizational memory",
    what: "Past incidents, SOPs and outcomes that the planner searches when it drafts a plan.",
    read: [
      "Similarity = 0.5 × text match + 0.3 × same cause + 0.2 × same signal pattern; the breakdown is shown.",
      "DRAFT items were seeded as placeholders and must be rewritten by the team.",
      "Items by strata-system were written by the learning loop after a Lab outcome (illustrative).",
    ],
    next: "Search for a case like yours, or rewrite a DRAFT item. Better items give better precedents in future plans.",
  },
  approvals: {
    title: "Approvals",
    what: "Plans waiting for a human decision, oldest first.",
    read: [
      "Plans waiting and longest wait show decision debt: the problem keeps running while the plan waits.",
      "Exposure waiting is the normal 12-week order value behind the waiting plans, not a predicted loss.",
      "Quality cases need four-eyes: two different QA approvers.",
    ],
    next: "Open the oldest plan and approve, modify or reject it. Approval creates simulated tasks and message drafts (nothing is sent); rejection is stored in memory as a lesson.",
  },
  workflows: {
    title: "Workflows and handoffs",
    what: "Tasks, message drafts, notes and standing routines created by approved plans.",
    read: [
      "Every task and draft is simulated; nothing leaves the machine.",
      "Standing routines run only after a human approves them once, and only on the simulated clock.",
      "Notes with @role appear in that role's briefing.",
    ],
    next: "Work your open tasks and mark them done. The outcome is then checked (in the Lab, by a scripted fast-forward).",
  },
  outcomes: {
    title: "Outcomes",
    what: "What happened after approved plans were carried out, and what was written back to memory.",
    read: [
      "Before = the leading signal's change against normal when the plan was approved.",
      "After = the Lab's scripted result (the planted effect reduced by 75%). It is illustrative, not measured.",
      "Plan acceptance counts only real human clicks; n/a when there are none.",
    ],
    next: "Check that each outcome was added to memory. The next similar case will retrieve it as precedent.",
  },
  "time-to-action": {
    title: "Time-to-action",
    what: "How fast a detection becomes an approved plan in this prototype.",
    read: [
      "Measured from real wall-clock timestamps in the audit trail: detection row to approval row.",
      "n is how many approvals the median rests on; a small n means a fragile number.",
      "The manual baseline is an illustrative figure from the deck, not a measurement.",
    ],
    next: "Approve a plan in the Lab to add a data point. Do not quote the gap to the baseline as a measured saving.",
  },
  evaluation: {
    title: "Evaluation",
    what: "How well STRATA finds the problems planted in the synthetic data, including misses and false alarms.",
    read: [
      "Precision = share of raised incidents that match a planted scenario. Recall = share of planted scenarios found.",
      "Root-cause accuracy = share of detected scenarios whose top cause equals the planted cause.",
      "Seed B is a hold-out from the same generator with a different random draw; it is not independent validation.",
      "ML also flagged is a second opinion from an IsolationForest; it never decides.",
    ],
    next: "Read the misses and false alarms. Numbers change only when the evaluation script (npm run eval) is re-run; nothing here is hand-edited.",
  },
  audit: {
    title: "Audit trail",
    what: "Every detection, agent step, decision, task, note and routine run, in order.",
    read: [
      "Each row is chained to the previous one with a hash; 'Verified' means the chain recomputes and nothing was altered.",
      "Actor shows whether a person, an agent or the system did it.",
    ],
    next: "Export the CSV if someone asks who decided what and when. Exporting changes nothing.",
  },
  lab: {
    title: "Simulation lab",
    what: "Inject a scenario into a healthy account's data and watch the loop work end to end.",
    read: [
      "Inject changes the account's rows; the engine must detect it from those rows like any other problem.",
      "Advance 14 days applies a scripted counterfactual (effect reduced by 75%), labelled illustrative.",
      "The stale-feed test shows the Data Health Guard: zero new incidents, notices on Sources.",
    ],
    next: "Inject, open the new case, investigate, approve, then advance. The outcome is written to memory; Reset restores the demo state.",
  },
  notebook: {
    title: "Engineering notebook",
    what: "Human-written notes on what the team tried, what failed and what changed.",
    read: [
      "STRATA never writes here; every entry has a human author.",
      "Entries are kept when the demo is reset.",
    ],
    next: "Add an entry after each meaningful change. It appears here and in the audit trail.",
  },
  help: {
    title: "Help and glossary",
    what: "What every number, signal, term, category and stage in STRATA means, in one searchable list.",
    read: [
      "Each metric shows its formula in words, which direction is good, what it is compared with, what a change implies and what to do.",
      "The provenance badge says whether a number is computed, synthetic, illustrative or an assumption.",
      "Use the links for how detection works and for the diagram gallery.",
    ],
    next: "Search for the number you saw, then return to the page you came from. Nothing on this page changes any data.",
  },
  "how-it-works": {
    title: "How STRATA works",
    what: "The loop, the agents and the safeguards, showing only what is built.",
    read: [
      "Built parts are drawn as built; planned parts are labelled planned.",
      "Every agent step is audited, and every sentence must cite evidence.",
    ],
    next: "Take the guided path, or open How STRATA decides for the scoring in detail.",
  },
  decides: {
    title: "How STRATA decides",
    what: "How separate warning signals become a risk score, a severity band and an incident, with the hero case as a worked example.",
    read: [
      "Each warning signal is a witness from one system; its strength is its robust z against the account's own normal.",
      "Witnesses combine by noisy-OR, then the result is scaled by how many separate systems agree.",
      "The worked example uses the hero case's computed values from the engine.",
    ],
    next: "Open the hero case to see the same numbers in context. After detection come investigation, a plan, human approval, simulated tasks, the outcome and memory.",
  },
  diagrams: {
    title: "Diagram gallery",
    what: "Every diagram used in STRATA on one page, each with its caption and text alternative.",
    read: [
      "Diagrams that need data use live values from the engine, labelled with their provenance.",
      "Diagrams not built yet are listed as pending.",
    ],
    next: "Use it to check a diagram before it is embedded on its page. Nothing here changes any data.",
  },
};
