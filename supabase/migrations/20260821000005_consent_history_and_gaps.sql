-- Gaps closed after the first end-to-end runs.
--
-- Five things the record could not previously answer:
--   1. What could this person see on a given date? (consent_events)
--   2. Who has asked for access and not yet been given it? (access_requests)
--   3. Which run produced this row, enforceably? (foreign keys)
--   4. What was asked, and what was answered? (request_clarifications)
--   5. How long may we keep this? (retention_policies)

-- ------------------------------------------------------------ consent history

-- Consent is the claim the whole system rests on, so its history has to be
-- reconstructable, not merely current. connections holds today's position;
-- this holds every position it has ever held.
create type consent_change as enum (
  'Granted', 'Widened', 'Narrowed', 'Renewed', 'Revoked', 'Expired'
);

create table consent_events (
  id              text primary key default gen_random_uuid()::text,
  patient_id      text not null references patients (id) on delete cascade,
  person_id       text not null references app_users (id) on delete cascade,
  changed_at      timestamptz not null default now(),
  change_type     consent_change not null,
  previous_scope  text[],
  new_scope       text[],
  previous_status consent_status,
  new_status      consent_status,
  purpose         text,
  reason          text,
  decided_by      text references app_users (id) on delete set null,
  workflow_run_id text
);

create index on consent_events (patient_id, changed_at desc);
create index on consent_events (patient_id, person_id, changed_at desc);

comment on table consent_events is
  'Append-only consent history. Never updated or deleted; a mistaken grant is '
  'corrected by a further event, so the mistake stays visible.';

-- Written by a trigger rather than by application code, because a consent
-- change that the code forgot to log would be indistinguishable from one that
-- never happened.
create or replace function orca_log_consent_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind consent_change;
begin
  if tg_op = 'INSERT' then
    insert into consent_events (patient_id, person_id, change_type, previous_scope,
                                new_scope, previous_status, new_status, purpose)
    values (new.patient_id, new.person_id, 'Granted', null,
            new.access_scope, null, new.consent_status, new.purpose);
    return new;
  end if;

  -- Status changes take precedence over scope changes: being revoked is the
  -- more consequential fact, and recording it as "Narrowed" would understate it.
  if new.consent_status is distinct from old.consent_status then
    kind := case new.consent_status
              when 'Revoked' then 'Revoked'::consent_change
              when 'Expired' then 'Expired'::consent_change
              else 'Renewed'::consent_change
            end;
  elsif new.access_scope is distinct from old.access_scope then
    kind := case
              when new.access_scope @> old.access_scope then 'Widened'::consent_change
              when old.access_scope @> new.access_scope then 'Narrowed'::consent_change
              else 'Narrowed'::consent_change
            end;
  elsif new.review_due is distinct from old.review_due then
    kind := 'Renewed'::consent_change;
  else
    return new;
  end if;

  insert into consent_events (patient_id, person_id, change_type, previous_scope,
                              new_scope, previous_status, new_status, purpose)
  values (new.patient_id, new.person_id, kind, old.access_scope,
          new.access_scope, old.consent_status, new.consent_status, new.purpose);
  return new;
end;
$$;

create trigger connections_log_consent
after insert or update on connections
for each row execute function orca_log_consent_change();

-- Backfill: existing connections get their original grant, dated from the day
-- consent was actually given rather than from this migration.
insert into consent_events (patient_id, person_id, changed_at, change_type,
                            new_scope, new_status, purpose, reason)
select c.patient_id, c.person_id, c.consent_given::timestamptz, 'Granted',
       c.access_scope, c.consent_status, c.purpose,
       'Backfilled from the connection record when consent history was introduced.'
from connections c;

-- "What could Anil see on 12 August?" — the question that matters after a
-- dispute, and the one the current-state table cannot answer.
create or replace function orca_scope_at(target text, person text, at_time timestamptz)
returns text[] language sql stable security definer set search_path = public as $$
  select case
           when e.new_status = 'Active' then e.new_scope
           else '{}'::text[]
         end
  from consent_events e
  where e.patient_id = target and e.person_id = person and e.changed_at <= at_time
  order by e.changed_at desc
  limit 1
$$;

comment on function orca_scope_at is
  'Scope in force for one person at one moment. Empty array when consent was '
  'revoked, expired, or had not yet been given.';

-- ------------------------------------------------------------ access requests

-- A professional with no connection is not an error to be swallowed. The
-- refusal is the start of a process, and the process needs somewhere to live.
create table access_requests (
  id              text primary key default gen_random_uuid()::text,
  patient_id      text not null references patients (id) on delete cascade,
  requested_by    text not null references app_users (id) on delete cascade,
  requested_role  orca_role not null,
  purpose         text not null,
  requested_scope text[] not null default '{}',
  justification   text,
  status          text not null default 'Pending'
                  check (status in ('Pending', 'Approved', 'Declined', 'Withdrawn', 'Expired')),
  decided_by      text references app_users (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text,
  granted_scope   text[],
  workflow_run_id text,
  expires_on      date,
  created_at      timestamptz not null default now()
);

create index on access_requests (patient_id, status);
create index on access_requests (requested_by, status);

-- One live request per person per patient. A second ask while the first is
-- pending is pressure, not a new request.
create unique index access_requests_one_pending
  on access_requests (patient_id, requested_by) where status = 'Pending';

comment on table access_requests is
  'Requests for access that the patient has not yet answered. Nothing here '
  'grants anything; approving one writes a connections row, which in turn '
  'writes a consent event.';

-- ------------------------------------------------------- run linkage as a key

-- workflow_run_id was text with nothing enforcing it. Clear anything that no
-- longer resolves, then make the link real.
update memory_candidates set workflow_run_id = null
  where workflow_run_id is not null
    and not exists (select 1 from workflow_runs r where r.id = workflow_run_id);
update review_items set workflow_run_id = null
  where workflow_run_id is not null
    and not exists (select 1 from workflow_runs r where r.id = workflow_run_id);
update audit_log set workflow_run_id = null
  where workflow_run_id is not null
    and not exists (select 1 from workflow_runs r where r.id = workflow_run_id);

alter table memory_candidates
  add constraint memory_candidates_run_fk
  foreign key (workflow_run_id) references workflow_runs (id) on delete set null;

alter table review_items
  add constraint review_items_run_fk
  foreign key (workflow_run_id) references workflow_runs (id) on delete set null;

-- set null, not cascade: the audit trail outlives the run it describes.
alter table audit_log
  add constraint audit_log_run_fk
  foreign key (workflow_run_id) references workflow_runs (id) on delete set null;

alter table consent_events
  add constraint consent_events_run_fk
  foreign key (workflow_run_id) references workflow_runs (id) on delete set null;

alter table access_requests
  add constraint access_requests_run_fk
  foreign key (workflow_run_id) references workflow_runs (id) on delete set null;

-- hitl_requests.workflow_run_id deliberately gets no foreign key: it carries
-- Yoxa's own run identifier, which has no row in this database. The local run
-- is linked separately, when it can be resolved.
alter table hitl_requests add column if not exists local_run_id text
  references workflow_runs (id) on delete set null;

comment on column hitl_requests.workflow_run_id is
  'Yoxa''s run identifier, opaque to this database. Use local_run_id to join.';

-- --------------------------------------------------------- clarifications

-- requests.clarifications held the question as JSON with nowhere to put the
-- answer, so an exchange could be started but never finished.
create table request_clarifications (
  id              text primary key default gen_random_uuid()::text,
  request_id      text not null references requests (id) on delete cascade,
  asked_on        date not null default current_date,
  asked_by        text references app_users (id) on delete set null,
  asked_by_label  text not null,
  question        text not null,
  answered_on     date,
  answered_by     text references app_users (id) on delete set null,
  answer          text,
  withheld        text[] not null default '{}',
  approved_by     text references app_users (id) on delete set null,
  workflow_run_id text references workflow_runs (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index on request_clarifications (request_id, asked_on);

comment on column request_clarifications.withheld is
  'What was deliberately left out of the answer. An answer to an employer is '
  'as much about what it does not contain as what it does.';
comment on column request_clarifications.approved_by is
  'The patient. An answer leaving their record needs their approval, even when '
  'the question came from a legitimate recipient.';

-- Move what is already in the jsonb column across.
insert into request_clarifications (request_id, asked_on, asked_by_label, question)
select r.id,
       coalesce((c ->> 'date')::date, r.raised_on),
       coalesce(c ->> 'from', 'Unknown'),
       c ->> 'question'
from requests r
cross join lateral jsonb_array_elements(coalesce(r.clarifications, '[]'::jsonb)) as c
where c ->> 'question' is not null;

comment on column requests.clarifications is
  'Deprecated. Read request_clarifications instead; this column is retained '
  'only until the interface stops reading it.';

-- ------------------------------------------------------------------ retention

-- Nothing here deletes anything. Automatic destruction of a person's record is
-- itself a decision that needs a person, so this states the policy and reports
-- what is past it.
create table retention_policies (
  dataset        text primary key,
  keep_months    int not null check (keep_months > 0),
  basis          text not null,
  on_expiry      text not null default 'Review'
                 check (on_expiry in ('Review', 'Anonymise', 'Delete')),
  review_owner   orca_role not null default 'admin',
  note           text
);

insert into retention_policies (dataset, keep_months, basis, on_expiry, review_owner, note) values
  ('audit_log', 84, 'Accountability: a person must be able to question access long after it happened.', 'Review', 'admin',
   'Kept longest of anything. Deleting an audit trail removes the only evidence a denial ever occurred.'),
  ('disclosures', 84, 'A disclosure to a third party is the act most likely to be disputed later.', 'Review', 'admin', null),
  ('consent_events', 84, 'Consent history is only useful if it outlives the consent.', 'Review', 'admin', null),
  ('workflow_runs', 24, 'Operational history. Useful for improvement, not part of the clinical record.', 'Anonymise', 'admin', null),
  ('hitl_events', 6, 'Webhook plumbing. Kept only long enough to make redelivery safe.', 'Delete', 'admin', null),
  ('notifications', 12, 'Transient by nature.', 'Delete', 'admin', null),
  ('memory_candidates', 24, 'Rejected proposals are kept so the same one is not raised repeatedly.', 'Review', 'patient',
   'Confirmed candidates have already become record entries and are governed by those tables.'),
  ('access_requests', 36, 'A pattern of repeated requests is itself meaningful.', 'Review', 'patient', null),
  ('session_notes', 120, 'Clinical record retention.', 'Review', 'psychologist', null),
  ('documents', 120, 'Clinical record retention.', 'Review', 'psychologist', null);

-- What is past its policy, as a report rather than an action.
create or replace view retention_due as
select 'audit_log' as dataset, count(*) as rows_past_policy,
       min(occurred_at)::date as oldest
  from audit_log, retention_policies p
 where p.dataset = 'audit_log'
   and occurred_at < now() - make_interval(months => p.keep_months)
union all
select 'workflow_runs', count(*), min(started_at)::date
  from workflow_runs, retention_policies p
 where p.dataset = 'workflow_runs'
   and started_at < now() - make_interval(months => p.keep_months)
union all
select 'hitl_events', count(*), min(received_at)::date
  from hitl_events, retention_policies p
 where p.dataset = 'hitl_events'
   and received_at < now() - make_interval(months => p.keep_months)
union all
select 'notifications', count(*), min(created_at)::date
  from notifications, retention_policies p
 where p.dataset = 'notifications'
   and created_at < now() - make_interval(months => p.keep_months)
union all
select 'consent_events', count(*), min(changed_at)::date
  from consent_events, retention_policies p
 where p.dataset = 'consent_events'
   and changed_at < now() - make_interval(months => p.keep_months);
