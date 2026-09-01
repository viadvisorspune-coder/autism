/**
 * Who gets what, and what colour means.
 *
 * One file, because these three questions are the same question asked three
 * ways: how much colour does this person get, which destinations exist for
 * them, and which parts of the record may they ask about. Splitting them
 * across three modules is how the answers drift apart.
 */
import type { Role } from '../data/types'

/* -------------------------------------------------------------- palette */

/**
 * How much colour a person's interface carries.
 *
 * Not a theme. The amount of colour on the screen is a statement about whose
 * information is on it and how much of that information the reader may see —
 * the further from the person whose record it is, the less colour you get.
 * Ananya's screens are unmistakably hers, which matters when the same platform
 * serves eleven people looking at one life.
 */
export type Palette = 'full' | 'warm' | 'cool' | 'none' | 'mono'

export function paletteFor(role: Role | null): Palette {
  switch (role) {
    case 'patient':
      return 'full'
    case 'trusted':
      return 'warm'
    case 'psychologist':
    case 'psychiatrist':
    case 'therapist':
    case 'ot':
    case 'gp':
    case 'clinic':
      return 'cool'
    case 'admin':
      return 'mono'
    default:
      // Employer and university. The absence of colour is doing work here.
      return 'none'
  }
}

/**
 * The five meanings colour carries, for the one user who gets all five.
 *
 * FIXED, NEVER ROTATED. An earlier version picked a colour from the hash of a
 * turn id so a conversation read as a run of distinct moments. That is
 * decoration, and decoration in a governance interface is worse than no colour
 * at all: it teaches people that the colours mean something and then means
 * nothing by them. Every one of these is now a fact about the thing it sits on.
 */
export type Tone = 'current' | 'past' | 'decision' | 'shared' | 'confirmed'

export const toneClass: Record<Tone, string> = {
  current: 'tone-current',
  past: 'tone-past',
  decision: 'tone-decision',
  shared: 'tone-shared',
  confirmed: 'tone-confirmed',
}

/* -------------------------------------------------------------- workflows
 *
 * Which combination of workflows a question was routed to, named twice.
 *
 * The first name is ours — the five paths the router actually chooses between,
 * useful to anybody looking at this as a system. The second is what it means
 * for the person who asked, which is the only part they should have to read.
 *
 * Shown rather than kept internal because a request does not map one-to-one
 * onto a workflow: "write a handover for Dr Nair" with no recent retrieval is
 * two runs — look first, then draft — and a person handing over a question
 * about their own medical record is owed the knowledge of what will happen to
 * it. It is also the difference, to anyone watching, between a system that
 * decides and one that guesses.
 */
export const pathName: Record<string, string> = {
  understand_only: 'Understand',
  produce_only: 'Produce',
  understand_then_produce: 'Understand, then Produce',
  fifteen_step: 'Fifteen-step governed pipeline',
  chatbot_replay: 'Record-grounded reply',
  chatbot_direct: 'Direct lookup',
  nothing_configured: 'Nothing ran',
}

export const pathMeaning: Record<string, string> = {
  understand_only: 'the record is read and the answer comes back here',
  produce_only: 'a document is drafted from what has already been retrieved',
  understand_then_produce: 'the record is read first, then a document is drafted from it',
  fifteen_step: 'full checks before anything leaves, because this one goes outside',
  chatbot_replay: 'an answer you were already given is brought back, unchanged',
  chatbot_direct: 'a fact is looked up and said back, without the longer chain',
  nothing_configured: 'nothing was sent, because the workflow it needed is not set up',
}

/* ------------------------------------------------------------ navigation */

export interface Destination {
  label: string
  to: string
  /**
   * Which drawing sits beside the word, on the shells that draw one.
   *
   * A name rather than a component, because this module has no JSX in it and
   * should not acquire any: it is where the product's rules live, and a rule
   * file that imports React starts being imported for its React. The rail maps
   * the name to a glyph.
   *
   * Optional throughout. The header shell shows words only, and a destination
   * with no icon there is not missing anything.
   */
  icon?: IconName
}

export type IconName =
  | 'home'
  | 'ask'
  | 'record'
  | 'decisions'
  | 'documents'
  | 'sharing'
  | 'appointments'
  | 'adjust'

/**
 * Four items for everyone except the administrator. Same words, same order,
 * same place, on every screen — which is the only thing that makes navigation
 * something you learn once rather than read every time.
 *
 * Ananya gets a fifth, because she is the only person who decides what anyone
 * else can see.
 *
 * The clinical roles get a caseload, because they are the only people looking
 * at more than one life.
 */
export function navFor(role: Role | null): Destination[] {
  /**
   * Adjust is on every list, last.
   *
   * It was two controls in a dropdown behind somebody's own name, which is
   * where a setting goes when nobody expects it to be used — and the settings
   * here are text size and colour intensity, which for a good number of the
   * people using this are the difference between a readable screen and an
   * unusable one. Last in the row because it is not a place you work; present
   * in the row because it is a place you go.
   */
  const adjust: Destination = { label: 'Adjust', to: '/adjust', icon: 'adjust' }

  if (role === 'admin') {
    return [
      { label: 'Runs', to: '/runs' },
      { label: 'Access', to: '/access' },
      { label: 'Incidents', to: '/incidents' },
      { label: 'Health', to: '/health' },
      adjust,
    ]
  }

  const ask: Destination = { label: 'Ask', to: '/ask', icon: 'ask' }
  const record: Destination = { label: 'Record', to: '/record', icon: 'record' }
  const decisions: Destination = { label: 'Decisions', to: '/decisions', icon: 'decisions' }
  const documents: Destination = { label: 'Documents', to: '/documents', icon: 'documents' }
  const notes: Destination = { label: 'Notes', to: '/notes', icon: 'record' }
  const caseload: Destination = { label: 'Caseload', to: '/caseload', icon: 'record' }

  const appointments: Destination = {
    label: 'Appointments',
    to: '/appointments',
    icon: 'appointments',
  }

  /**
   * Ananya alone starts on a Home rather than in the chat box.
   *
   * Everybody else in the product arrives to do one thing, and the shortest
   * route to it is the front door: a coordinator wants the open tasks, an
   * employer wants what is waiting on them. Ananya arrives without a task. She
   * is the only person for whom the honest first screen is "here is where
   * things stand", and dropping her into an empty text field made her supply
   * the reason for the visit before the product had told her anything.
   *
   * Ask keeps its place directly under it, and its own screen is unchanged.
   * What moved is the landing, not the feature.
   */
  if (role === 'patient') {
    return [
      { label: 'Home', to: '/home', icon: 'home' },
      { label: 'Ask ORCA', to: '/ask', icon: 'ask' },
      record,
      appointments,
      decisions,
      documents,
      { label: 'Sharing', to: '/sharing', icon: 'sharing' },
      adjust,
    ]
  }

  /**
   * Divya has no Decisions and no Documents, and both absences are the point.
   *
   * She approves nothing — a decisions screen for somebody with no decisions is
   * a screen that teaches them to expect one — and she produces nothing. What
   * she has that nobody gave her before is Notes: she sees more of an ordinary
   * week than anyone with a clinic appointment does, and until now the only
   * thing she could do with that was ask a question about it.
   */
  if (role === 'trusted') return [ask, record, notes, adjust]

  /**
   * Priya coordinates, and Tasks is her home rather than Ask.
   *
   * She had no interface at all — she is in the stakeholder roster and she is
   * the requester in the fifteen-step trigger, and there was no screen she
   * could sign into. Her job is chasing and connecting, so the list of what is
   * open comes first and the record comes second. She has no Notes: she does
   * not assess anybody, and a coordinator writing clinical observations is a
   * role boundary this product should not blur.
   */
  if (role === 'clinic') {
    return [
      caseload,
      { label: 'Tasks', to: '/tasks' },
      { label: 'Requests', to: '/requests' },
      ask,
      record,
      documents,
      adjust,
    ]
  }

  /**
   * Meera and Sana get Strategies, and it is the biggest thing missing from
   * their day.
   *
   * An occupational therapist's job is propose, wait, find out, adapt. That
   * loop existed only as rows in a table nobody could write to — they could
   * read what had been tried and could try nothing. It sits before Notes
   * because it is the work, and a note is the record of it.
   */
  if (role === 'ot' || role === 'therapist') {
    return [
      caseload,
      ask,
      record,
      { label: 'Strategies', to: '/strategies' },
      notes,
      { label: 'Tasks', to: '/tasks' },
      documents,
      adjust,
    ]
  }

  /**
   * The professionals get Notes, and it is the largest gap this closes.
   *
   * A clinician's primary daily action is recording a session. There was no way
   * to do it: ORCA could read a record from six angles and not one person could
   * add a line to it.
   */
  if (hasCaseload(role)) {
    return [caseload, ask, record, notes, { label: 'Tasks', to: '/tasks' }, documents, decisions, adjust]
  }

  /**
   * Anil and Ruth: the job, not the chat box.
   *
   * They were given Ask, Record, Decisions and Documents — an interface that
   * lets somebody ask questions and do nothing with the answers. An employer's
   * actual job is receiving a request, deciding on it, putting it in place and
   * reviewing it, and only the asking had a screen. Requests comes first
   * because it is the thing waiting on them.
   *
   * No Decisions: they approve nothing about the record itself. What they
   * decide is what they will do at work or at university, which is Requests.
   */
  if (role === 'employer' || role === 'university') {
    return [
      { label: 'Requests', to: '/requests' },
      {
        // The sector's own word, so nobody has to learn the other one.
        label: role === 'university' ? 'Accommodations' : 'Adjustments',
        to: '/register',
      },
      ask,
      record,
      documents,
      adjust,
    ]
  }

  return [ask, record, decisions, documents, adjust]
}

/** Whether this person looks after more than one record. */
export function hasCaseload(role: Role | null): boolean {
  return (
    role === 'psychologist' ||
    role === 'psychiatrist' ||
    role === 'therapist' ||
    role === 'ot' ||
    role === 'gp' ||
    role === 'clinic'
  )
}

/** Where signing in lands you. */
export function homeFor(role: Role | null): string {
  if (role === 'admin') return '/runs'
  // A coordinator's first question is what is open, not who is on the list.
  if (role === 'clinic') return '/tasks'
  // An employer's and an adviser's is what is waiting on them. Landing them on
  // a chat box was the whole shape of the mistake this fixes.
  if (role === 'employer' || role === 'university') return '/requests'
  if (hasCaseload(role)) return '/caseload'
  // Ananya arrives without a task, so she lands on where things stand rather
  // than on an empty text field asking her to supply one.
  if (role === 'patient') return '/home'
  return '/ask'
}

/* ----------------------------------------------------------------- scope
 *
 * What each person may ask about, and what happens when they ask about
 * something else.
 *
 * TWO DIFFERENT NOES, AND THE DIFFERENCE IS THE PRODUCT. Anil asking for
 * Ananya's diagnosis is a wall: there is no route, and pretending there is one
 * would be a lie. Sana asking what medication she is on is a door with a lock,
 * and Ananya holds the key. Giving both the same screen would misrepresent one
 * of them, and it is the second — the one where the consent model actually
 * shows — that would be lost.
 *
 * Decided here, in the interface, rather than left to the workflow. Not because
 * the workflow cannot be trusted with it, but because a boundary that is only
 * enforced after a round trip is a boundary the person watches the system
 * think about. The record is never read; nothing leaves the browser.
 */

export type Domain = 'clinical' | 'health' | 'work' | 'education' | 'personal' | 'support'

/**
 * What a question is about, from the words in it.
 *
 * Always returns something. A question that matches nothing is personal, which
 * is the narrowest reading and therefore the safe default: it is the domain
 * every connected person may already see, so an unrecognised question is never
 * accidentally treated as clinical and never accidentally opened up.
 */
export function domainOf(question: string): Domain {
  const q = question.toLowerCase()

  /**
   * Prefixes, not whole words.
   *
   * These were written with a closing `\b`, which quietly broke every one of
   * them: "diagnos" followed by "is" is not a word boundary, so `\bdiagnos\b`
   * never matched the word "diagnosis" — and an employer asking for a
   * diagnosis was classified as a personal question and refused for the wrong
   * reason with the wrong wording. Same for psychiatrist, medication and
   * universit. Opening boundary only.
   */
  // Clinical first, because a question can mention work and medication in the
  // same sentence and the clinical half is the one that decides.
  if (
    /\b(diagnos|medicat|medicin|meds|prescri|psychiatr|dosage|antidepress|sertraline|melatonin|clinical note|session note|therapy note|psycholog|mental health|comorbid|assessment|adhd|screening)/.test(
      q,
    )
  )
    return 'clinical'

  if (/\b(appointment|gp\b|doctor|referral|sleep|health|symptom|unwell|illness|sick note)/.test(q))
    return 'health'

  if (
    /\b(work|employer|job\b|desk|office|line manager|shift|commute|start time|later start|start\b|adjustment|accommodation)/.test(
      q,
    )
  )
    return 'work'

  if (/\b(universit|course|study|studies|lecture|exam|tutor|academic|module|semester|term\b)/.test(q))
    return 'education'

  if (/\b(strateg|helps|helped|coping|routine|support|tried|difficult morning)/.test(q))
    return 'support'

  return 'personal'
}

/**
 * Whether a question is asking for the reason behind an adjustment.
 *
 * This is its own case because the answer is clinical and the question is not:
 * "why does she need the later start" is a perfectly reasonable thing for an
 * employer to want to know, and answering it means disclosing functional or
 * clinical information they have no access to. So it is gated rather than
 * refused — there is a route, and it runs through Ananya.
 */
export function asksWhy(question: string): boolean {
  const q = question.toLowerCase()
  return /\bwhy\b/.test(q) && /\b(need|needs|require|requires|necessary|have to)\b/.test(q)
}

export type Outcome = 'allow' | 'refuse' | 'gate'

/**
 * What happens when this person asks about this domain.
 *
 * The patient sees everything about herself. Her psychologist, psychiatrist
 * and GP hold the clinical record and see all of it. Her therapist and OT see
 * function, support and context, and reach the clinical record only through
 * her — a door, not a wall. Her employer and university see only their own
 * domain. Her sister sees the personal and the practical.
 */
export function outcomeFor(role: Role | null, domain: Domain, why: boolean): Outcome {
  switch (role) {
    case 'patient':
      return 'allow'

    case 'psychologist':
    case 'psychiatrist':
    case 'gp':
      return 'allow'

    case 'therapist':
    case 'ot':
      return domain === 'clinical' ? 'gate' : 'allow'

    case 'clinic':
      // Coordination, not clinical judgement. Appointments and logistics yes;
      // what was said in a psychology session, only through Ananya.
      return domain === 'clinical' ? 'gate' : 'allow'

    case 'employer':
      if (domain === 'work') return why ? 'gate' : 'allow'
      if (domain === 'support') return 'allow'
      return 'refuse'

    case 'university':
      if (domain === 'education') return why ? 'gate' : 'allow'
      if (domain === 'support') return 'allow'
      return 'refuse'

    case 'trusted':
      // Family, not a professional. The personal and the practical; nothing
      // clinical, and no route through the system to it either — that route
      // is Ananya telling her, if Ananya wants to.
      if (domain === 'clinical' || domain === 'health') return 'refuse'
      return 'allow'

    default:
      return 'refuse'
  }
}

/** What this person cannot see, said once, in their own words. */
export function boundaryFor(role: Role | null): { what: string; who: string } | null {
  switch (role) {
    case 'patient':
      return null
    case 'psychologist':
    case 'psychiatrist':
    case 'gp':
      return null
    case 'therapist':
    case 'ot':
      return {
        what: 'Medication and psychiatric records are not part of your access to this record.',
        who: 'Dr Kavita Nair, Dr Arun Deshpande and Dr Vikram Rao',
      }
    case 'clinic':
      return {
        what: 'Clinical session content is not part of your access to this record.',
        who: 'Dr Kavita Nair, Dr Arun Deshpande and Dr Vikram Rao',
      }
    case 'employer':
      return {
        what: 'Health information is not part of your access to this record.',
        who: "Ananya's clinical team",
      }
    case 'university':
      return {
        what: 'Health information is not part of your access to this record.',
        who: "Ananya's clinical team",
      }
    case 'trusted':
      return {
        what: 'Health and clinical information is not part of what Ananya has shared with you.',
        who: "Ananya, and her clinical team",
      }
    default:
      return null
  }
}

/** Plain names for the domains, for the refusal and the standing boundary. */
export const domainName: Record<Domain, string> = {
  clinical: 'Clinical information',
  health: 'Health information',
  work: 'Workplace information',
  education: 'Course and university information',
  personal: 'Personal information',
  support: 'Support and strategies',
}

/**
 * A role, in the words people actually use for it.
 *
 * The enum values are database identifiers — `ot`, `gp`, `clinic` — and putting
 * them on a screen asks somebody to expand an abbreviation before they can read
 * a sentence. "Clinic" in particular is not what Priya's job is called; she
 * coordinates, and the label says so.
 */
export const ROLE_LABEL: Record<string, string> = {
  patient: 'The person themselves',
  psychologist: 'Psychologist',
  psychiatrist: 'Psychiatrist',
  therapist: 'Therapist',
  ot: 'Occupational therapist',
  gp: 'GP',
  clinic: 'Care coordinator',
  employer: 'Employer',
  university: 'University',
  trusted: 'Trusted person',
  admin: 'Administrator',
}
