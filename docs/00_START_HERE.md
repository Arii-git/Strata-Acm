# START HERE — STRATA build pack

**What we are building:** the STRATA Operational Intelligence Console for the manufacturer (nephrology pharma) — your deck's detect → investigate → remember → act → learn loop as a working prototype, hero case Customer #4821, Enterprise enterprise UI, every number computed and explained. Full detail: `01_BLUEPRINT.md`.

## Five things you must know before you start
1. **Time.** Your event is today (Oct 9 live build, Oct 10 pitches). The default scope tier is **Compact** (~10–12 h of Codex time). *Core* (~5–6 h) if you are short on time, *Full* (~20–24 h) only if you really have a full day. Add one line before the prompt to change it (Blueprint §11).
2. **District = 05, confirmed.** The updated official problem-statements PDF (5 districts) lists the manufacturer as **District 05**, matching your deck.
3. **I could not see two things.** (a) the client's real internal tools — nothing public, so the UI is "brand-native" (indigo `#211756`, crimson `#E5310E`, Poppins, measured from their site) and re-skinnable from one file; **ask the mentor which tools they use** (questions in Blueprint §1.1). (b) The judging rubric — the dashboard is behind your SRM login. Paste it to me if it's there.
4. **Human ownership.** Your deck's concept is locked. You told me to add features without asking, so Codex will build the P0/P1 additions in Blueprint §4 — that is a standing approval you can withdraw per feature at review (each is behind a flag). Codex also writes `docs/DEFEND_IT.md`: read it; anything you can't explain, cut. The Engineering Notebook and the memory/SOP items are **yours** to write.
5. **Check the event rules first.** Ask the organisers whether pre-built plans, contracts and scaffolding prepared before the 24 h clock are allowed. If code must start from zero at the opening bell, keep this pack as *planning material* and start Codex when the clock starts.

## 30-minute kickoff checklist
1. **Prepare the repo** (PowerShell; adjust if your Node/Python/Git aren't installed yet):
```powershell
cd E:\SRM\EVENTS\ACM_24hr
mkdir strata; cd strata
git init
mkdir docs, contracts
copy ..\STRATA_BUILD_PACK\AGENTS.md .\AGENTS.md
copy ..\STRATA_BUILD_PACK\0*.md .\docs\
copy ..\STRATA_BUILD_PACK\contracts\* .\contracts\
git add -A; git commit -m "docs: add STRATA build pack"
```
2. Check tools: `node -v`, `python --version` (want 3.12), `git --version`. Docker and Postgres are **not required** — the prototype runs on a file-based store by default. See `04_TOOLKIT.md`.
3. API keys are **optional for the prototype**: everything must work with `LLM_PROVIDER=none` (deterministic cited output, TF-IDF retrieval). Add one LLM key later if you want live agent narration; never paste keys into chat.
4. Connect Playwright MCP and Context7 to Codex if you can (`04_TOOLKIT.md` §3).
5. Start Codex in `E:\SRM\EVENTS\ACM_24hr\strata`, open `docs/02_CODEX_MASTER_PROMPT.md`, paste everything between the COPY lines. The default is Compact; to change it add one line first, e.g. *"Scope tier: Core."*
6. While Codex builds, talk to the the client mentor and **write the answers in the Notebook** (Blueprint §1.1, §10.8).

## What happens next
- Codex runs Phases 0–4 and **stops** with `docs/REVIEW_REPORT.md`.
- Bring me the report and the running app (or screenshots in `tests/screens/`). I'll review it as a judge and as a designer (judge simulation, accessibility, honesty check, UI critique) and give you a fix list; you decide what changes.
- After you say "go", Phase 5 (Vercel + Supabase + Google sign-in) — `05_PHASE5_DEPLOY_PROMPT.md`. I can run most of it via my connectors; the Google OAuth client creation is a few clicks only you can do.

## Files in this pack
| File | Use |
|---|---|
| `00_START_HERE.md` | this page |
| `01_BLUEPRINT.md` | everything: intel, features, architecture, model, UI, phases, risks |
| `AGENTS.md` | standing rules Codex reads automatically (goes in repo root) |
| `02_CODEX_MASTER_PROMPT.md` | the prompt to paste into Codex |
| `03_LANE_PROMPTS.md` | six parallel-agent briefs (data, engine, agents, web-shell, web-features, qa) |
| `04_TOOLKIT.md` | tools, plugins, MCPs, machine prerequisites, demo-day kit |
| `05_PHASE5_DEPLOY_PROMPT.md` | post-review deploy prompt + Google auth steps |
| `06_DEMO_AND_PITCH.md` | 5-minute demo script, judge Q&A, deck fixes |
| `contracts/` | `schema.sql`, `signal_catalog.yaml`, `scenarios.yaml`, `engagement_rules.yaml`, `design-tokens.css` (frozen after Phase 0) |
