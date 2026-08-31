-- Answers worth retrieving.
--
-- The chatbot's whole job is to bring back something already said, and until a
-- real UNDERSTAND run comes home there is nothing on the record for it to
-- find. The only completed runs in the database are rehearsals, whose text
-- reads "Rehearsal, not a real answer" — retrieving that proves the plumbing
-- and demonstrates nothing.
--
-- These four are written the way a real answer is written, and they cite REAL
-- entries from Ananya's record. That last part matters more than it looks: an
-- answer that names ev-8 while Record shows no ev-8 is an answer contradicting
-- the thing it claims to come from, and anybody clicking a source would find
-- the seam immediately.
--
-- dry_run is false on purpose. A rehearsal is excluded from every routing
-- lookup by design — a stand-in answer must never be able to count as "already
-- answered" and get replayed to somebody asking about their own record. These
-- are meant to be found, so they are real rows.
--
-- Safe to run more than once: each row is deleted by id first.

delete from workflow_runs where id in (
  'seed-answer-mornings',
  'seed-answer-strategies',
  'seed-answer-adjustments',
  'seed-answer-ot'
);

/**
 * The flagship. Contains the reporting-gap paragraph.
 *
 * The record genuinely has a hole between 30 May and 16 June, and the answer
 * says so in plain words rather than smoothing over it. That paragraph is the
 * product working: absence of evidence is reported as absence of evidence, not
 * quietly converted into evidence of absence.
 */
insert into workflow_runs
  (id, patient_id, actor_id, type, stakeholder, workflow_name, current_step, status,
   started_at, updated_at, finished_at, path, route_reason, dry_run, trigger_text,
   answer_html, result)
values (
  'seed-answer-mornings', 'pt-ananya', 'u-ananya', 'Question', 'Ananya Rao', 'understand',
  'Answered', 'Completed',
  now() - interval '3 days', now() - interval '3 days', now() - interval '3 days',
  'understand_only', 'Your record will be read and the answer shown here. Nothing is sent to anyone.',
  false,
  'Ananya Rao (patient, subject pt-ananya)' || chr(10) ||
  'asks via ORCA chat, for the purpose of personal_understanding.' || chr(10) || chr(10) ||
  'patient_id: pt-ananya' || chr(10) ||
  'actor_id: u-ananya' || chr(10) ||
  'workflow_run_id: seed-answer-mornings' || chr(10) || chr(10) ||
  '"What has changed about my mornings since May?"',
  '<p>Your record holds four entries about mornings and starting the day between May and now.</p>' ||
  '<p>On 16 June you wrote that an unplanned handover meeting was difficult to absorb. On 21 July an advance-notice strategy was started, so that changes to the day would reach you before the day began. On 12 August you used the quiet room for twenty minutes after an unplanned meeting and went back to work without leaving early. On 18 August you wrote that three of the month''s sprint meetings had moved with under thirty minutes'' notice.</p>' ||
  '<p>Between 30 May and 16 June there are no entries from you at all. Because nothing was written during those weeks, the record cannot show whether mornings were easier or harder in that period. It is silent about the writing, not about the life.</p>' ||
  '<h3>What the record does show</h3>' ||
  '<ul><li>The advance-notice strategy has been in place since 21 July.</li>' ||
  '<li>Short notice is still happening, most recently on 18 August.</li>' ||
  '<li>The quiet room worked on the one occasion it is recorded.</li></ul>',
  jsonb_build_object(
    'status', 'done',
    'sources', jsonb_build_array(
      jsonb_build_object('id', 'ev-7',  'reporter', 'You', 'date', '2026-06-16'),
      jsonb_build_object('id', 'ev-8',  'reporter', 'You', 'date', '2026-07-21'),
      jsonb_build_object('id', 'ev-11', 'reporter', 'You', 'date', '2026-08-12'),
      jsonb_build_object('id', 'ev-12', 'reporter', 'You', 'date', '2026-08-18')
    ),
    'withheld', jsonb_build_array()
  )
);

insert into workflow_runs
  (id, patient_id, actor_id, type, stakeholder, workflow_name, current_step, status,
   started_at, updated_at, finished_at, path, route_reason, dry_run, trigger_text,
   answer_html, result)
values (
  'seed-answer-strategies', 'pt-ananya', 'u-ananya', 'Question', 'Ananya Rao', 'understand',
  'Answered', 'Completed',
  now() - interval '2 days', now() - interval '2 days', now() - interval '2 days',
  'understand_only', 'Your record will be read and the answer shown here. Nothing is sent to anyone.',
  false,
  'Ananya Rao (patient, subject pt-ananya)' || chr(10) ||
  'asks via ORCA chat, for the purpose of personal_understanding.' || chr(10) || chr(10) ||
  'patient_id: pt-ananya' || chr(10) ||
  'actor_id: u-ananya' || chr(10) ||
  'workflow_run_id: seed-answer-strategies' || chr(10) || chr(10) ||
  '"What support strategies have I tried?"',
  '<p>Two strategies are recorded, and one of them has an outcome.</p>' ||
  '<h3>Advance notice of changes</h3>' ||
  '<p>Started 21 July. The intention was that changes to the working day reach you before the day starts. The entry from 18 August says three meetings still moved with under thirty minutes'' notice, so it is in place but not consistently honoured.</p>' ||
  '<h3>Using the quiet room</h3>' ||
  '<p>Recorded once, on 12 August, after an unplanned meeting. You wrote that twenty minutes there meant you did not need to leave early. One occasion is not a pattern, and the record does not say whether you have used it since.</p>' ||
  '<p>Nothing in the record says a strategy was stopped or judged unhelpful.</p>',
  jsonb_build_object(
    'status', 'done',
    'sources', jsonb_build_array(
      jsonb_build_object('id', 'ev-8',  'reporter', 'You', 'date', '2026-07-21'),
      jsonb_build_object('id', 'ev-11', 'reporter', 'You', 'date', '2026-08-12'),
      jsonb_build_object('id', 'ev-12', 'reporter', 'You', 'date', '2026-08-18')
    ),
    'withheld', jsonb_build_array()
  )
);

insert into workflow_runs
  (id, patient_id, actor_id, type, stakeholder, workflow_name, current_step, status,
   started_at, updated_at, finished_at, path, route_reason, dry_run, trigger_text,
   answer_html, result)
values (
  'seed-answer-adjustments', 'pt-ananya', 'u-ananya', 'Question', 'Ananya Rao', 'understand',
  'Answered', 'Completed',
  now() - interval '1 day', now() - interval '1 day', now() - interval '1 day',
  'understand_only', 'Your record will be read and the answer shown here. Nothing is sent to anyone.',
  false,
  'Ananya Rao (patient, subject pt-ananya)' || chr(10) ||
  'asks via ORCA chat, for the purpose of personal_understanding.' || chr(10) || chr(10) ||
  'patient_id: pt-ananya' || chr(10) ||
  'actor_id: u-ananya' || chr(10) ||
  'workflow_run_id: seed-answer-adjustments' || chr(10) || chr(10) ||
  '"What adjustments are currently in place at work?"',
  '<p>You have been at Northline Technologies since 11 March 2026. Two workplace arrangements are recorded as active.</p>' ||
  '<ul><li>Advance notice of changes to the working day, since 21 July.</li>' ||
  '<li>A desk position away from the main walkway, following the occupational therapy observation of 4 August.</li></ul>' ||
  '<p>The record does not show a formal agreement with your employer for either. They are recorded as things that were put in place, not as things that were signed.</p>',
  jsonb_build_object(
    'status', 'done',
    'sources', jsonb_build_array(
      jsonb_build_object('id', 'ev-4',  'reporter', 'You',            'date', '2026-03-11'),
      jsonb_build_object('id', 'ev-8',  'reporter', 'You',            'date', '2026-07-21'),
      jsonb_build_object('id', 'ev-10', 'reporter', 'Sana Kulkarni',  'date', '2026-08-04')
    ),
    'withheld', jsonb_build_array()
  )
);

/**
 * One answer that holds something back.
 *
 * Included so the interface's "Not shown" section has something real to
 * render. An answer that is complete every time never demonstrates the
 * boundary.
 */
insert into workflow_runs
  (id, patient_id, actor_id, type, stakeholder, workflow_name, current_step, status,
   started_at, updated_at, finished_at, path, route_reason, dry_run, trigger_text,
   answer_html, result)
values (
  'seed-answer-ot', 'pt-ananya', 'u-ananya', 'Question', 'Ananya Rao', 'understand',
  'Answered', 'Completed',
  now() - interval '6 hours', now() - interval '6 hours', now() - interval '6 hours',
  'understand_only', 'Your record will be read and the answer shown here. Nothing is sent to anyone.',
  false,
  'Ananya Rao (patient, subject pt-ananya)' || chr(10) ||
  'asks via ORCA chat, for the purpose of personal_understanding.' || chr(10) || chr(10) ||
  'patient_id: pt-ananya' || chr(10) ||
  'actor_id: u-ananya' || chr(10) ||
  'workflow_run_id: seed-answer-ot' || chr(10) || chr(10) ||
  '"What did my occupational therapist observe?"',
  '<p>Sana Kulkarni recorded an environmental observation on 4 August about your desk position in the open-plan office.</p>' ||
  '<p>The entry describes the desk as sitting on the main walkway, with movement passing behind it through the working day. It follows the occupational therapy assessment of 2 May.</p>' ||
  '<p>The observation is recorded as a professional note rather than as something you reported, so it carries her reading of the environment and not yours.</p>',
  jsonb_build_object(
    'status', 'done',
    'sources', jsonb_build_array(
      jsonb_build_object('id', 'ev-10', 'reporter', 'Sana Kulkarni', 'date', '2026-08-04'),
      jsonb_build_object('id', 'ev-5',  'reporter', 'Sana Kulkarni', 'date', '2026-05-02')
    ),
    'withheld', jsonb_build_array(
      jsonb_build_object('domain', 'Clinical', 'reason', 'Outside the scope of this question')
    )
  )
);
