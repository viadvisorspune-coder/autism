-- Consent, as rows rather than as browser state.
--
-- Two decisions the person whose record it is makes about other people, and
-- both of them have to outlive the tab they were made in. Until now they lived
-- in local storage, which is fine for showing what the interface does and
-- useless for anything else: Sana's request and Ananya's answer to it were
-- two facts in two different browsers that could never meet.
--
-- Both tables are deliberately thin. They record a DECISION, not the
-- information the decision is about — no question text is copied into the
-- record beyond the sentence the asker wrote, and no answer ever is.

/**
 * Somebody asking the subject for access they do not have.
 *
 * NOT `access_requests`. That table already exists, from the consent-history
 * migration, and it models a formal scope request — requested_by, an
 * orca_role, a purpose, a scope array, an expiry. This is the lighter thing
 * the gate raises: one person, one domain, one sentence, one answer. Reusing
 * the name would have been a `create table if not exists` that silently did
 * nothing and left every insert here failing against columns that are not
 * there.
 *
 * Raised by the gate: a therapist asks about medication, is stopped, and can
 * turn that into a request. The subject sees what was asked for and why, in
 * their Decisions, and answers it.
 *
 * `domain` rather than a table or column name. The gate is about a part of a
 * life — health, clinical, work — and the person deciding should be answering
 * "may Sana see my medication", not "may Sana select from clinical_entries".
 */
create table if not exists consent_gates (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  /** Who is asking. */
  person_id text not null,
  person_name text,
  person_role text,
  /** Which part of the record: clinical, health, work, education, personal, support. */
  domain text not null,
  /** What they were trying to find out, in their own words. */
  question text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

-- The subject's Decisions screen reads "what is pending for me", and the ask
-- path reads "has this person been granted this domain" on every question. Two
-- shapes, two indexes.
create index if not exists consent_gates_pending_idx
  on consent_gates (patient_id, status, created_at desc);
create index if not exists consent_gates_person_idx
  on consent_gates (person_id, status);

/**
 * Sharing the subject has stopped.
 *
 * A row here means "this person may currently see nothing", and its absence
 * means the ordinary connection applies. Recorded as an event with a time
 * rather than as a flag on `connections`, because withdrawing consent and
 * later restoring it is a history somebody may need to account for — and a
 * boolean that gets flipped back and forth keeps no history at all.
 *
 * `stopped_at` null means sharing was resumed. The row stays either way.
 */
create table if not exists sharing_stops (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  person_id text not null,
  stopped_at timestamptz not null default now(),
  resumed_at timestamptz,
  decided_by text
);

create index if not exists sharing_stops_live_idx
  on sharing_stops (patient_id, person_id) where resumed_at is null;

comment on table consent_gates is
  'Requests raised at a consent gate. A row is a question about access, never '
  'the information being asked about.';
comment on table sharing_stops is
  'Sharing the subject has withdrawn. Kept as history: resuming sets '
  'resumed_at rather than deleting the row.';

-- ------------------------------------------------------------------- locking
--
-- Row-level security on, with no policies at all.
--
-- Not an oversight — the absence of policies IS the policy. Supabase grants the
-- `anon` and `authenticated` roles table privileges on everything new in
-- `public`, so a table created without this is readable by anybody holding the
-- publishable key, which is compiled into the bundle every visitor downloads.
-- These two tables would then answer "who has been refused what" to the whole
-- internet — a disclosure about the subject made entirely out of metadata,
-- which is exactly the shape of leak the consent gate exists to prevent.
--
-- The service role bypasses RLS, and the service role is what the Edge
-- Functions use. So `app-read` and `app-write` are unaffected, and they are the
-- only two things that should ever be reading these rows: both decide scope
-- themselves before returning anything. Everything else gets nothing.
alter table consent_gates enable row level security;
alter table sharing_stops enable row level security;
