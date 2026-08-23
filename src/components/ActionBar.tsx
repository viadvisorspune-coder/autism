import { Link } from 'react-router-dom'
import { useSession } from '../state/session'
import { entryModels } from '../data/entryForms'

/**
 * What do you want to do?
 *
 * A professional dashboard that opens with a list of patients answers a
 * question nobody asked. Between appointments the question is never "who is on
 * my caseload" — they know — it is "I have four minutes, what am I doing with
 * them". Patients → open → read is three steps before any work starts.
 *
 * So the verbs come first, in the order a working day actually uses them:
 * write up what just happened, get ready for what is next, then the reviewing
 * and the coordinating that fill the gaps. The caseload is still directly
 * below; this sits above it rather than instead of it.
 *
 * Adding information is first and looks different, because it is the one thing
 * this platform could not do at all until now, and because it is the only one
 * of these that puts something in rather than taking something out.
 */

interface Action {
  label: string
  to: string
  /** One line, only where the label alone could mean two things. */
  detail?: string
}

export function ActionBar() {
  const { role, option } = useSession()
  if (!role || !option) return null

  const base = option.home
  const model = entryModels[role]
  if (!model) return null

  const rest: Action[] = [
    { label: 'Prepare a patient', to: `${base}/session`, detail: 'Everything since you last met, in one page' },
    { label: 'Review a strategy', to: `${base}/strategies` },
    { label: 'Review outcomes', to: `${base}/outcomes` },
    { label: 'Create a handover', to: `${base}/handover` },
    { label: 'Follow-ups', to: `${base}/tasks` },
  ].filter((a) => AVAILABLE[role]?.includes(a.to.split('/').pop() ?? '') ?? true)

  return (
    <section aria-label="What do you want to do?" className="mb-8">
      <h2 className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
        What do you want to do?
      </h2>

      <div className="flex flex-wrap gap-2">
        <Link
          to={`${base}/add`}
          className="rounded-2xl bg-brand px-4 py-2.5 text-[0.9rem] font-medium text-white hover:bg-brand-ink"
        >
          + {model.action}
        </Link>

        {rest.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            title={action.detail}
            className="rounded-2xl bg-surface px-4 py-2.5 text-[0.9rem] text-ink shadow-sm hover:bg-brand-tint"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * Not every role has every workspace, and a button to a page that does not
 * exist is worse than no button. Absent from this map means "all of them".
 */
const AVAILABLE: Record<string, string[]> = {
  employer: ['tasks'],
  university: ['tasks'],
  clinic: ['tasks', 'handover'],
  gp: ['session', 'tasks', 'handover'],
}
