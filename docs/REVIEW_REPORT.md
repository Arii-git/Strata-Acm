# REVIEW REPORT — STRATA prototype (STOP point: waiting for Arihant / Yogesh)

Built on 9 Oct 2026, 12:07–15:00 IST, by Claude (orchestrator) plus parallel subagents (web shell, page builders, memory content, QA). Scope: **Core+** (see PLAN.md). Nothing is deployed, there is no Google auth, and nothing is sent externally.

## How to run (3 commands, Windows-friendly; no Docker, no Postgres, no keys)
```
npm run setup        # .venv + pip, web deps, generate seed A + hold-out B, run evaluation
npm run dev          # engine http://127.0.0.1:8000 + console http://localhost:3000
npm run check        # hex lint + ruff + pytest gate tests + tsc
```
Extras: `npm run eval`, `npm run snapshot` then `npm run engine:replay` (offline replay), `npm run scale`, `npm run demo:reset`, `npm run routines:tick`, `npm run e2e` (Playwright; needs dev running).

## What works
- **Detect.** A synthetic nephrology-pharma estate: 240 fictional accounts, 104 weeks, ~140k order lines, plus tickets, complaints, CRM, warehouse and receivables. The signal engine (robust z with seasonality + common mode), noisy-OR scoring with the source-diversity cap, a persistence bonus, region, rep, batch, AE and opportunity rules, the Alert Budget and the Business Health Index (5 pillars, each decomposed).
- **Hero #4821 is recovered from rows:** orders −31.3%, complaints +48.0%, response time +22.1%, touchpoints −39.5% (deck −31/+47/+22/−40, tolerance ±0.08). Critical, risk 98, 4 source systems, blast radius 6 accounts.
- **Reason.** Investigator (fixed cause rules), Memory (TF-IDF; 0.5/0.3/0.2 breakdown shown), Orchestrator (SOP ∩ best past resolution). Evidence-or-Silence validator: every sentence is cited and carries no foreign numbers. The hero gives `supplier_delay`, top match **INC-017**, `grounding_ok = true`.
- **Act.** Approve / Modify / Reject (a reason is required for the last two), role checks, QA four-eyes (two different names, qa_head only), simulated tasks and WhatsApp/email drafts, a hash-chained audit log with a verifier (tampering is detected and tested), Time-to-Action from wall-clock audit rows, Lab fast-forward → outcomes (illustrative) → memory write-back (`strata-system`), stale-plan supersession.
- **Brief coverage.** Accounts with next-best-actions ER01–ER07 (A21), Standing Routines RT01–RT04 approved once and run on the sim clock (A22), role-addressed notes with @mentions in the Briefing (A10), Opportunity Radar (A11), persona views (A19).
- **Assure.** Evaluation page with seed A and hold-out B and every miss shown; Audit Trail with CSV export; Data Health Guard with the S13 stale/duplicate feed Lab test; replay mode (read-only, offline).
- **UI.** Landing, then a Briefing with a greeting, computed paragraph, 3 starters, Ask Strata cards with evidence chips and ≤ 7 priorities. Sidebar categorised by the loop (COMMAND → LAB), `g`-shortcuts, Ctrl K, every number/chart/table with a caption and a provenance badge, and the SYNTHETIC DATA chip. Colours live only in tokens.css (lint-enforced).

## Honest evaluation (computed by `npm run eval`; nothing tuned on B)
| Seed | Precision | Recall (planted) | Root-cause acc. | False alarms | Misses |
|---|---|---|---|---|---|
| A 20261009 (tuning) | 0.875 | 7/8 | 1.0 | 1 (INC-2026-0004, a random hospital account) | S06 (visit-gap pattern scored 47, below the 50 threshold) |
| B 20261010 (hold-out) | 0.875 | 7/8 | 1.0 | 1 (decoy S12 flagged as an opportunity) | S09 opportunity not detected |
S02/S03 are not planted in this build (cut). Lead time is not computed (it needs a backtest). Seed B uses the same generator with a different random draw, so it is **not** independent validation.

Scale (`npm run scale`, 2,400 accounts, single-tenant laptop measurement): see `data/store/scale_latest.json`; the numbers are copied into the "Scale" line below once the run finishes.

## Deck deltas (details in DECK_DELTAS.md)
Risk score 98 (deck 91); INC-017 similarity 0.60 (deck 0.89, so the slide must change); Health 82.0 (deck 84); 7 risks + 1 opportunity (deck "8 emerging risks"); 4 high/critical (deck 3); the slide 7 cause wording; slide 11 stack (no Postgres/pgvector/Redis/Docker/LangGraph in the prototype).

## Cut / not built (CUT_LOG.md)
S02/S03 (A5 refill cadence, A6 expiry; see the contract conflict in OPEN_QUESTIONS Q13), PostgresStore/pgvector, Redis, SSE streaming, lead-time backtest, IsolationForest corroboration, the in-browser replay toggle, A8 page, A9, A15 CSV upload, Lighthouse.

## Known issues
- Web API types are hand-written (pages declare some local types); generate them with openapi-typescript later.
- The simulated clock does not move globally on fast-forward. Outcomes carry the advanced sim date, but the top-bar clock stays at 9 Oct.
- `customer_health` pillar Δ4w is n/a (point-in-time only).
- Hero complaint and touchpoint counts are designed relative to the account's own baseline (OPEN_QUESTIONS Q6). Say so if asked.

## DRAFT items the team must rewrite before the pitch
`data/memory_seed/incidents.yaml` INC-001…024 and `sops.yaml` SOP-01…10 are all `DRAFT - TEAM TO REVIEW`. The minimum is the demo path: **INC-017, SOP-01, SOP-02, SOP-03, SOP-09, SOP-10**, plus the ER01–ER08 rule text in `contracts/engagement_rules.yaml` (via a new file, since contracts are frozen). The Engineering Notebook is empty and yours to fill.

## Ledger
See OWNERSHIP_LEDGER.md. Built: A1, A2, A3, A4, A7, A10, A11, A12-lite, A13, A14, A16, A17, A18, A19, A20, A21, A22. Partial: A8. Cut: A5, A6, A9, A15. Veto any of them by removing its flag.

## Review checklist (Blueprint §15)
1. Landing: name, both team names, tagline, button, "District 05".
2. Briefing greets by persona; counts match the Risk Register; the starter buttons work; Ask Strata returns cited cards.
3. Every page has its headline question, captions, provenance badges, and no orphan numbers.
4. Hero: #4821 detected; deltas ≈ −31/+47/+22/−40; cause supplier delay; INC-017; plan; approve; tasks; fast-forward; outcome in Memory.
5. QA route: the S04 batch cluster needs QA Head + four-eyes; Ops Manager gets 403; nothing clinical.
6. Decoys S11/S12 silent on seed A; the Lab S13 stale feed raises zero new incidents and shows a notice on Sources.
7. Replay: `npm run snapshot` then `npm run engine:replay`; the console works offline (read-only).
8. Evaluation shows seed A and hold-out B, with misses.
9. Notebook empty; memory DRAFT labels visible.
10. Ownership Ledger: keep or veto each addition.

## 10-step click-through (about 5 minutes)
1. `/`: read the landing, click **Enter Strata**.
2. Briefing: read the computed paragraph; click **Where are we quietly losing money?**; note the evidence chips.
3. Business Health: index 82 with five pillars; service quality and field coverage are what's dragging it.
4. Risk Register: Alert Budget banner; open **INC-2026-0001** (#4821, critical 98).
5. Workbench → Evidence: the four deltas with sparklines and the SKU-CKD-01 stock cover; Blast Radius of 6.
6. Agent trace → **Run investigation**: 4 steps, validator passed, narrative with chips; Memory tab: INC-017 breakdown.
7. Plan tab: SOP-01 + INC-017 steps, WhatsApp and email drafts marked "Simulated — not sent". **Approve** (try Reject first: it needs a reason).
8. Workflows: tasks and simulated outbox; Standing Routines → approve RT01–RT04.
9. Simulation Lab: **Advance 14 days** → Outcomes (illustrative) → Memory shows OUT-INC-2026-0001; Time-to-Action shows your measured seconds; Audit Trail: chain verified.
10. Lab: **Inject stale + duplicated orders feed** → Sources shows the data-quality notice; then **Reset**.

**STOP.** No deployment, no Google auth. Phase 5 (`docs/05_PHASE5_DEPLOY_PROMPT.md`) starts only after your review.
