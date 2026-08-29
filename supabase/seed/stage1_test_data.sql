-- Stage 1 test data.
--
-- Not a migration: this is a fixture for proving the access rules behave, and
-- it is safe to run repeatedly against a scratch database. Fixed uuids so the
-- test script can address rows by name rather than by lookup.
--
-- The shape of the data is chosen to make the test able to fail. Every rule in
-- the policy seed has at least one item that would be visible if the rule were
-- wrong: clinical items a trusted person must not see, workplace items an
-- employer must, and restricted items nobody outside the clinical team may
-- reach. A fixture that only contains permitted data proves nothing.

begin;

delete from runs;
delete from record_items;
delete from stakeholder_relationships;
delete from subjects;
delete from users;

/* --------------------------------------------------------------- people */

insert into subjects (subject_id, display_name, date_of_birth) values
  ('11111111-1111-1111-1111-111111111111', 'Ananya Rao', '1997-04-12');

insert into users (user_id, full_name, email, primary_role) values
  ('a0000000-0000-0000-0000-000000000001', 'Ananya Rao',    'ananya@example.org', 'patient'),
  ('a0000000-0000-0000-0000-000000000002', 'Dr Kavita Nair','kavita@example.org', 'psychologist'),
  ('a0000000-0000-0000-0000-000000000003', 'Anil Fernandes','anil@example.org',   'employer'),
  ('a0000000-0000-0000-0000-000000000004', 'Divya Rao',     'divya@example.org',  'trusted_person');

insert into stakeholder_relationships (subject_id, user_id, role, purpose) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'patient',        'personal_understanding'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'psychologist',   'care'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'employer',       'accommodation'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', 'trusted_person', 'personal_understanding');

/* --------------------------------------------------------------- record */

insert into record_items (
  item_id, subject_id, domain, title, content, source_type, reported_by,
  reporter_role, occurred_at, validation_status, evidence_strength, sensitivity, tags
) values
  -- personal
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'personal', 'What a hard day looks like',
   'On a hard day I stop answering messages and I need quiet before I can talk about anything.',
   'self_reported', 'a0000000-0000-0000-0000-000000000001', 'patient',
   now() - interval '8 months', 'subject_confirmed', 0.7, 'low', array['communication']),

  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'personal', 'How I want to be spoken to at work',
   'Written notice before a change, and time to prepare. Being told in a meeting does not work.',
   'self_reported', 'a0000000-0000-0000-0000-000000000001', 'patient',
   now() - interval '2 months', 'subject_confirmed', 0.8, 'moderate', array['communication']),

  -- functional
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'functional', 'Transition time after unplanned meetings',
   'Needs roughly twenty minutes to return to focused work after an unplanned meeting.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'ot',
   now() - interval '5 months', 'professional_validated', 0.9, 'low', array['transitions']),

  ('c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'functional', 'Noise sensitivity on the warehouse floor',
   'Sustained noise above conversational level reduces sustained attention within the hour.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'ot',
   now() - interval '3 months', 'professional_validated', 0.85, 'moderate', array['sensory']),

  -- clinical (must never reach the employer or the trusted person)
  ('c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'clinical', 'Adult autism diagnostic outcome',
   'Diagnostic assessment completed. Formulation and recommendations recorded.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'psychiatrist',
   now() - interval '9 months', 'professional_validated', 0.95, 'high', array['diagnosis']),

  ('c0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'clinical', 'Medication review',
   'Reviewed at the February appointment. No change made; next review in six months.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'psychiatrist',
   now() - interval '6 months' + interval '3 days', 'professional_validated', 0.9, 'restricted', array['medication']),

  ('c0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'clinical', 'Session summary — workplace transitions',
   'Discussed the pattern of short-notice changes and their effect on the rest of the day.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'psychologist',
   now() - interval '1 month', 'professional_validated', 0.85, 'moderate', array['session']),

  -- support
  ('c0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'support', 'Noise-cancelling headphones trial',
   'Trialled for six weeks during focused work. Reported no benefit on the worst days.',
   'self_reported', 'a0000000-0000-0000-0000-000000000001', 'patient',
   now() - interval '7 months', 'subject_confirmed', 0.6, 'low', array['strategy']),

  ('c0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
   'support', 'Written advance notice of schedule changes',
   'Current strategy. Two of three check-ins reported no benefit, most recently last week.',
   'self_reported', 'a0000000-0000-0000-0000-000000000001', 'patient',
   now() - interval '10 days', 'subject_confirmed', 0.75, 'moderate', array['strategy']),

  -- workplace (the only domain the employer may read)
  ('c0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
   'workplace', 'Quiet workspace after unplanned meetings',
   'Adjustment agreed and in place since March. Reviewed quarterly.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000003', 'employer',
   now() - interval '4 months', 'professional_validated', 0.8, 'low', array['adjustment']),

  ('c0000000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
   'workplace', 'Notice and transition buffer request',
   'Requested twenty minutes of protected time after any unplanned schedule change.',
   'self_reported', 'a0000000-0000-0000-0000-000000000001', 'patient',
   now() - interval '3 weeks', 'unvalidated', 0.7, 'moderate', array['adjustment']),

  ('c0000000-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111',
   'workplace', 'Team handover note',
   'Line manager changed in June. Existing adjustments carried across unchanged.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000003', 'employer',
   now() - interval '2 months', 'professional_validated', 0.65, 'low', array['handover']);

/* -------------------------------------------------------- supersession */

-- Two corrections, recorded rather than overwritten. The superseded rows stay
-- and are excluded from retrieval by is_current, which is the behaviour the
-- test checks: twelve items exist, ten are current.

insert into record_items (
  item_id, subject_id, domain, title, content, source_type, reported_by,
  reporter_role, occurred_at, validation_status, evidence_strength, sensitivity,
  supersedes, tags
) values
  ('c0000000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111',
   'support', 'Written advance notice — revised',
   'Revised after review: notice must be written and at least one working day ahead.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'psychologist',
   now() - interval '5 days', 'professional_validated', 0.9, 'moderate',
   'c0000000-0000-0000-0000-000000000009', array['strategy']),

  ('c0000000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
   'functional', 'Transition time — updated estimate',
   'Revised to twenty-five minutes following four weeks of observation.',
   'professional_reported', 'a0000000-0000-0000-0000-000000000002', 'ot',
   now() - interval '6 weeks', 'professional_validated', 0.9, 'low',
   'c0000000-0000-0000-0000-000000000003', array['transitions']);

update record_items
set superseded_by = 'c0000000-0000-0000-0000-00000000000d', is_current = false
where item_id = 'c0000000-0000-0000-0000-000000000009';

update record_items
set superseded_by = 'c0000000-0000-0000-0000-00000000000e', is_current = false
where item_id = 'c0000000-0000-0000-0000-000000000003';

/* ----------------------------------------------------------------- runs */

-- The same question, from four people, with each one's own purpose. Identical
-- in every respect except who is asking — which is exactly the variable the
-- test is isolating.

insert into runs (run_id, lane, workflow_name, status, actor_id, subject_id, context) values
  ('d0000000-0000-0000-0000-000000000001', 'answer', 'stage1-retrieve', 'pending',
   'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   jsonb_build_object(
     'actor_id', 'a0000000-0000-0000-0000-000000000001',
     'subject_id', '11111111-1111-1111-1111-111111111111',
     'original_message', 'what has changed in the last three months',
     'purpose', 'personal_understanding',
     'detected_intent', 'change_summary',
     'relevant_time_range', jsonb_build_object())),

  ('d0000000-0000-0000-0000-000000000002', 'answer', 'stage1-retrieve', 'pending',
   'a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   jsonb_build_object(
     'actor_id', 'a0000000-0000-0000-0000-000000000002',
     'subject_id', '11111111-1111-1111-1111-111111111111',
     'original_message', 'what has changed in the last three months',
     'purpose', 'care',
     'detected_intent', 'change_summary',
     'relevant_time_range', jsonb_build_object())),

  ('d0000000-0000-0000-0000-000000000003', 'answer', 'stage1-retrieve', 'pending',
   'a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   jsonb_build_object(
     'actor_id', 'a0000000-0000-0000-0000-000000000003',
     'subject_id', '11111111-1111-1111-1111-111111111111',
     'original_message', 'what has changed in the last three months',
     'purpose', 'accommodation',
     'detected_intent', 'change_summary',
     'relevant_time_range', jsonb_build_object())),

  ('d0000000-0000-0000-0000-000000000004', 'answer', 'stage1-retrieve', 'pending',
   'a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   jsonb_build_object(
     'actor_id', 'a0000000-0000-0000-0000-000000000004',
     'subject_id', '11111111-1111-1111-1111-111111111111',
     'original_message', 'what has changed in the last three months',
     'purpose', 'personal_understanding',
     'detected_intent', 'change_summary',
     'relevant_time_range', jsonb_build_object()));

commit;
