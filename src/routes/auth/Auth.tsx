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
                  className="w-full rounded-2xl border border-line-strong px-3 py-2.5 text-[0.9rem] outline-none placeholder:text-muted"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-ink-2">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-line-strong px-3 py-2.5 text-[0.9rem] outline-none"
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
            {/*
              What used to be here: Forgot password, Privacy, Help — three
              buttons with no handler between them. A control that does nothing
              is worse on a sign-in screen than anywhere else, because the one
              person most likely to press "Forgot password" is the one who
              cannot get in, and nothing happening is indistinguishable from
              the page being broken.

              Replaced by the fact somebody actually needs at this point: the
              password is not checked, so a wrong one is not why sign-in
              failed.
            */}
            <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
              The password is not checked — any text will do. Only the email decides who you
              sign in as.
            </p>
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
                  className={`h-full w-full rounded-[20px] border px-4 py-3 text-left transition-colors ${
                    email === option.email
                      ? 'border-brand bg-brand-tint'
                      : 'border-line bg-surface-2 hover:border-line-strong'
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
