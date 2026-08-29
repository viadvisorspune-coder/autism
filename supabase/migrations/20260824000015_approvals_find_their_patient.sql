-- Eleven approvals that nobody could see.
--
-- Yoxa reaches a human-approval gate, posts it here, and waits. We verified
-- the signature, stored the request, and then worked out which patient it was
-- about by looking up `workflow_run_id` in our own `workflow_runs` table.
--
-- Yoxa sends its own run id. Not one of the eleven matched. So every gate was
-- stored with patient_id null, and null then switched off everything that
-- depended on it: the notification is written inside `if (patientId)`, and the
-- read path filtered approvals with `.eq('patient_id', ...)`. The gate existed,
-- in a table, correctly, and appeared on no screen.
--
-- Yoxa waited. The runs never finished. Not one document has ever been
-- produced by the workflow whose whole purpose is producing one — and nothing
-- reported an error, because no single component had failed.
--
-- The receiver now resolves the patient four ways and records which one
-- answered. This adds that column and backfills what is already here, using
-- the same rules: read an id out of Yoxa's own prose, then confirm it against
-- our tables. A match is a fact, not a guess.

alter table hitl_requests
  add column if not exists patient_source text;

comment on column hitl_requests.patient_source is
  'How patient_id was established: run_id (exact), review_item or named_in_text '
  '(read from the gate text, confirmed against our tables), inferred (bounded '
  'guess, see _shared/whoami.ts), or unresolved. Provenance for an attribution '
  'that is not always certain should be readable, not assumed.';

-- Anything that already has a patient got it the original way.
update hitl_requests
set patient_source = 'run_id'
where patient_id is not null and patient_source is null;

-- Rule 2: a review item quoted in the gate's own description. The safety agent
-- raises those through our connector, so the id is ours and the row it names
-- carries the patient. Only when every id in the text agrees on one patient —
-- two patients named in one gate is ambiguous, and ambiguity is left alone.
with quoted as (
  select
    h.request_id,
    min(r.patient_id)            as patient_id,
    count(distinct r.patient_id) as patients
  from hitl_requests h
  cross join lateral regexp_matches(
    coalesce(h.title, '') || ' ' || coalesce(h.description, ''),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
    'g'
  ) as m(id)
  join review_items r on r.id = m.id[1]
  where h.patient_id is null
  group by h.request_id
)
update hitl_requests h
set patient_id = q.patient_id, patient_source = 'review_item'
from quoted q
where h.request_id = q.request_id
  and q.patients = 1
  and h.patient_id is null;

-- Rule 3: a patient named outright. The trigger text puts "(pt-ananya)" into
-- the run, and Yoxa's descriptions carry it through. Same rule: confirmed
-- against the patients table, and only when exactly one is named.
with named as (
  select
    h.request_id,
    min(p.id)            as patient_id,
    count(distinct p.id) as patients
  from hitl_requests h
  cross join lateral regexp_matches(
    lower(coalesce(h.title, '') || ' ' || coalesce(h.description, '')),
    'pt-[a-z0-9-]+',
    'g'
  ) as m(token)
  join patients p on p.id = m.token[1]
  where h.patient_id is null
  group by h.request_id
)
update hitl_requests h
set patient_id = n.patient_id, patient_source = 'named_in_text'
from named n
where h.request_id = n.request_id
  and n.patients = 1
  and h.patient_id is null;

-- Rule 4: the patient's own sign-in id. Matched only against patients.user_id,
-- never app_users at large — a clinician's id appears in this text too and
-- resolves to everybody on their caseload, which is not an answer.
with signed_in as (
  select
    h.request_id,
    min(p.id)            as patient_id,
    count(distinct p.id) as patients
  from hitl_requests h
  cross join lateral regexp_matches(
    lower(coalesce(h.title, '') || ' ' || coalesce(h.description, '')),
    'u-[a-z0-9-]+',
    'g'
  ) as m(token)
  join patients p on p.user_id = m.token[1]
  where h.patient_id is null
  group by h.request_id
)
update hitl_requests h
set patient_id = s.patient_id, patient_source = 'named_in_text'
from signed_in s
where h.request_id = s.request_id
  and s.patients = 1
  and h.patient_id is null;

-- Whatever is left is honestly unresolved. It stays, and the read path now
-- shows it: an approval that admits it does not know whose it is can still be
-- answered by a person, and an approval nobody can see cannot.
update hitl_requests
set patient_source = 'unresolved'
where patient_id is null and patient_source is null;
