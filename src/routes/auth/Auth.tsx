/**
 * The way in, and the first thing anybody sees.
 *
 * IT WAS THE ONLY SCREEN LEFT IN THE OLD INTERFACE. Every other surface moved
 * to the ORCA system — white ground, one grey, pill controls, shadow instead of
 * stroke — and this one kept the lavender palette, the outlined fields and the
 * bordered cards it was built with, because nothing here sets `data-ia` and
 * every rule in that sheet is scoped to it. So the first impression of the
 * product was a different product, and signing in changed the design language
 * under somebody who had done nothing but type an email. Onboarding hit this
 * exact problem and solved it the same way; this is that fix, one screen later
 * than it should have been.
 *
 * `data-look` is `full` rather than the signed-in person's palette, because
 * nobody is signed in yet. The role-specific looks exist to say how close you
 * are to the person whose record it is, and that question has no answer on a
 * screen where the answer is what you are about to choose. ORCA's own accent
 * is the honest one here.
 *
 * THE PEOPLE LIST IS NOT A ROLE PICKER. These are the people around one
 * person's care, and choosing one fills in that person's sign-in so the same
 * situation can be seen from where they stand. It is grouped by who they are to
 * Ananya rather than sorted alphabetically, because "who else can see this" is
 * the question the list is really answering.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { accountFor, accounts, hasOnboarded, useSession } from '../../state/session'
import { greetingName } from '../../orca/system'
import { IconArrow } from '../../orca/icons'

/**
 * The initial of what you would call them, not of the string.
 *
 * `name[0]` gives D for Dr Kavita Nair, Dr Arun Deshpande and Dr Vikram Rao —
 * three identical letters down a list whose whole job is telling people apart,
 * and the initial of an honorific rather than of a person. Same rule the rail's
 * avatar uses, so the letter does not change when you sign in.
 */
const initialOf = (name: string) =>
  (greetingName(name).split(' ').pop() ?? name).slice(0, 1)

/**
 * The design system, turned on for the screens outside the shell.
 *
 * Same two attributes `Shell` and `Onboarding` set, taken off on the way out so
 * the older routes that are still reachable by URL keep their own sheet.
 */
function useOrcaLook() {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.ia = 'orca'
    root.dataset.look = 'full'
    return () => {
      delete root.dataset.ia
      delete root.dataset.look
    }
  }, [])
}

/** The mark, at the size the rail uses it, so the two read as one product. */
function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        O
      </span>
      <span className="text-[19px] font-bold tracking-[-0.02em]">ORCA</span>
    </div>
  )
}

/**
 * How each person stands to Ananya.
 *
 * Read off the account's own title rather than kept as a second list, so adding
 * a person to the prototype cannot leave them ungrouped. Anything unrecognised
 * falls into "Around the record", which is true of everyone here.
 */
function groupOf(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('living with')) return 'People with a record'
  if (/psycholog|psychiat|therap|occupational|general practi|coordinator/.test(t)) {
    return 'Clinical team'
  }
  if (/hr|accessibility|adviser|business partner/.test(t)) return 'Work and study'
  if (/sister|trusted|parent|partner/.test(t)) return 'Trusted people'
  if (t.includes('administrator')) return 'Platform'
  return 'Around the record'
}

const ORDER = [
  'People with a record',
  'Clinical team',
  'Work and study',
  'Trusted people',
  'Platform',
  'Around the record',
]

export function Login() {
  useOrcaLook()

  const { signIn } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const signInAs = accounts()

  const grouped = ORDER.map((name) => ({
    name,
    people: signInAs.filter((o) => groupOf(o.title) === name),
  })).filter((g) => g.people.length)

  const chosen = signInAs.find((o) => o.email === email) ?? null

  const submit = () => {
    const account = accountFor(email)
    if (!account) {
      setError('No account with that email. Choose one of the people on the right.')
      return
    }
    signIn(account)
    // Not account.home: someone who has never been here goes to the
    // introduction first, and the route table decides which that is.
    navigate(hasOnboarded(account.personId) ? account.home : '/setup', { replace: true })
  }

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-10">
          <Wordmark />
          <h1 className="o-title mt-7">Sign in to ORCA</h1>
          <p className="o-body o-measure mt-3" style={{ color: 'var(--ink-2)' }}>
            Everyone has their own account. What you see is what that person is allowed to
            see — never more.
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
          {/* ------------------------------------------------------- the form */}
          <div className="o-card lg:sticky lg:top-10">
            <div className="o-card-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <label htmlFor="login-email" className="o-label mb-2 block">
                  Email
                </label>
                <input
                  id="login-email"
                  className="o-input"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  placeholder="name@example.in"
                  autoComplete="username"
                  aria-invalid={error ? 'true' : undefined}
                />

                <label htmlFor="login-password" className="o-label mt-5 mb-2 block">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  className="o-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />

                {error ? (
                  <p className="o-meta mt-3" role="alert" style={{ color: 'var(--c-decision)' }}>
                    {error}
                  </p>
                ) : null}

                <button type="submit" className="o-btn o-btn-primary mt-6 w-full">
                  {chosen ? `Sign in as ${chosen.name}` : 'Sign in'}
                  <IconArrow size={16} />
                </button>

                {/*
                  The workflow chat, reachable only from here. It signs in the
                  same way and then goes to a bare screen instead of the
                  product, because the point of it is to test one workflow
                  rather than to use ORCA. Left as a second control rather than
                  a setting: it is a development door, and it should look like
                  one.
                */}
                <button
                  type="button"
                  className="o-btn mt-3 w-full"
                  onClick={() => {
                    const account = accountFor(email)
                    if (!account) {
                      setError(
                        'Choose one of the people first — the chat needs a real sign-in to build the trigger.',
                      )
                      return
                    }
                    signIn(account)
                    navigate('/chat', { replace: true })
                  }}
                >
                  Open the workflow chat
                </button>
              </form>

              {/*
                What used to be here: Forgot password, Privacy, Help — three
                buttons with no handler between them. A control that does
                nothing is worse on a sign-in screen than anywhere else,
                because the one person most likely to press "Forgot password"
                is the one who cannot get in, and nothing happening is
                indistinguishable from the page being broken.

                Replaced by the fact somebody actually needs at this point: the
                password is not checked, so a wrong one is not why sign-in
                failed.
              */}
              <p className="o-meta mt-6">
                The password is not checked — any text will do. Only the email decides who you
                sign in as.
              </p>
            </div>
          </div>

          {/* ----------------------------------------------------- the people */}
          <div>
            <h2 className="o-h2">Sign in as someone in this record</h2>
            <p className="o-body o-measure mt-2" style={{ color: 'var(--ink-2)' }}>
              This prototype ships with the people around one person&rsquo;s care. Choosing one
              fills in their details; press Sign in to open their account.
            </p>

            {grouped.map((group) => (
              <section key={group.name} className="mt-7">
                <h3 className="o-tile-eyebrow mb-3">{group.name}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {group.people.map((option) => {
                    const on = email === option.email
                    return (
                      <li key={option.personId}>
                        <button
                          type="button"
                          onClick={() => {
                            setEmail(option.email)
                            setPassword('demo-password')
                            setError(null)
                          }}
                          aria-pressed={on}
                          className="o-row h-full !items-start"
                          style={
                            on
                              ? {
                                  background: 'var(--accent-soft)',
                                  boxShadow: 'inset 0 0 0 2px var(--accent)',
                                }
                              : undefined
                          }
                        >
                          <span className="o-row-mark" aria-hidden>
                            {initialOf(option.name)}
                          </span>
                          <span className="o-row-main">
                            <span className="o-row-title block">{option.name}</span>
                            <span className="o-row-meta block">{option.title}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <p className="o-meta o-measure mt-10">
          This is a prototype. Every person here is invented, no real credentials are checked,
          and no real record is stored. Open two browsers side by side to watch a decision move
          between two of them.
        </p>
      </div>
    </div>
  )
}
