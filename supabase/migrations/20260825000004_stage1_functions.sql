-- Stage 1, step 4: the three functions.
--
-- All access logic lives here, in the database, and nowhere else. An
-- application that decides what it may read has already decided, and every
-- future caller — a workflow connector, an Edge Function, a report script,
-- somebody at a psql prompt — would have to reimplement the same rules and get
-- them identically right. One implementation, one place, and the answer to
-- "why could they see that" is a query rather than an investigation.
--
-- SECURITY DEFINER with search_path pinned: these read policy tables the
-- caller may not have rights to, and an unpinned search_path on a definer
-- function is the classic way that privilege gets handed to a caller-supplied
-- schema.

/**
 * Whether this actor may read this kind of information about this subject,
 * for this purpose.
 *
 * Three independent things must all hold, and any one of them missing is a no:
 * the actor must have a role, they must have a live relationship to *this*
 * subject, and the policy row for that combination must say allowed.
 *
 * There is no branch in this function that returns true without finding a
 * policy row. A missing row is a denial, which is what makes the closed-by-
 * default seed meaningful.
 */
create or replace function orca_can_access(
  p_actor       uuid,
  p_subject     uuid,
  p_domain      record_domain,
  p_sensitivity sensitivity_level,
  p_purpose     purpose_type
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    stakeholder_role;
  v_allowed boolean;
begin
  if p_actor is null or p_subject is null then
    return false;
  end if;

  select primary_role into v_role from users where user_id = p_actor;
  if v_role is null then
    return false;
  end if;

  -- The relationship, not the role, is what connects this person to this
  -- record. A psychologist with no relationship here is a stranger.
  if not exists (
    select 1
    from stakeholder_relationships
    where subject_id = p_subject
      and user_id = p_actor
      and is_active
      and (valid_to is null or valid_to > now())
  ) then
    return false;
  end if;

  select allowed into v_allowed
  from access_policies
  where role = v_role
    and domain = p_domain
    and sensitivity = p_sensitivity
    and purpose = p_purpose;

  -- coalesce, not "if found": a policy row that exists with allowed null is
  -- as much an unanswered question as one that does not exist.
  return coalesce(v_allowed, false);
end;
$$;

comment on function orca_can_access is
  'The single access decision. Role from users, relationship from '
  'stakeholder_relationships, permission from access_policies. Never returns '
  'true without all three.';

/**
 * Every (domain, sensitivity) pair this run is permitted to touch.
 *
 * Computed once per run rather than per row. This is what makes the retrieval
 * below safe by construction: the query filters on a set of pairs that was
 * decided before any content was looked at, so a document cannot argue its way
 * into a result by being a good match.
 */
create or replace function orca_scope(p_run_id uuid)
returns table (domain record_domain, sensitivity sensitivity_level)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx     jsonb;
  v_actor   uuid;
  v_subject uuid;
  v_purpose purpose_type;
begin
  select context into v_ctx from runs where run_id = p_run_id;
  if v_ctx is null then
    return;
  end if;

  v_actor   := nullif(v_ctx->>'actor_id', '')::uuid;
  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  v_purpose := nullif(v_ctx->>'purpose', '')::purpose_type;

  if v_actor is null or v_subject is null or v_purpose is null then
    return;
  end if;

  return query
  select d, s
  from unnest(enum_range(null::record_domain)) as d
  cross join unnest(enum_range(null::sensitivity_level)) as s
  where orca_can_access(v_actor, v_subject, d, s, v_purpose);
end;
$$;

comment on function orca_scope is
  'The permitted (domain, sensitivity) pairs for a run. Decided from the run '
  'context before any record content is read.';

/**
 * Retrieval, scoped first and ranked second.
 *
 * The order matters more than the ranking does. Scope is applied as a join
 * against the permitted pairs, so an item outside them is not scored low — it
 * is not in the query. There is no relevance high enough to reach a row this
 * actor may not see, and no way for a change to the scoring to alter that.
 *
 * The score blends three things that pull in different directions:
 *   0.45 textual match      — what they asked about
 *   0.35 recency, decaying  — half-life around six months, so last week
 *                             outranks last year without erasing it
 *   0.20 evidence strength  — a confirmed observation over a passing note
 *
 * Text is weighted highest but cannot win alone: "what has changed" matches
 * almost nothing textually, and the recency term is what makes that question
 * answerable at all.
 */
create or replace function orca_retrieve(
  p_run_id uuid,
  p_query  text default null,
  p_limit  int default 40
) returns table (
  item_id           uuid,
  title             text,
  content           text,
  domain            record_domain,
  occurred_at       timestamptz,
  source_type       source_type,
  reporter_role     stakeholder_role,
  validation_status validation_status,
  is_ai_derived     boolean,
  sensitivity       sensitivity_level,
  score             numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx     jsonb;
  v_subject uuid;
  v_query   text;
  v_from    timestamptz;
  v_to      timestamptz;
  v_tsq     tsquery;
begin
  select context into v_ctx from runs where run_id = p_run_id;
  if v_ctx is null then
    return;
  end if;

  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  if v_subject is null then
    return;
  end if;

  -- The caller's query wins; otherwise what the person actually typed.
  v_query := coalesce(nullif(p_query, ''), nullif(v_ctx->>'original_message', ''));

  -- Six months back by default. A window has to be chosen, and an unbounded
  -- one turns "what has changed" into "everything ever recorded", which is the
  -- failure this function exists to avoid.
  v_from := coalesce(
    nullif(v_ctx->'relevant_time_range'->>'from', '')::timestamptz,
    now() - interval '6 months'
  );
  v_to := coalesce(
    nullif(v_ctx->'relevant_time_range'->>'to', '')::timestamptz,
    now()
  );

  -- websearch_to_tsquery never raises on odd punctuation, unlike to_tsquery.
  -- A null query is a valid request here: it means "everything in scope in
  -- this window", ranked by recency and strength.
  v_tsq := case
    when v_query is null then null
    else websearch_to_tsquery('simple', unaccent(v_query))
  end;

  return query
  select
    ri.item_id,
    ri.title,
    ri.content,
    ri.domain,
    ri.occurred_at,
    ri.source_type,
    ri.reporter_role,
    ri.validation_status,
    ri.is_ai_derived,
    ri.sensitivity,
    -- Cast before rounding: ts_rank_cd returns real and exp returns double
    -- precision, so the sum is double precision, and round(double, int) does
    -- not exist in Postgres — only round(numeric, int) does.
    round((
        0.45 * coalesce(ts_rank_cd(ri.search_vector, v_tsq), 0)
      + 0.35 * exp(-(extract(epoch from (now() - ri.occurred_at)) / 86400.0) / 180.0)
      + 0.20 * ri.evidence_strength
    )::numeric, 4) as score
  from record_items ri
  -- The scope join. Not a filter added to a query that could have run without
  -- it — the permitted set is a table this query is built on.
  join orca_scope(p_run_id) sc
    on sc.domain = ri.domain and sc.sensitivity = ri.sensitivity
  where ri.subject_id = v_subject
    and ri.is_current
    and ri.occurred_at >= v_from
    and ri.occurred_at <= v_to
  order by score desc, ri.occurred_at desc
  limit greatest(p_limit, 0);
end;
$$;

comment on function orca_retrieve is
  'Scoped retrieval for a run. Scope is joined, not filtered: no relevance '
  'score can reach a row the actor may not see.';
