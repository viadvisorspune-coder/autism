-- Rehearsal runs, marked as such.
--
-- Every path can now be exercised without firing a Yoxa run: the router runs,
-- the trigger is composed, the row is written, and a stand-in answer is
-- recorded instead of calling out. That makes routing testable in seconds
-- rather than minutes, and survivable when a deployment is mid-configuration.
--
-- THE COLUMN IS THE WHOLE POINT. A rehearsal that is indistinguishable from a
-- real run is worse than no rehearsal: routing reads the record to decide
-- whether a question has already been answered and whether recent evidence
-- still stands, so a few practice runs would start steering real requests —
-- replaying a stand-in answer to somebody asking about their own record, or
-- drafting a document from material no workflow ever produced. It is also what
-- lets the interface say plainly that what is on screen is not a real answer.
--
-- Defaulting to false means every run already recorded stays real, which is
-- correct: they were.

alter table workflow_runs add column if not exists dry_run boolean not null default false;

-- Routing reads recent answered runs constantly and must skip these, so the
-- index it uses covers the flag rather than filtering after the fact.
create index if not exists workflow_runs_real_answered_idx
  on workflow_runs (actor_id, patient_id, started_at desc)
  where answer_html is not null and dry_run = false;

comment on column workflow_runs.dry_run is
  'True when the run was a rehearsal: routed and composed, but never sent to '
  'Yoxa, and answered with stand-in text. Excluded from every routing lookup.';
