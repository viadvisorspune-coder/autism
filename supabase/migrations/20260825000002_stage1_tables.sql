-- Stage 1, step 2: the six tables.
--
-- Nothing here references the existing schema. That is intentional for one
-- stage: a slice that has to satisfy the old model's foreign keys cannot be
-- evaluated on its own terms. Joining the two is a later, deliberate step.

/* ---------------------------------------------------------------- people */

create table if not exists users (
  user_id      uuid primary key default gen_random_uuid(),
  -- Supabase's auth.users id when there is a sign-in, null when there is not.
  -- Nullable on purpose: a GP who appears in somebody's record but has never
  -- opened the product is still a real reporter of real information.
  auth_uid     uuid unique,
  full_name    text,
  email        text unique,
  primary_role stakeholder_role,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column users.primary_role is
  'The role this person acts in by default. Access is decided from the '
  'relationship to a given subject, not from this alone.';

-- The person the record is about. Called subject rather than patient because
-- most of what is held here is not clinical, and "patient" quietly reframes an
-- entire life as a medical one.
create table if not exists subjects (
  subject_id   uuid primary key default gen_random_uuid(),
  display_name text,
  date_of_birth date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

/* --------------------------------------------------------- relationships */

-- The edge that makes access possible at all. A role on its own grants
-- nothing: being a psychologist is not a reason to read this record, being
-- *this person's* psychologist is.
create table if not exists stakeholder_relationships (
  relationship_id uuid primary key default gen_random_uuid(),
  subject_id      uuid not null references subjects (subject_id) on delete cascade,
  user_id         uuid not null references users (user_id) on delete cascade,
  role            stakeholder_role not null,
  purpose         purpose_type,
  valid_from      timestamptz not null default now(),
  -- Null means open-ended. A date in the past means the relationship has
  -- lapsed, which is not the same as never having existed and must not be
  -- erased — the record of who could once see this is part of the account.
  valid_to        timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

/* ---------------------------------------------------------- the record */

create table if not exists record_items (
  item_id           uuid primary key default gen_random_uuid(),
  subject_id        uuid not null references subjects (subject_id) on delete cascade,
  domain            record_domain not null,
  title             text,
  content           text not null,
  structured        jsonb,

  -- Provenance, held as three separate facts because they answer three
  -- different questions: where it came from, who said it, and in what capacity.
  source_type       source_type not null,
  reported_by       uuid references users (user_id) on delete set null,
  reporter_role     stakeholder_role not null,

  -- When it happened, and when we heard about it. Both, always: a report of a
  -- meeting in March filed in August is two different dates and a timeline
  -- that uses one for the other tells a false story.
  occurred_at       timestamptz not null,
  recorded_at       timestamptz not null default now(),

  validation_status validation_status not null default 'unvalidated',
  evidence_strength numeric not null default 0.5
                    check (evidence_strength >= 0 and evidence_strength <= 1),

  -- Flagged rather than inferred from source_type, so a filter for "nothing a
  -- model wrote" is one predicate and cannot be got wrong.
  is_ai_derived     boolean not null default false,

  -- Correction by supersession, never by overwrite. The wrong version stays,
  -- pointing at the right one, because a record that silently changes is one
  -- nobody can be held to.
  supersedes        uuid references record_items (item_id) on delete set null,
  superseded_by     uuid references record_items (item_id) on delete set null,
  is_current        boolean not null default true,

  sensitivity       sensitivity_level not null default 'moderate',
  search_vector     tsvector,
  tags              text[],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

/* -------------------------------------------------------------- policy */

-- The whole access model, as data.
--
-- One row per (role, domain, sensitivity, purpose). Making this a table rather
-- than a chain of conditions in application code means the rules can be read,
-- queried, diffed and shown to the person they are about — and that a change
-- to who may see what is a row, not a deploy.
create table if not exists access_policies (
  policy_id        uuid primary key default gen_random_uuid(),
  role             stakeholder_role not null,
  domain           record_domain not null,
  sensitivity      sensitivity_level not null,
  purpose          purpose_type not null,
  allowed          boolean not null default false,
  requires_consent boolean not null default false,
  requires_approval boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (role, domain, sensitivity, purpose)
);

/* ----------------------------------------------------------------- runs */

/**
 * The one table here that may already exist.
 *
 * A `runs` table was created in the live project outside these migrations,
 * holding a workflow run this file knows nothing about. Its columns match what
 * is written below except that it has no started_at or ended_at.
 *
 * So this creates only if absent, and adds the two missing columns either way.
 * The alternative — dropping and recreating to get one clean definition —
 * would delete a real row to make a migration tidier, which is never the trade.
 *
 * One consequence, stated rather than hidden: where the table already exists
 * `if not exists` skips the whole definition, so that table keeps whatever
 * constraints it was created with and does not gain the foreign keys below.
 * Nothing in this stage depends on them — orca_scope and orca_retrieve read
 * runs.context, not the id columns — and adding constraints to a table this
 * file did not create is a bigger decision than making the file rerunnable.
 */
create table if not exists runs (
  run_id        uuid primary key default gen_random_uuid(),
  lane          text,
  workflow_name text,
  status        run_status not null default 'pending',
  -- Everything the run was started with: actor, subject, purpose, the original
  -- message, any detected intent and time range. Held as jsonb because this is
  -- the boundary where a workflow's own vocabulary arrives, and freezing it
  -- into columns now would be guessing at workflows not yet written.
  context       jsonb not null,
  result        jsonb,
  actor_id      uuid references users (user_id) on delete set null,
  subject_id    uuid references subjects (subject_id) on delete cascade,
  parent_run_id uuid references runs (run_id) on delete set null,
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Added separately so they also arrive on a runs table this file did not create.
alter table runs add column if not exists started_at timestamptz;
alter table runs add column if not exists ended_at   timestamptz;

/* -------------------------------------------------------------- indexes */

-- Partial on is_current: every read path in this stage asks for the live
-- record, and superseded rows would otherwise sit in the index making every
-- one of those reads pay for history it did not ask for.
create index if not exists record_items_domain_recent_idx
  on record_items (subject_id, domain, occurred_at desc) where is_current;
create index if not exists record_items_recent_idx
  on record_items (subject_id, occurred_at desc) where is_current;
create index if not exists record_items_search_idx on record_items using gin (search_vector);
create index if not exists record_items_tags_idx on record_items using gin (tags);

create index if not exists stakeholder_relationships_active_idx
  on stakeholder_relationships (subject_id, user_id) where is_active;

create index if not exists runs_status_idx on runs (status, updated_at desc);

/* ------------------------------------------------------------- triggers */

drop trigger if exists users_touch on users;
create trigger users_touch before update on users
  for each row execute function orca_touch_updated_at();
drop trigger if exists subjects_touch on subjects;
create trigger subjects_touch before update on subjects
  for each row execute function orca_touch_updated_at();
drop trigger if exists stakeholder_relationships_touch on stakeholder_relationships;
create trigger stakeholder_relationships_touch before update on stakeholder_relationships
  for each row execute function orca_touch_updated_at();
drop trigger if exists record_items_touch on record_items;
create trigger record_items_touch before update on record_items
  for each row execute function orca_touch_updated_at();
drop trigger if exists access_policies_touch on access_policies;
create trigger access_policies_touch before update on access_policies
  for each row execute function orca_touch_updated_at();
drop trigger if exists runs_touch on runs;
create trigger runs_touch before update on runs
  for each row execute function orca_touch_updated_at();

/**
 * The search vector, maintained here rather than by whoever writes the row.
 *
 * unaccent matters more than it looks: the names and words in this record are
 * Indian, and a search for "Divya" that misses "Divyā" is a search that fails
 * exactly the people the product is for. Keeping it in a trigger means a row
 * inserted by a migration, a connector or a person is indexed identically.
 *
 * unaccent is not immutable, so it cannot be used in a generated column or a
 * plain expression index — this trigger is the supported way to do it.
 */
create or replace function orca_record_items_search()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(new.title, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(new.content, ''))), 'B');
  return new;
end;
$$;

drop trigger if exists record_items_search on record_items;
create trigger record_items_search
  before insert or update of title, content on record_items
  for each row execute function orca_record_items_search();
