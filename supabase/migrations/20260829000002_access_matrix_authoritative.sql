-- The access matrix, as specified.
--
-- Replaces the first seeded matrix wholesale. That one was written from a
-- shorter brief and got several roles wrong in ways that mattered: therapists
-- and OTs were lumped in with psychologists and given clinical access at
-- restricted; coordinators could read clinical; clinicians could not see the
-- workplace or education domains they routinely need for coordination.
--
-- Two readings of the specification are load-bearing here.
--
-- MAX SENSITIVITY IS A CEILING, NOT A LEVEL. A row reading `functional | high`
-- permits low, moderate and high. Seeding only the named level would have left
-- holes that read as deliberate denials — a clinician able to see a high
-- functional note and not a moderate one, which is not a policy anybody wrote.
--
-- DENIED IS THE DEFAULT. Every combination starts false and is opened by name.
-- An unlisted combination is refused, and a role added later cannot inherit
-- permission from a role that resembles it.

/* ------------------------------------------------------------- ceilings */

-- Sensitivity has an order and the matrix depends on it. Postgres knows enum
-- order already; this exposes it as a number so a ceiling can be expressed as
-- a comparison rather than as four repeated inserts.
create or replace function orca_sensitivity_rank(s sensitivity_level)
returns int language sql immutable as $$
  select case s when 'low' then 1 when 'moderate' then 2
                when 'high' then 3 when 'restricted' then 4 end;
$$;

/**
 * Open one cell of the matrix, up to a ceiling.
 *
 * Everything below is a call to this, which makes the seed readable as the
 * table it came from rather than as a hundred UPDATE statements.
 */
create or replace function orca_allow(
  p_roles     text[],
  p_domains   text[],
  p_ceiling   sensitivity_level,
  p_purposes  text[],
  p_consent   boolean default false,
  p_approval  boolean default false
) returns void
language plpgsql as $$
begin
  update access_policies ap set
    allowed = true,
    requires_consent = p_consent,
    requires_approval = p_approval
  where ap.role::text = any(p_roles)
    and ap.domain::text = any(p_domains)
    and ap.purpose::text = any(p_purposes)
    and orca_sensitivity_rank(ap.sensitivity) <= orca_sensitivity_rank(p_ceiling);
end;
$$;

/* ----------------------------------------------------------- start shut */

-- Rows for combinations that did not exist when the matrix was first seeded —
-- the new rights_request purpose — and a reset of everything to denied so the
-- opens below are the complete account of what is permitted.
insert into access_policies (role, domain, sensitivity, purpose, allowed)
select r, d, s, p, false
from unnest(enum_range(null::stakeholder_role)) as r
cross join unnest(enum_range(null::record_domain)) as d
cross join unnest(enum_range(null::sensitivity_level)) as s
cross join unnest(enum_range(null::purpose_type)) as p
on conflict (role, domain, sensitivity, purpose) do nothing;

update access_policies
set allowed = false, requires_consent = false, requires_approval = false;

/* ------------------------------------------------------------- the rows */

-- patient — the subject themselves. Every domain, every sensitivity, every
-- purpose. Not a generous setting; the premise of the product.
select orca_allow(
  array['patient'],
  array['personal','functional','clinical','support','workplace','education','outcome'],
  'restricted',
  array['care','support_planning','accommodation','coordination','statutory',
        'personal_understanding','rights_request']);

-- psychologist · psychiatrist · gp
select orca_allow(array['psychologist','psychiatrist','gp'], array['clinical'],
                  'restricted', array['care','support_planning']);
select orca_allow(array['psychologist','psychiatrist','gp'],
                  array['functional','personal','support','outcome'],
                  'high', array['care','support_planning']);
-- Functional impact only, which is a limit on content rather than on the
-- query, and therefore the composer's job as much as this table's.
select orca_allow(array['psychologist','psychiatrist','gp'],
                  array['workplace','education'], 'moderate',
                  array['care','coordination']);

-- therapist · ot — deliberately not the clinical group. Clinical access is
-- consent-gated and stops below restricted, which is the whole distinction.
select orca_allow(array['therapist','ot'], array['functional','support','outcome'],
                  'high', array['care','support_planning']);
select orca_allow(array['therapist','ot'], array['personal'], 'moderate',
                  array['support_planning']);
select orca_allow(array['therapist','ot'], array['clinical'], 'high',
                  array['care'], true);
select orca_allow(array['therapist','ot'], array['workplace'], 'moderate',
                  array['accommodation']);

-- coordinator — keeps people aligned without reading the clinical record.
select orca_allow(array['coordinator'], array['functional','support','outcome'],
                  'moderate', array['coordination']);
select orca_allow(array['coordinator'], array['workplace'], 'moderate',
                  array['coordination','accommodation']);
select orca_allow(array['coordinator'], array['education'], 'moderate',
                  array['coordination']);

-- employer — one domain, plus a single consent-gated window into functional
-- at the lowest level. Enough to arrange an adjustment, never enough to know
-- why it is needed.
select orca_allow(array['employer'], array['workplace'], 'moderate',
                  array['accommodation']);
select orca_allow(array['employer'], array['functional'], 'low',
                  array['accommodation'], true);

-- university
select orca_allow(array['university'], array['education'], 'moderate',
                  array['accommodation']);
select orca_allow(array['university'], array['functional'], 'low',
                  array['accommodation'], true);

-- trusted_person — consent-gated throughout, and nothing clinical ever.
select orca_allow(array['trusted_person'], array['personal','support'], 'moderate',
                  array['personal_understanding'], true);
select orca_allow(array['trusted_person'], array['functional'], 'low',
                  array['personal_understanding'], true);

-- statutory — acts under a legal power, so every read stops for a person.
-- Scoped to what other roles may see and never above high: a statutory power
-- is not a route to the medication record.
select orca_allow(array['statutory'],
                  array['functional','support','workplace','education','outcome'],
                  'high', array['statutory'], false, true);

-- admin — no record content at any level. Deliberately no orca_allow call:
-- the absence is the policy, and writing it as a row set to false would imply
-- somebody had considered opening it.

/* ------------------------------------------------ relationship dates bind */

/**
 * A stakeholder cannot read what predates their relationship.
 *
 * Rule 4 of the matrix, and it was not enforced anywhere. Scope answered
 * "which domains and sensitivities", never "from when", so an employer whose
 * relationship began in March 2026 could read a permitted-domain record from
 * September 2025 — before they had any connection to this person at all.
 *
 * The floor is the earliest valid_from among this actor's active
 * relationships to this subject. The patient has no floor: their own record
 * does not begin when the software was told about them.
 */
create or replace function orca_access_floor(p_actor uuid, p_subject uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role stakeholder_role;
  v_from timestamptz;
begin
  if p_actor is null or p_subject is null then return null; end if;

  select primary_role into v_role from users where user_id = p_actor;
  if v_role = 'patient' then return null; end if;

  select min(valid_from) into v_from
  from stakeholder_relationships
  where subject_id = p_subject and user_id = p_actor and is_active
    and (valid_to is null or valid_to > now());

  return v_from;
end;
$$;

comment on function orca_access_floor is
  'The earliest record date this actor may read for this subject: the start of '
  'their relationship. Null for the patient, whose own record has no floor.';
