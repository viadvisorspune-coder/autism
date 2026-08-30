-- The five checks the specification asks for, plus the two that matter most.
\set ON_ERROR_STOP on
\pset border 2

-- Four readers, one question. Created here rather than in the seed so the seed
-- stays data and this stays proof.
delete from runs where workflow_name = 'ananya-year-check';
insert into runs (run_id, lane, workflow_name, actor_id, subject_id, context)
select
  ('d1000000-0000-0000-0000-00000000000' || n)::uuid, 'answer', 'ananya-year-check',
  u, 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid,
  jsonb_build_object(
    'actor_id', u, 'subject_id', 'aaaaaaaa-0000-0000-0000-00000000000a',
    'original_message', 'what has changed in the last three months',
    'purpose', p, 'detected_intent', 'change_summary',
    'relevant_time_range', jsonb_build_object())
from (values
  (1,'e0000000-0000-0000-0000-000000000001'::uuid,'personal_understanding'),
  (2,'e0000000-0000-0000-0000-000000000003'::uuid,'care'),
  (3,'e0000000-0000-0000-0000-000000000009'::uuid,'accommodation'),
  (4,'e0000000-0000-0000-0000-000000000002'::uuid,'personal_understanding'),
  (5,'e0000000-0000-0000-0000-00000000000a'::uuid,'accommodation')
) as v(n,u,p);

\echo ''
\echo '== 1 == records by month (June must be 3)'
select to_char(occurred_at,'YYYY-MM') as month, count(*),
       count(*) filter (where source_type='self_reported') as self_reported
from record_items where subject_id='aaaaaaaa-0000-0000-0000-00000000000a'
group by 1 order by 1;

\echo ''
\echo '== 2 == self-reports inside the gap, 17 May to 27 Jul (must be 0)'
select count(*) as self_reports_in_gap,
       (select count(*) from record_items
         where subject_id='aaaaaaaa-0000-0000-0000-00000000000a'
           and occurred_at::date between '2026-05-17' and '2026-07-27') as any_records_in_gap
from record_items
where subject_id='aaaaaaaa-0000-0000-0000-00000000000a'
  and source_type='self_reported'
  and occurred_at::date between '2026-05-17' and '2026-07-27';

\echo ''
\echo '== 3 == the supersession chain'
select occurred_at::date as occurred, is_current,
       coalesce(left(supersedes::text,8),'—') as supersedes,
       coalesce(left(superseded_by::text,8),'—') as superseded_by, title
from record_items where title like 'Initial sensory profile' or title like 'Sensory profile%'
order by occurred_at;

\echo ''
\echo '== 4 == same question, five readers'
select u.full_name || ' (' || u.primary_role || ')' as who,
       r.context->>'purpose' as purpose, count(x.item_id) as items,
       coalesce(string_agg(distinct x.domain::text,', ' order by x.domain::text),'—') as domains
from runs r join users u on u.user_id=r.actor_id
left join lateral orca_retrieve(r.run_id, null, 100) x on true
where r.workflow_name='ananya-year-check'
group by 1,2,r.run_id order by count(x.item_id) desc;

\echo ''
\echo '== 5 == restricted records reaching HR or the university (must be 0)'
select u.primary_role::text as role,
       count(*) filter (where x.sensitivity='restricted') as restricted_seen,
       count(*) filter (where x.domain='clinical') as clinical_seen,
       count(*) as total
from runs r join users u on u.user_id=r.actor_id
join lateral orca_retrieve(r.run_id, null, 100) x on true
where r.workflow_name='ananya-year-check' and u.primary_role in ('employer','university')
group by 1;

\echo ''
\echo '== assertions =='
do $$
declare v int; w int;
begin
  select count(*) into v from record_items
   where subject_id='aaaaaaaa-0000-0000-0000-00000000000a'
     and occurred_at::date between '2026-06-01' and '2026-06-30';
  if v <> 3 then raise exception 'FAIL: June has % records, want 3', v; end if;
  raise notice 'PASS  June holds exactly 3 records';

  select count(*) into v from record_items
   where subject_id='aaaaaaaa-0000-0000-0000-00000000000a' and source_type='self_reported'
     and occurred_at::date between '2026-05-17' and '2026-07-27';
  if v <> 0 then raise exception 'FAIL: % self-reports inside the gap', v; end if;
  raise notice 'PASS  no self-reports between 17 May and 27 Jul';

  select count(*) into v from record_items
   where item_id='f0000000-0000-0000-0000-000000000001' and not is_current
     and superseded_by='f0000000-0000-0000-0000-000000000005';
  select count(*) into w from record_items
   where item_id='f0000000-0000-0000-0000-000000000005' and is_current
     and supersedes='f0000000-0000-0000-0000-000000000001';
  if v<>1 or w<>1 then raise exception 'FAIL: supersession chain incorrect'; end if;
  raise notice 'PASS  sensory profile: old row superseded, new row current, both linked';

  select count(*) into v from runs r join users u on u.user_id=r.actor_id
   join lateral orca_retrieve(r.run_id, null, 100) x on true
   where r.workflow_name='ananya-year-check'
     and u.primary_role in ('employer','university')
     and (x.sensitivity='restricted' or x.domain='clinical');
  if v > 0 then raise exception 'FAIL: % restricted/clinical rows reached HR or university', v; end if;
  raise notice 'PASS  no restricted or clinical record reaches HR or the university';

  select count(*) into v from runs r
   join lateral orca_retrieve(r.run_id, null, 100) x on true
   where r.workflow_name='ananya-year-check'
     and not exists (select 1 from orca_scope(r.run_id) s
                     where s.domain=x.domain and s.sensitivity=x.sensitivity);
  if v > 0 then raise exception 'FAIL: % rows outside their permitted pairs', v; end if;
  raise notice 'PASS  no row outside its permitted pairs, across all five readers';
  raise notice '';
  raise notice 'All checks passed.';
end $$;
