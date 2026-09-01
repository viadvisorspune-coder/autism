/**
 * Sharing — Ananya only, and the only screen where anyone changes what anyone
 * else can see.
 *
 * One card per person. **Can see** and **cannot see** are equally prominent,
 * at the same size, in the same weight — knowing what is protected matters as
 * much as knowing what is shared, and a design that lists the first in body
 * text and the second in a footnote has quietly decided which of those the
 * person cares about.
 *
 * Stopping is a two-step, per the guidance on confirming important actions:
 * the second step lists exactly what changes, who is told, and when it takes
 * effect. There is no undo prompt afterwards, because the change is reversible
 * from this same screen and saying so is better than a five-second window.
 */
import { useMemo, useState } from 'react'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { connections, people } from '../data/db'
import type { Connection, Role } from '../data/types'
import { useAsks } from './asks'
import { Card, Loading, Nothing, PageTitle, longDate } from './parts'
import { ActionButton, useAction } from './action'
import { type Domain, domainName, outcomeFor } from './system'

const DOMAINS: Domain[] = ['work', 'education', 'support', 'personal', 'health', 'clinical']

/** What this person's role lets them ask about, and what it does not. */
function split(role: Role): { can: string[]; cannot: string[]; needsConsent: string[] } {
  const can: string[] = []
  const cannot: string[] = []
  const needsConsent: string[] = []
  for (const d of DOMAINS) {
    const outcome = outcomeFor(role, d, false)
    if (outcome === 'allow') can.push(domainName[d])
    else if (outcome === 'gate') needsConsent.push(domainName[d])
    else cannot.push(domainName[d])
  }
  return { can, cannot, needsConsent }
}

export default function Sharing() {
  const { patientId } = useSession()
  const { status } = useRecordStatus()
  // Held in the provider rather than here, because stopping is written to the
  // record and read back from it — the person who was stopped has to learn
  // about it, and a decision that never leaves this component cannot tell them.
  const { stops, setSharing } = useAsks()
  const [confirming, setConfirming] = useState<Connection | null>(null)
  /**
   * The last change, and whether the record took it.
   *
   * Kept on the page rather than on the button that made it. The confirmation
   * screen closes the moment somebody presses Stop sharing, so a state living
   * on that button goes with it; and a change to who can read a medical record
   * is exactly the kind of thing the brief means by never announcing something
   * important with a notice that removes itself. This one stays until it is
   * dismissed or the person leaves.
   */
  const [lastSave, setLastSave] = useState<{
    personId: string
    name: string
    ok: boolean
    sharing: boolean
  } | null>(null)

  const held = useMemo(
    () =>
      connections
        .filter((c) => c.patientId === patientId)
        .filter((c) => c.consentStatus !== 'Revoked'),
    [patientId, status],
  )

  /**
   * Records the outcome, whichever way it goes.
   *
   * `setSharing` updates the screen optimistically and reconciles from the
   * record a few seconds later, so a write that failed used to undo itself in
   * front of somebody who had already been shown that it worked. Now the
   * failure is stated, in the same place the success is.
   */
  async function save(personId: string, sharing: boolean) {
    const name = people.find((p) => p.id === personId)?.name ?? 'them'
    setLastSave(null)
    const ok = await setSharing(personId, sharing)
    setLastSave({ personId, name, ok, sharing })
    return ok
  }

  if (confirming) {
    return (
      <Confirm
        connection={confirming}
        onCancel={() => setConfirming(null)}
        // Saved first, then closed. Closing on the press and saving behind the
        // person's back is how a failure ends up with nowhere to be shown.
        onStop={async () => {
          const ok = await save(confirming.personId, false)
          setConfirming(null)
          return ok
        }}
      />
    )
  }

  return (
    <>
      <PageTitle>Who can see your record</PageTitle>

      {/*
        The most consequential empty state in the product.

        "Nobody can see any part of your record" is a sentence somebody will
        believe and act on. Shown while the record is still being read, it is a
        false reassurance about disclosure — the one thing this screen exists to
        be exact about.
      */}
      {status === 'loading' ? <Loading what="who can see your record" /> : null}

      {/*
        The outcome of the last change, said where it can be read.

        Not a toast. This is a change to who can read a medical record, and the
        person who made it is owed a statement of what the record now says
        rather than a rectangle that leaves after four seconds. It goes when
        they dismiss it or when they leave the screen.
      */}
      {lastSave ? (
        <div role="status" className="o-body o-measure mb-10 o-panel p-5">
          {lastSave.ok ? (
            <>
              <p className="font-semibold">
                {lastSave.sharing ? 'Access updated' : 'Sharing stopped'}
              </p>
              <p className="mt-3">
                {lastSave.sharing
                  ? `${lastSave.name} can see their part of your record again. This is what your record now says.`
                  : `${lastSave.name} can no longer see any part of your record. This is what your record now says.`}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">We couldn&rsquo;t save this change.</p>
              <p className="mt-3">
                Your record is unchanged, so {lastSave.name}{' '}
                {lastSave.sharing
                  ? 'still cannot see it.'
                  : 'can still see their part of it.'}{' '}
                Nothing is being retried on its own. The screen will show what the record actually
                says within a few seconds.
              </p>
            </>
          )}
          {/*
            Undo, and it is a real one.

            Stopping sharing and starting it again are the same control in two
            directions, so putting it back is exactly one write — not a special
            reversal path that might not work. Offered only on a change that
            landed: undoing a change the record never took would write the state
            it is already in and report success for something that did nothing.

            The word is "Undo" rather than "Start sharing again" because that is
            what it is doing here — taking back something pressed a moment ago —
            and the audit trail records both acts either way, which the line
            below says out loud rather than letting the button imply the first
            one never happened.
          */}
          <div className="mt-5 flex flex-wrap gap-4">
            {lastSave.ok ? (
              <Resume
                label="Undo"
                small
                run={() => save(lastSave.personId, !lastSave.sharing)}
              />
            ) : null}
            <button type="button" className="o-btn o-btn-small" onClick={() => setLastSave(null)}>
              Got it
            </button>
          </div>
          {lastSave.ok ? (
            <p className="o-meta o-measure mt-4">
              Undoing puts it back. Both changes stay in the record&rsquo;s history, because that
              history is yours and it is not rewritten by changing your mind.
            </p>
          ) : null}
        </div>
      ) : null}

      {status !== 'loading' && !held.length ? (
        <Nothing>
          Nobody outside your own account can see any part of your record. When you share
          something with someone, they appear here with exactly what they can and cannot see.
        </Nothing>
      ) : null}

      <ul className="space-y-10">
        {held.map((c) => {
          const person = people.find((p) => p.id === c.personId)
          if (!person) return null
          const { can, cannot, needsConsent } = split(person.role)
          const off = stops.includes(c.personId)

          return (
            <li key={c.id}>
              <Card tone={off ? 'past' : 'shared'}>
                <div className="o-card-body">
                  <h2 className="o-h3">{person.name}</h2>
                  <p className="o-meta mt-1">
                    {[person.title, person.organisation].filter(Boolean).join(', ')}
                  </p>

                  {off ? (
                    <>
                      <hr className="o-rule my-8" />
                      <h3 className="o-h3 mb-3">You have stopped sharing with them</h3>
                      <p className="o-body o-measure">
                        They can see nothing in your record. Anything they were told before still
                        exists in their own notes — stopping here does not reach into those.
                      </p>
                      <div className="mt-6">
                        <Resume
                          label={`Share with ${firstName(person.name)} again`}
                          run={() => save(c.personId, true)}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <hr className="o-rule my-8" />
                      <h3 className="o-h3 mb-3">Can see</h3>
                      <p className="o-body o-measure">{sentence(can)}</p>

                      {needsConsent.length ? (
                        <>
                          <h3 className="o-h3 mb-3 mt-8">Can ask you about</h3>
                          <p className="o-body o-measure">
                            {sentence(needsConsent)}. They cannot see this now. If they ask, it
                            comes to you as a decision.
                          </p>
                        </>
                      ) : null}

                      <h3 className="o-h3 mb-3 mt-8">Cannot see</h3>
                      <p className="o-body o-measure">
                        {cannot.length
                          ? sentence(cannot)
                          : needsConsent.length
                            ? 'Nothing beyond what is listed above as needing your permission.'
                            : 'Nothing is held back from them.'}
                      </p>

                      <hr className="o-rule my-8" />
                      <p className="o-meta">Since {longDate(c.consentGiven)}</p>
                      <p className="o-meta mt-1">For {c.purpose.toLowerCase()}</p>

                      <button
                        type="button"
                        className="o-btn mt-6"
                        onClick={() => setConfirming(c)}
                      >
                        Stop sharing with {firstName(person.name)}
                      </button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/**
 * Starting again, reported the same way stopping is.
 *
 * A component rather than a button in the map, because it needs its own state
 * and hooks cannot live inside one. The banner above carries what the record
 * now says; this carries what the control is doing while it says it.
 */
function Resume({
  label,
  small,
  run,
}: {
  label: string
  small?: boolean
  run: () => Promise<boolean>
}) {
  const action = useAction(run)
  return (
    <ActionButton
      action={action}
      idle={label}
      working="Updating access…"
      done="Access updated"
      failed="Not updated"
      small={small}
    />
  )
}

/**
 * What to call somebody on a button.
 *
 * "Stop sharing with Dr" is what naively taking the first word gives you, and
 * it is both wrong and slightly absurd on the most consequential control this
 * person has. An honorific is not a name.
 */
const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'prof', 'professor', 'miss'])

function firstName(full: string): string {
  const parts = full.split(/\s+/).filter(Boolean)
  const first = parts.find((w) => !HONORIFICS.has(w.replace(/\.$/, '').toLowerCase()))
  // A title with no name behind it keeps the title, which is better than an
  // empty button.
  return first ?? parts[0] ?? full
}

/** A list read as a sentence, because a bulleted list of two items is a list. */
function sentence(items: string[]): string {
  if (!items.length) return 'Nothing'
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`.toLowerCase().replace(/^./, (m) => m.toUpperCase())
}

/**
 * The confirmation, which is a screen rather than a dialog.
 *
 * A dialog over the thing you are changing invites you to decide without
 * reading, and this is the highest-consequence control the person has. Three
 * things it has to state, and does: what changes, who is told, and when.
 */
function Confirm({
  connection,
  onCancel,
  onStop,
}: {
  connection: Connection
  onCancel: () => void
  onStop: () => Promise<boolean>
}) {
  const person = people.find((p) => p.id === connection.personId)
  const name = person?.name ?? 'this person'
  const { can } = person ? split(person.role) : { can: [] as string[] }
  const stopping = useAction(onStop)

  return (
    <>
      <button type="button" className="o-body mb-8 block font-semibold underline" onClick={onCancel}>
        ← Back to Sharing
      </button>
      <PageTitle>Stop sharing with {name}?</PageTitle>

      <Card tone="decision">
        <div className="o-card-body">
          <h2 className="o-h3 mb-3">What changes</h2>
          <p className="o-body o-measure">
            {name} will no longer be able to see {sentence(can).toLowerCase()}, or to ask ORCA
            anything about your record. Questions they ask after this are refused.
          </p>

          <h2 className="o-h3 mb-3 mt-8">What does not change</h2>
          <p className="o-body o-measure">
            Anything already shared with them stays in their own notes. Your record keeps the
            history of what was shared and when, because that history is yours.
          </p>

          <h2 className="o-h3 mb-3 mt-8">Who is told</h2>
          <p className="o-body o-measure">
            {name} is told that sharing has stopped. They are not told why, and you are not asked
            for a reason.
          </p>

          <h2 className="o-h3 mb-3 mt-8">When</h2>
          <p className="o-body o-measure">
            Immediately. You can start sharing again from the same screen whenever you want to.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            {/*
              The confirmation is the screen this button is on. Everything
              above it is what changes, what does not, who is told and when —
              read before the press, never after it.
            */}
            <ActionButton
              action={stopping}
              idle="Stop sharing"
              working="Updating access…"
              done="Sharing stopped"
              failed="Not updated"
              primary
              className="flex-1"
            />
            <button
              type="button"
              className="o-btn flex-1"
              disabled={stopping.busy}
              onClick={onCancel}
            >
              Keep sharing
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}
