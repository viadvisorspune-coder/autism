-- Things a lookup can actually find.
--
-- WHAT WENT WRONG. "What medication did Kavita prescribe?" routed correctly,
-- fired the chat lane, retrieved the record and came back with the truth: there
-- is nothing in it about medication. The lane worked. The record was thin.
--
-- Retrieval reads four tables and nothing else -- `timeline_events`,
-- `strategies`, `profile_items` and `documents`, all in
-- `knowledge-evidence/index.ts` -- so a fact that is not in one of those four
-- is a fact no agent in either workflow can see, however plainly it is written
-- somewhere else in the product. Everything below goes into those tables.
--
-- KAVITA DOES NOT PRESCRIBE, AND THE RECORD NOW SAYS SO. Dr Kavita Nair is a
-- clinical psychologist. Prescribing and reviewing medication at this clinic is
-- Dr Arun Deshpande's work, and he is already in the record as the consultant
-- psychiatrist who made the diagnosis. Filing a prescription under Kavita to
-- make one demonstration question return a tidy answer would have put a false
-- clinical fact in a governance record, which is the failure this whole product
-- is built to prevent. The medication is filed under Arun, where it belongs,
-- and the profile now states who does which job -- so the question gets a
-- better answer than the false one would have been: no, she is your
-- psychologist, here is who prescribes and here is what you take.
--
-- Every row is dated inside the existing chronology and attributed to somebody
-- already in the record. Nothing here contradicts what was seeded before it.

-- ------------------------------------------------------------------- events

insert into timeline_events
  (id, patient_id, recorded_on, occurred_on, title, category, source_id, summary, context, evidence, related_ids, visible_to)
values

-- Medication, from the psychiatrist. Three rows rather than one, because a
-- single current dose answers "what am I taking" and cannot answer "has it
-- changed", and the second is the question that actually needs a record.

('ev-13', 'pt-ananya', '2026-02-26', '2026-02-26',
 'Medication started — sertraline 25 mg daily', 'Clinical', 'u-arun',
 'Sertraline 25 mg once daily, taken in the morning, started for co-occurring anxiety one week after the diagnostic assessment. Prescribed by Dr Arun Deshpande, Consultant Psychiatrist. Agreed to review at four weeks.',
 'Sahyadri Neurodevelopmental Clinic. Not a treatment for autism; prescribed for the anxiety recorded alongside it.',
 'Professionally documented', '{ev-3}', '{patient,psychologist,psychiatrist,gp}'),

('ev-14', 'pt-ananya', '2026-03-26', '2026-03-26',
 'Medication review — sertraline increased to 50 mg daily', 'Clinical', 'u-arun',
 'Dose increased from 25 mg to 50 mg once daily at the four-week review. Reported as tolerated, with early-morning waking as the only side effect noted.',
 'Four-week review with Dr Arun Deshpande.',
 'Professionally documented', '{ev-13}', '{patient,psychologist,psychiatrist,gp}'),

('ev-15', 'pt-ananya', '2026-08-06', '2026-08-06',
 'Medication review — sertraline 50 mg continued, no change', 'Clinical', 'u-arun',
 'Sertraline 50 mg once daily continued unchanged. This is the current prescription. Next review booked for the six-month appointment on 9 September 2026.',
 'Sahyadri Neurodevelopmental Clinic, Room 1.',
 'Professionally documented', '{ev-14}', '{patient,psychologist,psychiatrist,gp}'),

-- Kavita's sessions. The record held exactly one of these, so any question
-- about what she has actually done had a single line to work from.

('ev-16', 'pt-ananya', '2026-04-02', '2026-04-02',
 'Psychological formulation recorded — Dr Kavita Nair', 'Clinical', 'u-kavita',
 'Formulation completed after three sessions. Difficulty is concentrated at transitions rather than spread across the day: an unplanned change costs working time out of proportion to the change itself, and the cost rises sharply when the change is announced within the hour. Approach agreed as environmental and communication adjustment first, with anxiety management alongside it.',
 'Six sessions agreed, roughly every six weeks.',
 'Professionally documented', '{ev-3}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

('ev-17', 'pt-ananya', '2026-05-14', '2026-05-14',
 'Session with Dr Kavita Nair — first post-diagnostic session', 'Appointments', 'u-kavita',
 'Went through what the diagnosis does and does not change about work and study. Agreed that the headphones trial then running was addressing sound rather than interruption, and that the interruption channel was the thing to change.',
 null,
 'Professionally documented', '{st-0}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

('ev-18', 'pt-ananya', '2026-06-24', '2026-06-24',
 'Session with Dr Kavita Nair — interruption load at work', 'Appointments', 'u-kavita',
 'Reviewed the June handover meeting. Identified that changes were arriving through three separate channels and that no single one of them was reliable, which became the single-written-channel strategy.',
 null,
 'Professionally documented', '{ev-7,st-3}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

('ev-19', 'pt-ananya', '2026-08-26', '2026-08-26',
 'Session with Dr Kavita Nair — advance-notice trial reviewed', 'Appointments', 'u-kavita',
 'Four-week trial of written advance notice reviewed. Effective when notice arrived the previous day or several hours ahead; no measurable effect on same-hour changes. Agreed to keep it for planned changes and to add a transition buffer for unplanned ones.',
 'Sahyadri Neurodevelopmental Clinic, Room 4.',
 'Professionally documented', '{st-1,ev-8}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

-- The GP, who had nothing in the record at all despite holding a connection.

('ev-20', 'pt-ananya', '2026-07-02', '2026-07-02',
 'GP review — sleep and early waking', 'Clinical', 'u-vikram',
 'Early-morning waking discussed. No change to medication. Advice was to keep caffeine before midday and to raise it at the psychiatry review if it persisted past August.',
 'Dr Vikram Rao, general practice.',
 'Professionally documented', '{ev-14}', '{patient,psychologist,psychiatrist,gp}');

-- --------------------------------------------------------------- profile

-- `section` is a fixed set of five in `src/data/types.ts`, so these use the
-- existing sections rather than inventing a sixth that the profile screen
-- would not render.

insert into profile_items
  (id, patient_id, section, text, source_id, source_label, recorded_on, evidence, visible_to)
values

('pf-11', 'pt-ananya', 'Important context',
 'Current medication: sertraline 50 mg, once daily in the morning, unchanged since 26 March 2026. Prescribed and reviewed by Dr Arun Deshpande, Consultant Psychiatrist.',
 'u-arun', null, '2026-08-06', 'Professionally documented', '{patient,psychologist,psychiatrist,gp}'),

('pf-12', 'pt-ananya', 'Important context',
 'Who does what: Dr Arun Deshpande, Consultant Psychiatrist, made the diagnosis and prescribes and reviews medication. Dr Kavita Nair, Clinical Psychologist, provides psychological therapy and does not prescribe. Sana Kulkarni, Occupational Therapist, covers the work environment. Dr Vikram Rao is the GP and coordinates between them.',
 'u-kavita', 'Sahyadri Neurodevelopmental Clinic', '2026-04-02', 'Professionally documented',
 '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

('pf-13', 'pt-ananya', 'About me',
 'I see Dr Kavita Nair about every six weeks, and Dr Arun Deshpande twice a year. I would rather bring one written question to a session than try to remember three.',
 'u-ananya', null, '2026-04-02', 'Reported', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

('pf-14', 'pt-ananya', 'Important context',
 'Diagnosed with autism spectrum condition on 19 February 2026 by Dr Arun Deshpande, with co-occurring anxiety recorded at the same assessment. Both are held in the same record; the anxiety is what the medication is for.',
 'u-arun', null, '2026-02-19', 'Professionally documented',
 '{patient,psychologist,psychiatrist,therapist,ot,gp}');

-- ------------------------------------------------------------- documents

-- `extracted` is the highest-value field here: retrieval turns each pair into
-- "label: value" and hands it straight to the agent, so a fact written there is
-- a fact a lookup can quote.

insert into documents
  (id, patient_id, title, file_type, category, source_id, source_label, recorded_on, status, extracted, related_event_ids, access)
values

('doc-24', 'pt-ananya', 'Psychological formulation — 2 April 2026', 'PDF', 'Clinical',
 'u-kavita', 'Dr Kavita Nair, Clinical Psychologist', '2026-04-02', 'Saved',
 '[{"label":"Clinician","value":"Dr Kavita Nair, Clinical Psychologist","accepted":true},
   {"label":"Formulation","value":"Difficulty concentrated at transitions rather than spread across the day","accepted":true},
   {"label":"Approach","value":"Environmental and communication adjustment first, anxiety management alongside","accepted":true},
   {"label":"Prescribing","value":"Not applicable — medication is held by Dr Arun Deshpande, Consultant Psychiatrist","accepted":true},
   {"label":"Sessions agreed","value":"Six, approximately every six weeks","accepted":true}]'::jsonb,
 '{ev-16}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),

('doc-25', 'pt-ananya', 'Medication review letter — 6 August 2026', 'PDF', 'Clinical',
 'u-arun', 'Dr Arun Deshpande, Consultant Psychiatrist', '2026-08-06', 'Saved',
 '[{"label":"Prescriber","value":"Dr Arun Deshpande, Consultant Psychiatrist","accepted":true},
   {"label":"Medication","value":"Sertraline 50 mg, once daily in the morning","accepted":true},
   {"label":"Started","value":"26 February 2026 at 25 mg; increased to 50 mg on 26 March 2026","accepted":true},
   {"label":"Indication","value":"Co-occurring anxiety recorded at the February 2026 diagnostic assessment","accepted":true},
   {"label":"This review","value":"No change. Continue at 50 mg.","accepted":true},
   {"label":"Next review","value":"9 September 2026","accepted":true}]'::jsonb,
 '{ev-15,ev-14,ev-13}', '{patient,psychologist,psychiatrist,gp}');

-- ---------------------------------------------------------- appointments

-- The only upcoming appointment on this record was the psychiatry review, so
-- "when do I next see Kavita" had no answer to give even once retrieval could
-- see the diary. Her last session was 26 August; six weeks on is 7 October.

insert into appointments
  (id, patient_id, professional_id, scheduled_for, purpose, location, status, preparation_status, questions)
values
('ap-6', 'pt-ananya', 'u-kavita', '2026-10-07T10:30:00Z',
 'Review of the transition buffer and the single written channel',
 'Sahyadri Neurodevelopmental Clinic, Room 4', 'Active', 'Not started',
 '{"Has the transition buffer changed anything the advance notice did not?","Is the single written channel worth starting before the accommodation decision?"}');
