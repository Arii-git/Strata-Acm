-- =====================================================================
-- STRATA  |  contracts/schema.sql  |  v0.1  (FROZEN after Phase 0 gate)
-- Target: PostgreSQL 15+ with pgvector. Supabase-compatible (Phase 5).
-- All data is SYNTHETIC. Column `is_synthetic` exists so a future real
-- import can never be confused with demo data.
-- Rule: lanes may ADD migrations after freeze, never edit this file in place.
-- =====================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- enums -----------------------------------------------------
create type account_type     as enum ('stockist','chemist_chain','hospital_pharmacy','nephrology_clinic');
create type severity_level   as enum ('healthy','watch','elevated','high','critical');
create type cause_category   as enum (
  'supplier_delay','channel_stockout','inventory_mismatch','batch_quality',
  'field_coverage_gap','payment_stress','workforce_overload','support_capacity',
  'demand_shift','data_quality','seasonal','unknown');
create type incident_kind    as enum ('risk','opportunity');
create type incident_status  as enum (
  'detected','investigating','plan_ready','awaiting_approval','approved',
  'executing','monitoring','resolved','rejected','dismissed');
create type decision_kind    as enum ('approved','modified','rejected');
create type source_system    as enum ('crm','orders','support','inventory','workforce','finance','docs');
create type signal_class     as enum ('commercial','supply','service','field','finance','quality','data_health');
create type complaint_kind   as enum ('service','delivery','quality','suspected_adverse_event','billing');
create type interaction_kind as enum ('visit','call','whatsapp','meeting','cme_event');
create type memory_kind      as enum ('incident','sop','resolution','outcome','playbook');
create type app_role         as enum ('operations_manager','account_manager','sales_manager','support_manager','business_head','qa_head');
create type agent_name       as enum ('sentinel','investigator','memory','orchestrator');
create type provenance_kind  as enum ('computed','synthetic','illustrative','assumption');

-- ---------- reference -------------------------------------------------
create table regions (
  id          smallint primary key,
  name        text not null unique            -- e.g. 'Delhi NCR', 'Punjab', 'UP West'
);

create table reps (
  id          int primary key,
  name        text not null,
  region_id   smallint references regions(id),
  active      boolean not null default true,
  left_on     date                              -- vacancy scenario (S08)
);

create table accounts (                         -- a "customer" in the deck = a B2B channel account
  id            int primary key,                -- hero account = 4821
  name          text not null,                  -- synthetic, clearly fictional
  type          account_type not null,
  region_id     smallint references regions(id),
  city          text,
  tier          char(1) check (tier in ('A','B','C')),
  rep_id        int references reps(id),
  onboarded_on  date not null,
  credit_limit  numeric(14,2),
  is_synthetic  boolean not null default true
);

create table prescribers (
  id            int primary key,
  name          text not null,
  specialty     text not null default 'nephrology',
  account_id    int references accounts(id),    -- hospital / clinic they practise at
  rep_id        int references reps(id)
);

create table products (
  sku             text primary key,
  name            text not null,
  therapy_area    text not null,                -- renal_anemia | ckd_mbd | electrolyte | renal_nutrition | renal_medicine | pain
  is_chronic      boolean not null,             -- drives refill-cadence logic (A5)
  shelf_life_mo   smallint not null,
  unit_price      numeric(10,2) not null,
  naming_source   text not null default 'catalog_name_synthetic_numbers'  -- or 'generic'
);

create table batches (
  batch_id        text primary key,
  sku             text not null references products(sku),
  mfg_date        date not null,
  expiry_date     date not null,
  qty_produced    int not null
);

-- ---------- operational facts (the "fragmented sources") ---------------
create table orders (                           -- source: orders (ERP/Tally-like export)
  id              bigserial primary key,
  account_id      int not null references accounts(id),
  order_date      date not null,
  sku             text not null references products(sku),
  qty_ordered     int not null,
  qty_filled      int not null,
  value           numeric(14,2) not null,
  promised_date   date,
  delivered_date  date,
  batch_id        text references batches(batch_id)
);
create index on orders (account_id, order_date);
create index on orders (sku, order_date);

create table support_interactions (             -- source: support
  id               bigserial primary key,
  account_id       int not null references accounts(id),
  opened_at        timestamptz not null,
  first_response_at timestamptz,
  resolved_at      timestamptz,
  channel          text not null check (channel in ('phone','whatsapp','email')),
  category         text not null
);
create index on support_interactions (account_id, opened_at);

create table complaints (                       -- source: support
  id           bigserial primary key,
  account_id   int not null references accounts(id),
  opened_at    timestamptz not null,
  kind         complaint_kind not null,
  sku          text references products(sku),
  batch_id     text references batches(batch_id),
  body         text not null,                   -- synthetic free text
  routed_to    text                              -- 'support' | 'qa' (A7 routing)
);
create index on complaints (account_id, opened_at);
create index on complaints (batch_id);

create table account_interactions (             -- source: crm / workforce
  id             bigserial primary key,
  account_id     int not null references accounts(id),
  occurred_at    timestamptz not null,
  kind           interaction_kind not null,
  rep_id         int references reps(id),
  prescriber_id  int references prescribers(id),
  duration_min   smallint
);
create index on account_interactions (account_id, occurred_at);

create table warehouse_stock (                  -- source: inventory (central warehouse)
  snapshot_date  date not null,
  sku            text not null references products(sku),
  on_hand        int not null,
  inbound_qty    int not null default 0,
  inbound_eta    date,
  eta_slips      smallint not null default 0,   -- how many times ETA moved (supplier-delay evidence)
  primary key (snapshot_date, sku)
);

create table channel_stock (                    -- source: inventory (account-level, from secondary-sales reports)
  snapshot_date  date not null,
  account_id     int not null references accounts(id),
  sku            text not null references products(sku),
  batch_id       text references batches(batch_id),
  qty            int not null,
  expiry_date    date not null,
  primary key (snapshot_date, account_id, sku, batch_id)
);

create table receivables (                      -- source: finance
  id            bigserial primary key,
  account_id    int not null references accounts(id),
  invoice_date  date not null,
  due_date      date not null,
  amount        numeric(14,2) not null,
  paid_amount   numeric(14,2) not null default 0,
  paid_on       date
);
create index on receivables (account_id, due_date);

create table source_feeds (                     -- data-health guard (A13)
  system                 source_system primary key,
  last_ingested_at       timestamptz not null,
  expected_every_minutes int not null,
  rows_last_run          int not null,
  duplicate_ratio        numeric(5,4) not null default 0,
  status                 text not null check (status in ('fresh','stale','degraded'))
);

-- ---------- intelligence layer ----------------------------------------
create table signals (                          -- output of the signal engine (deterministic)
  id            bigserial primary key,
  scope         text not null check (scope in ('account','sku','batch','region','portfolio')),
  scope_key     text not null,                  -- account id / sku / batch id / region id
  account_id    int references accounts(id),
  signal_key    text not null,                  -- see contracts/signal_catalog.yaml
  class         signal_class not null,
  source        source_system not null,
  window_start  date not null,
  window_end    date not null,
  value         numeric not null,               -- observed (e.g. -0.31)
  baseline      numeric,                        -- comparison value
  robust_z      numeric,                        -- (value-median)/ (1.4826*MAD)
  direction     text not null check (direction in ('adverse','favourable','neutral')),
  seasonal_adj  boolean not null default false, -- true if seasonality removed
  engine_ver    text not null,
  computed_at   timestamptz not null default now()
);
create index on signals (account_id, signal_key, window_end);
create index on signals (scope, scope_key, window_end);

create table incidents (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text not null unique,     -- 'INC-2026-0001'
  kind                incident_kind not null,
  account_id          int references accounts(id),
  scope               text not null default 'account',
  scope_key           text,
  title               text not null,
  severity            severity_level not null,
  risk_score          smallint check (risk_score between 0 and 100),   -- noisy-OR, see blueprint section 8
  n_sources           smallint not null,        -- independent source systems agreeing
  value_at_stake      numeric(14,2),            -- A1; provenance = computed
  status              incident_status not null default 'detected',
  cause               cause_category not null default 'unknown',
  cause_confidence    numeric(4,3),
  regulatory_sensitive boolean not null default false,   -- A7: forces QA role + 4-eyes
  onset_estimated_at  timestamptz,              -- change-point estimate (A2)
  first_detected_at   timestamptz not null,
  sim_run_id          text,                     -- lab-injected incidents (A12)
  created_at          timestamptz not null default now()
);
create index on incidents (status, severity);

create table incident_evidence (
  id           bigserial primary key,
  incident_id  uuid not null references incidents(id) on delete cascade,
  signal_id    bigint references signals(id),
  role         text not null check (role in ('supporting','contradicting','context')),
  weight       numeric(4,3),
  note         text
);

create table blast_radius (                     -- A3: other accounts exposed to the same cause
  incident_id   uuid not null references incidents(id) on delete cascade,
  account_id    int not null references accounts(id),
  exposure_basis text not null,                 -- 'same_sku_shortage' | 'same_batch' | 'same_rep' | 'same_region'
  exposure_value numeric(14,2),
  primary key (incident_id, account_id)
);

-- ---------- organizational memory (RAG) -------------------------------
create table memory_items (
  id             bigserial primary key,
  kind           memory_kind not null,
  ref            text not null unique,          -- 'INC-017', 'SOP-04'
  title          text not null,
  body           text not null,
  cause          cause_category,
  account_type   account_type,
  sku_scope      text[],
  steps          jsonb,                         -- SOP / resolution steps [{n,action,owner_role}]
  outcome        text,                          -- 'customer_retained' | 'partial' | 'lost' ...
  outcome_score  numeric(4,3),                  -- 0..1 measured or recorded
  provenance     provenance_kind not null default 'synthetic',
  authored_by    text not null default 'DRAFT - TEAM TO REVIEW',  -- humans replace this
  embedding      vector(1536),                  -- dimension = EMBED_DIM (provider must support 1536)
  created_at     timestamptz not null default now()
);
create index memory_items_embedding_idx on memory_items using hnsw (embedding vector_cosine_ops);

-- ---------- agents, plans, approval, execution ------------------------
create table agent_runs (
  id              bigserial primary key,
  incident_id     uuid not null references incidents(id) on delete cascade,
  agent           agent_name not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  input           jsonb not null,
  output          jsonb,
  model           text,                          -- null for deterministic agents / replay
  tokens_in       int,
  tokens_out      int,
  grounding_ok    boolean,                       -- A14: evidence-or-silence validator result
  grounding_notes jsonb,
  mode            text not null default 'live' check (mode in ('live','replay')),
  status          text not null default 'running' check (status in ('running','ok','failed'))
);

create table action_plans (
  id              bigserial primary key,
  incident_id     uuid not null references incidents(id) on delete cascade,
  version         int not null default 1,
  steps           jsonb not null,                -- [{n, action, owner_role, due_in_hours, evidence_ids[], source:'sop|memory|agent'}]
  expected_outcome text,
  value_at_stake  numeric(14,2),
  requires_role   app_role not null default 'operations_manager',
  four_eyes       boolean not null default false,
  created_by_run  bigint references agent_runs(id),
  created_at      timestamptz not null default now(),
  unique (incident_id, version)
);

create table approvals (
  id           bigserial primary key,
  plan_id      bigint not null references action_plans(id) on delete cascade,
  decided_by   text not null,                    -- persona (prototype) / auth user (Phase 5)
  decider_role app_role not null,
  decision     decision_kind not null,
  modifications jsonb,
  reason       text,                             -- required when rejected or modified
  decided_at   timestamptz not null default now()
);

create table workflow_tasks (
  id            bigserial primary key,
  plan_id       bigint references action_plans(id),     -- null for routine/engagement tasks
  incident_id   uuid references incidents(id),          -- null for routine/engagement tasks
  title         text not null,
  owner_role    app_role not null,
  due_at        timestamptz,
  status        text not null default 'open' check (status in ('open','in_progress','done','blocked')),
  channel       text not null default 'task' check (channel in ('task','email_draft','whatsapp_draft','digest','note')),
  origin        text not null default 'incident_plan' check (origin in ('incident_plan','engagement_rule','routine','manual')),
  account_id    int references accounts(id),            -- for engagement/routine tasks without an incident
  payload       jsonb,
  simulated     boolean not null default true,   -- NOTHING is ever sent externally in the prototype
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create table outcomes (
  id           bigserial primary key,
  incident_id  uuid not null references incidents(id),
  measured_at  timestamptz not null default now(),
  kpi          text not null,
  before_value numeric,
  after_value  numeric,
  verdict      text check (verdict in ('improved','unchanged','worse')),
  provenance   provenance_kind not null default 'synthetic',
  notes        text
);

-- ---------- engagement, routines, collaboration (A10, A21, A22) --------
create table standing_routines (                -- a human approves a routine ONCE; runs are simulated + audited
  id            text primary key,               -- 'RT01'...
  name          text not null,
  cadence_days  smallint not null,
  status        text not null default 'proposed' check (status in ('proposed','approved','paused')),
  approved_by   text,
  approved_role app_role,
  approved_at   timestamptz,
  last_run_sim  timestamptz
);

create table routine_runs (
  id          bigserial primary key,
  routine_id  text not null references standing_routines(id),
  ran_at_sim  timestamptz not null,
  outputs     jsonb not null,                   -- ids of tasks/drafts/digests created
  simulated   boolean not null default true
);

create table engagement_actions (               -- next-best-action instances (rule id + evidence), A21
  id            bigserial primary key,
  account_id    int not null references accounts(id),
  rule_id       text not null,                  -- 'ER01'...
  text          text not null,                  -- rendered from COMPUTED fields only
  owner_role    app_role not null,
  evidence      jsonb not null,                 -- signal ids
  status        text not null default 'suggested' check (status in ('suggested','accepted','dismissed','done')),
  created_at    timestamptz not null default now()
);

create table notes (                            -- cross-team handoff notes (A10); human-authored, role-addressed
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  author_role  app_role not null,
  author       text not null,
  body         text not null,
  mentions     app_role[] not null default '{}',
  incident_id  uuid references incidents(id),
  task_id      bigint references workflow_tasks(id),
  account_id   int references accounts(id)
);

-- ---------- assurance --------------------------------------------------
create table audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),   -- SIM clock: engine passes SIM_NOW-based time explicitly for data events
  wall_at     timestamptz not null default now(),   -- REAL clock: used ONLY for Time-to-Action (human reaction time)
  actor_type  text not null check (actor_type in ('system','agent','human')),
  actor       text not null,
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  detail      jsonb,
  prev_hash   text,
  hash        text                                -- sha256(prev_hash || canonical(row)) ; tamper-evident chain
);

create table eval_runs (
  id          bigserial primary key,
  seed        int not null,
  is_holdout  boolean not null,                   -- true = seed never used for tuning
  git_sha     text,
  params      jsonb not null,
  metrics     jsonb not null,                     -- precision, recall, root_cause_acc, median_lead_days, false_alarms_per_week
  per_scenario jsonb,
  created_at  timestamptz not null default now()
);

create table eval_labels (                        -- ground truth from data generator
  seed        int not null,
  scenario_id text not null,
  account_id  int,
  scope       text,
  scope_key   text,
  truth_kind  text not null,                      -- 'risk' | 'opportunity' | 'decoy'
  truth_cause cause_category,
  onset_date  date
);
create unique index eval_labels_uq on eval_labels (seed, scenario_id, coalesce(account_id,0), coalesce(scope_key,''));

create table notebook_entries (                   -- HUMAN-authored engineering notebook (A18)
  id        bigserial primary key,
  at        timestamptz not null default now(),
  author    text not null,                        -- 'Arihant' | 'Yogesh'  (AI must not author rows)
  tried     text not null,
  happened  text not null,
  changed   text,
  evidence  text                                  -- link to commit / screenshot / eval run
);

-- ---------- phase 5 (created now, unused in prototype) -----------------
create table allowed_emails (                     -- Phase 5 allow-list: pre-registration by email, BEFORE the user ever signs in
  email   text primary key,
  role    app_role not null
);

create table profiles (                           -- created on first sign-in ONLY if the email exists in allowed_emails (trigger in Phase 5)
  id            uuid primary key,                 -- = auth.users.id in Supabase
  email         text not null unique references allowed_emails(email),
  display_name  text,
  role          app_role not null                 -- no default: unlisted emails get no profile and RLS denies everything
);

-- RLS is enabled and policies written in Phase 5 (see 05_PHASE5_DEPLOY_PROMPT.md).
