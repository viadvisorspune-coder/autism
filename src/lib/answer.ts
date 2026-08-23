import {
  TODAY,
  appointmentsFor,
  connections,
  documentsFor,
  eventsFor,
  people,
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

export interface LocalAction {
  label: string
  /** Where it goes, or what to ask ORCA next. One or the other, never both. */
  to?: string
  ask?: string
}

export interface LocalAnswer {
  /** The answer itself. One or two sentences. Nothing else goes here. */
  text: string
  /** Everything a person might want next, behind one press. Never shown first. */
  detail?: string
  /** What to do about it, if there is anything. */
  actions?: LocalAction[]
  sources: LocalSource[]
  /** False when nothing in the record matched, so callers can stop explaining. */
  matched?: boolean
}

const DAY = 86_400_000
const daysFromToday = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / DAY)

/** "25 August 2026", not "2026-08-25". Nobody says the second one. */
function say(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

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
  /* --------------------------------------------------- who is this person */
  // Asked before anything else, because a question that names somebody is
  // almost always about them and not about the topic words around them.
  // "Who is Kavita again?" is the commonest thing anyone asks a record, and
  // until now it fell through to a generic summary — which reads as an answer
  // and is not one.
  const named = personIn(question)
  if (named) {
    const link = connections.find((c) => c.patientId === patientId && c.personId === named.id)
    const who = `${named.name}${named.title ? `, ${named.title.toLowerCase()}` : ''}${named.organisation ? ` at ${named.organisation}` : ''}`

    if (!link) {
      return {
        text: `That is ${who}. They are not connected to your record, so they cannot see any of it.`,
        actions: [{ label: 'See who can', to: '/patient/privacy' }],
        sources: [],
      }
    }

    const detail = [
      `You gave them access on ${say(link.consentGiven)}, for one reason: ${link.purpose.toLowerCase()}.`,
      `They can see ${link.accessScope.join(', ').toLowerCase()} — and nothing else.`,
      `That is ${link.consentStatus === 'Active' ? 'still active' : link.consentStatus.toLowerCase()} and comes up for review on ${say(link.reviewDue)}.`,
      link.lastInteraction ? `They last looked at your record on ${say(link.lastInteraction)}.` : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    const next = appointmentsFor(patientId).find(
      (a) => a.professionalId === named.id && a.status !== 'Completed',
    )

    return {
      text: `That is ${who} — your ${link.relationship.toLowerCase()}.${next ? ` You are seeing them on ${say(next.datetime)}.` : ''}`,
      detail,
      actions: [
        { label: 'What they can see', to: '/patient/privacy' },
        next ? { label: 'Open the appointment', to: `/patient/care/appointments/${next.id}` } : null,
      ].filter(Boolean) as LocalAction[],
      sources: [
        { label: `What ${named.name.split(' ').slice(-1)[0]} can see`, detail: link.relationship, to: '/patient/privacy' },
      ],
    }
  }

  /* ------------------------------------------------- who can see my record */
  if (has(question, 'who can see', 'who has access', 'access to my', 'sharing', 'shared with')) {
    const active = connections.filter((c) => c.patientId === patientId && c.consentStatus === 'Active')
    if (active.length) {
      return {
        text: `${active.length} people can see part of your record — each of them a named part of it, and nothing more.`,
        detail: active
          .map(
            (c) =>
              `${personName(c.personId)} — ${c.relationship.toLowerCase()}.\nCan see ${c.accessScope.join(', ').toLowerCase()}. Review due ${say(c.reviewDue)}.`,
          )
          .join('\n\n'),
        actions: [{ label: 'Change who can see what', to: '/patient/privacy' }],
        sources: [{ label: 'Who can see your record', detail: 'All connections', to: '/patient/privacy' }],
      }
    }
  }

  /* ------------------------------------------------- what has been tried */
  if (has(question, 'tried', 'strategy', 'strategies', 'worked', 'helping', 'helped', 'working')) {
    const all = strategiesFor(patientId)
    if (all.length) {
      const helped = all.filter((x) => x.outcome?.effectiveness === 'Helped').length
      const partly = all.filter((x) => x.outcome?.effectiveness === 'Partly helped').length
      const didnt = all.filter((x) => x.outcome?.effectiveness === 'Did not help').length
      const running = all.filter((x) => x.status === 'Active')

      return {
        text:
          `You have tried ${all.length} things. ` +
          [helped ? `${helped} helped` : null, partly ? `${partly} partly helped` : null, didnt ? `${didnt} did not` : null]
            .filter(Boolean)
            .join(', ') +
          (running.length ? `, and ${running.length} ${running.length === 1 ? 'is' : 'are'} still running.` : '.'),
        detail: all
          .map((x) => {
            const last = [...x.checkIns].sort((a, b) => a.date.localeCompare(b.date)).pop()
            return [
              `${x.title} — ${x.status.toLowerCase()}, ${x.checkIns.length} check-in${x.checkIns.length === 1 ? '' : 's'}.`,
              last ? `Last, ${say(last.date)}: it ${last.helpfulness.toLowerCase()}. ${last.note}` : null,
              x.outcome ? `Outcome: ${x.outcome.summary}` : null,
            ]
              .filter(Boolean)
              .join('\n')
          })
          .join('\n\n'),
        actions: [
          { label: 'Open my support', to: '/patient/support' },
          running.length ? { label: 'Add how it is going', to: `/patient/support/${running[0].id}` } : null,
        ].filter(Boolean) as LocalAction[],
        sources: all.slice(0, 3).map((x) => ({ label: x.title, detail: x.status, to: `/patient/support/${x.id}` })),
      }
    }
  }

  /* ------------------------------------------------------ what is open */
  if (has(question, 'unresolved', 'waiting', 'open', 'stuck', 'heard back', 'request', 'employer', 'university', 'work')) {
    const open = requestsFor(patientId).filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled')
    if (open.length) {
      const yours = open.filter((r) => r.clarifications.some((c) => !c.answer))
      return {
        text: yours.length
          ? `${open.length} ${open.length === 1 ? 'request is' : 'requests are'} open, and ${yours.length} ${yours.length === 1 ? 'is' : 'are'} waiting on you.`
          : `${open.length} ${open.length === 1 ? 'request is' : 'requests are'} open. None of them need you right now.`,
        detail: open
          .map((r) => {
            const unanswered = r.clarifications.filter((c) => !c.answer)
            return [
              `${r.title} — with ${r.currentOwner} since ${say(r.raised)}.`,
              unanswered.length ? `They asked: “${unanswered[0].question}”` : null,
            ]
              .filter(Boolean)
              .join('\n')
          })
          .join('\n\n'),
        actions: [{ label: 'Open requests', to: '/patient/requests' }],
        sources: open.map((r) => ({ label: r.title, detail: r.status, to: `/patient/requests/${r.id}` })),
      }
    }
  }

  /* --------------------------------------------------------- what changed */
  if (has(question, 'changed', 'change', 'recent', 'lately', 'happened', 'since')) {
    const recent = eventsFor(patientId).slice(0, 5)
    if (recent.length) {
      return {
        text: `${recent.length} things have gone in recently. The latest was ${recent[0].title.toLowerCase()}, on ${say(recent[0].date)}.`,
        detail: recent.map((e) => `${say(e.date)} — ${e.title}\n${e.summary}`).join('\n\n'),
        actions: [{ label: 'Open my story', to: '/patient/story' }],
        sources: recent.slice(0, 3).map((e) => ({ label: e.title, detail: e.category, to: `/patient/story/${e.id}` })),
      }
    }
  }

  /* ------------------------------------------------------- appointments */
  if (has(question, 'appointment', 'session', 'prepare', 'seeing', 'meeting with', 'when is', 'next')) {
    const soon = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')
    if (soon.length) {
      const next = soon[0]
      const away = daysFromToday(next.datetime.slice(0, 10))
      return {
        text: `You are seeing ${personName(next.professionalId)} on ${say(next.datetime)}${away >= 0 ? `, ${away === 0 ? 'today' : `in ${away} days`}` : ''} — ${next.purpose.toLowerCase()}.`,
        detail: soon
          .map((a) => `${say(a.datetime)} — ${a.purpose} with ${personName(a.professionalId)}.\n${a.location}. Brief is ${a.preparationStatus.toLowerCase()}.`)
          .join('\n\n'),
        actions: [
          { label: 'Get ready for it', to: `/patient/care/appointments/${next.id}/prepare` },
          { label: 'Open it', to: `/patient/care/appointments/${next.id}` },
        ],
        sources: [{ label: next.purpose, detail: personName(next.professionalId), to: `/patient/care/appointments/${next.id}` }],
      }
    }
  }

  /* ---------------------------------------------------------- documents */
  if (has(question, 'document', 'letter', 'report', 'upload', 'evidence', 'handbook')) {
    const docs = documentsFor(patientId)
    if (docs.length) {
      const waiting = docs.filter((d) => d.status === 'Awaiting review')
      return {
        text: `You have ${docs.length} documents saved${waiting.length ? `, and ${waiting.length} still ${waiting.length === 1 ? 'needs' : 'need'} you to check what was read out of ${waiting.length === 1 ? 'it' : 'them'}` : ''}.`,
        detail: docs.map((d) => `${d.title} — ${d.category}, ${d.status.toLowerCase()}, added ${say(d.date)}.`).join('\n\n'),
        actions: [{ label: 'Open documents', to: '/patient/documents' }],
        sources: docs.slice(0, 3).map((d) => ({ label: d.title, detail: d.category, to: `/patient/documents/${d.id}` })),
      }
    }
  }

  /* -------------------------------------------- what is recorded about me */
  if (has(question, 'about me', 'know about', 'understand', 'profile', 'remember', 'pattern')) {
    const held = profileItems.slice(0, 6)
    if (held.length) {
      return {
        text: `${held.length} things are recorded about you, each with a source and a date. None of it is fixed.`,
        detail: held.map((x) => `${x.text}\n${x.section} · ${x.evidence.toLowerCase()} · ${say(x.date)}`).join('\n\n'),
        actions: [{ label: 'Edit or remove any of it', to: '/patient/profile' }],
        sources: [{ label: 'My profile', detail: 'Everything recorded about you', to: '/patient/profile' }],
      }
    }
  }

  /* ------------------------------------------------------------ fallback */
  // Nothing matched. Say so.
  //
  // The previous version answered anyway, with a summary of everything open.
  // That reads as an answer, which makes it worse than silence: someone who
  // asked a specific question and received a confident paragraph about
  // something else has been misled, not helped.
  return {
    text: 'I could not match that to anything in your record — and I would rather say so than answer a different question.',
    actions: [
      { label: 'What have I tried?', ask: 'What have I tried and did any of it work?' },
      { label: 'Who can see my record?', ask: 'Who can see my record?' },
      { label: 'When is my next appointment?', ask: 'When is my next appointment?' },
      { label: 'What has changed?', ask: 'What has changed recently?' },
    ],
    sources: [],
    matched: false,
  }
}

/**
 * Somebody this record knows, mentioned by name.
 *
 * Matches on surname and on first name, because people say "Kavita" and
 * "Dr Nair" for the same person and neither is the full string in the record.
 * Short tokens are excluded so that "Rao" — shared by three people here —
 * cannot resolve to a confident wrong answer.
 */
function personIn(question: string) {
  const q = question.toLowerCase()
  const asking = /\bwho(?:'s| is| are)?\b|\bwhat does\b|\btell me about\b|\bremind me\b/.test(q)

  const hits = people.filter((person) =>
    person.name
      .toLowerCase()
      .replace(/^dr\.? /, '')
      .split(/\s+/)
      .filter((token) => token.length > 3)
      .some((token) => q.includes(token)),
  )

  // Exactly one person, and either a question word or nothing else to go on.
  if (hits.length === 1 && (asking || q.split(/\s+/).length <= 6)) return hits[0]
  return null
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
/**
 * Whether this conversation has already been told the agent is unavailable.
 *
 * Said once. Repeating it on every message buries the answer under forty words
 * of apology the person read the first time and now has to scroll past — which
 * is how "who is Tejas?" ended up with its two-line answer at the bottom of a
 * paragraph about ORCA's internal architecture. Nobody needs to be told twice
 * that a service is down; they need to be told once and then answered.
 */
let toldThisSession = false

export function resetOfflineNotice() {
  toldThisSession = false
}

export function offlineReply(
  question: string,
  patientId: string,
  role: string | null,
): LocalAnswer {
  const forPatient = role === 'patient' || role === 'trusted'
  const first = !toldThisSession
  toldThisSession = true

  if (!forPatient) {
    const answer = answerFromRecord(question, patientId)
    return {
      ...answer,
      text: first
        ? `${answer.text}\n\nRead directly from the record — the workflow service is unreachable, so this is a lookup rather than analysis.`
        : answer.text,
    }
  }

  if (looksLikeFeeling(question)) {
    const clinician = careContact(patientId)
    const waiting = whatIsWaiting(patientId)
    return {
      text: 'Thank you for telling me. I am not going to try to interpret that — you know how you feel better than I do.',
      detail: [
        first
          ? 'I also cannot reach the part of me that works things through at the moment, so I have not started anything and I have not told anyone.'
          : null,
        waiting.line ? `In case one of these is the thing sitting on you: ${waiting.line}` : null,
        clinician
          ? `${clinician.name} is connected to your record, if you would rather talk to a person than to me.`
          : null,
        'You do not have to do anything with any of this today.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      actions: [
        { label: 'Message someone', to: '/patient/care/team' },
        { label: 'What is unfinished?', ask: 'What is still open and waiting on someone?' },
      ],
      sources: waiting.sources,
    }
  }

  const answer = answerFromRecord(question, patientId)
  if (!first) return answer

  // The answer goes first, and the caveat goes last.
  //
  // Every reply used to open by announcing its own condition — "I cannot
  // reach the part of me that works things through" — before saying anything
  // to the person who had asked a question. That is a machine describing
  // itself to somebody who wanted to know when their appointment is, and no
  // amount of polite wording fixes the order. Somebody who does not care that
  // a service is degraded can now stop reading after the first line and will
  // have lost nothing.
  if (answer.matched === false) {
    // Nothing was read, so it must not claim to have read anything.
    return {
      ...answer,
      text: `${answer.text}\n\nI am also working without the part of me that thinks things through at the moment, so I can look things up but not reason about them.`,
    }
  }

  return {
    ...answer,
    text: `${answer.text}\n\nThat is read straight from your record rather than thought through — the part of me that does the thinking is unavailable just now. Nothing was started and nobody was contacted.`,
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
