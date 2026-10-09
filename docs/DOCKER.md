# Running STRATA with Docker

Two containers, one command. No Python, Node or venv needed on the host.

| Service | Image | URL | What it is |
|---|---|---|---|
| `web` | `strata-web:local` | http://localhost:3000 | Next.js console (standalone server) |
| `engine` | `strata-engine:local` | http://localhost:8000/health · http://localhost:8000/docs | FastAPI engine |

The browser only talks to `web`. `web` proxies `/api/engine/*` to `http://engine:8000` on the
private compose network.

## 1. Install Docker Desktop (Windows, once)

1. Windows 10 22H2+ or Windows 11. Turn on virtualization in BIOS if WSL says it is off.
2. In an admin PowerShell: `wsl --install` then reboot (skip if WSL2 is already there; `wsl --status` shows it).
3. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and keep
   "Use WSL 2 based engine" ticked.
4. Start Docker Desktop and wait for "Engine running". Check in a new terminal:

   ```powershell
   docker --version
   docker compose version   # needs v2.24 or newer
   ```

5. Optional: Settings → Resources → give Docker at least 4 GB RAM (the Next.js build and the data
   generator both like memory).

## 2. Configure (optional)

Everything runs keyless. To set options, copy the example file in the repo root:

```powershell
copy .env.example .env
```

`.env` is read by the **engine** container at start (`env_file`). It is never copied into an image
(`.dockerignore`) and the web container does not get it.

| Want | Put in `.env` |
|---|---|
| Real email (OTP, password reset, alerts) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (Gmail: an app password). Without them mail goes to the in-app outbox and the engine log. |
| Assistant on Gemini | `GEMINI_API_KEY` and `GEMINI_MODEL` (e.g. `gemini-3.5-flash-lite`). Both are needed; without them the assistant answers from cited templates. |
| Auth / admin | `STRATA_AUTH_SECRET` (token signing), `STRATA_ADMIN_KEY` (for `POST /admin/companies`) |
| Links in emails | `APP_URL` (default `http://localhost:3000`) |
| Engine options | `STRATA_MODE`, `STRATA_SEED`, `STRATA_FEATURES`, `SIM_NOW`, ... |
| Other host ports | `WEB_PORT=3001`, `ENGINE_PORT=8001` (then set `APP_URL=http://localhost:3001`) |

The variable names for SMTP and the assistant are owned by the engine modules (`mailer.py`,
`assistant.py`); any name you put in `.env` reaches the engine. Secrets can also come from your
shell for the named keys above, e.g. `$env:GEMINI_API_KEY="..."; docker compose up`.

Never commit `.env`. Docker never prints its values; `docker compose config` does, so do not paste that output.

`STRATA_STORE_DIR` and `STRATA_STATE_DB` are fixed inside the container (`/app/data/store`) and
`ENGINE_URL` in `.env` is ignored by Docker (it is for local `npm run dev`).

## 3. Run

From the repo root:

```powershell
docker compose up --build
```

- First run builds both images (about 3-6 minutes) and then the engine **generates the demo data**
  (seed A + hold-out + one estate per extra demo company + eval report, about 2-3 minutes).
  Log line: `[strata] first boot: generating data`.
- `web` waits until the engine is healthy, then starts. Open http://localhost:3000.
- Later runs reuse the data: `docker compose up` (add `-d` to run in the background; `docker compose logs -f` to watch).

Stop: `Ctrl+C`, or `docker compose down` if you used `-d`. Data is kept.

## 4. Reset data

| Goal | Command |
|---|---|
| Restore simulated demo state (keeps users, notebook, human memory) | `docker compose exec engine python scripts/demo_reset.py` then `docker compose restart engine` |
| Wipe everything (users, companies, audit, generated data) and re-seed on next start | `docker compose down -v` then `docker compose up` |
| Rebuild after code changes | `docker compose up --build` |

The data lives in the named volume `strata_strata-store`, mounted at `/app/data/store` in the engine
(`seed_dev/`, `seed_holdout/`, `seed_brightcart/`, `seed_meridian/`, `eval_latest.json`, `state.db` plus one `state_<company>.db` per extra company). It is separate from your local
`data/store/` folder; the two never mix.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` / `bind: address already in use` | Something (often `npm run dev`) holds 3000 or 8000. Stop it, or set `WEB_PORT` / `ENGINE_PORT` in `.env`. Find the owner: `netstat -ano \| findstr :3000`. |
| `web` sits in "Waiting" for a few minutes on first run | Normal: the engine is generating data. `docker compose logs -f engine`. |
| `dependency failed to start: container strata-engine-1 is unhealthy` | Read `docker compose logs engine`. Usually the seed ran out of memory: raise Docker's RAM, then `docker compose down -v` and `docker compose up`. |
| `env_file ... required` error, or "Additional property required is not allowed" | Compose is older than v2.24. Update Docker Desktop, or create `.env` (`copy .env.example .env`) and change the `env_file` entry to `- .env`. |
| UI loads but every panel errors (`/api/engine/...` 500) | Engine is down or restarting: `docker compose ps`, `docker compose logs engine`. |
| Changed `ENGINE_URL` / rewrites but nothing changes | Next.js bakes rewrites into the build. Run `docker compose build web` (the value is the `ENGINE_URL` build arg in `docker-compose.yml`). |
| Build fails in `next build` with a type error | Same check as `npm run check` (tsc). Fix the type error and rebuild. Lint does not block the Docker build. |
| `exec /usr/local/bin/strata-entrypoint: no such file` | Should not happen (the script is written inside the image with LF endings). Rebuild with `docker compose build --no-cache engine`. |
| Very slow first build on Windows | Keep the repo on a local NTFS drive; exclude it from antivirus scanning if you can. |

## How it is put together

- `services/engine/Dockerfile`: `python:3.12-slim`, runtime deps from `services/engine/requirements.txt`
  (pytest/ruff skipped), the repo layout mirrored under `/app` (`contracts/`, `config/`, `data/generator.py`, `data/profiles.py`,
  `data/memory_seed/`, `data/snapshots/`, `docs/`, `scripts/`, `services/engine/`). The entrypoint seeds once
  if `/app/data/store/seed_dev/orders.pkl` or `seed_holdout/manifest.json` is missing, then runs
  `uvicorn strata_engine.app:app` on `0.0.0.0:8000` with a single worker. Runs as uid 10001. Healthcheck: `GET /health`.
- `apps/web/Dockerfile`: `node:22-alpine`, three stages (`npm ci` → `next build --no-lint` with `config/` at
  `../../config` → standalone runtime). `next.config.ts` sets `output: "standalone"` and
  `outputFileTracingRoot` = repo root, so the server is `apps/web/server.js`. Runs as `node` on `0.0.0.0:3000`.
- `ENGINE_URL` for the web image is a **build arg** (`http://engine:8000`): Next.js writes rewrite destinations
  into `.next/routes-manifest.json` at build time and the standalone server reads them from there. The runtime
  `ENGINE_URL` env is also set for any future server-side code, but it does not move the rewrite.
- `config/` is only needed at build time; its TypeScript is compiled into the web bundle.

## 6. Deploying online (after the review)

The stack needs about **1.5 GB RAM** at runtime (pandas + four data estates in the engine) and a few minutes to
seed on first boot. Pick by what you need:

| Need | Use | Steps |
|---|---|---|
| A link for judges **today**, least effort | **GitHub Codespaces** (free hours on personal accounts) | Push the repo → Code → Codespaces → *Create codespace*. In its terminal: `cp .env.example .env`, add keys, `docker compose up --build`. In the **Ports** tab set port 3000 to *Public* and share that URL. It stops when the codespace sleeps. |
| A stable URL that survives restarts | **One small VM** (any cloud; 2 vCPU / 4 GB) | Install Docker, `git clone`, create `.env`, `docker compose up -d --build`. Put Caddy in front for HTTPS (`caddy reverse-proxy --from your.domain --to localhost:3000`). Only port 443 open; never expose 8000. |
| Managed containers | Render / Railway / Fly.io | Two services from the two Dockerfiles. The web image must be **built** with `--build-arg ENGINE_URL=<engine's private URL incl. port>` (a runtime env var does not move Next.js rewrites). Choose an instance with ≥1 GB RAM for the engine and a persistent disk at `/app/data/store`; free tiers usually sleep or run out of memory. |

Before any public deployment: set `STRATA_DEMO_LOGINS=0`, a long random `STRATA_AUTH_SECRET`, change or remove
the shared demo password, and keep keys only in the platform's secret store (never in the repo or an image).

## npm shortcuts

If present in the root `package.json`: `npm run docker:up`, `npm run docker:down`, `npm run docker:logs`,
`npm run docker:reset`.
