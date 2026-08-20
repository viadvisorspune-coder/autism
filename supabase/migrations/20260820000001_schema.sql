-- ORCA — longitudinal record schema.
--
-- One patient model. Role-specific views read from it; nothing here is
-- duplicated per role. Text primary keys mirror the identifiers the frontend
-- already uses (pt-ananya, ev-12, st-1) so the UI can move off mock data
-- without a rewrite.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enumerations

create type orca_role as enum (
  'patient', 'psychologist', 'psychiatrist', 'therapist', 'ot', 'gp',
  'clinic', 'employer', 'university', 'trusted', 'admin'
);

create type workflow_status as enum (
  'Draft', 'Active', 'Awaiting information', 'Awaiting approval',
  'Awaiting professional review', 'Awaiting stakeholder', 'In progress',
  'Completed', 'Requires adaptation', 'Escalated', 'Blocked', 'Cancelled'
);

-- How well established a piece of information is. Never hidden from the user.
create type evidence_status as enum (
  'Reported', 'Professionally documented', 'Validated', 'AI interpretation'
);

create type event_category as enum (
  'Personal', 'Functional', 'Clinical', 'Support', 'Work', 'University',
  'Appointments', 'Documents', 'Stakeholder observations'
);

create type consent_status as enum ('Active', 'Expired', 'Revoked');

create type access_type as enum ('Read', 'Write', 'Share', 'Approve', 'Revoke', 'Login');

-- The five-verb decision function the policy layer returns.
create type policy_decision as enum ('PROCEED', 'ASK', 'WAIT', 'STOP', 'ESCALATE');

-- ---------------------------------------------------------------------- people

create table app_users (
  id            text primary key,
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  name          text not null,
  role          orca_role not null,
  title         text,
  organisation  text,
  pronouns      text,
  created_at    timestamptz not null default now()
);

create table patients (
  id          text primary key,
  user_id     text not null references app_users (id) on delete cascade,
  name        text not null,
  pronouns    text not null default 'they/them',
  age         int,
  context     text,
  created_at  timestamptz not null default now()
);

create index on patients (user_id);

-- The access control table. Every professional's sight of a record traces back
-- to a row here, created by the patient, for a stated purpose, with an end date.
create table connections (
  id             text primary key,
  patient_id     text not null references patients (id) on delete cascade,
  person_id      text not null references app_users (id) on delete cascade,
  relationship   text not null,
  purpose        text not null,
  access_scope   text[] not null default '{}',
  consent_given  date not null default current_date,
  consent_status consent_status not null default 'Active',
  review_due     date,
  last_interaction date,
  created_at     timestamptz not null default now(),
  unique (patient_id, person_id)
);

create index on connections (person_id, consent_status);
create index on connections (patient_id, consent_status);

-- ------------------------------------------------------------ the record itself

create table timeline_events (
  id           text primary key,
  patient_id   text not null references patients (id) on delete cascade,
  occurred_on  date,
  recorded_on  date not null default current_date,
  title        text not null,
  category     event_category not null,
  source_id    text references app_users (id) on delete set null,
  source_label text,
  summary      text not null,
  context      text,
  evidence     evidence_status not null default 'Reported',
  status       text not null default 'Recorded',
  related_ids  text[] not null default '{}',
  visible_to   orca_role[] not null default '{patient}',
  workflow_run_id text,
  created_at   timestamptz not null default now()
);

create index on timeline_events (patient_id, recorded_on desc);

create table profile_items (
  id          text primary key,
  patient_id  text not null references patients (id) on delete cascade,
  section     text not null,
  text        text not null,
  source_id   text references app_users (id) on delete set null,
  source_label text,
  recorded_on date not null default current_date,
  evidence    evidence_status not null default 'Reported',
  visible_to  orca_role[] not null default '{patient}',
  outdated    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index on profile_items (patient_id, section);

create table strategies (
  id               text primary key,
  patient_id       text not null references patients (id) on delete cascade,
  title            text not null,
  goal             text not null,
  rationale        text,
  evidence_ids     text[] not null default '{}',
  status           workflow_status not null default 'Draft',
  phase            text not null default 'Baseline',
  starts_on        date,
  duration_weeks   int,
  conditions       text,
  success_criteria text,
  review_date      date,
  owner_id         text references app_users (id) on delete set null,
  environment      text,
  outcome          jsonb,
  created_at       timestamptz not null default now()
);

create index on strategies (patient_id, status);

create table strategy_checkins (
  id           text primary key default gen_random_uuid()::text,
  strategy_id  text not null references strategies (id) on delete cascade,
  recorded_on  date not null default current_date,
  note         text not null,
  helpfulness  text not null check (helpfulness in ('Helped', 'Partly helped', 'Did not help')),
  reported_by  text references app_users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index on strategy_checkins (strategy_id, recorded_on desc);

create table appointments (
  id                 text primary key,
  patient_id         text not null references patients (id) on delete cascade,
  professional_id    text references app_users (id) on delete set null,
  scheduled_for      timestamptz not null,
  purpose            text not null,
  location           text,
  status             workflow_status not null default 'Active',
  preparation_status text not null default 'Not started',
  questions          text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create index on appointments (patient_id, scheduled_for);

create table documents (
  id             text primary key,
  patient_id     text not null references patients (id) on delete cascade,
  title          text not null,
  file_type      text not null default 'PDF',
  category       text not null,
  source_id      text references app_users (id) on delete set null,
  source_label   text,
  recorded_on    date not null default current_date,
  status         text not null default 'Saved',
  extracted      jsonb not null default '[]'::jsonb,
  related_event_ids text[] not null default '{}',
  access         orca_role[] not null default '{patient}',
  storage_path   text,
  workflow_run_id text,
  created_at     timestamptz not null default now()
);

create index on documents (patient_id, recorded_on desc);

-- ------------------------------------------------------------------ governance

-- One row per thing that actually left the patient's boundary.
create table disclosures (
  id             text primary key default gen_random_uuid()::text,
  patient_id     text not null references patients (id) on delete cascade,
  disclosed_on   timestamptz not null default now(),
  recipient      text not null,
  recipient_id   text references app_users (id) on delete set null,
  purpose        text not null,
  content_scope  text[] not null default '{}',
  items_shared   text[] not null default '{}',
  approved_by    text references app_users (id) on delete set null,
  workflow_run_id text
);

create index on disclosures (patient_id, disclosed_on desc);

create table requests (
  id                     text primary key,
  patient_id             text not null references patients (id) on delete cascade,
  type                   text not null,
  title                  text not null,
  destination            text not null,
  destination_role       orca_role not null,
  raised_on              date not null default current_date,
  status                 workflow_status not null default 'Draft',
  current_owner          text,
  steps                  jsonb not null default '[]'::jsonb,
  functional_requirement text,
  requested_adjustment   text,
  authorised_information text[] not null default '{}',
  withheld               text[] not null default '{}',
  implementation         text,
  review_date            date,
  clarifications         jsonb not null default '[]'::jsonb,
  workflow_run_id        text,
  created_at             timestamptz not null default now()
);

create index on requests (patient_id, status);
create index on requests (destination_role, status);

-- AI-proposed patterns. They are candidates until a person accepts them, which
-- is the whole point of the table existing separately from profile_items.
create table memory_candidates (
  id              text primary key default gen_random_uuid()::text,
  patient_id      text not null references patients (id) on delete cascade,
  proposal        text not null,
  confidence      numeric(3, 2) not null check (confidence between 0 and 1),
  evidence        jsonb not null default '[]'::jsonb,
  related_history text,
  raised_for      orca_role[] not null default '{patient}',
  status          text not null default 'Pending'
                  check (status in ('Pending', 'Confirmed', 'Edited', 'Rejected')),
  decided_by      text references app_users (id) on delete set null,
  decided_at      timestamptz,
  workflow_run_id text,
  created_at      timestamptz not null default now()
);

create index on memory_candidates (patient_id, status);

create table review_items (
  id                text primary key default gen_random_uuid()::text,
  patient_id        text not null references patients (id) on delete cascade,
  title             text not null,
  reason            text not null,
  understanding     text,
  evidence          text[] not null default '{}',
  uncertainty       text,
  proposed_action   text,
  decision_required text,
  assigned_to       orca_role[] not null default '{patient}',
  status            workflow_status not null default 'Awaiting approval',
  decision          text,
  decided_by        text references app_users (id) on delete set null,
  decided_at        timestamptz,
  workflow_run_id   text,
  raised_on         date not null default current_date
);

create index on review_items (patient_id, status);

create table notifications (
  id         text primary key default gen_random_uuid()::text,
  patient_id text references patients (id) on delete cascade,
  category   text not null,
  what       text not null,
  why        text not null,
  todo       text not null,
  for_roles  orca_role[] not null default '{patient}',
  href       text,
  unread     boolean not null default true,
  workflow_run_id text,
  created_at timestamptz not null default now()
);

create index on notifications (patient_id, unread);

create table workflow_runs (
  id           text primary key default gen_random_uuid()::text,
  patient_id   text references patients (id) on delete cascade,
  type         text not null,
  stakeholder  text,
  current_step text not null default 'Trigger received',
  status       workflow_status not null default 'In progress',
  waiting_for  text,
  steps        jsonb not null default '[]'::jsonb,
  goal         jsonb,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz,
  closure_reason text
);

create index on workflow_runs (patient_id, status);

-- Append-only. Denials are recorded as carefully as approvals.
create table audit_log (
  id          text primary key default gen_random_uuid()::text,
  occurred_at timestamptz not null default now(),
  actor_id    text references app_users (id) on delete set null,
  actor_label text not null,
  actor_role  orca_role,
  patient_id  text references patients (id) on delete cascade,
  action      text not null,
  record      text not null,
  access_type access_type not null,
  why         text,
  result      text not null check (result in ('Allowed', 'Denied')),
  workflow_run_id text
);

create index on audit_log (patient_id, occurred_at desc);
create index on audit_log (workflow_run_id);

create table tasks (
  id         text primary key default gen_random_uuid()::text,
  patient_id text references patients (id) on delete cascade,
  title      text not null,
  detail     text,
  due_on     date,
  for_roles  orca_role[] not null default '{psychologist}',
  status     workflow_status not null default 'Active',
  created_at timestamptz not null default now()
);

create table session_notes (
  id              text primary key,
  patient_id      text not null references patients (id) on delete cascade,
  professional_id text references app_users (id) on delete set null,
  held_on         date not null,
  status          text not null default 'Draft' check (status in ('Draft', 'Signed')),
  observations    text,
  patient_report  text,
  goals           text[] not null default '{}',
  actions         text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index on session_notes (patient_id, held_on desc);

-- Documents produced by a workflow run land in a private bucket; nothing is
-- world-readable.
insert into storage.buckets (id, name, public)
values ('orca-artifacts', 'orca-artifacts', false)
on conflict (id) do nothing;
