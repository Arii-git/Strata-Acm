# STRATA — phase plan and priority hierarchy (night build, 2026-10-09)

Owner: Arihant Chordia · Yogesh R Mehta. Lead + parallel agent lanes are described in `NIGHT_BUILD.md`.

## Priority hierarchy (what wins when time runs out)

| Tier | Category | Criteria (done when…) | Lane |
|---|---|---|---|
| P1 | Platform: Docker | `docker compose up --build` brings up engine + web; data persists in a volume | docker |
| P2 | Access: email login | register → emailed 6-digit code → verified; password login; passwordless "email me a code"; forgot/reset; alert emails at level ≥ 3 | auth-backend, auth-web |
| P3 | Access: company code + roles | each company has a fixed 6-char join code assigned by us; new users join with it and pick a role; one business head per company; demo login per role | auth-backend, auth-web |
| P4 | UI polish | accordion sidebar (icon + one-liner); STRATA loop loader; dark mode toggle; calm home with scroll sections; decluttered briefing; one-stage-at-a-time case pipeline | shell-ui, home-briefing, case-flow |
| P5 | Simulation lab (the star) | ≥ 6 industries × ≥ 6 scenarios, ≥ 10 issue categories; months-long playback; human gates that change the outcome; with vs without STRATA | sim-lab |
| P6 | Agentic AI | levels 1–5 (default 2); human brought in at ≥ 2; deadlines set by the business head; auto decision at deadline (L1), provisional (L2–3), escalate (L4–5) | agentic |
| P7 | Assistant | "Ask STRATA" panel grounded on engine data; Anthropic when a key is set, cited templates when not | assistant |

## Phases

### Phase 1: tonight (about 4 h)
1. Contracts and stubs (done first so lanes run in parallel without blocking).
2. Nine lanes build in parallel against `NIGHT_BUILD.md`.
3. Lead integration: typecheck, engine tests, run both servers, click through every role, fix seams.
4. Regenerate the replay snapshot and evaluation (`npm run snapshot`, `npm run eval`), then commit.

### Phase 2: after the break (the "max" version)
- Deploy: Supabase (Postgres + Auth with Google SSO, free tier) + Vercel for the web; engine on a container host.
- Custom sender domain (`@strata.si` or similar) once a domain is bought and verified; until then Gmail with an app password.
- Real-world flavour for the simulator: calibrate scenario parameters from public datasets (e.g. Kaggle supply-chain / shipment-delay sets), labelled as such.
- Refresh e2e tests (Playwright) for the new login, sidebar and lab; screenshots for the deck.
- Deck + demo script built around the Simulation lab.

### Phase 3: rehearsal
- Demo reset, timing run, fallback replay mode, Q&A prep (`DEFEND_IT.md`).

## Owner notes captured
- Supabase roles / Google SSO: Google OAuth is free; Supabase Auth's free tier includes Google sign-in. Planned for Phase 2.
- SMTP: Gmail + app password (needs 2-step verification on the Google account).
- Custom `@strata.si` addresses need the domain plus DNS (MX/SPF/DKIM). Gmail is the fallback for tonight.
