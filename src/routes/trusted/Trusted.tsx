import { useState } from 'react'
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  PageHeader,
  SectionTitle,
  Tag,
  formatDate,
} from '../../components/ui'
import { connections, disclosures } from '../../data/db'
import { useUI } from '../../state/ui'

/** 30.1 Trusted person home — deliberately the simplest interface in ORCA. */
export function TrustedHome() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Hello, Divya"
        description="Ananya has chosen to share a small amount with you. You will only ever see what she has chosen."
      />

      <Card className="mb-6">
        <CardHead title="What has been shared with me" />
        <CardBody>
          <ul className="space-y-3 text-[0.9rem] leading-relaxed text-ink">
            <li>
              Work has been difficult this month because meetings keep moving at short notice.
              <span className="mt-0.5 block text-[0.79rem] text-muted">Shared 18 August 2026</span>
            </li>
            <li>
              A request has been made at work for written notice of changes.
              <span className="mt-0.5 block text-[0.79rem] text-muted">Shared 18 August 2026</span>
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHead title="Current support needs" />
        <CardBody>
          <ul className="space-y-2 text-[0.9rem] leading-relaxed text-ink">
            <li>Written messages rather than phone calls, where possible.</li>
            <li>Advance notice if plans change.</li>
          </ul>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHead title="Tasks" />
        <CardBody>
          <ul className="space-y-2 text-[0.9rem] text-ink">
            <li>Ananya has asked if you can help with Saturday's appointment travel.</li>
          </ul>
        </CardBody>
      </Card>

      <Callout tone="info" title="What you cannot see">
        Clinical notes, documents, sessions and ORCA conversations are not shared with trusted people
        unless Ananya sends something specific.
      </Callout>
    </div>
  )
}

/** Shared information. */
export function TrustedShared() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Shared information"
        description="Everything Ananya has shared with you, and when."
      />
      <ol className="space-y-3">
        {disclosures.slice(0, 2).map((d) => (
          <li key={d.id}>
            <Card>
              <CardHead title={d.purpose} meta={formatDate(d.date)} />
              <CardBody>
                <ul className="space-y-1.5 text-[0.88rem] leading-relaxed text-ink">
                  {d.itemsShared.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Support. */
export function TrustedSupport() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Support"
        description="Practical things that help, in Ananya's own words."
      />
      <Card>
        <CardBody>
          <ul className="space-y-3 text-[0.9rem] leading-relaxed text-ink">
            <li>Written notice of any change of plan, ideally a few hours ahead.</li>
            <li>A quiet space and some time after an unexpected change.</li>
            <li>One thing at a time rather than several questions at once.</li>
          </ul>
          <p className="mt-4 text-[0.83rem] leading-relaxed text-muted">
            These come from what Ananya has confirmed about herself. They are not instructions from a
            professional.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

/** 30.2 Add observation. */
export function TrustedObservation() {
  const { say } = useUI()
  const [text, setText] = useState('')
  const [context, setContext] = useState('')
  const [sent, setSent] = useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add an observation"
        description="Have you noticed something that may be useful? It goes to Ananya first — she decides whether it becomes part of her record."
      />

      {sent ? (
        <Callout tone="good" title="Sent to Ananya">
          Your observation is labelled “Reported by trusted person”. It is not part of her record
          unless she accepts it.
        </Callout>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[0.83rem] text-muted">What did you notice?</span>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.9rem] leading-relaxed outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.83rem] text-muted">When and where (optional)</span>
              <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.9rem] outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => {
                  setSent(true)
                  say('Sent to Ananya for her to decide.')
                }}
              >
                Send to Ananya
              </Button>
              <Tag>Will be labelled: Reported by trusted person</Tag>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/** Permissions. */
export function TrustedPermissions() {
  const connection = connections.find((c) => c.personId === 'u-divya')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Permissions"
        description="What you have been given access to, and for what purpose."
      />
      <Card>
        <CardBody>
          <DefinitionList
            items={[
              { label: 'Relationship', value: connection?.relationship ?? 'Trusted person' },
              { label: 'Purpose', value: connection?.purpose ?? '' },
              { label: 'Access scope', value: connection?.accessScope.join(', ') ?? '' },
              { label: 'Given', value: connection ? formatDate(connection.consentGiven) : '' },
              { label: 'Review due', value: connection ? formatDate(connection.reviewDue) : '' },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt-6">
        <SectionTitle>Remember</SectionTitle>
        <p className="max-w-2xl text-[0.87rem] leading-relaxed text-ink-2">
          Ananya can change or remove your access at any time, and does not have to give a reason.
          You will not be notified of anything she has not chosen to share.
        </p>
      </div>
    </div>
  )
}
