-- Seed: the same fictional record the prototype UI has been running on, so the
-- frontend behaves identically once it reads from Postgres instead of
-- src/data/db.ts. All data is invented; no real person is described.

insert into app_users (id, name, role, title, organisation, pronouns) values
  ('u-ananya', 'Ananya Rao', 'patient', null, null, 'she/her'),
  ('u-kavita', 'Dr Kavita Nair', 'psychologist', 'Clinical Psychologist', 'Sahyadri Neurodevelopmental Clinic', null),
  ('u-arun', 'Dr Arun Deshpande', 'psychiatrist', 'Consultant Psychiatrist', 'Sahyadri Neurodevelopmental Clinic', null),
  ('u-meera', 'Meera Joshi', 'therapist', 'Speech & Communication Therapist', 'Sahyadri Neurodevelopmental Clinic', null),
  ('u-sana', 'Sana Kulkarni', 'ot', 'Occupational Therapist', 'Sahyadri Neurodevelopmental Clinic', null),
  ('u-vikram', 'Dr Vikram Rao', 'gp', 'General Practitioner', 'Kothrud Family Practice', null),
  ('u-priya', 'Priya Salvi', 'clinic', 'Care Coordinator', 'Sahyadri Neurodevelopmental Clinic', null),
  ('u-anil', 'Anil Fernandes', 'employer', 'HR Business Partner', 'Northline Technologies', null),
  ('u-ruth', 'Ruth Menon', 'university', 'Accessibility Adviser', 'Pune Institute of Design', null),
  ('u-divya', 'Divya Rao', 'trusted', 'Sister (trusted person)', null, null),
  ('u-tejas', 'Tejas Bhatt', 'admin', 'Platform Administrator', 'ORCA', null),
  ('u-rohan', 'Rohan Mehta', 'patient', null, null, 'he/him'),
  ('u-farida', 'Farida Qureshi', 'patient', null, null, 'she/her'),
  ('u-dev', 'Dev Sharma', 'patient', null, null, 'he/him'),
  ('u-neha', 'Neha Iyer', 'patient', null, null, 'they/them');

insert into patients (id, user_id, name, pronouns, age, context) values
  ('pt-ananya', 'u-ananya', 'Ananya Rao', 'she/her', 27, 'QA analyst, Northline Technologies. Part-time MDes student.'),
  ('pt-rohan', 'u-rohan', 'Rohan Mehta', 'he/him', 31, 'Warehouse team lead. Recently diagnosed.'),
  ('pt-farida', 'u-farida', 'Farida Qureshi', 'she/her', 24, 'Final-year architecture student.'),
  ('pt-dev', 'u-dev', 'Dev Sharma', 'he/him', 35, 'Freelance illustrator. Support after job loss.'),
  ('pt-neha', 'u-neha', 'Neha Iyer', 'they/them', 22, 'Undergraduate, first year. Transition support.');

insert into connections (id, patient_id, person_id, relationship, purpose, access_scope, consent_given, consent_status, review_due, last_interaction) values
  ('cn-1', 'pt-ananya', 'u-kavita', 'Clinical psychologist', 'Ongoing post-diagnostic support',
   '{Timeline,Profile,"Strategies & outcomes","Documents (clinical)"}', '2026-02-26', 'Active', '2027-02-26', '2026-07-28'),
  ('cn-2', 'pt-ananya', 'u-sana', 'Occupational therapist', 'Workplace environment and adaptation',
   '{"Functional profile","Environment observations","Strategies & outcomes"}', '2026-04-20', 'Active', '2026-10-20', '2026-08-04'),
  ('cn-3', 'pt-ananya', 'u-arun', 'Consultant psychiatrist', 'Diagnosis and periodic review',
   '{"Timeline (clinical)","Documents (clinical)","Appointment briefs"}', '2026-02-19', 'Active', '2027-02-19', '2026-02-19'),
  ('cn-4', 'pt-ananya', 'u-anil', 'Employer — HR', 'Workplace accommodation request only',
   '{"Authorised functional information for the current request"}', '2026-08-18', 'Active', '2026-11-18', '2026-08-18'),
  ('cn-5', 'pt-ananya', 'u-divya', 'Trusted person (sister)', 'Practical support and observations',
   '{"What I have chosen to share","Support needs"}', '2026-03-01', 'Active', '2027-03-01', '2026-08-10'),
  ('cn-6', 'pt-ananya', 'u-vikram', 'General practitioner', 'Care coordination',
   '{"Relevant health summary","Documents (clinical)"}', '2026-05-06', 'Active', '2027-05-06', '2026-05-06'),
  ('cn-7', 'pt-rohan', 'u-kavita', 'Clinical psychologist', 'Post-diagnostic support',
   '{Timeline,Profile}', '2026-08-01', 'Active', '2027-08-01', '2026-08-19'),
  ('cn-8', 'pt-farida', 'u-kavita', 'Clinical psychologist', 'Study support',
   '{Timeline,Profile}', '2026-06-10', 'Active', '2027-06-10', '2026-08-12'),
  ('cn-9', 'pt-farida', 'u-ruth', 'University accessibility', 'Accommodation request only',
   '{"Authorised functional information for the current request"}', '2026-08-12', 'Active', '2026-11-12', '2026-08-17'),
  ('cn-10', 'pt-rohan', 'u-anil', 'Employer — HR', 'Workplace accommodation request only',
   '{"Authorised functional information for the current request"}', '2026-08-15', 'Active', '2026-11-15', '2026-08-16');

insert into timeline_events (id, patient_id, recorded_on, title, category, source_id, summary, context, evidence, related_ids, visible_to) values
  ('ev-12', 'pt-ananya', '2026-08-18', 'Meetings rescheduled at short notice — third time this month', 'Work', 'u-ananya',
   'Reported that three of this month’s sprint meetings moved with under thirty minutes’ notice, and that the rest of the day was hard to use afterwards.',
   'Northline Technologies, sprint planning cycle.', 'Reported', '{ev-7,ev-4}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-11', 'pt-ananya', '2026-08-12', 'Quiet-room use after unplanned meeting', 'Functional', 'u-ananya',
   'Used the second-floor quiet room for twenty minutes after an unplanned meeting; returned to work without needing to leave early.',
   null, 'Reported', '{}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-10', 'pt-ananya', '2026-08-04', 'OT environmental observation — open-plan desk position', 'Stakeholder observations', 'u-sana',
   'Desk sits on the main walkway between the kitchen and the stairwell. Movement in peripheral vision was noted as a recurring demand during focused work.',
   'Workplace visit, 4 August 2026.', 'Professionally documented', '{st-2}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-9', 'pt-ananya', '2026-07-28', 'Session with Dr Kavita Nair', 'Appointments', 'u-kavita',
   'Reviewed transition difficulties across work and study. Agreed to trial written advance notice of schedule changes.',
   null, 'Professionally documented', '{st-1}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-8', 'pt-ananya', '2026-07-21', 'Advance-notice strategy started', 'Support', 'u-ananya',
   'Began asking the team lead for written notice of meeting changes. Notice of a few hours worked well; same-hour changes did not.',
   null, 'Validated', '{st-1}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-7', 'pt-ananya', '2026-06-16', 'Difficulty with unplanned handover meeting', 'Work', 'u-ananya',
   'A handover meeting was added the same morning. Reported losing the rest of the afternoon and working late to catch up.',
   null, 'Reported', '{ev-12}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-6', 'pt-ananya', '2026-05-30', 'Studio brief change at university', 'University', 'u-ananya',
   'Studio brief changed two days before submission. Written summary from the tutor made the change manageable.',
   null, 'Reported', '{ev-12}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-5', 'pt-ananya', '2026-05-02', 'Occupational therapy assessment', 'Clinical', 'u-sana',
   'Functional assessment covering daily routines, workplace environment and sensory factors. Report filed.',
   null, 'Professionally documented', '{doc-2}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-4', 'pt-ananya', '2026-03-11', 'Started current role at Northline Technologies', 'Work', 'u-ananya',
   'Moved from a fixed-schedule testing role into a sprint-based team.',
   null, 'Reported', '{ev-12,ev-7}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-3', 'pt-ananya', '2026-02-19', 'Diagnostic assessment completed', 'Clinical', 'u-arun',
   'Adult autism diagnostic assessment completed at Sahyadri Neurodevelopmental Clinic.',
   null, 'Professionally documented', '{doc-1}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-2', 'pt-ananya', '2026-02-19', 'Diagnostic report added to documents', 'Documents', 'u-arun',
   'Report uploaded by the clinic and linked to the assessment.',
   null, 'Professionally documented', '{doc-1}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('ev-1', 'pt-ananya', '2026-01-08', 'Joined ORCA', 'Personal', 'u-ananya',
   'Account created. Communication preferences and privacy defaults set.', null, 'Reported', '{}', '{patient}');

insert into profile_items (id, patient_id, section, text, source_id, source_label, recorded_on, evidence, visible_to) values
  ('pf-1', 'pt-ananya', 'About me', 'I prefer written communication. Voice calls without notice are hard.', 'u-ananya', null, '2026-01-08', 'Validated', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-2', 'pt-ananya', 'About me', 'I work best in the first half of the day and plan my week on Sunday evening.', 'u-ananya', null, '2026-03-02', 'Reported', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-3', 'pt-ananya', 'What helps me', 'Written notice of schedule changes, ideally several hours ahead.', 'u-ananya', null, '2026-07-21', 'Validated', '{patient,psychologist,psychiatrist,therapist,ot,gp,employer}'),
  ('pf-4', 'pt-ananya', 'What helps me', 'A short buffer between an unexpected meeting and the next task.', 'u-sana', null, '2026-08-04', 'Professionally documented', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-5', 'pt-ananya', 'What doesn''t help me', 'Being told about a change verbally in a corridor with no follow-up in writing.', 'u-ananya', null, '2026-06-16', 'Reported', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-6', 'pt-ananya', 'What doesn''t help me', 'Noise-cancelling headphones alone — tried in May, made conversation harder without reducing interruptions.', 'u-ananya', null, '2026-05-18', 'Validated', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-7', 'pt-ananya', 'Current goals', 'Get through a full sprint without needing to work late to catch up.', 'u-ananya', null, '2026-08-01', 'Reported', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-8', 'pt-ananya', 'Current goals', 'Finish the MDes term project without taking leave from work.', 'u-ananya', null, '2026-08-01', 'Reported', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('pf-9', 'pt-ananya', 'Important context', 'Transitions are harder when the change is announced inside the same hour it happens.', null, 'ORCA', '2026-08-18', 'AI interpretation', '{patient}'),
  ('pf-10', 'pt-ananya', 'Important context', 'Desk is positioned on a main walkway; peripheral movement is a recurring demand.', 'u-sana', null, '2026-08-04', 'Professionally documented', '{patient,psychologist,psychiatrist,therapist,ot,gp}');

insert into strategies (id, patient_id, title, goal, rationale, evidence_ids, status, phase, starts_on, duration_weeks, conditions, success_criteria, review_date, owner_id, environment, outcome) values
  ('st-1', 'pt-ananya', 'Written advance notice of schedule changes', 'Reduce the loss of working time after a meeting moves.',
   'Written notice several hours ahead has helped in three previous work and study contexts. The current difficulty involves same-hour changes, which this strategy has not yet been tested against.',
   '{ev-8,ev-6,ev-7}', 'Requires adaptation', 'Outcome', '2026-07-21', 4,
   'Team lead sends a message whenever a meeting moves.',
   'Fewer than two days per sprint where catching up requires working past normal hours.',
   '2026-08-25', 'u-kavita', null,
   '{"summary":"Effective when notice arrives the previous day or several hours ahead. No measurable effect when the change is announced within the hour.","effectiveness":"Partly helped","patientFeedback":"It helped when I got at least a few hours’ notice, but not when the change happened immediately.","professionalFeedback":"Consistent with the pattern recorded during the university studio change in May.","comparison":"Similar to the May 2026 university brief change, where a written summary made a late change manageable.","proposedAdaptation":"Add a short, predictable transition buffer after unplanned meetings, and keep the written notice for planned changes."}'::jsonb),
  ('st-2', 'pt-ananya', 'Quiet workspace after unplanned meetings', 'Recover working capacity after a change rather than losing the rest of the day.',
   'Reported as helpful once in August. The OT workplace observation supports reducing peripheral movement immediately after a demanding transition.',
   '{ev-11,ev-10}', 'Active', 'Check-ins', '2026-08-12', 3,
   'Quiet room booked for twenty minutes after any unplanned meeting.',
   'Returning to the planned task on at least three of four occasions.',
   '2026-09-02', 'u-sana', 'Second-floor quiet room, Northline Technologies', null),
  ('st-3', 'pt-ananya', 'Single written channel for task changes', 'Stop changes arriving through three different channels.',
   'Proposed after the June handover meeting. Not yet started — waiting on the accommodation decision.',
   '{ev-7}', 'Draft', 'Baseline', '2026-08-26', 4,
   'All task changes go to one channel agreed with the team lead.',
   'No change missed over a full sprint.', '2026-09-23', 'u-kavita', null, null),
  ('st-0', 'pt-ananya', 'Noise-cancelling headphones during focused work', 'Reduce interruption during test cycles.',
   'Trialled before ORCA, recorded retrospectively.', '{}', 'Completed', 'Outcome', '2026-05-04', 2,
   'Headphones worn during morning test cycles.', 'Fewer interruptions per morning.', '2026-05-18', 'u-kavita', null,
   '{"summary":"Did not reduce interruptions; made necessary conversation harder.","effectiveness":"Did not help","patientFeedback":"People just tapped my desk instead of messaging me.","comparison":"First environmental strategy tried.","proposedAdaptation":"Address the interruption channel rather than the sound."}'::jsonb);

insert into strategy_checkins (id, strategy_id, recorded_on, note, helpfulness, reported_by) values
  ('ck-1', 'st-1', '2026-07-28', 'Two changes, both notified the previous evening. Both days went normally.', 'Helped', 'u-ananya'),
  ('ck-2', 'st-1', '2026-08-08', 'One change notified twenty minutes before. Lost most of the afternoon.', 'Did not help', 'u-ananya'),
  ('ck-3', 'st-1', '2026-08-18', 'Two same-hour changes in one week.', 'Did not help', 'u-ananya'),
  ('ck-4', 'st-2', '2026-08-12', 'Twenty minutes in the quiet room; returned to the planned task.', 'Helped', 'u-ananya'),
  ('ck-5', 'st-2', '2026-08-17', 'Room was occupied. Used the stairwell landing instead, which was noisier.', 'Partly helped', 'u-ananya'),
  ('ck-6', 'st-0', '2026-05-18', 'Interruptions continued; colleagues tapped the desk instead of messaging.', 'Did not help', 'u-ananya');

insert into appointments (id, patient_id, professional_id, scheduled_for, purpose, location, status, preparation_status, questions) values
  ('ap-1', 'pt-ananya', 'u-kavita', '2026-08-25T10:30:00Z', 'Review of workplace transitions and current strategy', 'Sahyadri Neurodevelopmental Clinic, Room 4', 'Awaiting approval', 'Draft ready',
   '{"Is a transition buffer something my employer can be asked for?","Should the advance-notice strategy continue alongside it?"}'),
  ('ap-2', 'pt-ananya', 'u-arun', '2026-09-09T16:00:00Z', 'Six-month review', 'Sahyadri Neurodevelopmental Clinic, Room 1', 'Active', 'Not started', '{}'),
  ('ap-3', 'pt-ananya', 'u-sana', '2026-08-04T14:00:00Z', 'Workplace environment visit', 'Northline Technologies, second floor', 'Completed', 'Shared', '{}'),
  ('ap-4', 'pt-rohan', 'u-kavita', '2026-08-19T15:00:00Z', 'First post-diagnostic session', 'Sahyadri Neurodevelopmental Clinic, Room 4', 'Active', 'Draft ready', '{}'),
  ('ap-5', 'pt-farida', 'u-kavita', '2026-08-19T11:00:00Z', 'Study support review', 'Video call', 'Active', 'Approved by patient', '{}');

insert into documents (id, patient_id, title, file_type, category, source_id, recorded_on, status, extracted, related_event_ids, access) values
  ('doc-1', 'pt-ananya', 'Adult autism diagnostic report', 'PDF', 'Clinical', 'u-arun', '2026-02-19', 'Saved',
   '[{"label":"Assessment date","value":"19 February 2026","accepted":true},{"label":"Assessing clinician","value":"Dr Arun Deshpande","accepted":true},{"label":"Recommendation","value":"Occupational therapy referral","accepted":true}]'::jsonb,
   '{ev-3,ev-2}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('doc-2', 'pt-ananya', 'Occupational therapy functional report', 'PDF', 'OT', 'u-sana', '2026-05-02', 'Saved',
   '[{"label":"Environment","value":"Open-plan office, walkway-adjacent desk","accepted":true},{"label":"Recommendation","value":"Reduce peripheral movement during focused work","accepted":true},{"label":"Review","value":"Three months","accepted":false}]'::jsonb,
   '{ev-5,ev-10}', '{patient,psychologist,psychiatrist,therapist,ot,gp}'),
  ('doc-3', 'pt-ananya', 'Workplace adjustment guidance (employer handbook extract)', 'DOCX', 'Employment', 'u-ananya', '2026-08-14', 'Awaiting review',
   '[{"label":"Process owner","value":"HR Business Partner","accepted":false},{"label":"Decision window","value":"15 working days","accepted":false},{"label":"Evidence expected","value":"Functional description, not diagnosis","accepted":false}]'::jsonb,
   '{}', '{patient}'),
  ('doc-4', 'pt-ananya', 'University reasonable adjustment plan 2026', 'PDF', 'University', 'u-ruth', '2026-06-02', 'Saved',
   '[{"label":"Adjustment","value":"Written summary of any brief change","accepted":true},{"label":"Review date","value":"January 2027","accepted":true}]'::jsonb,
   '{ev-6}', '{patient,university,psychologist}');

insert into disclosures (id, patient_id, disclosed_on, recipient, recipient_id, purpose, content_scope, items_shared, approved_by) values
  ('ds-1', 'pt-ananya', '2026-08-18T18:40:00Z', 'Anil Fernandes — Northline Technologies (HR)', 'u-anil', 'Workplace accommodation request',
   '{"Functional requirement","Requested adjustment","Implementation detail"}',
   '{"Advance written notice of schedule changes helps; same-hour changes remain difficult.","A twenty-minute buffer after unplanned meetings is being trialled."}', 'u-ananya'),
  ('ds-2', 'pt-ananya', '2026-06-02T10:00:00Z', 'Pune Institute of Design — Accessibility', 'u-ruth', 'Reasonable adjustment plan',
   '{"Functional educational requirement","Supporting professional statement"}',
   '{"Written summary of any brief change to be provided."}', 'u-ananya'),
  ('ds-3', 'pt-ananya', '2026-05-06T09:00:00Z', 'Dr Vikram Rao — Kothrud Family Practice', 'u-vikram', 'Care coordination',
   '{"Occupational therapy functional report"}',
   '{"Occupational therapy functional report (2 May 2026)."}', 'u-ananya');

insert into requests (id, patient_id, type, title, destination, destination_role, raised_on, status, current_owner, steps,
                      functional_requirement, requested_adjustment, authorised_information, withheld, implementation, review_date, clarifications) values
  ('rq-1', 'pt-ananya', 'Accommodation', 'Notice and transition buffer for schedule changes', 'Northline Technologies — HR', 'employer', '2026-08-18', 'Awaiting stakeholder', 'Anil Fernandes (Employer)',
   '[{"label":"Need identified","state":"done","completedOn":"2026-08-18"},{"label":"Context gathered","state":"done","completedOn":"2026-08-18"},{"label":"Options generated","state":"done","completedOn":"2026-08-18"},{"label":"Draft prepared","state":"done","completedOn":"2026-08-18"},{"label":"Safety checked","state":"done","completedOn":"2026-08-18","detail":"Clinical detail excluded from the outbound draft."},{"label":"User approved","state":"done","completedOn":"2026-08-18"},{"label":"Submitted","state":"done","completedOn":"2026-08-18"},{"label":"Employer review","state":"current","detail":"With HR since 18 August."},{"label":"Outcome","state":"todo"},{"label":"Learning","state":"todo"}]'::jsonb,
   'Predictable information about schedule changes, and a short recovery period when a change cannot be notified in advance.',
   'Written notice of meeting changes where possible, and twenty minutes of protected time after an unplanned meeting.',
   '{"Advance written notice of changes has been effective when given several hours ahead.","Changes announced within the same hour remain difficult and cost working time.","A quiet-space buffer is currently being trialled with occupational therapy input."}',
   '{"Diagnostic report and clinical notes","Session content with the psychologist","Journal entries and raw personal reflections"}',
   'Team lead posts changes to one agreed written channel. Quiet room bookable for twenty minutes after an unplanned meeting.',
   '2026-11-18',
   '[{"date":"2026-08-19","from":"Anil Fernandes (Employer)","question":"Please clarify what scheduling information would be most useful, and whether the buffer is needed after every meeting or only unplanned ones."}]'::jsonb),
  ('rq-2', 'pt-ananya', 'Report', 'Functional summary for university adjustment review', 'Pune Institute of Design — Accessibility', 'university', '2026-08-10', 'Awaiting approval', 'Ananya Rao (You)',
   '[{"label":"Need identified","state":"done","completedOn":"2026-08-10"},{"label":"Context gathered","state":"done","completedOn":"2026-08-11"},{"label":"Draft prepared","state":"done","completedOn":"2026-08-16"},{"label":"Safety checked","state":"done","completedOn":"2026-08-16"},{"label":"User approved","state":"current","detail":"Waiting for you to review what will be shared."},{"label":"Submitted","state":"todo"},{"label":"Outcome","state":"todo"}]'::jsonb,
   'Written summary of any change to a studio brief.', 'Continue the existing adjustment for the coming term.',
   '{"Written summaries of brief changes have been effective since May 2026.","No change to the existing adjustment is being requested."}',
   '{"Workplace information","Clinical documents"}',
   'Tutor sends a written summary within one working day of any brief change.', null, '[]'::jsonb),
  ('rq-3', 'pt-ananya', 'Referral', 'Occupational therapy follow-up visit', 'Sahyadri Neurodevelopmental Clinic', 'clinic', '2026-07-30', 'Completed', 'Closed',
   '[{"label":"Need identified","state":"done","completedOn":"2026-07-30"},{"label":"Referral prepared","state":"done","completedOn":"2026-07-31"},{"label":"User approved","state":"done","completedOn":"2026-07-31"},{"label":"Clinic scheduled","state":"done","completedOn":"2026-08-01"},{"label":"Visit completed","state":"done","completedOn":"2026-08-04"},{"label":"Outcome recorded","state":"done","completedOn":"2026-08-06"}]'::jsonb,
   'Workplace environment review.', 'On-site visit.', '{"Referral reason and workplace address."}', '{}', 'Visit completed 4 August 2026.', null, '[]'::jsonb),
  ('rq-4', 'pt-rohan', 'Accommodation', 'Shift handover in writing', 'Northline Technologies — HR', 'employer', '2026-08-15', 'Awaiting stakeholder', 'Anil Fernandes (Employer)',
   '[{"label":"Need identified","state":"done","completedOn":"2026-08-15"},{"label":"Draft prepared","state":"done","completedOn":"2026-08-16"},{"label":"User approved","state":"done","completedOn":"2026-08-16"},{"label":"Submitted","state":"done","completedOn":"2026-08-16"},{"label":"Employer review","state":"current"},{"label":"Outcome","state":"todo"}]'::jsonb,
   'Handover information in a form that can be re-read.', 'Written handover sheet at each shift change.',
   '{"Verbal-only handovers are frequently lost; written handovers are reliable."}', '{"All clinical information"}',
   'Standard handover template already used on the night shift.', null, '[]'::jsonb),
  ('rq-5', 'pt-farida', 'Accommodation', 'Extended time and quiet room for studio assessments', 'Pune Institute of Design — Accessibility', 'university', '2026-08-12', 'Awaiting information', 'Ruth Menon (University)',
   '[{"label":"Need identified","state":"done","completedOn":"2026-08-12"},{"label":"Draft prepared","state":"done","completedOn":"2026-08-13"},{"label":"User approved","state":"done","completedOn":"2026-08-13"},{"label":"Submitted","state":"done","completedOn":"2026-08-13"},{"label":"University review","state":"current","detail":"Clarification requested 17 August."},{"label":"Outcome","state":"todo"}]'::jsonb,
   'Reduced environmental demand during timed assessment.', 'Separate room and 25% additional time.',
   '{"Assessment performance is affected by ambient noise and interruption."}', '{"Clinical documents"}',
   'Accessibility office allocates rooms two weeks before assessment week.', null,
   '[{"date":"2026-08-17","from":"Ruth Menon (University)","question":"Is the additional time needed for all assessments or only studio crits?"}]'::jsonb);

insert into memory_candidates (id, patient_id, proposal, confidence, evidence, related_history, raised_for, status) values
  ('mc-1', 'pt-ananya', 'Advance notice usually helps with unexpected workplace changes, but its effect depends on how much warning is given.', 0.78,
   '[{"source":"Ananya Rao","detail":"Three reports between June and August 2026","date":"2026-08-18"},{"source":"Dr Kavita Nair","detail":"Session observation, 28 July 2026","date":"2026-07-28"}]'::jsonb,
   'University brief change, May 2026 — written summary made a late change manageable.', '{patient,psychologist}', 'Pending'),
  ('mc-2', 'pt-ananya', 'Peripheral movement near the desk is a recurring demand during focused work.', 0.64,
   '[{"source":"Sana Kulkarni (OT)","detail":"Workplace observation, 4 August 2026","date":"2026-08-04"}]'::jsonb,
   'Headphone trial in May 2026 did not reduce interruptions.', '{psychologist,ot}', 'Pending'),
  ('mc-3', 'pt-rohan', 'Written handover is reliably retained; verbal handover is not.', 0.71,
   '[{"source":"Rohan Mehta","detail":"Two reports in August 2026","date":"2026-08-15"}]'::jsonb,
   'No previous workplace strategies recorded.', '{psychologist}', 'Pending');

insert into review_items (id, patient_id, title, reason, understanding, evidence, uncertainty, proposed_action, decision_required, assigned_to, status, raised_on) values
  ('rv-1', 'pt-ananya', 'Conflicting evidence about the advance-notice strategy',
   'Two check-ins report that the strategy helped and two report that it did not. The difference appears to depend on how much notice was given, which has not been confirmed with you.',
   'Notice given the previous evening or several hours ahead was followed by ordinary working days. Notice given within the same hour was followed by lost working time.',
   '{"Check-in 28 July 2026 — helped, notice the previous evening","Check-in 8 August 2026 — did not help, twenty minutes’ notice","Check-in 18 August 2026 — did not help, same-hour changes"}',
   'It is not clear whether the amount of notice is the deciding factor or whether the type of meeting also matters.',
   'Keep written notice for planned changes and add a short transition buffer for unplanned ones.',
   'Confirm, edit or reject the proposed adaptation.', '{patient,psychologist}', 'Awaiting approval', '2026-08-18'),
  ('rv-2', 'pt-ananya', 'Employer has asked a clarification question',
   'The employer has requested more specific scheduling information. Answering it may involve sharing more than the original approval covered.',
   'HR wants to know which scheduling information is most useful and whether the buffer applies to all meetings.',
   '{"Clarification request, 19 August 2026"}',
   'The original approval covered the request as submitted, not this follow-up.',
   'Draft an answer covering only scheduling practicalities, and ask you to approve it before it is sent.',
   'Approve the draft answer, edit it, or decline to answer.', '{patient}', 'Awaiting approval', '2026-08-19'),
  ('rv-3', 'pt-ananya', 'Question raised about medication side effects',
   'The question needs clinician input. ORCA does not answer medication questions.',
   'A question was asked about sleep and current medication.',
   '{"ORCA Guide conversation, 16 August 2026"}',
   'Outside the scope of anything ORCA can assess.',
   'Route to Dr Arun Deshpande ahead of the September review.',
   'Confirm routing to the psychiatrist.', '{patient,psychiatrist}', 'Awaiting professional review', '2026-08-16');

insert into notifications (id, patient_id, category, what, why, todo, for_roles, href, unread, created_at) values
  ('nt-1', 'pt-ananya', 'Approval required', 'ORCA has drafted an answer to your employer’s clarification question.', 'Nothing is sent to your employer until you approve exactly what it contains.', 'Review the draft and approve, edit or decline.', '{patient}', '/patient/requests/rq-1', true, '2026-08-19T09:20:00Z'),
  ('nt-2', 'pt-ananya', 'Action required', 'ORCA wants to remember something about advance notice.', 'A pattern was found across three reports and one professional observation.', 'Confirm, edit or decline to save it.', '{patient}', '/patient/profile', true, '2026-08-18T19:00:00Z'),
  ('nt-3', 'pt-ananya', 'Follow-up', 'The quiet-workspace trial has a check-in due.', 'The trial ends on 2 September and two check-ins are recorded so far.', 'Add how the last week went.', '{patient}', '/patient/support/st-2', false, '2026-08-18T08:00:00Z'),
  ('nt-4', 'pt-ananya', 'Approval required', 'Your appointment brief for 25 August is ready.', 'It will be shared with Dr Kavita Nair only after you approve it.', 'Review and approve the brief.', '{patient}', '/patient/care/appointments/ap-1/prepare', false, '2026-08-17T12:00:00Z'),
  ('nt-5', 'pt-ananya', 'Action required', 'Three memory updates are waiting for review across your patients.', 'AI-proposed patterns do not enter the record until a human accepts them.', 'Review the proposed updates.', '{psychologist}', '/psychologist/memory', true, '2026-08-18T07:30:00Z'),
  ('nt-6', 'pt-ananya', 'Professional response', 'Ananya Rao reported that the advance-notice strategy failed twice this week.', 'The strategy is up for review at the 25 August session.', 'Open the patient overview before the session.', '{psychologist}', '/psychologist/patients/pt-ananya', true, '2026-08-18T19:05:00Z'),
  ('nt-7', 'pt-ananya', 'Accommodation response', 'A new accommodation request is waiting for review.', 'Requests have a fifteen working day decision window.', 'Open the request and approve, decline or ask for clarification.', '{employer}', '/employer/requests/rq-1', true, '2026-08-18T18:45:00Z'),
  ('nt-8', null, 'Workflow blocked', 'Workflow wf-4 is blocked waiting on an external mock endpoint.', 'Blocked workflows do not retry automatically.', 'Inspect the workflow state and decide whether to retry.', '{admin}', '/admin/workflows', true, '2026-08-19T06:00:00Z'),
  ('nt-9', 'pt-farida', 'Document available', 'A functional summary is available for the university review.', 'It was prepared for the adjustment review on 1 September.', 'Open the request when you are ready.', '{university}', '/university/requests/rq-5', false, '2026-08-16T10:00:00Z'),
  ('nt-10', 'pt-ananya', 'Follow-up', 'Ananya has shared an update about work with you.', 'You are listed as a trusted person for practical support.', 'Read the update and add an observation if useful.', '{trusted}', '/trusted', true, '2026-08-18T20:00:00Z');

insert into workflow_runs (id, patient_id, type, stakeholder, current_step, status, waiting_for, steps, started_at, updated_at) values
  ('wf-1', 'pt-ananya', 'Workplace accommodation', 'Employer', 'Employer review', 'Awaiting stakeholder', 'Anil Fernandes (Employer)',
   (select steps from requests where id = 'rq-1'), '2026-08-18T18:00:00Z', '2026-08-19T09:00:00Z'),
  ('wf-2', 'pt-ananya', 'Appointment preparation', 'Patient', 'Awaiting patient approval', 'Awaiting approval', 'Ananya Rao (Patient)',
   '[{"label":"Trigger received","state":"done","completedOn":"2026-08-17"},{"label":"Context retrieved","state":"done","completedOn":"2026-08-17"},{"label":"Brief drafted","state":"done","completedOn":"2026-08-17"},{"label":"Safety checked","state":"done","completedOn":"2026-08-17"},{"label":"Patient approval","state":"current"},{"label":"Shared with clinician","state":"todo"}]'::jsonb,
   '2026-08-17T11:00:00Z', '2026-08-17T11:30:00Z'),
  ('wf-3', 'pt-ananya', 'Strategy adaptation', 'Patient + Psychologist', 'Human review', 'Awaiting professional review', 'Dr Kavita Nair (Psychologist)',
   '[{"label":"Outcome reported","state":"done","completedOn":"2026-08-18"},{"label":"Conflict detected","state":"done","completedOn":"2026-08-18"},{"label":"Human review","state":"current"},{"label":"Adaptation agreed","state":"todo"},{"label":"Memory updated","state":"todo"}]'::jsonb,
   '2026-08-18T19:00:00Z', '2026-08-18T19:10:00Z'),
  ('wf-4', 'pt-ananya', 'Document ingestion', 'Patient', 'Extracting', 'Blocked', 'Mock document service (simulated timeout)',
   '[{"label":"Uploaded","state":"done","completedOn":"2026-08-14"},{"label":"Analysing","state":"done","completedOn":"2026-08-14"},{"label":"Extracting","state":"current","detail":"Mock endpoint returned no response."},{"label":"Patient review","state":"todo"},{"label":"Saved","state":"todo"}]'::jsonb,
   '2026-08-14T15:00:00Z', '2026-08-14T15:05:00Z'),
  ('wf-5', 'pt-farida', 'Accommodation request', 'University', 'Clarification requested', 'Awaiting information', 'Farida Qureshi (Patient)',
   (select steps from requests where id = 'rq-5'), '2026-08-12T09:00:00Z', '2026-08-17T14:00:00Z'),
  ('wf-6', 'pt-ananya', 'Escalation — clinician routing', 'Psychiatrist', 'Routed for clinical review', 'Escalated', 'Dr Arun Deshpande (Psychiatrist)',
   '[{"label":"Question received","state":"done","completedOn":"2026-08-16"},{"label":"Out-of-scope detected","state":"done","completedOn":"2026-08-16"},{"label":"Clinician routing","state":"current"},{"label":"Clinician response","state":"todo"}]'::jsonb,
   '2026-08-16T20:00:00Z', '2026-08-16T20:05:00Z');

insert into audit_log (id, occurred_at, actor_id, actor_label, actor_role, patient_id, action, record, access_type, why, result, workflow_run_id) values
  ('au-1', '2026-08-19T09:12:00Z', 'u-anil', 'Anil Fernandes', 'employer', 'pt-ananya', 'Viewed accommodation request rq-1', 'Request rq-1 (authorised scope only)', 'Read', 'Employer review step', 'Allowed', 'wf-1'),
  ('au-2', '2026-08-19T09:14:00Z', 'u-anil', 'Anil Fernandes', 'employer', 'pt-ananya', 'Attempted to open clinical document doc-1', 'Document doc-1', 'Read', 'Not within employer scope', 'Denied', null),
  ('au-3', '2026-08-18T18:40:00Z', 'u-ananya', 'Ananya Rao', 'patient', 'pt-ananya', 'Approved disclosure to employer', 'Disclosure ds-1', 'Approve', 'Accommodation request', 'Allowed', 'wf-1'),
  ('au-4', '2026-08-18T18:39:00Z', null, 'ORCA Safety agent', 'admin', 'pt-ananya', 'Excluded clinical content from outbound draft', 'Request rq-1 draft', 'Write', 'Recipient scope: employer', 'Allowed', 'wf-1'),
  ('au-5', '2026-08-18T12:02:00Z', 'u-kavita', 'Dr Kavita Nair', 'psychologist', 'pt-ananya', 'Viewed patient overview', 'Patient pt-ananya', 'Read', 'Session preparation', 'Allowed', null),
  ('au-6', '2026-08-16T21:30:00Z', 'u-ananya', 'Ananya Rao', 'patient', 'pt-ananya', 'Signed in', 'Session', 'Login', 'Password', 'Allowed', null),
  ('au-7', '2026-08-14T10:05:00Z', 'u-sana', 'Sana Kulkarni', 'ot', 'pt-ananya', 'Added environment observation', 'Event ev-10', 'Write', 'Workplace visit', 'Allowed', null),
  ('au-8', '2026-08-10T08:55:00Z', 'u-ananya', 'Ananya Rao', 'patient', 'pt-ananya', 'Revoked draft access for a previous employer contact', 'Connection cn-7', 'Revoke', 'No longer required', 'Allowed', null);

insert into tasks (id, patient_id, title, detail, due_on, for_roles, status) values
  ('tk-1', 'pt-ananya', 'Session note for 28 July is signed — strategy review note outstanding', 'Add the strategy review outcome before the 25 August session.', '2026-08-24', '{psychologist}', 'In progress'),
  ('tk-2', 'pt-rohan', 'First-session summary not yet drafted', 'Session held 19 August.', '2026-08-20', '{psychologist}', 'Draft'),
  ('tk-3', 'pt-ananya', 'Confirm quiet-room booking process with facilities', 'Room was occupied at the second check-in.', '2026-08-22', '{ot}', 'Active'),
  ('tk-4', 'pt-farida', 'Answer university clarification', 'Accessibility office asked whether extra time applies to all assessments.', '2026-08-21', '{psychologist,university}', 'Awaiting information');

insert into session_notes (id, patient_id, professional_id, held_on, status, observations, patient_report, goals, actions) values
  ('sn-1', 'pt-ananya', 'u-kavita', '2026-07-28', 'Signed',
   'Described transitions at work in functional terms. Able to identify the difference between planned and unplanned change without prompting.',
   'Reported losing working time after unplanned meetings, and catching up in the evening.',
   '{"Reduce lost working time after schedule changes"}',
   '{"Trial written advance notice for four weeks","Review on 25 August"}'),
  ('sn-2', 'pt-ananya', 'u-kavita', '2026-06-23', 'Signed',
   'Discussed the change of role in March and the shift to sprint-based scheduling.',
   'Reported that the new role has more unscheduled contact than the previous one.',
   '{"Understand which parts of the new role are difficult"}',
   '{"Keep a note of changes for four weeks"}');
