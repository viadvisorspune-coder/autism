-- Retrieval honours the relationship start date.
--
-- orca_access_floor computes it; nothing used it. A rule the database can
-- state and not apply is worse than one it never claimed, because the claim
-- gets believed.
--
-- Applied inside the query rather than by the caller, for the same reason the
-- scope is joined rather than filtered: a limit that a caller has to remember
-- is a limit that will one day be forgotten.

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
  v_ctx jsonb; v_subject uuid; v_actor uuid; v_query text;
  v_from timestamptz; v_to timestamptz; v_floor timestamptz; v_tsq tsquery;
begin
  select context into v_ctx from runs where run_id = p_run_id;
  if v_ctx is null then return; end if;
  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  v_actor   := nullif(v_ctx->>'actor_id', '')::uuid;
  if v_subject is null then return; end if;

  v_query := coalesce(nullif(p_query, ''), nullif(v_ctx->>'original_message', ''));
  v_from := coalesce(nullif(v_ctx->'relevant_time_range'->>'from','')::timestamptz,
                     now() - interval '6 months');
  v_to   := coalesce(nullif(v_ctx->'relevant_time_range'->>'to','')::timestamptz, now());

  -- The relationship floor beats the requested window. Asking for a wider
  -- range cannot reach further back than the relationship itself.
  v_floor := orca_access_floor(v_actor, v_subject);
  if v_floor is not null and v_floor > v_from then v_from := v_floor; end if;

  v_tsq := case when v_query is null then null
                else websearch_to_tsquery('simple', unaccent(v_query)) end;

  return query
  select ri.item_id, ri.title, ri.content, ri.domain, ri.occurred_at, ri.source_type,
         ri.reporter_role, ri.validation_status, ri.is_ai_derived, ri.sensitivity,
         round((
             0.45 * coalesce(ts_rank_cd(ri.search_vector, v_tsq), 0)
           + 0.35 * exp(-(extract(epoch from (now() - ri.occurred_at))/86400.0)/180.0)
           + 0.20 * ri.evidence_strength)::numeric, 4)
  from record_items ri
  join orca_scope(p_run_id) sc
    on sc.domain = ri.domain and sc.sensitivity = ri.sensitivity
  where ri.subject_id = v_subject and ri.is_current
    and ri.occurred_at >= v_from and ri.occurred_at <= v_to
  order by 11 desc, ri.occurred_at desc
  limit greatest(p_limit, 0);
end;
$$;

create or replace function orca_retrieve_hybrid(
  p_run_id    uuid,
  p_embedding vector(1536) default null,
  p_query     text default null,
  p_limit     int default 40
) returns table (
  item_id uuid, title text, content text, domain record_domain,
  occurred_at timestamptz, source_type source_type, reporter_role stakeholder_role,
  validation_status validation_status, is_ai_derived boolean,
  sensitivity sensitivity_level, score numeric, matched_on text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx jsonb; v_subject uuid; v_actor uuid; v_query text;
  v_from timestamptz; v_to timestamptz; v_floor timestamptz; v_tsq tsquery;
begin
  select context into v_ctx from runs where run_id = p_run_id;
  if v_ctx is null then return; end if;
  v_subject := nullif(v_ctx->>'subject_id', '')::uuid;
  v_actor   := nullif(v_ctx->>'actor_id', '')::uuid;
  if v_subject is null then return; end if;

  v_query := coalesce(nullif(p_query, ''), nullif(v_ctx->>'original_message', ''));
  v_from := coalesce(nullif(v_ctx->'relevant_time_range'->>'from','')::timestamptz,
                     now() - interval '6 months');
  v_to   := coalesce(nullif(v_ctx->'relevant_time_range'->>'to','')::timestamptz, now());
  v_floor := orca_access_floor(v_actor, v_subject);
  if v_floor is not null and v_floor > v_from then v_from := v_floor; end if;

  v_tsq := case when v_query is null then null
                else websearch_to_tsquery('simple', unaccent(v_query)) end;

  return query
  select ri.item_id, ri.title, ri.content, ri.domain, ri.occurred_at, ri.source_type,
         ri.reporter_role, ri.validation_status, ri.is_ai_derived, ri.sensitivity,
         round((
             0.30 * coalesce(ts_rank_cd(ri.search_vector, v_tsq), 0)
           + 0.30 * coalesce(1 - (ri.embedding <=> p_embedding), 0)
           + 0.25 * exp(-(extract(epoch from (now() - ri.occurred_at))/86400.0)/180.0)
           + 0.15 * ri.evidence_strength)::numeric, 4),
         case
           when ri.embedding is null then 'words only (not yet embedded)'
           when p_embedding is null  then 'words, recency and evidence'
           when coalesce(ts_rank_cd(ri.search_vector, v_tsq), 0) > 0 then 'words and meaning'
           else 'meaning' end
  from record_items ri
  join orca_scope(p_run_id) sc
    on sc.domain = ri.domain and sc.sensitivity = ri.sensitivity
  where ri.subject_id = v_subject and ri.is_current
    and ri.occurred_at >= v_from and ri.occurred_at <= v_to
  order by 11 desc, ri.occurred_at desc
  limit greatest(p_limit, 0);
end;
$$;

comment on function orca_retrieve is
  'Scoped retrieval. Scope is joined, not filtered, and the relationship start '
  'date is a floor no requested time range can reach past.';
