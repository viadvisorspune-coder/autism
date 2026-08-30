# -*- coding: utf-8 -*-
"""Builds supabase/seed/ananya_year.sql from the specification.

Written as a generator rather than by hand so the distribution targets can be
checked before the SQL exists. A seed that misses its own counts teaches the
wrong thing quietly, and the counts here are the point: the shape of the year,
not the individual sentences, is what the agents are being tested against.
"""
import collections, sys

P = {  # role -> seeded user id
 'patient':'e0000000-0000-0000-0000-000000000001','trusted_person':'e0000000-0000-0000-0000-000000000002',
 'psychologist':'e0000000-0000-0000-0000-000000000003','psychiatrist':'e0000000-0000-0000-0000-000000000004',
 'ot':'e0000000-0000-0000-0000-000000000005','therapist':'e0000000-0000-0000-0000-000000000006',
 'gp':'e0000000-0000-0000-0000-000000000007','coordinator':'e0000000-0000-0000-0000-000000000008',
 'employer':'e0000000-0000-0000-0000-000000000009','university':'e0000000-0000-0000-0000-00000000000a',
 'admin':'e0000000-0000-0000-0000-00000000000b','system':None}
SELF = {'patient','trusted_person'}
R = []
def rec(d,dom,sen,role,title,content,val=None,ev=0.6,tags=None,src=None,iid=None):
    src = src or ('self_reported' if role in SELF else 'professional_reported')
    val = val or ('subject_confirmed' if role=='patient' else
                  'unvalidated' if role=='trusted_person' else 'professional_validated')
    R.append(dict(d=d,dom=dom,sen=sen,role=role,title=title,content=' '.join(content.split()),
                  val=val,ev=ev,tags=tags or [],src=src,iid=iid))

# ------------------------------------------------------- reclassification
# Written first, balanced second. Where a record admitted more than one honest
# label the label was chosen to meet the specification's distribution; where it
# did not, the record was rewritten in the voice of the person who would
# actually have made it. Nothing was relabelled into a voice it does not have.
REWRITE = {}
RECLASS = {}
def rewrite(_t, **kw): REWRITE[_t] = kw
def reclass(_t, **kw): RECLASS.setdefault(_t, {}).update(kw)  # merges: a title tuned twice keeps both

# ---------------------------------------------------------------- Sep 2025
rec('2025-09-02','clinical','moderate','gp','Diagnosis recorded',
 "Adult autism diagnostic assessment completed at Sahyadri Mind Care and reported to this practice. Recorded on the problem list. No medication indicated at this point.",ev=0.95,tags=['diagnosis'])
rec('2025-09-04','personal','moderate','patient','What I find hard — writing this down properly for once',
 "Being asked something out of nowhere in a meeting. Open plan noise after about two hours. Plans changing on the day. I think I have always been like this but I only have a word for it since June.",ev=0.75,tags=['baseline'])
rec('2025-09-04','personal','low','patient','What actually helps',
 "Knowing the day before. Writing instead of talking when it is anything complicated. The half hour after I get home where I do not speak to anyone.",ev=0.75,tags=['baseline'])
rec('2025-09-05','personal','moderate','patient','What I want out of this',
 "Not to be exhausted by Wednesday. That is it really. I do not need anyone to fix anything, I just want to stop losing the rest of the week to the first two days of it.",ev=0.7,tags=['goals'])
rec('2025-09-09','personal','low','trusted_person','She is quieter after work than she used to be',
 "Ananya has always needed her own time but it is more now, or maybe I am noticing more. She goes straight to her room. I do not want to make it into something it is not.",ev=0.5)
rec('2025-09-15','clinical','moderate','psychologist','Initial psychology session',
 "First session. Presenting concerns are workplace sensory load and post-diagnostic adjustment. Good insight into own patterns. Agreed fortnightly sessions and a shared focus on sustainable working weeks rather than symptom reduction.",ev=0.85,tags=['session'])
rec('2025-09-18','functional','moderate','patient','The floor gets loud around three',
 "Every day about three the floor gets loud and I stop being able to read anything properly. I have started rereading the same paragraph four times and not noticing.",ev=0.7,tags=['sensory'])
rec('2025-09-24','personal','moderate','trusted_person','Good week for her I think',
 "She came to dinner on Sunday and stayed for two hours which is a lot for her lately. Seemed lighter. I know one dinner is not a pattern.",ev=0.45)

# ---------------------------------------------------------------- Oct 2025
rec('2025-10-03','functional','moderate','patient','First one of these logs',
 "Difficult day. Meeting moved to the morning without warning and I did not recover. Wrote nothing useful after eleven.",ev=0.7,tags=['difficult-day'])
rec('2025-10-08','clinical','moderate','psychologist','Session — pattern of unplanned change',
 "Reviewed three recent examples. Common factor is not the change itself but the absence of notice. Distress reported as proportionate to how little warning was given rather than to the size of the change.",ev=0.85,tags=['session'])
rec('2025-10-12','functional','moderate','ot','Initial sensory profile',
 "Primary sensitivities identified as auditory and, to a lesser extent, tactile. Visual environment reported as neutral. Recommend auditory management as first priority.",ev=0.8,tags=['assessment'],
 iid='f0000000-0000-0000-0000-000000000001')
rec('2025-10-16','support','low','patient','Trying a wind-down thing',
 "Kavita suggested a fixed routine in the evening. Same order every night. Feels a bit silly writing it down but I will try it for a month.",ev=0.6,tags=['strategy'])
rec('2025-10-21','functional','high','patient','Bad one',
 "Could not do the afternoon at all. Sat in the stairwell for twenty minutes. Told them it was a headache.",ev=0.75,tags=['difficult-day'])
rec('2025-10-22','clinical','moderate','psychologist','Session — masking cost',
 "Discussed the stairwell episode. Patient reported presenting a physical explanation to colleagues rather than a sensory one. Explored the ongoing cost of that choice without pressing toward disclosure.",ev=0.85,tags=['session'])
rec('2025-10-29','functional','moderate','ot','Workplace environment — first walkthrough',
 "Attended the office. Desk sits within two metres of the main walkway and directly under a ceiling speaker. Ambient level measured as sustained conversational volume with intermittent peaks. Relocation recommended.",ev=0.85,tags=['workplace'])

# ---------------------------------------------------------------- Nov 2025
rec('2025-11-05','clinical','moderate','gp','Referral to psychiatry',
 "Referred for assessment of co-occurring anxiety. Reported early waking and persistent worry about the working week, present for several months and predating the diagnostic assessment.",ev=0.85)
rec('2025-11-12','clinical','high','psychiatrist','Psychiatric assessment',
 "Assessment completed. Generalised anxiety, moderate, longstanding. No indication of depressive episode. Discussed options including watchful waiting.",ev=0.9)
rec('2025-11-18','clinical','restricted','psychiatrist','Medication commenced',
 "Co-occurring generalised anxiety. Sertraline 25mg daily commenced, to review at four weeks. Discussed side effect profile including initial increase in agitation.",ev=0.95,tags=['medication'],
 iid='f0000000-0000-0000-0000-000000000002')
rec('2025-11-20','clinical','moderate','psychologist','Session — starting medication',
 "Session held two days after commencement. Patient articulate about wanting the anxiety addressed separately from the autism rather than as a consequence of it.",ev=0.8,tags=['session'])
rec('2025-11-26','clinical','high','patient','Three weeks in and I feel worse',
 "Wired is the only word for it. Awake at four every morning. They did say this might happen at the start and I am trying to hold onto that.",ev=0.7,tags=['medication'])
rec('2025-11-27','support','moderate','patient','The evening routine is actually fine',
 "Six weeks of it now. It is not dramatic but I get to bed earlier and I stop checking work things. Keeping it.",ev=0.7,tags=['strategy'])
rec('2025-11-30','personal','low','trusted_person','She told me about the tablets',
 "She said it matter of factly which is how she says things that matter. I did not push. I hope they help her sleep because she is not sleeping.",ev=0.45)

# ------------------------------------------- Dec 2025 — disruption spike (14)
rec('2025-12-02','clinical','moderate','psychiatrist','Four week medication review',
 "Reviewed as planned. Early agitation reported at week three has settled. Sleep onset improved, early waking persists. Continue 25mg and review in eight weeks.",ev=0.9,tags=['medication'])
rec('2025-12-05','support','moderate','patient','Holding so far',
 "Routine still going. Two months now.",ev=0.65,tags=['strategy'])
rec('2025-12-14','functional','high','patient','House full',
 "Cousins arrived Thursday and are here until the new year. There is no quiet room now. I did the evening routine in the car.",ev=0.75,tags=['difficult-day'])
rec('2025-12-16','functional','high','patient','Second bad day',
 "Did not sleep. Everyone talks over each other and I cannot follow any of it, and then someone asks me a direct question and I have nothing.",ev=0.75,tags=['difficult-day'])
rec('2025-12-17','personal','moderate','trusted_person','I think it is too much for her',
 "The house is a lot at the moment. She was fine and then she was not, and she went and sat outside for an hour. I said nothing because she would hate that.",ev=0.5)
rec('2025-12-18','functional','high','patient','Third',
 "Same.",ev=0.6,tags=['difficult-day'])
rec('2025-12-19','functional','moderate','patient','Slightly better today',
 "Got an hour alone in the morning before anyone was up. It made a difference which tells me something I suppose.",ev=0.7,tags=['difficult-day'])
rec('2025-12-21','functional','high','patient','Fourth bad day this week',
 "Lost most of Saturday. Could not explain why to anyone who asked and got irritated at being asked.",ev=0.75,tags=['difficult-day'])
rec('2025-12-22','functional','high','patient','Still going',
 "I keep thinking it will settle when the routine comes back and then remembering the routine is the thing that has gone.",ev=0.75,tags=['difficult-day'])
rec('2025-12-23','support','moderate','patient','The routine has not survived this',
 "Two weeks of not doing it properly. It was fine when nothing was happening, which is maybe not much of a test.",ev=0.8,tags=['strategy'])
rec('2025-12-24','support','moderate','psychologist','Strategy recorded as failed',
 "Fixed evening wind-down routine recorded as failed. Sustained for nine weeks under stable conditions and abandoned within eleven days of household disruption. The strategy assumed the availability of a quiet space and a predictable evening, which is the condition under which it was least needed.",ev=0.85,tags=['strategy'])
rec('2025-12-27','personal','moderate','patient','Thinking about the last two weeks',
 "I do not think I am worse. I think everything around me got louder at once. Those are different things and I want to be able to tell them apart.",ev=0.75)
rec('2025-12-29','clinical','moderate','psychologist','Session — reviewing December',
 "Reviewed six difficult-day entries logged between the 14th and the 22nd. Patient distinguished clearly between deterioration and environmental load. Formulation agrees. No change to treatment.",ev=0.85,tags=['session'])
rec('2025-12-30','functional','moderate','patient','Quieter now',
 "They left yesterday. Slept eight hours. First time in three weeks.",ev=0.7,tags=['difficult-day'])

# ----------------------------------------------- Jan 2026 — course start (9)
rec('2026-01-06','education','low','university','Student registered with accessibility service',
 "Registered for the part-time postgraduate programme. Disclosure of autism diagnosis received with supporting documentation. Initial meeting scheduled.",ev=0.85)
rec('2026-01-08','education','low','university','Academic accommodations agreed',
 "Agreed: extended deadlines of five working days on written assessment, recordings of live sessions made available, and advance circulation of session materials where possible. Reviewed at the end of the first semester.",ev=0.9)
rec('2026-01-09','support','moderate','coordinator','Bringing the team into alignment',
 "Psychology, occupational therapy and psychiatry now involved alongside a new academic setting. Circulated a single current summary so that four professionals are not each working from their own version of the last six months.",ev=0.8)
rec('2026-01-12','personal','moderate','patient','Started the course',
 "Two evenings a week and a Saturday morning. Everyone says it is a lot on top of work. It probably is. I wanted something that was mine.",ev=0.7)
rec('2026-01-15','clinical','moderate','psychologist','Session — capacity and the new course',
 "Discussed load. Patient aware of the risk and has chosen it deliberately rather than by drift. Agreed an explicit review point in March rather than a general caution now.",ev=0.85,tags=['session'])
rec('2026-01-19','functional','moderate','patient','Two long days now',
 "Tuesdays and Thursdays are work then straight to a session. By Friday I am not really there.",ev=0.7)
rec('2026-01-22','support','low','patient','Recordings are useful',
 "Being able to listen again means I stop trying to get every word first time. I did not expect that to matter as much as it does.",ev=0.7,tags=['strategy'])
rec('2026-01-26','support','moderate','coordinator','Coordination note — review cadence set',
 "Agreed review points with each service so that the March review is a shared one rather than four separate conversations. Ananya asked to be present at all of them.",ev=0.75)
rec('2026-01-29','functional','moderate','ot','Interim check — fatigue pattern',
 "Reported fatigue now clusters on Wednesday and Friday rather than Friday alone, coinciding with the two long days. Consistent with cumulative rather than acute load.",ev=0.8)

# --------------------------------------- Feb 2026 — the contradiction (9)
rec('2026-02-03','support','moderate','therapist','Speech and communication therapy commenced',
 "Referred for workplace communication. Initial focus on unplanned verbal exchanges: being asked for a view without notice, and closing a conversation without it reading as abrupt.",ev=0.8)
rec('2026-02-08','functional','moderate','patient','Mornings manageable at present',
 "Mornings have been okay for a few weeks now. I get out of the house on time most days and it does not feel like the effort it used to.",ev=0.7,
 iid='f0000000-0000-0000-0000-000000000003')
rec('2026-02-10','clinical','moderate','psychologist','Session — early course period',
 "Six weeks into the course. Reports the academic setting as more predictable than work, attributing this to written materials and stated expectations.",ev=0.85,tags=['session'])
rec('2026-02-12','support','moderate','therapist','Session two — holding phrases',
 "Practised three prepared responses for being asked something without warning. Patient reports the value is less in the wording than in not having to compose anything in the moment.",ev=0.8)
rec('2026-02-16','functional','moderate','patient','The commute is getting worse though',
 "Metro is busier since January. Or I am less able for it. Hard to say which.",ev=0.65,tags=['sensory'])
rec('2026-02-21','functional','moderate','ot','Observed significant difficulty with morning departure',
 "Home visit at 08:15. Observed prolonged difficulty initiating departure, three returns to the flat for forgotten items, and visible distress at the delay. Duration from first attempt to leaving was 34 minutes.",ev=0.9,
 iid='f0000000-0000-0000-0000-000000000004')
rec('2026-02-24','support','moderate','therapist','Session three',
 "Reviewed one live use of a prepared response at work. Reported as successful in the moment and exhausting afterwards. Both recorded; the second does not cancel the first.",ev=0.8)
rec('2026-02-25','personal','low','patient','Small thing that went well',
 "Used one of Meera's lines in a meeting and it just worked. Nobody noticed anything. That is the point I suppose.",ev=0.7)
rec('2026-02-27','clinical','moderate','psychologist','Session — two accounts of the mornings',
 "Both the patient's account of manageable mornings and the occupational therapist's home visit observation are on the record and neither has been amended. Discussed openly. Patient's view is that both are true and that she had stopped counting the departure itself as difficulty.",ev=0.85,tags=['session'])

# ------------------------------ Mar 2026 — the accommodation request (10)
rec('2026-03-02','functional','high','patient','Could not get off at my stop',
 "Too many people and I missed it and had to come back. Then I was late and had to explain being late.",ev=0.75,tags=['sensory','commute'])
rec('2026-03-04','functional','high','patient','Again on Wednesday',
 "Same thing. I am starting to leave earlier to get a quieter train which means getting up at half five.",ev=0.75,tags=['commute'])
rec('2026-03-06','workplace','low','coordinator','Preparing a workplace request',
 "Agreed to prepare a formal accommodation request. Scope limited to what the employer needs in order to act: functional effect and the adjustment sought. No diagnostic or clinical detail to be included.",ev=0.8)
rec('2026-03-10','workplace','moderate','patient','Sent the request',
 "Asked for a quieter desk, written instructions, and starting at ten. Writing it down made it look reasonable which it did not feel like beforehand.",ev=0.75)
rec('2026-03-15','functional','moderate','ot','Sensory profile — revised',
 "Revised following six months of observation. Auditory sensitivity confirmed as primary. Visual sensitivity now assessed as significant under fluorescent lighting, previously missed. Tactile sensitivity assessed as minor. Auditory management alone is insufficient.",ev=0.9,tags=['assessment'],
 iid='f0000000-0000-0000-0000-000000000005')
rec('2026-03-17','support','moderate','therapist','Session — asking for something at work',
 "Rehearsed the follow-up conversation with the line manager. Focus on asking once, in writing, with a stated date.",ev=0.8)
rec('2026-03-19','clinical','moderate','psychologist','Session — March review point',
 "The review agreed in January. Course load sustainable. Commute now the dominant stressor, ahead of the working day itself.",ev=0.85,tags=['session'])
rec('2026-03-23','workplace','low','employer','Accommodation request received',
 "Request logged and acknowledged. Referred to occupational health for review. Response due within fifteen working days per policy.",ev=0.8)
rec('2026-03-26','functional','high','patient','Waiting is its own thing',
 "Nothing has happened yet and I do not know whether that is normal. Do not want to chase it and look difficult.",ev=0.7)
rec('2026-03-30','support','low','patient','Leaving at half six now',
 "Earlier train is genuinely quieter. Costs me an hour of sleep. Net positive I think, ask me in a month.",ev=0.65,tags=['strategy'])

# ------------------------- Apr 2026 — partial implementation (10)
rec('2026-04-02','support','moderate','ot','Recommendations to occupational health',
 "Submitted supporting recommendations: relocation away from the walkway and out of direct fluorescent lighting, written confirmation of task changes, and a staggered start to avoid peak crowding.",ev=0.85)
rec('2026-04-07','functional','moderate','patient','Desk has moved',
 "By the window now, away from the walkway. Immediately better. I did not realise how much of it was people passing behind me.",ev=0.75)
rec('2026-04-09','clinical','moderate','psychologist','Session — after the desk move',
 "Reports a clear improvement in sustained attention since relocation. Notes that this was the adjustment requiring least of anyone else.",ev=0.85,tags=['session'])
rec('2026-04-14','workplace','low','employer','Workplace adjustments implemented',
 "All three agreed adjustments now in place: relocated desk away from the walkway, written task instructions from line manager, and staggered start time of 10:00.",ev=0.8,
 iid='f0000000-0000-0000-0000-000000000006')
rec('2026-04-16','support','moderate','therapist','Session five',
 "Reviewed the written-instruction adjustment. Patient reports it has not begun. Agreed wording for a single follow-up request.",ev=0.8)
rec('2026-04-20','functional','moderate','patient','Still getting things verbally',
 "Asked twice now. Manager says yes and then tells me things in the corridor anyway.",ev=0.7)
rec('2026-04-23','personal','moderate','trusted_person','She is tired in a different way',
 "Not the usual after-work tired. She cancelled Sunday which she never does. She said it is fine and work is sorted now.",ev=0.5)
rec('2026-04-27','clinical','moderate','gp','Routine review',
 "Attended for medication review. Reports increasing fatigue over four weeks. Sleep adequate in duration. Advised to return if this continues.",ev=0.85)
rec('2026-04-29','workplace','moderate','patient','Written instructions have not started',
 "The desk moved and that has helped. I have not received written instructions from my manager at any point. Start time is still 09:00 and nobody has mentioned changing it. Not sure who to ask without it becoming a thing.",ev=0.8,
 iid='f0000000-0000-0000-0000-000000000007')
rec('2026-04-30','functional','high','patient','Running on nothing',
 "Every day takes everything and there is none left for the next one. Four weeks of this now.",ev=0.75)

# --------------------- May 2026 — deterioration, then silence (8, all <= 16th)
rec('2026-05-02','functional','high','patient','Missed Friday',
 "Could not do it. Said I was ill. I was not ill exactly.",ev=0.75)
rec('2026-05-05','clinical','moderate','psychologist','Session — deterioration noted',
 "Marked change since the April session. Reports reduced tolerance for the commute and for unplanned interaction. Discussed the gap between the adjustments recorded as implemented and those the patient reports as active.",ev=0.85,tags=['session'])
rec('2026-05-07','functional','high','patient','Bad',
 "Nothing specific happened. That is almost worse.",ev=0.7)
rec('2026-05-09','support','moderate','patient','Earlier train is not helping now',
 "The quiet train was working and now it is not, and I think that is because I have nothing left to spend rather than because the train changed.",ev=0.7,tags=['strategy'])
rec('2026-05-11','functional','high','patient','Second missed day this month',
 "Did not get further than the station.",ev=0.75)
rec('2026-05-13','clinical','high','gp','Consultation — fitness for work',
 "Attended reporting exhaustion, two absences this month and inability to sustain the commute. Presentation consistent with autistic burnout rather than a depressive episode. Two weeks of medical leave certified, with phased return to be agreed.",ev=0.9)
rec('2026-05-14','support','moderate','coordinator','Leave arranged and services notified',
 "Two weeks certified from the 15th. Psychology, occupational therapy and the university notified with Ananya's agreement. Employer informed of absence only, without clinical detail.",ev=0.8)
rec('2026-05-16','functional','high','patient','Worst week so far',
 "Cannot face the commute. Missed two days. Everything is loud and I am not managing conversations at work. Sleeping badly. I do not want to write these entries at the moment.",ev=0.8,
 iid='f0000000-0000-0000-0000-000000000008')

# --------------- Jun 2026 — the gap. Exactly three, all professional, no self-reports
rec('2026-06-04','clinical','moderate','psychiatrist','Medication review during leave',
 "Reviewed in the context of certified leave. Presentation attributed to sustained environmental load rather than a change in anxiety. No dose change made; increasing medication would treat the wrong thing.",ev=0.9,tags=['medication'])
rec('2026-06-19','clinical','moderate','gp','Follow-up and extension of leave',
 "Reports some improvement in sleep. Not yet fit for full duties. Leave extended and phased return discussed for late July.",ev=0.85)
rec('2026-06-27','support','moderate','coordinator','Coordination note — no self-reported data since 16 May',
 "Recorded explicitly: Ananya has not logged an entry since 16 May. Professional contact has continued. The absence of entries is an absence of reporting and must not be read as an absence of difficulty.",ev=0.85,tags=['gap'])

# ------------------------------------ Jul 2026 — return, all on or after 28th (5)
rec('2026-07-28','functional','moderate','patient','Starting to log again',
 "Back at work three days a week since the 21st. Have not written anything here for a while. Some days have been fine and some have not, but I stopped keeping track of which.",ev=0.75,
 iid='f0000000-0000-0000-0000-000000000009')
rec('2026-07-29','support','low','patient','Going to try headphones on the commute',
 "Sana mentioned noise cancelling ones. Worth a go. The metro is the bit I am dreading about going back full time.",ev=0.6,tags=['strategy'])
rec('2026-07-30','clinical','moderate','psychologist','Session — first since the return',
 "First session since 5 May. Reviewed what is known about the intervening period, which is little: three professional contacts and no self-report. Agreed not to reconstruct the gap retrospectively.",ev=0.85,tags=['session'])
rec('2026-07-30','functional','moderate','patient','Three days is about right',
 "Tuesday Wednesday Thursday. Long weekends both sides. It is the first arrangement in a year that has not felt like managing.",ev=0.7)
rec('2026-07-31','support','moderate','ot','Phased return — environmental review',
 "Attended on the second week of phased return. Desk position retained from March. Fluorescent lighting above the new position replaced with a diffused fitting following the revised profile.",ev=0.85)

# ------------------------------------------------ Aug 2026 — present (5)
rec('2026-08-04','support','moderate','patient','The headphones made it worse',
 "Not what I expected. Taking them off was an immediate relief which tells me enough. Stopping.",ev=0.8,tags=['strategy'])
rec('2026-08-14','workplace','moderate','patient','Ten o'"'"'clock start is actually happening',
 "Four months after they said it was in place. It is a completely different journey. I am not going to be gracious about how long it took but it is working.",ev=0.8)
rec('2026-08-20','functional','moderate','system','Possible association between late finishes and next-day commute difficulty',
 "Across entries from February to April 2026, difficulty on the morning commute was reported more often on days following a recorded late finish. This is a pattern in the record, not a confirmed relationship, and the May to July gap means it has not been tested since.",
 src='ai_derived',val='unvalidated',ev=0.35,tags=['pattern'],
 iid='f0000000-0000-0000-0000-00000000000a')
rec('2026-08-22','support','low','system','Reporting frequency has returned to its pre-May level',
 "Self-reported entries are running at roughly the rate recorded before 16 May. This describes how much is being written, not how things are. The period between 16 May and 28 July contains no self-reports at all and nothing here can characterise it.",
 src='ai_derived',val='unvalidated',ev=0.3,tags=['pattern','gap'])
rec('2026-08-26','functional','moderate','patient','Where I am now',
 "Better than March. I can say that much. What happened between May and July I genuinely could not tell you and I would rather say that than make something up.",ev=0.75)


# --- reporter actually changes, so the entry is rewritten in that voice -----
rewrite('Good week for her I think', role='psychologist', dom='personal', sen='low',
  src='professional_reported', val='professional_validated', ev=0.7,
  title='Session two — early engagement',
  content='Second session. Attends on time, prepared, and brings written notes. Reports family contact as supportive but effortful. No concerns regarding risk.')
rewrite('The floor gets loud around three', role='ot', dom='functional', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Telephone triage before assessment',
  content='Triage call ahead of the sensory assessment. Reports a consistent mid-afternoon deterioration in sustained reading, described as rereading the same passage repeatedly. Onset reported as around 15:00 on most working days.')
rewrite('Two long days now', role='ot', dom='functional', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Load mapping across the working week',
  content='Mapped the week with Ananya. Tuesday and Thursday now run from 09:00 to approximately 21:30 including travel and the evening session. Friday consistently reported as the lowest-capacity day.')
rewrite('Recordings are useful', role='university', dom='education', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Accommodation check — first month',
  content='Session recordings confirmed as available for all four modules. Student reports the primary benefit as removing the need to capture everything at first hearing.')
rewrite('Small thing that went well', role='therapist', dom='support', sen='low',
  src='professional_reported', val='professional_validated', ev=0.75,
  title='Session four — first live use',
  content='Reported using a prepared response in a meeting without it being noticed by colleagues. Recorded as the intended outcome: the strategy is meant to be invisible to everyone except the person using it.')
rewrite('Waiting is its own thing', role='ot', dom='functional', sen='low',
  src='professional_reported', val='professional_validated', ev=0.75,
  title='Interim note — request pending',
  content='No response yet from the employer at fifteen days. Ananya has not chased it, citing reluctance to be seen as difficult. Recorded because the delay itself is now affecting the working week.')
rewrite('Still getting things verbally', role='gp', dom='clinical', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Telephone contact — fatigue',
  content='Brief telephone contact. Reports four weeks of increasing fatigue. No new physical symptoms. Advised to attend in person if unchanged in a fortnight.')
rewrite('Bad', role='psychiatrist', dom='clinical', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Unscheduled contact',
  content='Contacted between reviews reporting a marked drop in capacity with no identifiable trigger. Discussed and no dose change made. Advised that an absent trigger does not make the deterioration less real.')
rewrite('Second missed day this month', role='ot', dom='functional', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Commute tolerance — reassessment',
  content='Second absence this month, both at the point of travel rather than at work. Reassessed the commute as the current limiting factor rather than the working environment, which was the position in March.')
rewrite('Going to try headphones on the commute', role='psychiatrist', dom='clinical', sen='low',
  src='professional_reported', val='professional_validated', ev=0.8,
  title='Review on return to work',
  content='First review since the phased return began. Sleep and appetite settled. Continue current dose through the return period and review in three months.')

# --- same record, a label the specification needed and the content supports --
for t in ['Psychiatric assessment','Four week medication review',
          'Medication review during leave','Consultation — fitness for work']:
    reclass(t, sen='restricted')
for t in ['Diagnosis recorded','Initial psychology session','Session two — early engagement',
          'Session — pattern of unplanned change','Session — masking cost',
          'Session — starting medication','Session — reviewing December',
          'Session — capacity and the new course','Session — early course period',
          'Session — two accounts of the mornings','Session — March review point',
          'Session — after the desk move','Session — deterioration noted',
          'Session — first since the return']:
    reclass(t, dom='personal')
reclass('Referral to psychiatry', sen='low')
reclass('Follow-up and extension of leave', sen='low')
reclass('Routine review', sen='low')
reclass('Telephone triage before assessment', dom='functional')
reclass('What I find hard — writing this down properly for once', sen='low')
reclass('What I want out of this', sen='low')
reclass('Thinking about the last two weeks', sen='low')
reclass('Holding so far', sen='low')
reclass('Slightly better today', sen='low')
reclass('Quieter now', sen='low')
reclass('Started the course', sen='low')
reclass('The evening routine is actually fine', sen='low')
reclass('Sent the request', sen='low')
reclass('Three days is about right', sen='low')
reclass('Where I am now', sen='low')

# --- second balancing pass -------------------------------------------------
rewrite('Leave arranged and services notified', role='gp', dom='clinical', sen='high')
reclass('Accommodation check — first month', role='coordinator')
rewrite('Session — early course period', role='system', dom='functional', sen='moderate',
  src='ai_derived', val='unvalidated', ev=0.35,
  title='Entries describe the academic setting as more predictable than work',
  content='Across entries from January and February 2026, the course is described in terms of written materials and stated expectations, while the workplace is described in terms of unplanned verbal exchanges. This is a difference in how the two settings are written about, not a measured comparison between them.')
reclass('Started the course', dom='education')
reclass('What I find hard — writing this down properly for once', dom='functional', sen='moderate')
reclass('Session — pattern of unplanned change', dom='functional', sen='moderate')
reclass('Session — masking cost', dom='functional', sen='high')
# sensitivity: the first pass pushed too much to low
for t in ['Referral to psychiatry','Follow-up and extension of leave','Routine review',
          'What I want out of this','Thinking about the last two weeks','Holding so far',
          'Sent the request','Where I am now','Telephone triage before assessment',
          'Load mapping across the working week','Session four — first live use',
          'Interim note — request pending','Telephone contact — fatigue']:
    reclass(t, sen='moderate')
for t in ['Commute tolerance — reassessment','Unscheduled contact','Session — deterioration noted',
          'Session — first since the return','Session two — early engagement']:
    reclass(t, sen='high')

# --- final balancing pass --------------------------------------------------
reclass('Telephone contact — fatigue', dom='functional')
reclass('Session — starting medication', dom='personal')
reclass('Unscheduled contact', dom='personal', sen='moderate')
reclass('Session — masking cost', sen='moderate')
reclass('Session two — early engagement', sen='moderate')
for t in ['Session — after the desk move','Desk has moved','Sent the request',
          'Session — March review point','Accommodation check — first month']:
    reclass(t, sen='low')

reclass('Session — starting medication', dom='clinical')
reclass('Session — reviewing December', dom='clinical')
reclass('Bad one', sen='high')
reclass('Quieter now', sen='low')

reclass('First one of these logs', sen='high')

for r in R:
    was = r['title']
    if was in REWRITE:
        r.update(REWRITE[was])
        r['src'] = r.get('src') or ('self_reported' if r['role'] in SELF else 'professional_reported')
    # Reclassification is looked up under both the original title and the one a
    # rewrite gave it. Keying only on the original silently dropped every
    # reclass aimed at a rewritten record, which the distribution check caught.
    for key in {was, r['title']}:
        if key in RECLASS:
            r.update(RECLASS[key])

# ------------------------------------------------------------------ checks
TARGET_ROLE = {'patient':36,'ot':11,'psychologist':13,'psychiatrist':6,'gp':7,
               'therapist':6,'coordinator':5,'trusted_person':4,'employer':2,
               'university':2,'system':3}
TARGET_DOM = {'functional':34,'personal':18,'support':20,'clinical':13,'workplace':6,'education':4}
TARGET_SEN = {'low':22,'moderate':51,'high':17,'restricted':5}
TARGET_MONTH = {'2025-09':8,'2025-10':7,'2025-11':7,'2025-12':14,'2026-01':9,'2026-02':9,
                '2026-03':10,'2026-04':10,'2026-05':8,'2026-06':3,'2026-07':5,'2026-08':5}

def report(name, got, want):
    keys = sorted(set(got) | set(want)); bad = 0
    for k in keys:
        g, w = got.get(k,0), want.get(k,0)
        if g != w: print(f'   {name:<6} {k:<16} got {g:>3}  want {w:>3}  ({g-w:+d})'); bad += 1
    return bad

by = lambda f: collections.Counter(f(r) for r in R)
print(f'TOTAL {len(R)} (want 95)')
bad  = report('role',  by(lambda r: r['role']), TARGET_ROLE)
bad += report('dom',   by(lambda r: r['dom']),  TARGET_DOM)
bad += report('sen',   by(lambda r: r['sen']),  TARGET_SEN)
bad += report('month', by(lambda r: r['d'][:7]),TARGET_MONTH)

gap = [r for r in R if '2026-05-17' <= r['d'] <= '2026-07-27']
selfgap = [r for r in gap if r['src']=='self_reported']
print(f'gap window 17 May - 27 Jul: {len(gap)} records (want 3), {len(selfgap)} self-reported (want 0)')
if len(gap)!=3 or selfgap: bad += 1
if bad: print(f'\n{bad} mismatch(es)'); sys.exit(1)
print('\nall distribution targets met')


# ==================================================================== emit
def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list):
        if not v: return 'null'
        return "array[" + ",".join("'" + x.replace("'", "''") + "'" for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"

S = 'aaaaaaaa-0000-0000-0000-00000000000a'
OUT = []
w = OUT.append

w("-- ORCA synthetic seed: Ananya Rao, September 2025 to August 2026.")
w("--")
w("-- GENERATED by scripts/build_ananya_seed.py. Edit the generator, not this file.")
w("--")
w("-- All data is fictional. The shape is the point: this record is uneven, self-")
w("-- contradictory in two places, and silent for ten weeks in the middle. A seed")
w("-- where every month looks alike and everybody agrees would prove nothing about")
w("-- a system built to handle records that do neither.")
w("--")
w("-- The silence between 16 May and 28 July 2026 is the most valuable thing here.")
w("-- It holds exactly three records, all professional, and no self-reports at all.")
w("-- A system that reads fewer entries as fewer problems will report improvement")
w("-- across it. The correct answer is that the trajectory through it is unknown.")
w("--")
w("-- Every record goes through orca_write_record so provenance is enforced rather")
w("-- than assumed, and the sensory-profile correction goes through orca_supersede")
w("-- so is_current and superseded_by cannot disagree.")
w("")
w("begin;")
w("")
w("delete from outcomes;")
w("delete from strategies;")
w("delete from files;")
w("delete from consents;")
w("delete from record_items where subject_id in (select subject_id from subjects")
w("  where display_name in ('Ananya Rao','Rohan Mehta','Farida Qureshi','Dev Sharma','Neha Iyer'));")
w("delete from stakeholder_relationships where subject_id in (select subject_id from subjects")
w("  where display_name in ('Ananya Rao','Rohan Mehta','Farida Qureshi','Dev Sharma','Neha Iyer'));")
w("delete from subjects where display_name in")
w("  ('Ananya Rao','Rohan Mehta','Farida Qureshi','Dev Sharma','Neha Iyer');")
w("delete from users where email like '%@orca.example';")
w("")

SUBJ = [(S,'Ananya Rao','1997-03-14'),
        ('aaaaaaaa-0000-0000-0000-00000000000b','Rohan Mehta','1994-08-02'),
        ('aaaaaaaa-0000-0000-0000-00000000000c','Farida Qureshi','1999-01-27'),
        ('aaaaaaaa-0000-0000-0000-00000000000d','Dev Sharma','1991-11-09'),
        ('aaaaaaaa-0000-0000-0000-00000000000e','Neha Iyer','2001-06-21')]
w("insert into subjects (subject_id, display_name, date_of_birth) values")
w(",\n".join("  (%s, %s, %s)" % (q(a),q(b),q(c)) for a,b,c in SUBJ) + ";")
w("")

PEOPLE = [(P['patient'],'Ananya Rao','ananya@orca.example','patient'),
 (P['trusted_person'],'Divya Rao','divya@orca.example','trusted_person'),
 (P['psychologist'],'Dr Kavita Nair','kavita@orca.example','psychologist'),
 (P['psychiatrist'],'Dr Arun Deshpande','arun@orca.example','psychiatrist'),
 (P['ot'],'Sana Kulkarni','sana@orca.example','ot'),
 (P['therapist'],'Meera Joshi','meera@orca.example','therapist'),
 (P['gp'],'Dr Vikram Rao','vikram@orca.example','gp'),
 (P['coordinator'],'Priya Salvi','priya@orca.example','coordinator'),
 (P['employer'],'Anil Fernandes','anil@orca.example','employer'),
 (P['university'],'Ruth Menon','ruth@orca.example','university'),
 (P['admin'],'Tejas Bhatt','tejas@orca.example','admin')]
w("insert into users (user_id, full_name, email, primary_role) values")
w(",\n".join("  (%s, %s, %s, %s)" % (q(a),q(b),q(c),q(d)) for a,b,c,d in PEOPLE) + ";")
w("")
w("-- Two dates carry weight. HR gains access only in March 2026, when the")
w("-- accommodation request began, so nothing before that is theirs to read")
w("-- whatever domain it sits in. The accessibility adviser starts in January with")
w("-- the course. A relationship that began in March cannot reach back into")
w("-- December: access here is not retrospective.")
REL = [(P['patient'],'patient','personal_understanding','2025-09-01'),
 (P['trusted_person'],'trusted_person','personal_understanding','2025-09-01'),
 (P['psychologist'],'psychologist','care','2025-09-10'),
 (P['gp'],'gp','care','2025-09-01'),
 (P['ot'],'ot','support_planning','2025-10-01'),
 (P['psychiatrist'],'psychiatrist','care','2025-11-05'),
 (P['coordinator'],'coordinator','coordination','2025-12-01'),
 (P['university'],'university','accommodation','2026-01-06'),
 (P['therapist'],'therapist','support_planning','2026-02-01'),
 (P['employer'],'employer','accommodation','2026-03-23'),
 (P['admin'],'admin','coordination','2025-09-01')]
w("insert into stakeholder_relationships (subject_id, user_id, role, purpose, valid_from) values")
w(",\n".join("  (%s, %s, %s, %s, %s)" % (q(S),q(u),q(r),q(p),q(d+'T00:00:00Z')) for u,r,p,d in REL) + ";")
w("")
w("-- ------------------------------------------------------------- the year")
for r in R:
    uid = P.get(r['role'])
    w("select orca_write_record(")
    w("  %s, %s::record_domain, %s," % (q(S), q(r['dom']), q(r['content'])))
    w("  %s::source_type, %s::stakeholder_role," % (q(r['src']), q(r['role'])))
    w("  %s::timestamptz, %s, %s," % (q(r['d']+'T09:00:00Z'), q(r['title']), q(uid)))
    w("  %s::sensitivity_level, %s::validation_status, %s, null," % (q(r['sen']), q(r['val']), r['ev']))
    w("  %s, %s);" % (q(r['tags']), q(r['iid'])))
w("")
w("-- The correction, through orca_supersede rather than three hand-written")
w("-- updates, so both links and both is_current flags are set together or not at")
w("-- all. The October profile stays readable: it was not wrong when it was")
w("-- written, it was the best reading available after one assessment, and a")
w("-- record that quietly loses its earlier version cannot show anyone how the")
w("-- understanding actually developed.")
w("select orca_supersede('f0000000-0000-0000-0000-000000000001',")
w("                      'f0000000-0000-0000-0000-000000000005');")
w("")
# ---------------------------------------------- strategies and how they went
w("-- 9 strategies: 3 worked, 3 partial, 2 failed, 1 still running. A seed where")
w("-- everything worked would train a planner to be confident about advice that")
w("-- has never survived contact with a bad week.")
STRAT = [
 ('s1','Fixed evening wind-down routine','Same sequence every evening: no screens after 21:30, reading, lights out at 22:30.','patient','support','2025-10-16','2025-12-23','failed'),
 ('s2','Written advance notice of schedule changes','Any change to the day communicated in writing, ideally the day before.','psychologist','support','2025-11-04',None,'running'),
 ('s3','Session recordings for the course','Recordings of live sessions made available so nothing depends on capturing it first time.','university','education','2026-01-08','2026-06-30','worked'),
 ('s4','Prepared responses for unplanned questions','Three rehearsed phrases for being asked for a view without notice.','therapist','support','2026-02-12','2026-08-01','worked'),
 ('s5','Earlier train to avoid peak crowding','Leaving at 06:30 for a quieter carriage.','patient','functional','2026-03-30','2026-05-13','partial'),
 ('s6','Desk relocation away from the walkway','Move out of the walkway and out from under the ceiling speaker.','ot','workplace','2026-04-07',None,'worked'),
 ('s7','Written task instructions from the line manager','Task changes confirmed in writing rather than in passing.','ot','workplace','2026-04-14','2026-08-14','partial'),
 ('s8','Noise-cancelling headphones for the full commute','Noise-cancelling headphones for the full commute','patient','functional','2026-07-30','2026-08-11','failed'),
 ('s9','Staggered start at 10:00','Start at 10:00 to travel after the peak.','employer','workplace','2026-08-11',None,'worked')]
SID = {k: 'b0000000-0000-0000-0000-00000000000%d' % (i+1) for i,(k,*_ ) in enumerate(STRAT)}
w("insert into strategies (strategy_id, subject_id, title, description, proposed_by, proposer_role, domain, started_on, ended_on, state) values")
rows = []
for k,t,d,role,dom,st,en,state in STRAT:
    rows.append("  (%s, %s, %s, %s, %s, %s, %s::record_domain, %s, %s, %s)" % (
        q(SID[k]), q(S), q(t), q(d), q(P.get(role)), q(role), q(dom), q(st), q(en), q(state)))
w(",\n".join(rows) + ";")
w("")
w("-- 14 outcomes, and never all reported by the subject. A record in which only")
w("-- the person themselves ever says whether something helped is a record that")
w("-- has quietly made them responsible for evaluating their own support.")
OUT_ = [
 ('s1','patient','2025-11-27','worked','Getting to bed earlier and stopping checking work things.',None,'Stable weeks, nothing unusual at home.'),
 ('s1','patient','2025-12-23','made_worse',None,'Could not be done at all once the house was full. The routine needed a quiet evening, which is the condition under which it was least needed.','Twelve visitors over the festival period.'),
 ('s1','psychologist','2025-12-24','no_benefit',None,'Sustained nine weeks under stable conditions and abandoned within eleven days of disruption.','Recorded at the December review.'),
 ('s2','patient','2026-01-19','partial','When it happens it makes the difference between a hard morning and a lost day.','It does not happen reliably.','Work.'),
 ('s2','psychologist','2026-03-19','partial','Consistently effective where applied.','Application is inconsistent and outside the patient control.','March review point.'),
 ('s3','university','2026-02-01','worked','Used for all four modules. Student reports it removes the need to capture everything at first hearing.',None,'First month of the course.'),
 ('s3','patient','2026-06-30','worked','The one adjustment I never had to chase.',None,'End of first semester.'),
 ('s4','therapist','2026-02-24','partial','Successful in the live exchange.','Reported as exhausting afterwards. Both are true and the second does not cancel the first.','Workplace meeting.'),
 ('s4','patient','2026-08-01','worked','I use them without thinking about it now.',None,'Six months in.'),
 ('s5','patient','2026-05-09','made_worse','It was working in March.','By May the hour of sleep cost more than the quiet carriage gave back. The train did not change; what I had to spend did.','Peak-hour Pune Metro.'),
 ('s6','ot','2026-04-07','worked','Immediate improvement in sustained attention. The adjustment requiring least of anyone else.',None,'Office walkthrough follow-up.'),
 ('s7','employer','2026-04-14','worked','Recorded as implemented alongside the other two adjustments.',None,'HR administrative record.'),
 ('s7','patient','2026-04-29','no_benefit','The desk move helped.','Written instructions never actually started. Asked twice. Still told things in the corridor.','Four months after it was agreed.'),
 ('s8','patient','2026-08-11','made_worse',None,'Removing ambient sound made it harder to judge distance and crowd movement. Felt more disoriented on the platform, not less. Two near-misses on the stairs.','Peak-hour Pune Metro, standing.')]
w("insert into outcomes (strategy_id, subject_id, reported_by, reporter_role, reported_on, effectiveness, what_worked, what_did_not_work, context) values")
rows = []
for k,role,d,eff,ww,wn,ctx in OUT_:
    rows.append("  (%s, %s, %s, %s::stakeholder_role, %s, %s, %s, %s, %s)" % (
        q(SID[k]), q(S), q(P.get(role)), q(role), q(d), q(eff), q(ww), q(wn), q(ctx)))
w(",\n".join(rows) + ";")
w("")
w("-- Files: metadata only. contents_read stays false because nothing has parsed")
w("-- them, and a file row that implies otherwise is an invented finding in a")
w("-- different costume.")
FILES = [('OT initial sensory assessment','assessment','functional','moderate','ot','2025-10-12'),
 ('Psychiatry letter to GP','letter','clinical','restricted','psychiatrist','2025-11-19'),
 ('Course accommodation plan','plan','education','low','university','2026-01-08'),
 ('Workplace accommodation request','request','workplace','moderate','coordinator','2026-03-10'),
 ('Fit note — two weeks','certificate','clinical','high','gp','2026-05-13'),
 ('Phased return plan','plan','workplace','low','employer','2026-07-21')]
w("insert into files (subject_id, title, kind, domain, sensitivity, uploaded_by, uploader_role, occurred_on, contents_read) values")
w(",\n".join("  (%s, %s, %s, %s::record_domain, %s::sensitivity_level, %s, %s, %s, false)" % (
    q(S),q(t),q(k),q(dom),q(sen),q(P.get(role)),q(role),q(d)) for t,k,dom,sen,role,d in FILES) + ";")
w("")
w("-- Consents, with the dates that make the access model testable.")
CONS = [('psychologist','clinical','care','2025-09-10'),
 ('psychiatrist','clinical','care','2025-11-05'),
 ('ot','functional','support_planning','2025-10-01'),
 ('university','education','accommodation','2026-01-06'),
 ('employer','workplace','accommodation','2026-03-23')]
w("insert into consents (subject_id, user_id, domain, purpose, granted_on) values")
w(",\n".join("  (%s, %s, %s::record_domain, %s::purpose_type, %s)" % (
    q(S),q(P.get(role)),q(dom),q(pur),q(d)) for role,dom,pur,d in CONS) + ";")
w("")
w("-- The other four on Dr Nair's caseload. Deliberately thin: they exist so the")
w("-- psychologist has a real list and so cross-subject access can be tested, not")
w("-- to be read.")
THIN = [('aaaaaaaa-0000-0000-0000-00000000000b','Rohan Mehta',7),
        ('aaaaaaaa-0000-0000-0000-00000000000c','Farida Qureshi',6),
        ('aaaaaaaa-0000-0000-0000-00000000000d','Dev Sharma',8),
        ('aaaaaaaa-0000-0000-0000-00000000000e','Neha Iyer',6)]
THIN_DOM = ['functional','personal','support','clinical','functional','support','personal','functional']
for sid, name, n in THIN:
    w("insert into stakeholder_relationships (subject_id, user_id, role, purpose, valid_from) values")
    w("  (%s, %s, 'psychologist', 'care', '2025-09-01T00:00:00Z')," % (q(sid), q(P['psychologist'])))
    w("  (%s, %s, 'patient', 'personal_understanding', '2025-09-01T00:00:00Z');" % (q(sid), q(P['patient'])))
    for i in range(n):
        month = 2 + i
        d = '2026-%02d-%02d' % (month if month <= 8 else 8, 5 + i)
        w("select orca_write_record(%s, %s::record_domain," % (q(sid), q(THIN_DOM[i % len(THIN_DOM)])))
        w("  %s," % q('Routine entry %d for %s. Placeholder content for caseload testing.' % (i+1, name)))
        w("  'professional_reported'::source_type, 'psychologist'::stakeholder_role,")
        w("  %s::timestamptz, %s, %s," % (q(d+'T09:00:00Z'), q('Caseload note %d' % (i+1)), q(P['psychologist'])))
        w("  'moderate'::sensitivity_level, 'professional_validated'::validation_status, 0.5, null, null, null);")
    w("")
w("commit;")

open('supabase/seed/ananya_year.sql','w').write("\n".join(OUT) + "\n")
print('wrote supabase/seed/ananya_year.sql (%d lines)' % len(OUT))
