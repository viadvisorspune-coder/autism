import { useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  EvidenceTag,
  PageHeader,
  SectionTitle,
  formatDate,
} from '../../components/ui'
import { MemoryValidationCard } from '../../components/shared'
import { memoryCandidates, personName, profileItems } from '../../data/db'
import type { ProfileItem } from '../../data/types'
import { useUI } from '../../state/ui'

const SECTIONS: ProfileItem['section'][] = [
  'About me',
  'What helps me',
  "What doesn't help me",
  'Current goals',
  'Important context',
]

/** 6.1 / 6.2 My profile — viewing and correcting what ORCA holds. */
export default function PatientProfile() {
  const { say } = useUI()
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState(profileItems)
  const candidates = memoryCandidates.filter((m) => m.patientId === 'pt-ananya')

  const markOutdated = (id: string) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, outdated: !i.outdated } : i)))
    say('Marked as outdated. It stays in your history but is no longer used.')
  }

  const remove = (id: string) => {
    setItems((list) => list.filter((i) => i.id !== id))
    say('Removed from your profile.')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My profile"
        description="This is what ORCA uses when it suggests anything. If something here is wrong, correcting it changes what ORCA does next."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'My profile' }]}
        actions={
          <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(!editing)}>
            {editing ? 'Done editing' : 'Edit profile'}
          </Button>
        }
      />

      {candidates.length ? (
        <div className="mb-8">
          <SectionTitle>Waiting for your decision</SectionTitle>
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <MemoryValidationCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {SECTIONS.map((section) => {
          const sectionItems = items.filter((i) => i.section === section)
          return (
            <Card key={section}>
              <CardHead
                title={section}
                meta={
                  section === 'Important context'
                    ? 'Includes items ORCA has worked out — always labelled'
                    : undefined
                }
                action={
                  editing ? (
                    <Button onClick={() => say('An empty item was added for you to fill in.')}>
                      Add
                    </Button>
                  ) : undefined
                }
              />
              <CardBody>
                {sectionItems.length === 0 ? (
                  <p className="text-[0.85rem] text-muted">Nothing recorded here yet.</p>
                ) : (
                  <ul className="space-y-4">
                    {sectionItems.map((item) => (
                      <li key={item.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                        <p
                          className={`text-[0.92rem] leading-relaxed ${
                            item.outdated ? 'text-muted line-through' : 'text-ink'
                          }`}
                        >
                          {item.text}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.78rem] text-muted">
                          <span>
                            Source: {item.sourceId === 'orca' ? 'ORCA' : personName(item.sourceId)}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{formatDate(item.date)}</span>
                          <EvidenceTag status={item.evidence} />
                          <span aria-hidden>·</span>
                          <span>
                            Visible to{' '}
                            {item.visibleTo.length > 4 ? 'your care team' : item.visibleTo.join(', ')}
                          </span>
                        </div>
                        {editing ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button onClick={() => say('Opened for editing.')}>Edit</Button>
                            <Button onClick={() => markOutdated(item.id)}>
                              {item.outdated ? 'Mark current' : 'Mark outdated'}
                            </Button>
                            <Button onClick={() => remove(item.id)}>Remove</Button>
                            {item.evidence === 'AI interpretation' ? (
                              <Button
                                variant="primary"
                                onClick={() => say('Confirmed — this is now validated information.')}
                              >
                                Confirm this is right
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
