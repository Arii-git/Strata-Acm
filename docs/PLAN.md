# PLAN (orchestrator) — 9 Oct 2026, started 12:07 IST, hard stop 15:00

**Scope tier: Core+ (time-boxed).** About 3 hours of build time were left at kickoff, so the Compact tier (10–12 h) was not realistic. Built: Core (Phases 0–3 on the hero path) plus the cheap Compact items that carry the District 05 brief: A10 notes, A11 opportunities, A21 accounts, A22 routines, A3 blast radius, A4 alert budget, A2 silent period, A7 QA routing, A12-lite Lab, A17 evaluation (seed A + hold-out B).

**Lane order (parallel via subagents):** orchestrator (contracts → engine core, sequential) ‖ web-shell (UI kit and shell) ‖ agents-content (memory seed DRAFTs) → three web-features page builders in parallel → qa (engine gate tests) → docs and review report.

**Architecture as built:** FastAPI engine (`services/engine/strata_engine`) on a FileStore (pickled DataFrames for facts, sqlite3 for mutable state, TF-IDF retrieval). Next.js 15 console (`apps/web`) calls the engine through a `/api/engine` rewrite. Keyless (`LLM_PROVIDER=none`) end to end.

Conflicts and decisions: see `OPEN_QUESTIONS.md`. Cuts: see `CUT_LOG.md`.
