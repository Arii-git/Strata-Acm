# Next-session prompt: deck first, then UX overhaul (paste everything between the lines)

Before pasting, make sure the clone includes commit `29f8799` ("docs: scale results, final snapshot") or later (`git log --oneline | head -3`). Open the agent (Claude Code or Codex) with the repo root `strata/` as its working directory.

──────────────────────────────── COPY FROM HERE ────────────────────────────────

You are continuing STRATA, a working hackathon prototype (The Industry Games 2026, District 05, sponsor Altygen Biopharm; team Arihant Chordia and Yogesh R Mehta). The repo is already built and tested. Do NOT start over and do NOT change the concept.

## STEP 0: read and set up (no skipping)
1. Read in this order: `AGENTS.md`, `docs/REVIEW_REPORT.md`, `docs/DEFEND_IT.md`, `docs/DECK_DELTAS.md`, `docs/OPEN_QUESTIONS.md`, `docs/API.md`, `docs/handoffs/web-shell-1.md`. The rules in `AGENTS.md` still hold, especially §2 (honesty: every number computed and provenance-tagged; no invented metrics), §3 (nothing sent externally; QA/adverse events are route-only) and §4 (design tokens only, no hex outside `apps/web/src/styles/tokens.css`).
2. This is a new machine. Run `npm run setup` from the repo root (it creates `.venv`, installs web deps, regenerates the git-ignored synthetic data in `data/store/` and runs the evaluation). Then `npm run dev` (engine on :8000, console on :3000) and `npm run check`. Everything must be green before you change anything. If setup fails, fix the setup, not the product.
3. Write `docs/PLAN_V2.md` (≤ 1 page): what you will change, in what order, and what you will not touch.

## PART A: build the 7-slide deck as a .pptx FIRST (stop and show me when done)
Make `docs/deck/STRATA_deck.pptx` (use python-pptx, or your pptx skill if you have one), 16:9, Altygen look: indigo `#211756`, deep indigo `#160F3D`, crimson `#E5310E` for one accent only, canvas `#F6F6FA`, Poppins for titles, IBM Plex Sans for body (fallback Arial). Exactly 7 slides, in this order:
1. **Cover: clean.** Dark indigo background, the word STRATA, a short crimson rule, and the tagline "Detect problems before they become business losses." Nothing else: **no footer, no sponsor or event logos, no team or track details, no data.**
2. **Proposed solution.** The District 05 brief phrases mapped to the STRATA features that answer them (left), and the six-step loop Observe → Detect → Investigate → Remember → (human gate) → Act → Learn (right).
3. **Technical approach: system architecture.** Four stacked layers (Sources → Data & intelligence → AI reasoning with the human approval gate → Application) with arrows between them. **No guardrails table on the right**: the layers use the full width.
4. **Technical approach: agent and data flow.** Sentinel → Investigator → Memory → Orchestrator → Human gate → Workflow & Learn, with in/out/rule under each, and a dashed "learn: outcome written back to memory" loop. **No bottom content bar.**
5. **Technical approach: tech stack.** The stack AS BUILT (read the repo, do not guess): Next.js 15 + TypeScript + one tokens CSS file + ECharts + TanStack Table + React Flow; Python 3.12 + FastAPI + Pydantic v2 + pandas/numpy + scikit-learn TF-IDF + a 4-agent state machine; file store + SQLite + hash-chained audit + offline replay snapshots; pytest, Playwright + axe, honesty and contrast lints. Mark PostgreSQL/pgvector, the LLM adapter and the embeddings API as "planned, not claimed", and Vercel + Supabase + Google sign-in as "hosted phase, after review".
6. **Technical approach: key function, detect and decide.** A real screenshot of the incident page for INC-2026-0001 (#4821) taken from the running app with Playwright (`tests/screens/` already has some). Use the live computed values, never the old deck targets (risk is 100, not 91; similarity to INC-017 is 0.60, not 0.89; see `docs/DECK_DELTAS.md`).
7. **Feasibility & viability · Impact & benefits · Research & references.** Three columns; every bullet starts with a label (Built, Measured, Estimate, Assumption, Not claimed, Source). Use the measured numbers from `docs/REVIEW_REPORT.md` (recall 7/8 on both seeds, root cause correct on every detected scenario, misses named, the scale result, Time-to-Action measured from audit timestamps).

Footer on slides 2–7: ONE row at the bottom: a crimson overline sitting exactly above the slide's OWN title text (the same words as the slide title, same left edge, overline width = text width), and "NN / 07" on the right. No list of other section names.
Speaker notes on every slide (plain, honest, 3–5 sentences). Render every slide to PNG (LibreOffice headless or python-pptx + a renderer) and look at each image yourself: no text overflow, no overlap, overlines aligned, nothing past the bottom margin. Fix what you see (max 2 rounds). Then **STOP and ask me to review the deck** before Part B.

## PART B: finish the product: a calm, guided, well-explained console
The console works, but users find it messy: numbers float around, there is no clear flow, problems are not classified clearly, and nothing explains what a number means or what happens after you act. Fix the EXPERIENCE without breaking the engine, the API contract or the tests. Every change goes behind the existing structure; extend `docs/API.md` only by adding fields or endpoints.

### B1. Progressive disclosure: nothing appears until the user asks
- **Landing → Start screen** (new `/app` home): one calm greeting, ONE sentence ("3 things need you today"), and 3–4 large, clearly labelled entry cards with an icon and a one-line description: "See what needs me today", "Walk me through a problem step by step" (guided workflow), "Explore the business" (health, accounts, opportunities), "How STRATA works" (explainer). No tables, charts or lists on the start screen.
- The current Briefing content (priorities, held-back list, Ask Strata, notes) moves behind "See what needs me today" and is shown only after that click; inside it, details expand on demand (accordion / drawer), with the top item open by default.
- Every page: at most 3 things visible above the fold. Secondary detail goes in "Show details" sections, tabs or drawers.

### B2. One clear workflow, shown visually
- A **Workflow / Case journey** view: every incident is a card that moves through the stages **Detected → Investigated → Plan ready → Awaiting approval → Executing → Outcome recorded → Learned**, shown as a horizontal stage board (columns) AND, on the incident page, as a stepper at the top that shows the current stage, what happened at each finished stage (who/what, when, from the audit log) and **what happens next**.
- A **Guided mode** for the hero case (and any incident): Next / Back buttons walk the user through Evidence → Cause → Memory → Plan → Approve → Outcome, one screen at a time, each with a 2–3 sentence plain-language explanation and the one action to take. This replaces "click around and hope".
- The sidebar becomes 5 groups that mirror the loop, each with an icon and a one-line hint shown under the label: **Today** (Start, What needs me) · **Find problems** (Problems board, Opportunities, Accounts) · **Understand** (Case workspace, Memory) · **Act** (Approvals, Workflow board, Outcomes) · **Prove it** (Business health, Sources & data health, Time-to-Action, Evaluation, Audit) · **Lab** (Simulation Lab, Engineering Notebook). Keep the `g`-shortcuts and Ctrl K.

### B3. Classify problems properly
- One taxonomy, shown everywhere with the same icon + label + token colour (never colour alone): **Supply** (supplier delay, stock-out), **Service** (support capacity, slow responses), **Customer relationship** (field coverage gap, touchpoints), **Finance** (payment stress), **Quality & safety** (batch complaints, possible adverse events: route-only to QA Head), **Data quality** (stale or duplicated feeds), **Opportunity** (growth with a product gap). Map from the engine's `cause` / `driver` / `kind`; add an `category` field to incident summaries in the engine (computed, documented in `docs/API.md`).
- A **Problems board** that groups open items by category (and can switch to by-stage or by-owner), each card showing: category icon, severity pill (dot + word), the account or scope, ₹ exposure, sources count, owner role, stage. Filters by category, severity, owner, region.
- A short **"How we classify"** panel (and `docs/CLASSIFICATION.md`): what each category means, which signals lead to it, who owns it, and what the usual first action is.

### B4. Diagrams and visuals for every action
Use React Flow / ECharts / inline SVG built from tokens (original drawings only, no stock photos, no emoji, no gradients, per AGENTS.md §4):
- The STRATA loop diagram on the Start screen and in "How STRATA works" (each step clickable, opening the page for that step).
- A per-incident **causal diagram**: sources → signals → cause → affected accounts (blast radius) → plan steps → owners.
- A **pipeline diagram** of the four agents with what each received and produced for this incident (from the agent trace).
- A **plan diagram**: steps as a flow with owner icons and due times; the approval gate drawn as a gate that opens only after a human click.
- An **outcome diagram**: before vs after (labelled illustrative, scripted counterfactual) and an arrow into Memory showing the new memory item.
- Small category illustrations or icons on cards, the start screen and empty states, so every event type is recognisable at a glance.

### B5. Explain every number and every outcome
- Every Metric, chart and table keeps its caption, plus an **"i" explainer** (popover) with three short lines: **What it is** · **How it is computed** (the formula in words, e.g. "noisy-OR of independent signals × source-diversity factor") · **What it means for you / what to do**.
- Every action button says what will happen BEFORE the click and confirms what happened AFTER it, e.g. Approve → "Creates 9 simulated tasks and 2 message drafts for these owners; nothing is sent outside the machine; you can see them in Workflow". After the click: a result panel listing exactly what was created, with links.
- A **"What to expect next"** box on every case: the next stage, who acts, the due time, and how the outcome will be measured (Lab fast-forward = illustrative).
- A **Glossary** page (risk score, severity bands, sources, robust z, baseline, revenue exposure, blast radius, silent period, Alert Budget, Evidence-or-Silence, provenance tags, four-eyes, standing routine, replay mode) linked from every explainer.
- Plain language first; technical terms second and in the glossary. Keep the honesty wording: exposure is not predicted loss; Lab outcomes are illustrative; synthetic data chip always visible.

### B6. Accessibility and polish
Everything reachable by keyboard and screen reader; visible focus; no colour-only status; reduced motion respected; axe 0 serious; contrast lint green; responsive down to 1280 px. Remove the Next.js dev badge overlap. Fix any chart that renders blank (charts in hidden or zero-size containers must resize when shown).

### B7. Tests, docs, stop
- Update the Playwright smoke and demo specs for the new flow: Start → "See what needs me today" → open the hero case → Guided mode through Approve → Outcome → Memory. Run the demo spec 3 times in a row (`--repeat-each=3`). Keep `npm run check` green. Re-take all screenshots into `tests/screens/`.
- Update `docs/REVIEW_REPORT.md` (what changed, the new 10-step click-through), `docs/DEFEND_IT.md` (classification and guided mode), `docs/OWNERSHIP_LEDGER.md` (new items are UX changes to existing features; any genuinely new feature goes to `docs/PROPOSALS.md` instead of being built).
- Commit in small, lane-prefixed commits (`web:`, `engine:`, `qa:`, `docs:`). Max 3 build passes; each gate gets 2 fix iterations, then cut and log in `docs/CUT_LOG.md`.
- **STOP** at the end and wait for me. Do NOT deploy, do NOT add Google auth (that is `docs/05_PHASE5_DEPLOY_PROMPT.md`, after my review). Never write Engineering Notebook entries; never mark DRAFT memory items as reviewed.

──────────────────────────────── COPY TO HERE ────────────────────────────────
