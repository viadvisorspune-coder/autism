-- Stage 1, step 5: the two write functions, and the tables the year of data
-- needs beyond record_items.
--
-- orca_write_record exists so that provenance cannot be skipped. Inserting
-- into record_items directly is possible and always will be — this is a
-- database, not a cage — but every path that is meant to be used goes through
-- one function that refuses a record which cannot say where it came from.
--
-- The four tables at the bottom were deliberately left out of the first slice.
-- They are here now because a year of real history is not a list of
-- observations: it contains things that were tried, how they turned out, the
-- documents produced along the way, and who agreed to what. Kept thin.

/* ------------------------------------------------------- write a record */

/**
 * The one supported way to add to the record.
 *
 * Refuses rather than guesses. A record with no subject, no content or no
 * reporter role is not a record with gaps — it is an assertion nobody can be
 * held to, and the right time to say so is before it is stored, not when
 * somebody later asks where it came from.
 *
 * The one rule it enforces beyond presence: anything AI-derived is forced to
 * `unvalidated`, whatever the caller passed. A model's inference cannot arrive
 * pre-blessed, and the cheapest place to guarantee that is here, once, rather
 * than in every caller that will ever write one.
 */
create or replace function orca_write_record(
  p_subject_id    uuid,
  p_domain        record_domain,
  p_content       text,
  p_source_type   source_type,
  p_reporter_role stakeholder_role,
  p_occurred_at   timestamptz,
  p_title         text default null,
  p_reported_by   uuid default null,
  p_sensitivity   sensitivity_level default 'moderate',
  p_validation    validation_status default 'unvalidated',
  p_evidence      numeric default 0.5,
  p_structured    jsonb default null,
  p_tags          text[] default null,
  p_item_id       uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_is_ai    boolean;
  v_validation validation_status;
begin
  if p_subject_id is null then
    raise exception 'orca_write_record: subject_id is required';
  end if;
  if p_content is null or btrim(p_content) = '' then
    raise exception 'orca_write_record: content is required';
  end if;
  if p_reporter_role is null then
    raise exception 'orca_write_record: reporter_role is required — a record with no '
                    'reporter is an assertion nobody can be held to';
  end if;
  if not exists (select 1 from subjects where subject_id = p_subject_id) then
    raise exception 'orca_write_record: no such subject %', p_subject_id;
  end if;

  v_is_ai := (p_source_type = 'ai_derived');

  -- Inference never arrives validated. Forced here rather than trusted from
  -- the caller, because the caller is sometimes a model.
  v_validation := case when v_is_ai then 'unvalidated'::validation_status
                       else coalesce(p_validation, 'unvalidated') end;

  insert into record_items (
    item_id, subject_id, domain, title, content, structured, source_type,
    reported_by, reporter_role, occurred_at, validation_status,
    evidence_strength, is_ai_derived, sensitivity, tags
  ) values (
    coalesce(p_item_id, gen_random_uuid()), p_subject_id, p_domain, p_title,
    p_content, p_structured, p_source_type, p_reported_by, p_reporter_role,
    p_occurred_at, v_validation,
    greatest(0, least(1, coalesce(p_evidence, 0.5))), v_is_ai,
    coalesce(p_sensitivity, 'moderate'), p_tags
  )
  returning item_id into v_id;

  return v_id;
end;
$$;

comment on function orca_write_record is
  'The supported write path for record_items. Refuses a record that cannot say '
  'where it came from, and forces AI-derived items to unvalidated.';

/* ----------------------------------------------------------- supersede */

/**
 * Correcting the record without erasing what it used to say.
 *
 * Both directions of the link and both is_current flags get set together, in
 * one transaction. Doing it by hand is three statements, and the failure mode
 * of getting two of them right is a record that looks correct and is quietly
 * lying — an old row still marked current, or a new one pointing at nothing.
 *
 * The old row stays readable. A record whose history can be edited away is not
 * evidence of anything, and for somebody whose account of their own life has
 * been overwritten by other people before, that is not an abstract concern.
 */
create or replace function orca_supersede(p_old uuid, p_new uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_old is null or p_new is null then
    raise exception 'orca_supersede: both item ids are required';
  end if;
  if p_old = p_new then
    raise exception 'orca_supersede: an item cannot supersede itself';
  end if;
  if not exists (select 1 from record_items where item_id = p_old) then
    raise exception 'orca_supersede: no such item %', p_old;
  end if;
  if not exists (select 1 from record_items where item_id = p_new) then
    raise exception 'orca_supersede: no such item %', p_new;
  end if;

  update record_items
  set superseded_by = p_new, is_current = false
  where item_id = p_old;

  update record_items
  set supersedes = p_old, is_current = true
  where item_id = p_new;
end;
$$;

comment on function orca_supersede is
  'Links a correction to what it corrects and moves is_current, in one place, '
  'so the two can never disagree. The superseded row is kept.';

/* ------------------------------------------------- what was tried, and how */

create table if not exists strategies (
  strategy_id  uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references subjects (subject_id) on delete cascade,
  title        text not null,
  description  text,
  proposed_by  uuid references users (user_id) on delete set null,
  proposer_role stakeholder_role,
  domain       record_domain,
  started_on   date,
  ended_on     date,
  -- 'running' is not an outcome, it is the absence of one. Kept distinct from
  -- 'partial' so a strategy still being tried is never read as a weak result.
  state        text not null default 'running'
               check (state in ('running', 'worked', 'partial', 'failed', 'abandoned')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists outcomes (
  outcome_id   uuid primary key default gen_random_uuid(),
  strategy_id  uuid not null references strategies (strategy_id) on delete cascade,
  subject_id   uuid not null references subjects (subject_id) on delete cascade,
  reported_by  uuid references users (user_id) on delete set null,
  reporter_role stakeholder_role not null,
  reported_on  date not null,
  -- 'made_worse' is a real result and needs its own word. A scale that stops
  -- at "no benefit" cannot record a strategy that actively harmed, and the
  -- headphones on the commute did exactly that.
  effectiveness text not null
               check (effectiveness in ('worked', 'partial', 'no_benefit', 'made_worse')),
  what_worked  text,
  what_did_not_work text,
  context      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists files (
  file_id      uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references subjects (subject_id) on delete cascade,
  title        text not null,
  kind         text,
  domain       record_domain,
  sensitivity  sensitivity_level not null default 'moderate',
  uploaded_by  uuid references users (user_id) on delete set null,
  uploader_role stakeholder_role,
  occurred_on  date,
  -- Metadata only for now, and the column says so. A file row that implies
  -- readable contents when nothing has parsed it is the invented-finding
  -- failure wearing a different hat.
  contents_read boolean not null default false,
  storage_path text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists consents (
  consent_id   uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references subjects (subject_id) on delete cascade,
  user_id      uuid not null references users (user_id) on delete cascade,
  domain       record_domain not null,
  purpose      purpose_type not null,
  granted_on   date not null,
  -- Null means still standing. A withdrawn consent keeps its row: who could
  -- once see this, and until when, is part of the account.
  withdrawn_on date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists strategies_subject_idx on strategies (subject_id, started_on desc);
create index if not exists outcomes_strategy_idx on outcomes (strategy_id, reported_on desc);
create index if not exists files_subject_idx on files (subject_id, occurred_on desc);
create index if not exists consents_subject_idx on consents (subject_id, user_id);

create trigger strategies_touch before update on strategies
  for each row execute function orca_touch_updated_at();
create trigger outcomes_touch before update on outcomes
  for each row execute function orca_touch_updated_at();
create trigger files_touch before update on files
  for each row execute function orca_touch_updated_at();
create trigger consents_touch before update on consents
  for each row execute function orca_touch_updated_at();
