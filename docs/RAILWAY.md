# Deploying STRATA on Railway

STRATA is two services from one repo: **engine** (Python, `services/engine/Dockerfile`) and **web**
(Next.js, `apps/web/Dockerfile`). Both build from the repo root. Railway's auto-detect (Railpack) sees a
Node project at the root and fails ("no start script"), so each service must be told to use its Dockerfile.

## 1. Engine service
1. New Project → Deploy from GitHub repo → pick the repo. Rename the service to `engine`
   (the web service refers to it by this name).
2. **Variables** → add:
   - `RAILWAY_DOCKERFILE_PATH` = `services/engine/Dockerfile`
   - everything from your `.env` the engine needs: `GEMINI_API_KEY`, `GEMINI_MODEL`, `SMTP_*`,
     `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `STRATA_AUTH_SECRET` (long random),
     `APP_URL` (the web URL from step 2, add it after)
   - `STRATA_DEMO_LOGINS` = `0` if the site is public (hides the shared demo password)
3. **Settings → Networking:** no public domain needed; the web service reaches it privately.
4. Deploy. The first boot generates the demo data (about 3 minutes) before it answers.
   Optional: add a **Volume** mounted at `/app/data/store` so the data survives redeploys; then also add
   the variable `RAILWAY_RUN_UID` = `0` (the image runs as a non-root user and Railway volumes are root-owned).

## 2. Web service
1. In the same project: **+ New → GitHub Repo** → the same repo. Rename it `web`.
2. **Variables** → add:
   - `RAILWAY_DOCKERFILE_PATH` = `apps/web/Dockerfile`
   - `ENGINE_URL` = `http://${{engine.RAILWAY_PRIVATE_DOMAIN}}:8000`
     (Railway passes it to the Docker build; Next.js bakes it in at build time, so redeploy web after changing it)
3. **Settings → Networking → Generate Domain** (port 3000 if asked). This is your public link.
4. Deploy, then put that link into the engine's `APP_URL` and redeploy the engine.

## 3. Supabase (Google sign-in)
Supabase → Authentication → URL Configuration: set Site URL to the Railway web link and add
`https://<your-web-link>/google` to Redirect URLs.

## Notes
- Memory: the engine needs about 2 GB RAM (four data estates in pandas). The trial plan may be too small.
- Never commit `.env`; set secrets in Railway Variables only.
- Railway can reach Supabase's database port, so the network blocking seen on campus Wi-Fi does not apply.
