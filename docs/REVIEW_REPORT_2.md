# REVIEW REPORT 2: UX revamp after review 1 (STOP: waiting for Arihant / Yogesh)

Scope: fix every complaint in `docs/REVIEW_FEEDBACK_1.md`, using `docs/08_UX_FIX_PROMPT.md`. Built on 9 Oct 2026 by the lead plus 5 parallel lanes (A home/flow, B case file, C problems/pages, D explanations, E accessibility). Detection logic, seeds and hold-out handling are unchanged. No deploy, no Google auth.

## How to run
```
npm run setup      # first time on a machine (venv, web deps, synthetic data, evaluation)
npm run dev        # engine :8000 + console :3000
npm run check      # lints (hex, metric ids, contrast, honesty), ruff, pytest, tsc
```
`npm run e2e` (needs dev running) runs the browser suite. Offline fallback: `npm run engine:replay` (read-only snapshot).

## Complaint → fix → evidence
| Complaint (verbatim intent) | What changed | Evidence | Result |
|---|---|---|---|
| "Messy, numbers floating around" | Every page uses `PageTemplate`: the question, an "Explain this page" button, at most 3 numbers in one labelled group, one visual with a computed one-line takeaway, a "What to do" row; everything else sits in collapsible Details (closed in Simple mode). Base text 16 px, rows 48 px (tokens v2). | `tests/e2e/smoke.spec.ts` (page template, no orphan metrics on 25 routes), `tests/e2e/pages.spec.ts` (≤3 metrics per group) | pass |
| "No proper flow / not user friendly" | Landing → Home (welcome card, persona picker, 6 path cards, clickable loop diagram) → chosen path → Case → Decision → Outcome. The sidebar is in plain words (Start, Watch, Problems, Investigate, Remember, Act, Review, Lab, Help) with a hint per item; Simple mode folds reviewer pages away. A guided path (A23) walks the top case in 6 steps. | `tests/e2e/home.spec.ts`, `tests/e2e/demo.spec.ts` | pass |
| "After the landing page don't show the news unless I click" | Home has zero metrics, charts or news. The briefing moved to `/app/briefing` and opens only from "Show today's briefing". | `home.spec.ts` and `demo.spec.ts` assert 0 metrics and no briefing text before the click | pass |
| "Problems should be classified properly" | One taxonomy (`config/taxonomy.ts` = `services/engine/strata_engine/taxonomy.py`): 8 categories with icon + label (Supply & stock, Service & support, Customer relationship, Payment & finance, Field coverage, Quality & safety (route-only), Data quality, Opportunity) and 7 workflow stages. The engine adds `category` and `stage` to every incident. The Problems board has stage columns, category filter chips, a list view and a "How we classify" panel. | `tests/engine/test_taxonomy.py` (both sides agree; every incident on both seeds gets one category), `pages.spec.ts` (7 fields on every card) | pass |
| "All events are pretty random" | One classified event list (`GET /events`), built from the hash-chained audit log in causal order, with 16 defined event types (icon, sentence, link). Anything else is not shown. The briefing feed and the case timeline both render only through `EventRow`. | `case.spec.ts`, `demo.spec.ts` (timeline shows Approved, then Memory updated) | pass |
| "A proper workflow" | The case file has a 7-stage tracker with timestamps, a "Now: … / Next: …" banner, and exactly three tabs (What happened · Why and what we did last time · What to do), with the case timeline beside them. | `case.spec.ts`; demo journey goes Detected → Awaiting approval → In progress → Learned | pass |
| "What can be expected after the result is taken" | An "If you approve this plan" panel shows a flow diagram (tasks with owners and due times → simulated drafts → check-in → outcome → memory). Its expected result comes only from the matched past case ("Last time (INC-017, DRAFT memory item)…") or says "No basis yet". A result panel after the decision lists exactly what was created. | `case.spec.ts`, `demo.spec.ts` | pass |
| "Proper explanations: what do the numbers mean" | Metric dictionary (`config/metrics.yaml`, 81 entries: name, unit, formula in words, good direction, comparison, implication, action, provenance); "Explain this page" on every page; `?` term hints (25 terms); `/app/help` glossary (98 entries); `/app/help/decides` works the hero's risk score through as a noisy-OR diagram. | `scripts/check-metric-ids.mjs` (every metric id used in code is defined), `tests/engine/test_metrics_dictionary.py`, `help.spec.ts` | pass |
| "More diagrams and images" | 10 original SVG diagrams built from tokens: loop, architecture (built vs planned), stage tracker, signal small-multiples vs own baseline, channel map with blast radius, region tiles, consequence flow, similarity bars, noisy-OR, and empty-state line art per category. Gallery at `/app/help/diagrams`. | `smoke.spec.ts` (gallery renders), `case.spec.ts` (`diagram-*` test ids) | pass |
| "Everything needs to be accessible" | Skip link, landmarks, focus rings, 44 px targets, reduced motion, live region for async results, charts with text summaries and a "View as table" toggle, charts that redraw when shown. | `tests/e2e/a11y.spec.ts`: axe 0 serious / 0 critical on 23 routes × Simple and Detailed, plus a keyboard-only path; `tests/screens/axe-summary-v2.json` | pass |

## Test results (this machine, 9 Oct 2026)
- `npm run check`: green (hex lint, metric ids 47/81, contrast 30 pairs + 4 size floors, honesty lint over 122 files, ruff, pytest 18/18, tsc).
- Full Playwright suite: **114/114 passed** (smoke 25, demo 3, case 4, home 6, pages 22, help 7, a11y 47).
- Demo journey `--repeat-each=3`: **9/9 passed** (three consecutive runs).
- One run earlier failed with `ERR_NETWORK_IO_SUSPENDED` (the laptop suspended); the re-run passed. It was environmental.

## Also finished from the open items
- IsolationForest corroboration on the Evaluation page (secondary only): on both seeds it agrees on 3 of 7 checkable scenarios (S01, S06, S07) and also flags decoy S12, which is why it never decides.
- The engine reports `persistence_bonus` per incident, so the help page reconciles 98 → 100 from the API, not by inference.
- Replay snapshot refreshed (151 responses, including `/events`, `/metrics/dictionary`, `/taxonomy`).
- Feature flags A23/A24 are wired into the engine (`/health` features) and the web nav.

## Evaluation (unchanged by the revamp; `npm run eval`)
Seed A: precision 0.875, recall 7/8, root cause 1.0, 1 false alarm (INC-2026-0004), miss S06. Hold-out B: precision 0.875, recall 7/8, root cause 1.0, misses S09 and the decoy S12 (flagged as an opportunity). S02/S03 are not planted.

## Still cut or open (see CUT_LOG.md, OPEN_QUESTIONS.md)
- Lead-time backtest (needs detection re-run at earlier weeks), PostgreSQL/pgvector, Redis, LLM adapter, embeddings, an in-browser replay toggle (replay needs an engine restart), S02/S03 (S03 conflicts with the scoring contract; the team must decide), Lighthouse score (not measured).
- OpenAPI-generated web types: FastAPI routes return untyped dicts, so generated types would add nothing. The hand-written types were extended (`category`, `stage`, `persistence_bonus`).
- Rejection reasons become negative memory; modification reasons are kept only in the audit log. The UI says exactly that.

## For the team before the pitch
Rewrite the DRAFT memory items on the demo path (INC-017, SOP-01/02/03/09/10). Write your own Engineering Notebook entries. Read `docs/DEFEND_IT.md`. Update the deck numbers using `docs/DECK_DELTAS.md`.

## 10-step click-through (about 5 minutes)
1. `/` → **Enter Strata**. Home shows a welcome, persona cards and path cards, and no numbers.
2. Click **Explain this page**, then close it. Hover the loop diagram and click **Detect**.
3. Problems board: filter by **Supply & stock**, switch to **List view** and back. Open "see why" in the Alert Budget line.
4. Open **INC-2026-0001**: stage tracker at Detected; read "Why this case matters" and press a `?` hint.
5. **What happened**: signal small-multiples vs the account's own baseline, and the channel map with blast radius.
6. **Next: Run the investigation**: cause supplier delay, INC-017 with its similarity bars, the cited narrative.
7. **What to do**: the consequence panel and expected result. Try **Reject** (a reason is required), then **Approve**: the result panel lists the created tasks.
8. Home → **Take the guided path** and walk the 6 steps.
9. Simulation Lab → **Advance 14 simulated days** → Outcomes (illustrative). The case is now **Learned** and the timeline shows "Memory updated".
10. `/app/help` glossary → **How STRATA decides**. Toggle **Detailed** in the top bar to see the reviewer pages (Evaluation shows the ML column, Audit shows the chain verified).

**STOP.** No deployment, no Google auth.
