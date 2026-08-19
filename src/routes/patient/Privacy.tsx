import { Link } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  LinkButton,
  PageHeader,
  SectionTitle,
  Tag,
  formatDate,
} from '../../components/ui'
import { connections, disclosures, people, personName } from '../../data/db'
import { useUI } from '../../state/ui'

/** 12.1 Privacy centre. */
export function PatientPrivacy() {
  const { say } = useUI()

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Privacy and sharing"
        description="Four questions, answered in one place: who can see your information, what they can see, why, and when you agreed to it."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Privacy & Sharing' }]}
        actions={<LinkButton to="/patient/privacy/history">Sharing history</LinkButton>}
      />

      <Card className="mb-6">
        <CardHead title="Who can see my information?" meta={`${connections.length} people or organisations`} />
        <CardBody>
          <ul className="divide-y divide-line">
            {connections.map((c) => {
              const person = people.find((p) => p.id === c.personId)
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-[0.9rem] font-medium text-ink">{person?.name}</p>
                    <p className="text-[0.8rem] text-muted">
                      {c.relationship} · {person?.organisation ?? 'Personal'}
                    </p>
                    <p className="mt-1 text-[0.83rem] text-ink-2">
                      <span className="text-muted">What: </span>
                      {c.accessScope.join(', ')}
                    </p>
                    <p className="text-[0.83rem] text-ink-2">
                      <span className="text-muted">Why: </span>
                      {c.purpose}
                    </p>
                    <p className="text-[0.8rem] text-muted">
                      Approved {formatDate(c.consentGiven)} · review due {formatDate(c.reviewDue)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Tag>{c.consentStatus}</Tag>
                    <Link
                      to={`/patient/connections/${c.id}`}
                      className="text-[0.83rem] font-medium text-brand hover:underline"
                    >
                      Change
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>

      <div className="mb-6">
        <SectionTitle>What have I shared recently?</SectionTitle>
        <Card>
          <CardBody>
            <ul className="space-y-3">
              {disclosures.slice(0, 3).map((d) => (
                <li key={d.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="text-[0.89rem] font-medium text-ink">{d.recipient}</p>
                  <p className="text-[0.83rem] text-ink-2">{d.purpose}</p>
                  <p className="text-[0.79rem] text-muted">
                    {formatDate(d.date)} · {d.contentScope.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
            <LinkButton to="/patient/privacy/history" className="mt-4">
              See everything
            </LinkButton>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title="Standing rules" meta="These apply to everything ORCA does" />
        <CardBody className="space-y-3">
          {[
            'Ask me every time before anything is shared.',
            'Never include clinical documents in a workplace or university request.',
            'Never include journal entries or raw notes in anything sent outside ORCA.',
            'Review all access every six months.',
          ].map((rule) => (
            <label key={rule} className="flex items-start gap-2.5 text-[0.88rem] text-ink">
              <input type="checkbox" defaultChecked className="mt-1" onChange={() => say('Preference updated.')} />
              {rule}
            </label>
          ))}
          <Button className="mt-2" onClick={() => say('Nothing new can be shared until you re-enable sharing.')}>
            Pause all sharing
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}

/** 12.2 Sharing history. */
export function PatientSharingHistory() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Sharing history"
        description="Every disclosure ORCA has made on your behalf, with what it contained and who approved it."
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Privacy & Sharing', to: '/patient/privacy' },
          { label: 'History' },
        ]}
      />

      <ol className="space-y-4">
        {disclosures.map((d) => (
          <li key={d.id}>
            <Card>
              <CardHead title={d.recipient} meta={`${formatDate(d.date)} · ${d.purpose}`} />
              <CardBody>
                <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
                  Exactly what was shared
                </h3>
                <ul className="space-y-1.5">
                  {d.itemsShared.map((item) => (
                    <li key={item} className="text-[0.87rem] leading-relaxed text-ink">
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.8rem] text-muted">
                  Scope: {d.contentScope.join(', ')} · approved by {d.approvedBy}
                </p>
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-[0.82rem] leading-relaxed text-muted">
        Records of who accessed what are kept for every role, including{' '}
        {personName('u-kavita')} and {personName('u-anil')}. Ask for the full access log at any time.
      </p>
    </div>
  )
}
