# Toolkit — what to use, for what, and what I did *not* verify

Rule: use the smallest set that makes the build faster and the demo safer. Anything marked **(verify)** I could not confirm for your exact install/version — check before relying on it.

## 1. Who does what

| Tool | Role in this project | Notes |
|---|---|---|
| **Codex** (CLI/IDE/app; you have `~/.codex`) | Main builder: runs `02_CODEX_MASTER_PROMPT.md` end to end, lanes in parallel if your version supports parallel tasks/worktrees, else sequentially | Reads `AGENTS.md` automatically from the repo root. Check `codex --help` for your version's approval/sandbox options **(verify)** |
| **Claude (this workspace / Cowork)** | Strategist + reviewer: research, red-team, judge simulation, UI critique from screenshots, pitch script, Phase 5 deploy (I have Supabase and Vercel connectors here) | Use me at the gates, not for line-by-line coding while Codex is mid-run |
| **Antigravity** (you have it) | Second pair of eyes on UI: have it open the running app in its browser agent and report visual/UX defects; do not let it edit the same files as Codex at the same time | Treat as reviewer, not co-author, to avoid conflicts |
| **Gemini** (you have `~/.gemini`) | Optional second LLM provider for the adapter (e.g. embeddings) and as a cross-check reviewer | Keep one embedding provider fixed for the whole project (dimension must match schema) |
| **ChatGPT** | Optional: rehearsal partner for judge Q&A | Don't paste secrets |
| **Gamma** (connected here) | Pitch deck polish after the prototype is stable | Your own deck stays the source; don't introduce new claims |
| **Figma** (plugin available here) | Only if the mentor names a tool you want to mimic and you want a quick token extraction | Optional |

## 2. Libraries (install the latest stable at install time; pin exact versions in lockfiles — I did not pin versions for you)

**Web:** Next.js (App Router) + TypeScript strict · Tailwind CSS configured to read CSS variables only · Radix UI primitives (behaviour only) · TanStack Table + TanStack Query · Apache ECharts · React Flow (`@xyflow/react`) · `cmdk` (command palette) · Tabler Icons · `zod` · `openapi-typescript` (generated API client) · `next/font` for Poppins / IBM Plex Sans / IBM Plex Mono.
*Deliberately not used:* default shadcn theme, default Recharts look, Lucide-sparkle "AI" iconography, Framer-heavy motion. They are what AI-generated frontends look like.

**Engine:** Python 3.12 · FastAPI + uvicorn · Pydantic v2 · pandas · numpy · scipy · scikit-learn · psycopg (v3) + `pgvector` Python package · Faker (seeded) · `httpx` · `pytest` · `ruff`.
*Avoid:* torch/sentence-transformers (blocks the Vercel bundle limit later; use an embeddings API + precomputed vectors).

**Data/infra (prototype):** PostgreSQL 15+ with pgvector (Docker image or local) · Redis optional (`JOBS_BACKEND=inline` default) · Docker optional.

**Quality:** Playwright · `@axe-core/playwright` · Vitest · Lighthouse CLI · ESLint + a custom "no hex outside tokens" rule · the honesty-lint script from lane 6.

**AI:** optional. One chat-capable LLM API and one embeddings API, selected by env vars; no model names hard-coded. With no keys the prototype runs in `LLM_PROVIDER=none` mode (deterministic cited output, TF-IDF retrieval). Which keys do you have? **[UNKNOWN]**.

## 3. MCP servers / plugins worth connecting to Codex **(verify configuration syntax for your Codex version — it is typically `~/.codex/config.toml`)**

| MCP / plugin | Why | Priority |
|---|---|---|
| **Playwright MCP** | lets the coding agent drive the real UI and take screenshots to self-check design and flows | high |
| **Context7 (docs MCP)** | gives the agent current Next.js / FastAPI / React Flow / ECharts docs so it does not code against stale APIs | high |
| **Postgres/Supabase MCP** | only for Phase 5; in the prototype use local scripts instead | later |
| **GitHub MCP / `gh`** | commits, tags, PR-less workflow; optional | low |
| **Figma MCP** | only if you get real Altygen tool screenshots/tokens to match | optional |

I did not install or test any of these in your environment.

## 4. Claude-side capabilities available to us in this workspace (for gates and Phase 5)
- **Supabase connector** (create project/migrations/SQL/logs/advisors) and **Vercel connector** (project, env vars, deploy, logs): used in Phase 5.
- **Browser tools**: I can open the running app, screenshot pages, and critique design/accessibility — ask me after each pass.
- **Skills available here**: design critique, accessibility review, system-design/architecture review, testing strategy, deploy checklist, code review. I will use them in the review passes.
- I cannot log into the hackathon dashboard (SRM-email login). Paste the rubric/judging text if it appears there.

## 5. Machine prerequisites (your Windows PC)
- Node.js LTS and npm, Python 3.12, Git — **check what is installed**: your device lists `.bun`, Arduino/STM tooling, VS Code, VirtualBox, `.streamlit` (suggesting Python) but I have not confirmed Node/Python/Git versions.
- Optional: Docker Desktop (needs WSL2/virtualisation; **unknown** if it works alongside your VirtualBox setup). The prototype does **not** need Docker or Postgres: default `STRATA_STORE=file` (Parquet + sqlite + numpy). PostgreSQL/pgvector is added only if time allows and is claimed in the pitch only if its tests pass.
- Fonts download via `next/font` at build; do the first `npm run build` while online.
- Create `.env` from `.env.example`; never commit it.

## 6. Demo-day safety kit
- `STRATA_MODE=replay` works fully offline; test it with Wi-Fi off.
- Record a **90-second screen capture** of the full hero run as a backup video (OBS or Windows Game Bar).
- Second device with the app pre-opened on the hero incident.
- `npm run demo:reset` before each judge visit.
- Print the 10-step click-through (REVIEW_REPORT) and the one-page Q&A sheet (`06_DEMO_AND_PITCH.md`).
