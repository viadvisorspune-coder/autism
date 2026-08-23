import {
  TODAY,
  appointmentsFor,
  connections,
  documentsFor,
  eventsFor,
  people,
  personName,
  profileFor,
  requestsFor,
  sessionNotes,
  strategiesFor,
} from '../data/db'

/**
 * Answering from the record. The first thing that happens, not the last.
 *
 * This began as a fallback for when the workflow service was down, and it was
 * a good fallback — but building it made the real problem obvious. Nearly
 * everything people actually ask ORCA is a question about their own record,
 * and their own record is already in this tab. Sending "who is Tejas?" to a
 * remote reasoning pipeline, waiting three minutes and answering with a PDF is
 * not a richer answer to that question. It is a worse one, delivered late.
 *
 * So this is now the front door. Every message is answered from here first,
 * instantly, with sources. The workflow runs behind it only when something has
 * to actually happen — a letter written, a request sent, another person told —
 * because those need consent checks, authority checks and an audit trail that
 * have no business running in a browser.
 *
 * What it deliberately will not do: weigh conflicting evidence, decide
 * anything, or act. It reports. And the rule it must never break is that
 * everything it says is drawn from a record it can name. There is no model
 * behind it and it must never sound like there is.
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
  /**
   * The same words again, but on the slow path — where ORCA reasons about them
   * instead of looking them up. The only door to the workflow that a question
   * can open, and only a person opens it.
   */
  think?: string
}

/**
 * Somewhere in the interface, named by somebody who wants to be there.
 *
 * Every screen is listed with the words people actually use for it, which are
 * rarely the words in the navigation. Nobody says "support strategies" — they
 * say "what am I trying".
 */
interface Destination {
  to: string
  label: string
  line: string
  words: RegExp
}

const PLACES: Destination[] = [
  {
    to: '/patient/story',
    label: 'My story',
    line: 'Opening your story.',
    words: /\b(my story|the story|timeline|my history|what has happened)\b/i,
  },
  {
    to: '/patient/profile',
    label: 'My profile',
    line: 'Opening your profile — everything recorded about you, with where each part came from.',
    words: /\b(my profile|about me|what (do you|orca) know|what is recorded)\b/i,
  },
  {
    to: '/patient/support',
    label: 'My support',
    line: 'Opening what you are trying.',
    words: /\b(my support|my strategies|what am i trying|the trial)\b/i,
  },
  {
    to: '/patient/calendar',
    label: 'Calendar',
    line: 'Opening your calendar.',
    words: /\b(my calendar|my diary|my appointments|what is booked)\b/i,
  },
  {
    to: '/patient/documents',
    label: 'Documents',
    line: 'Opening your documents.',
    words: /\b(my documents|my files|my letters|my reports)\b/i,
  },
  {
    to: '/patient/privacy',
    label: 'Privacy and sharing',
    line: 'Opening privacy and sharing.',
    words: /\b(my privacy|sharing settings|who i share)\b/i,
  },
  {
    to: '/patient/requests',
    label: 'My requests',
    line: 'Opening your requests.',
    words: /\b(my requests|what i have asked for)\b/i,
  },
  {
    to: '/patient/progress',
    label: 'Progress',
    line: 'Opening your progress.',
    words: /\b(my progress|how am i doing|what has changed overall)\b/i,
  },
]

/**
 * Everything that has moved, assembled into something readable.
 *
 * The question before a session is never "tell me about this person" — it is
 * "what has changed since I last saw them, and is anything working". Both are
 * arithmetic over the record: how many entries, over what span, from how many
 * people; which strategies are running and what their check-ins said; what is
 * open and whose desk it is on.
 *
 * Nothing here is interpreted. It counts, dates and quotes. Where a clinician
 * wants the meaning rather than the material, that is the slow path, and the
 * answer ends by saying so rather than pretending to have done it.
 */
function catchUp(patientId: string): LocalAnswer | null {
  const events = eventsFor(patientId)
  const strategies = strategiesFor(patientId)
  const open = requestsFor(patientId).filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled')
  const next = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')[0]
  if (!events.length && !strategies.length) return null

  const recent = events.slice(0, 5)
  const voices = new Set(recent.map((e) => e.sourceId).filter(Boolean))
  const running = strategies.filter((s) => s.status === 'Active')
  const helped = strategies.filter((s) => s.outcome?.effectiveness === 'Helped')
  const didnt = strategies.filter((s) => s.outcome?.effectiveness === 'Did not help')

  const lead = [
    recent.length
      ? `${recent.length} ${recent.length === 1 ? 'entry' : 'entries'} since ${say(recent[recent.length - 1].date)}${voices.size > 1 ? `, from ${voices.size} people` : ''}.`
      : null,
    running.length
      ? `${running.length} ${running.length === 1 ? 'strategy is' : 'strategies are'} running.`
      : 'Nothing is currently being tried.',
    open.length ? `${open.length} open with ${open[0].currentOwner}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const detail = [
    recent.length
      ? `What has gone in\n${recent.map((e) => `${say(e.date)} — ${e.title} (${personName(e.sourceId)})`).join('\n')}`
      : null,
    strategies.length
      ? `Where the strategies stand\n${strategies
          .map((x) => {
            const last = [...x.checkIns].sort((a, b) => a.date.localeCompare(b.date)).pop()
            return `${x.title} — ${x.status.toLowerCase()}${
              last ? `. Last check-in ${say(last.date)}: it ${last.helpfulness.toLowerCase()}. ${last.note}` : '. No check-ins yet.'
            }`
          })
          .join('\n')}`
      : null,
    helped.length || didnt.length
      ? `What the record says works\n${[
          helped.length ? `Helped: ${helped.map((s) => s.title.toLowerCase()).join('; ')}` : null,
          didnt.length ? `Did not: ${didnt.map((s) => s.title.toLowerCase()).join('; ')}` : null,
        ]
          .filter(Boolean)
          .join('\n')}`
      : null,
    open.length
      ? `Still open\n${open.map((r) => `${r.title} — with ${r.currentOwner} since ${say(r.raised)}`).join('\n')}`
      : null,
    next ? `Next appointment\n${say(next.datetime)} — ${next.purpose}. Brief is ${next.preparationStatus.toLowerCase()}.` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    text: `${lead}\n\nThis is counted from the record, not interpreted. Ask me to think it through if you want what it means.`,
    detail,
    actions: [
      { label: 'Open the timeline', to: '/patient/story' },
      { label: 'What does this mean?', think: `What is the pattern across this record, and what should change?` },
    ],
    sources: recent.slice(0, 3).map((e) => ({
      label: e.title,
      detail: `${personName(e.sourceId)} · ${say(e.date)}`,
      to: `/patient/story/${e.id}`,
    })),
  }
}

/**
 * One document, named well enough to be sure which.
 *
 * Requires a word of asking plus enough of the title to be unambiguous. Two
 * matches means the person has not said which, and answering with the first is
 * a guess presented as a fact — so it declines and lets the topic search offer
 * both.
 */
function documentIn(question: string, patientId: string) {
  if (!/\b(show|open|get|find|send|give|where is|bring up|i want|need)\b/i.test(question)) return null

  const q = question.toLowerCase()
  const hits = documentsFor(patientId).filter((d) => {
    const words = d.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3)
    // At least two distinctive words from the title, or one long rare one.
    const found = words.filter((w) => q.includes(w))
    return found.length >= 2 || found.some((w) => w.length >= 8)
  })

  return hits.length === 1 ? hits[0] : null
}

/**
 * Asking to be taken somewhere, rather than asking about it.
 *
 * "Show me my story" wants the page. "What is in my story" wants an answer.
 * The difference is a verb of showing or going, so that is what is required —
 * a bare mention of a screen name is not a request to leave the conversation,
 * and moving somebody who did not ask to move is the rudest thing an interface
 * can do to a person who finds unexpected change expensive.
 */
const GO = /\b(show|open|take me|go to|bring up|see|view|jump to|navigate)\b/i

function destinationIn(question: string): Destination | null {
  if (!GO.test(question)) return null
  return PLACES.find((p) => p.words.test(question)) ?? null
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
  /**
   * Somewhere to go, when the person asked to be taken there.
   *
   * The caller navigates on this. Set only for an explicit request — never as
   * a helpful guess, because moving somebody who did not ask to move is the
   * rudest thing this interface could do.
   */
  goTo?: string
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
    const held = profileFor(patientId).slice(0, 6)
    if (held.length) {
      return {
        text: `${held.length} things are recorded about you, each with a source and a date. None of it is fixed.`,
        detail: held.map((x) => `${x.text}\n${x.section} · ${x.evidence.toLowerCase()} · ${say(x.date)}`).join('\n\n'),
        actions: [{ label: 'Edit or remove any of it', to: '/patient/profile' }],
        sources: [{ label: 'My profile', detail: 'Everything recorded about you', to: '/patient/profile' }],
      }
    }
  }

  /* --------------------------------------------------------- catch me up */
  // What a clinician asks for in the ninety seconds before a session, and the
  // one thing that genuinely needs assembling rather than looking up. Computed
  // here rather than sent away, because every part of it is arithmetic over
  // the record — counts, dates, what helped — and none of it needs reasoning.
  if (has(question, 'summarise', 'summarize', 'summary', 'catch me up', 'brief me', 'bring me up to speed', 'where are we', 'where are they')) {
    const brief = catchUp(patientId)
    if (brief) return brief
  }

  /* ------------------------------------------------- a particular document */
  // "Show me the OT report" names a thing that already exists. Producing a new
  // document in answer to that would be absurd, and describing it is not much
  // better — the honest reply is the document.
  const wanted = documentIn(question, patientId)
  if (wanted) {
    return {
      text: `${wanted.title} — ${wanted.category.toLowerCase()}, added ${say(wanted.date)}${
        wanted.status === 'Awaiting review' ? '. You have not checked what was read out of it yet.' : '.'
      }`,
      detail: wanted.extracted.length
        ? wanted.extracted.map((x) => `${x.label}\n${x.value}`).join('\n\n')
        : undefined,
      actions: [{ label: 'Open it', to: `/patient/documents/${wanted.id}` }],
      sources: [{ label: wanted.title, detail: say(wanted.date), to: `/patient/documents/${wanted.id}` }],
    }
  }

  /* ------------------------------------------------ take me somewhere */
  // "Show me my story" is not a question about the record. It is a request to
  // be somewhere, and the honest answer is to open it rather than to describe
  // it. Placed after the specific lookups so that "who can see my record" is
  // still answered rather than turned into a trip to the privacy page.
  const place = destinationIn(question)
  if (place) {
    return {
      text: place.line,
      actions: [{ label: place.label, to: place.to }],
      sources: [],
      // The caller navigates on this rather than waiting to be clicked.
      goTo: place.to,
    }
  }

  /* ------------------------------------------- anything else about a topic */
  // The last real attempt, and the one that makes this a conversation rather
  // than a menu.
  //
  // Every branch above matches a *phrasing* — "who can see", "what have I
  // tried". Anything said in words the list did not anticipate fell straight
  // through to "I could not match that", including questions the record
  // answers well. "Why is the office so difficult" produced a shrug while the
  // three entries about open-plan desks, unplanned meetings and quiet-room use
  // sat one function call away — and, worse, were listed underneath as sources
  // for an answer that claimed to have found nothing.
  //
  // So the last thing tried is a plain search of the record for what was
  // actually asked about.
  const found = searchRecord(question, patientId)
  if (found.length) return aboutTopic(question, found, patientId)

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

/* ------------------------------------------------------------ topic search */

interface Hit {
  label: string
  line: string
  to: string
  date: string
  score: number
  /** Who put it there. The whole value of a shared record is knowing this. */
  who?: string
  /** Professionally documented outranks reported, all else being equal. */
  weight: number
}

/** Words that carry no topic. */
const STOP = new Set([
  'the', 'and', 'but', 'for', 'with', 'that', 'this', 'have', 'has', 'had', 'was', 'were', 'are',
  'you', 'your', 'his', 'her', 'their', 'our', 'why', 'how', 'what', 'when', 'where', 'who', 'which',
  'can', 'could', 'would', 'should', 'does', 'did', 'not', 'too', 'very', 'much', 'more', 'again',
  'still', 'just', 'some', 'any', 'there', 'here', 'from', 'into', 'out', 'off', 'about', 'been',
  'being', 'get', 'got', 'know', 'think', 'tell', 'say', 'said', 'please', 'help', 'like', 'want',
  'need', 'now', 'then', 'than', 'all', 'lot', 'bit',
])

/**
 * The words a record uses for the thing somebody just said.
 *
 * Nobody types "open-plan desk position". They type "office". This is the
 * short bridge between the two, and it is deliberately short: a long synonym
 * table starts matching things nobody asked about, and a confident answer to
 * the wrong question is worse than no answer at all.
 */
const NEARBY: Record<string, string[]> = {
  office: ['work', 'workplace', 'desk', 'open-plan', 'meeting', 'colleague', 'sprint', 'employer'],
  work: ['workplace', 'desk', 'office', 'meeting', 'employer', 'sprint'],
  job: ['work', 'employer', 'role', 'workplace'],
  boss: ['manager', 'employer', 'hr'],
  uni: ['university', 'studio', 'tutor', 'brief', 'lecture'],
  university: ['studio', 'tutor', 'brief', 'lecture'],
  noise: ['sound', 'loud', 'quiet', 'open-plan'],
  loud: ['noise', 'sound', 'quiet'],
  tired: ['fatigue', 'exhausted', 'energy'],
  meeting: ['meetings', 'handover', 'sprint', 'unplanned'],
  change: ['unplanned', 'notice', 'rescheduled', 'short notice'],
  focus: ['concentrate', 'focused', 'quiet'],
  sleep: ['sleep', 'rest', 'fatigue'],
}

/** Rough stem, so "meetings" and "difficulty" find "meeting" and "difficult". */
function root(word: string): string {
  const stripped = word.replace(/(ing|ies|ed|es|s|y)$/, '')
  return stripped.length >= 4 ? stripped : word
}

function terms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    // Three letters is not a topic unless the record has a word for it.
    .filter((w) => !STOP.has(w) && (w.length > 3 || w in NEARBY))

  const out = new Set<string>()
  const add = (word: string) => {
    // Hyphens split on both sides or not at all — "open-plan" as one token
    // could never match a haystack that had already split it in two.
    for (const part of word.split('-').filter((p) => p.length > 3)) out.add(root(part))
  }

  for (const word of words) {
    add(word)
    for (const near of NEARBY[word] ?? []) add(near)
  }
  return [...out]
}

/**
 * Everything in this record that mentions what was asked about.
 *
 * A plain substring search, scored by how many of the question's words each
 * entry contains. No model, no ranking cleverness — and every hit keeps the
 * link back to the thing it came from, so nothing is ever said that cannot be
 * opened and read.
 */
function searchRecord(question: string, patientId: string): Hit[] {
  const want = terms(question)
  if (!want.length) return []

  // Whole words, never substrings. "one" used to match inside "headphones",
  // which is how a follow-up of two words produced three confident hits about
  // noise-cancelling headphones.
  const score = (haystack: string) => {
    const words = new Set(
      haystack
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(root),
    )
    return want.filter((t) => words.has(t)).length
  }

  const hits: Hit[] = []

  for (const e of eventsFor(patientId)) {
    const n = score(`${e.title} ${e.summary} ${e.context ?? ''} ${e.category}`)
    if (n)
      hits.push({
        label: e.title,
        line: e.summary,
        to: `/patient/story/${e.id}`,
        date: e.date,
        score: n,
        who: e.sourceId ? personName(e.sourceId) : undefined,
        weight: e.evidence === 'Professionally documented' ? 1.3 : 1,
      })
  }

  // Session notes. The single richest thing in this record and, until now,
  // invisible to the part of it that answers questions — so a psychologist
  // could write up a session in detail and the patient could ask about that
  // exact session and be told nothing matched.
  for (const note of sessionNotes.filter((note) => note.patientId === patientId)) {
    const n = score(
      `${note.observations} ${note.patientReport} ${note.goals.join(' ')} ${note.actions.join(' ')}`,
    )
    if (n)
      hits.push({
        label: `Session with ${personName(note.professionalId)}`,
        line: note.observations || note.patientReport,
        to: '/patient/care',
        date: note.date,
        score: n,
        who: personName(note.professionalId),
        weight: note.status === 'Signed' ? 1.4 : 1,
      })
  }

  for (const s of strategiesFor(patientId)) {
    // The check-ins carry how it actually went, which is usually the part
    // somebody is asking about.
    const notes = s.checkIns.map((c) => c.note).join(' ')
    const n = score(`${s.title} ${s.goal} ${s.rationale} ${notes}`)
    if (n)
      hits.push({
        label: s.title,
        line: `${s.status} — ${s.goal}`,
        to: `/patient/support/${s.id}`,
        date: s.start,
        score: n,
        weight: 1.2,
      })
  }

  for (const r of requestsFor(patientId)) {
    const n = score(`${r.title} ${r.functionalRequirement} ${r.requestedAdjustment} ${r.destination}`)
    if (n)
      hits.push({
        label: r.title,
        line: `${r.status}, with ${r.currentOwner}`,
        to: `/patient/requests/${r.id}`,
        date: r.raised,
        score: n,
        weight: 1,
      })
  }

  for (const p of profileFor(patientId)) {
    const n = score(`${p.text} ${p.section}`)
    if (n)
      hits.push({
        label: p.text,
        line: p.section,
        to: '/patient/profile',
        date: p.date,
        score: n,
        weight: p.outdated ? 0.6 : 1.1,
      })
  }

  for (const d of documentsFor(patientId)) {
    const n = score(`${d.title} ${d.category}`)
    if (n)
      hits.push({
        label: d.title,
        line: d.category,
        to: `/patient/documents/${d.id}`,
        date: d.date,
        score: n,
        weight: 1,
      })
  }

  // Matches first, then how much the entry is worth, then how recent it is.
  // A signed session note from last week beats a self-reported line from March
  // that happened to share the same word.
  hits.sort(
    (a, b) => b.score * b.weight - a.score * a.weight || b.date.localeCompare(a.date),
  )

  // Two loose mentions, or one strong one. A single entry that happened to
  // share one common word is not a topic.
  const strong = hits.filter((h) => h.score >= 2)
  if (hits.length < 2 && !strong.length) return []
  return hits.slice(0, 5)
}

/**
 * What the record has on a topic, said in two sentences.
 *
 * It does not explain and does not claim to. A record can say what is in it
 * and when — the "why" belongs to the person, or to a conversation with
 * someone who knows them, and pretending otherwise would be the software
 * making something up.
 */
function aboutTopic(question: string, hits: Hit[], patientId: string): LocalAnswer {
  const asksWhy = /\bwhy\b|\bhow come\b|\bexplain\b|\bwhat does .* mean\b/i.test(question)
  const dates = hits.map((h) => h.date).sort()
  const span =
    dates.length > 1 && dates[0] !== dates[dates.length - 1]
      ? `, between ${say(dates[0])} and ${say(dates[dates.length - 1])}`
      : dates.length
        ? `, the latest on ${say(dates[dates.length - 1])}`
        : ''

  // Only a strategy that actually turned up in this search. Naming the first
  // active one and calling it "something related" was a guess dressed as a
  // finding: it was related to being active, not to the question.
  const found = new Set(hits.map((h) => h.to))
  const running = strategiesFor(patientId).find(
    (s) => s.status === 'Active' && found.has(`/patient/support/${s.id}`),
  )

  // Who it came from, counted. On a record several people write into, "three
  // things, from two people" is a materially different answer from "three
  // things you told me yourself" — and it is the difference between a note and
  // a corroborated pattern.
  const voices = new Set(hits.map((h) => h.who).filter(Boolean))
  const from =
    voices.size > 1
      ? `, from ${voices.size} people`
      : voices.size === 1
        ? `, from ${[...voices][0]}`
        : ''

  const opening = asksWhy
    ? `I cannot tell you why — that part is yours. What I can say is that ${hits.length} ${hits.length === 1 ? 'thing' : 'things'} in your record touch on this${span}${from}.`
    : `${hits.length} ${hits.length === 1 ? 'thing' : 'things'} in your record touch on that${span}${from}.`

  // Silence when there is nothing true to add. "Nothing has been tried" was
  // being said about topics where something had been tried and simply had not
  // matched the words used.
  const second = running ? ` You are already trying ${running.title.toLowerCase()}.` : ''

  const actions: LocalAction[] = [{ label: 'See them together', to: '/patient/story' }]
  if (running) actions.push({ label: 'Open what you are trying', to: `/patient/support/${running.id}` })
  if (asksWhy) actions.push({ label: 'Think this through properly', think: question })

  return {
    text: `${opening}${second}`,
    detail: hits.map((h) => `${h.label}\n${h.line}`).join('\n\n'),
    actions,
    sources: hits.slice(0, 3).map((h) => ({ label: h.label, detail: say(h.date), to: h.to })),
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
 * The ordinary reply. Not a fallback.
 *
 * This is now the first thing that happens to every message, before anything
 * is sent anywhere, because the record is already in this tab and a question
 * about it should be answered at the speed of a question about it. The
 * workflow is what runs *behind* this when something has to actually happen —
 * it is not what produces the sentence a person reads.
 *
 * The difference from `offlineReply` is one of posture and it matters. That
 * one is answering while apologising, because something the person did not ask
 * about has failed. This one is just answering. It says nothing about services,
 * availability or architecture, because on this path nothing has gone wrong and
 * there is nothing to explain.
 */
export function directReply(question: string, patientId: string, role: string | null): LocalAnswer {
  const forPatient = role === 'patient' || role === 'trusted'

  // "Which one?" is not a new question. It is the previous one, continued.
  //
  // Without this, a two-word follow-up was matched against the whole record as
  // though it had arrived out of nowhere — which is how "which one" returned a
  // confident paragraph about headphones. A conversation that forgets its own
  // last sentence is not a conversation.
  const carried = continuing(question)
  if (carried) return carried

  const answer =
    forPatient && looksLikeFeeling(question)
      ? feelingReply(patientId, null)
      : answerFromRecord(question, patientId)

  remember(answer)
  return answer
}

/* ------------------------------------------------------------- continuity */

/**
 * The last thing ORCA said, so the next thing someone says can refer to it.
 *
 * One answer deep, deliberately. A record is not a chat model and this is not
 * a memory system — it is the minimum needed for "which one", "why", "tell me
 * more" to mean what they obviously mean. Lives for as long as the page does.
 */
let previous: LocalAnswer | null = null

function remember(answer: LocalAnswer) {
  if (answer.matched !== false) previous = answer
}

export function forgetLastAnswer() {
  previous = null
}

/** Words that only mean something because of what came before them. */
const CARRIES_OVER =
  /^\s*(which(\s+one)?|what about (it|that|those|them)|which of (them|those)|and\??|then\??|why\??|how\??|more|tell me more|go on|say more|that one|the (first|second|third|last) one|explain that|explain)\s*[?.!]*\s*$/i

function continuing(question: string): LocalAnswer | null {
  if (!previous || !CARRIES_OVER.test(question)) return null

  // The detail was already assembled and folded away. Asking for more is
  // exactly the request to unfold it, so unfold it rather than searching
  // again.
  if (previous.detail) {
    const parts = previous.detail.split('\n\n').filter(Boolean)
    return {
      text: parts.join('\n\n'),
      actions: previous.actions,
      sources: previous.sources,
    }
  }

  return {
    text: 'That is all I have on it. Nothing else in your record touches it.',
    actions: previous.actions,
    sources: previous.sources,
  }
}

/**
 * Somebody has said how they are, rather than asked something.
 *
 * Acknowledge, decline to interpret, offer a person. What is open in the
 * record is offered rather than delivered, and it goes behind the fold: an
 * inventory is the last thing this moment needs. `note` is for the one caller
 * that has something true to add about its own condition.
 */
function feelingReply(patientId: string, note: string | null): LocalAnswer {
  const clinician = careContact(patientId)
  const waiting = whatIsWaiting(patientId)

  return {
    text: 'Thank you for telling me. I am not going to try to interpret that — you know how you feel better than I do.',
    detail: [
      note,
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
