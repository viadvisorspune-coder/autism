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
