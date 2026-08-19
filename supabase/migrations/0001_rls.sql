-- Row Level Security for ORCA.
--
-- Two access paths reach this data and they are secured differently:
--
--   1. The browser, via Supabase Auth. Those queries run as `authenticated`
--      and are governed by the policies below.
--   2. Yoxa's connectors, via this app's server routes on a direct Postgres
--      connection. Those bypass RLS and are governed by the permission engine
--      in src/lib/access/policy.ts instead.
--
-- RLS is therefore defence in depth for path 1, not the only control. A bug in
-- a server route must not be able to leak one patient's record to another.

-- Helper lives in a private schema so it is not exposed through PostgREST.
create schema if not exists private;

-- Whether the calling user is the patient this row belongs to.
-- SECURITY DEFINER so it can read `patients` without recursing into its own
-- policy; the caller's identity is still checked explicitly inside the body.
create or replace function private.is_own_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = target_patient_id
      and p.user_id = (select auth.uid())
  );
$$;

-- Whether the calling clinician holds an active care relationship covering
-- this patient. Membership only; category scope is applied in application code.
create or replace function private.has_active_care(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_relationships cr
    where cr.patient_id = target_patient_id
      and cr.clinician_user_id = (select auth.uid())
      and cr.status = 'active'
  );
$$;

revoke execute on function private.is_own_patient(uuid) from public, anon, authenticated;
revoke execute on function private.has_active_care(uuid) from public, anon, authenticated;
grant execute on function private.is_own_patient(uuid) to authenticated;
grant execute on function private.has_active_care(uuid) to authenticated;

-- `force` so the table owner is subject to policies too.
alter table public.users               enable row level security;
alter table public.patients            enable row level security;
alter table public.care_relationships  enable row level security;
alter table public.consents            enable row level security;
alter table public.records             enable row level security;
alter table public.workflow_runs       enable row level security;
alter table public.approvals           enable row level security;
alter table public.artifacts           enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_events        enable row level security;
alter table public.webhook_events      enable row level security;

alter table public.records        force row level security;
alter table public.consents       force row level security;
alter table public.approvals      force row level security;
alter table public.audit_events   force row level security;

-- --- users ------------------------------------------------------------------
-- A user reads their own row. Looking up anyone else goes through the server.
create policy users_self_select on public.users
  for select to authenticated
  using (id = (select auth.uid()));

-- --- patients ---------------------------------------------------------------
create policy patients_self_select on public.patients
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_active_care(id)));

-- --- care relationships -----------------------------------------------------
-- Both sides can see the relationship; only the patient may change it.
create policy care_rel_select on public.care_relationships
  for select to authenticated
  using (
    clinician_user_id = (select auth.uid())
    or (select private.is_own_patient(patient_id))
  );

create policy care_rel_patient_write on public.care_relationships
  for update to authenticated
  using ((select private.is_own_patient(patient_id)))
  with check ((select private.is_own_patient(patient_id)));

-- --- consents ---------------------------------------------------------------
-- Granting and revoking consent belongs to the patient alone. A clinician may
-- read consents naming them, so the UI can show what they are allowed to use.
create policy consents_patient_all on public.consents
  for all to authenticated
  using ((select private.is_own_patient(patient_id)))
  with check ((select private.is_own_patient(patient_id)));

create policy consents_recipient_select on public.consents
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));

-- --- records ----------------------------------------------------------------
-- The patient sees everything of their own. A clinician sees only records the
-- patient has moved out of `private`, and only while care is active.
create policy records_patient_select on public.records
  for select to authenticated
  using ((select private.is_own_patient(patient_id)));

create policy records_clinician_select on public.records
  for select to authenticated
  using (
    visibility <> 'private'
    and (select private.has_active_care(patient_id))
  );

-- Records are append-only: no update or delete policy exists, so neither is
-- permitted from the browser at all. Revisions insert a superseding row.
create policy records_patient_insert on public.records
  for insert to authenticated
  with check ((select private.is_own_patient(patient_id)));

-- --- workflow runs ----------------------------------------------------------
create policy workflow_runs_select on public.workflow_runs
  for select to authenticated
  using (
    (select private.is_own_patient(patient_id))
    or (select private.has_active_care(patient_id))
  );

-- --- approvals --------------------------------------------------------------
-- Only the assignee may see or answer a pending decision.
create policy approvals_assignee_select on public.approvals
  for select to authenticated
  using (assigned_to_user_id = (select auth.uid()));

create policy approvals_assignee_update on public.approvals
  for update to authenticated
  using (assigned_to_user_id = (select auth.uid()))
  with check (assigned_to_user_id = (select auth.uid()));

-- --- artifacts --------------------------------------------------------------
create policy artifacts_select on public.artifacts
  for select to authenticated
  using (
    (select private.is_own_patient(patient_id))
    or recipient_user_id = (select auth.uid())
  );

-- --- notifications ----------------------------------------------------------
create policy notifications_recipient_select on public.notifications
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy notifications_recipient_update on public.notifications
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

-- --- audit events -----------------------------------------------------------
-- A patient may read their own audit trail: "who accessed what" is information
-- about them. Nobody may write or alter it from the browser.
create policy audit_patient_select on public.audit_events
  for select to authenticated
  using ((select private.is_own_patient(patient_id)));

-- --- webhook events ---------------------------------------------------------
-- Server-only. No policy is created, so RLS denies every browser query.

-- Indexes backing the policy predicates. Without these each policy check is a
-- sequential scan.
create index if not exists patients_user_id_rls_idx
  on public.patients (user_id);
create index if not exists care_rel_clinician_status_rls_idx
  on public.care_relationships (clinician_user_id, patient_id, status);
create index if not exists approvals_assignee_rls_idx
  on public.approvals (assigned_to_user_id);
create index if not exists artifacts_recipient_rls_idx
  on public.artifacts (recipient_user_id);
create index if not exists records_patient_visibility_rls_idx
  on public.records (patient_id, visibility);
