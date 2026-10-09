# STRATA — Operational Intelligence Console (prototype)

The Industry Games 2026 · built for Altygen Biopharm (District 05: Intelligent Business Operations & Customer Engagement) · Team STRATA: Arihant Chordia · Yogesh R Mehta.

**SYNTHETIC DATA — NOT ALTYGEN'S.** Every number is computed from a seeded synthetic data estate and carries a provenance label.

## Run (Windows / macOS / Linux; needs Node 20+ and Python 3.12; no Docker, no Postgres, no API keys)
```
npm run setup      # venv + pip, web deps, generate seed A + hold-out B, run evaluation
npm run dev        # engine on http://127.0.0.1:8000 + console on http://localhost:3000
```
Other scripts: `npm run seed`, `npm run eval`, `npm run check` (hex lint, ruff, pytest gate tests, tsc), `npm run test`, `npm run demo:reset`, `npm run routines:tick` (engine must be running).

## Layout
- `services/engine/strata_engine/`: FastAPI engine (`signals.py` robust-z signals, `detect.py` Sentinel/incidents, `agents.py` Investigator/Memory/Orchestrator + Evidence-or-Silence, `state.py` sqlite state + hash-chained audit, `app.py` API).
- `data/generator.py`: synthetic generator with planted scenarios; `data/memory_seed/`: DRAFT incidents and SOPs (team to review).
- `apps/web/`: Next.js console (Altygen-brand tokens in `src/styles/tokens.css`, the only colour source).
- `contracts/`: frozen schema, signal catalog, scenarios, engagement rules, design tokens.
- `docs/`: blueprint, API contract, REVIEW_REPORT, DEFEND_IT, DECK_DELTAS, ledger, cut log, open questions.
