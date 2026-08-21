-- Demonstration data for consent history and outstanding access requests.
--
-- Consent events are written by the trigger on connections, so this seeds the
-- *changes* and lets the history record itself — which is also a check that the
-- trigger works.
--
-- Every statement here is keyed on (patient_id, person_id) rather than on a
-- connection id. Ids are shared across patients, and an update keyed on one
-- would reach into somebody else's record.

-- A previous employer, from the role Ananya left in March. The connection is
-- kept and revoked rather than deleted, because deleting it would erase the
-- fact that Vaishali could once see something.
insert into app_users (id, name, role, title, organisation) values
  ('u-vaishali', 'Vaishali Kamat', 'employer', 'People Partner', 'Trilight Systems')
on conflict (id) do nothing;

insert into connections (id, patient_id, person_id, relationship, purpose, access_scope,
                         consent_given, consent_status, review_due, last_interaction) values
  ('cn-11', 'pt-ananya', 'u-vaishali', 'Employer — HR (previous role)',
   'Workplace adjustment at Trilight Systems',
   '{"Authorised functional information for the current request"}',
   '2026-01-20', 'Active', '2026-07-20', '2026-02-28')
on conflict (patient_id, person_id) do nothing;

-- The trigger stamps the grant with the moment this migration ran. Move it back
-- to when consent was actually given, or the history is chronologically wrong
-- and any point-in-time question answers from the wrong side of it.
update consent_events
   set changed_at = '2026-01-20T09:00:00Z',
       reason     = 'Granted while Ananya was employed at Trilight Systems.',
       decided_by = 'u-ananya'
 where patient_id = 'pt-ananya' and person_id = 'u-vaishali' and change_type = 'Granted';

-- She left the role. Access ends the same day, and the history keeps the shape
-- of what happened rather than only the fact that it is over.
update connections
   set consent_status = 'Revoked'
 where patient_id = 'pt-ananya' and person_id = 'u-vaishali';

update consent_events
   set changed_at = '2026-03-10T09:00:00Z',
       reason     = 'Ananya left Trilight Systems. Access withdrawn the same day.',
       decided_by = 'u-ananya'
 where patient_id = 'pt-ananya' and person_id = 'u-vaishali' and change_type = 'Revoked';

-- Anil was first given a wider scope than the request needed, and it was
-- narrowed the same evening before anything was sent. This is the event that
-- makes the point: the correction is visible, not silently overwritten.
update consent_events
   set new_scope = '{"Authorised functional information for the current request","Timeline (work)","Strategies & outcomes"}',
       reason    = 'Initial grant, wider than the accommodation request required.'
 where patient_id = 'pt-ananya' and person_id = 'u-anil' and change_type = 'Granted';

insert into consent_events (patient_id, person_id, changed_at, change_type, previous_scope,
                            new_scope, previous_status, new_status, purpose, reason, decided_by)
values ('pt-ananya', 'u-anil', '2026-08-18T18:35:00Z', 'Narrowed',
        '{"Authorised functional information for the current request","Timeline (work)","Strategies & outcomes"}',
        '{"Authorised functional information for the current request"}',
        'Active', 'Active', 'Workplace accommodation request only',
        'Narrowed before the request was submitted. The employer needs the adjustment, not the history behind it.',
        'u-ananya');

-- Meera has no connection and has asked for one. Test B expects the refusal to
-- produce this row rather than simply ending.
insert into access_requests (id, patient_id, requested_by, requested_role, purpose,
                             requested_scope, justification, status, created_at)
values ('ar-1', 'pt-ananya', 'u-meera', 'therapist',
        'Communication support at work, referred after the August workplace review',
        '{"Functional profile","Strategies & outcomes"}',
        'Referred by Dr Kavita Nair on 19 August. No consent has been given yet.',
        'Pending', '2026-08-19T11:20:00Z')
on conflict (id) do nothing;

-- Anil's outstanding question, moved out of the jsonb column by the previous
-- migration, now carries what a complete answer would have to withhold.
update request_clarifications c
   set asked_by = 'u-anil',
       withheld = '{"Diagnostic report and clinical notes","Session content with the psychologist"}'
  from requests r
 where r.id = c.request_id
   and r.patient_id = 'pt-ananya'
   and c.answer is null;
