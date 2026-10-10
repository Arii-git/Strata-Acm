# Running STRATA on GitHub Codespaces

The repo has a `.devcontainer/` setup: a codespace opens with Docker installed and starts STRATA by itself.

## Once: add your secrets
GitHub → the repo → **Settings → Secrets and variables → Codespaces → New repository secret**. Add each
(values from your local `.env`; never commit `.env`):

| Secret | Needed for |
|---|---|
| `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | logins in Supabase, Google sign-in |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Ask STRATA chat (optional) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | real emails (optional) |
| `STRATA_AUTH_SECRET` | a long random string; keeps people signed in across restarts |
| `STRATA_DEMO_LOGINS` = `0` | only if the link is public and you want to hide the demo password |

Everything is optional: without secrets the app runs with local logins, template answers and an in-app outbox.

## Every time
1. Repo page → **Code → Codespaces → Create codespace on main** (or reopen the existing one).
2. Wait. The first start builds and generates data (about 8–10 minutes); the terminal shows
   `[strata] app link: https://...-3000.app.github.dev`. Later starts take about a minute.
3. **Ports** tab → port 3000 → Visibility **Public** (if the script could not do it) → copy the link.

## Google sign-in
Supabase → Authentication → URL Configuration → add `https://<codespace-name>-3000.app.github.dev/google`
to Redirect URLs. The codespace name stays the same as long as you reuse the same codespace.

## Good to know
- A codespace sleeps after 30 minutes idle (Settings → Codespaces → Default idle timeout, up to 4 hours).
  Reopening it restarts STRATA automatically.
- Free accounts get 120 core-hours a month: about 60 hours on this 2-core machine. Stop it when not demoing.
- Logs: `docker compose logs -f engine`. Restart: `docker compose restart`. Fresh data: `docker compose down -v && docker compose up -d`.
