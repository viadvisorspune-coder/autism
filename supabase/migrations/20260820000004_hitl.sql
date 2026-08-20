-- Deployed human-in-the-loop.
--
-- Yoxa reaches a human approval gate, posts a signed event here, and waits.
-- The decision is made by a person in ORCA's own interface and posted back.
-- Nothing resumes on its own.

-- Every webhook delivery, kept so an at-least-once redelivery cannot create a
-- second approval task or repeat a side effect.
create table hitl_events (
  event_id     text primary key,
  event_type   text not null,
  received_at  timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb
);

-- One row per approval Yoxa is waiting on.
create table hitl_requests (
  request_id       text primary key,
  event_id         text not null references hitl_events (event_id) on delete cascade,
  deployment_id    text,
  workflow_run_id  text,
  patient_id       text references patients (id) on delete cascade,
  title            text not null,
  description      text,
  options          jsonb not null default '[]'::jsonb,
  status           text not null default 'Awaiting approval'
                   check (status in ('Awaiting approval', 'Answered', 'Expired')),
  selected_option_id text,
  override_message text,
  decided_by       text references app_users (id) on delete set null,
  decided_at       timestamptz,
  yoxa_status_code int,
  created_at       timestamptz not null default now()
);

create index on hitl_requests (workflow_run_id);
create index on hitl_requests (status, created_at desc);

alter table hitl_events enable row level security;
alter table hitl_requests enable row level security;

-- Approvals follow the record they concern. An approval with no patient yet
-- resolved is visible to nobody through the client; the receiver still stored
-- it, and it appears once the workflow run is linked to a patient.
create policy hitl_requests_read on hitl_requests for select using (
  patient_id is not null
  and (orca_owns_patient(patient_id) or orca_connected_to(patient_id))
);

-- No client policy on hitl_events at all: it is operational plumbing, written
-- and read only by the receiver running with the service role.

-- Workflow runs carry the trigger's idempotency key so a retried user action
-- can be recognised rather than starting a second run.
alter table workflow_runs add column if not exists idempotency_key text;
alter table workflow_runs add column if not exists trigger_text text;
create unique index if not exists workflow_runs_idempotency_key_idx
  on workflow_runs (idempotency_key) where idempotency_key is not null;
