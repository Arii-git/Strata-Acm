# Lane prompts (the six parallel agents)

Each lane is a self-contained brief. The orchestrator (master prompt) hands a lane its section plus `AGENTS.md`. Use these verbatim as the task text if you launch lanes as separate Codex tasks/worktrees yourself.

Common preamble for every lane (prepend): *"Read AGENTS.md and docs/01_BLUEPRINT.md first. Obey file ownership, the honesty rules, the iteration budget (2 fix iterations per gate) and the stop rule. Do not ask questions; record conflicts in docs/OPEN_QUESTIONS.md. Finish with docs/handoffs/<lane>-<phase>.md (≤15 lines)."*

---

## LANE 1 — data (synthetic estate)

**Owns:** `data/**` (except `data/memory_seed/**` and `data/snapshots/**`) · **Reads:** `contracts/schema.sql`, `contracts/scenarios.yaml`

**Objective:** a deterministic generator that produces a believable, noisy, seasonal data estate with planted ground truth, so the engine has something honest to detect.

**Tasks**
1. `data/generate.py` (pandas/numpy/Faker with a seeded RNG): regions (6), reps (~28), accounts (240; four types; tiers A/B/C; account **#4821** reserved as the hero stockist; `rank=N` selectors in scenarios.yaml mean N-th account by baseline 12-week order value, descending), prescribers (~60), products (26 across the six therapy areas, `is_chronic` flags, shelf life, price), batches, 104 weeks of `orders` (with `qty_filled`, `promised_date`, `delivered_date`), `support_interactions`, `complaints` (kinds incl. `quality`, `suspected_adverse_event` only for S04/S05), `account_interactions`, `warehouse_stock` (with `inbound_eta`, `eta_slips`), `channel_stock`, `receivables`, `source_feeds`.
2. Realism: log-normal order noise; per-account baseline scale by type/tier; weekly seasonality; a festival-season index applied portfolio-wide (decoy S11 relies on it); random slow drifts on ~8% of accounts (so "normal" is not flat); realistic response-time distributions (heavy tail).
3. Plant scenarios **S01–S12** exactly as in `scenarios.yaml` (S13 is created only by `data/lab_injectors.py` on a copy of the state); effect sizes are parameters; the hero plateaus for the last 28 days so the 4-week window equals the plateau effect and the hero deltas **emerge** (−31 % orders, +47 % complaints, +22 % response, −40 % interactions over the last 4 weeks vs baseline). Do not special-case the engine; only the data changes.
4. Write `eval_labels` from the scenario list. The engine must never read `scenarios.yaml` or `eval_labels` (enforced by a test in `tests/`).
5. Two seeds: `seed_dev` (20261009) and `seed_holdout` (20261010). `npm run seed -- --seed dev|holdout --target postgres|snapshot`.
6. Product naming mode `generic|catalog`, **default `generic`**: `catalog` (opt-in) may use **at most 8** names from the client's *public* catalogue (e.g. Altysev DT 400, Liporen, AddNut HP, Criticut DS, Prumia Gel, TR Aldosis, CilniCCB, DeliDAPA — confirm spellings on the client's public website) for background SKUs only — **never** in S01, S04, S05, S07 — with synthetic numbers and `naming_source='catalog_name_synthetic_numbers'`. Account/rep/prescriber names: clearly fictional, no real people or companies.
7. `data/lab_injectors.py`: pure functions that generate NEW rows for Lab templates (hero-like supplier delay, batch cluster, payment stress, stale/duplicated feed = S13, rep vacancy). They are a data source, not detection logic.
8. Memory seed is the **agents** lane's job; do not author it here.

**Acceptance**
- Re-running with the same seed yields byte-identical CSV/Parquet outputs (hash check test).
- Row counts in plausible ranges; no FK violations; schema loads.
- Planted effect sizes verified by direct pandas calculation in a test (not by the engine). The hero's realised 4-week deltas on `seed_dev` must be within 0.08 of targets using the *natural* RNG stream — if not, adjust effect-size parameters (documented), never the seed.
- README snippet `data/README.md`: how to regenerate, how seeds work, a **"this data is synthetic"** paragraph.

**Do not:** copy any real sales data, use real person names, or embed hard-coded engine outputs.

---

## LANE 2 — engine (signals, scoring, incidents, API)

**Owns:** `services/engine/**` except `agents/` · **Reads:** `contracts/signal_catalog.yaml`, `contracts/engagement_rules.yaml`, schema, Blueprint §8

**Objective:** the deterministic Sentinel: turn raw tables into explainable signals, risk scores, incidents and portfolio health.

**Tasks**
1. Implement **every** signal in the catalog with the exact definitions: `evaluate(as_of)` as a pure function of data ≤ as_of; baseline = the account's own distribution of the same rolling 4-week aggregate over `as_of−104w … as_of−5w`; robust z with MAD floor; week-of-year seasonality index from 104 weeks of portfolio totals **plus** the common-mode adjustment (>60 % of accounts moving the same way); min-history suppression (26 rolling windows); SKU/batch/region signals attach to an account incident per the `source_counting` rule; favourable-only signals produce opportunities. Lead time is computed by weekly **backtest** of `evaluate()`.
2. Data-Health Guard per the catalog's two scopes (feed-level staleness; account-level duplicates > 5 %) ⇒ suppress the affected signals, emit a `data_quality` notice (not a business incident). Base seeds have fresh feeds.
3. Aggregation: noisy-OR, diversity factor, persistence bonus, severity bands, hard rules (single source ≤ elevated; high/critical ≥ 3 sources; regulatory-sensitive bypass → always incident, `qa_head`, four-eyes).
4. Region/rep-level incidents: S10 must be **one** regional incident, not many account incidents (cluster by shared cause scope).
5. Onset estimation (CUSUM or equivalent) → `incidents.onset_estimated_at`; **A1** revenue exposure = baseline 12-week order value of the account (or scope), provenance `computed`; caption: "exposure, not a forecast of loss".
6. Risk Register "likely driver" = dominant signal class (descriptive; root cause comes from the Investigator in Phase 2). Business Health Index: five pillars, weights in a named constant, each pillar from computed aggregates; return the decomposition.
7. Alert Budget (A4): rank by revenue exposure × confidence × urgency (definitions in the catalog's `alerting` block); return `shown` and `held_back` with a reason per held-back item.
8. Implement the `Store` interface (`FileStore` first, `PostgresStore` later) and the routers owned by this lane per Blueprint §6.5 (`core.py`, `act.py`, `lab.py`, `notebook.py`). Phase 1 needs `/health`, `/briefing`, `/portfolio/health`, `/risks`, `/sources`, `/signals/catalog`, `/incidents`, `/incidents/{id}`. Pydantic response models carry `provenance` fields where numbers are returned.
9. Secondary cross-check: scikit-learn `IsolationForest` over per-account feature vectors; return `unsupervised_flag` per incident for the Evaluation page (never used to decide).
10. `npm run eval`: compute precision, recall, root-cause accuracy (requires agents later; before that, `cause_accuracy=null`), median lead time, false alarms/week for seed A and hold-out B; store in `eval_runs`.
11. **Engagement (A21):** evaluate `engagement_rules.yaml › next_best_actions` per account into `engagement_actions` (max 3 per account, ranked by revenue exposure × confidence; placeholders filled only from computed fields; regulatory-sensitive classes never generate actions). Endpoints `/accounts`, `/accounts/{id}`, `/accounts/{id}/actions`. Opportunities endpoint `/opportunities` (A11) from favourable-only signals (S09 present, S12 one-off spike absent).
12. **Routines & notes (A22, A10):** `standing_routines` / `routine_runs` per `engagement_rules.yaml › standing_routines`; a human approval (kind `standing`) is required once per routine; `POST /lab/advance` and `npm run routines:tick` run due routines on the sim clock; outputs are `workflow_tasks`/drafts/digests with `simulated=true` and an audit row each. `notes` router (`POST/GET /notes`, `@role` mentions, visible in the addressed role's Briefing) and decision-debt computation (approvals waiting > N sim-hours, tasks without owner). Never run a routine that has not been approved.
13. **Scale check:** `npm run scale` generates a 2,400-account temp estate via the data lane's generator, reports `evaluate` wall time and p95 `/risks` latency (provenance `computed`), and asserts S01 is still detected.
14. Determinism: all time from `SIM_NOW`. No network calls in this lane.

**Acceptance (Gate 1)**
- S01 → `critical`, `n_sources ≥ 4`; the four deltas within `tolerance_abs` of the deck targets (computed, not hard-coded); risk ≥ 85.
- S11, S12 → zero incidents; S10 → exactly one regional incident; S04/S05 → QA-routed, four-eyes. S13 (Lab-injected) → no incident and a data-quality notice (unit test on an injected copy).
- `/opportunities` returns the S09 account with evidence and excludes S12; S07 detected as specified; each ER rule has a unit test on a hand-built frame; the routine gate (digest + follow-up task + refill draft + nudge, all simulated and audited) passes on a 7-day advance.
- Tuning log in `docs/TUNING_LOG.md` (seed A only; each change with reason). Hold-out numbers recorded once per tuning round, unmodified.
- Unit tests for each signal on tiny hand-built frames (known answers).

**Do not:** read `scenarios.yaml`/`eval_labels` in engine code; add signals not in the catalog; round away misses.

---

## LANE 3 — agents (investigation, memory, grounding)

**Owns:** `services/engine/agents/**`, `data/memory_seed/**`, LLM/embedding adapters · **Reads:** Blueprint §9, `memory_items` schema

**Objective:** four constrained agents with evidence trails, retrieval that works offline, and a validator that makes hallucination structurally hard.

**Tasks**
1. Adapter `llm.py`: provider-agnostic via env (`LLM_PROVIDER`, `LLM_MODEL`, `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_DIM=1536`); structured JSON output; temperature ≤ 0.2; call budget guard; provider errors → deterministic fallback; no model names hard-coded; no keys in logs.
2. Memory seed (YAML): `INC-001…INC-024`, `SOP-01…SOP-10` per `scenarios.yaml` → every item has cause, account_type, sku_scope, steps (ordered, with owner_role), outcome, `authored_by='DRAFT - TEAM TO REVIEW'`. **INC-017** must be: supplier delay at a stockist → reallocate inventory from lower-priority accounts, escalate supplier, contact customer → customer retained. Keep items short and concrete; vary causes so retrieval is non-trivial; include 3–4 *negative* outcomes (what didn't work).
3. Retrieval backends behind one interface: `embeddings` (API vectors, precomputed once into the store and `data/snapshots/memory_embeddings.json`) and `tfidf` (scikit-learn, no keys). Auto-select; the trace records `retrieval: embeddings|tfidf`. Provide a `LLM_PROVIDER=none` mode where every agent returns deterministic, template-based, evidence-cited output.
4. Agents as an explicit typed state machine (plain Python; node interfaces LangGraph-compatible): Sentinel (wraps engine incident), Investigator, Memory, Orchestrator. Pydantic v2 I/O models for each. Every step appends an `agent_runs` row (input, output, timing, grounding result).
5. Investigator: evidence features via **whitelisted typed query functions** (stock cover, ETA slips, fill rate, batch cluster, rep gap, receivables, support backlog, feed health). LLM ranks hypotheses over the `cause_category` taxonomy and must cite evidence IDs; also lists **contradicting** evidence.
6. Memory agent: pgvector top-k then re-rank 0.5 embedding cosine + 0.3 cause match + 0.2 signal-pattern Jaccard; return the breakdown, last resolution, last outcome, and any negative past outcomes.
7. Orchestrator: plan = SOP steps ∩ best past resolution; owner roles; due offsets; revenue exposure; **Blast Radius (A3)** (other accounts exposed to the same cause: same SKU shortage / batch / rep / region); WhatsApp/email `DraftCard` payloads (A16), all `simulated=true`; sets `requires_role`, `four_eyes` for regulatory-sensitive.
8. **Evidence-or-Silence validator (A14):** drop uncited sentences; reject numeric tokens not in the evidence payload; schema-validate; one retry; deterministic template fallback; record `grounding_ok` and notes.
9. Endpoints: `POST /incidents/{id}/investigate` (SSE of steps), `GET /memory/search`, `POST /ask` (returns structured cards with evidence chips, each claim cited; refuses when no evidence).
10. Replay: `npm run snapshot` records each agent run (inputs, outputs, original timestamps) to `data/snapshots/agent_runs.json`; `STRATA_MODE=replay` serves them with no network.
11. Regulatory-sensitive path: classification + routing only. Unit test that the Orchestrator output for S04/S05 contains no clinical advice strings (denylist check) and no patient-facing drafts.

**Acceptance (Gate 2)**
- Hero (in keyless mode): cause `supplier_delay`; top memory match `INC-017`; `grounding_ok=true` (validator passed on the output actually shown; trace records `source: template|llm`); 0 uncited sentences; 0 non-evidence numbers. If an API key exists, run the hero once in LLM mode as an extra check.
- Replay reproduces the same trace offline.
- The 89 % similarity on the deck is not a target for tuning: show whatever the formula computes.

**Do not:** let an LLM write SQL; show similarity numbers that are not computed from the formula; mark memory items as human-authored.

---

## LANE 4 — web-shell (design system and chrome)

**Owns:** `apps/web/src/{app/layout*, components/shell, components/ui, styles, lib/theme}/**` · **Reads:** `design-tokens.css`, Blueprint §10

**Objective:** an enterprise shell that does not look AI-generated, built so that re-skinning is a one-file change.

**Tasks**
1. Next.js App Router layout; self-hosted fonts via `next/font` (Poppins, IBM Plex Sans, IBM Plex Mono); `tokens.css` imported once; Tailwind (if used) configured *only* to read CSS variables — no hex literals; lint rule enforces it.
2. `Sidebar`: sections COMMAND / OBSERVE / DETECT / INVESTIGATE / REMEMBER / ACT / ASSURE / LAB exactly as Blueprint §10.4; 36 px items; active item gets a 3 px crimson left rule; collapse to 56 px with tooltips; items filtered by feature flags and persona; `g`+letter shortcuts; `Ctrl K` command palette (cmdk).
3. `TopBar`: page title + the question line, `SyntheticBadge` (always), `ModeChip` (live/replay), `PersonaSwitcher` (Ops, Account, Sales, Support, Business Head, QA Head; stored in a cookie; later maps to Supabase roles).
4. Primitives: `Button` (primary/secondary/ghost/danger), `Pill`/`SeverityPill` (dot + label + colour), `Tabs`, `Dialog`, `Drawer`, `Tooltip`, `DataTable` (TanStack, compact toggle, sticky header; required props `provenance` and `caption`, column-definition tooltips), `Skeleton`, `EmptyState`, `ErrorState`. Radix primitives allowed for behaviour; all styling through tokens.
5. **`Metric` and `ChartFrame`**: required props `meaning: string`, `implication: string`, `provenance: 'computed'|'synthetic'|'illustrative'|'assumption'`; render value, delta, then a 12 px `--ink-3` caption "What this is… What it implies…" and a tiny provenance badge. Omitting a prop must be a TypeScript error. Add a vitest that asserts the caption renders directly below the value/chart.
6. ECharts theme from tokens (dense, quiet, dashed baseline, ≤3 series, direct labels).
7. `FlowCanvas` wrapper (React Flow): orthogonal edges, process-map node card, one structural colour, crimson only for active/failed.
8. Motion utilities: 120/160/220 ms tokens; count-up (once, ≤400 ms); reduced-motion respected.
9. Accessibility: focus ring token, skip link, landmarks, ARIA for sidebar and tabs, status never colour-only.

**Acceptance:** a unit test recomputes WCAG contrast for every text/background pair in tokens.css (≥ 4.5:1) and fails on regression; Storybook-less is fine — a `/app/_kit` route (flagged dev-only) renders every primitive for screenshots; axe 0 serious issues; keyboard navigation through sidebar/tabs/dialogs works; a "one-file re-skin" test swaps tokens.css for an alternate palette and confirms no component hard-codes colour.

**Do not:** use gradients, glow, emoji, sparkle icons, rounded bubble components, default shadcn look.

---

## LANE 5 — web-features (pages)

**Owns:** `apps/web/src/app/page.tsx` (landing), `apps/web/src/app/app/**` (every console page; URL prefix `/app`; the shell lane owns `app/app/layout.tsx`), `apps/web/src/components/features/**` · **Reads:** Blueprint §10.2–10.5

**Objective:** every page answers one question, shows ≤6 widgets, explains every number, and works against the generated API client (or replay snapshots).

**Pages and order:** Phase 1 → Landing, Briefing, Business Health, Sources & Signals, Risk Register, Opportunity Radar (A11) · Phase 2 → Incident Workbench (Evidence, Causal map, Agent trace, Memory tabs), Organizational Memory · Phase 3 → Plan tab + ApprovalBar, Approvals, Workflows & Handoffs (tabs: Tasks · Handoffs & Notes (A10) · Standing Routines (A22)), Accounts list + `/app/accounts/[id]` (A21: trend vs baseline, last 10 interactions, open tasks and notes, 1–3 evidence-cited next-best-actions with simulated draft preview, account-type definition footnote), Outcomes, Time-to-Action, Audit Trail · Phase 4 → Simulation Lab (incl. S13 stale-feed template visible on Sources), Evaluation, Engineering Notebook.

**Per-page rules**
- First element: the question the page answers (from Blueprint §10.5), then the widgets.
- Every KPI/chart via `Metric`/`ChartFrame`, every table via `DataTable`, with real captions written for a business reader (what it is → what it implies). No placeholder lorem. Add `/app/incidents` (list) as the Workbench entry.
- Loading/empty/error states for every async region; server components fetch via the generated client; client islands only where interactive.
- **Landing**: STRATA wordmark, tagline, "Arihant Chordia · Yogesh R Mehta", context line ("District 05" from `config/district.ts`), "Enter Strata", CSS-only loop line, synthetic-prototype note. One screen, no scroll.
- **Briefing**: persona/time-aware greeting; computed paragraph; 3 starting buttons; Ask Strata box (structured cards with evidence chips; empty-state when no evidence); Today's priorities (≤ 7) with Alert Budget banner.
- **Incident Workbench**: tabs described in Blueprint §10.5(5); sticky `ApprovalBar` bottom (Approve / Modify / Reject-with-reason). Regulatory-sensitive incidents show a "Route-only: QA Head + second approver" banner and hide any automated-action affordance.
- **Notebook**: human-only; empty state with the four prompts (Tried / What happened / What we changed / Evidence); no AI-authored rows; visible rule "Authored by humans".
- **Simulation Lab**: scenario templates, inject, live Sentinel/agent steps, approve, fast-forward 14 days, outcome, reset. Copy never implies real-world results.

**Acceptance:** Playwright screenshot per page at 1440×900 and 390×844 (mobile just must not break); keyboard-only run through Landing → Briefing → Risk Register → Hero incident → Approve; no number rendered without caption/provenance (honesty-lint passes).

**Do not:** invent copy claims ("saves X hours", "AI-powered insights"); add pages not in the IA; scatter stat tiles.

---

## LANE 6 — qa (tests, honesty-lint, demo tooling)

**Owns:** `tests/e2e/**`, `tests/shared/**`, `scripts/lint-*`, CI scripts · **Reads:** everything, writes nothing outside its paths (other lanes keep their unit tests in `tests/<lane>/**`; qa reviews them and fails the gate on skipped/weakened tests)

**Objective:** make it impossible to ship a fake number, a banned look, or a flaky demo.

**Tasks**
1. **honesty-lint** (`scripts/lint-honesty.*`): fails on hex literals outside tokens, banned phrases (list in AGENTS.md §2), `Metric`/`ChartFrame` without props, KPI/chart/table values rendered without provenance (DOM check in Playwright via `data-provenance` on `Metric`/`ChartFrame`/`DataTable`; IDs, dates and timestamps exempt), the WCAG contrast test over tokens.css, `simulated=false` anywhere, and any import of `scenarios.yaml`/`eval_labels` in engine code.
2. pytest: determinism (hash of seeded output), signal unit tests, planted-scenario detection, decoy silence, S10 single incident, hard rules (single source ≤ elevated), health guard, hash-chained audit verifier + tamper detection, grounding (uncited sentences, non-evidence numbers), regulatory denylist.
3. vitest: `Metric`/`ChartFrame` caption placement; sidebar filtering by flags/persona.
4. Playwright e2e: (a) Landing → Enter → Briefing; (b) hero: Risk Register → Workbench → investigate → plan → approve → tasks → advance → outcome → memory; (c) reject requires reason; (d) QA-route four-eyes; (e) replay mode with network blocked; (f) Lab inject/reset; (g) routine gate: approve routines once → advance 7 sim-days → digest, follow-up task, refill draft and nudge exist, all simulated, each audited, zero external requests; (h) notes: post as Account Manager → visible to Support Manager and in their Briefing, audit row present; (i) Accounts: #4821 and the S09 account each show ≥1 next-best-action with evidence chips; (j) Lab S13 injection → Sources page shows a data-quality notice and no incident; screenshots to `tests/screens/` for every page.
5. a11y: `@axe-core/playwright` on every page; fail on serious/critical.
6. Perf: `npm run scale` result recorded in REVIEW_REPORT (labelled single-tenant prototype measurement); Lighthouse on `/app`; report the actual score in REVIEW_REPORT (target ≥ 85, not a promise).
7. `npm run demo:reset` (fresh seed state, replay snapshot refreshed, < 60 s) and `npm run e2e -- --repeat-each=3` (Playwright's flag) for the "three clean runs" gate.
8. Produce `docs/REVIEW_REPORT.md` skeleton data: test results, screenshots index, known issues, Win-Score evidence paths.

**Acceptance:** `npm run check` and `npm run e2e` green on a clean clone; three consecutive clean demo runs.

**Do not:** weaken a test to make it pass; mark a gate green with skipped tests (skips must be listed in the report with a reason).
