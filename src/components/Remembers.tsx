import { Link } from 'react-router-dom'
import { Card, CardBody, Section, formatDate } from './ui'
import { useSession } from '../state/session'
import { memoryCandidates, profileFor } from '../data/db'
import { useRecordId } from '../state/record'

/**
 * What ORCA remembers.
 *
 * The fourth thing a dashboard owes someone, after what changed, what needs
 * them, and what is coming. It is also the one nobody builds, because a memory
 * that is never displayed cannot be argued with — and a system that quietly
 * accumulates conclusions about an autistic person, in a field with a long
 * history of exactly that, has no business being unarguable.
 *
 * Two columns because there are two kinds of thing and conflating them is the
 * whole failure mode:
 *
 *   Held — statements with a source and a date, already part of the record.
 *   Proposed — ORCA's readings of repeated observations. NOT in the record.
 *              They sit here until a person accepts or rejects them, and the
 *              wording says so rather than implying it with a colour.
 *
 * Everything is one click from the page where it can be edited or refused.
 * "What it knows about me" is not a feature if it is read-only.
 */

export function WhatOrcaRemembers({ patientId: given }: { patientId?: string }) {
  const patientId = useRecordId(given)
  const { role } = useSession()

  const held = profileFor(patientId)
    .filter((p) => p.section !== 'Current goals')
    .slice(0, 4)
  const proposed = memoryCandidates.filter(
    (m) => m.patientId === patientId && m.status === 'Pending',
  )

  if (!held.length && !proposed.length) return null

  const isPatient = role === 'patient'
  const profileHref = isPatient ? '/patient/profile' : `/${role}/patients/${patientId}`

  // Reference rather than work: worth being able to reach, not worth two
  // screens of scrolling past on a phone before the thing you came for.
  return (
    <Section
      title={isPatient ? 'What ORCA remembers about you' : 'What ORCA holds on this person'}
      count={held.length + proposed.length}
      summary={
        proposed.length
          ? `${held.length} things recorded, and ${proposed.length} waiting to be confirmed.`
          : `${held.length} things recorded, each with a source.`
      }
      action={
        <Link to={profileHref} className="text-[0.82rem] font-medium text-brand hover:underline">
          {isPatient ? 'Edit or remove any of this' : 'Open the profile'}
        </Link>
      }
    >
    <Card className="mb-2">
      <CardBody>
        <p className="mb-4 text-[0.84rem] leading-relaxed text-muted">
          {isPatient
            ? 'Nothing here was written without something to point at, and none of it is fixed.'
            : 'Held statements carry a source. Proposals are not in the record and will not be until a person accepts them.'}
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Held · in the record
            </p>
            <ul className="space-y-2.5">
              {held.map((item) => (
                <li key={item.id}>
                  <p className="text-[0.86rem] leading-relaxed text-ink">{item.text}</p>
                  <p className="text-[0.77rem] text-muted">
                    {item.section} · {item.evidence} · {formatDate(item.date)}
                  </p>
                </li>
              ))}
              {!held.length ? (
                <li className="text-[0.84rem] text-muted">Nothing recorded yet.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Proposed · not in the record
            </p>
            <ul className="space-y-2.5">
              {proposed.map((m) => (
                <li key={m.id} className="rounded-[20px]  border-line bg-canvas px-3.5 py-2.5">
                  <p className="text-[0.86rem] leading-relaxed text-ink">{m.proposal}</p>
                  <p className="mt-0.5 text-[0.77rem] text-muted">
                    From {m.evidence.length} observation{m.evidence.length === 1 ? '' : 's'}. Waiting
                    on {m.raisedFor.join(' or ')}.
                  </p>
                </li>
              ))}
              {!proposed.length ? (
                <li className="text-[0.84rem] text-muted">
                  Nothing is waiting to be confirmed.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </CardBody>
    </Card>
    </Section>
  )
}
