# AGENTS.md — STRATA (read first, every session)

You are building **STRATA**, a prototype for The Industry Games 2026 (sponsor: Altygen Biopharm, problem: Intelligent Business Operations & Customer Engagement). Team: **Arihant Chordia** and **Yogesh R Mehta**. The goal is 1st place. The project is **human-owned**: you are the force multiplier, not the founder.

Source of truth, in this order: `docs/01_BLUEPRINT.md` → `contracts/*` (incl. `engagement_rules.yaml`) → this file → `docs/02_CODEX_MASTER_PROMPT.md` → `docs/03_LANE_PROMPTS.md`. If two disagree, follow the earlier one and write the conflict into `docs/OPEN_QUESTIONS.md`. Do not ask for permission; decide, record, continue.

## 1. Ownership (non-negotiable)
- The concept in Blueprint §3 is **LOCKED**. Do not redesign it, rename agents, or add major features. Additions (A1–A22, incl. A21 Account Profile & Engagement Plan and A22 Standing Routines) exist only as listed in Blueprint §4, each behind `STRATA_FEATURES` flags and tracked in `docs/OWNERSHIP_LEDGER.md`.
- If you want to add something not in §4: do **not** build it. Append it to `docs/PROPOSALS.md` with a one-line reason and move on.
- Never write entries into the Engineering Notebook (`notebook_entries`, `docs/ENGINEERING_NOTEBOOK.md`). Humans only. Seed memory items must carry `authored_by='DRAFT - TEAM TO REVIEW'`.

## 2. Honesty rules (the project's hardest constraint)
- No invented metrics, users, partners, deployments, citations, validation or benchmarks. If a value is hypothetical, estimated, illustrative or synthetic, it is **labelled** with `provenance` ∈ {computed, synthetic, illustrative, assumption}.
- Every KPI number and chart rendered in the UI (`Metric`, `ChartFrame`, `DataTable`) must come from a computed field or a named constant with a provenance tag (IDs, dates and timestamps are exempt; tables carry one provenance badge + caption). **No number may be hard-coded into UI/API to "match the deck".** Tests must recompute it. If the computed value differs from the deck, report it in `docs/DECK_DELTAS.md`; do not fudge the generator after the fact beyond the declared scenario parameters.
- The UI always shows a `SYNTHETIC DATA — NOT ALTYGEN'S` chip. No claim of real-world performance anywhere. Banned phrases in UI/docs unless backed by a test: "guaranteed", "proven", "saves ₹", "X% more accurate", "real customers", "deployed at".
- LLM output may never introduce a number. LLM sentences must cite evidence IDs. See Blueprint §9 (Evidence-or-Silence).
- Report evaluation honestly, including misses and hold-out seed results. Never tune on the hold-out seed. The hold-out is the same generator with a different random draw — say so on the Evaluation page; it is not independent validation.
- Lab fast-forward outcomes are **scripted counterfactuals**: provenance `illustrative`, never presented as measured results. "Plan acceptance" is computed only from real human clicks (show n; "n/a" if none).
- `revenue_exposure` (column `value_at_stake`) = baseline 12-week order value. It is exposure, not predicted loss; the caption must say so.

## 3. Safety / side effects
- Nothing leaves the machine: no real email, WhatsApp, webhooks, scraping, telemetry. `workflow_tasks.simulated` is always true in the prototype. Standing routines (A22) run only after a human approves them once, only on the sim clock, and produce only internal tasks/drafts/digests/notes.
- Secrets only in `.env` (git-ignored); commit `.env.example`. Never print keys. All data is synthetic; never add real personal data.
- Regulatory-sensitive classes (batch quality, suspected adverse event) are **route-only**: Strata may classify and route to `qa_head` with four-eyes; it must never give clinical advice, diagnose, or draft patient-facing text.
- Do **not** deploy, create cloud projects, or implement Google auth in the prototype. That is Phase 5, after the human review.

## 4. Design rules
- All colours, fonts, spacing, radii, motion come from `contracts/design-tokens.css` (copied to `apps/web/src/styles/tokens.css`). No hex literals elsewhere (lint rule). Re-skinning must be a one-file change.
- Look: Altygen-branded enterprise console. Indigo sidebar, white surfaces on lavender-grey canvas, crimson only for "act now". 6 px corners, 1 px borders. **Forbidden:** gradients, glow, glassmorphism, emoji, sparkle/"AI" icons, rounded chat bubbles, purple-blue hero, default shadcn look, default Recharts look, stock images.
- Every page: first line is the question it answers; max 6 primary widgets (a table or tile strip counts as one); every KPI/chart wrapped in `<Metric>` / `<ChartFrame>` (tables: `<DataTable provenance caption>`) which **require** `meaning` and `implication` (rendered as 12 px `--ink-3` caption) and `provenance` (tiny badge). TypeScript must fail to compile without them.
- Status is never colour-only (dot + text + position). Contrast ≥ 4.5:1 for text — `design-tokens.css` is already verified; a qa-lane test recomputes every text/background pair and fails the build on regression. Never use `--crimson-600` for text. Full keyboard operation; visible focus ring; `prefers-reduced-motion` respected.
- Motion 120–220 ms ease-out; no bounce/parallax. Loading, empty and error states for every async view.
- Charts: Apache ECharts themed from tokens, ≤3 series, dashed baseline, direct labels. Tables: TanStack Table. Flows: React Flow, orthogonal edges. Icons: Tabler. Fonts self-hosted via `next/font`.

## 5. Engineering standards
- Monorepo layout per Blueprint §6.2. TypeScript `strict`, no `any` without a comment. Python 3.12, type hints, Pydantic v2 models for all agent I/O, `ruff` + `pytest`.
- Cross-platform: the maintainers use **Windows**. Provide `npm run …` entry points at repo root (no Makefile-only or bash-only workflows). Python is always launched via `scripts/py.mjs` (finds `.venv/Scripts/python.exe` or `.venv/bin/python`; creates the venv in `npm run setup`). Use `pathlib`, `.gitattributes` with `* text=auto`.
- Storage: engine talks only to a `Store` interface. Build `FileStore` (Parquet + sqlite3 + numpy) first so everything runs with no Docker and no Postgres; `PostgresStore` later. `STRATA_STORE=file|postgres`. Shared store tests run against both. Claim PostgreSQL/pgvector only if PostgresStore tests pass.
- `LLM_PROVIDER=none` must work end to end (template output still cited; retrieval falls back to TF-IDF). All gates must pass keyless.
- Clocks: `SIM_NOW` for all data logic; wall-clock only for Time-to-Action (`audit_log.wall_at`).
- Root scripts you must provide: `npm run setup`, `dev`, `seed` (generate + load), `snapshot` (write replay JSON), `eval` (seed A + hold-out B), `check` (lint + typecheck + unit + schema + honesty-lint), `e2e`, `demo:reset`, `routines:tick`, `scale`.
- Determinism: one simulated clock `SIM_NOW`; fixed seeds; no wall-clock in engine logic; seeded RNG only.
- Agents use whitelisted, typed query functions — never LLM-written SQL.
- Provider-agnostic LLM adapter via env (`LLM_PROVIDER`, `LLM_MODEL`, `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_DIM=1536`). No model names hard-coded. Respect `LLM_MAX_CALLS_PER_HOUR`.
- `STRATA_MODE=live|replay`: replay must run with no network, no DB, no keys; snapshots are produced at the end of Phase 2 (`npm run snapshot`) and refreshed after each later phase. `demo:reset` restores simulated state but **never deletes human-authored rows** (`notebook_entries`, memory items whose `authored_by` is a human name).
- Commits: small, imperative, prefixed by lane (`engine:`, `web:`, `data:`, `agents:`, `qa:`). Tag `pass-1`, `pass-2`, `pass-3` at the end of each pass.

## 6. Contracts and lanes
- `contracts/` is **frozen** at the end of Phase 0. After that, change only by adding a new migration/file and logging it in `docs/CONTRACT_CHANGES.md`. Never edit a frozen file in place.
- Lane file ownership (no overlaps). **orchestrator** (the lead agent): repo root files, `package.json`, `scripts/` (except `lint-*`), `db/`, `config/`, `docs/`, `docker-compose.yml`, `data/snapshots/` (written by `npm run snapshot`, which calls code owned by agents/engine). **data** → `data/**` (generator, `lab_injectors.py`, `memory_seed/` is NOT here). **engine** → `services/engine/**` except `agents/`; routers `core.py`, `act.py`, `lab.py`, `notebook.py`, `store/`. **agents** → `services/engine/agents/**` (incl. `routers/agents.py`), `data/memory_seed/**`. **web-shell** → `apps/web/src/app/layout.tsx`, `apps/web/src/app/app/layout.tsx`, `apps/web/src/components/{shell,ui}/**`, `apps/web/src/styles/**`, `apps/web/src/lib/theme/**`. **web-features** → `apps/web/src/app/page.tsx` (landing) and `apps/web/src/app/app/**` (all console pages; URL prefix `/app`), `apps/web/src/components/features/**`. **qa** → `tests/e2e/**`, `tests/shared/**`, `scripts/lint-*`. Every lane writes its own unit tests in `tests/<lane>/**` (qa reviews them). A lane needing a change in another lane's path writes a note in `docs/CONTRACT_CHANGES.md` for the orchestrator.
- OpenAPI (generated by FastAPI) is the API contract; the web client is generated from it (`openapi-typescript`). Do not hand-write fetch types.

## 7. Iteration budget and stop rules
- Max **3 build passes**; each gate allows **2 fix iterations**. If a gate is still red, switch the failing feature off in `STRATA_FEATURES`, log it in `docs/CUT_LOG.md`, and continue. Do not loop.
- Time-box: if you are about to start something not in the current phase's task list, stop and re-read the phase list.
- **After Phase 4: STOP.** Write `docs/REVIEW_REPORT.md` (what works, what is cut, known issues, how to run, review checklist from Blueprint §15, honest evaluation numbers, DECK_DELTAS). Do not deploy. Wait for the human.

## 8. Definition of done (per feature)
Typed, tested, caption + provenance present, loading/empty/error states, keyboard accessible, feature flag wired, entry in the ledger, screenshot captured by Playwright into `tests/screens/`.
