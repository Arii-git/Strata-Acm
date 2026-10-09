# STRATA — Operational Intelligence Console

STRATA is a prototype for The Industry Games 2026, District 05: Intelligent Business Operations & Customer Engagement.
It helps a business team move from a changed signal to evidence, a human-approved plan and a documented outcome.

Team: **Arihant Chordia** and **Yogesh R Mehta**.

All companies, people and numbers in this repository are fictional. Workflow messages never leave the prototype;
the only outbound traffic is login/alert email (when SMTP is configured) and Gemini calls (when a key is set).

---

## Project status (2026-10-10)

| Area | State | Notes |
| --- | --- | --- |
| Landing flow (starter → how it works → tutorial → portals → login) | Built | `apps/web/src/app/page.tsx` |
| Email login, OTP, password reset, alert emails | Built | Works keyless (codes shown on screen); real mail needs a Gmail **app password** |
| Company join codes (Google-Classroom style, fixed 6 chars) | Built | Codes are assigned by us and never regenerated |
| Sidebar accordion, loop loader, dark mode, page transitions | Built | |
| Simulation Lab (industries × issue categories, months-long playback) | Built | Outcomes are illustrative, not measured |
| Agentic risk levels 1–5, deadlines, auto-decisions | Built | See [Where agentic AI is used](#where-agentic-ai-is-used) |
| Gemini assistant (floating button on every console page) | Built | Needs `GEMINI_API_KEY` + `GEMINI_MODEL`; falls back to cited templates |
| Docker | Built, not re-verified | `docker compose up --build` |
| Supabase, Google SSO, `@strata.si` sender domain | **Not started** | Phase 2 (needs a bought domain + DNS) |

**Not yet verified after the last editing session.** Everything after commit `a73eaaf` (Version-2) is uncommitted
and has not been type-checked or tested. Run `npm run check` and `npm run e2e` before the demo.

---

## How the app flows

1. **Company starter** — what STRATA is, in one screen.
2. **How STRATA works** — the Observe → Detect → Investigate → Remember → Act → Learn loop.
3. **Guided tutorial** — how to move through briefing, cases and approvals.
4. **Login** — two portals:
   - **Company Portal** for the Business Head (company admin, sees the join code, sets agent deadlines).
   - **User Portal** for team members (operations, accounts, sales, support, QA).
5. **Console** — the role you signed in as decides what you see. To show another role, log out and log in as a different user.

### Joining a company

Each company has a fixed six-character join code (A–Z, 2–9, no look-alikes 0/O/1/I). We assign it; it never changes.
A new user registers with any email (Gmail is fine), enters the company's code, picks a role, and verifies with
a 6-digit emailed code.

---

## Sample companies and users

Three fictional companies, six users each (one per role). **Password for every demo account: `Strata-Demo-2026`.**
These accounts use the non-routable `demo.strata.local` domain, so no real mail is ever sent to them.
Full reference: [docs/SAMPLE_ACCESS.md](docs/SAMPLE_ACCESS.md). Source of truth: [config/demo_companies.yaml](config/demo_companies.yaml).

| Company ID | Company | Industry | Join code |
| --- | --- | --- | --- |
| `co_renalis` | Renalis Pharma Distribution | Pharma & healthcare distribution | `RNL7K2` |
| `co_brightcart` | BrightCart Consumer Goods | FMCG | `FMC8Q4` |
| `co_meridian` | Meridian Freight & Logistics | Logistics | `LGX5T9` |

| Role | Portal | Renalis | BrightCart | Meridian |
| --- | --- | --- | --- | --- |
| Business Head | Company | `business.head@demo.strata.local` | `head@brightcart.demo.strata.local` | `head@meridian.demo.strata.local` |
| Operations Manager | User | `operations@demo.strata.local` | `ops@brightcart.demo.strata.local` | `ops@meridian.demo.strata.local` |
| Account Manager | User | `accounts@demo.strata.local` | `accounts@brightcart.demo.strata.local` | `accounts@meridian.demo.strata.local` |
| Sales Manager | User | `sales@demo.strata.local` | `sales@brightcart.demo.strata.local` | `sales@meridian.demo.strata.local` |
| Support Manager | User | `support@demo.strata.local` | `support@brightcart.demo.strata.local` | `support@meridian.demo.strata.local` |
| QA Head | User | `qa@demo.strata.local` | `qa@brightcart.demo.strata.local` | `qa@meridian.demo.strata.local` |

Set `STRATA_DEMO_LOGINS=0` before any public deployment so the shared password is not shown on the sign-in page.

---

## Run locally

You need Node 20+ and Python 3.12. No API key, Docker or database server is needed for the basic demo.

```powershell
copy .env.example .env      # all values optional
npm run setup
npm run dev
```

Open `http://localhost:3000`.

| Command | What it does |
| --- | --- |
| `npm run seed` | Generate and load the synthetic dataset |
| `npm run snapshot` | Write the replay JSON (offline demo mode) |
| `npm run eval` | Evaluate on seed A and hold-out seed B |
| `npm run check` | Lint, typecheck, unit, schema and honesty checks |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run demo:reset` | Restore demo state (keeps human-written notes) |
| `npm run routines:tick` | Advance standing routines on the sim clock |

### Optional: real email

Gmail needs 2-step verification and a 16-character **app password** (Google Account → Security → App passwords).
Your normal Gmail password will not work. Put these in `.env` only:

```dotenv
SMTP_USER=you@gmail.com
SMTP_PASSWORD=xxxxxxxxxxxxxxxx
SMTP_FROM=you@gmail.com
```

Without SMTP, mail goes to an in-app outbox and sign-up codes are shown on screen.

### Optional: Gemini assistant

```dotenv
GEMINI_API_KEY=your_key
GEMINI_MODEL=your_selected_model
```

The **Ask STRATA** button floats bottom-right on every console page. Gemini only sees a compact evidence packet built
by STRATA's typed, read-only query functions. Any sentence without a valid evidence ID, or with a number it was not
given, is dropped and replaced by the deterministic cited answer. Check `GET /assistant/status` to confirm the key loaded.

---

## Where agentic AI is used

Risk levels: **1 Low · 2 Moderate (default) · 3 Elevated · 4 High · 5 Critical.** A human is pulled in from level 2.
The Business Head sets the decision deadline per level. If nobody decides in time:
level 1 is decided automatically; levels 2–3 get a reversible provisional step; levels 4–5 are escalated by email.

| Agent | Job | Autonomy |
| --- | --- | --- |
| Sentinel | Watches order, support, CRM, inventory and finance signals; opens a case when several agree | Suggests |
| Investigator | Ranks likely causes from evidence and past cases | Suggests |
| Memory | Finds similar past cases, SOPs and rejected plans | Suggests |
| Orchestrator | Drafts a plan with owners, due times and unsent drafts | Acts with approval |
| Risk Triage | Assigns level 1–5 with reasons | Suggests |
| Deadline Guardian | Takes the decision the policy allows when a deadline passes | Acts at deadline |
| Escalation | Raises the level on repeat alerts; emails up the hierarchy | Acts at deadline |
| Briefing writer | Today / yesterday / last-week digest and "what you missed" | Suggests |
| Assistant | Answers questions with citations | Suggests |
| Simulation narrator | Explains each scenario week by week, with and without STRATA | Suggests |

Live registry: `GET /agentic/agents`, shown on the **Agents** page.

---

## Simulation Lab

Pick an industry and an issue (natural disaster, late shipment / port congestion, damage in transit, quality recall,
and more), then play it forward over weeks. Each run shows baseline vs. without STRATA vs. with STRATA, the human
decision points, and the risk level at each step. These are scripted what-if outcomes (provenance `illustrative`),
not measured results. Scenario definitions: `services/engine/strata_engine/simulation.py`.

---

## Deploying online

Deployment is a post-review step. Never commit keys; set them in the host's dashboard.

| Option | Best for | Cost | Notes |
| --- | --- | --- | --- |
| **GitHub Codespaces** | Live demo from a browser | Free monthly hours | Push to GitHub → Code → Codespaces → `docker compose up --build`; forward port 3000 |
| **Render** | A permanent judge link | Free tier available | Two Docker web services (engine, web). Free tier sleeps when idle and has no persistent disk |
| **Railway / Fly.io** | Permanent link, faster cold start | Small paid credit | Both run the existing Dockerfiles directly |
| **Vercel (web) + Render (engine)** | Fastest web front end | Free tiers | Set `ENGINE_URL` on Vercel to the engine's public URL |

Step by step: [docs/DOCKER.md](docs/DOCKER.md) (local Docker) and [STRATA_DOCKER_WEB_DEPLOY.md](STRATA_DOCKER_WEB_DEPLOY.md) (Codespaces / Render).
Before going public: set `STRATA_DEMO_LOGINS=0`, set `STRATA_AUTH_SECRET`, and use a fresh app password.

---

## Real data sources (not imported)

The prototype uses synthetic data on purpose. Candidate public sources, to review for license and privacy first:

- **Orders and customers** — UCI Online Retail; Kaggle "Olist Brazilian E-Commerce"
- **Supply chain and delivery delays** — Kaggle "DataCo Smart Supply Chain"; Kaggle "E-Commerce Shipping Data" (on-time vs late)
- **Customer support** — Kaggle "Customer Support Ticket Dataset"
- **Natural disasters** — EM-DAT (registration required); IMD / NDMA open data for India; ReliefWeb
- **Ports and logistics** — World Bank Logistics Performance Index; UNCTAD port statistics
- **Macro context** — World Bank Open Data; data.gov.in

Mapping steps and cautions: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

---

## Project layout

- `apps/web/` — Next.js console and the landing/onboarding flow.
- `services/engine/strata_engine/` — FastAPI engine: detection, agents, auth, mailer, digest, simulation, assistant.
- `data/` — deterministic synthetic-data generator and seeded memory.
- `config/demo_companies.yaml` — fictional companies, join codes and demo users.
- `contracts/` — frozen database, signal, engagement and design contracts.
- `docs/` — blueprint, phase plan, access reference, Docker and data-source guides.
