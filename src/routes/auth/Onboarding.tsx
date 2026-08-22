import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardBody } from '../../components/ui'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'
import { useMaturity } from '../../state/maturity'

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
  const { option, personName, role, completeSetup } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [first, setFirst] = useState('')

  const home = option?.home ?? '/patient'
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
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        {/* Where you are, and how much is left. Six unlabelled dots would only
            say "some". */}
        <div className="mb-6 flex items-center gap-2" aria-hidden>
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`}
            />
          ))}
        </div>
        <p className="mb-6 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>

        <Card>
          <CardBody className="px-6 py-6 sm:px-8 sm:py-8">
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
          </CardBody>
        </Card>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step > 0 ? <Button onClick={() => setStep((s) => s - 1)}>Back</Button> : null}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={() => finish(first)}>
              {first.trim() && isPatient ? 'Send and open ORCA' : 'Go to my home page'}
            </Button>
          )}
          <button
            onClick={() => finish()}
            className="ml-auto text-[0.84rem] text-muted underline-offset-2 hover:text-ink-2 hover:underline"
          >
            Skip setup
          </button>
        </div>

        <p className="mt-4 text-[0.79rem] leading-relaxed text-muted">
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
      <h1 className="text-[1.55rem] font-semibold leading-tight tracking-[-0.015em] text-ink">
        Hello, {name.split(' ')[0]}.
      </h1>
      <p className="mt-3 text-[0.98rem] leading-relaxed text-ink-2">
        {isPatient
          ? 'A diagnosis usually arrives as a document and then nothing. What happens next tends to be your job: remembering what helped, explaining yourself again to each new person, and keeping track of what you asked for and never heard back about.'
          : 'Post-diagnostic care falls apart in the gaps between people — the strategy nobody recorded the outcome of, the request that stalled with an employer, the context that never reached the next clinician.'}
      </p>
      <p className="mt-3 text-[0.98rem] leading-relaxed text-ink-2">
        {isPatient
          ? 'ORCA is where that gets held instead. It is your record, and it does not act on its own.'
          : 'ORCA holds the thread across those gaps, and stops for a person at every point where a decision belongs to one.'}
      </p>
      <p className="mt-4 text-[0.88rem] leading-relaxed text-muted">
        Six short screens. You can leave at any point.
      </p>
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
      <h1 className="text-[1.4rem] font-semibold tracking-[-0.015em] text-ink">How ORCA works</h1>
      <ul className="mt-5 space-y-5">
        {points.map(([title, detail]) => (
          <li key={title}>
            <p className="text-[1rem] font-medium text-ink">{title}</p>
            <p className="mt-1 text-[0.92rem] leading-relaxed text-ink-2">{detail}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function Privacy({ isPatient }: { isPatient: boolean }) {
  return (
    <>
      <h1 className="text-[1.4rem] font-semibold tracking-[-0.015em] text-ink">
        {isPatient ? 'Who can see what' : 'What you are allowed to see'}
      </h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">
        {isPatient
          ? 'Nobody is given your whole record. Each person you connect to gets a named part of it, for a stated reason, until a date you set.'
          : 'Access is per patient, per person, for a purpose, with a review date. You will be shown what you may not see as plainly as what you may — a blank space with no explanation is how people end up assuming the worst.'}
      </p>

      <ul className="mt-5 space-y-3">
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
          <li key={line} className="flex gap-3 text-[0.92rem] leading-relaxed text-ink-2">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {line}
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
      <h1 className="text-[1.4rem] font-semibold tracking-[-0.015em] text-ink">
        Set it up the way you need it
      </h1>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-2">
        These take effect as you choose them, so you can see what you are picking. All of them are
        in Display settings afterwards.
      </p>

      <div className="mt-6 space-y-6">
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
      <legend className="text-[0.95rem] font-medium text-ink">{label}</legend>
      {hint ? <p className="mt-1 text-[0.84rem] leading-relaxed text-muted">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-2xl  px-3.5 py-2 text-[0.86rem] ${
              value === option.value
                ? 'border-brand bg-brand-tint font-medium text-brand-ink'
                : 'border-line text-ink-2 hover:text-ink'
            }`}
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
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-[1.05rem] font-bold text-white"
        >
          O
        </span>
        <h1 className="text-[1.4rem] font-semibold tracking-[-0.015em] text-ink">
          {isPatient ? 'Talking to ORCA' : 'The ORCA copilot'}
        </h1>
      </div>

      <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-2">
        {isPatient
          ? 'There is a button in the corner of every screen. Press it and write what is going on — badly, in fragments, at two in the morning. You do not have to work out what kind of request it is first, or which form it belongs in. That is the part ORCA is for.'
          : 'A rail beside the record rather than a separate page, so an answer arrives next to the thing it is about. Ask about a patient and it answers from their record, naming what it used — and telling you what it could not see as readily as what it could.'}
      </p>

      <div className="mt-5 rounded-[20px]  border-line bg-canvas px-5 py-4">
        <p className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">
          What it will not do
        </p>
        <p className="mt-1.5 text-[0.9rem] leading-relaxed text-ink-2">
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
      <h1 className="text-[1.4rem] font-semibold tracking-[-0.015em] text-ink">
        {isPatient ? 'What is going on at the moment?' : 'Anything you want to start with?'}
      </h1>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-2">
        {isPatient
          ? 'However it comes out. It does not need to be a complete thought, and nothing you write here is saved as a fact about you — it is a message, not a form.'
          : 'Or leave it blank and go straight to your caseload.'}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSend()
        }}
        className="mt-4"
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
          className="w-full rounded-2xl  bg-surface-2 px-4 py-3 text-[0.94rem] leading-relaxed outline-none placeholder:text-muted"
        />
      </form>

      <p className="mt-3 text-[0.83rem] leading-relaxed text-muted">
        You can also leave this empty. The button is on every screen when you want it.
      </p>
    </>
  )
}
