# STRATA — Build Blueprint (v0.1)

Team STRATA · Arihant Chordia, Yogesh R Mehta · The Industry Games 2026 · Sponsor: Altygen Biopharm · Problem: *Intelligent Business Operations & Customer Engagement*

Label legend (your rule): **[DIRECT]** stated by a source · **[CONTEXT]** available in the files/web · **[INFERENCE]** careful reasoning, not verified · **[UNKNOWN]** we do not know yet. Nothing below presents an inference as a fact.

---

## 0. What we are building, in one paragraph

**STRATA Operational Intelligence Console** — an operations-management layer (it manages work through tasks, approvals and standing routines on top of existing systems) and a working prototype of the "AI operational nervous system" on your deck: it watches a synthetic-but-realistic nephrology-pharma data estate (orders, support, inventory, field activity, receivables, SOP/incident documents), **detects** cross-system risks and opportunities, **investigates** the likely cause with four agents that must cite evidence, **remembers** what happened last time (pgvector RAG), proposes an **action plan that only a human can approve**, creates the workflow, and **learns** from the measured outcome. Hero scenario is exactly your deck's Customer #4821. The UI is an Altygen-branded enterprise console, not a chat app. Everything on screen is computed from seeded data, labelled with its provenance, and explained in one light caption underneath.

Phase 1–3 are your deck's *Detect → Reason → Act*. We add Phase 0 (contracts + scaffold) and Phase 4 (polish + demo hardening). Phase 5 (Vercel + Supabase + Google sign-in) happens only after you have reviewed the prototype.

---

## 1. Status board — what is verified and what is not

| Item | Status |
|---|---|
| Altygen HQ Gurugram; name from "Adding Life To Years for Generations"; "Quality and People" | [DIRECT] company site |
| Nephrology/renal-care focus: electrolyte, renal nutrition, CKD-MBD, renal anemia, renal medicine, pain; ~25 products listed | [DIRECT] company site |
| Claims cGMP / WHO-GMP / FSSAI certified facilities; manufacturing partners not named | [DIRECT] company site / [UNKNOWN] who and where |
| Sells via pharmacies and medical stores; stakeholders: healthcare professionals, patients, channel partners, own team | [DIRECT] company site |
| Incorporated 3 Oct 2023 (≈3 years old) | [CONTEXT] third-party MCA listing; verify on MCA |
| Brand: Poppins, indigo ≈ #211756, crimson ≈ #E5310E | [DIRECT] measured from the site's computed CSS |
| Listed as "Internship Sponsor / Applied Tech Partner … bridging computational intelligence and modern biotechnology" | [DIRECT] Industry Games site |
| Sector shift: after the 2025 cough-syrup contamination deaths, DCGI told state regulators to enforce revised Schedule M GMP (by Jan 2026); MSME deadline had been extended to 31 Dec 2025 | [CONTEXT] news summaries (Drishti IAS 13 Nov 2025; DT Next). Whether it touches Altygen directly depends on who manufactures for them → [UNKNOWN] |
| Altygen's internal tools (ERP/CRM/WhatsApp/Excel) | **[UNKNOWN]** — nothing public. WhatsApp is on their website (a WhatsApp contact button) [DIRECT]; use of Tally/Marg/Zoho/Salesforce is [INFERENCE] only |
| Judging rubric | **[UNKNOWN]** — dashboard is login-gated (SRM email); I did not and cannot sign in for you |
| Timeline | [DIRECT] site: Oct 9 live hackathon + evaluation; Oct 10 pitches + awards. **Today is Oct 9.** |
| District label | **District 05 — confirmed** against the updated 5-district official problem-statements PDF (Altygen Biopharm · Intelligent Business Operations & Customer Engagement) |
| Deck's figures (73%, 33%, 39%, 61%) | [CONTEXT] cited to Salesforce 2024 / McKinsey 2025 in your deck; I did not re-verify them |

### 1.1 Ask the Altygen mentor today (this converts guesses into evidence, and judges notice it)
1. What do you use today for orders/billing, inventory, CRM/field reports? (Tally, Marg, Busy, Zoho, Salesforce, Excel, WhatsApp?)
2. When you say "customer", who is it — stockist, chemist chain, hospital pharmacy, doctor? (We assume B2B channel accounts and use prescribers only as signals; no patient data.)
3. What surprised you most in the last quarter that you found out late?
4. How do quality complaints and suspected adverse events reach your QA person today?
5. Who approves an escalation (supplier, credit hold, stock transfer)?
6. How many channel partners and field reps do you have? (we scale the synthetic data to a plausible shape)
7. What do management review every Monday?
8. Which one screen do you wish existed?
9. Can you share a **sample export** (even 20 fake rows) or just the **column names** of your orders/invoice report, so our field mapping is real?
10. What is a **rupee figure** for "one stockist quietly lost" that you find realistic? (we use it only as a labelled assumption)
11. (Ask the organisers, not the sponsor) Are **pre-built docs/plans/contracts/prototype code** allowed before the 24 h clock? Your build pack and repo scaffolding were prepared before the event; check the rules so you are never disqualified over it.

Write their answers into the Engineering Notebook (§10.8). If they name tools, we re-skin `design-tokens.css` and the table density/field names to match (one file).

---

## 2. Company stalk → what they want, what they need, what they struggle with

**Primary objective** [DIRECT]: quality medicines and services for people with kidney disease, delivered through channel partners to healthcare professionals and patients — "Adding Life To Years".

**Recent shifts** (all [CONTEXT] unless noted):
- A young company (≈3 yrs) with a catalogue that grew to ~25 SKUs, with newer entries (Prumia Gel Advanced, TR Aldosis, CilniCCB, DeliDAPA) [DIRECT: listed; launch dates UNKNOWN]. Growth in SKUs × accounts × reps multiplies the number of things that can quietly go wrong.
- India's post-2025 regulatory tightening on batch-level quality (Schedule M enforcement) raises the cost of a late-noticed quality pattern.
- They are signalling appetite for computational intelligence by sponsoring this event as an "Applied Tech Partner" [DIRECT].

**What they asked for** [DIRECT, problem statement]: process automation, customer data analysis & personalisation, actionable opportunities, workflow management, relationship management, cross-team coordination, activity monitoring, proactive alerts, AI decision support, scalable dashboards.

**What they probably need** [INFERENCE — validate with mentor]:
- **Chronic-therapy continuity.** Kidney-care products are taken long-term; a pharmacy reordering later is an early sign patients are dropping or switching. Most small companies see this only as "sales were low last quarter".
- **Batch-level traceability of complaints and expiry** — one bad batch or one near-expiry pile is the expensive surprise in pharma.
- **Small-team knowledge loss** — in a 3-year-old company, "how we fixed it last time" lives in a few heads and WhatsApp threads (your deck's "lost organizational knowledge").
- **Cash-flow visibility at the channel** — late-paying stockists + falling orders is a classic stress pattern.
- **Doctor/field coverage** — prescribers who stop being visited prescribe less, slowly.

**What they struggle with** [INFERENCE]: signals in separate files/apps, people joining dots by hand, alerts without owners, and decisions with no recorded outcome.

---

## 3. Locked concept and ownership

LOCKED (your approved deck, slides 2–17; do not change without Arihant's explicit "change X"):
- Six-step loop: Observe → Detect → Investigate → Remember → Act → Learn.
- Four agents: Sentinel, Investigator, Memory, Orchestrator. Agents recommend; **only the approval step can trigger execution**.
- Human approval gate (approve / modify / reject), evidence trail, audit trail.
- Organizational Memory (RAG over incidents, SOPs, outcomes).
- Primary metric **Detection-to-Action Time**, evaluated on a controlled synthetic dataset; no real-world performance claimed.
- Primary persona Operations Manager; secondary Account, Sales, Support managers and Business Head.
- Stack on slide 11 (Next.js, FastAPI, PostgreSQL/pgvector, Redis, pandas/scikit-learn, Docker). *LangGraph is marked "planned" in the deck — see §6.4.*
- Phases on slide 17 (Detect, Reason, Act).

Everything in §4 is an **addition**. Each is behind a feature flag (`FEATURES.A1 … A20`) and listed in `docs/OWNERSHIP_LEDGER.md` with status `proposed → approved/rejected` by Arihant. You told me to add features without asking, which I treat as your approval of the P0 and P1 additions **for building**; it is a standing approval you can withdraw per item at review by flipping its flag (rejected additions disappear from the nav). To keep the project defensible, Codex also writes a one-paragraph **defend-it sheet** per built feature in `docs/DEFEND_IT.md` (what it is, why it exists, how it is computed, its limits) — you and Yogesh must read it before pitching; anything you cannot explain gets cut.

---

## 4. Additions — features Altygen did not ask for but would plausibly value

Change class: 🟢 minor (preserves your idea) · 🟡 moderate (changes implementation) · 🔴 major (changes the concept — none proposed).
Scores are **my estimates (1–5)**, not measurements: Judge value / Build cost / Failure risk. Priority = P0 must-ship, P1 ship if P0 gates pass, P2 only if time remains.

| ID | Addition | Why it matters to Altygen | Class | JV/BC/FR | Pri |
|---|---|---|---|---|---|
| A1 | **Revenue Exposure (₹)** on every incident and portfolio | turns "risk 91" into money a Business Head can rank by. Defined as the account's baseline 12-week order value — **exposure, not a forecast of loss**; the caption says so | 🟢 | 5/1/1 | P0 |
| A14 | **Evidence-or-Silence** grounding validator + provenance tag (`computed / synthetic / illustrative / assumption`) on every number | answers "how do we know this isn't hallucinated?" — your project's hardest constraint | 🟢 | 5/2/2 | P0 |
| A17 | **Honest evaluation benchmark** with a held-out seed, decoys and published misses | makes the deck's "controlled synthetic dataset" claim *measurable* (it cannot prove real-world accuracy; the hold-out is the same generator with a different random draw, not independent data) | 🟢 | 5/2/2 | P0 |
| A19 | **Persona views** (Ops, Account, Sales, Support, Business Head, QA Head) | your slide 6 made real; also the seed of Phase 5 roles | 🟢 | 4/2/1 | P0 |
| A20 | **Replay mode** (cached agent outputs, no network/keys needed) | demo cannot die on venue Wi-Fi | 🟢 | 4/2/1 | P0 |
| A16 | **WhatsApp-style / email action drafts**, always "simulated – not sent" | field teams here live on WhatsApp [INFERENCE]; shows how actions reach people | 🟢 | 4/2/1 | P0 |
| A18 | **Engineering Notebook** — human-authored "we tried X, it failed because Y, we changed to Z" | your Human-Touch rule; AI may scaffold the page, never write entries | 🟢 | 4/1/1 | P0 |
| A2 | **Silent Period & Cost of Delay** — estimated days a problem existed before a weekly manual review would catch it | quantifies what late discovery costs (assumption labelled) | 🟢 | 5/2/2 | P1 |
| A3 | **Blast Radius** — other accounts exposed to the same cause (same SKU shortage / batch / rep / region) | one action fixes seven accounts; nobody asked for it, everybody wants it | 🟡 | 5/3/2 | P1 |
| A4 | **Alert Budget & Fatigue Guard** — max 7 alerts/persona/day ranked by revenue exposure × confidence × urgency (definitions in `signal_catalog.yaml`); shows what was held back and why | directly answers "no random numbers scattered around"; judges hate noisy dashboards | 🟢 | 5/2/1 | P1 |
| A7 | **Quality-Signal Routing** — batch complaint clusters and suspected adverse-event wording are routed to QA Head, four-eyes, never auto-actioned | fits post-2025 regulatory climate; also demonstrates "responsible AI" | 🟡 | 5/3/3 | P1 |
| A11 | **Opportunity Radar** — positive deviations + complementary-product gaps | the brief explicitly asks for "actionable business opportunities" | 🟡 | 5/3/2 | **P0-lite (in Compact)** |
| A12 | **Simulation Lab** — inject a scenario, watch Strata catch it, fast-forward 14 days, see counterfactual | the live-demo engine; judges can poke it | 🟡 | 5/3/3 | P1 |
| A13 | **Data Health Guard** — stale/duplicated feeds suppress signals instead of faking incidents | trust; also the "what if the data is wrong" question | 🟢 | 4/2/1 | P1 |
| A5 | **Refill-Cadence Drift** (chronic SKUs) | pharma-specific early warning | 🟡 | 4/3/2 | P1 |
| A6 | **Expiry Exposure & Redistribution** (batch-level) | cuts returns/credit notes; pharma-specific | 🟡 | 4/3/2 | P1 |
| A10 | **Handoffs, Notes & Decision-Debt** — role-addressed notes with `@role` mentions on incidents/tasks/accounts, approvals waiting > N hours, tasks without owner | "cross-team coordination and information sharing" is an explicit brief objective | 🟢 | 4/2/1 | **P0-lite (in Compact)** |
| A8 | **Prescriber/Field Coverage Decay** | doctor-engagement lens | 🟡 | 3/3/3 | P2 |
| A9 | **Memory Coverage & Knowledge Gaps** — incidents with no recorded outcome/SOP | targets "lost organizational knowledge" | 🟢 | 3/2/1 | P2 |
| A21 | **Account Profile & Engagement Plan** — `/app/accounts/[id]`: trends vs baseline, last 10 interactions, open tasks, up to 3 deterministic next-best-actions from `contracts/engagement_rules.yaml` (each cites evidence; WhatsApp/email drafts simulated) | the brief's "strengthen and personalize customer relationships" and "customer engagement and relationship management" | 🟡 | 5/3/2 | **P0-lite (in Compact)** |
| A22 | **Standing Routines** — a human approves a routine once (weekly persona digest, visit-gap follow-ups, chronic-therapy refill-reminder drafts, stalled-approval nudge); runs on the sim clock when the Lab advances time; all internal, simulated, audited | the brief's "automate routine processes" and "reduced dependency on repetitive manual processes"; keeps "only approval can trigger execution" because the approval is of the standing playbook | 🟡 | 5/3/2 | **P0-lite (in Compact)** |
| A15 | **Bring-Your-Own-CSV** — upload an orders CSV, map columns, get live detection | the "we can migrate you today" proof; riskiest to build | 🟡 | 5/4/4 | P2 |

**Cut line:** no P1 work starts until every P0 gate in §11 is green. No P2 work starts until P1 is green and Arihant has reviewed. "Failure risk" items scored 3+ get a fallback in §12.

---

## 5. Coverage of the District 05 brief (traceability)

Official brief phrases (updated PDF, District 05): *smart and scalable business management platform · leverages organizational and customer data · streamline day-to-day operations · automate routine processes · identify actionable business opportunities · improve operational efficiency · strengthen and personalize customer relationships · enhance coordination across teams · meaningful visibility into ongoing business activities · timely, data-driven decisions · proactive responses to customer and operational needs · reduced dependency on repetitive manual processes.* Victory condition: turn organizational and customer data into actionable insights and automated workflows so businesses operate efficiently, respond proactively and decide better.

**"Customer" in STRATA** = a B2B channel account of a nephrology pharma company (stockist, chemist chain, hospital pharmacy, nephrology clinic). Prescribers and downstream pharmacy stock-outs appear as signals about an account; **no patient data is used**. (Ask the mentor to confirm — §1.1 Q2.) **Platform framing:** STRATA is an intelligence layer that *manages operations* through tasks, approvals and routines on top of existing systems; it does not replace them.

| Arena objective / brief phrase | Page (route) | Gate that proves it (Compact tier) |
|---|---|---|
| Intelligent business process automation; automated task & workflow management | Approvals, Workflows & Handoffs | G3 e2e: signal → approve → tasks created → status change → outcome → memory |
| Automate routine processes; reduced dependency on repetitive manual work; streamline day-to-day operations | Workflows & Handoffs → *Standing Routines* tab (A22); Briefing weekly digest | G3 routine e2e (`engagement_rules.yaml › routine_gate`): approve once → advance 7 sim-days → digest + follow-up task + refill draft + nudge exist, all simulated and audited |
| Customer data analysis & personalization; strengthen and personalize customer relationships; customer engagement & relationship management | **Accounts** `/app/accounts` + `/app/accounts/[id]` (A21): trends, last 10 interactions, open tasks, deterministic next-best-actions per account | G3 Playwright: #4821 and the S09 account each show ≥1 evidence-cited next-best-action; persona views change the Briefing |
| Identification of actionable business opportunities | Opportunity Radar (A11) | G1/G4: `/opportunities` returns the S09 account with evidence; S12 (one-off spike) is absent |
| Cross-team coordination & information sharing; enhance coordination across teams | Workbench + Workflows "Handoffs & Notes" panel (A10): role-addressed notes, `@role` mentions, decision-debt | G3 e2e: note posted as Account Manager is visible to Support Manager, appears in their Briefing, audit row exists |
| Business activity monitoring & analytics; meaningful visibility into ongoing activities | Business Health (incl. account-type mix and an "activity this week" strip of orders / tickets / visits), Sources & Signals, Time-to-Action, Evaluation | G1 screenshots + caption/provenance lint; G4 evaluation table covers S01–S10 and decoys, misses shown |
| Proactive alerts & recommendations; proactive responses to customer **and** operational needs | Sentinel + Alert Budget (A4), Risk Register, Briefing (customer signals + supply/inventory/support-capacity signals) | G1: S01, S07, S10 detected; S11/S12 silent |
| AI-powered decision support; timely, data-driven decisions | Incident Workbench (evidence, memory, plan), approval gate | G2 hero investigation + G3 approval |
| Scalable business dashboards; smart and *scalable* platform | persona views; Sources "connector contract" panel; **Scale check** (`npm run scale`: generates 2,400 accounts, reports engine evaluate time and p95 `/risks` latency, provenance `computed`, hero still detected); Phase 5 hosted deploy | G4: `npm run scale` completes with S01 still detected; the Q&A says plainly "single-tenant prototype" |
| Improve operational efficiency | Time-to-Action (measured wall-clock detection → approved workflow), Silent Period (A2) | G3 e2e asserts the metric exists and is computed; the 15-minute manual baseline stays labelled illustrative |
| Victory condition (insights + automated workflows + efficient/proactive/data-driven) | whole loop + routines | G3/G4 e2e above |

---|---|
| Intelligent business process automation | Orchestrator → approved plan → workflow tasks (Phase 3) |
| Customer data analysis & personalization | Risk Register, account page, persona-specific briefing, A5/A8 |
| Identification of actionable business opportunities | Opportunity Radar (A11), cross-sell scenario S09 |
| Automated task & workflow management | Workflows & Handoffs, A10, simulated sends A16 |
| Customer engagement & relationship management | interaction-decay signal, account manager persona, WhatsApp-style drafts |
| Cross-team coordination & information sharing | shared incident object, owners per step, Handoff tracker, Blast Radius |
| Business activity monitoring & analytics | Business Health, Sources & Signals, Time-to-Action, Evaluation |
| Proactive alerts & recommendations | Sentinel + Alert Budget (A4) |
| AI-powered decision support | Investigator + Memory + Orchestrator with evidence trail |
| Scalable business dashboards | persona views, Sources & Signals "add a source" contract, Phase 5 deploy |

---

## 6. Architecture (matches your slides 10–11; deviations are stated)

### 6.1 Layers
1. **Sources**: CRM/customer, sales/orders, support, inventory, workforce, finance, docs/SOPs, past incidents (synthetic generator in prototype).
2. **Data & intelligence**: PostgreSQL + pgvector (with a file-based store that runs anywhere, see §6.3), Python processing, signal/feature engine, embeddings, vector store, RAG retrieval.
3. **AI reasoning**: Sentinel, Investigator, Memory, Orchestrator + LLM adapter. **Human approval gate**.
4. **Application**: Next.js console (risk dashboard, incident view, evidence trail, action plan, approval, workflow).

### 6.2 Repo layout
```
strata/
  AGENTS.md                      # rules Codex reads automatically
  docs/                          # this pack: blueprint, prompts, ledger, notebook-template
  contracts/                     # schema.sql, signal_catalog.yaml, scenarios.yaml, design-tokens.css (FROZEN after Phase 0)
  apps/web/                      # Next.js (App Router, TypeScript)
  services/engine/               # FastAPI + pandas + scikit-learn + agents
  data/                          # generator, seeds, snapshots/ (replay), memory_seed/ (YAML)
  db/                            # migrations (from contracts/schema.sql), PostgresStore
  config/                        # district.ts ("District 05"), feature flags, env schema
  scripts/                       # py.mjs (cross-platform python launcher), setup, snapshot, demo-reset, lint-*
  tests/                         # pytest, vitest, playwright, honesty-lint
  docker-compose.yml             # postgres+pgvector, redis (optional), engine, web
```

### 6.3 Runtime modes and stores (two independent switches)
- **`STRATA_STORE=file|postgres`** (default `file`; auto-`postgres` if `DATABASE_URL` is set and reachable). The engine talks only to a `Store` interface with two implementations: **`FileStore`** (Parquet/CSV for the generated facts, stdlib `sqlite3` for mutable state — incidents, plans, approvals, tasks, audit, memory — and an in-memory numpy cosine search for vectors) and **`PostgresStore`** (schema.sql + pgvector). Build **FileStore first** (works on any Windows laptop with no Docker); PostgresStore comes in Phase 3–4 and the shared store test-suite runs against both. **Only claim pgvector/PostgreSQL in the pitch if the PostgresStore tests pass.**
- **`STRATA_MODE=live|replay`**: `live` computes everything (agents may call LLM/embedding APIs when keys exist). `replay` serves recorded snapshots (`data/snapshots/*.json`: incidents, agent traces with original timestamps, embeddings); no DB, no keys, no network. Snapshots are produced by `npm run snapshot` at the end of Phase 2 and refreshed at the end of each later phase. The Lab can only replay **pre-recorded** scenario runs in replay mode (the UI says so). A visible chip always shows the mode; if we fall back to replay on stage we say so. (In the UI this is a toggle that sets the same flag the env var sets.)
- **`LLM_PROVIDER=none`** is a supported mode: agents return deterministic, template-based, still-cited output; retrieval falls back to **TF-IDF** (scikit-learn) when no embeddings API is configured; the trace shows `retrieval: tfidf|embeddings` and `source: template|llm` so nobody mistakes one for the other. All gates must pass in this keyless mode; with keys, run the hero once in LLM mode as an extra check.
- **`STRATA_FEATURES`** — comma list of enabled additions; nav and routes read it.
- **Clocks:** `SIM_NOW` drives all data logic; **wall-clock** is used only for Time-to-Action (human reaction time) via `audit_log.wall_at`.

### 6.4 Honest deviations from the deck
- **LangGraph**: deck says "(planned)". Build the agent pipeline as an explicit typed state machine in plain Python (deterministic order, retries, trace). Keep node interfaces LangGraph-compatible. If LangGraph is not used, the deck footnote must say "agent graph implemented as explicit state machine".
- **Redis**: deck lists "background jobs on Redis". Make Redis optional (`JOBS_BACKEND=inline|redis`). Default `inline` for the prototype. Do not claim Redis in the pitch unless it is actually running.
- **Docker / PostgreSQL**: provide `docker-compose.yml` for Postgres+pgvector, but the default path needs neither Docker nor Postgres (`STRATA_STORE=file`) because their availability on the build machine is [UNKNOWN]. Python is launched through `scripts/py.mjs` (finds `.venv/Scripts/python.exe` on Windows or `.venv/bin/python`).
- **Embeddings**: no local torch/sentence-transformers (Phase 5 Vercel bundle limit is 500 MB [CONTEXT: Vercel docs]). Use an embeddings API when keys exist (vectors for the seeded memory are precomputed into `data/snapshots/`); otherwise TF-IDF. The "89 % similarity" on slide 8 is whatever the formula computes; it is not tuned to 89.

### 6.5 Engine API (OpenAPI is the contract; the web app uses a generated TS client). Router files = lane ownership.
- `routers/core.py` (engine): `GET /health` · `/briefing?persona=` · `/portfolio/health` · `/risks` · `/opportunities` · `/sources` · `/signals/catalog` · `/incidents` (list) · `/incidents/{id}` · `/eval/latest` · `POST /eval/run` · `/time-to-action` · `/audit` (+ `/audit/verify`)
- `routers/agents.py` (agents): `POST /incidents/{id}/investigate` (SSE of agent steps) · `POST /incidents/{id}/plan` · `GET /memory/search` · `GET /memory/items` · `POST /ask` (structured cards with evidence chips; refuses without evidence)
- `routers/act.py` (engine, Phase 3): `GET /approvals` · `POST /plans/{id}/decision` · `GET /workflows` · `PATCH /workflows/{id}` · `GET /outcomes`
- `routers/lab.py` (engine, Phase 4): `POST /lab/inject` · `POST /lab/advance` · `POST /lab/reset` — uses `data/lab_injectors.py` as a *data source* (like a connector). The engine still never reads `contracts/scenarios.yaml` ground truth or `eval_labels` for detection; injectors only generate new rows.
- `routers/notebook.py` (engine): `GET/POST /notebook` (human-authored rows only; POST requires an `author` and rejects empty `tried`/`happened`)
- Phase 5 adds auth: the web app forwards the user's JWT plus a shared secret; the engine rejects requests without both.

---

## 7. Synthetic data estate

- 240 accounts (stockists, chemist chains, hospital pharmacies, nephrology clinics) across 6 NCR-and-nearby regions; ~28 reps; ~60 prescribers; 26 SKUs across the six therapy areas; **104 weeks** of history (two years, so the seasonality model has a prior year); fixed seeds (`seed_dev`, `seed_holdout`).
- Product names: **default `generic`** (e.g. "Phosphate binder 800 mg, SKU-CKD-01"). An opt-in `catalog` mode may use up to 8 names from Altygen's public catalogue for *background* SKUs only — never in the shortage (S01), quality (S04/S05) or payment-stress (S07) scenarios, so we never attach fake problems to a real brand. Permanent banner "SYNTHETIC DATA — NOT ALTYGEN'S". Account names are obviously fictional. No real people, no real patients.
- Noise model: log-normal order noise, weekly seasonality, a festival-season index, random per-account drift. Planted scenarios S01–S10 plus decoys S11–S13 live in `contracts/scenarios.yaml`.
- **Computed, not painted — and honest about what is designed.** The hero effect sizes (−31 % orders, +47 % complaint *count*, +22 % response time, −40 % interaction) are **generator parameters of a designed scenario**; the engine's job is to *recover* them from noisy data. Tests assert recovery within ±0.08 (Poisson noise makes tighter tolerances a seed-cherry-picking exercise, which is forbidden). Risk score 91, similarity 89 %, business health 84, "8 emerging risks", "3 high priority" on slides 7/8/12 are illustrative mock-up values: **no test asserts them**; whatever the system computes goes into `docs/DECK_DELTAS.md` and the slides are updated to match.

### 7.1 Known deck mismatches to fix (not code problems)
- Slide 7 says "4 signals, 4 systems": orders, complaints and response time come from orders+support and interaction from CRM = 3 systems; the 4th source (inventory) appears when the Investigator attaches the SKU stock-cover / ETA-slip evidence. Reword the slide.
- Slide 7 "likely cause: service deterioration" is the *symptom*; the Investigator's attributed root cause is `supplier_delay` (slide 8). Reword.
- Slide 11: LangGraph, Redis, Docker — state what is actually built (§6.4).
- Slide 16 says the prototype focus is "customer risk". The pack models supply delay, expiry, payment, coverage, support-capacity and quality-routing as **causes/drivers of account risk** and adds opportunities (as the brief requires). Add one line to slide 16 saying so.
- Slide 6 lists five personas; the pack adds a QA Head persona for regulatory-sensitive routing. Update slide 6 or drop QA Head.
- Slide 14 (4 minutes) vs slide 15 (< 1 minute target): different metrics; label both clearly as illustrative until measured.

---

## 8. Signal and risk model (explainable on purpose)

Defined in `contracts/signal_catalog.yaml`. Summary:
1. Each signal = robust z-score (median/MAD) of the account's recent window against its own seasonality-adjusted baseline; suppressed when the account has fewer than 26 rolling baseline windows. Baseline = the account's own distribution of the same 4-week aggregate over the previous ~2 years (exact definition in `signal_catalog.yaml`); a common-mode adjustment removes portfolio-wide moves (festival season) before scoring.
2. Each adverse signal is an independent "witness": `p_i = weight_i × clip(|z_i|/4, 0, 1)`.
3. Combine by **noisy-OR**: `risk_raw = 1 − Π(1 − p_i)`. Multiply by a **source-diversity factor** (1 source 0.55, 2 sources 0.80, ≥3 sources 1.00) and add +0.05 if persistent ≥2 weekly runs.
4. **Hard rule:** one source can never exceed "elevated". High/critical need ≥3 independent source systems agreeing (deck slide 7: "no single metric looks alarming; together they form a pattern").
5. Regulatory-sensitive signals bypass the score: always an incident, always QA Head, always four-eyes.
6. Cause attribution is done by the Investigator over a fixed taxonomy (`cause_category` enum), not free text.
7. scikit-learn `IsolationForest` is a **secondary cross-check** reported in Evaluation ("did an unsupervised model also flag it?"), not the decider. Honest framing: rules+statistics decide; ML corroborates.
8. Tuning allowed on seed A only. Seed B is evaluated once per tuning round and reported as-is, misses included. **Honest caveat printed on the Evaluation page:** seed B uses the same generator and scenarios with a different random draw — it guards against overfitting to one sample, it is *not* independent validation. Independent validation needs real data (the Altygen CSV path).
9. Business Health Index (0–100) = weighted mean of five pillars (customer health, supply continuity, service quality, field coverage, commercial momentum), each 0–100 from computed aggregates; the page shows the decomposition so the number is never a black box.

### 8.1 Evaluation metrics (all computed against `eval_labels`)
Detection precision, detection recall, root-cause accuracy (cause category), median lead time (days between onset and first detection), false alarms per week, plan acceptance rate (from real approve/modify/reject clicks by whoever uses the prototype — shown with n, and "n/a" until humans have used it), outcome improvement (a **scripted counterfactual** from the Lab's fast-forward — provenance `illustrative`, never presented as a measured result), and **Detection-to-Action Time** measured from the **wall-clock** timestamps (`audit_log.wall_at`) between the detection run and the approved/executing workflow. Report the manual 15-minute figure on slide 15 only as "illustrative" unless the mentor gives a real one.

---

## 9. Agents (spec; each has one job, typed JSON in/out, no free-form SQL)

| Agent | Job | Method | LLM use | Output |
|---|---|---|---|---|
| **Sentinel** | detect abnormal/emerging signals | deterministic engine run | summary sentence only | incident draft: signals, severity, n_sources, onset estimate |
| **Investigator** | rank likely causes | computes evidence features (stock cover, ETA slips, fill rate, batch cluster, rep gap…) via whitelisted query functions; LLM ranks hypotheses over the fixed taxonomy **citing evidence IDs** | hypothesis narrative | ranked causes with confidence + contradicting evidence |
| **Memory** | retrieve similar incidents/SOPs/outcomes | pgvector top-k, then re-rank: 0.5 embedding cosine + 0.3 cause-category match + 0.2 signal-pattern Jaccard; show the breakdown | none or tiny | matches with similarity breakdown, last resolution, last outcome |
| **Orchestrator** | build the action plan | intersect SOP steps with the winning past resolution; assign owner roles; compute revenue exposure and blast radius; draft messages | message drafts | plan (ordered steps with evidence IDs), requires_role, four_eyes flag |

**Cause attribution rules:** `signal_catalog.yaml › cause_rules` is a deterministic candidate table. The Investigator (LLM or keyless) may only rank and explain candidates that pass it; keyless confidence = weighted fraction of a rule's conditions satisfied, top candidate wins, ties broken by rule order.

**Evidence-or-Silence validator (A14), run on every agent output:**
- Every claim sentence must carry ≥1 evidence ID that exists in the retrieved set for that incident; otherwise the sentence is dropped and logged in `agent_runs.grounding_notes`.
- **No LLM-generated numbers.** Numbers are injected from computed fields via templates (`{orders_delta}`); a post-check regex rejects any numeric token not present in the evidence payload.
- Outputs are JSON-schema validated (Pydantic). One retry on schema failure; then fall back to the deterministic template summary and mark the run `grounding_ok=false`.
- Temperature 0–0.2. Provider-agnostic adapter (`LLM_PROVIDER`, `LLM_MODEL`, `EMBED_PROVIDER` from env — no model names hard-coded). Call budget guard `LLM_MAX_CALLS_PER_HOUR`.
- In `replay` mode agent outputs come from stored runs with original timestamps; the UI says "Replay".

**Approval gate:** Approve / Modify / Reject. Reject and Modify require a reason; reasons are stored as memory (negative evidence) and shown next time. Regulatory-sensitive plans need `qa_head` and a second approver. Nothing external is ever sent; tasks and drafts carry `simulated=true`.

**Learning loop:** Lab "fast-forward 14 days" applies the scenario's after-effects; Outcomes page records KPI before/after; Strata writes a new `memory_items` row (kind `outcome`) with `authored_by='strata-system'`.

---

## 10. Interface

### 10.1 Principles (so it does not look like an AI-generated hackathon app)
1. **Altygen Console look** from `design-tokens.css`: indigo sidebar, white work surface on a lavender-grey canvas, crimson only for "act now", 6 px corners, 1 px borders, no gradients, no glow, no glassmorphism, no emoji, no sparkle icons, no purple-to-blue hero, no rounded chat bubbles. Fonts: Poppins (brand/nav/headings), IBM Plex Sans (UI/data), IBM Plex Mono (IDs/timestamps). Icons: Tabler line icons. 13 px base text, 36 px table rows, compact toggle.
2. **Fidelity to their internal tools is an explicit [UNKNOWN].** We deliver "Altygen-brand-native enterprise console" now and re-skin within an hour if the mentor names tools. Do not claim it "matches their internal tools".
3. **One question per page.** Every page opens with the question it answers (e.g. "Which accounts need me today?"). Max 6 primary widgets per page (a table or a strip of tiles counts as one). No orphan numbers.
4. **Every number and every chart has a caption** in `--ink-3`, 12 px: *what this is* then *what it implies*. Enforced in code: `<Metric>` and `<ChartFrame>` require `meaning` and `implication` props (TypeScript error if missing) and a `provenance` tag shown as a tiny badge. Tables use `<DataTable provenance=… caption=…>` (one badge + caption per table, column tooltips for definitions); IDs, dates and timestamps are exempt.
5. **Motion**: 120–220 ms ease-out on hover/expand/drawer; numbers count up once ≤400 ms; no bounce, no parallax, no scroll-jacking; respects reduced-motion.
6. **Flowcharts** (React Flow): orthogonal edges, process-map cards, one colour for structure, crimson for the active/failed node only. Used for the incident causal map and the agent pipeline. Never decorative.
7. **Permanent chips** in the top bar: `SYNTHETIC DATA`, `Mode: live|replay`, persona switcher.

### 10.2 Landing (`/`)
Quiet, typographic, one screen. Wordmark **STRATA**, tagline "Detect problems before they become business losses.", team line "Arihant Chordia · Yogesh R Mehta", context line "The Industry Games 2026 · built for Altygen Biopharm — Intelligent Business Operations & Customer Engagement" ("District 05" shown, read from `config/district.ts`), a thin animated line showing Observe → Detect → Investigate → Remember → Act → Learn, one primary button "Enter Strata". A footer note: "Prototype with synthetic data." No stock imagery.

### 10.3 Welcome / Briefing (`/app`)
Greeting like a new assistant chat but as a briefing card: "Good morning, Operations Manager." (time- and persona-aware) · one paragraph computed from data ("Overnight Strata checked N signals across the connected source systems (N and the count are computed). 3 need you today; 1 is an opportunity.") · three suggested starting points as buttons (e.g. "Walk me through the top incident", "What changed since yesterday?", "Where are we quietly losing money?") · an **Ask Strata** input whose answers render as structured cards with evidence chips, not a free-text chat log · below, "Today's priorities" (max 7, Alert Budget) and a compact loop-status strip.

### 10.4 Sidebar IA (categories follow your six-step loop)
```
COMMAND      Briefing · Business Health
OBSERVE      Sources & Signals
DETECT       Risk Register · Opportunity Radar · Accounts
INVESTIGATE  Incident Workbench
REMEMBER     Organizational Memory
ACT          Approvals · Workflows & Handoffs · Outcomes
ASSURE       Time-to-Action · Evaluation · Audit Trail
LAB          Simulation Lab · Engineering Notebook
```
Collapsible, keyboard (`g` then letter), command palette `Ctrl K`. Items hidden by disabled feature flags or persona permissions.

### 10.5 Page specs (headline question → widgets → data)
1. **Business Health** — *Is the business healthy right now, and what is dragging it?* — Index gauge + 5 pillar bars with delta vs 4 weeks ago; "what moved most" list. Captions explain each pillar and what a drop implies.
2. **Sources & Signals** — *Can we trust what we are looking at?* — 7 source tiles (freshness, rows, duplicates, status) · signal catalog table (definition, window, adverse direction, last value) · "add a source" contract panel (field mapping template; P2 CSV upload).
3. **Risk Register** — *Which accounts need action, in what order?* — ranked table (severity pill, risk score, ₹ at stake, sources count, cause guess, owner, age) · filters by persona/region/type · side drawer preview. Alert Budget banner: "7 shown, 5 held back — why".
4. **Opportunity Radar** — *Where is growth we are not acting on?* — ranked opportunities with evidence, gap explanation, suggested play.
5. **Incident Workbench** (`/app/incidents` = list of open incidents; `/app/incidents/[id]` = detail) — *What is happening, why, what did we do last time, what should we do?* — tabs: Evidence (signal sparklines vs baseline, contradicting evidence), Causal map (React Flow), Agent trace (4 steps with timestamps, grounding result), Memory (matches + similarity breakdown), Plan (steps, owners, blast radius, ₹ at stake, WhatsApp/email drafts), Approval bar fixed at bottom.
6. **Organizational Memory** — *What have we learned and what is missing?* — incident/SOP/outcome library with search; each item shows authored-by, outcome, "used N times"; Memory Coverage (A9, P2).
7. **Approvals** — *What is waiting for a human decision, and for how long?* — queue by role; decision-debt age (A10).
8. **Workflows & Handoffs** — *Who owns what, and what is stuck?* — tabs: Tasks (owner role, due, status, simulated-send outbox) · Handoffs & Notes (A10) · Standing Routines (A22: approve once, last run, what each created).
8b. **Accounts** (`/app/accounts`, `/app/accounts/[id]`, A21) — *How is this customer doing and what should we do next for them?* — list with search/filter by type/region/tier; profile: trend vs baseline, last 10 interactions, open tasks and notes, 1–3 next-best-actions (evidence chips, draft preview), account-type definition footnote.
9. **Outcomes** — *Did our actions work?* — before/after KPI per resolved incident, **labelled `illustrative` (scripted counterfactual from the Lab)**; "added to memory" confirmation.
10. **Time-to-Action** — *How fast do we get from signal to executing workflow?* — measured Detection-to-Action Time from **wall-clock** audit timestamps vs the labelled-illustrative manual baseline; Silent Period (A2) per incident.
11. **Evaluation** — *How good is Strata, honestly?* — precision, recall, root-cause accuracy, lead time, false alarms/week on seed A **and** hold-out seed B; per-scenario table with misses highlighted; IsolationForest corroboration; "what we got wrong" panel (human-written).
12. **Audit Trail** — *Who/what decided, when, based on what?* — hash-chained log with filters; export CSV.
13. **Simulation Lab** — *Show me it working on something new.* — choose scenario template → inject → watch Sentinel catch it → approve → fast-forward → outcome → memory updated. Reset button restores seed state.
14. **Engineering Notebook** — *What did we try, what failed, what did we change?* — human-only entries (tried / happened / changed / evidence). AI-generated entries are forbidden; page has a visible "Authored by humans" rule.

### 10.6 Component contract (shared names)
`AppShell, Sidebar, TopBar, PersonaSwitcher, ModeChip, SyntheticBadge, Metric, ChartFrame, Caption, SeverityPill, EvidenceChip, SignalSparkline, FlowCanvas, AgentTraceStep, ApprovalBar, AuditRow, DraftCard (WhatsApp/email), AlertBudgetBanner, EmptyState, ErrorState (every async view has loading/empty/error states)`.

### 10.7 Charts
Apache ECharts with a theme built from the tokens (dense, quiet, direct labels, dashed baseline, ≤3 series). TanStack Table for grids. No default Recharts/shadcn look; Radix primitives are fine for behaviour (dialog, popover, tabs), styled only through tokens.

### 10.8 Human-touch scaffolding
`docs/ENGINEERING_NOTEBOOK.md` and the in-app Notebook start **empty** with prompts. Codex may add the page; the content is yours. Tuning rounds, failed ideas and mentor answers go here as they happen — this is what makes the pitch sound like you, not a template.

---

## 11. Phases, gates and the build budget

Rule from you: **2–3 build passes maximum, no endless trial runs.** Each gate allows **at most 2 fix iterations**; if still red, cut scope (flag off) and log it in `docs/CUT_LOG.md` (the Notebook is human-only).

**P0/P1/P2 are priorities for surviving a cut, not build order.** The phase table below is the build order (e.g. replay snapshots are produced at the end of Phase 2 even though A20 is P0; the Evaluation page is Phase 4 but the metric code exists from Phase 1). **Gates are tier-aware:** a gate item that belongs to a feature outside the chosen scope tier is skipped (flag off), not failed.

| Phase | Name (deck mapping) | Output | Gate (all automated unless noted) |
|---|---|---|---|
| **0** | Contracts & scaffold | repo, docker-compose/no-Docker scripts, schema migrated, OpenAPI skeleton, design tokens wired, CI scripts | `npm run check` passes (lint, typecheck, unit, schema load, contrast test over tokens); tokens file is the only source of colours; the stack runs with **no Docker and no Postgres** (`STRATA_STORE=file`) |
| **1** | **Detect** (deck P1) | data generator + engine + Risk Register + Business Health + Sources & Signals + landing + Briefing + shell | hero S01 detected, computed deltas within tolerance of deck; decoys S11 and S12 raise zero incidents (S13 is Lab-injected and tested in Phase 4); S10 is one regional incident; Playwright screenshots of the 5 Phase-1 pages; every number has caption + provenance |
| **2** | **Reason** (deck P2) | agents, grounding validator, pgvector memory, Incident Workbench, Memory page, replay snapshots | hero investigation returns cause=supplier_delay with INC-017 as top match; grounding_ok true; 0 uncited sentences; replay mode reproduces the same trace offline |
| **3** | **Act** (deck P3) | approval gate, workflow tasks, drafts, audit chain, outcomes, Time-to-Action, Alert Budget | end-to-end e2e (signal → approve → tasks → fast-forward → outcome → memory) passes; Reject requires reason; QA-routed incidents require four-eyes; audit hash chain verifies |
| **4** | Polish & hardening | Simulation Lab, Evaluation (seed A + hold-out B), Opportunity Radar, A3/A5/A6/A7/A13, a11y, performance, demo script rehearsal tooling, notebook page | axe: 0 serious issues; Lighthouse perf ≥ 85 on `/app` (target, not guarantee); 3 consecutive clean runs of the demo e2e; hold-out metrics reported as measured |
| **STOP** | **Review checkpoint** | final report + review checklist (§ in master prompt) | *Codex stops here. Do not deploy. Wait for Arihant.* |
| **5** | Ship (after your review) | Vercel + Supabase + Google sign-in | see `05_PHASE5_DEPLOY_PROMPT.md` |

**Build passes:** Pass 1 = Phases 0–1 · Pass 2 = Phases 2–3 · Pass 3 = Phase 4. Between passes: a commit tag; a 10-minute human check is *optional* — Codex continues unless you interrupt (it stops only at the end of Phase 4 or on a red gate it cannot fix in two iterations).

**Scope tiers** (because the real time left is [UNKNOWN]; pick at kickoff):
- **Core** (~5–6 h of Codex time): Phases 0–3 on the hero path only (S01, S04, S11), 8 pages — Briefing, Health, Risk Register, Workbench, Memory, Approvals, Audit, Notebook — plus A12-lite (inject the hero) and A14.
- **Compact — DEFAULT** (~10–12 h): Core + the rest of P0, plus A2, A3, A4, A7, A12, **A10, A11, A21, A22** (these four map directly to the District 05 brief); A13 as a unit-tested guard plus a Lab injection (S13) that shows on the Sources page; `npm run scale`; Evaluation shows seed A and the one-time seed-B summary. If time runs out inside Compact, cut in this order: A2, A3, A7-UI polish, A12 beyond the hero — **never** A10, A11, A21, A22, which carry the brief.
- **Full** (~20–24 h): everything P0 + P1. A 24-hour live event that also includes mentor time, rehearsal and review makes Full unlikely; choose it only if you have a full day of Codex time.

---

## 12. Win / lose tree

**Win conditions:** a hero incident that *computes itself* live; judges can break it with the Lab and it holds; honest numbers (including misses); the approval gate visibly prevents an unsafe auto-action (QA route); Altygen sees *their* kind of problems (batches, refills, expiry) not generic churn; the deck, the app and the pitch tell the same story.

**Loss conditions → mitigation**
| Risk | Mitigation |
|---|---|
| Looks like a generic AI dashboard | tokens, IA, no chat-bubble UI, flows; ask mentor for real tools and re-skin |
| Demo breaks (network/keys/DB) | replay mode (A20); pre-recorded 90-second backup video; offline fonts; `npm run demo:reset` |
| LLM hallucinates | grounding validator; no LLM numbers; template fallback |
| Numbers look fake | provenance badges; "computed, not painted" tests; hold-out evaluation; synthetic banner |
| Over-scoping | cut line, flags, scope tiers, 2-iteration gate rule |
| Judges ask "is it real data?" | answer honestly: synthetic by design; evaluation shows detection on planted ground truth; A15 CSV upload (if shipped) shows real-data path |
| QA/AE feature seen as medical overreach | route-only, never advise; copy reviewed by you; four-eyes; explicit non-goal |
| Auth/deploy late | Phase 5 is after review; prototype runs locally; replay mode is also the safe fallback for hosted demo |
| Idea looks AI-owned | Notebook, ledger, your rewritten SOP/memory items, your voice in the pitch |

**Competitor counterplay** ("how could another team beat us?"): they ship flashier UI → ours is denser, honest and breakable; they ship an LLM chat over a database → ours has detection, evidence, approval, audit and evaluation; they claim big accuracy numbers → we publish hold-out misses; they build a CRM → we state "intelligence layer, not another system". Harden: A15 (their data), A12 (live poke), A14 (grounding).

---

## 13. Judge simulation and Win Score (self-assessment — **not evidence**; rubric is [UNKNOWN], equal weights assumed)

| Dimension | Target (/10) | What earns it |
|---|---|---|
| Problem relevance | 9 | pharma-specific signals, objective-by-objective coverage |
| Innovation | 8 | memory + approval gate + evidence-or-silence + blast radius |
| Technical depth | 8 | engine, noisy-OR model, RAG, grounding, hash-chained audit |
| Working prototype | 9 | everything computed live from data; replay-safe |
| Demo impact | 9 | Lab: inject → catch → approve → outcome in < 5 minutes |
| UX | 8 | one question per page, captions, calm density |
| AI utilisation | 8 | agents constrained and validated, ML as corroboration |
| Scalability / migration | 7 | connectors contract, Phase 5 deploy, CSV path (P2) |
| Business potential | 7 | ₹ at stake, silent-period cost, expiry exposure |
| Social/health impact | 6 | continuity of chronic kidney therapy, batch-quality routing |
| Reliability | 8 | replay mode, data-health guard, tests |
| Presentation | 8 | your story + Notebook failures |
| Judge alignment | 7 | until the rubric is known |
| Differentiation | 9 | hold-out evaluation + grounding + QA routing + Lab (unverified guess about other teams — treat as aspiration) |

Update this table honestly after each pass. A score of 9 requires evidence in the repo, not intent.

**Simulated judge questions to rehearse** are in `06_DEMO_AND_PITCH.md`.

---

## 14. Reality check (project rule 17: can two students build this?)

Yes **if** the scope tier is chosen honestly (default Compact) and the cut line is respected. Single most likely failure point: Gates 1–2 (seasonality, hero tolerance, keyless retrieval) — the contracts now specify each so Codex does not burn its two fix iterations guessing. Biggest build risks: Lab (state management), agent grounding (strict validator), and UI breadth. Lowest-risk, highest-value first: engine + hero incident + approval + audit + replay. Resources: Available — Codex, Claude, Antigravity, Gemini, ChatGPT (your list). Easy to obtain — API keys, Supabase/Vercel free tiers, Google Cloud OAuth client. Difficult — real Altygen data (not needed; synthetic by design). Unrealistic — matching Altygen's unseen internal tools without a mentor answer.

---

## 15. Review checklist you will run after the STOP (also in the master prompt)

1. Landing: name, both team names, tagline, button; shows "District 05".
2. Briefing greets by persona; numbers match Risk Register; suggested buttons work; Ask Strata returns cited cards.
3. Every page: headline question, captions under every number/chart, no scattered stats, provenance badges.
4. Hero: Customer #4821 detected; deltas ≈ −31/+47/+22/−40; cause supplier delay; INC-017 match; plan; approve; tasks appear; fast-forward; outcome in Memory.
5. QA route: S04 batch cluster requires QA Head and four-eyes; Strata proposes nothing clinical.
6. Decoys S11–S13 produce no incidents; Data Health shows the stale feed.
7. Replay mode toggle works with the network off.
8. Evaluation shows seed A and hold-out B and lists misses.
9. Notebook is empty and yours to fill. Memory items marked DRAFT are yours to rewrite.
10. Ownership Ledger: veto/keep every addition.
