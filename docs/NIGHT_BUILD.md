# Night build — shared contract (read fully before touching code)

This file supersedes the lane ownership in `AGENTS.md` §6 for the night build. The honesty rules in `AGENTS.md` §2
still apply (provenance labels; simulation outcomes are `illustrative`; LLM text never invents numbers), with these
**explicit owner overrides** (decided by the human owner, Arihant):

- Real email may leave the machine **only** through `mailer.py` when `SMTP_*` env vars are set (Gmail + app password).
  With no SMTP config, mail goes to an in-app outbox and the engine log. Never print SMTP passwords or API keys.
- Login/registration is in scope (self-hosted in the engine; sqlite). Google SSO / Supabase / Vercel are Phase 2.
- An LLM provider (Gemini, owner decision 2026-10-10) may be called by the assistant when `GEMINI_API_KEY` and `GEMINI_MODEL` are set. Keyless must still work.
- Docker is in scope. Dark mode is in scope (tokens only; still no hex outside token files).
- The product is STRATA. The old placeholder client name has been removed everywhere; do not reintroduce it. Demo clients are fictional.

## Priorities (owner order)
1. Docker. 2. Email login + OTP + password reset + email alerts. 3. Company join code (Google-Classroom style) + roles.
4. UI polish (sidebar accordion, loader, dark mode, home/briefing declutter, clean case pipeline).
5. Simulation lab = the star of the demo. 6. Agentic risk levels 1–5 with deadlines and auto-decisions. 7. Assistant chatbot.

## Rules for every agent
- Edit **only** files you own (table below). Need something elsewhere? Write it in your final report; the lead integrates.
- **Do not commit, do not run `git` write commands.** The lead commits.
- **Do not run `next dev`, `next build`, or start servers on ports 3000/8000.** Other agents share the tree. Verify web code
  with `node apps/web/node_modules/typescript/bin/tsc -p apps/web --noEmit` (other lanes may be mid-edit; only fix errors
  in your files). Verify engine code with `node scripts/py.mjs -m pytest -q tests/engine/<your_test>.py` and FastAPI
  `TestClient` (conftest already isolates the state DB). Python: `node scripts/py.mjs ...` (uses `.venv`).
- No new npm dependencies unless your lane says so. Python: stdlib + what's in `services/engine/requirements.txt`
  (the assistant lane may add `anthropic`).
- Colours only via CSS variables from token files. Icons: `@tabler/icons-react`. Motion 150–300 ms ease-out,
  respect `prefers-reduced-motion`.
- Writing style in the UI: short, plain, calm. One-line headings, generous whitespace, max ~60–70 characters per line
  for prose, no walls of text. Progressive disclosure (details behind "More" / drawers) instead of dumping everything.
- Engine routers: create `services/engine/strata_engine/<name>.py` exporting `router = APIRouter(...)`. `app.py` already
  auto-mounts modules named `auth, mailer, agentic, assistant, digest, simulation`. Don't edit `app.py`; import helpers
  from it lazily inside functions if needed (`from .app import E, ranked, sim_clock, ...`) to avoid circular imports.
- Roles (keys unchanged): `operations_manager, account_manager, sales_manager, support_manager, business_head, qa_head`.
  `business_head` is the top of the hierarchy (company admin).

## Ownership
| Lane | Owns |
|---|---|
| auth-backend | `strata_engine/auth.py`, `strata_engine/mailer.py`, `config/demo_companies.yaml`, `tests/engine/test_auth.py` |
| auth-web | `apps/web/src/app/page.tsx`, `apps/web/src/app/(auth)/**`, `apps/web/src/app/app/layout.tsx`, `apps/web/src/app/app/settings/**`, `apps/web/src/lib/auth.tsx`, `apps/web/src/lib/persona.tsx`, `apps/web/src/lib/api/client.ts`, `apps/web/src/styles/lanes/auth.css` |
| shell-ui | `apps/web/src/components/shell/**`, `apps/web/src/components/ui/**`, `apps/web/src/styles/*.css` (not other lanes' lane files), `styles/lanes/{a11y,pages,theme-dark}.css`, `apps/web/src/lib/theme/**`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/app/loading.tsx`, `apps/web/src/app/app/help/**` |
| home-briefing | `apps/web/src/app/app/page.tsx`, `apps/web/src/app/app/briefing/**`, `apps/web/src/app/app/how-it-works/**`, `apps/web/src/components/features/home/**`, `apps/web/src/components/diagrams/LoopDiagram.tsx`, `styles/lanes/home.css`, `strata_engine/digest.py`, `tests/engine/test_digest.py` |
| case-flow | `apps/web/src/app/app/{incidents,cases,problems,risks}/**`, `apps/web/src/components/features/{workbench,problems,events}/**`, `styles/lanes/{case,problems}.css` |
| agentic | `strata_engine/agentic.py`, `tests/engine/test_agentic.py`, `apps/web/src/components/features/agentic/**`, `apps/web/src/app/app/approvals/**`, `apps/web/src/app/app/agents/**`, `styles/lanes/agentic.css` |
| assistant | `strata_engine/assistant.py`, `tests/engine/test_assistant.py`, `apps/web/src/components/features/assistant/**`, `styles/lanes/assistant.css` |
| sim-lab | `strata_engine/simulation.py`, `tests/engine/test_simulation.py`, `apps/web/src/app/app/lab/**`, `apps/web/src/components/features/lab/**`, `styles/lanes/lab.css` |
| docker | `Dockerfile*`, `docker-compose.yml`, `.dockerignore`, `apps/web/Dockerfile`, `services/engine/Dockerfile`, `apps/web/next.config.ts`, `docs/DOCKER.md` |
| lead | everything else (`app.py`, `package.json`, `.env.example`, `README.md`, `docs/*` other than lane docs, `nav.ts` wiring review, integration) |

## Shared web interfaces (stubs exist; owners replace the bodies, keep names/props)
- `@/lib/auth` → `AuthProvider`, `useAuth(): {user, token, loading, login, logout, refresh, setSession}`, `getToken()`, `AuthUser`.
- `@/components/ui/Loader` → `StrataLoader({label?, size?: "sm"|"md"|"lg", fullscreen?})` — the animated STRATA loop.
- `@/components/features/assistant` → `AssistantDock()` (shell mounts it once, bottom-right).
- `@/components/features/agentic` → `RiskLevelBadge({level, compact?})`, `DeadlineCountdown({deadline, mode?})`, `type RiskLevel`.
- `@/lib/theme` → `ThemeProvider`, `useTheme(): {theme, resolved, setTheme}`. `PolicyEditor()` also exported from agentic.
- Theme: `<html data-theme="light|dark">`; tokens redefined under `[data-theme="dark"]` in `styles/lanes/theme-dark.css`.

## Engine API contract (new)
Auth header for new endpoints: `Authorization: Bearer <token>`. Web calls go through `/api/engine/*`.

### auth.py / mailer.py
- `GET  /auth/companies/lookup?code=AB12CD` → `{code, name, industry}` (404 if unknown). Codes: 6 chars, `[A-Z0-9]`, fixed, assigned by us.
- `POST /auth/register {name, email, password, company_code, role}` → `{status:"verify_required", email, dev_code?}`
- `POST /auth/verify {email, code}` → `{token, user}`
- `POST /auth/login {email, password}` → `{token, user}` (403 `{detail}` if not verified)
- `POST /auth/otp/request {email}` → `{status:"sent", dev_code?}`; `POST /auth/otp/verify {email, code}` → `{token, user}` (passwordless "email me a code")
- `POST /auth/password/forgot {email}` → `{status:"sent", dev_code?}`; `POST /auth/password/reset {email, code, new_password}` → `{status:"ok"}`
- `GET  /auth/me` → `{user}`; `PATCH /auth/me/prefs {theme?, email_alerts?}` → `{user}`; `POST /auth/logout`
- `GET  /auth/company` (any member; code only for business_head) → `{company:{id,name,industry,code?}, members:[{name,email,role,role_label,verified}]}`
- `GET  /auth/demo-accounts` → `[{email, role, role_label, company_name}]` (demo users, one per role; password in `config/demo_companies.yaml`)
- `POST /admin/companies {name, industry, code?}` header `X-Admin-Key: $STRATA_ADMIN_KEY` → `{company}` (we assign codes)
- `GET  /mail/outbox` (business_head) → last 50 mails `{to, subject, sent_via:"smtp"|"outbox", at}`
- `dev_code` is returned only when SMTP is not configured (keyless demo). Codes: 6 digits, 10 min, 5 attempts.
- `mailer.notify(company_id, roles:list[str], subject, body, *, min_pref="email_alerts")` — used by agentic.
- `user` = `AuthUser` above (`company_code` only for business_head).

### agentic.py (levels: 1 Low · 2 Moderate (default) · 3 Elevated · 4 High · 5 Critical)
- `GET  /agentic/policy` → `{default_level:2, human_threshold:2, deadlines_hours:{"1":..,"5":..}, auto_decide_max_level:1, provisional_max_level:3, email_min_level:3, updated_by, updated_at}`
- `PUT  /agentic/policy` (business_head; token or `?persona=business_head`) → policy
- `GET  /agentic/levels?persona=` → `{items:[{ref, title, level, level_label, reasons:[str], alerts_count, decision_deadline, mode:"auto"|"provisional"|"human_only", status:"awaiting_human"|"auto_decided"|"provisional"|"decided"|"escalated", auto_decision?:{decision, rationale, at, evidence_ids}}], policy}`
- `POST /agentic/levels/{ref}/override {level, reason}`; `POST /agentic/tick` (evaluate deadlines on sim clock)
- `GET  /agentic/agents` → registry `[{key, name, job, where:[page hrefs], autonomy, saves}]` ("where agentic AI is used")

### digest.py
- `GET /digest?persona=&period=today|yesterday|week` → `{period, label, headline, numbers:[{id,label,value,unit,provenance,meaning}], highlights:[{text, href, evidence_ids}], missed:[{text, at, href}], pipeline:[{stage,count}], series:[{name, points:[[iso, value]]}]}`

### assistant.py
- `GET /assistant/status` → `{configured, provider, model}`; `POST /assistant/chat {messages:[{role,content}], persona, page?}` → `{reply, citations:[{id,label,href}], provider}`

### simulation.py
- `GET /sim/catalog` → `{industries:[{key,label,blurb}], categories:[{key,label}], scenarios:[{id, industry, category, title, one_liner, trigger, horizon_weeks}]}`
- `POST /sim/run {scenario_id, horizon_weeks?, seed?}` → `{scenario, weeks:[...], series:{baseline, without_strata, with_strata}, events:[{week, day?, stage, title, detail, risk_level, actor, decision?}], kpis:[...], summary, provenance:"illustrative"}`
