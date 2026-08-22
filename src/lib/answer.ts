import {
  TODAY,
  appointmentsFor,
  documentsFor,
  eventsFor,
  personName,
  profileItems,
  requestsFor,
  strategiesFor,
} from '../data/db'

/**
 * Answering from the record, without the agent.
 *
 * ORCA's full reply is a multi-step workflow run on Yoxa: it reads the record,
 * weighs evidence, works out who has authority, and stops where a person is
 * needed. When that service is unavailable — which, as of writing, it is —
 * the interface used to say so and stop.
 *
 * That is the wrong failure. "The workflow service returned 500" is true and
 * completely useless to someone who has just typed out a difficult week. The
 * record is right here in the browser; most of what people actually ask can be
 * answered from it directly, and refusing to because a remote service is down
 * is the software protecting its own architecture rather than the person.
 *
 * So this is the floor: a grounded, sourced answer built by matching the
 * question against what is actually in this person's record. It is honest
 * about what it is — the caller says plainly that the agent did not run and
 * this is a direct read — and it deliberately does not attempt the parts that
 * need the agent. It will not weigh conflicting evidence, will not decide
 * anything, and will not act. It reports.
 *
 * The rule it must never break: everything it says is drawn from a record it
 * can name. It has no model behind it and must never sound like it does.
 */

export interface LocalSource {
  label: string
  detail: string
  to: string
}

export interface LocalAnswer {
  text: string
  sources: LocalSource[]
}

const DAY = 86_400_000
const daysFromToday = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / DAY)

function has(question: string, ...words: string[]): boolean {
  const q = question.toLowerCase()
  return words.some((w) => q.includes(w))
}

/**
 * What this person's record can say about this question, right now.
 *
 * Ordered by specificity: a question that names a topic gets that topic. A
 * question that names nothing gets an honest summary of what is open, which is
 * the most useful thing to say to somebody who has not asked anything precise
 * — and is still every bit as sourced.
 */
export function answerFromRecord(question: string, patientId: string): LocalAnswer {
  const strategies = strategiesFor(patientId)
  const requests = requestsFor(patientId)
  const appointments = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')
  const documents = documentsFor(patientId)
  const events = eventsFor(patientId)

  const sources: LocalSource[] = []
  const lines: string[] = []

  /* ------------------------------------------------- what has been tried */
  if (has(question, 'tried', 'strategy', 'strategies', 'worked', 'helping', 'helped', 'working')) {
    strategies.forEach((s) => {
      const last = [...s.checkIns].sort((a, b) => a.date.localeCompare(b.date)).pop()
      lines.push(
        `${s.title} — ${s.status.toLowerCase()}, ${s.phase.toLowerCase()}, ${s.checkIns.length} check-in${s.checkIns.length === 1 ? '' : 's'}.` +
          (last ? ` The most recent said it ${last.helpfulness.toLowerCase()}: ${last.note}` : '') +
          (s.outcome ? ` Outcome recorded: ${s.outcome.summary}` : ''),
      )
      sources.push({
        label: s.title,
        detail: `${s.status} · ${s.phase}`,
        to: `/patient/support/${s.id}`,
      })
    })
  }

  /* ------------------------------------------------------ what is open */
  if (has(question, 'unresolved', 'waiting', 'open', 'stuck', 'heard back', 'request', 'employer', 'university', 'work')) {
    requests
      .filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled')
      .forEach((r) => {
        const unanswered = r.clarifications.filter((c) => !c.answer)
        lines.push(
          `${r.title} — with ${r.currentOwner} since ${r.raised}.` +
            (unanswered.length ? ` They asked: “${unanswered[0].question}” and nobody has answered.` : ''),
        )
        sources.push({
          label: r.title,
          detail: `${r.status} · ${r.destination}`,
          to: `/patient/requests/${r.id}`,
        })
      })
  }

  /* --------------------------------------------------------- what changed */
  if (has(question, 'changed', 'change', 'recent', 'lately', 'happened', 'since')) {
    events.slice(0, 4).forEach((e) => {
      lines.push(`${e.date} — ${e.title}. ${e.summary}`)
      sources.push({ label: e.title, detail: `${e.category} · ${e.evidence}`, to: `/patient/story/${e.id}` })
    })
  }

  /* ------------------------------------------------------- appointments */
  if (has(question, 'appointment', 'session', 'prepare', 'seeing', 'meeting with')) {
    appointments.forEach((a) => {
      const away = daysFromToday(a.datetime.slice(0, 10))
      lines.push(
        `${a.purpose} with ${personName(a.professionalId)}, ${a.datetime.slice(0, 10)}` +
          (away >= 0 ? ` — ${away === 0 ? 'today' : `in ${away} days`}` : '') +
          `. The brief is ${a.preparationStatus.toLowerCase()}.`,
      )
      sources.push({
        label: a.purpose,
        detail: personName(a.professionalId),
        to: `/patient/care/appointments/${a.id}`,
      })
    })
  }

  /* ---------------------------------------------------------- documents */
  if (has(question, 'document', 'letter', 'report', 'upload', 'evidence', 'handbook')) {
    documents.slice(0, 3).forEach((d) => {
      lines.push(`${d.title} — ${d.category}, ${d.status.toLowerCase()}, added ${d.date}.`)
      sources.push({ label: d.title, detail: d.category, to: `/patient/documents/${d.id}` })
    })
  }

  /* -------------------------------------------- what is recorded about me */
  if (has(question, 'about me', 'know about', 'understand', 'profile', 'remember', 'pattern')) {
    profileItems.slice(0, 4).forEach((p) => {
      lines.push(`${p.text} (${p.section}, ${p.evidence.toLowerCase()}, ${p.date})`)
      sources.push({ label: p.text.slice(0, 48), detail: p.section, to: '/patient/profile' })
    })
  }

  /* ------------------------------------------------------------ fallback */
  if (!lines.length) {
    // Nothing in the question matched a topic. Rather than guess at what was
    // meant, say what is currently open — which is what somebody who has not
    // asked anything precise almost always wants to know.
    const openRequests = requests.filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled')
    const active = strategies.filter((s) => s.status === 'Active')

    if (active.length) {
      lines.push(
        `You are currently trying ${active.map((s) => s.title.toLowerCase()).join(' and ')}.`,
      )
      active.forEach((s) =>
        sources.push({ label: s.title, detail: s.phase, to: `/patient/support/${s.id}` }),
      )
    }
    if (openRequests.length) {
      lines.push(
        `${openRequests.length} request${openRequests.length === 1 ? ' is' : 's are'} still open: ${openRequests
          .map((r) => `${r.title}, with ${r.currentOwner}`)
          .join('; ')}.`,
      )
      openRequests.forEach((r) =>
        sources.push({ label: r.title, detail: r.status, to: `/patient/requests/${r.id}` }),
      )
    }
    if (appointments.length) {
      const next = appointments[0]
      lines.push(
        `Your next appointment is ${next.purpose.toLowerCase()} with ${personName(next.professionalId)} on ${next.datetime.slice(0, 10)}.`,
      )
    }
    if (!lines.length) lines.push('There is nothing open in your record at the moment.')
  }

  return {
    text: lines.join('\n\n'),
    // Dedupe: the same strategy can match two clauses of one question, and
    // citing it twice makes the answer look better sourced than it is.
    sources: sources.filter((s, i, all) => all.findIndex((o) => o.to === s.to) === i).slice(0, 5),
  }
}

/**
 * Not everything typed into a chat box is a question.
 *
 * "I feel unhappy" is not a request for a list of open requests. Treating it
 * as one — which is what a keyword matcher does by default — produces the
 * single worst response this product could give: someone discloses distress
 * and receives an inventory.
 *
 * The test is deliberately narrow. It looks for first-person statements about
 * how someone is, not for sad-sounding words anywhere in a sentence, because
 * "the meeting was awful" is a report about a meeting and should be answered
 * as one. When it is unsure it says no, and the ordinary path handles it.
 */
const FEELING = [
  /\bi (?:feel|am feeling|felt)\b/i,
  /\bi(?:'m| am)\s+(?:so\s+|really\s+|very\s+)?(?:sad|unhappy|low|tired|exhausted|anxious|scared|angry|lonely|overwhelmed|numb|done|struggling|not ok|not okay)\b/i,
  /\b(?:everything|it all|things)\s+(?:is|are|feels?)\s+(?:too much|awful|hard|a lot)\b/i,
  /\bcan'?t cope\b|\bcannot cope\b|\bhad enough\b/i,
]

export function looksLikeFeeling(text: string): boolean {
  return FEELING.some((pattern) => pattern.test(text))
}

/**
 * One reply, in ORCA's voice, when the reasoning service is unavailable.
 *
 * Replaces three separate bubbles — a technical error, a meta-explanation, and
 * a data dump — with a single message, because three consecutive machine
 * noises is not how anyone would answer a person.
 *
 * What it will not do:
 *
 *   · Show a support reference to a patient. That number exists for whoever
 *     maintains this software. Ananya does not have a support desk, and a
 *     hexadecimal string in a conversation about a bad week is noise at
 *     precisely the wrong moment. It stays in the diagnostic panel.
 *   · Interpret a feeling. It acknowledges, states what it cannot do, and
 *     offers a person — which is the same rule the agent follows when it is
 *     working: where something belongs to a human, stop and say so.
 *   · Lead with the record. When somebody says they feel unhappy, what is in
 *     their file comes second, offered rather than delivered.
 */
export function offlineReply(
  question: string,
  patientId: string,
  role: string | null,
): LocalAnswer {
  const forPatient = role === 'patient' || role === 'trusted'

  if (!forPatient) {
    const answer = answerFromRecord(question, patientId)
    return {
      text: `I could not reach the workflow service, so nothing was started. Reading the record directly instead — this is a lookup, not analysis.\n\n${answer.text}`,
      sources: answer.sources,
    }
  }

  if (looksLikeFeeling(question)) {
    const clinician = careContact(patientId)
    const waiting = whatIsWaiting(patientId)

    return {
      text: [
        'Thank you for telling me. I am not going to try to interpret that — you know how you feel better than I do, and it is not mine to explain.',
        'I also cannot reach the part of me that works things through at the moment, so I have not started anything and I have not told anyone.',
        waiting.line
          ? `If it helps, here is what is currently unfinished, in case one of these is the thing sitting on you: ${waiting.line}`
          : 'There is nothing unfinished in your record at the moment that I can point to.',
        clinician
          ? `If you would rather talk to a person than to me, ${clinician.name} is connected to your record and you can message them from your care team page.`
          : 'If you would rather talk to a person than to me, you can add someone to your care team.',
        'You do not have to do anything with any of this today.',
      ].join('\n\n'),
      sources: waiting.sources,
    }
  }

  const answer = answerFromRecord(question, patientId)
  return {
    text: [
      'I cannot reach the part of me that works things through right now, so nothing has been started and nobody has been contacted.',
      'I can still read your record, which is what follows — a straight lookup rather than me thinking about it.',
      answer.text,
    ].join('\n\n'),
    sources: answer.sources,
  }
}

/** Open things, phrased as one sentence rather than an inventory. */
function whatIsWaiting(patientId: string): { line: string | null; sources: LocalSource[] } {
  const sources: LocalSource[] = []
  const parts: string[] = []

  requestsFor(patientId)
    .filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled')
    .forEach((r) => {
      parts.push(`${r.title.toLowerCase()}, still with ${r.currentOwner}`)
      sources.push({ label: r.title, detail: r.status, to: `/patient/requests/${r.id}` })
    })

  strategiesFor(patientId)
    .filter((s) => s.status === 'Active')
    .forEach((s) => {
      parts.push(`${s.title.toLowerCase()}, which you are still trying`)
      sources.push({ label: s.title, detail: s.phase, to: `/patient/support/${s.id}` })
    })

  if (!parts.length) return { line: null, sources }
  return { line: `${parts.join('; ')}.`, sources: sources.slice(0, 4) }
}

/** Somebody real, already connected, who could be asked instead of ORCA. */
function careContact(patientId: string): { name: string } | null {
  const next = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')[0]
  if (next) return { name: personName(next.professionalId) }
  return null
}

/**
 * What ORCA says before a direct read, so nobody mistakes it for the agent.
 *
 * It names the failure without making the person carry it, and it is explicit
 * about the difference: this is a lookup, not a piece of reasoning, and the
 * things that need the agent have not happened.
 */
export function fallbackPreamble(): string {
  return (
    'I cannot reach the part of me that works things through right now, so nothing has been ' +
    'started and nobody has been contacted. I can still read your record directly, which is ' +
    'what follows — it is a straight lookup rather than me thinking about it, and I have said ' +
    'where each part comes from.'
  )
}
