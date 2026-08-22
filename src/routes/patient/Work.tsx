import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  Callout,
  DefinitionList,
  Grid,
  LinkButton,
  PageHeader,
  SectionTitle,
  StatusPill,
  formatDate,
} from '../../components/ui'
import { AiProvenance } from '../../components/shared'
import { requests, requestsFor } from '../../data/db'
import type { RequestRecord } from '../../data/types'
import { useUI } from '../../state/ui'

/** 9.1 Work / university dashboard. */
export function PatientWork() {
  const [context, setContext] = useState<'Work' | 'University'>('Work')
  const all = requestsFor('pt-ananya')
  const shown = all.filter((r) =>
    context === 'Work' ? r.destinationRole === 'employer' : r.destinationRole === 'university',
  )

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Work and university"
        description="What has been asked for, what has been agreed, and what is still waiting on someone else."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Work / University' }]}
        actions={<LinkButton to="/patient/work/request" variant="primary">Ask for something</LinkButton>}
      />

      <div className="mb-6 inline-flex rounded-2xl  bg-surface-2 p-1">
        {(['Work', 'University'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setContext(option)}
            aria-pressed={context === option}
            className={`rounded-2xl px-4 py-1.5 text-[0.85rem] ${
              context === option ? 'bg-brand-tint font-medium text-brand-ink' : 'text-ink-2'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <Grid cols={2}>
        <Card>
          <CardHead title="Current accommodations" />
          <CardBody>
            {context === 'Work' ? (
              <p className="text-[0.87rem] leading-relaxed text-ink">
                None agreed yet. One request is with HR.
              </p>
            ) : (
              <ul className="space-y-2 text-[0.87rem] text-ink">
                <li>
                  Written summary of any change to a studio brief
                  <span className="block text-[0.78rem] text-muted">
                    Agreed 2 June 2026 · review January 2027
                  </span>
                </li>
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Upcoming deadlines" />
          <CardBody>
            <ul className="space-y-2 text-[0.87rem] text-ink">
              {context === 'Work' ? (
                <>
                  <li>HR decision window closes 8 September</li>
                  <li>Sprint planning — 21 August</li>
                </>
              ) : (
                <>
                  <li>Adjustment review meeting — 1 September</li>
                  <li>Term project submission — 12 September</li>
                </>
              )}
            </ul>
          </CardBody>
        </Card>
      </Grid>

      <div className="mt-8">
        <SectionTitle>Requests and responses</SectionTitle>
        <ul className="space-y-3">
          {shown.map((request) => (
            <li key={request.id}>
              <Link
                to={`/patient/requests/${request.id}`}
                className="block rounded-[20px]  bg-surface-2 px-5 py-4 hover:border-line-strong"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.93rem] font-medium text-ink">{request.title}</p>
                    <p className="mt-0.5 text-[0.82rem] text-muted">
                      {request.destination} · raised {formatDate(request.raised)}
                    </p>
                    <p className="mt-1 text-[0.82rem] text-ink-2">With {request.currentOwner}</p>
                  </div>
                  <StatusPill status={request.status} />
                </div>
              </Link>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="rounded-[20px]  border-dashed border-line-strong px-5 py-6 text-[0.86rem] text-muted">
              Nothing requested here yet.
            </li>
          ) : null}
        </ul>
      </div>

      {/* 9.4 Accommodation status */}
      {shown[0] ? (
        <div className="mt-8">
          <SectionTitle>Status of the current request</SectionTitle>
          <Card>
            <CardBody>
              <ol className="flex flex-wrap gap-2">
                {['Draft', 'Submitted', 'Under review', 'Approved / declined', 'Implemented', 'Outcome'].map(
                  (step, i) => (
                    <li
                      key={step}
                      className={`rounded-full  px-3 py-1.5 text-[0.8rem] ${
                        i < 2
                          ? 'bg-state-good-tint text-state-good'
                          : i === 2
                            ? 'border-brand bg-brand-tint text-brand-ink'
                            : 'border-line text-muted'
                      }`}
                    >
                      {step}
                    </li>
                  ),
                )}
              </ol>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------- 9.2 Accommodation request builder */

const STEPS = ['Need', 'Context', 'Possible support', 'Draft', 'Review', 'Approve', 'Send'] as const

export function PatientRequestBuilder() {
  const navigate = useNavigate()
  const { say } = useUI()
  // Arriving from a conversation rather than from the navigation: what the
  // person already said becomes the first field, so the request starts where
  // the conversation got to instead of at an empty form.
  const location = useLocation() as { state?: { from?: string } }
  const carried = location.state?.from?.trim()
  const [step, setStep] = useState(0)
  const [need, setNeed] = useState(
    carried || 'Meetings keep changing at the last minute and I lose the rest of the day.',
  )
  const [chosen, setChosen] = useState<string[]>([
    'Written notice of meeting changes',
    'Twenty minutes of protected time after an unplanned meeting',
  ])
  const [draftText, setDraftText] = useState(
    'I am asking for two adjustments to how schedule changes are handled. Where a meeting moves, I would like the change sent in writing to one agreed channel. Where a change cannot be notified in advance, I would like twenty minutes of protected time before my next task.',
  )

  const options = [
    'Written notice of meeting changes',
    'Twenty minutes of protected time after an unplanned meeting',
    'One agreed channel for all task changes',
    'Bookable quiet space',
    'No back-to-back meetings after a change',
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Ask for something at work"
        description="ORCA writes the request from what is already in your record. You see exactly what would be sent before anyone else does."
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Work / University', to: '/patient/work' },
          { label: 'New request' },
        ]}
      />

      {carried ? (
        <div className="mb-6 rounded-[20px]  bg-brand-tint px-4 py-3">
          <p className="text-[0.85rem] font-semibold text-brand-ink">ORCA understood you</p>
          <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">
            This is filled in from what you told ORCA, in your words. Change anything that is not
            right — nothing is sent until you have read the whole thing at the end.
          </p>
        </div>
      ) : null}

      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full  px-3 py-1.5 text-[0.79rem] ${
              i < step
                ? 'bg-state-good-tint text-state-good'
                : i === step
                  ? 'border-brand bg-brand-tint text-brand-ink'
                  : 'border-line text-muted'
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      <Card>
        <CardBody className="space-y-4">
          {step === 0 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">What is difficult at the moment?</h2>
              <textarea
                rows={4}
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                className="w-full rounded-2xl  border-line-strong px-3.5 py-3 text-[0.9rem] leading-relaxed outline-none"
              />
              <p className="text-[0.82rem] text-muted">
                Write it as you would say it. ORCA turns it into functional language later — your
                employer never sees this wording unless you choose to keep it.
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">What ORCA already knows about this</h2>
              <ul className="space-y-2 text-[0.88rem] leading-relaxed text-ink">
                <li>Three similar difficulties recorded since May, twice at work.</li>
                <li>Written notice several hours ahead has been effective before.</li>
                <li>An occupational therapy visit on 4 August covered your workplace environment.</li>
              </ul>
              <Callout tone="info" title="Nothing here has been shared yet">
                This context is used to write the request. You will choose which parts of it are
                included.
              </Callout>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">What would you like to ask for?</h2>
              <ul className="space-y-2">
                {options.map((option) => (
                  <li key={option}>
                    <label className="flex items-start gap-2.5 rounded-2xl  border-line px-3.5 py-3 text-[0.88rem] text-ink">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={chosen.includes(option)}
                        onChange={(e) =>
                          setChosen((c) =>
                            e.target.checked ? [...c, option] : c.filter((x) => x !== option),
                          )
                        }
                      />
                      {option}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">Draft request</h2>
              <textarea
                rows={7}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className="w-full rounded-2xl  border-line-strong px-3.5 py-3 text-[0.9rem] leading-relaxed outline-none"
              />
              <AiProvenance />
            </>
          ) : null}

          {step === 4 ? (
            <DisclosureReview
              request={requests[0]}
              draftText={draftText}
              embedded
              onApprove={() => setStep(5)}
            />
          ) : null}

          {step === 5 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">Approve and send</h2>
              <p className="text-[0.88rem] leading-relaxed text-ink-2">
                This approval covers one recipient, one purpose and this content only. If your
                employer asks a follow-up question, you will be asked again before anything else is
                sent.
              </p>
              <DefinitionList
                items={[
                  { label: 'Recipient', value: 'Anil Fernandes — Northline Technologies (HR)' },
                  { label: 'Purpose', value: 'Workplace accommodation request' },
                  { label: 'Approval valid until', value: '18 November 2026' },
                ]}
              />
            </>
          ) : null}

          {step === 6 ? (
            <Callout tone="good" title="Request sent">
              Your request is with HR. You can track it under Requests, and withdraw it at any time.
            </Callout>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-5 flex flex-wrap gap-2">
        {step > 0 && step < 6 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
        {step < 5 && step !== 4 ? (
          <Button variant="primary" onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : null}
        {step === 5 ? (
          <Button
            variant="primary"
            onClick={() => {
              setStep(6)
              say('Sent to HR. Recorded in your sharing history.')
            }}
          >
            Approve and send
          </Button>
        ) : null}
        {step === 6 ? (
          <Button variant="primary" onClick={() => navigate('/patient/requests/rq-1')}>
            Track this request
          </Button>
        ) : null}
        {chosen.length === 0 && step === 2 ? (
          <span className="self-center text-[0.82rem] text-muted">Choose at least one.</span>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------ 9.3 Disclosure review */

export function DisclosureReview({
  request,
  draftText,
  embedded,
  onApprove,
}: {
  request: RequestRecord
  draftText?: string
  embedded?: boolean
  onApprove?: () => void
}) {
  const { say } = useUI()
  const [removed, setRemoved] = useState<string[]>([])
  const items = request.authorisedInformation.filter((i) => !removed.includes(i))

  const body = (
    <div className="space-y-5">
      <div>
        <h2 className="text-[1rem] font-medium text-ink">What will be shared?</h2>
        <p className="mt-1 text-[0.84rem] text-muted">
          This is the exact content. Nothing else leaves ORCA.
        </p>
        {draftText ? (
          <p className="mt-3 rounded-[20px] bg-canvas px-4 py-3 text-[0.88rem] leading-relaxed text-ink">
            {draftText}
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start justify-between gap-3 rounded-2xl  border-line px-3.5 py-3"
            >
              <span className="text-[0.88rem] leading-relaxed text-ink">{item}</span>
              <button
                onClick={() => setRemoved((r) => [...r, item])}
                className="shrink-0 text-[0.8rem] text-state-alert hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {removed.length ? (
          <p className="mt-2 text-[0.82rem] text-muted">
            {removed.length} item{removed.length === 1 ? '' : 's'} removed and will not be sent.
          </p>
        ) : null}
      </div>

      <DefinitionList
        items={[
          { label: 'Who will receive it', value: request.destination },
          { label: 'Why', value: `${request.type} request — ${request.title}` },
          {
            label: 'Sources',
            value: 'Your reports (3), occupational therapy observation (1), strategy check-ins (3)',
          },
        ]}
      />

      <div className="rounded-[20px]  bg-state-good-tint px-4 py-3">
        <p className="text-[0.8rem] font-semibold uppercase tracking-[0.07em] text-state-good">
          Held back automatically
        </p>
        <ul className="mt-1 space-y-1 text-[0.85rem] text-ink-2">
          {request.withheld.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => say('Opened for editing.')}>Edit</Button>
        <Button onClick={() => say('Nothing was sent. The request stays as a draft.')}>Reject</Button>
        <Button
          variant="primary"
          onClick={() => {
            say('Approved for this recipient and purpose only.')
            onApprove?.()
          }}
        >
          Approve &amp; share
        </Button>
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Check what will be shared"
        description="Read this carefully. Once you approve, this exact content goes to this one recipient for this one purpose."
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Requests', to: '/patient/requests' },
          { label: 'Disclosure review' },
        ]}
      />
      <Card>
        <CardBody>{body}</CardBody>
      </Card>
    </div>
  )
}

export function PatientDisclosureRoute() {
  const { requestId } = useParams()
  const request = requests.find((r) => r.id === requestId) ?? requests[1]
  return <DisclosureReview request={request} />
}
