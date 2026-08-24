-- Notifications that link somewhere their reader can actually go.
--
-- `notify()` wrote `href = '/patient/requests'` on every row it raised,
-- including the rows addressed to psychologists, psychiatrists, therapists,
-- OTs and GPs. None of those roles has that screen — their waiting reviews are
-- on their own dashboard — so a clinician who clicked the notification landed
-- on the patient's route and was bounced back to their home page. The
-- notification was real, the work behind it was real, and the link went
-- nowhere.
--
-- A single row also carries a single href for a list of roles, which is why
-- the code now writes one row per role. This repairs the rows already written:
-- the multi-role ones are split, the single-role ones repointed.
--
-- Scoped to the exact bare path `notify()` produced. The seeded notifications
-- carry deeper links (`/patient/requests/rq-1`, `/psychologist/memory`) and are
-- untouched.

-- Split a row addressed to several roles into one row per role, each pointing
-- at that role's own screen. Ids are left to the default so the originals can
-- be removed cleanly below.
insert into notifications
  (patient_id, category, what, why, todo, for_roles, href, unread, workflow_run_id, created_at)
select
  n.patient_id,
  n.category,
  n.what,
  n.why,
  n.todo,
  array[r]::orca_role[],
  case
    when r::text = 'patient' then '/patient/requests'
    when r::text = 'admin' then '/admin/workflows'
    else '/' || r::text
  end,
  n.unread,
  n.workflow_run_id,
  n.created_at
from notifications n, unnest(n.for_roles) as r
where n.href = '/patient/requests'
  and array_length(n.for_roles, 1) > 1;

delete from notifications
where href = '/patient/requests'
  and array_length(for_roles, 1) > 1;

-- The rest were addressed to exactly one role and simply pointed at the wrong
-- place. The patient's rows were right all along and stay as they are.
update notifications
set href = case
  when for_roles[1]::text = 'admin' then '/admin/workflows'
  else '/' || for_roles[1]::text
end
where href = '/patient/requests'
  and array_length(for_roles, 1) = 1
  and for_roles[1]::text <> 'patient';
