import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { accountFor, accounts, hasOnboarded, useSession } from '../../state/session'
import { Button, Card, CardBody } from '../../components/ui'

function AuthFrame({
  title,
  intro,
  children,
  wide,
}: {
  title: string
  intro?: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-md'}>
        <div className="mb-6 flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-2xl bg-brand text-[0.85rem] font-bold text-white"
          >
            O
          </span>
          <span className="text-[1.1rem] font-semibold tracking-[-0.01em]">ORCA</span>
        </div>
        <h1 className="text-[1.4rem] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {intro ? <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-2">{intro}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 1.1 — Sign in */

export function Login() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const signInAs = accounts()

  const fill = (option: (typeof signInAs)[number]) => {
    setEmail(option.email)
    setPassword('demo-password')
    setError(null)
  }

  const submit = () => {
    const account = accountFor(email)
    if (!account) {
      setError('No account with that email. Pick one of the people below to fill it in.')
      return
    }
    signIn(account)
    // Not account.home: someone who has never been here goes to the
    // introduction first, and the route table decides which that is.
    navigate(hasOnboarded(account.personId) ? account.home : '/setup', { replace: true })
  }

  return (
    <AuthFrame
      title="Sign in to ORCA"
      intro="Everyone has their own account. What you see is what that person is allowed to see — never more."
      wide
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card>
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-ink-2">Email</span>
                <input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  placeholder="name@example.in"
                  autoComplete="username"
                  className="w-full rounded-2xl  border-line-strong px-3 py-2.5 text-[0.9rem] outline-none placeholder:text-muted"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-ink-2">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-2xl  border-line-strong px-3 py-2.5 text-[0.9rem] outline-none"
                />
              </label>

              {error ? (
                <p className="text-[0.83rem] leading-relaxed text-state-alert">{error}</p>
              ) : null}

              <Button type="submit" variant="primary" className="w-full">
                Sign in
              </Button>

              {/* The workflow chat, reachable only from here. It signs in the
                  same way and then goes to a bare screen instead of the
                  product, because the point of it is to test one workflow
                  rather than to use ORCA. Left as a second button rather than
                  a setting: it is a development door, and it should look like
                  one. */}
              <button
                type="button"
                onClick={() => {
                  const account = accountFor(email)
                  if (!account) {
                    setError('Pick one of the people below first — the chat needs a real sign-in to build the trigger.')
                    return
                  }
                  signIn(account)
                  navigate('/chat', { replace: true })
                }}
                className="w-full rounded-2xl border border-line-strong px-3 py-2.5 text-[0.85rem] font-medium text-ink-2 hover:border-brand hover:text-brand"
              >
                Sign in to the workflow chat
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-4 text-[0.82rem] text-muted">
              <button className="hover:text-ink hover:underline">Forgot password</button>
              <button className="hover:text-ink hover:underline">Privacy</button>
              <button className="hover:text-ink hover:underline">Help</button>
            </div>
          </CardBody>
        </Card>

        {/* Not a role picker. These are the people in one person's record, and
            choosing one fills in that person's sign-in so you can see the same
            situation from where they stand. */}
        <div>
          <h2 className="mb-1 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Sign in as someone in this record
          </h2>
          <p className="mb-3 text-[0.83rem] leading-relaxed text-muted">
            This prototype ships with the people around one person&rsquo;s care. Choosing one fills in
            their details; press Sign in to open their account.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {signInAs.map((option) => (
              <li key={option.personId}>
                <button
                  type="button"
                  onClick={() => fill(option)}
                  aria-pressed={email === option.email}
                  className={`h-full w-full rounded-[20px]  px-4 py-3 text-left transition-colors ${
                    email === option.email
                      ? 'border-brand bg-brand-tint'
                      : 'bg-surface-2 hover:bg-surface-2'
                  }`}
                >
                  <span className="block text-[0.89rem] font-medium text-ink">{option.name}</span>
                  <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-muted">
                    {option.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-[0.8rem] leading-relaxed text-muted">
        This is a prototype. Every person here is invented, no real credentials are checked, and no
        real record is stored. Open two browsers side by side to watch a decision move between two of
        them.
      </p>
    </AuthFrame>
  )
}

/* ------------------------------------------------------ 1.3 — First-time setup */

const patientSetup = [
  {
    title: 'Communication preferences',
    options: ['Written messages', 'Plain language', 'One thing at a time', 'No unscheduled calls'],
  },
  {
    title: 'Privacy defaults',
    options: [
      'Ask me every time before anything is shared',
      'Never include clinical documents by default',
      'Never include journal entries',
    ],
  },
  { title: 'Trusted person', options: ['Add later', 'Divya Rao (sister)'] },
  {
    title: 'Consent preferences',
    options: ['Time-limited access only', 'Review all access every six months'],
  },
]

const professionalSetup = [
  { title: 'Organisation', options: ['Sahyadri Neurodevelopmental Clinic', 'Add another'] },
  { title: 'Professional role', options: ['Clinical psychologist', 'Supervisor'] },
  {
    title: 'Access permissions',
    options: ['Patients who have connected to me', 'Clinic-wide (requires approval)'],
  },
  { title: 'Patient list configuration', options: ['By next appointment', 'By recent change'] },
]

const institutionSetup = [
  { title: 'Organisation', options: ['Northline Technologies', 'Pune Institute of Design'] },
  { title: 'Team', options: ['People & Culture', 'Accessibility office'] },
  {
    title: 'Permission level',
    options: ['Requests only — no clinical information', 'Requests and implementation tracking'],
  },
]

export function FirstRun() {
  const { role, option, completeSetup } = useSession()
  const navigate = useNavigate()
  const [choices, setChoices] = useState<Record<string, string>>({})

  const groups =
    role === 'patient'
      ? patientSetup
      : ['employer', 'university', 'clinic', 'admin'].includes(role ?? '')
        ? institutionSetup
        : professionalSetup

  return (
    <AuthFrame
      title="Set up your account"
      intro="These choices can be changed at any time. They control what ORCA does by default, not what it is allowed to do — that always needs your approval."
      wide
    >
      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardBody>
              <h2 className="text-[0.92rem] font-semibold text-ink">{group.title}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setChoices((c) => ({ ...c, [group.title]: opt }))}
                    aria-pressed={choices[group.title] === opt}
                    className={`rounded-full  px-3 py-1.5 text-[0.82rem] ${
                      choices[group.title] === opt
                        ? 'border-brand bg-brand-tint text-brand-ink'
                        : 'border-line text-ink-2 hover:border-line-strong'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <Button
          variant="primary"
          onClick={() => {
            completeSetup()
            navigate(option?.home ?? '/patient')
          }}
        >
          Continue
        </Button>
        <Button
          onClick={() => {
            completeSetup()
            navigate(option?.home ?? '/patient')
          }}
        >
          Skip for now
        </Button>
      </div>
    </AuthFrame>
  )
}
