import { Callout, PageHeader, SectionTitle } from '../../components/ui'
import { MemoryValidationCard } from '../../components/shared'
import { memoryCandidates, patientName } from '../../data/db'
import { useSession } from '../../state/session'

/**
 * 20.1 Potential longitudinal updates.
 *
 * The point of this screen is to stop AI inference becoming permanent memory on
 * its own. Nothing here is in the record yet.
 */
export default function MemoryReview() {
  const { role } = useSession()
  const candidates = memoryCandidates.filter((m) => m.raisedFor.includes(role ?? 'psychologist'))

  const byPatient = candidates.reduce<Record<string, typeof candidates>>((acc, c) => {
    ;(acc[c.patientId] ||= []).push(c)
    return acc
  }, {})

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="ORCA found potential updates"
        description="Patterns ORCA has noticed across reports, sessions and observations. None of them are part of any record until a person accepts them."
      />

      <Callout tone="wait" title="These are candidates, not findings">
        Each carries a confidence value and its evidence. Rejecting one is a normal outcome, not a
        failure — it stops the pattern being proposed again.
      </Callout>

      <div className="mt-6 space-y-8">
        {Object.entries(byPatient).map(([patientId, items]) => (
          <div key={patientId}>
            <SectionTitle>{patientName(patientId)}</SectionTitle>
            <div className="space-y-3">
              {items.map((candidate) => (
                <MemoryValidationCard key={candidate.id} candidate={candidate} audience="professional" />
              ))}
            </div>
          </div>
        ))}
        {candidates.length === 0 ? (
          <p className="text-[0.88rem] text-muted">Nothing is waiting for your review.</p>
        ) : null}
      </div>
    </div>
  )
}
