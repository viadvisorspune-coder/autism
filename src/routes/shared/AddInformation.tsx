import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardBody, PageHeader } from '../../components/ui'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'
import { useDraft } from '../../lib/draft'
import { actOnRecord } from '../../lib/live'
import { patientsFor } from '../../data/db'
import { dispositions, entryModels } from '../../data/entryForms'
import type { EntryKind, Field } from '../../data/entryForms'

/**
 * Putting something in, rather than taking something out.
 *
 * One screen, eleven roles. What changes between them is the vocabulary and
 * the fields — a psychologist adds a session, an OT adds an observation, an
 * employer updates a case — and none of that is worth eleven implementations.
 * What does not change is the shape of the promise: you write it, it is
 * attributed to you, and what happens to it afterwards is asked rather than
 * assumed.
 *
 * THE ORDER MATTERS. Choose what kind of thing this is, then write it, then
 * decide what ORCA does with it. Asking the last question first — which is
 * what a "share with" toggle at the top of a form does — makes somebody decide
 * about a thing they have not written yet.
 *
 * The draft survives. A clinician interrupted three fields into a session note
 * is the single most likely event on this screen, and losing it teaches people
 * to write their notes somewhere else and paste them in.
 */
export default function AddInformation() {
  const { role, option } = useSession()
  const { say } = useUI()
  const navigate = useNavigate()

  const model = role ? entryModels[role] : undefined
  const [kindId, setKindId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set(['save']))

  const kind = model?.kinds.find((k) => k.id === kindId) ?? null

  // Keyed on the kind, so switching from a session note to an observation does
  // not pour one form's words into another's fields.
  const {
    value: raw,
    setValue: setRaw,
    clear: clearDraft,
    restored,
  } = useDraft(`entry.${role ?? 'anon'}.${kindId ?? 'none'}`)

  const values = useMemo(() => {
    try {
      return JSON.parse(raw || '{}') as Record<string, string>
    } catch {
      return {}
    }
  }, [raw])

  const set = (name: string, value: string) => setRaw(JSON.stringify({ ...values, [name]: value }))

  const patients = patientsFor(role ?? 'psychologist')
  const missing = (kind?.fields ?? []).filter((f) => f.required && !values[f.name]?.trim())

  if (!model) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Add information"
          description="This role does not add to the record — it reads from it."
        />
      </div>
    )
  }

  async function submit() {
    if (!kind) return
    setSaving(true)
    const result = await actOnRecord('add_entry', values.patient ?? '', option?.personId ?? '', {
      kind: kind.id,
      kind_label: kind.label,
      occurred_on: values.date || undefined,
      fields: values,
      propose: chosen.has('propose'),
      follow_up: chosen.has('follow_up'),
    })
    setSaving(false)

    if (!result.ok) {
      say(result.error ?? 'That could not be saved. Nothing has been lost — it is still on this screen.')
      return
    }

    clearDraft()
    say(
      chosen.has('propose')
        ? 'Saved. ORCA is reading it against the rest of the record and will propose anything it changes.'
        : 'Saved to your record.',
    )
    setKindId(null)
    setChosen(new Set(['save']))
  }

  /* ------------------------------------------------------- choosing a kind */
  if (!kind) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={model.title} description={model.intro} />
        <div className="grid gap-3 sm:grid-cols-2">
          {model.kinds.map((k) => (
            <button
              key={k.id}
              onClick={() => setKindId(k.id)}
              className="rounded-[20px] bg-surface px-5 py-4 text-left shadow-sm hover:bg-brand-tint"
            >
              <p className="text-[0.98rem] font-semibold text-ink">{k.label}</p>
              <p className="mt-0.5 text-[0.85rem] leading-relaxed text-ink-2">{k.blurb}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  /* -------------------------------------------------------------- the form */
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={kind.label}
        description={model.intro}
        breadcrumbs={[{ label: model.title, to: '#' }, { label: kind.label }]}
        actions={
          <Button onClick={() => setKindId(null)}>Choose something else</Button>
        }
      />

      {restored && raw && raw !== '{}' ? (
        <p className="mb-4 rounded-[16px] bg-state-wait-tint px-4 py-3 text-[0.85rem] text-state-wait">
          This was still here from last time. Nothing has been saved yet.
        </p>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          {kind.fields.map((field) => (
            <FormField
              key={field.name}
              field={field}
              value={values[field.name] ?? ''}
              onChange={(v) => set(field.name, v)}
              patients={patients}
            />
          ))}
        </CardBody>
      </Card>

      {/* ----------------------------------- what should ORCA do with this? */}
      <div className="mt-6">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em] text-ink">
          What should ORCA do with this?
        </h2>
        <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">
          Asked now rather than at the top, because it is easier to answer about something you
          have written than about something you are about to write.
        </p>

        <div className="mt-3 space-y-2">
          {dispositions.map((d) => {
            const on = chosen.has(d.id)
            return (
              <button
                key={d.id}
                disabled={d.fixed}
                onClick={() =>
                  setChosen((current) => {
                    const next = new Set(current)
                    if (next.has(d.id)) next.delete(d.id)
                    else next.add(d.id)
                    return next
                  })
                }
                className={`block w-full rounded-[18px] px-4 py-3 text-left ${
                  on ? 'bg-brand-tint' : 'bg-surface-2 hover:bg-surface'
                } ${d.fixed ? 'cursor-default' : ''}`}
              >
                <span className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[6px] text-[0.6rem] text-white ${
                      on ? 'bg-brand' : 'bg-line-strong'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span>
                    <span className="block text-[0.9rem] font-medium text-ink">
                      {d.label}
                      {d.fixed ? <span className="ml-2 text-[0.78rem] text-muted">always</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[0.84rem] leading-relaxed text-ink-2">
                      {d.detail}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={saving || missing.length > 0} onClick={submit}>
          {saving ? 'Saving…' : 'Save it'}
        </Button>
        <Button onClick={() => navigate(-1)}>Not now</Button>
        {missing.length ? (
          <span className="text-[0.83rem] text-muted">
            Still needs {missing.map((f) => f.label.toLowerCase()).join(', ')}.
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ fields */

function FormField({
  field,
  value,
  onChange,
  patients,
}: {
  field: Field
  value: string
  onChange: (value: string) => void
  patients: { id: string; name: string }[]
}) {
  const id = `f-${field.name}`
  const shell =
    'mt-1 w-full rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[0.9rem] text-ink outline-none placeholder:text-muted'

  return (
    <div>
      <label htmlFor={id} className="block text-[0.86rem] font-medium text-ink-2">
        {field.label}
        {field.required ? <span className="ml-1 text-state-alert">*</span> : null}
      </label>
      {field.hint ? (
        <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">{field.hint}</p>
      ) : null}

      {field.kind === 'long' ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={shell} />
      ) : field.kind === 'date' ? (
        <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={shell} />
      ) : field.kind === 'select' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={shell}>
          <option value="">Choose one</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.kind === 'patient' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={shell}>
          <option value="">Choose a person</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={shell} />
      )}
    </div>
  )
}

/** Exported so a dashboard can show the same list without importing the page. */
export function kindsFor(role: string | null): EntryKind[] {
  return (role ? entryModels[role as keyof typeof entryModels]?.kinds : undefined) ?? []
}
