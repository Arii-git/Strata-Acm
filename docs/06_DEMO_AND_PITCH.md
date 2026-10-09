# Demo script, Q&A and pitch frame

This is scaffolding. The story must be yours — add what you actually tried and changed (Engineering Notebook). Pitch length and format are **[UNKNOWN]**; the script below is a 5-minute version you can cut to 3.

## 1. The story (your Observation → Insight → Idea → Build → Experiments → Results → Impact)
- **Observation:** at companies like Altygen, signals live in separate systems and people join the dots by hand (your slide 2). *[Add your own observation: who did you talk to, what did the mentor say?]*
- **Insight:** the gap is between signal, decision and action — not a lack of data.
- **Idea:** an operational nervous system that anticipates, explains, remembers, and only acts with human approval.
- **Build:** this prototype (synthetic data, computed live).
- **Experiments:** *[Your Notebook: "We tried X; it failed because Y; so we changed to Z."]*
- **Results:** measured on planted ground truth; hold-out seed reported with misses; Detection-to-Action time measured from audit timestamps (not claimed in the real world).
- **Impact:** hypothetical and labelled as such; next step is connecting a real data feed.

## 2. Five-minute live demo (rehearse until it takes 4:30)
| Time | Screen | Say / do |
|---|---|---|
| 0:00 | Landing | "STRATA — detect problems before they become business losses. Built for Altygen's operations team." Enter. |
| 0:20 | Briefing | Greeting + overnight summary. "N need you today; Strata held back M more — here is why." (Alert Budget; read N and M from the screen) |
| 0:50 | Risk Register → #4821 | "No single metric is alarming. Orders −31 %, complaints +47 %, response +22 %, interaction −40 %. Four systems, one customer. Risk 91." *(read the computed values on screen, not these)* |
| 1:30 | Workbench → Agent trace | "Investigator cites its evidence — stock cover fell below three days and the supplier's date slipped twice. Every sentence has an evidence chip; Strata drops what it can't cite." |
| 2:10 | Memory | "Last time — Incident 017 — same cause. Reallocate stock, escalate supplier, call the customer. Customer retained." Show similarity breakdown. |
| 2:40 | Plan + Blast Radius | "K more accounts are exposed to the same shortage; one approved plan covers them all." (read K from the screen) Leave a one-line note to the Support Manager (`@support`) from the plan — the Handoffs panel. |
| 3:10 | Approval | Modify one step, approve. "Only this click can trigger execution." Show tasks + WhatsApp-style draft ("simulated — nothing is sent"). |
| 3:40 | Time-to-Action | "Detection to approved, executing workflow: *measured* on this run." |
| 3:50 | Accounts → #4821 profile | "Same customer, relationship view: trends, last interactions, the next-best-action with its evidence." (read from the screen; drafts are simulated) |
| 4:00 | Simulation Lab | Judge picks a scenario → inject → Strata catches it live. Optional: advance 7 days → standing routines (approved once earlier) produce the weekly digest, a follow-up task, a refill draft — all internal and simulated. |
| 4:30 | Evaluation | "Hold-out results including what we missed." Close on the ask: connect one real feed. |

Opportunity Radar (S09 cross-sell account) is the 30-second answer to "does it only find problems?" — show it if a judge asks.

Backups: replay mode toggle; 90-second recording; second device.

## 2b. Three-minute cut
Landing (10 s) → Risk Register #4821 evidence (40 s) → Workbench trace + Memory match (50 s) → Approve (30 s) → Time-to-Action + one sentence on the hold-out evaluation (30 s) → close (20 s). Drop the Lab, Accounts and Opportunity Radar unless a judge asks.

## 3. If a judge says … (prepare your own answers; drafts below)
- **"How is this different from Power BI / Salesforce Einstein?"** BI reports what happened and leaves interpretation to people. Strata correlates across systems, retrieves how you solved it before, drafts the plan, and gates execution on a human; every step is evidence-cited and audited. It is an intelligence layer on top, not a replacement.
- **"Is this real data?"** No — synthetic by design and labelled everywhere. We evaluated on planted ground truth with a held-out seed and report misses. The data-source contract and (if shipped) CSV upload show the path to real feeds.
- **"What if the LLM hallucinates?"** Agents cannot introduce numbers; every sentence must cite evidence or is dropped; outputs are schema-validated; with no LLM the system falls back to deterministic summaries.
- **"Why should a pharma company trust it?"** Quality/adverse-event signals are route-only to the QA head with four-eyes; nothing executes without approval; full hash-chained audit.
- **"Your 93.3 % reduction?"** It is an illustrative target from a 15-minute manual baseline we assumed; the measured number is on the Time-to-Action page. *(Make sure slide 15 says "illustrative" — it does.)*
- **"Why these signals?"** From what a nephrology marketer actually fears: refills slipping on chronic therapy, bad batches, near-expiry stock, late payers, uncovered doctors. *[Add what the mentor told you.]*
- **"How would it connect to our systems?"** REST/CSV connectors on the Sources page; nothing is replaced; the field mapping is a config file.
- **"Who is the 'customer' here?"** A B2B channel account — stockist, chemist chain, hospital pharmacy or nephrology clinic (definition in `contracts/engagement_rules.yaml`). Prescribers and downstream stock-outs appear as signals about an account; no patient data is used.
- **"Is this a management platform or an analytics layer?"** An intelligence layer with an action loop on top of the systems Altygen already has: it detects, explains, proposes and tracks — it does not replace the ERP/CRM. Within the prototype it also does the day-to-day coordination the brief asks for (tasks, handoff notes, standing routines), all simulated.
- **"Does it scale?"** It is a single-tenant prototype. `npm run scale` measures engine time at 10× the account count on this machine (read the number from the report); we make no production-scale claim. The data-source contract and the Phase 5 hosted version show the path.
- **"Show me it fail."** Lab → inject the stale-feed scenario (S13) → Data Health Guard suppresses it and the Sources page shows a data-quality notice instead of a false alarm. *(Use only if the Lab S13 gate passed; otherwise skip.)*

## 4. Deck fixes to make (small, honest)
1. District label: "District 05" is correct (confirmed on the updated official PDF).
2. Slide 11: LangGraph "planned" → state what you actually built (explicit state machine) and Redis only if running.
3. Slide 15: replace the illustrative benchmark with the measured Time-to-Action once you have it; keep "illustrative" wording for the 15-minute baseline.
4. Slide 7/8/12 numbers: if the computed values differ, update the slide (see `docs/DECK_DELTAS.md` after the build).
5. Add one slide: "What we measured (hold-out) and what we missed."
6. Add one slide: "What Altygen told us" once the mentor conversation happens.

## 5. Defend-it drill
Read `docs/DEFEND_IT.md` aloud, one feature each. Anything either of you cannot explain in 20 seconds gets cut from the demo path. Judges can tell when a team can't defend its own build.

## 6. Rehearsal checklist
Three full runs timed · Wi-Fi-off run in replay · one teammate drives while the other talks · one judge-style interruption drill · battery/power plan · reset before every visit.
