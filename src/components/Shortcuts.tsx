import { useNavigate } from 'react-router-dom'
import { askOrca } from '../lib/ask'
import { useMaturity } from '../state/maturity'
import { useSession } from '../state/session'

/**
 * The five questions people actually ask.
 *
 * Across every role in this system, the same handful of questions come up
 * before anything else: what changed, what have we tried, what worked, what is
 * unresolved, show me the evidence. They are the questions a person would ask
 * a colleague who had been reading the file.
 *
 * Making them buttons is not a shortcut to typing — it is a statement about
 * what the system is for. A blank prompt box is an invitation to guess what
 * the software can do; five specific questions say plainly what it is good at,
 * and someone who presses one and gets a real sourced answer will type the
 * sixth question themselves.
 *
 * They are ordinary questions sent through the ordinary path, not special
 * commands. Whatever ORCA can answer typed, it answers here, with the same
 * sources attached.
 *
 * Shown from level 2, once the interface has stopped explaining itself. At
 * level 1 the person is still finding out what the record contains, and a row
 * of shortcuts to answers about it is premature.
 */

const QUESTIONS: { label: string; question: (subject: string) => string }[] = [
  { label: 'What changed?', question: (s) => `What has changed for ${s} recently, and when?` },
  { label: 'What have we tried?', question: (s) => `What support has ${s} already tried?` },
  { label: 'What worked?', question: (s) => `Which of the things ${s} tried actually helped, and how do we know?` },
  { label: 'What is unresolved?', question: (s) => `What is still open or waiting on someone for ${s}?` },
  { label: 'Show the evidence', question: (s) => `Show me the evidence behind what is currently recorded about ${s}.` },
]

export function Shortcuts({
  subject,
  className = '',
}: {
  /** Whose record the questions are about, in words. */
  subject?: string
  className?: string
}) {
  const { role, personName } = useSession()
  const { showShortcuts, record } = useMaturity()
  const navigate = useNavigate()

  if (!showShortcuts) return null

  const about = subject ?? (role === 'patient' ? 'me' : personName)

  return (
    <div className={`mb-6 ${className}`}>
      <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.07em] text-muted">
        Ask about {about === 'me' ? 'yourself' : about}
      </p>
      <div className="flex flex-wrap gap-2">
        {QUESTIONS.map((q) => (
          <button
            key={q.label}
            onClick={() => {
              const text = q.question(about)
              record(`ask:${q.label}`)
              // The patient's conversation is a page of its own; everyone else
              // gets the rail beside what they were already looking at.
              if (role === 'patient') navigate('/patient/guide', { state: { message: text } })
              else askOrca(text)
            }}
            className="rounded-full  bg-surface-2 px-3 py-1.5 text-[0.82rem] text-ink-2 hover:text-ink"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  )
}
