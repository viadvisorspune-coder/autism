-- Row-level security.
--
-- Permission is a deterministic backend decision. It is decided here, in
-- Postgres, and never by the frontend or by anything the agent layer reasons
-- its way to. A role outside a scope does not get a filtered view of a record:
-- it gets no row at all, so the record is absent from lists, from search, and
-- from anything generated for that role.

-- ------------------------------------------------------------------- helpers

create or replace function orca_user_id()
returns text language sql stable security definer set search_path = public as $$
  select id from app_users where auth_user_id = auth.uid()
$$;

create or replace function orca_user_role()
returns orca_role language sql stable security definer set search_path = public as $$
  select role from app_users where auth_user_id = auth.uid()
$$;

-- True when the signed-in user is the patient whose record this is.
create or replace function orca_owns_patient(target text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients p
    join app_users u on u.id = p.user_id
    where p.id = target and u.auth_user_id = auth.uid()
  )
$$;

-- True when the patient has granted this user a live connection. Expired and
-- revoked consent stop access without anything being deleted.
create or replace function orca_connected_to(target text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from connections c
    join app_users u on u.id = c.person_id
    where c.patient_id = target
      and u.auth_user_id = auth.uid()
      and c.consent_status = 'Active'
      and (c.review_due is null or c.review_due >= current_date)
  )
$$;

-- Clinical reads additionally require the row to name the reader's role.
create or replace function orca_may_read(target text, visible orca_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select orca_owns_patient(target)
      or (orca_connected_to(target) and orca_user_role() = any (visible))
$$;

-- ------------------------------------------------------------------- enabling

alter table app_users         enable row level security;
alter table patients          enable row level security;
alter table connections       enable row level security;
alter table timeline_events   enable row level security;
alter table profile_items     enable row level security;
alter table strategies        enable row level security;
alter table strategy_checkins enable row level security;
alter table appointments      enable row level security;
alter table documents         enable row level security;
alter table disclosures       enable row level security;
alter table requests          enable row level security;
alter table memory_candidates enable row level security;
alter table review_items      enable row level security;
alter table notifications     enable row level security;
alter table workflow_runs     enable row level security;
alter table audit_log         enable row level security;
alter table tasks             enable row level security;
alter table session_notes     enable row level security;

-- ------------------------------------------------------------------- policies

-- Everyone may read the directory entry of a person they are connected to.
create policy app_users_read on app_users for select using (
  auth_user_id = auth.uid()
  or exists (
    select 1 from connections c
    where c.person_id = app_users.id
      and (orca_owns_patient(c.patient_id) or orca_connected_to(c.patient_id))
  )
);

create policy patients_read on patients for select using (
  orca_owns_patient(id) or orca_connected_to(id)
);

create policy connections_read on connections for select using (
  orca_owns_patient(patient_id)
  or person_id = orca_user_id()
);

-- The patient decides who is connected, and can revoke without a reason.
create policy connections_write on connections for all using (
  orca_owns_patient(patient_id)
) with check (
  orca_owns_patient(patient_id)
);

create policy timeline_read on timeline_events for select using (
  orca_may_read(patient_id, visible_to)
);

create policy timeline_write on timeline_events for insert with check (
  orca_owns_patient(patient_id) or orca_connected_to(patient_id)
);

create policy profile_read on profile_items for select using (
  orca_may_read(patient_id, visible_to)
);

create policy profile_write on profile_items for all using (
  orca_owns_patient(patient_id)
) with check (
  orca_owns_patient(patient_id)
);

create policy strategies_read on strategies for select using (
  orca_owns_patient(patient_id) or orca_connected_to(patient_id)
);

create policy strategies_write on strategies for all using (
  orca_owns_patient(patient_id) or orca_connected_to(patient_id)
) with check (
  orca_owns_patient(patient_id) or orca_connected_to(patient_id)
);

create policy checkins_read on strategy_checkins for select using (
  exists (
    select 1 from strategies s
    where s.id = strategy_id
      and (orca_owns_patient(s.patient_id) or orca_connected_to(s.patient_id))
  )
);

create policy checkins_write on strategy_checkins for insert with check (
  exists (
    select 1 from strategies s
    where s.id = strategy_id
      and (orca_owns_patient(s.patient_id) or orca_connected_to(s.patient_id))
  )
);

create policy appointments_read on appointments for select using (
  orca_owns_patient(patient_id) or orca_connected_to(patient_id)
);

create policy documents_read on documents for select using (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (access))
);

create policy documents_write on documents for all using (
  orca_owns_patient(patient_id)
) with check (
  orca_owns_patient(patient_id)
);

-- A disclosure record belongs to the person it was made about.
create policy disclosures_read on disclosures for select using (
  orca_owns_patient(patient_id)
);

-- Requests: the patient sees their own; the recipient organisation sees only
-- requests addressed to it, and only once submitted. There is no policy giving
-- an employer or university any other table.
create policy requests_read on requests for select using (
  orca_owns_patient(patient_id)
  or orca_connected_to(patient_id)
  or (destination_role = orca_user_role() and status <> 'Draft')
);

create policy requests_write on requests for all using (
  orca_owns_patient(patient_id)
) with check (
  orca_owns_patient(patient_id)
);

create policy memory_read on memory_candidates for select using (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (raised_for))
);

create policy memory_decide on memory_candidates for update using (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (raised_for))
) with check (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (raised_for))
);

create policy review_read on review_items for select using (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (assigned_to))
);

create policy review_decide on review_items for update using (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (assigned_to))
) with check (
  orca_owns_patient(patient_id)
  or (orca_connected_to(patient_id) and orca_user_role() = any (assigned_to))
);

create policy notifications_read on notifications for select using (
  orca_user_role() = any (for_roles)
  and (patient_id is null or orca_owns_patient(patient_id) or orca_connected_to(patient_id))
);

create policy notifications_update on notifications for update using (
  orca_user_role() = any (for_roles)
) with check (
  orca_user_role() = any (for_roles)
);

create policy workflow_read on workflow_runs for select using (
  orca_owns_patient(patient_id)
  or orca_connected_to(patient_id)
  or orca_user_role() = 'admin'
);

-- The administrator sees operational state and the audit trail, never record
-- content. That is why there is no admin policy on any table above this one.
create policy audit_read on audit_log for select using (
  orca_owns_patient(patient_id) or orca_user_role() = 'admin'
);

create policy tasks_read on tasks for select using (
  orca_user_role() = any (for_roles)
  and (patient_id is null or orca_connected_to(patient_id) or orca_owns_patient(patient_id))
);

create policy session_notes_read on session_notes for select using (
  orca_connected_to(patient_id) or orca_owns_patient(patient_id)
);

create policy session_notes_write on session_notes for all using (
  professional_id = orca_user_id() and orca_connected_to(patient_id)
) with check (
  professional_id = orca_user_id() and orca_connected_to(patient_id)
);

-- Artefacts follow the record: readable by the patient and by anyone the
-- patient has connected, never by an anonymous link.
create policy artifacts_read on storage.objects for select using (
  bucket_id = 'orca-artifacts'
  and exists (
    select 1 from documents d
    where d.storage_path = storage.objects.name
      and (orca_owns_patient(d.patient_id)
           or (orca_connected_to(d.patient_id) and orca_user_role() = any (d.access)))
  )
);
