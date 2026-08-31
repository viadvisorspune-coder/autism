-- The five demo paths, recorded on the run.
--
-- A request does not always map to one workflow. "Write a handover for Dr
-- Nair" with no recent retrieval is two runs — look first, then draft — and
-- the person who asked should see one answer, not two. So a run has to be able
-- to say what happens when it finishes.
--
-- Why this is a column and not an orchestrator holding state in memory: Yoxa
-- is asynchronous. The request that started the first run returned minutes
-- before its result arrives, and whatever process was waiting is long gone.
-- The instruction to continue has to survive on the row, or the second half of
-- a chain simply never happens.
--
-- Additive only. Nothing existing is dropped, renamed or narrowed.

/**
 * The lane to run when this run completes, and what to run it with.
 *
 * `next_message` is the person's ORIGINAL request, carried forward untouched.
 * The first run's answer becomes source material, but the request is what says
 * what they actually wanted made — a workflow given only the answer writes a
 * report about the answer rather than the letter that was asked for.
 */
alter table workflow_runs add column if not exists next_workflow text;
alter table workflow_runs add column if not exists next_message text;
alter table workflow_runs add column if not exists next_recipient jsonb;
alter table workflow_runs add column if not exists next_artifact_type text;

/**
 * Which of the five paths this run belongs to, and why that path was chosen.
 *
 * Recorded rather than inferred later. Routing is deterministic, so it can
 * always be re-derived in principle — but only from the record as it was at
 * the time, and that record changes. `route_reason` is the sentence the
 * interface shows the person before anything runs, so it has to be the actual
 * reason rather than a reconstruction of one.
 */
alter table workflow_runs add column if not exists path text;
alter table workflow_runs add column if not exists route_reason text;

create index if not exists workflow_runs_pending_next_idx
  on workflow_runs (next_workflow) where next_workflow is not null;

/**
 * Answered questions, for the replay lane.
 *
 * The CHATBOT path serves output that already exists, scoped to one actor and
 * one purpose. Finding it means asking "has this person, acting for this
 * purpose, already been told this?" — which is a query over completed runs,
 * so the columns it filters on need to be indexed together.
 */
create index if not exists workflow_runs_answered_idx
  on workflow_runs (actor_id, patient_id, status, started_at desc)
  where answer_html is not null;

comment on column workflow_runs.path is
  'Which demo path this run belongs to: understand_only, produce_only, '
  'understand_then_produce, fifteen_step, or chatbot_replay.';
