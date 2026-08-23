import { useState } from 'react'
import { ActionBar } from '../../components/ActionBar'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  Grid,
  PageHeader,
  SectionTitle,
  StatusPill,
  Table,
  Tag,
  formatDate,
} from '../../components/ui'
import { TODAY, patientName, patientsFor, requests, strategiesFor } from '../../data/db'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'
import type { RequestRecord, Role } from '../../data/types'

const isOrgRole = (role: Role | null): role is 'employer' | 'university' =>
  role === 'employer' || role === 'university'

function orgRequests(role: Role | null) {
  return requests.filter((r) => r.destinationRole === role)
}

/** 28.1 / 29.1 — employer and university dashboards. No clinical timeline. */
export function OrgDashboard() {
  const { role, option, organisation } = useSession()
  const base = option?.home ?? '/employer'
  const mine = orgRequests(role)
  const isUni = role === 'university'

  const incoming = mine.filter((r) => r.status === 'Awaiting stakeholder')
  const waiting = mine.filter((r) => r.status === 'Awaiting information')

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Dashboard"
        description={`${organisation} — requests for workplace or study adjustments, what they require, and when they are due.`}
      />

      <ActionBar />

      <Callout tone="info" title="What you can see here">
        Requests describe what someone needs in order to do their {isUni ? 'course' : 'job'}. They do
        not contain diagnoses, clinical notes or medical documents, and asking for them is not part
        of this process.
      </Callout>

      {/* One operational sentence, not a wall of counters.
          The previous version had "New requests" and "Awaiting your action"
          showing the same number from the same array — four tiles saying two
          things, one of them twice. An HR officer opening this between
          meetings needs to know what they owe somebody and by when; the rest
          is a list they can read underneath. */}
      <NextAction incoming={incoming} waiting={waiting} base={base} isUni={isUni} />

      <div className="mt-8">
        <SectionTitle>Requests needing a decision</SectionTitle>
        <div className="space-y-3">
          {incoming.map((r) => (
            <Link
              key={r.id}
              to={`${base}/requests/${r.id}`}
              className="block rounded-[20px]  bg-surface-2 px-5 py-4 hover:border-line-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.93rem] font-medium text-ink">{r.title}</p>
                  <p className="mt-0.5 text-[0.82rem] text-muted">
                    {isUni ? 'Student' : 'Employee'}: {patientName(r.patientId)} · received{' '}
                    {formatDate(r.raised)}
                  </p>
                  <p className="mt-1 text-[0.84rem] text-ink-2">{r.functionalRequirement}</p>
                </div>
                <StatusPill status={r.status} />
              </div>
            </Link>
          ))}
          {incoming.length === 0 ? (
            <p className="rounded-[20px]  border-dashed border-line-strong px-5 py-6 text-[0.86rem] text-muted">
              Nothing waiting on you.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <SectionTitle>Upcoming reviews</SectionTitle>
        <Card>
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] text-ink">
              {isUni ? (
                <li>
                  Written summary of brief changes — Farida Qureshi
                  <span className="block text-[0.79rem] text-muted">Review January 2027</span>
                </li>
              ) : (
                <li>
                  Notice and transition buffer — Ananya Rao
                  <span className="block text-[0.79rem] text-muted">
                    Review 18 November 2026, if approved
                  </span>
                </li>
              )}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/** Request queue. */
export function OrgRequests() {
  const { role, option } = useSession()
  const base = option?.home ?? '/employer'
  const mine = orgRequests(role)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Accommodation requests"
        description="Each request states a functional requirement and the adjustment being asked for."
      />
      <Card>
        <Table
          columns={[
            role === 'university' ? 'Student' : 'Employee',
            'Request',
            'Received',
            'Status',
            'Currently with',
          ]}
          rows={mine.map((r) => ({
            key: r.id,
            to: `${base}/requests/${r.id}`,
            cells: [patientName(r.patientId), r.title, formatDate(r.raised), <StatusPill key="s" status={r.status} />, r.currentOwner],
          }))}
        />
      </Card>
    </div>
  )
}

/** 28.2 / 29.2 — the review screen. Only authorised functional information. */
export function OrgRequestDetail() {
  const { requestId } = useParams()
  const { role, option } = useSession()
  const { say } = useUI()
  const base = option?.home ?? '/employer'
  const request = requests.find((r) => r.id === requestId)
  const [decision, setDecision] = useState<string | null>(null)
  const [clarification, setClarification] = useState('')
  const [asking, setAsking] = useState(false)

  if (!request || !isOrgRole(role)) {
    return <p className="text-[0.9rem] text-muted">Request not found.</p>
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={request.title}
        description={`${role === 'university' ? 'Student' : 'Employee'}: ${patientName(request.patientId)} · received ${formatDate(request.raised)}`}
        breadcrumbs={[{ label: 'Requests', to: `${base}/requests` }, { label: 'Request' }]}
        actions={<StatusPill status={request.status} />}
      />

      <Card className="mb-6">
        <CardHead title="What is being asked for" />
        <CardBody>
          <DefinitionList
            items={[
              { label: 'Requested adjustment', value: request.requestedAdjustment },
              {
                label: role === 'university' ? 'Functional educational requirement' : 'Functional requirement',
                value: request.functionalRequirement,
              },
              { label: 'Implementation', value: request.implementation },
              ...(request.reviewDate ? [{ label: 'Review date', value: formatDate(request.reviewDate) }] : []),
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHead
          title="Authorised supporting information"
          meta="Shared by the requester for this purpose only"
        />
        <CardBody>
          <ul className="space-y-2">
            {request.authorisedInformation.map((item) => (
              <li key={item} className="text-[0.88rem] leading-relaxed text-ink">
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-[20px] bg-canvas px-4 py-3">
            <p className="text-[0.84rem] leading-relaxed text-ink-2">
              Clinical records, diagnostic documents and personal notes are not part of this process
              and are not available through ORCA. A decision should be based on the functional
              requirement above.
            </p>
          </div>
        </CardBody>
      </Card>

      {decision ? (
        <Callout tone={decision.startsWith('Declined') ? 'alert' : 'good'} title={decision}>
          The requester has been notified and the outcome is recorded.
        </Callout>
      ) : asking ? (
        <Card className="mb-6">
          <CardHead title="Request clarification" meta="Ask for what you need to decide — nothing more" />
          <CardBody className="space-y-3">
            <textarea
              rows={3}
              value={clarification}
              onChange={(e) => setClarification(e.target.value)}
              placeholder="For example: which scheduling information would be most useful?"
              className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.87rem] outline-none"
            />
            <p className="text-[0.82rem] leading-relaxed text-muted">
              Your question goes back into the workflow. The requester decides what to answer, and
              their answer is approved by them before you see it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setDecision('Clarification requested')
                  say('Clarification sent back into the workflow.')
                }}
              >
                Send question
              </Button>
              <Button onClick={() => setAsking(false)}>Cancel</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              setDecision('Approved')
              say('Approved. Implementation details were sent to the requester.')
            }}
          >
            Approve
          </Button>
          <Button onClick={() => setAsking(true)}>Request clarification</Button>
          <Button
            variant="danger"
            onClick={() => {
              setDecision('Declined — a reason is required and will be shared')
              say('Declined. A reason must be given.')
            }}
          >
            Decline
          </Button>
        </div>
      )}

      <div className="mt-8">
        <SectionTitle>What happens next</SectionTitle>
        <Card>
          <CardBody>
            <ol className="flex flex-wrap gap-2">
              {['Received', 'Under review', 'Decision', 'Implementation', 'Review'].map((step, i) => (
                <li
                  key={step}
                  className={`rounded-full  px-3 py-1.5 text-[0.8rem] ${
                    i < 1
                      ? 'bg-state-good-tint text-state-good'
                      : i === 1
                        ? 'border-org bg-org-tint text-org'
                        : 'border-line text-muted'
                  }`}
                >
                  {step}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/** Active / approved accommodations. */
export function OrgActive() {
  const { role } = useSession()
  const isUni = role === 'university'

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={isUni ? 'Approved accommodations' : 'Active accommodations'}
        description="What has been agreed, how it is implemented, and when it is next reviewed."
      />
      <Grid cols={2}>
        {isUni ? (
          <Card>
            <CardHead title="Written summary of brief changes" meta="Farida Qureshi" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Implementation', value: 'Tutor sends a written summary within one working day.' },
                  { label: 'Agreed', value: formatDate('2026-06-02') },
                  { label: 'Review', value: 'January 2027' },
                ]}
              />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHead title="No active accommodations" meta="One request is under review" />
            <CardBody>
              <p className="text-[0.87rem] leading-relaxed text-ink-2">
                Once a request is approved it appears here with its implementation detail and review
                date.
              </p>
            </CardBody>
          </Card>
        )}
      </Grid>
    </div>
  )
}

/** Employees / students list — no clinical information at all. */
export function OrgPeople() {
  const { role, option } = useSession()
  const base = option?.home ?? '/employer'
  const isUni = role === 'university'
  // Derived from the connections this organisation actually holds. It used to
  // be two hard-coded lists of patient ids, so adding a person to the system
  // meant editing this file, and an employer saw whoever was written here.
  const list = patientsFor(role ?? 'employer', option?.personId)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={isUni ? 'Students' : 'Employees'}
        description="People who have raised a request through ORCA. Nothing clinical is shown, and no record is created here."
      />
      <Card>
        <Table
          columns={[isUni ? 'Student' : 'Employee', 'Open requests', 'Agreed adjustments', 'Next review']}
          rows={list.map((p) => {
            const theirs = requests.filter((r) => r.patientId === p.id && r.destinationRole === role)
            const agreed = strategiesFor(p.id).filter((st) => st.status === 'Active')
            const review = agreed
              .map((st) => st.reviewDate)
              .sort()
              .find(Boolean)
            return {
              key: p.id,
              // A name leads to everything this organisation may see about the
              // person, not to whichever request happened to be raised first.
              to: `${base}/patients/${p.id}`,
              cells: [
                p.name,
                theirs.filter((r) => r.status !== 'Completed').length,
                agreed.length,
                review ? formatDate(review) : '—',
              ],
            }
          })}
        />
      </Card>
    </div>
  )
}

/** Tasks. */
export function OrgTasks() {
  const { role } = useSession()
  const mine = orgRequests(role)
  return (
    <div className="max-w-5xl">
      <PageHeader title="Tasks" description="Decisions and implementation steps assigned to your team." />
      <Card>
        <CardBody>
          <ul className="space-y-3">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.89rem] text-ink">Decide on: {r.title}</p>
                  <p className="text-[0.79rem] text-muted">
                    {patientName(r.patientId)} · received {formatDate(r.raised)}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

/** Documents — implementation paperwork only. */
export function OrgDocuments() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Documents"
        description="Implementation and process documents. Clinical documents are never listed here."
      />
      <Card>
        <CardBody>
          <ul className="space-y-3 text-[0.87rem] text-ink">
            <li>
              Adjustment implementation note — template
              <span className="block text-[0.79rem] text-muted">Process document · updated 4 July 2026</span>
            </li>
            <li>
              Accommodation decision record — template
              <span className="block text-[0.79rem] text-muted">Process document · updated 4 July 2026</span>
            </li>
          </ul>
          <div className="mt-4">
            <Tag>No clinical documents are accessible from this role</Tag>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

/** Communication — messages that stay inside the workflow. */
export function OrgCommunication() {
  const { say } = useUI()
  const [message, setMessage] = useState('')

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Communication"
        description="Messages are attached to a request, so there is a record of what was asked and answered."
      />
      <Card>
        <CardHead title="Notice and transition buffer — Ananya Rao" meta="Request rq-1" />
        <CardBody className="space-y-4">
          <div className="rounded-[20px] bg-canvas px-4 py-3">
            <p className="text-[0.86rem] leading-relaxed text-ink">
              “Please clarify what scheduling information would be most useful, and whether the buffer
              is needed after every meeting or only unplanned ones.”
            </p>
            <p className="mt-1 text-[0.78rem] text-muted">You · 19 August 2026</p>
          </div>
          <p className="text-[0.85rem] text-muted">Awaiting a reply from the requester.</p>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message to this request"
            className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.87rem] outline-none"
          />
          <Button variant="primary" onClick={() => say('Message added to the request.')}>
            Send
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}

/** University academic support. */
export function OrgAcademicSupport() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Academic support"
        description="Support in place across teaching, assessment and placement, and who arranges each part."
      />
      <Card>
        <Table
          columns={['Student', 'Support', 'Where it applies', 'Arranged by', 'Status']}
          rows={[
            {
              key: 'a1',
              cells: [
                'Farida Qureshi',
                'Written summary of brief changes',
                'Studio modules',
                'Course leader',
                <StatusPill key="s" status="Active" />,
              ],
            },
            {
              key: 'a2',
              cells: [
                'Farida Qureshi',
                'Separate room and additional time',
                'Assessment week',
                'Accessibility office',
                <StatusPill key="s" status="Awaiting information" />,
              ],
            },
            {
              key: 'a3',
              cells: [
                'Neha Iyer',
                'Transition induction plan',
                'First year',
                'Accessibility office',
                <StatusPill key="s" status="In progress" />,
              ],
            },
          ]}
        />
      </Card>
    </div>
  )
}


/**
 * What this organisation actually has to do.
 *
 * Employers and universities are the only people in this system who did not
 * choose to be here. They have one request in front of them, a legal duty
 * attached to it, and no interest in a caseload view. So the top of their
 * screen is a sentence and a button rather than a dashboard, and the sentence
 * names the oldest thing waiting — because in adjustment requests the age of
 * the request is the thing that eventually becomes the problem.
 */
function NextAction({
  incoming,
  waiting,
  base,
  isUni,
}: {
  incoming: RequestRecord[]
  waiting: RequestRecord[]
  base: string
  isUni: boolean
}) {
  const oldest = [...incoming].sort((a, b) => a.raised.localeCompare(b.raised))[0]
  const days = oldest
    ? Math.round((Date.parse(TODAY) - Date.parse(oldest.raised)) / 86_400_000)
    : 0

  return (
    <div className="mt-6 rounded-[24px]  bg-surface-2 px-5 py-4">
      {oldest ? (
        <>
          <p className="text-[1.02rem] font-medium text-ink">
            {incoming.length === 1
              ? 'One request is waiting on you.'
              : `${incoming.length} requests are waiting on you.`}
          </p>
          <p className="mt-1 text-[0.87rem] leading-relaxed text-ink-2">
            The longest has been open {days} day{days === 1 ? '' : 's'} — {oldest.title}, for{' '}
            {patientName(oldest.patientId)}. Nothing has been shared with anyone else while it
            waits.
          </p>
          <Link
            to={`${base}/requests/${oldest.id}`}
            className="mt-3 inline-block rounded-2xl bg-org px-4 py-2 text-[0.87rem] font-medium text-white hover:opacity-90"
          >
            Open the oldest one
          </Link>
        </>
      ) : (
        <p className="text-[1.02rem] font-medium text-ink">Nothing is waiting on you.</p>
      )}

      {waiting.length ? (
        <p className="mt-3 border-t border-line pt-3 text-[0.84rem] leading-relaxed text-muted">
          {waiting.length} other request{waiting.length === 1 ? ' is' : 's are'} with the{' '}
          {isUni ? 'student' : 'employee'} — you asked a question and are waiting on the answer.
          They are not counted above, because they are not yours to move.
        </p>
      ) : null}
    </div>
  )
}
