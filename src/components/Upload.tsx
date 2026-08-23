/**
 * Putting a file on a record, properly.
 *
 * The old upload was a button that started a four-stage animation about a
 * document nobody had chosen. It never opened a file picker, never learned a
 * filename, and finished by claiming a fictional file had been read. A
 * prototype may stand in for a backend; it should not narrate work it did not
 * do.
 *
 * This one takes a real file — picker or drop — and registers it against this
 * patient's record through the same `add_entry` path every other contribution
 * uses, so an upload lands on the timeline beside the session note and the
 * observation instead of in a separate world of its own.
 *
 * What it deliberately does NOT claim: that the contents were read. Storing
 * the bytes needs a server action that does not exist yet, and a screen that
 * says "extracted" when nothing was extracted is the same lie in a different
 * font.
 */
import { useRef, useState } from 'react'
import { Button, Card, CardBody, CardHead, formatDate } from './ui'
import { actOnRecord, persistMessage } from '../lib/live'
import { useSession } from '../state/session'
import { useUI } from '../state/ui'

const CATEGORIES = ['Clinical', 'Therapy', 'OT', 'Employment', 'University', 'Statutory', 'Personal'] as const

const size = (bytes: number) =>
  bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

interface Landed {
  name: string
  size: number
  category: string
  at: string
}

export function UploadPanel({ patientId, compact = false }: { patientId: string; compact?: boolean }) {
  const { option } = useSession()
  const { say } = useUI()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<string>('Clinical')
  const [note, setNote] = useState('')
  const [over, setOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [landed, setLanded] = useState<Landed[]>([])

  const take = (f: File | undefined | null) => {
    if (!f) return
    setFile(f)
    // Guess once, from the name, and let the person correct it. A guess offered
    // is help; a guess applied silently is a wrong category nobody notices.
    const n = f.name.toLowerCase()
    if (n.includes('report') || n.includes('assessment')) setCategory('Clinical')
    else if (n.includes('hr') || n.includes('employ') || n.includes('work')) setCategory('Employment')
    else if (n.includes('uni') || n.includes('tutor') || n.includes('course')) setCategory('University')
  }

  async function attach() {
    if (!file) return
    setSaving(true)
    const result = await actOnRecord('add_entry', patientId, option?.personId ?? '', {
      kind: 'document',
      kind_label: 'Document added',
      fields: {
        title: file.name,
        category,
        size: size(file.size),
        note,
      },
      propose: false,
      follow_up: false,
    })
    setSaving(false)

    if (!result.ok) {
      say(result.error ?? 'That could not be attached. The file is still selected — nothing was lost.')
      return
    }

    // Same thread as everything else this person says, so "what did I put on
    // this record" has one answer rather than two.
    persistMessage(
      patientId,
      option?.personId ?? '',
      `[Document added]\n${file.name} · ${category}${note ? `\n${note}` : ''}`,
      'person',
    )

    setLanded((l) => [{ name: file.name, size: file.size, category, at: new Date().toISOString() }, ...l])
    setFile(null)
    setNote('')
    if (input.current) input.current.value = ''
    say(`${file.name} is on the record.`)
  }

  return (
    <Card className="mb-6">
      <CardHead
        title="Add a file"
        meta={compact ? undefined : 'It goes onto this record and shows on the timeline'}
      />
      <CardBody>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files?.[0])
          }}
          className={`flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-6 py-8 text-center ${
            over ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface-2'
          }`}
        >
          <input
            ref={input}
            type="file"
            className="sr-only"
            id={`file-${patientId}`}
            onChange={(e) => take(e.target.files?.[0])}
          />
          {file ? (
            <>
              <p className="text-[0.92rem] font-medium text-ink">{file.name}</p>
              <p className="mt-0.5 text-[0.82rem] text-muted">
                {size(file.size)} · {file.type || 'unknown type'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[0.92rem] font-medium text-ink">Drop a file here, or choose one</p>
              <p className="mt-1 text-[0.82rem] text-muted">PDF · Word · image · anything</p>
            </>
          )}
          <label
            htmlFor={`file-${patientId}`}
            className="mt-4 cursor-pointer rounded-2xl bg-surface px-4 py-2 text-[0.85rem] font-medium text-ink shadow-sm hover:bg-canvas"
          >
            {file ? 'Choose a different file' : 'Choose a file'}
          </label>
        </div>

        {file ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 block text-[0.8rem] text-ink-2">What kind of document</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-2xl bg-surface-2 px-3 py-2 text-[0.86rem] text-ink"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.8rem] text-ink-2">Why it matters (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="One line, so whoever reads it later knows why it is here"
                className="w-full rounded-2xl bg-surface-2 px-3 py-2 text-[0.86rem] text-ink"
              />
            </label>
          </div>
        ) : null}

        {file ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={attach} disabled={saving}>
              {saving ? 'Adding…' : 'Add to record'}
            </Button>
            <Button
              onClick={() => {
                setFile(null)
                if (input.current) input.current.value = ''
              }}
            >
              Cancel
            </Button>
            <p className="text-[0.79rem] leading-relaxed text-muted">
              The file is registered against this record. Its contents are not read.
            </p>
          </div>
        ) : null}

        {landed.length ? (
          <ul className="mt-5 space-y-2 border-t border-line pt-4">
            {landed.map((l) => (
              <li key={l.at} className="text-[0.85rem] text-ink">
                {l.name}
                <span className="block text-[0.79rem] text-muted">
                  {l.category} · {size(l.size)} · added {formatDate(l.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  )
}
