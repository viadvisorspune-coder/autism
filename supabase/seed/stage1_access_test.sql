-- Stage 1 proof: four people, one subject, one question, four answers.
--
-- The four runs are identical except for who is asking. Any difference in the
-- results is therefore caused by the access model and nothing else, which is
-- the only way to test a permission system honestly — hold everything else
-- still and vary the one thing.
--
-- Four assertions, each of which raises rather than prints. A test that
-- reports a failure in prose is a test somebody will read past.

\set ON_ERROR_STOP on
\pset border 2

\echo ''
\echo '=============================================================='
\echo ' WHAT EACH PERSON SEES  ·  "what has changed in the last three months"'
\echo '=============================================================='

select
  u.full_name || ' (' || u.primary_role || ')' as who,
  r.context->>'purpose'                        as purpose,
  count(x.item_id)                             as items,
  coalesce(string_agg(distinct x.domain::text, ', ' order by x.domain::text), '—') as domains
from runs r
join users u on u.user_id = r.actor_id
left join lateral orca_retrieve(r.run_id) x on true
group by u.full_name, u.primary_role, r.context->>'purpose', r.created_at
order by count(x.item_id) desc;

\echo ''
\echo '-------------------------------- every row returned, side by side'

select
  u.primary_role::text  as role,
  x.domain::text        as domain,
  x.sensitivity::text   as sens,
  to_char(x.occurred_at, 'YYYY-MM-DD') as occurred,
  x.score,
  left(x.title, 42)     as title
from runs r
join users u on u.user_id = r.actor_id
join lateral orca_retrieve(r.run_id) x on true
order by u.primary_role::text, x.score desc;

\echo ''
\echo '=============================================================='
\echo ' ASSERTIONS'
\echo '=============================================================='

do $$
declare
  v_patient int; v_psych int; v_employer int; v_trusted int;
  v_bad     int; v_outside int;
begin
  select count(*) into v_patient  from orca_retrieve('d0000000-0000-0000-0000-000000000001');
  select count(*) into v_psych    from orca_retrieve('d0000000-0000-0000-0000-000000000002');
  select count(*) into v_employer from orca_retrieve('d0000000-0000-0000-0000-000000000003');
  select count(*) into v_trusted  from orca_retrieve('d0000000-0000-0000-0000-000000000004');

  -- 1. The subject sees the most. Nobody may be shown more of a person's
  --    record than the person themselves.
  if not (v_patient > v_psych and v_patient > v_employer and v_patient > v_trusted) then
    raise exception 'FAIL 1: patient (%) does not see the most (psych %, employer %, trusted %)',
      v_patient, v_psych, v_employer, v_trusted;
  end if;
  raise notice 'PASS 1  patient sees the most: % vs psychologist %, employer %, trusted %',
    v_patient, v_psych, v_employer, v_trusted;

  /**
   * 2. The employer sees workplace, and outside it only what the policy
   *    explicitly opened.
   *
   *    Stated as "workplace only" first, which is not quite what the policy
   *    says and the test caught the difference: `functional` at `low` is
   *    granted to an employer with requires_consent, so an adjustment can be
   *    arranged without the reason for it being disclosed. One row qualifies,
   *    and asserting it away would have hidden a deliberate rule.
   *
   *    So the check is the stronger one the rule actually means: nothing
   *    clinical, nothing personal, and every non-workplace row that does come
   *    back must be a consent-gated pair rather than an accident.
   */
  select count(*) into v_bad
  from orca_retrieve('d0000000-0000-0000-0000-000000000003')
  where domain in ('clinical', 'personal');
  if v_bad > 0 or v_employer = 0 then
    raise exception 'FAIL 2a: employer saw % clinical/personal rows (total %)', v_bad, v_employer;
  end if;

  select count(*) into v_bad
  from orca_retrieve('d0000000-0000-0000-0000-000000000003') x
  where x.domain <> 'workplace'
    and not exists (
      select 1 from access_policies p
      where p.role = 'employer' and p.domain = x.domain
        and p.sensitivity = x.sensitivity and p.purpose = 'accommodation'
        and p.allowed and p.requires_consent
    );
  if v_bad > 0 then
    raise exception 'FAIL 2b: employer saw % non-workplace rows that are not consent-gated', v_bad;
  end if;
  raise notice 'PASS 2  employer: % rows, 0 clinical/personal, every non-workplace row consent-gated',
    v_employer;

  -- 3. The trusted person sees no clinical information. The relationship is
  --    real and the access is real; the clinical domain is simply not theirs.
  select count(*) into v_bad
  from orca_retrieve('d0000000-0000-0000-0000-000000000004')
  where domain = 'clinical';
  if v_bad > 0 then
    raise exception 'FAIL 3: trusted person saw % clinical rows', v_bad;
  end if;
  raise notice 'PASS 3  trusted person sees no clinical rows (total % rows)', v_trusted;

  -- 4. The one that matters most. Every returned row, for every run, must sit
  --    inside that run's own permitted pairs — checked against orca_scope
  --    independently rather than trusting the retrieval that produced it.
  select count(*) into v_outside
  from runs r
  join lateral orca_retrieve(r.run_id) x on true
  where not exists (
    select 1 from orca_scope(r.run_id) s
    where s.domain = x.domain and s.sensitivity = x.sensitivity
  );
  if v_outside > 0 then
    raise exception 'FAIL 4: % returned rows fall outside their run''s permitted pairs', v_outside;
  end if;
  raise notice 'PASS 4  no row outside its permitted pairs, across all four runs';

  raise notice '';
  raise notice 'All four assertions passed.';
end;
$$;

\echo ''
\echo '-------------------------------- why the employer sees so little'

select
  domain::text      as domain,
  sensitivity::text as sensitivity,
  'permitted'       as status
from orca_scope('d0000000-0000-0000-0000-000000000003')
order by domain::text, sensitivity::text;

\echo ''
\echo '-------------------------------- superseded rows stay out'

select
  count(*) filter (where is_current)     as current_items,
  count(*) filter (where not is_current) as superseded_items,
  count(*)                               as total_written
from record_items;
