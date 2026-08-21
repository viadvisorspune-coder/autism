-- Row-level security for the tables added alongside consent history.
--
-- Same principle as everything above it: a role outside a scope gets no row,
-- not a filtered one. Employer and university appear nowhere in this file.

alter table consent_events       enable row level security;
alter table access_requests      enable row level security;
alter table request_clarifications enable row level security;
alter table retention_policies   enable row level security;

-- ------------------------------------------------------------ consent history

-- The patient sees every consent decision ever made about their record.
-- A connected person sees only the history of their own access — enough to
-- know what they may do and when it was last reviewed, and nothing about who
-- else the patient has connected.
create policy consent_events_read on consent_events for select using (
  orca_owns_patient(patient_id)
  or person_id = orca_user_id()
);

-- No insert, update or delete policy at all. Rows arrive from the trigger on
-- connections, which runs as the definer; the history cannot be edited through
-- the client by anyone, including the patient. Correcting a mistaken grant
-- means making a further change to the connection, which logs a further event.

-- ------------------------------------------------------------ access requests

-- Visible to the patient being asked, and to whoever asked.
create policy access_requests_read on access_requests for select using (
  orca_owns_patient(patient_id)
  or requested_by = orca_user_id()
);

-- A professional may raise a request about anyone; that is the point of it.
-- They may not raise one in someone else's name.
create policy access_requests_create on access_requests for insert with check (
  requested_by = orca_user_id()
  and orca_user_role() <> 'patient'
  and status = 'Pending'
);

-- The requester may withdraw their own request and change nothing else.
create policy access_requests_withdraw on access_requests for update using (
  requested_by = orca_user_id() and status = 'Pending'
) with check (
  requested_by = orca_user_id() and status = 'Withdrawn'
);

-- Only the patient decides. Approving one does not itself grant access — a
-- connections row does, and writing that is a separate, deliberate act.
create policy access_requests_decide on access_requests for update using (
  orca_owns_patient(patient_id)
) with check (
  orca_owns_patient(patient_id)
);

-- ----------------------------------------------------------- clarifications

-- The patient sees the whole exchange. A connected professional sees it.
-- The organisation that asked sees its own question and, once answered, the
-- answer — the same rule the underlying request already follows.
create policy request_clarifications_read on request_clarifications for select using (
  exists (
    select 1 from requests r
    where r.id = request_clarifications.request_id
      and (
        orca_owns_patient(r.patient_id)
        or orca_connected_to(r.patient_id)
        or (r.destination_role = orca_user_role() and r.status <> 'Draft')
      )
  )
);

-- The recipient organisation may ask. It may not answer on the patient's
-- behalf, so the answer columns must still be empty on insert.
create policy request_clarifications_ask on request_clarifications for insert with check (
  exists (
    select 1 from requests r
    where r.id = request_clarifications.request_id
      and r.destination_role = orca_user_role()
      and r.status <> 'Draft'
  )
  and answer is null
  and answered_by is null
  and approved_by is null
);

-- Answering is the patient's, because an answer leaves their record.
create policy request_clarifications_answer on request_clarifications for update using (
  exists (
    select 1 from requests r
    where r.id = request_clarifications.request_id and orca_owns_patient(r.patient_id)
  )
) with check (
  exists (
    select 1 from requests r
    where r.id = request_clarifications.request_id and orca_owns_patient(r.patient_id)
  )
);

-- ------------------------------------------------------------------ retention

-- The policy is not a secret; what it governs is. Anyone signed in may read
-- which rules apply, and nobody may change them through the client.
create policy retention_policies_read on retention_policies for select using (
  auth.uid() is not null
);

-- retention_due is a view over tables that already carry their own policies,
-- and is meaningful only to the administrator.
revoke all on retention_due from anon, authenticated;
grant select on retention_due to service_role;
