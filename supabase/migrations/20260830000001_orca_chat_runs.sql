-- Somewhere for a v5 run's result to land.
--
-- The old workflows pushed their results into ORCA through API connectors:
-- Yoxa called `conversation-reply` and `output-artifact` mid-run, and the
-- answer arrived as a side effect of the run happening. The v5 workflows have
-- no Supabase connectors at all — they read attached documents and finish — so
-- that road is gone, and `workflow_runs` had nowhere to put an answer even if
-- one arrived.
--
-- These columns are that place. They are deliberately transport-agnostic: a
-- result may arrive from a completion webhook, from a poll of Yoxa's runs API,
-- or from a person pasting an envelope in during a demo. Whichever it is, it
-- lands here, and the screen reading this table does not need to know which.
--
-- Additive only. Nothing existing is dropped, renamed or narrowed.

alter table workflow_runs add column if not exists workflow_name text;
alter table workflow_runs add column if not exists actor_id text;
alter table workflow_runs add column if not exists deployment_id text;
alter table workflow_runs add column if not exists yoxa_run_id text;

-- The envelope exactly as Yoxa sent it, and the answer pulled out of it.
--
-- Both, rather than one. `result` is the record of what was received and is
-- never edited — if the parser is wrong, the original is still here to parse
-- again. `answer_html` is what the screen actually draws, and having it as a
-- column means the read path does not have to reach into JSON to find it.
alter table workflow_runs add column if not exists result jsonb;
alter table workflow_runs add column if not exists answer_html text;
alter table workflow_runs add column if not exists finished_at timestamptz;

/**
 * The run this one was composed from.
 *
 * A chain is two runs, not one run with two halves: asking what changed and
 * then asking for a letter about it are separate pieces of work, separately
 * auditable, and either can fail without invalidating the other. This column
 * is what makes the second one explicable — without it a PRODUCE run appears
 * to have invented its source material.
 */
alter table workflow_runs add column if not exists chained_from text
  references workflow_runs (id) on delete set null;

create index if not exists workflow_runs_yoxa_run_id_idx
  on workflow_runs (yoxa_run_id) where yoxa_run_id is not null;

create index if not exists workflow_runs_actor_idx
  on workflow_runs (actor_id, started_at desc);

comment on column workflow_runs.result is
  'The envelope as received from Yoxa, unmodified. The parsed form lives in '
  'answer_html; this is kept so a parsing mistake is recoverable.';
