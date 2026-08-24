import { Link } from 'react-router-dom'
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHead,
  EmptyState,
  LinkButton,
  PageHeader,
  Section,
  Tag,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { RecordSource } from '../../components/shared'
import { connections as mockConnections, disclosures as mockDisclosures, people, personName } from '../../data/db'
import { askOrca } from '../../lib/ask'
import { useOrcaRead } from '../../lib/orca'
import { useUI } from '../../state/ui'

/* --------------------------------------------------- what the backend returns */

interface Person {
  name: string
  role: string
  organisation: string | null
}

interface LiveConnection {
  id: string
  person_id: string
  relationship: string
  purpose: string
  access_scope: string[]
  consent_given: string
  consent_status: string
  review_due: string | null
}

interface LiveDisclosure {
  id: string
  disclosed_on: string
  recipient: string
  purpose: string
  content_scope: string[]
  items_shared: string[]
}

interface ConsentEvent {
  id: string
  person_id: string
  changed_at: string
  change_type: 'Granted' | 'Widened' | 'Narrowed' | 'Renewed' | 'Revoked' | 'Expired'
  previous_scope: string[] | null
  new_scope: string[] | null
  previous_status: string | null
  new_status: string | null
  reason: string | null
}

interface AccessRequest {
  id: string
  requested_by: string
  requested_role: string
  purpose: string
  requested_scope: string[]
  justification: string | null
  created_at: string
}

interface PrivacyData {
  connections: LiveConnection[]
  disclosures: LiveDisclosure[]
  consent_history: ConsentEvent[]
  pending_access_requests: AccessRequest[]
  people: Record<string, Person>
}

/** 12.1 Privacy centre. */
export function PatientPrivacy() {
  const { say } = useUI()
  const { state, data, reason } = useOrcaRead<PrivacyData>('privacy')

  // The prototype's own data is the floor, so the screen is never empty and
  // never pretends a failed read was an empty record.
  const connections =
    data?.connections ??
    mockConnections.map((c) => ({
      id: c.id,
      person_id: c.personId,
      relationship: c.relationship,
      purpose: c.purpose,
      access_scope: c.accessScope,
      consent_given: c.consentGiven,
      consent_status: c.consentStatus,
      review_due: c.reviewDue,
    }))

  const disclosures =
    data?.disclosures ??
    mockDisclosures.map((d) => ({
      id: d.id,
      disclosed_on: d.date,
      recipient: d.recipient,
      purpose: d.purpose,
      content_scope: d.contentScope,
      items_shared: d.itemsShared,
    }))

  const nameOf = (id: string) =>
    data?.people?.[id]?.name ?? people.find((p) => p.id === id)?.name ?? id
  const orgOf = (id: string) =>
    data?.people?.[id]?.organisation ?? people.find((p) => p.id === id)?.organisation ?? 'Personal'

  const pending = data?.pending_access_requests ?? []
  const history = data?.consent_history ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Privacy and sharing"
        description="Four questions, answered in one place: who can see your information, what they can see, why, and when you agreed to it."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Privacy & Sharing' }]}
        actions={<LinkButton to="/patient/privacy/history">Sharing history</LinkButton>}
      />

      <RecordSource state={state} reason={reason} />

      {/* Someone has asked and is waiting. This sits above everything else,
          because an unanswered request is the only thing on this page that is
          costing another person something. */}
      {pending.length > 0 ? (
        <Section title="Waiting on you" count={pending.length} important>
          <Card>
            <CardBody>
              <ul className="space-y-4">
                {pending.map((r) => (
                  <li key={r.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                    <p className="text-[0.9rem] font-medium text-ink">
                      {nameOf(r.requested_by)} has asked for access
                    </p>
                    <p className="text-[0.83rem] text-muted">
                      {r.requested_role} · asked {formatDate(r.created_at.slice(0, 10))}
                    </p>
                    <p className="mt-1.5 text-[0.87rem] leading-relaxed text-ink-2">{r.purpose}</p>
                    {r.requested_scope.length > 0 ? (
                      <p className="mt-1 text-[0.83rem] text-ink-2">
                        <span className="text-muted">Asking for: </span>
                        {r.requested_scope.join(', ')}
                      </p>
                    ) : null}
                    {r.justification ? (
                      <p className="mt-1 text-[0.82rem] text-muted">{r.justification}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => say('Nothing has changed yet — deciding access is not wired up.')}>
                        Give access
                      </Button>
                      <Button
                        variant="quiet"
                        onClick={() => say('Nothing has changed yet — deciding access is not wired up.')}
                      >
                        Not now
                      </Button>
                    </div>
                    <p className="mt-2 text-[0.78rem] text-muted">
                      They cannot see anything until you decide. Saying no does not need a reason.
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>
      ) : null}

      <Card className="mb-6">
        <CardHead
          title="Who can see my information?"
          meta={`${connections.filter((c) => c.consent_status === 'Active').length} active, ${connections.length} in total`}
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-[0.9rem] font-medium text-ink">{nameOf(c.person_id)}</p>
                  <p className="text-[0.8rem] text-muted">
                    {c.relationship} · {orgOf(c.person_id)}
                  </p>
                  <p className="mt-1 text-[0.83rem] text-ink-2">
                    <span className="text-muted">What: </span>
                    {c.access_scope.join(', ')}
                  </p>
                  <p className="text-[0.83rem] text-ink-2">
                    <span className="text-muted">Why: </span>
                    {c.purpose}
                  </p>
                  <p className="text-[0.8rem] text-muted">
                    Approved {formatDate(c.consent_given)}
                    {c.review_due ? ` · review due ${formatDate(c.review_due)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tag>{c.consent_status}</Tag>
                  <Link
                    to={`/patient/connections/${c.id}`}
                    className="text-[0.83rem] font-medium text-brand hover:underline"
                  >
                    Change
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Consent as a history rather than a current position. Without this the
          record can say who has access, but not what anyone could see on the
          day something went wrong. */}
      <Section
        title="How this has changed"
        count={history.length}
        summary={
          history.length
            ? `Every time you gave, reduced or withdrew someone's access — including the version that was replaced. Most recent: ${changeSentence(history[0].change_type, nameOf(history[0].person_id)).toLowerCase()}.`
            : 'Nothing has changed yet.'
        }
      >
        <Card>
          <CardBody>
            {history.length === 0 ? (
              <EmptyState
                title="No changes recorded yet"
                detail="Every time you give, narrow or withdraw access, it will appear here — including the version that was replaced."
              />
            ) : (
              <ol className="space-y-3">
                {history.map((e) => (
                  <li key={e.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[0.88rem] font-medium text-ink">
                        {changeSentence(e.change_type, nameOf(e.person_id))}
                      </p>
                      <p className="text-[0.78rem] text-muted">{formatDateTime(e.changed_at)}</p>
                    </div>
                    {e.reason ? <p className="mt-1 text-[0.83rem] text-ink-2">{e.reason}</p> : null}
                    {e.previous_scope && e.new_scope ? (
                      <ScopeDiff before={e.previous_scope} after={e.new_scope} />
                    ) : e.new_scope && e.change_type === 'Granted' ? (
                      <p className="mt-1 text-[0.82rem] text-ink-2">
                        <span className="text-muted">Could see: </span>
                        {e.new_scope.join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-[0.78rem] leading-relaxed text-muted">
              Nothing here is ever edited or removed. A change you made by mistake is corrected by making
              another change, so the mistake stays visible.
            </p>
          </CardBody>
        </Card>
      </Section>

      <Section
        title="What have I shared recently?"
        count={disclosures.length}
        summary={
          disclosures.length
            ? `Most recent: ${disclosures[0].recipient}, ${formatDate(disclosures[0].disclosed_on.slice(0, 10))}.`
            : 'Nothing has been shared.'
        }
      >
        <Card>
          <CardBody>
            <ul className="space-y-3">
              {disclosures.slice(0, 3).map((d) => (
                <li key={d.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="text-[0.89rem] font-medium text-ink">{d.recipient}</p>
                  <p className="text-[0.83rem] text-ink-2">{d.purpose}</p>
                  <p className="text-[0.79rem] text-muted">
                    {formatDate(d.disclosed_on.slice(0, 10))} · {d.content_scope.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
            <LinkButton to="/patient/privacy/history" className="mt-4">
              See everything
            </LinkButton>
          </CardBody>
        </Card>
      </Section>

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

/** Plain language for each kind of change. Never "consent event". */
function changeSentence(type: ConsentEvent['change_type'], name: string): string {
  switch (type) {
    case 'Granted':
      return `You gave ${name} access`
    case 'Widened':
      return `You gave ${name} access to more`
    case 'Narrowed':
      return `You reduced what ${name} can see`
    case 'Renewed':
      return `You confirmed ${name}'s access again`
    case 'Revoked':
      return `You withdrew ${name}'s access`
    case 'Expired':
      return `${name}'s access lapsed`
  }
}

/** What was added and what was taken away, rather than two opaque lists. */
function ScopeDiff({ before, after }: { before: string[]; after: string[] }) {
  const removed = before.filter((s) => !after.includes(s))
  const added = after.filter((s) => !before.includes(s))

  if (!removed.length && !added.length) return null

  return (
    <div className="mt-1.5 space-y-0.5">
      {removed.map((s) => (
        <p key={s} className="text-[0.82rem] text-ink-2">
          <span className="text-muted">No longer visible: </span>
          {s}
        </p>
      ))}
      {added.map((s) => (
        <p key={s} className="text-[0.82rem] text-ink-2">
          <span className="text-muted">Now visible: </span>
          {s}
        </p>
      ))}
    </div>
  )
}

/** 12.2 Sharing history. */
export function PatientSharingHistory() {
  const { state, data, reason } = useOrcaRead<PrivacyData>('privacy')

  const disclosures =
    data?.disclosures ??
    mockDisclosures.map((d) => ({
      id: d.id,
      disclosed_on: d.date,
      recipient: d.recipient,
      purpose: d.purpose,
      content_scope: d.contentScope,
      items_shared: d.itemsShared,
    }))

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
        actions={
          <>
            <Button onClick={() => askOrca('Who has read my record?')}>Who has read it?</Button>
            <LinkButton to="/patient/documents" variant="primary">
              Share something
            </LinkButton>
          </>
        }
      />

      <RecordSource state={state} reason={reason} />

      <ol className="space-y-4">
        {disclosures.map((d) => (
          <li key={d.id}>
            <Card>
              <CardHead
                title={d.recipient}
                meta={`${formatDate(d.disclosed_on.slice(0, 10))} · ${d.purpose}`}
              />
              <CardBody>
                <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
                  Exactly what was shared
                </h3>
                <ul className="space-y-1.5">
                  {d.items_shared.map((item) => (
                    <li key={item} className="text-[0.87rem] leading-relaxed text-ink">
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.8rem] text-muted">Scope: {d.content_scope.join(', ')}</p>
                {/* A history page with nothing to press is a receipt. The two
                    questions somebody actually has here are "why did that go?"
                    and "can I stop it?" — so both are one press away, and both
                    go somewhere that can answer rather than to a toast. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => askOrca(`Why was this shared with ${d.recipient}?`)}>
                    Why was this shared?
                  </Button>
                  <LinkButton to="/patient/connections">Change what they can see</LinkButton>
                </div>
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <Callout tone="info" title="Access is recorded separately from sharing">
          A disclosure is something that left your record. Every time anyone <em>read</em> it — including{' '}
          {personName('u-kavita')} and {personName('u-anil')} — is kept too, refusals included.
          <div className="mt-3">
            <Button onClick={() => askOrca('Show me the full access log for my record')}>
              Ask for the full access log
            </Button>
          </div>
        </Callout>
      </div>
    </div>
  )
}
