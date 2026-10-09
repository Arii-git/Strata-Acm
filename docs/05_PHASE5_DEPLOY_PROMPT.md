# Phase 5 — Ship (run ONLY after you have reviewed the prototype and said "go")

This phase turns the reviewed prototype into a hosted app on **Vercel + Supabase with Google sign-in**. You can run it through Codex (prompt below) or ask me — I have Supabase and Vercel connectors in this workspace and can do the project/migration/env/deploy steps directly; the Google Cloud OAuth client is the one step only you can do (it needs your Google account and consent-screen choices).

## What I verified vs what you must verify
- Vercel supports **zero-config FastAPI** (a FastAPI instance named `app` at `app.py/index.py/server.py/main.py`, or `tool.vercel.entrypoint` in `pyproject.toml`); FastAPI becomes **one Vercel Function with a 500 MB bundle limit**; local dev via `vercel dev` (CLI ≥ 48.1.8) [CONTEXT: Vercel docs page last updated 2026-08-27].
- Supabase: Google sign-in via Supabase Auth, pgvector, row-level security — standard features **(verify current dashboard labels when you click through)**.
- Everything else below is a plan, not something I executed.

## Decisions to make before starting (defaults in bold)
1. Hosting layout: **two Vercel projects** (`strata-web` Next.js, `strata-engine` FastAPI) with `ENGINE_URL` — or fold engine endpoints into Next.js route handlers if the engine bundle is too heavy.
2. Data: **Supabase Postgres** with `contracts/schema.sql` + migrations; seed synthetic data via a one-off script; keep `replay` snapshots as the offline fallback.
3. Who may sign in: **email allow-list** (you, Yogesh, judges/mentors you add) stored in the `allowed_emails` table (email → role); a profile row is created at first sign-in **only** if the email is listed, so unlisted accounts have no profile and RLS denies them everything; they see "access requested".
4. LLM keys: server-side only (Vercel env), never exposed to the browser; call budget guard on.

## Codex prompt for Phase 5 (paste after review)

```
ROLE: Release engineer for STRATA. The prototype passed human review. Read AGENTS.md, docs/REVIEW_REPORT.md, docs/05_PHASE5_DEPLOY_PROMPT.md first.
Do NOT change product behaviour or the locked concept. Honesty rules still apply: the app stays labelled SYNTHETIC DATA.

TASKS
1. Supabase: apply contracts/schema.sql as migrations to the Supabase project (extension `vector` enabled). Enable RLS on every table. Policies: authenticated users can SELECT operational tables; INSERT/UPDATE on approvals/workflow_tasks/notebook_entries only when profiles.role permits (operations_manager, qa_head for regulatory-sensitive; notebook_entries only for the author); audit_log is insert-only via a SECURITY DEFINER function; no anonymous access anywhere. Run the Supabase security advisor equivalent and fix findings.
2. Auth: Supabase Auth with the Google provider using @supabase/ssr (PKCE, cookie sessions) in Next.js: /login page (Altygen Console style, tokens only), /auth/callback route, middleware protecting /app/**, sign-out. On first login a database trigger creates a profiles row from the `allowed_emails` table (role comes from that table; there is no default role); unlisted emails get no profile, land on an "Access requested" screen and cannot read data. The PersonaSwitcher becomes role-aware: real role from profiles; "View as" allowed only for business_head/operations_manager and clearly labelled. Never log tokens.
3. Env/config: .env.example updated; Vercel env vars for web (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY — publishable key only) and engine (service role key, DATABASE_URL, LLM/embedding keys). The service-role key must never reach the browser or the web project.
3b. Engine auth (required, not optional): the engine must reject any request that does not carry BOTH a valid Supabase user JWT (verified against the project's JWKS/JWT secret) and the shared secret `ENGINE_SHARED_SECRET` sent by the Next.js server; approval, plan, lab and notebook endpoints additionally check the role from `profiles`. No engine endpoint is reachable anonymously on the public URL. Test with curl (no token → 401; valid user without role → 403).
4. Engine on Vercel: ensure FastAPI entrypoint (app/main.py with `app`), requirements pinned, no torch, bundle < 500 MB, `functions.maxDuration` set for the investigate endpoint (use SSE or polling per Vercel limits); health check. If bundle/runtime limits block it, move engine routes into Next.js route handlers and report why.
5. Seed: one-off `npm run seed:cloud` that loads seed_dev data + memory embeddings into Supabase (idempotent). Replay snapshots shipped as static assets for `STRATA_MODE=replay` fallback.
6. Deploy: Vercel preview first, then production. Run Playwright smoke against the preview URL: landing, login redirect, authenticated briefing, hero flow, replay toggle.
7. Report: docs/DEPLOY_REPORT.md with URLs, env var NAMES (not values), RLS policy summary, what was verified, what failed, rollback steps.

CONSTRAINTS: no secrets in git; no real data; nothing is sent externally by the app; max 2 fix iterations per failing step, then stop and report. STOP after DEPLOY_REPORT.md.
```

## Your manual steps (about 10 minutes, I can walk you through live)
1. **Google Cloud Console** → new/existing project → *APIs & Services → OAuth consent screen* (External; add yourself, Yogesh and testers as test users while in "Testing") → *Credentials → Create OAuth client ID → Web application*.
2. In **Supabase** → *Authentication → Providers → Google*: paste the Client ID and Secret there; copy the **callback URL Supabase shows** and add it as an *Authorized redirect URI* in the Google OAuth client. (It has the form `https://<project-ref>.supabase.co/auth/v1/callback` — copy the exact one shown in your dashboard.)
3. Supabase → *Authentication → URL Configuration*: set **Site URL** to your Vercel production URL and add preview/localhost URLs (`http://localhost:3000/**`) to **Redirect URLs**.
4. In **Vercel**: add the env vars listed above to each project (Production + Preview).
5. Add yourself/Yogesh/mentor emails (with roles) to the `allowed_emails` table.

## Acceptance (what "done" means)
- Google sign-in works end to end on the production URL; an unlisted account cannot read data (verify with a second Google account).
- RLS blocks anonymous reads (test with the anon key and no session).
- Hero flow works on the hosted app; replay toggle works.
- No secret in the repo or browser bundle (grep + browser network check).
- `docs/DEPLOY_REPORT.md` exists and is honest about anything that failed.
