# STRATA engine API (v0.1, the contract between engine and web)

Engine: FastAPI at `http://127.0.0.1:8000`. Web calls it through the Next.js rewrite `/api/engine/:path*` → `http://127.0.0.1:8000/:path*` (env `ENGINE_URL`).
OpenAPI is served at `/openapi.json`; `npm run gen:api` regenerates `apps/web/src/lib/api/schema.d.ts`. The shapes below are what the engine returns.

Conventions
- `persona` ∈ `operations_manager | account_manager | sales_manager | support_manager | business_head | qa_head`. Query param on GETs, body field on POSTs.
- `severity` ∈ `healthy | watch | elevated | high | critical`. `kind` ∈ `risk | opportunity`.
- `provenance` ∈ `computed | synthetic | illustrative | assumption`. Any object with a `provenance` key labels its numbers. If a field table below says "(computed)", use `provenance="computed"` in the UI.
- Deltas are fractions (`-0.31` = −31 %). Money is INR (number). Times are ISO strings. `sim_now` is the simulated clock.
- Every list response is `{ "items": [...] , ...extra }`.

## Core
`GET /health` → `{status:"ok", mode:"live"|"replay", store:"file", llm_provider:"none"|..., retrieval:"tfidf"|"embeddings", sim_now, features:string[]}`

`GET /briefing?persona=` →
```
{ persona, sim_now, greeting:"Good morning", role_label:"Operations Manager",
  signals_checked:int (computed), sources_count:int (computed), accounts_count:int (computed),
  need_you:int (computed), opportunities:int (computed), qa_routed:int (computed),
  summary:string (sentence built from the computed counts),
  priorities: Priority[]   // <= 7, Alert Budget ranked
  held_back: [{ref, title, reason}],
  notes_for_you: Note[] }
Priority = {incident_id, ref, title, kind, severity, risk_score, value_at_stake, n_sources, account_id, account_name, status, rank_score, regulatory_sensitive}
```

`GET /portfolio/health` →
```
{ index:{value:number(0-100), delta_4w:number, provenance:"computed"},
  pillars:[{key, label, value(0-100), delta_4w, caption, provenance}],      // 5 pillars
  movers:[{account_id, account_name, signal_key, label, delta, severity}],  // what moved most (<=6)
  activity:{weeks:string[], orders:int[], tickets:int[], visits:int[]},      // last 12 weeks portfolio totals (computed)
  mix:[{type, label, count, value_12w}] }
```

`GET /risks?persona=` → `{items: IncidentSummary[], held_back:[{ref,title,reason}], budget:7, shown:int, total:int}` (risk incidents only, ranked)
`GET /opportunities` → `{items: IncidentSummary[]}`
`GET /incidents` → `{items: IncidentSummary[]}` (all, incl. QA-routed)
```
IncidentSummary = {id, ref, kind, title, account_id, account_name, account_type, region, scope, scope_key,
  severity, risk_score, n_sources, sources:string[], value_at_stake, status, cause, cause_confidence,
  driver:string /* likely driver class, descriptive */, regulatory_sensitive, owner_role, age_days, rank_score}
```

`GET /incidents/{id}` →
```
IncidentSummary & {
  onset_estimated_at, first_detected_at, silent_period_days:number (assumption-based, see silent_period_basis),
  silent_period_basis:string,
  evidence: Evidence[],
  blast_radius: [{account_id, account_name, exposure_basis, exposure_value}],
  investigation: Investigation | null,
  plan: Plan | null,
  approvals: Approval[],
  tasks: Task[],
  outcomes: Outcome[] }
Evidence = {id:"EV-…", signal_key, label, source, class, scope, value, baseline, robust_z, delta, direction,
  role:"supporting"|"contradicting"|"context", caption, unit, series:{labels:string[], values:number[], baseline:number}|null}
```

## Agents (Phase 2)
`POST /incidents/{id}/investigate` → `Investigation`
```
Investigation = { run_id, steps: AgentStep[], cause, cause_confidence,
  hypotheses:[{cause, confidence, conditions:[{text, met:boolean, evidence_ids:string[]}]}],
  memory_matches:[{ref, title, kind, similarity, breakdown:{embedding, cause, pattern}, resolution, outcome, authored_by}],
  narrative:[{text, evidence_ids:string[]}],   // every sentence cites evidence
  grounding_ok:boolean, grounding_notes:string[], source:"template"|"llm", retrieval:"tfidf"|"embeddings", mode:"live"|"replay" }
AgentStep = {agent:"sentinel"|"investigator"|"memory"|"orchestrator", started_at, finished_at, summary, evidence_ids:string[], status:"ok"|"failed"}
```
`POST /incidents/{id}/plan` → `Plan`
```
Plan = {id, incident_id, version, steps:[{n, action, owner_role, due_in_hours, evidence_ids, source:"sop"|"memory"|"agent"}],
  requires_role, four_eyes, value_at_stake, expected_outcome,
  drafts:[{channel:"whatsapp_draft"|"email_draft", to_role, subject, body, simulated:true}], status:"awaiting_approval"|"approved"|"rejected"|"modified"}
```
`GET /memory/items?kind=` → `{items:[{ref, kind, title, body, cause, account_type, outcome, authored_by, used_count, steps}]}`
`GET /memory/search?q=` → `{items:[{ref, title, kind, score}], retrieval}`
`POST /ask` body `{question, persona}` → `{cards:[{title, body, evidence:[{id,label}], link:string|null}], refused:boolean}`

## Act (Phase 3)
`GET /approvals?persona=` → `{items:[{plan_id, incident_id, ref, title, severity, requires_role, four_eyes, approvals_so_far:int, waiting_hours, value_at_stake}]}`
`POST /plans/{id}/decision` body `{decision:"approved"|"modified"|"rejected", reason?:string, persona, decided_by}` → `{ok, incident_status, tasks_created:int, message}`; 400 if reason missing for modify/reject or role not allowed.
`GET /workflows?persona=` → `{items: Task[]}`; `PATCH /workflows/{id}` body `{status}`
```
Task = {id, title, owner_role, due_at, status, channel, origin, account_id, incident_id, incident_ref, payload, simulated:true, created_at}
```
`GET /outcomes` → `{items: Outcome[]}`; `Outcome = {incident_id, ref, kpi, before_value, after_value, verdict, provenance:"illustrative", notes, measured_at}`
`GET /notes?persona=` / `POST /notes` body `{author_role, author, body, mentions:string[], incident_id?, account_id?}`
`GET /accounts?q=&type=&region=` → `{items:[{id, name, type, region, tier, value_12w, risk_score, severity, open_incidents}]}`
`GET /accounts/{id}` → `{account:{id,name,type,region,city,tier,rep}, value_12w, trend:{labels, units, baseline}, signals:Evidence[], interactions:[{occurred_at, kind, rep, duration_min}], open_tasks:Task[], next_best_actions:[{rule_id, text, owner_role, draft_channel, due_in_hours, evidence_ids}], notes:Note[], incidents:IncidentSummary[]}`

## Assure / Lab
`GET /audit` → `{items:[{id, at, wall_at, actor_type, actor, action, entity_type, entity_id, detail, prev_hash, hash}], verified:boolean}`; `GET /audit/verify` → `{ok, checked, first_bad_id}`; `GET /audit.csv`
`GET /time-to-action` → `{items:[{ref, detected_wall_at, approved_wall_at, seconds}], median_seconds|null, n, manual_baseline_minutes:{value, provenance:"illustrative"}}`
`GET /eval/latest` → `{runs:[{seed, is_holdout, metrics:{precision, recall, root_cause_acc, false_alarms}, per_scenario:[{id, title, kind, expected, detected, severity, cause, cause_ok, hit}]}], caveat}`
`GET /sources` → `{feeds:[{system, label, last_ingested_at, expected_every_minutes, rows_last_run, duplicate_ratio, status, lag_multiple}], catalog:[{key, class, source, definition, adverse, weight, caption, regulatory_sensitive}], notices:[{system, message}]}`
`POST /lab/advance` body `{days:14}` → `{sim_now, outcomes_recorded:int, memory_written:string[]}` (applies scripted counterfactuals, provenance illustrative)
`POST /lab/reset` → `{ok}` (restores simulated state; never deletes notebook rows or human-authored memory)
`POST /lab/inject` body `{scenario:"S01"}` → `{incident_ref}`
`GET /notebook` / `POST /notebook` body `{author, tried, happened, changed?, evidence?}` (POST rejects empty author/tried/happened)
`GET /routines` / `POST /routines/{id}/approve` body `{persona, decided_by}`

## Added in review 1 (UX revamp)
- Every incident summary (`/incidents`, `/risks`, `/opportunities`, `/briefing` priorities, `/incidents/{id}`) gains `category` (supply|service|customer|finance|field|quality|data|opportunity), `category_label`, `stage` (detected|investigating|plan_ready|awaiting_approval|in_progress|outcome_recorded|learned), `stage_label`. Mapping: `services/engine/strata_engine/taxonomy.py` = `config/taxonomy.ts`.
- `GET /events?incident=&limit=` -> `{items:[{id, type, label, icon, text, at, wall_at, incident, actor, actor_type, link, stage_index}], types}`: classified events built from the hash-chained audit log, in audit (causal) order. Unknown actions are not shown.
- `GET /metrics/dictionary` -> `{items:[{id, name, unit, formula, good_direction, compare, implies, action, provenance}]}` from `config/metrics.yaml`.
- `GET /taxonomy` -> `{categories:[{key,label}], stages:[{key,label}]}`.
