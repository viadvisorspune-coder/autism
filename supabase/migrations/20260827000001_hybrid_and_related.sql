-- Stage 1, step 6: meaning-based search, and following the links.
--
-- WHY THIS EXISTS, in one example from the record itself.
--
-- Search the year for the word "sensory" and three records out of ninety-five
-- come back. These five are all about sensory difficulty and none of them use
-- the word:
--
--   2025-09-04  What I find hard — writing this down properly for once
--   2025-12-27  Thinking about the last two weeks
--   2026-02-16  The commute is getting worse though
--   2026-04-02  Recommendations to occupational health
--   2026-05-16  Worst week so far
--
-- The last is the most important entry of the year — "everything is loud and I
-- am not managing conversations" — and word-matching cannot see it, because
-- Ananya does not write like a clinician. She says loud. The OT says auditory
-- sensitivity. Same thing, no shared words.
--
-- That gap is not a search-tuning problem. It is the whole difficulty of a
-- record written by eleven people who use different vocabulary for the same
-- life, which is the thing this product exists to hold.

create extension if not exists vector;

/* ---------------------------------------------------------- the embedding */

/**
 * The embedding lives on record_items, not in a table of its own.
 *
 * A separate embeddings table was the obvious design and it is the wrong one
 * here. An embedding is a copy of the content, and a copy that sits somewhere
 * else needs its domain and sensitivity copied alongside it — at which point
 * there are two statements of who may read this row, and the day they disagree
 * is the day the index becomes a way around the policy. Retrieval by
 * similarity would reach a restricted record that retrieval by permission
 * would not.
 *
 * Kept on the row, the embedding cannot drift from the record's scope, because
 * it *is* the record's scope. There is one sensitivity column, and everything
 * reads it.
 *
 * 1536 dimensions matches the common text-embedding model size. Nullable, and
 * deliberately so — see the search function for what a missing embedding does
 * and, more importantly, what it must never do.
 */
alter table record_items
  add column if not exists embedding vector(1536);

comment on column record_items.embedding is
  'Meaning of title+content as a vector, for semantic search. Null until '
  'generated. A null embedding never removes a record from search — it only '
  'means that record cannot be found by meaning, and must still be found by '
  'its words.';

-- HNSW over cosine distance. Built on the same table the permission columns
-- live on, so there is no second place holding a copy of who may read what.
create index if not exists record_items_embedding_idx
  on record_items using hnsw (embedding vector_cosine_ops);

/* ------------------------------------------------------------ hybrid search */

/**
 * The same retrieval as orca_retrieve, with meaning added as a fourth signal.
 *
 * Four things pull in different directions and none of them wins alone:
 *
 *   0.30  words     — what they typed, matched exactly. Wins for "Sertraline",
 *                     where a near-miss is the wrong drug.
 *   0.30  meaning   — what they meant. Wins for "sensory overload" against an
 *                     entry that says everything is loud.
 *   0.25  recency   — decaying with a half-life near six months, so last week
 *                     outranks last year without erasing it.
 *   0.15  evidence  — a confirmed observation over a passing note.
 *
 * SCOPE IS STILL JOINED, NOT FILTERED. That is the part that matters and the
 * part that is easy to lose when adding a second index: the permitted pairs
 * are a table this query is built on, so no similarity score, however high,
 * reaches a row this actor may not see. Adding semantic search did not add a
 * second route to the content; it added a second way to rank the same
 * permitted rows.
 *
 * A NULL EMBEDDING NEVER HIDES A RECORD. The semantic term contributes zero
 * for a record that has not been embedded, and the row still competes on its
 * words, its date and its evidence. A record that quietly vanished from search
 * because a background job failed would be the worst possible failure here —
 * invisible, unreported, and indistinguishable from the record simply not
 * existing.
 */
create or replace function orca_retrieve_hybrid(
  p_run_id    uuid,
  p_embedding vector(1536) default null,
  p_query     text default null,
  p_limit     int default 40
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
  score             numeric,
  matched_on        text
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
  if v_ctx is null then return; end if;

  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  if v_subject is null then return; end if;

  v_query := coalesce(nullif(p_query, ''), nullif(v_ctx->>'original_message', ''));
  v_from := coalesce(nullif(v_ctx->'relevant_time_range'->>'from', '')::timestamptz,
                     now() - interval '6 months');
  v_to   := coalesce(nullif(v_ctx->'relevant_time_range'->>'to', '')::timestamptz, now());
  v_tsq  := case when v_query is null then null
                 else websearch_to_tsquery('simple', unaccent(v_query)) end;

  return query
  select
    ri.item_id, ri.title, ri.content, ri.domain, ri.occurred_at, ri.source_type,
    ri.reporter_role, ri.validation_status, ri.is_ai_derived, ri.sensitivity,
    round((
        0.30 * coalesce(ts_rank_cd(ri.search_vector, v_tsq), 0)
        -- Cosine distance runs 0..2; 1 - distance is the similarity. coalesce
        -- to zero rather than excluding: no embedding means no semantic
        -- evidence, not disqualification.
      + 0.30 * coalesce(1 - (ri.embedding <=> p_embedding), 0)
      + 0.25 * exp(-(extract(epoch from (now() - ri.occurred_at)) / 86400.0) / 180.0)
      + 0.15 * ri.evidence_strength
    )::numeric, 4) as score,
    -- Said out loud, because a person reading a result deserves to know why it
    -- is in front of them, and "the model thought so" is not a reason.
    case
      when ri.embedding is null then 'words only (not yet embedded)'
      when p_embedding is null  then 'words, recency and evidence'
      when coalesce(ts_rank_cd(ri.search_vector, v_tsq), 0) > 0 then 'words and meaning'
      else 'meaning'
    end as matched_on
  from record_items ri
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

comment on function orca_retrieve_hybrid is
  'Scoped retrieval ranked on words, meaning, recency and evidence. Scope is '
  'joined, not filtered. A record with no embedding is still findable.';

/* ------------------------------------------------------- following the links */

/**
 * What a record is connected to.
 *
 * Search returns rows. This returns the story around one of them: the earlier
 * version it replaced, the correction that replaced it, and the records that
 * share its subject matter. The sensory profile of March means little alone;
 * beside the October profile it supersedes, it shows six months of a
 * professional changing their mind, which is the thing a person actually wants
 * to know.
 *
 * SCOPE IS CHECKED AT EVERY HOP, not once at the start. A permitted record may
 * be linked to one that is not — the March sensory profile is functional and
 * readable by an employer, and it could as easily have been corrected by a
 * clinical note that is not. Traversal is exactly the operation that would
 * carry a reader across that line without either of them noticing, so the
 * scope join sits inside the recursion rather than in front of it.
 *
 * Depth is bounded and visited nodes are tracked, because a supersession chain
 * with a cycle in it — however it got there — should return a wrong answer
 * rather than never returning at all.
 */
create or replace function orca_related(
  p_run_id  uuid,
  p_item_id uuid,
  p_depth   int default 2
) returns table (
  item_id     uuid,
  title       text,
  domain      record_domain,
  occurred_at timestamptz,
  relation    text,
  depth       int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with recursive permitted as (
    -- The permitted rows for this run, computed once. Everything below joins
    -- against this, so a hop can only ever land inside it.
    select ri.item_id, ri.title, ri.domain, ri.occurred_at,
           ri.supersedes, ri.superseded_by, ri.tags
    from record_items ri
    join orca_scope(p_run_id) sc
      on sc.domain = ri.domain and sc.sensitivity = ri.sensitivity
  ),
  walk as (
    select p.item_id, p.title, p.domain, p.occurred_at,
           'start'::text as relation, 0 as depth,
           array[p.item_id] as seen
    from permitted p
    where p.item_id = p_item_id

    union all

    select n.item_id, n.title, n.domain, n.occurred_at, e.relation, w.depth + 1,
           w.seen || n.item_id
    from walk w
    join lateral (
      -- One row per edge leaving this node, labelled with what the edge means.
      select p.item_id, 'replaced by'::text as relation
        from permitted p join permitted c on c.superseded_by = p.item_id
        where c.item_id = w.item_id
      union all
      select p.item_id, 'replaces'::text
        from permitted p join permitted c on c.supersedes = p.item_id
        where c.item_id = w.item_id
      union all
      select p.item_id, 'shares subject matter'::text
        from permitted p, permitted c
        where c.item_id = w.item_id
          and p.item_id <> c.item_id
          and p.tags && c.tags
    ) e on true
    join permitted n on n.item_id = e.item_id
    where w.depth < greatest(p_depth, 0)
      and not (n.item_id = any(w.seen))
  )
  select distinct on (walk.item_id)
         walk.item_id, walk.title, walk.domain, walk.occurred_at,
         walk.relation, walk.depth
  from walk
  order by walk.item_id, walk.depth, walk.relation;
end;
$$;

comment on function orca_related is
  'Records connected to a given one — corrections in both directions and shared '
  'subject matter — with the permission check inside the recursion, so no hop '
  'can leave what this run may see.';
