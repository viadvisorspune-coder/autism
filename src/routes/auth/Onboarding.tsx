import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'
import { useMaturity } from '../../state/maturity'
import { greetingName, homeFor, paletteFor } from '../../orca/system'

/**
 * The first six minutes.
 *
 * A first-run flow is a bet: you spend someone's attention now to save it
 * later. The bet is usually lost, because most onboarding explains the
 * software rather than the arrangement, and nobody needs a tour of a
 * navigation bar.
 *
 * What is worth six screens here is the arrangement itself, and specifically
 * the two promises the rest of the interface keeps making implicitly — that
 * nothing leaves without an explicit decision, and that everything ORCA says
 * can be traced to something in the record. A person who learns those two
 * things on day one reads every later screen correctly. A person who does not
 * will read "ORCA suggests" as an instruction.
 *
 * Design rules it holds itself to:
 *   · Every screen is skippable, and skipping is a button, not a link hidden
 *     in a corner. Someone signing in at eleven at night to check one thing
 *     should be able to get to it.
 *   · The preferences screen sets real preferences, applied as they are
 *     chosen. Nothing here is a picture of a setting.
 *   · The last screen is a text box, not a "You're all set!" card. The point
 *     of the product is the first sentence somebody writes into it, and the
 *     shortest path to that is to hand them the box.
 */

const STEPS = ['Welcome', 'How it works', 'Privacy', 'Personalise', 'ORCA', 'First message'] as const

export default function Onboarding() {
  const { personName, role, completeSetup } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [first, setFirst] = useState('')

  /**
   * The design system, on before the first screen rather than after it.
   *
   * These six screens sit outside the ORCA shell, so nothing was setting
   * `data-ia` and every rule in the sheet is scoped to it. The result was the
   * one flow that is supposed to explain the product rendering in the older
   * interface's palette -- a person met a lavender product and then signed in
   * to a different-looking one. Same attributes the shell sets, set here for
   * the same reason, and taken off on the way out.
   */
  useEffect(() => {
    const root = document.documentElement
    root.dataset.ia = 'orca'
    root.dataset.look = paletteFor(role)
    return () => {
      delete root.dataset.ia
      delete root.dataset.look
    }
  }, [role])

  // Where finishing lands, from the same function the rest of the product
  // uses. `option.home` is a different fact -- a base path for the older
  // interface -- and reading it here sent three roles past their own first
  // screen.
  const home = homeFor(role)
  const isPatient = role === 'patient'

  function finish(message?: string) {
    completeSetup()
    if (message?.trim() && isPatient) {
      navigate('/patient/guide', { state: { message: message.trim() } })
      return
    }
    navigate(home)
  }

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto w-full max-w-2xl">
        {/* Where you are, and how much is left. Six unlabelled dots would only
            say "some". */}
        <div className="mb-6 flex items-center gap-2" aria-hidden>
          {STEPS.map((label, i) => (
            <span
              key={label}
              className="h-1.5 flex-1 rounded-full"
              style={{ background: i <= step ? 'var(--accent)' : 'var(--surface-2)' }}
            />
          ))}
        </div>
        <p className="o-label mb-6 uppercase" style={{ color: 'var(--ink-3)' }}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>

        <div className="o-card">
          <div className="o-card-body">
            {step === 0 ? <Welcome name={personName} isPatient={isPatient} /> : null}
            {step === 1 ? <HowItWorks isPatient={isPatient} /> : null}
            {step === 2 ? <Privacy isPatient={isPatient} /> : null}
            {step === 3 ? <Personalise /> : null}
            {step === 4 ? <MeetOrca isPatient={isPatient} /> : null}
            {step === 5 ? (
              <FirstMessage
                isPatient={isPatient}
                value={first}
                onChange={setFirst}
                onSend={() => finish(first)}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <button type="button" className="o-btn" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="o-btn o-btn-primary" onClick={() => setStep((s) => s + 1)}>
              Continue
            </button>
          ) : (
            <button type="button" className="o-btn o-btn-primary" onClick={() => finish(first)}>
              {first.trim() && isPatient ? 'Send and open ORCA' : 'Go to my home page'}
            </button>
          )}
          <button type="button" onClick={() => finish()} className="o-meta ml-auto underline">
            Skip setup
          </button>
        </div>

        <p className="o-meta o-measure mt-4">
          Nothing here is permanent. Everything on these screens can be changed later from Display
          settings, and skipping changes nothing about what ORCA is allowed to do.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ screens */

function Welcome({ name, isPatient }: { name: string; isPatient: boolean }) {
  return (
    <>
      <h1 className="o-h2">Hello, {greetingName(name)}.</h1>
      <p className="o-body o-measure mt-4">
        {isPatient
          ? 'A diagnosis usually arrives as a document and then nothing. What happens next tends to be your job: remembering what helped, explaining yourself again to each new person, and keeping track of what you asked for and never heard back about.'
          : 'Post-diagnostic care falls apart in the gaps between people — the strategy nobody recorded the outcome of, the request that stalled with an employer, the context that never reached the next clinician.'}
      </p>
      <p className="o-body o-measure mt-4">
        {isPatient
          ? 'ORCA is where that gets held instead. It is your record, and it does not act on its own.'
          : 'ORCA holds the thread across those gaps, and stops for a person at every point where a decision belongs to one.'}
      </p>
      <p className="o-meta o-measure mt-6">Six short screens. You can leave at any point.</p>
    </>
  )
}

function HowItWorks({ isPatient }: { isPatient: boolean }) {
  const points = isPatient
    ? [
        ['It remembers, so you do not have to repeat yourself', 'What you have told it, what has been tried, what happened. When you see a new clinician, they arrive already knowing the history — if you have said they can.'],
        ['It stops before it does anything that matters', 'Sharing, requesting, changing something in your record. Each of those waits for you. Nothing is sent because it seemed sensible.'],
        ['It shows its working', 'Every suggestion names what it came from and you can open each one. Where it is unsure, it says so instead of rounding up.'],
      ]
    : [
        ['It carries the longitudinal record', 'Strategies, outcomes, check-ins and context across every professional connected to the patient — with that patient’s consent, per person, recorded.'],
        ['It stops at every point of authority', 'Clinical judgement, disclosure, anything that changes the record. ORCA prepares; a person decides. Refusals are logged as carefully as approvals.'],
        ['Every claim is sourced', 'Answers cite the records they drew on, and separate what was observed from what was inferred. An unsourced confident sentence is a liability, not a feature.'],
      ]

  return (
    <>
      <h1 className="o-h2">How ORCA works</h1>
      <ul className="mt-6 space-y-6">
        {points.map(([title, detail]) => (
          <li key={title}>
            <p className="o-h3">{title}</p>
            <p className="o-body o-measure mt-2">{detail}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function Privacy({ isPatient }: { isPatient: boolean }) {
  return (
    <>
      <h1 className="o-h2">{isPatient ? 'Who can see what' : 'What you are allowed to see'}</h1>
      <p className="o-body o-measure mt-4">
        {isPatient
          ? 'Nobody is given your whole record. Each person you connect to gets a named part of it, for a stated reason, until a date you set.'
          : 'Access is per patient, per person, for a purpose, with a review date. You will be shown what you may not see as plainly as what you may — a blank space with no explanation is how people end up assuming the worst.'}
      </p>

      <ul className="mt-6 space-y-4">
        {(isPatient
          ? [
              'You approve each connection, and you can narrow or end one at any time.',
              'Every time anyone opens anything of yours, it is written down — who, when, and why.',
              'Requests to employers or universities carry what you authorised and nothing else. Your diagnosis is not included unless you put it there.',
              'Ending access does not delete your history of it. You can always see what was seen.',
            ]
          : [
              'Consent is checked at read time, not assumed from your job title.',
              'A lapsed review date closes access on its own rather than waiting for somebody to notice.',
              'Denials are recorded, with the reason, and the patient can read that log.',
              'Anything leaving the clinic stops for the patient first, however routine it looks.',
            ]
        ).map((line) => (
          <li key={line} className="o-body o-measure flex gap-3">
            <span
              aria-hidden
              className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: 'var(--accent)' }}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Real settings, applied as they are pressed.
 *
 * A preferences screen during onboarding is often a decoy — it collects
 * answers into a form that gets submitted later, so nothing visibly happens
 * and the person cannot tell what they chose. These take effect immediately,
 * on this screen, which is also the only honest way to choose between "calm"
 * and "everything": you have to be able to see the difference.
 */
function Personalise() {
  const { density, setDensity, textSize, setTextSize, reducedMotion, setReducedMotion } = useUI()
  const { verbosity, setVerbosity } = useMaturity()

  return (
    <>
      <h1 className="o-h2">Set it up the way you need it</h1>
      <p className="o-body o-measure mt-4">
        These take effect as you choose them, so you can see what you are picking. All of them are
        in Display settings afterwards.
      </p>

      <div className="mt-8 space-y-8">
        <Choice
          label="How much on screen at once"
          hint="Calm keeps supporting detail folded away behind a named control. Nothing is hidden without saying so."
          options={[
            { value: 'calm', label: 'One thing at a time' },
            { value: 'full', label: 'Show everything' },
          ]}
          value={density}
          onChange={(v) => setDensity(v as 'calm' | 'full')}
        />

        <Choice
          label="Text size"
          options={[
            { value: 'default', label: 'Default' },
            { value: 'large', label: 'Large' },
            { value: 'xlarge', label: 'Larger' },
          ]}
          value={textSize}
          onChange={(v) => setTextSize(v as 'default' | 'large' | 'xlarge')}
        />

        <Choice
          label="How much ORCA explains"
          hint="Detailed spells out its reasoning. Concise gives the answer and keeps the reasoning one press away."
          options={[
            { value: 'detailed', label: 'Explain as it goes' },
            { value: 'concise', label: 'Keep it short' },
          ]}
          value={verbosity}
          onChange={(v) => setVerbosity(v as 'detailed' | 'concise')}
        />

        <Choice
          label="Movement"
          options={[
            { value: 'default', label: 'Normal' },
            { value: 'reduced', label: 'Reduce movement' },
          ]}
          value={reducedMotion ? 'reduced' : 'default'}
          onChange={(v) => setReducedMotion(v === 'reduced')}
        />
      </div>
    </>
  )
}

function Choice({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint?: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <fieldset>
      <legend className="o-h3">{label}</legend>
      {hint ? <p className="o-meta o-measure mt-2">{hint}</p> : null}
      {/*
        Chips, because these are choices among peers.

        They were borrowing the primary button for their selected state, which
        on a screen with four of them put four filled rectangles beside the one
        control that actually advances the flow.
      */}
      <div className="o-chips mt-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className="o-chip"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function MeetOrca({ isPatient }: { isPatient: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span aria-hidden className="o-avatar">
          O
        </span>
        <h1 className="o-h2">{isPatient ? 'Talking to ORCA' : 'The ORCA copilot'}</h1>
      </div>

      <p className="o-body o-measure mt-5">
        {isPatient
          ? 'There is a button in the corner of every screen. Press it and write what is going on — badly, in fragments, at two in the morning. You do not have to work out what kind of request it is first, or which form it belongs in. That is the part ORCA is for.'
          : 'A rail beside the record rather than a separate page, so an answer arrives next to the thing it is about. Ask about a patient and it answers from their record, naming what it used — and telling you what it could not see as readily as what it could.'}
      </p>

      <div className="o-panel mt-6 p-5">
        <p className="o-label uppercase" style={{ color: 'var(--ink-3)' }}>
          What it will not do
        </p>
        <p className="o-body o-measure mt-2">
          {isPatient
            ? 'It will not diagnose you, decide anything on your behalf, or send anything to anyone without asking first. If it thinks a person should answer instead of it, it says so and stops.'
            : 'It will not make a clinical judgement, write to the record unprompted, or disclose anything outside the clinic. Where authority is yours it stops and says why, rather than proceeding and flagging it afterwards.'}
        </p>
      </div>
    </>
  )
}

function FirstMessage({
  isPatient,
  value,
  onChange,
  onSend,
}: {
  isPatient: boolean
  value: string
  onChange: (v: string) => void
  onSend: () => void
}) {
  return (
    <>
      <h1 className="o-h2">
        {isPatient ? 'What is going on at the moment?' : 'Anything you want to start with?'}
      </h1>
      <p className="o-body o-measure mt-4">
        {isPatient
          ? 'However it comes out. It does not need to be a complete thought, and nothing you write here is saved as a fact about you — it is a message, not a form.'
          : 'Or leave it blank and go straight to your caseload.'}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSend()
        }}
        className="mt-6"
      >
        <label htmlFor="first-message" className="sr-only">
          Your first message to ORCA
        </label>
        <textarea
          id="first-message"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isPatient
              ? 'For example: the open-plan office is getting harder and I do not know what to ask for'
              : 'For example: what changed across my caseload this week?'
          }
          className="o-input"
        />
      </form>

      <p className="o-meta o-measure mt-4">
        You can also leave this empty. The button is on every screen when you want it.
      </p>
    </>
  )
}
