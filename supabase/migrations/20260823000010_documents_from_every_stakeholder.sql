-- A document from every kind of person who writes one.
--
-- The record held four documents, all clinical, all about one patient. That
-- made the document library look like a filing cabinet a clinician keeps,
-- which is the opposite of the argument this system makes: a post-diagnostic
-- record is assembled by ten different people who never meet, and the reason
-- it falls apart is that each of them writes into a different system.
--
-- So: one from each role, across four patients, with the access list set to
-- who was actually meant to read it rather than to everyone. Several are
-- deliberately narrow — the OT's workplace visit is not the employer's to
-- read, and the sister's note is not the clinic's.
--
-- `extracted` carries what ORCA found in the file. It is empty where nothing
-- has been read yet, because a document that arrived this morning has not been
-- processed and pretending otherwise is the failure this project keeps naming.

insert into documents
  (id, patient_id, title, file_type, category, source_id, source_label, recorded_on, status, extracted, related_event_ids, access)
values

-- ---------------------------------------------------------------- clinical

('doc-10', 'pt-ananya', 'Psychology session summary — 28 July 2026', 'PDF', 'Clinical',
 'u-kavita', 'Dr Kavita Nair, Clinical Psychologist', '2026-07-28', 'Saved',
 '[{"label":"Presenting difficulty","value":"Loss of working time after unplanned schedule changes","accepted":true},
   {"label":"Agreed action","value":"Trial written advance notice for four weeks","accepted":true},
   {"label":"Review date","value":"25 August 2026","accepted":true}]'::jsonb,
 '{ev-12}', '{patient,psychologist,psychiatrist,gp}'),

('doc-11', 'pt-ananya', 'Medication and review note — February 2026', 'PDF', 'Clinical',
 'u-arun', 'Dr Arun Deshpande, Consultant Psychiatrist', '2026-02-19', 'Saved',
 '[{"label":"Diagnosis recorded","value":"Adult autism assessment completed 19 February 2026","accepted":true},
   {"label":"Next review","value":"9 September 2026","accepted":true}]'::jsonb,
 '{}', '{patient,psychiatrist,gp}'),

('doc-12', 'pt-ananya', 'Communication preferences — agreed with Ananya', 'DOCX', 'Therapy',
 'u-meera', 'Meera Joshi, Speech & Communication Therapist', '2026-06-14', 'Saved',
 '[{"label":"Preferred channel","value":"Written, with the agenda ahead of the meeting","accepted":true},
   {"label":"Not helpful","value":"Being asked to decide something in the room","accepted":true}]'::jsonb,
 '{}', '{patient,psychologist,therapist,ot,employer,university}'),

('doc-13', 'pt-ananya', 'Workplace environment observation — Northline, 4 August', 'PDF', 'OT',
 'u-sana', 'Sana Kulkarni, Occupational Therapist', '2026-08-04', 'Saved',
 '[{"label":"Desk position","value":"Adjacent to the main walkway, high footfall after 11:00","accepted":true},
   {"label":"Recommendation","value":"Bookable quiet space within two minutes of the desk","accepted":true},
   {"label":"Not recommended","value":"Relocating the whole team","accepted":false}]'::jsonb,
 '{ev-11}', '{patient,ot,psychologist,psychiatrist}'),

('doc-14', 'pt-ananya', 'Relevant health summary for occupational health', 'PDF', 'Clinical',
 'u-vikram', 'Dr Vikram Rao, General Practitioner', '2026-08-11', 'Awaiting review',
 '[]'::jsonb,
 '{}', '{patient,gp}'),

('doc-15', 'pt-ananya', 'Care coordination schedule — August to November', 'Structured', 'Statutory',
 'u-priya', 'Priya Salvi, Care Coordinator, Pune Neurodevelopmental Clinic', '2026-08-01', 'Saved',
 '[{"label":"Appointments arranged","value":"3","accepted":true},
   {"label":"Waiting on","value":"Occupational health, Northline Technologies","accepted":true}]'::jsonb,
 '{}', '{patient,clinic,psychologist,psychiatrist,gp}'),

-- --------------------------------------------------------- outside clinical

('doc-16', 'pt-ananya', 'Adjustment request — notice and transition buffer', 'PDF', 'Employment',
 'u-anil', 'Anil Fernandes, HR Business Partner, Northline Technologies', '2026-08-18', 'Saved',
 '[{"label":"Requested","value":"Written notice by end of the previous working day","accepted":true},
   {"label":"Requested","value":"Twenty minutes of protected time after an unplanned meeting","accepted":true},
   {"label":"Decision","value":"With HR since 18 August","accepted":false}]'::jsonb,
 '{ev-12}', '{patient,employer}'),

('doc-17', 'pt-neha', 'Study support plan — first year', 'DOCX', 'University',
 'u-ruth', 'Ruth Menon, Accessibility Adviser', '2026-08-06', 'Saved',
 '[{"label":"Agreed","value":"Running order circulated before each studio crit","accepted":true},
   {"label":"Under review","value":"Extra time across all assessments","accepted":false}]'::jsonb,
 '{}', '{patient,university}'),

('doc-18', 'pt-ananya', 'What I notice on a hard day — from Divya', 'DOCX', 'Personal',
 'u-divya', 'Divya Rao, sister', '2026-07-02', 'Saved',
 '[{"label":"Early sign","value":"Stops replying to messages before saying anything is wrong","accepted":true},
   {"label":"What helps","value":"Being told what is happening next, not being asked what she wants","accepted":true}]'::jsonb,
 '{}', '{patient,trusted}'),

('doc-19', 'pt-ananya', 'Photos of my desk and the walkway', 'Image', 'Personal',
 'u-ananya', 'Ananya Rao', '2026-08-03', 'Saved',
 '[]'::jsonb,
 '{ev-11}', '{patient,ot}'),

-- ------------------------------------------------- other patients, briefly

('doc-20', 'pt-rohan', 'First post-diagnostic session — plan', 'PDF', 'Clinical',
 'u-kavita', 'Dr Kavita Nair, Clinical Psychologist', '2026-08-19', 'Awaiting review',
 '[]'::jsonb,
 '{}', '{patient,psychologist}'),

('doc-21', 'pt-rohan', 'Pick-line noise readings — warehouse floor', 'Structured', 'OT',
 'u-sana', 'Sana Kulkarni, Occupational Therapist', '2026-08-05', 'Saved',
 '[{"label":"Peak","value":"84 dB during the 06:00 changeover","accepted":true},
   {"label":"Recommendation","value":"Written shift handover instead of verbal at changeover","accepted":true}]'::jsonb,
 '{}', '{patient,ot,psychologist}'),

('doc-22', 'pt-farida', 'Studio crit adjustments — request to the school', 'PDF', 'University',
 'u-ruth', 'Ruth Menon, Accessibility Adviser', '2026-08-16', 'Saved',
 '[{"label":"Requested","value":"Running order given before each crit","accepted":true}]'::jsonb,
 '{}', '{patient,university}'),

('doc-23', 'pt-dev', 'Self-assessment notes before first appointment', 'DOCX', 'Personal',
 null, 'Dev Sharma', '2026-08-10', 'Uploaded',
 '[]'::jsonb,
 '{}', '{patient}')

on conflict (id) do nothing;
