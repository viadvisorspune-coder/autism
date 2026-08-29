-- Stage 1, step 1: extensions, enums, and the updated_at trigger.
--
-- This is a deliberately small slice of a new record model. It stands beside
-- the existing schema rather than replacing it — nothing here drops, renames
-- or alters an existing table. The two models overlap in intent (subjects and
-- patients, record_items and timeline_events), and reconciling them is a
-- decision for later, taken once this slice has proved the access rules work.
--
-- The vocabulary below is the actual point of the stage. Every access decision
-- in this system is a function of four things — who is asking, what kind of
-- information, how sensitive, and what for — so all four are types the database
-- understands, not strings an application remembers to compare correctly.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

/* ------------------------------------------------------------------ enums */

-- Who is asking. Wider than a clinical team on purpose: the people who shape
-- an autistic adult's week include an employer and a sister, and a model that
-- can only describe clinicians cannot describe the actual problem.
create type stakeholder_role as enum (
  'patient', 'parent_caregiver', 'psychologist', 'psychiatrist', 'therapist',
  'ot', 'gp', 'clinic', 'educator', 'university', 'employer', 'coordinator',
  'trusted_person', 'statutory', 'admin'
);

-- What kind of information. This is the axis that keeps a workplace adjustment
-- out of a clinical record and a diagnosis out of an employer's inbox.
create type record_domain as enum (
  'personal', 'functional', 'clinical', 'support', 'workplace', 'education', 'outcome'
);

-- How much it costs the subject if it reaches the wrong person.
create type sensitivity_level as enum ('low', 'moderate', 'high', 'restricted');

-- Where a line came from. Kept separate from validation deliberately: an
-- unverified professional note and a confirmed self-report are different
-- things, and collapsing origin into confidence loses the distinction that
-- matters most to the person being described.
create type source_type as enum (
  'self_reported', 'professional_reported', 'document_derived',
  'system_derived', 'ai_derived'
);

-- What has happened to it since. 'disputed' exists because a record the
-- subject disagrees with must be able to say so without being deleted.
create type validation_status as enum (
  'unvalidated', 'professional_validated', 'subject_confirmed', 'disputed', 'outdated'
);

-- Why it is being read. The same person, the same record, a different purpose
-- is a different answer — an employer may see a functional note to arrange an
-- adjustment and not to satisfy curiosity.
create type purpose_type as enum (
  'care', 'support_planning', 'accommodation', 'coordination', 'statutory',
  'personal_understanding'
);

create type run_status as enum (
  'pending', 'done', 'needs_clarification', 'needs_approval', 'blocked'
);

/* ---------------------------------------------------------------- touched */

-- One trigger function, attached to every table in this stage. Kept here so
-- the tables that follow can simply reference it.
create or replace function orca_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function orca_touch_updated_at is
  'Maintains updated_at on write. Attached to every Stage 1 table.';
