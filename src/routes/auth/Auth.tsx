import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { roleOptions, useSession } from '../../state/session'
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
            className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-[0.85rem] font-bold text-white"
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
  const [email, setEmail] = useState('ananya.rao@example.in')
  const [password, setPassword] = useState('demo-password')

  return (
    <AuthFrame
      title="Sign in to ORCA"
      intro="One account, one record. What you see next depends on the role you are using."
    >
      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              signIn()
              navigate('/role')
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-1 block text-[0.82rem] text-ink-2">Email or phone</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line-strong px-3 py-2.5 text-[0.9rem] outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.82rem] text-ink-2">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line-strong px-3 py-2.5 text-[0.9rem] outline-none"
              />
            </label>
            <Button type="submit" variant="primary" className="w-full">
              Sign in
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-4 text-[0.82rem] text-muted">
            <button className="hover:text-ink hover:underline">Forgot password</button>
            <button className="hover:text-ink hover:underline">Privacy</button>
            <button className="hover:text-ink hover:underline">Help</button>
          </div>
        </CardBody>
      </Card>
      <p className="mt-4 text-[0.8rem] leading-relaxed text-muted">
        This is a prototype. No real credentials are checked and no real data is stored.
      </p>
    </AuthFrame>
  )
}

/* ------------------------------------------------------- 1.2 — Role selection */

export function RoleSelect() {
  const { chooseRole, setupComplete } = useSession()
  const navigate = useNavigate()

  return (
    <AuthFrame
      title="How are you accessing ORCA today?"
      intro="This account has more than one permitted role. Each role sees a different part of the same record — nothing more than its purpose requires."
      wide
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {roleOptions.map((option) => (
          <li key={option.role}>
            <button
              onClick={() => {
                chooseRole(option.role)
                navigate(setupComplete ? option.home : '/setup')
              }}
              className="h-full w-full rounded-[10px] border border-line bg-surface px-4 py-4 text-left hover:border-line-strong hover:bg-surface-2"
            >
              <span className="block text-[0.95rem] font-semibold text-ink">{option.label}</span>
              <span className="mt-1 block text-[0.82rem] leading-relaxed text-muted">
                {option.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
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
                    className={`rounded-full border px-3 py-1.5 text-[0.82rem] ${
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
