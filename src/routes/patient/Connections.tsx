import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  Grid,
  PageHeader,
  SectionTitle,
  Tag,
  formatDate,
} from '../../components/ui'
import { connections, disclosures, people, personName } from '../../data/db'
import { useUI } from '../../state/ui'

const GROUPS = [
  { title: 'Care professionals', roles: ['psychologist', 'psychiatrist', 'therapist', 'ot', 'gp'] },
  { title: 'Employer', roles: ['employer'] },
  { title: 'University', roles: ['university'] },
  { title: 'Trusted people', roles: ['trusted'] },
  { title: 'Other authorised stakeholders', roles: ['clinic'] },
]

/** 11.1 My connections. */
export function PatientConnections() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Connections"
        description="Everyone connected to your record, what they can see, and why. You can change or remove any of it."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Connections' }]}
      />

      {GROUPS.map((group) => {
        const items = connections.filter((c) =>
          group.roles.includes(people.find((p) => p.id === c.personId)?.role ?? ''),
        )
        if (items.length === 0) return null
        return (
          <div key={group.title} className="mb-8">
            <SectionTitle>{group.title}</SectionTitle>
            <Grid cols={2}>
              {items.map((c) => (
                <Card key={c.id}>
                  <CardHead
                    title={personName(c.personId)}
                    meta={c.relationship}
                    action={<Tag>{c.consentStatus}</Tag>}
                  />
                  <CardBody>
                    <p className="text-[0.85rem] leading-relaxed text-ink-2">{c.purpose}</p>
                    <p className="mt-2 text-[0.8rem] text-muted">
                      Access: {c.accessScope.join(', ')}
                    </p>
                    <Link
                      to={`/patient/connections/${c.id}`}
                      className="mt-3 inline-block text-[0.84rem] font-medium text-brand hover:underline"
                    >
                      Manage
                    </Link>
                  </CardBody>
                </Card>
              ))}
            </Grid>
          </div>
        )
      })}
    </div>
  )
}

/** 11.2 Connection detail. */
export function PatientConnection() {
  const { connectionId } = useParams()
  const { say } = useUI()
  const connection = connections.find((c) => c.id === connectionId)
  const [revoked, setRevoked] = useState(false)

  if (!connection) return <p className="text-[0.9rem] text-muted">Connection not found.</p>

  const person = people.find((p) => p.id === connection.personId)
  const history = disclosures.filter((d) => d.recipient.includes(person?.name.split(' ')[0] ?? '§'))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={person?.name ?? ''}
        description={person?.title}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Connections', to: '/patient/connections' },
          { label: 'Connection' },
        ]}
        actions={<Tag>{revoked ? 'Revoked' : connection.consentStatus}</Tag>}
      />

      <Card className="mb-6">
        <CardBody>
          <DefinitionList
            items={[
              { label: 'Relationship', value: connection.relationship },
              { label: 'Organisation', value: person?.organisation ?? '—' },
              { label: 'Purpose', value: connection.purpose },
              {
                label: 'Access scope',
                value: (
                  <ul className="space-y-1">
                    {connection.accessScope.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ),
              },
              { label: 'Consent given', value: formatDate(connection.consentGiven) },
              { label: 'Review due', value: formatDate(connection.reviewDue) },
              { label: 'Last interaction', value: formatDate(connection.lastInteraction) },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHead title="What has been shared with this person" />
        <CardBody>
          {history.length === 0 ? (
            <p className="text-[0.85rem] text-muted">
              Nothing has been sent to this person. They see only what their access scope allows.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.map((d) => (
                <li key={d.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="text-[0.87rem] text-ink">{d.purpose}</p>
                  <p className="text-[0.79rem] text-muted">
                    {formatDate(d.date)} · {d.contentScope.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => say('Access scope opened for editing.')}>Edit access</Button>
        <Button
          variant="danger"
          onClick={() => {
            setRevoked(true)
            say('Access revoked. They can no longer see anything new.')
          }}
        >
          Revoke access
        </Button>
        <Link
          to="/patient/privacy/history"
          className="rounded-lg border border-line-strong px-3.5 py-2 text-[0.85rem] text-ink hover:bg-surface-2"
        >
          Review sharing history
        </Link>
      </div>
    </div>
  )
}
