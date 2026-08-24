import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  PageHeader,
  StatusPill,
  Tabs,
  formatDate,
} from '../../components/ui'
import { ClarificationCard, RecordSource, ReviewRequiredCard, WorkflowStatePanel } from '../../components/shared'
import { ApprovalPanel } from '../../components/ApprovalPanel'
import { Inbox, RaiseDecision } from '../../components/Inbox'
import type { PendingApproval } from '../../components/ApprovalPanel'
import { requests, requestsFor, reviewItems } from '../../data/db'
import { useOrcaRead } from '../../lib/orca'
import { respondToApproval } from '../../lib/approvals'
import { useUI } from '../../state/ui'
import { useRecordId } from '../../state/record'

/** 13.1 My requests. */
export function PatientRequests() {
  const patientId = useRecordId()
  const [tab, setTab] = useState('Requires action')
  const [open, setOpen] = useState<PendingApproval | null>(null)
  const all = requestsFor(patientId)

  // Approvals a workflow is currently stopped on. These come first on the page
  // because a paused run is costing someone else time, and because they are
  // the only thing here that cannot move without this person.
  const approvals = useOrcaRead<{ approvals: PendingApproval[] }>('approvals')
  const waiting = (approvals.data?.approvals ?? []).filter((a) => a.status === 'Awaiting approval')

  const filtered = {
    'Requires action': all.filter((r) =>
      ['Awaiting approval', 'Awaiting information'].includes(r.status) || r.clarifications.some((c) => !c.answer),
    ),
    Active: all.filter((r) => r.status === 'Awaiting stakeholder' || r.status === 'In progress'),
    Completed: all.filter((r) => r.status === 'Completed'),
    All: all,
  }[tab]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My requests"
        description="Anything ORCA is carrying on your behalf, and whose desk it is on right now."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Requests' }]}
      />

      <RecordSource state={approvals.state} reason={approvals.reason} />

      <div className="mb-6 space-y-6">
        <Inbox />
        <RaiseDecision />
      </div>

      {waiting.length > 0 ? (
        <div className="mb-6">
          <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Waiting for you to decide
          </h2>
          <ul className="space-y-2">
            {waiting.map((a) => (
              <li key={a.request_id}>
                <button
                  type="button"
                  onClick={() => setOpen(a)}
                  className="block w-full rounded-[20px]  bg-state-wait-tint px-5 py-4 text-left hover:"
                >
                  <p className="text-[0.93rem] font-medium text-ink">{a.title}</p>
                  {a.description ? (
                    <p className="mt-0.5 text-[0.84rem] leading-relaxed text-ink-2">{a.description}</p>
                  ) : null}
                  <p className="mt-1.5 text-[0.81rem] text-muted">
                    Nothing will happen until you answer. Open to see what would be sent.
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs
        tabs={['Requires action', 'Active', 'Completed', 'All']}
        active={tab}
        onChange={setTab}
      />

      <ul className="space-y-3">
        {(filtered ?? []).map((request) => (
          <li key={request.id}>
            <Link
              to={`/patient/requests/${request.id}`}
              className="block rounded-[20px]  bg-surface-2 px-5 py-4 hover:border-line-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.93rem] font-medium text-ink">{request.title}</p>
                  <p className="mt-0.5 text-[0.82rem] text-muted">
                    {request.type} · {request.destination} · raised {formatDate(request.raised)}
                  </p>
                  <p className="mt-1 text-[0.83rem] text-ink-2">Currently with {request.currentOwner}</p>
                </div>
                <StatusPill status={request.status} />
              </div>
            </Link>
          </li>
        ))}
        {(filtered ?? []).length === 0 ? (
          <li className="rounded-[20px]  border-dashed border-line-strong px-5 py-6 text-[0.86rem] text-muted">
            Nothing in this list.
          </li>
        ) : null}
      </ul>

      {open ? (
        <ApprovalPanel
          approval={open}
          onClose={() => setOpen(null)}
          onDecide={(optionId, message) => respondToApproval(open.request_id, optionId, message)}
        />
      ) : null}
    </div>
  )
}

/** 13.2 Request detail — workflow timeline and current owner. */
export function PatientRequest() {
  const { requestId } = useParams()
  const { say } = useUI()
  const request = requests.find((r) => r.id === requestId)
  const review = reviewItems.find((r) => r.id === 'rv-2')

  if (!request) return <p className="text-[0.9rem] text-muted">Request not found.</p>

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={request.title}
        description={`${request.type} request to ${request.destination}`}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'Requests', to: '/patient/requests' },
          { label: 'Request' },
        ]}
        actions={<StatusPill status={request.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {request.clarifications.filter((c) => !c.answer).map((c) => (
            <ClarificationCard key={c.date} question={c.question} from={c.from} date={c.date} />
          ))}

          {request.id === 'rq-1' && review ? <ReviewRequiredCard item={review} /> : null}

          <Card>
            <CardHead title="What was asked for" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Functional requirement', value: request.functionalRequirement },
                  { label: 'Requested adjustment', value: request.requestedAdjustment },
                  { label: 'Implementation', value: request.implementation },
                  ...(request.reviewDate
                    ? [{ label: 'Review date', value: formatDate(request.reviewDate) }]
                    : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="What the recipient can see" meta="Nothing else was sent" />
            <CardBody>
              <ul className="space-y-2">
                {request.authorisedInformation.map((item) => (
                  <li key={item} className="text-[0.87rem] leading-relaxed text-ink">
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-[20px]  bg-state-good-tint px-4 py-3">
                <p className="text-[0.8rem] font-semibold uppercase tracking-[0.07em] text-state-good">
                  Held back
                </p>
                <ul className="mt-1 space-y-1 text-[0.85rem] text-ink-2">
                  {request.withheld.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <WorkflowStatePanel
            title="Where this has got to"
            meta={`Currently with ${request.currentOwner}`}
            steps={request.steps}
          />

          <Card>
            <CardHead title="Actions" />
            <CardBody className="flex flex-col gap-2">
              <Button onClick={() => say('A reminder would go out here. Nothing has been sent in the prototype.')}>Send a reminder</Button>
              <Button onClick={() => say('Withdrawn. Nothing further will be shared.')} variant="danger">
                Withdraw this request
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
