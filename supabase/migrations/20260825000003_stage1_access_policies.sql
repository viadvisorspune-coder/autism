-- Stage 1, step 3: the access matrix, seeded.
--
-- Every combination of role, domain, sensitivity and purpose gets a row, and
-- every row starts denied. That is the point: a combination nobody has thought
-- about yet is a combination that is refused, and adding a role or a domain
-- later cannot accidentally open anything, because the cross product below
-- creates its rows closed.
--
-- 15 roles x 7 domains x 4 sensitivities x 6 purposes = 2520 rows, of which a
-- small minority end up allowed. A permission model whose default is "no" is
-- readable in exactly this way: the allowances are the short list.

insert into access_policies (role, domain, sensitivity, purpose, allowed)
select r, d, s, p, false
from unnest(enum_range(null::stakeholder_role)) as r
cross join unnest(enum_range(null::record_domain)) as d
cross join unnest(enum_range(null::sensitivity_level)) as s
cross join unnest(enum_range(null::purpose_type)) as p
on conflict (role, domain, sensitivity, purpose) do nothing;

/* --------------------------------------------------------------- subject */

-- The person the record is about sees all of it. Not a policy decision so much
-- as the premise of the product: a record somebody cannot read is being kept
-- about them rather than for them.
update access_policies set allowed = true
where role = 'patient'
  and purpose in ('personal_understanding', 'support_planning');

/* ------------------------------------------------------------- clinical */

update access_policies set allowed = true
where role in ('psychologist', 'psychiatrist', 'gp', 'therapist', 'ot', 'clinic')
  and domain in ('clinical', 'functional', 'personal', 'support')
  and sensitivity in ('low', 'moderate', 'high')
  and purpose in ('care', 'support_planning');

-- Restricted is reachable for the clinical team, but only with the subject
-- agreeing each time. Allowed and gated, rather than denied: a flat no here
-- would push the conversation off the record entirely, which is worse.
update access_policies set allowed = true, requires_consent = true
where role in ('psychologist', 'psychiatrist', 'gp', 'therapist', 'ot', 'clinic')
  and domain in ('clinical', 'functional', 'personal', 'support')
  and sensitivity = 'restricted'
  and purpose in ('care', 'support_planning');

/* ------------------------------------------------------ parent/caregiver */

update access_policies set allowed = true
where role = 'parent_caregiver'
  and domain in ('personal', 'functional', 'support')
  and sensitivity in ('low', 'moderate')
  and purpose in ('care', 'personal_understanding');

update access_policies set allowed = true, requires_consent = true
where role = 'parent_caregiver'
  and domain = 'clinical'
  and sensitivity in ('low', 'moderate')
  and purpose in ('care', 'personal_understanding');

-- Restricted stays denied for a caregiver, at every domain and purpose. This
-- is an adult's record. Care and control are not the same thing, and the
-- schema should not blur them.

/* --------------------------------------------------------------- employer */

update access_policies set allowed = true
where role = 'employer'
  and domain = 'workplace'
  and sensitivity in ('low', 'moderate')
  and purpose = 'accommodation';

-- One narrow window into functional information, at the lowest sensitivity,
-- with consent, for the single purpose of arranging an adjustment. An employer
-- needs to know that unplanned meetings are hard. They do not need to know why.
update access_policies set allowed = true, requires_consent = true
where role = 'employer'
  and domain = 'functional'
  and sensitivity = 'low'
  and purpose = 'accommodation';

/* ----------------------------------------------------- educator/university */

update access_policies set allowed = true
where role in ('educator', 'university')
  and domain = 'education'
  and sensitivity in ('low', 'moderate')
  and purpose in ('accommodation', 'support_planning');

update access_policies set allowed = true, requires_consent = true
where role in ('educator', 'university')
  and domain = 'functional'
  and sensitivity in ('low', 'moderate')
  and purpose in ('accommodation', 'support_planning');

/* --------------------------------------------------------- trusted person */

update access_policies set allowed = true, requires_consent = true
where role = 'trusted_person'
  and domain in ('personal', 'support')
  and sensitivity in ('low', 'moderate')
  and purpose in ('personal_understanding', 'support_planning');

/* ------------------------------------------------------------ coordinator */

update access_policies set allowed = true
where role = 'coordinator'
  and domain in ('functional', 'support')
  and sensitivity in ('low', 'moderate')
  and purpose = 'coordination';

/* -------------------------------------------------------------- statutory */

-- A statutory body acts under a legal power rather than an invitation, so its
-- reads are allowed but never silent: every one of them stops for a human.
update access_policies set allowed = true, requires_approval = true
where role = 'statutory'
  and domain in ('functional', 'support', 'workplace', 'education')
  and sensitivity in ('low', 'moderate', 'high')
  and purpose = 'statutory';

-- And the rule as stated: wherever this role is allowed anything at all, that
-- allowance carries an approval.
update access_policies set requires_approval = true
where role = 'statutory' and allowed;
