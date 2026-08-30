-- Stage 1, step 7: what each agent did, and the brief the next workflow reuses.
--
-- Two tables the workflow specification requires and the database did not have.
-- ORCA_UNDERSTAND's hard rules name `agents_run` directly, and its purpose
-- names a reusable context brief. Neither existed, so both rules described
-- behaviour nothing could actually perform.

/* ------------------------------------------------------------ agents_run */

/**
 * Every step, including the ones that did nothing.
 *
 * The obvious design records the agents that ran. That is the wrong one, and
 * the reason is the whole point of the table: an absent row is ambiguous. A
 * step that stood down because it was not needed, a step that crashed, and a
 * step that was never reached all look identical when the evidence is silence.
 *
 * Steps 4 to 6 of ORCA_UNDERSTAND are conditional. When the Comparator does
 * not run, the workflow needs to be able to show that it *chose* not to, and
 * why — `needs_comparison` was false — rather than leaving a reader to infer
 * it. "Skipped" is a result. It gets a row, with its reason.
 *
 * tools_called exists because of a real failure: a run where every step
 * reported success and the final output tool was never invoked, so the run
 * produced no answer and nothing anywhere said so. A step that reports success
 * without calling the tool that is its entire purpose should be visible in one
 * query, not by reading a graph and noticing a node is a paler grey.
 */
create table if not exists agents_run (
  agent_run_id uuid primary key default gen_random_uuid(),
  run_id       uuid not null references runs (run_id) on delete cascade,
  step_number  int  not null,
  step_name    text not null,
  agent_name   text,

  -- 'skipped' is as much a result as 'ran'. 'failed' is separate from both:
  -- an agent that tried and could not is not an agent that stood down.
  outcome      text not null default 'ran'
               check (outcome in ('ran', 'skipped', 'failed')),

  -- Why it stood down, in the workflow's own vocabulary — 'needs_planning
  -- was false' — so the record explains itself without the reader holding the
  -- specification in their head.
  reason       text,

  tools_called text[] not null default '{}',
  output       jsonb,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One row per step per run. A retried step overwrites rather than
  -- accumulating, so the table answers "what did this run do" and not "how
  -- many times was it poked".
  unique (run_id, step_number)
);

create index if not exists agents_run_run_idx on agents_run (run_id, step_number);
create index if not exists agents_run_outcome_idx on agents_run (outcome, created_at desc);

drop trigger if exists agents_run_touch on agents_run;
create trigger agents_run_touch before update on agents_run
  for each row execute function orca_touch_updated_at();

/**
 * Record one step, whatever happened to it.
 *
 * Upsert on (run_id, step_number) so a step that runs, is retried, or is
 * revised leaves one honest row rather than a pile of partial ones.
 *
 * A skipped step is required to give a reason. That is the only rule this
 * function enforces beyond presence, and it is the one worth enforcing: a skip
 * with no reason is indistinguishable from a step nobody thought about.
 */
create or replace function orca_record_agent_run(
  p_run_id       uuid,
  p_step_number  int,
  p_step_name    text,
  p_agent_name   text default null,
  p_outcome      text default 'ran',
  p_reason       text default null,
  p_tools_called text[] default null,
  p_output       jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_run_id is null or p_step_number is null or p_step_name is null then
    raise exception 'orca_record_agent_run: run_id, step_number and step_name are required';
  end if;
  if p_outcome not in ('ran', 'skipped', 'failed') then
    raise exception 'orca_record_agent_run: outcome must be ran, skipped or failed, not %', p_outcome;
  end if;
  if p_outcome = 'skipped' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'orca_record_agent_run: a skipped step must say why it was skipped';
  end if;

  insert into agents_run (
    run_id, step_number, step_name, agent_name, outcome, reason,
    tools_called, output, ended_at
  ) values (
    p_run_id, p_step_number, p_step_name, p_agent_name, p_outcome, p_reason,
    coalesce(p_tools_called, '{}'), p_output, now()
  )
  on conflict (run_id, step_number) do update set
    step_name    = excluded.step_name,
    agent_name   = excluded.agent_name,
    outcome      = excluded.outcome,
    reason       = excluded.reason,
    tools_called = excluded.tools_called,
    output       = excluded.output,
    ended_at     = now()
  returning agent_run_id into v_id;

  return v_id;
end;
$$;

comment on function orca_record_agent_run is
  'Records one workflow step, run or skipped. A skipped step must give a '
  'reason: a skip with no reason cannot be told from a step nobody considered.';

/* -------------------------------------------------------- context briefs */

/**
 * What one run retrieved, so the next workflow need not retrieve it again.
 *
 * A brief is a cached retrieval, and a cached retrieval is a snapshot of a
 * permission decision. That is the whole difficulty. Handing ORCA_PRODUCE a
 * brief that ORCA_UNDERSTAND built is handing it a set of records that were
 * released to a particular person, for a particular purpose, at a particular
 * moment — and none of those three is guaranteed to still hold.
 *
 * So the brief stores the conditions it was made under, and reuse is refused
 * unless they still match. Consent gets withdrawn. A relationship lapses. A
 * purpose changes between asking a question and producing a document. A cache
 * that outlives the permission that created it is the quietest possible way to
 * disclose something, because every individual step looks correct.
 */
create table if not exists context_briefs (
  brief_id     uuid primary key default gen_random_uuid(),
  run_id       uuid not null references runs (run_id) on delete cascade,
  subject_id   uuid not null references subjects (subject_id) on delete cascade,

  -- The three things that must still be true before this may be reused.
  actor_id     uuid references users (user_id) on delete set null,
  purpose      purpose_type not null,
  permitted_scope jsonb not null,

  time_range   jsonb,
  item_ids     uuid[] not null default '{}',
  summary      jsonb,

  created_at   timestamptz not null default now(),
  -- A brief is a convenience, not a record. An hour is long enough for a
  -- question and the document that follows it, and short enough that a
  -- withdrawn consent is not honoured by a stale cache for a day.
  expires_at   timestamptz not null default now() + interval '1 hour',
  updated_at   timestamptz not null default now()
);

create index if not exists context_briefs_subject_idx
  on context_briefs (subject_id, created_at desc);
create index if not exists context_briefs_run_idx on context_briefs (run_id);

drop trigger if exists context_briefs_touch on context_briefs;
create trigger context_briefs_touch before update on context_briefs
  for each row execute function orca_touch_updated_at();

/** Store what this run retrieved, with the conditions that made it allowed. */
create or replace function orca_store_brief(
  p_run_id  uuid,
  p_summary jsonb default null,
  p_item_ids uuid[] default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx     jsonb;
  v_subject uuid;
  v_actor   uuid;
  v_purpose purpose_type;
  v_scope   jsonb;
  v_id      uuid;
begin
  select context into v_ctx from runs where run_id = p_run_id;
  if v_ctx is null then
    raise exception 'orca_store_brief: no such run %', p_run_id;
  end if;

  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  v_actor   := nullif(v_ctx->>'actor_id', '')::uuid;
  v_purpose := nullif(v_ctx->>'purpose', '')::purpose_type;
  if v_subject is null or v_purpose is null then
    raise exception 'orca_store_brief: the run context must name a subject and a purpose';
  end if;

  -- The scope is recorded as it was at retrieval time, so a later reuse can
  -- compare rather than assume.
  select coalesce(jsonb_agg(jsonb_build_object('domain', domain, 'sensitivity', sensitivity)
                            order by domain::text, sensitivity::text), '[]'::jsonb)
    into v_scope
  from orca_scope(p_run_id);

  insert into context_briefs (run_id, subject_id, actor_id, purpose, permitted_scope,
                              time_range, item_ids, summary)
  values (p_run_id, v_subject, v_actor, v_purpose, v_scope,
          v_ctx->'relevant_time_range', coalesce(p_item_ids, '{}'), p_summary)
  returning brief_id into v_id;

  return v_id;
end;
$$;

comment on function orca_store_brief is
  'Stores a run''s retrieval for reuse, together with the actor, purpose and '
  'permitted scope that made it allowed.';

/**
 * The most recent brief this run may reuse, or nothing.
 *
 * Four tests, all of which must pass. The fourth is the one that matters: the
 * scope is recomputed live and compared against what was stored, so a consent
 * withdrawn since the brief was written invalidates it. Trusting the stored
 * pairs would make this table a way to read what the actor may no longer see.
 */
create or replace function orca_reuse_brief(p_run_id uuid)
returns table (
  brief_id   uuid,
  item_ids   uuid[],
  summary    jsonb,
  created_at timestamptz,
  reusable   boolean,
  reason     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx     jsonb;
  v_subject uuid;
  v_actor   uuid;
  v_purpose purpose_type;
  v_scope   jsonb;
  b         context_briefs%rowtype;
begin
  select context into v_ctx from runs where run_id = p_run_id;
  if v_ctx is null then return; end if;

  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  v_actor   := nullif(v_ctx->>'actor_id', '')::uuid;
  v_purpose := nullif(v_ctx->>'purpose', '')::purpose_type;

  select * into b from context_briefs cb
  where cb.subject_id = v_subject
    and cb.actor_id is not distinct from v_actor
    and cb.expires_at > now()
  order by cb.created_at desc
  limit 1;

  if b.brief_id is null then
    return query select null::uuid, null::uuid[], null::jsonb, null::timestamptz,
                        false, 'No unexpired brief exists for this actor and subject.';
    return;
  end if;

  if b.purpose is distinct from v_purpose then
    return query select b.brief_id, null::uuid[], null::jsonb, b.created_at, false,
      format('The brief was retrieved for %s and this run is for %s. A different '
             'purpose is a different permission.', b.purpose, v_purpose);
    return;
  end if;

  -- Recomputed, not trusted. This is the test that catches a consent
  -- withdrawn between the question and the document.
  select coalesce(jsonb_agg(jsonb_build_object('domain', domain, 'sensitivity', sensitivity)
                            order by domain::text, sensitivity::text), '[]'::jsonb)
    into v_scope
  from orca_scope(p_run_id);

  if v_scope is distinct from b.permitted_scope then
    return query select b.brief_id, null::uuid[], null::jsonb, b.created_at, false,
      'What this actor may see has changed since the brief was stored. '
      'Retrieve again rather than reusing it.';
    return;
  end if;

  return query select b.brief_id, b.item_ids, b.summary, b.created_at, true, null::text;
end;
$$;

comment on function orca_reuse_brief is
  'Returns a stored brief only when the actor, subject and purpose match and '
  'the permitted scope, recomputed live, is unchanged. Otherwise says why not.';
