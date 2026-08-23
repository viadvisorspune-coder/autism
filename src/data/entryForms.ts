import type { Role } from './types'

/**
 * What each stakeholder puts *into* the record.
 *
 * Until now this platform read in one direction. A psychologist could open a
 * patient, read everything, and then had nowhere to write what happened in the
 * session they had just finished — except a chat box, which is a poor place to
 * put a structured clinical note and a worse one to find it again later.
 *
 * That is backwards for everyone except the patient. A professional's day is
 * mostly *generating* information: a session happened, an observation was made,
 * a request moved to the next stage. They are not primarily looking things up,
 * and an interface built entirely around looking things up makes them do their
 * real work somewhere else and paste the result in.
 *
 * So every role that is not the patient gets one persistent primary action, in
 * their own vocabulary — a psychologist adds a session, an OT adds an
 * observation, an employer updates a case. The shape below is the whole
 * difference between them: same screen, same code, different words and fields,
 * because "Add Clinical Entry" and "Update Case" are not the same job and
 * should not look like it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: decide anything. Everything written here is
 * attributed, dated, and owned by the person who wrote it. Whether any of it
 * becomes part of the patient's own longitudinal record is a separate question,
 * asked at the end, and answered by a human — which is the same rule that
 * governs everything else ORCA does with somebody's history.
 */

export type FieldKind = 'text' | 'long' | 'date' | 'select' | 'patient'

export interface Field {
  name: string
  label: string
  kind: FieldKind
  /** Shown under the label. What to write here, not what the field is called. */
  hint?: string
  options?: string[]
  required?: boolean
}

export interface EntryKind {
  id: string
  label: string
  /** One line, so somebody choosing between eight of these can choose. */
  blurb: string
  fields: Field[]
}

export interface EntryModel {
  /** The button. In their words. */
  action: string
  /** The page title once they are on it. */
  title: string
  intro: string
  kinds: EntryKind[]
}

/* ------------------------------------------------------------ shared parts */

const PATIENT: Field = { name: 'patient', label: 'Patient', kind: 'patient', required: true }
const DATE: Field = { name: 'date', label: 'Date', kind: 'date', required: true }

const OUTCOME: Field = {
  name: 'outcome',
  label: 'Outcome',
  kind: 'long',
  hint: 'What actually changed, if anything. "Too early to say" is an outcome.',
}

const FOLLOW_UP: Field = {
  name: 'follow_up',
  label: 'Follow-up',
  kind: 'text',
  hint: 'What happens next, and when.',
}

/* ---------------------------------------------------------------- clinical */

const SESSION_NOTE: EntryKind = {
  id: 'session_note',
  label: 'Session note',
  blurb: 'A session that has happened, written up.',
  fields: [
    PATIENT,
    DATE,
    {
      name: 'session_type',
      label: 'Session type',
      kind: 'select',
      options: ['In person', 'Video', 'Phone', 'Review', 'Assessment'],
    },
    {
      name: 'patient_reported',
      label: 'What the patient told you',
      kind: 'long',
      hint: 'In their words where you can. This is kept separate from your own observations on purpose.',
    },
    {
      name: 'observations',
      label: 'Your observations',
      kind: 'long',
      hint: 'What you noticed. Marked as professionally documented.',
    },
    { name: 'goals', label: 'Goals discussed', kind: 'long' },
    { name: 'interventions', label: 'Strategies or interventions', kind: 'long' },
    OUTCOME,
    FOLLOW_UP,
  ],
}

const OBSERVATION: EntryKind = {
  id: 'observation',
  label: 'Professional observation',
  blurb: 'Something you noticed, outside a formal session.',
  fields: [
    PATIENT,
    DATE,
    { name: 'context', label: 'Where and when', kind: 'text', hint: 'The setting it happened in.' },
    { name: 'observation', label: 'What you observed', kind: 'long', required: true },
    { name: 'significance', label: 'Why it matters', kind: 'long' },
  ],
}

const GOAL_UPDATE: EntryKind = {
  id: 'goal_update',
  label: 'Goal update',
  blurb: 'Progress on something you are working towards together.',
  fields: [
    PATIENT,
    DATE,
    { name: 'goal', label: 'The goal', kind: 'text', required: true },
    {
      name: 'progress',
      label: 'Where it has got to',
      kind: 'select',
      options: ['Not started', 'Started', 'Progressing', 'Met', 'Changed', 'Stopped'],
    },
    { name: 'detail', label: 'What has changed', kind: 'long' },
    FOLLOW_UP,
  ],
}

const STRATEGY: EntryKind = {
  id: 'strategy',
  label: 'Strategy',
  blurb: 'Something to try, with a review date.',
  fields: [
    PATIENT,
    DATE,
    { name: 'title', label: 'What it is', kind: 'text', required: true },
    { name: 'goal', label: 'What it is meant to help with', kind: 'long', required: true },
    { name: 'rationale', label: 'Why this one', kind: 'long', hint: 'What in the record points at it.' },
    { name: 'review', label: 'Review on', kind: 'date' },
  ],
}

const OUTCOME_ENTRY: EntryKind = {
  id: 'outcome',
  label: 'Outcome',
  blurb: 'How something you tried actually went.',
  fields: [
    PATIENT,
    DATE,
    { name: 'what', label: 'What was tried', kind: 'text', required: true },
    {
      name: 'effectiveness',
      label: 'How it went',
      kind: 'select',
      options: ['Helped', 'Partly helped', 'Did not help', 'Too early to say'],
    },
    { name: 'evidence', label: 'What tells you that', kind: 'long' },
    FOLLOW_UP,
  ],
}

const REFERRAL: EntryKind = {
  id: 'referral',
  label: 'Referral',
  blurb: 'Passing something to another service.',
  fields: [
    PATIENT,
    DATE,
    { name: 'to', label: 'Referred to', kind: 'text', required: true },
    { name: 'reason', label: 'Reason', kind: 'long', required: true },
    { name: 'urgency', label: 'Urgency', kind: 'select', options: ['Routine', 'Soon', 'Urgent'] },
  ],
}

const DOCUMENT: EntryKind = {
  id: 'document',
  label: 'Document',
  blurb: 'A file, with a note about what it is.',
  fields: [
    PATIENT,
    DATE,
    { name: 'title', label: 'What it is', kind: 'text', required: true },
    { name: 'summary', label: 'What is in it', kind: 'long' },
    { name: 'source', label: 'Where it came from', kind: 'text' },
  ],
}

const OTHER: EntryKind = {
  id: 'other',
  label: 'Something else',
  blurb: 'When none of the above is the right shape.',
  fields: [
    PATIENT,
    DATE,
    { name: 'title', label: 'What it is', kind: 'text', required: true },
    { name: 'detail', label: 'The detail', kind: 'long', required: true },
  ],
}

/* ------------------------------------------------------------ per-role sets */

const CASE_UPDATE_FIELDS = (kind: string, extra: Field[] = []): Field[] => [
  PATIENT,
  DATE,
  { name: 'stage', label: 'Stage', kind: 'select', options: [kind], required: true },
  ...extra,
  { name: 'detail', label: 'What happened', kind: 'long', required: true },
  FOLLOW_UP,
]

/**
 * An employer or a university is not doing clinical work and must not be given
 * a form that implies they are. Their entries are about a *case* — a request
 * that moves through stages — and they never carry a diagnosis, a symptom or a
 * clinical opinion, because those are not theirs to hold.
 */
const caseUpdate = (who: 'employer' | 'university'): EntryModel => ({
  action: 'Update case',
  title: 'Update a case',
  intro:
    who === 'employer'
      ? 'Where a request has got to, and what you have done about it. Nothing clinical is recorded here — you do not hold that, and this form does not ask for it.'
      : 'Where a request has got to, and what the university has done. Nothing clinical is recorded here.',
  kinds: [
    {
      id: 'request',
      label: 'Accommodation request',
      blurb: 'A new request has come in.',
      fields: CASE_UPDATE_FIELDS('Received', [
        { name: 'requested', label: 'What is being asked for', kind: 'long', required: true },
      ]),
    },
    {
      id: 'clarification',
      label: who === 'employer' ? 'Clarification asked' : 'Documentation received',
      blurb: who === 'employer' ? 'You need something before you can decide.' : 'Something arrived to support the request.',
      fields: CASE_UPDATE_FIELDS(who === 'employer' ? 'Clarification' : 'Documentation'),
    },
    {
      id: 'decision',
      label: 'Approved or declined',
      blurb: 'A decision has been made.',
      fields: CASE_UPDATE_FIELDS('Decision', [
        {
          name: 'decision',
          label: 'Decision',
          kind: 'select',
          options: ['Approved', 'Approved with changes', 'Declined'],
          required: true,
        },
        { name: 'reason', label: 'Reason', kind: 'long', hint: 'Especially if declined. This is what the person will read.' },
      ]),
    },
    {
      id: 'implementation',
      label: 'Implementation',
      blurb: 'It is actually in place now.',
      fields: CASE_UPDATE_FIELDS('Implementation', [
        { name: 'from', label: 'In place from', kind: 'date' },
      ]),
    },
    {
      id: 'review',
      label: 'Review',
      blurb: 'Checking whether it is still working.',
      fields: CASE_UPDATE_FIELDS('Review', [
        {
          name: 'still_working',
          label: 'Still working?',
          kind: 'select',
          options: ['Yes', 'Partly', 'No', 'Too early to say'],
        },
      ]),
    },
    {
      id: 'outcome',
      label: 'Outcome',
      blurb: 'How it turned out.',
      fields: CASE_UPDATE_FIELDS('Outcome', [OUTCOME]),
    },
    {
      id: 'communication',
      label: 'Communication',
      blurb: 'Something was said to the person, or about the case.',
      fields: CASE_UPDATE_FIELDS('Communication', [
        { name: 'with', label: 'With whom', kind: 'text' },
      ]),
    },
  ],
})

export const entryModels: Partial<Record<Role, EntryModel>> = {
  psychologist: {
    action: 'Add session',
    title: 'Add to the patient record',
    intro:
      'What you write here is yours, attributed to you and dated. Nothing becomes part of the patient’s own longitudinal record unless somebody agrees to it afterwards.',
    kinds: [
      SESSION_NOTE,
      OBSERVATION,
      GOAL_UPDATE,
      STRATEGY,
      OUTCOME_ENTRY,
      DOCUMENT,
      REFERRAL,
      OTHER,
    ],
  },

  therapist: {
    action: 'Record session',
    title: 'Record a session',
    intro: 'One session, written up while it is fresh. Attributed to you and dated.',
    kinds: [
      {
        id: 'therapy_session',
        label: 'Session',
        blurb: 'What you worked on and how it went.',
        fields: [
          PATIENT,
          DATE,
          { name: 'goal', label: 'Goal', kind: 'text', hint: 'What this session was working towards.' },
          { name: 'intervention', label: 'Intervention', kind: 'long', required: true },
          {
            name: 'patient_feedback',
            label: 'Patient feedback',
            kind: 'long',
            hint: 'Their words, kept separate from your reading of them.',
          },
          OUTCOME,
          { name: 'next_step', label: 'Next step', kind: 'text' },
          { name: 'document', label: 'Supporting document', kind: 'text', hint: 'A name or reference, if there is one.' },
        ],
      },
      OBSERVATION,
      GOAL_UPDATE,
      OUTCOME_ENTRY,
      OTHER,
    ],
  },

  ot: {
    action: 'Add observation',
    title: 'Add a functional observation',
    intro:
      'What happened, where, and what was tried. Environment first — this is the record of how a place behaved, not a judgement about a person.',
    kinds: [
      {
        id: 'functional_observation',
        label: 'Functional observation',
        blurb: 'An activity, an environment, and what got in the way.',
        fields: [
          PATIENT,
          DATE,
          { name: 'activity', label: 'Activity', kind: 'text', required: true, hint: 'What they were trying to do.' },
          { name: 'environment', label: 'Environment', kind: 'long', required: true, hint: 'The place, and what it was doing at the time.' },
          { name: 'difficulty', label: 'Observed difficulty', kind: 'long' },
          { name: 'patient_report', label: 'What they said about it', kind: 'long' },
          { name: 'adaptation', label: 'Adaptation tried', kind: 'long' },
          OUTCOME,
          { name: 'recommendation', label: 'Recommendation', kind: 'long' },
        ],
      },
      STRATEGY,
      OUTCOME_ENTRY,
      DOCUMENT,
      OTHER,
    ],
  },

  psychiatrist: {
    action: 'Add clinical entry',
    title: 'Add a clinical entry',
    intro:
      'ORCA can tidy the wording and summarise it afterwards. The clinical decision stays yours and is recorded as yours.',
    kinds: [
      {
        id: 'clinical_entry',
        label: 'Clinical entry',
        blurb: 'An encounter, an assessment, and what you decided.',
        fields: [
          PATIENT,
          DATE,
          {
            name: 'encounter',
            label: 'Encounter',
            kind: 'select',
            options: ['Review', 'New assessment', 'Follow-up', 'Medication review', 'Urgent'],
          },
          { name: 'context', label: 'Clinical context', kind: 'long' },
          { name: 'changes', label: 'Relevant changes since last time', kind: 'long' },
          { name: 'assessment', label: 'Assessment', kind: 'long', required: true },
          { name: 'decision', label: 'Decision', kind: 'long', required: true },
          FOLLOW_UP,
          { name: 'documents', label: 'Documents', kind: 'text' },
        ],
      },
      OBSERVATION,
      REFERRAL,
      DOCUMENT,
      OTHER,
    ],
  },

  gp: {
    action: 'Add visit',
    title: 'Add visit information',
    intro: 'What the visit was for and what came of it.',
    kinds: [
      {
        id: 'visit',
        label: 'Visit',
        blurb: 'One appointment, written up.',
        fields: [
          PATIENT,
          DATE,
          { name: 'reason', label: 'Reason for visit', kind: 'text', required: true },
          { name: 'changes', label: 'Relevant changes', kind: 'long' },
          { name: 'observations', label: 'Observations', kind: 'long' },
          { name: 'action', label: 'Action taken', kind: 'long' },
          { name: 'referral', label: 'Referral', kind: 'text' },
          FOLLOW_UP,
        ],
      },
      REFERRAL,
      DOCUMENT,
      OTHER,
    ],
  },

  clinic: {
    action: 'Add patient event',
    title: 'Record a patient event',
    intro:
      'Operational events for this clinic. Where the patient has authorised it, these also reach the shared record.',
    kinds: [
      {
        id: 'visit_event',
        label: 'Visit',
        blurb: 'They came in, or they did not.',
        fields: [
          PATIENT,
          DATE,
          {
            name: 'status',
            label: 'What happened',
            kind: 'select',
            options: ['Attended', 'Did not attend', 'Cancelled', 'Rescheduled'],
            required: true,
          },
          { name: 'detail', label: 'Detail', kind: 'long' },
        ],
      },
      { ...REFERRAL, blurb: 'Sent on to another service.' },
      {
        id: 'discharge',
        label: 'Discharge',
        blurb: 'Care with this service has ended.',
        fields: [
          PATIENT,
          DATE,
          { name: 'reason', label: 'Reason', kind: 'long', required: true },
          { name: 'onward', label: 'Onward care', kind: 'long' },
        ],
      },
      DOCUMENT,
      {
        id: 'care_plan',
        label: 'Care-plan update',
        blurb: 'The plan has changed.',
        fields: [PATIENT, DATE, { name: 'change', label: 'What changed', kind: 'long', required: true }, FOLLOW_UP],
      },
      OTHER,
    ],
  },

  employer: caseUpdate('employer'),
  university: caseUpdate('university'),

  trusted: {
    action: 'Share an observation',
    title: 'Tell ORCA something',
    intro:
      'Anything you have noticed that might be worth knowing. It stays attributed to you, and it does not become a fact about them unless they agree to it.',
    kinds: [
      {
        id: 'shared_observation',
        label: 'An observation',
        blurb: 'Something you noticed.',
        fields: [
          PATIENT,
          DATE,
          { name: 'observation', label: 'What would you like to tell ORCA?', kind: 'long', required: true },
          { name: 'context', label: 'When and where', kind: 'text', hint: 'Optional, but it usually helps.' },
          { name: 'detail', label: 'Anything else', kind: 'long' },
        ],
      },
    ],
  },
}

/**
 * What happens to it afterwards — asked once, at the end, in plain terms.
 *
 * The first is always on and cannot be turned off: writing it down is the
 * point. The other two are the ones that reach beyond the author, so they are
 * choices rather than defaults.
 */
export interface Disposition {
  id: 'save' | 'propose' | 'follow_up'
  label: string
  detail: string
  fixed?: boolean
}

export const dispositions: Disposition[] = [
  {
    id: 'save',
    label: 'Save to my own record',
    detail: 'Kept under your name, visible to you and to anyone this patient has already allowed.',
    fixed: true,
  },
  {
    id: 'propose',
    label: 'Suggest what this changes about the longer picture',
    detail:
      'ORCA reads it against what is already there and proposes updates. Nothing is added to the patient’s own profile until a person agrees to it.',
  },
  {
    id: 'follow_up',
    label: 'Create a follow-up',
    detail: 'A task, on your list, so the next step does not depend on you remembering it.',
  },
]
