import { Link } from 'react-router-dom'
import { Card, CardBody, formatDate } from './ui'
import { useLive } from '../lib/live'
import { useSession } from '../state/session'
import { lapsingSoon, needsAttention } from '../lib/caseload'
import type { Caseload as CaseloadData } from '../lib/caseload'

/**
 * Twelve people, and which one to open first.
 *
 * The dashboard already lists the caseload. A list is the right thing when you
 * are looking for a name and the wrong thing when you are looking for a
 * problem — and between appointments it is always the second. So this is not
 * another list: it is only the people something is true of, with the reason
 * written out, and nothing at all when nothing is wrong.
 *
 * Every count behind it was scoped per connection on the server. Where a
 * patient has not shared their strategies with this clinician, no strategy
 * flag can appear for them — not because the count was zero but because it was
 * never sent. That is worth stating on the page, because a quiet row could
 * otherwise be read as a settled one.
 */
export function CaseloadAttention() {
  const { role, option } = useSession()
  const { data } = useLive<CaseloadData>('caseload', null, 45000)

  const flags = needsAttention(data ?? null)
  const lapsing = lapsingSoon(data ?? null)
  const base = option?.home ?? ''
  const total = data?.patients.length ?? 0

  if (!role || role === 'patient' || role === 'trusted' || role === 'admin') return null
  if (!total) return null

  const narrowed = (data?.patients ?? []).filter((p) => p.active_strategies === null || p.open_requests === null)

  return (
    <section aria-label="Needs you first" className="mb-8">
      <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
        Across your caseload
      </h2>

      <Card>
        <CardBody>
          {flags.length === 0 ? (
            <p className="text-[0.9rem] leading-relaxed text-ink-2">
              Nothing needs you across {total} {total === 1 ? 'person' : 'people'} right now — no
              decisions waiting, no unanswered questions, nothing gone quiet.
            </p>
          ) : (
            <>
              <p className="text-[0.9rem] leading-relaxed text-ink-2">
                {flags.length} of {total} {total === 1 ? 'person' : 'people'} need something.
              </p>
              <ul className="mt-3 space-y-2.5">
                {flags.slice(0, 5).map((flag) => (
                  <li key={flag.row.patient_id}>
                    <Link
                      to={`${base}/patients/${flag.row.patient_id}`}
                      className="text-[0.92rem] font-medium text-ink hover:underline"
                    >
                      {flag.row.name}
                    </Link>
                    <p className="text-[0.84rem] leading-relaxed text-ink-2">{flag.reason}</p>
                  </li>
                ))}
              </ul>
              {flags.length > 5 ? (
                <p className="mt-2 text-[0.8rem] text-muted">
                  and {flags.length - 5} more.
                </p>
              ) : null}
            </>
          )}

          {lapsing.length ? (
            <p className="mt-4 rounded-[16px] bg-state-wait-tint px-4 py-3 text-[0.84rem] leading-relaxed text-state-wait">
              {lapsing.length === 1
                ? `${lapsing[0].name}'s consent comes up for review on ${formatDate(String(lapsing[0].review_due).slice(0, 10))}. After that you lose access until they renew it.`
                : `${lapsing.length} connections come up for review within a month. After that you lose access until each of them renews it.`}
            </p>
          ) : null}

          {narrowed.length ? (
            <p className="mt-3 text-[0.79rem] leading-relaxed text-muted">
              {narrowed.length} of these {narrowed.length === 1 ? 'person has' : 'people have'}{' '}
              shared only part of their record with you, so this cannot speak for all of it. A quiet
              row is not the same as a settled one.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </section>
  )
}
