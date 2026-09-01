/**
 * Adjust — five controls, on a screen of their own.
 *
 * These were two controls buried in a dropdown behind the person's own name,
 * which is where settings go when nobody expects them to be used. They are
 * expected to be used. Somebody who finds saturated colour painful, or who
 * needs 24px type to read a sentence about their own diagnosis, is not an edge
 * case here — they are the person this product is for, and the adjustment they
 * need should be a destination in the navigation rather than a thing to
 * discover.
 *
 * FIVE, AND EACH IS ONE AXIS. Size, colour, movement, how much at once, and
 * whether this device keeps what you type. They are deliberately not folded
 * into a "comfort mode" with three settings: somebody who wants everything
 * visible may still find saturated colour difficult, and a combined control
 * forces a trade nobody asked for.
 *
 * EVERY CONTROL SAYS WHAT IT DOES AND WHAT IT DOES NOT DO. None of them changes
 * the record, and none of them changes what anybody else can see — which is the
 * first question somebody asks of a setting on a screen that is otherwise all
 * about disclosure, so it is answered under every one of them rather than once
 * at the bottom.
 */
import { useSession } from '../state/session'
import { useUI } from '../state/ui'
import { PageTitle, SectionHead } from './parts'
import { clearQuestion, keepingDrafts, setKeepingDrafts } from './question'
import { useState } from 'react'

/**
 * One setting, expressed as the choice it is.
 *
 * A row of buttons rather than a switch or a select. A switch has a state you
 * have to infer from its position and a label that only describes one side of
 * it; these say both options in words and mark the one that is on with
 * `aria-pressed`, so the current setting is readable rather than deduced.
 */
function Choice({
  on,
  onSelect,
  children,
}: {
  on: boolean
  onSelect: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onSelect}
      className={`o-btn o-btn-small ${on ? 'o-btn-primary' : ''}`}
    >
      {children}
    </button>
  )
}

function Setting({
  title,
  says,
  children,
}: {
  title: string
  says: string
  children: React.ReactNode
}) {
  return (
    <section className="o-section">
      <SectionHead>{title}</SectionHead>
      <p className="o-body o-measure mb-5">{says}</p>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  )
}

export default function Adjust() {
  const { option, organisation } = useSession()
  const { palette, setPalette, textSize, setTextSize, reducedMotion, setReducedMotion, density, setDensity } =
    useUI()
  const personId = option?.personId ?? ''
  const [keeping, setKeeping] = useState(() => keepingDrafts())

  return (
    <>
      <PageTitle sub="Everything here is remembered on this device only. None of it changes your record, and none of it changes what anybody else can see.">
        Adjust
      </PageTitle>

      <div className="o-panel p-5">
        <p className="o-h3">{option?.name}</p>
        <p className="o-meta mt-1">
          {option?.title}
          {organisation ? ` · ${organisation}` : ''}
        </p>
      </div>

      <Setting
        title="Text size"
        says="How large the writing is, everywhere. Larger sizes make lines shorter rather than making you scroll sideways."
      >
        <Choice on={textSize === 'default'} onSelect={() => setTextSize('default')}>
          Standard
        </Choice>
        <Choice on={textSize === 'large'} onSelect={() => setTextSize('large')}>
          Large
        </Choice>
        <Choice on={textSize === 'xlarge'} onSelect={() => setTextSize('xlarge')}>
          Larger
        </Choice>
      </Setting>

      <Setting
        title="Colour"
        says="How strong the colours are. Softer keeps every colour meaning exactly what it meant — it only lowers how loudly it says it. Text stays as dark as it is now either way, because easier on the eye should never mean harder to read."
      >
        <Choice on={palette === 'standard'} onSelect={() => setPalette('standard')}>
          Standard
        </Choice>
        <Choice on={palette === 'low'} onSelect={() => setPalette('low')}>
          Softer
        </Choice>
      </Setting>

      <Setting
        title="Movement"
        says="Whether anything on screen moves when it changes. With movement off, everything still tells you what happened — it says so in words instead."
      >
        <Choice on={!reducedMotion} onSelect={() => setReducedMotion(false)}>
          Standard
        </Choice>
        <Choice on={reducedMotion} onSelect={() => setReducedMotion(true)}>
          Reduced
        </Choice>
      </Setting>

      <Setting
        title="How much at once"
        says="One thing at a time, or everything open. Nothing is removed either way: a section that is closed says what is inside it and opens on one press."
      >
        <Choice on={density === 'calm'} onSelect={() => setDensity('calm')}>
          One thing at a time
        </Choice>
        <Choice on={density === 'full'} onSelect={() => setDensity('full')}>
          Everything open
        </Choice>
      </Setting>

      <Setting
        title="Keep what I type on this device"
        says="A half-written question or document normally waits here so an interruption does not cost you the sentence. Turn it off on a device you share, and nothing you type is kept once you leave the screen."
      >
        <Choice
          on={keeping}
          onSelect={() => {
            setKeepingDrafts(true)
            setKeeping(true)
          }}
        >
          Keep it
        </Choice>
        <Choice
          on={!keeping}
          onSelect={() => {
            setKeepingDrafts(false)
            // Turning this off has to take effect on what is already stored,
            // not only on what is typed next. A setting that promises nothing
            // is kept while a question from ten minutes ago is still sitting
            // there has told the person something false about their own device.
            clearQuestion(personId)
            setKeeping(false)
          }}
        >
          Do not keep it
        </Choice>
      </Setting>
    </>
  )
}
