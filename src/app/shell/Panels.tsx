import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, formatDate, formatDateTime } from '../../components/ui'
import { useUI } from '../../state/ui'
import { useMaturity } from '../../state/maturity'
import { useSession } from '../../state/session'
import {
  documents,
  notificationsFor,
  patients,
  people,
  requests,
  strategies,
  timeline,
} from '../../data/db'

/* ------------------------------------------------------------------- drawer */

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  width = 'w-[26rem]',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  // Escape always closes. A panel that can only be dismissed by finding the
  // right button is a panel someone can feel stuck inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 bg-ink/20 backdrop-blur-[1px]"
      />
      <aside
        className={`flex h-full ${width} max-w-full flex-col border-l bg-surface-2 shadow-xl`}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[0.8rem] text-muted">{subtitle}</p> : null}
          </div>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  )
}

/* ----------------------------------------------------- global evidence panel */

/**
 * "Why am I seeing this?" — available beside every AI-generated conclusion,
 * for patients and professionals alike.
 */
export function EvidencePanel() {
  const { evidence, closeEvidence } = useUI()
  if (!evidence) return null
  const b = evidence.bundle
  const block = (label: string, items: string[]) =>
    items.length ? (
      <div className="mb-5">
        <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
          {label}
        </h3>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="text-[0.84rem] leading-relaxed text-ink">
              {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null

  return (
    <Drawer title="Why am I seeing this?" subtitle={evidence.title} onClose={closeEvidence}>
      <div className="mb-5 rounded-[20px] bg-canvas px-4 py-3">
        <h3 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
          Current input
        </h3>
        <p className="text-[0.86rem] text-ink">{b.input}</p>
      </div>
      {block('Relevant history', b.relevantHistory)}
      {block('Supporting evidence', b.supporting)}
      {block('Conflicting evidence', b.conflicting)}
      <div className="mb-5">
        <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
          ORCA's interpretation
        </h3>
        <p className="text-[0.86rem] leading-relaxed text-ink">{b.interpretation}</p>
      </div>
      <div className="mb-5 rounded-[20px]  bg-state-wait-tint px-4 py-3">
        <h3 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-state-wait">
          Uncertainty
        </h3>
        <p className="text-[0.84rem] leading-relaxed text-ink-2">{b.uncertainty}</p>
      </div>
      {block('Sources', b.sources)}
      <p className="mt-6 border-t border-line pt-4 text-[0.78rem] leading-relaxed text-muted">
        This is an interpretation of information already in your record. It is not a clinical
        opinion and it is not part of any medical record.
      </p>
    </Drawer>
  )
}

/* --------------------------------------------------------- notification centre */

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { role } = useSession()
  const items = notificationsFor(role ?? 'patient')
  const [filter, setFilter] = useState('All')
  const categories = ['All', ...Array.from(new Set(items.map((n) => n.category)))]
  const shown = filter === 'All' ? items : items.filter((n) => n.category === filter)

  return (
    <Drawer title="Notifications" subtitle="What happened, why it matters, what you need to do" onClose={onClose}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className={`rounded-full  px-2.5 py-1 text-[0.75rem] ${
              filter === c ? 'border-brand bg-brand-tint text-brand-ink' : 'border-line text-ink-2'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {shown.map((n) => (
          <li key={n.id} className="rounded-[20px]  border-line px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted">
                {n.category}
              </span>
              {/* Date and time. Six approvals all reading "24 August 2026" is
                  not an order anybody can follow. */}
              <span className="text-[0.72rem] tabular-nums text-muted">{formatDateTime(n.date)}</span>
            </div>
            <p className="text-[0.87rem] font-medium text-ink">{n.what}</p>
            <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-2">{n.why}</p>
            <p className="mt-1.5 text-[0.82rem] text-ink">
              <span className="font-medium">What to do: </span>
              {n.todo}
            </p>
            <Link
              to={n.href}
              onClick={onClose}
              className="mt-2 inline-block text-[0.82rem] font-medium text-brand hover:underline"
            >
              Open
            </Link>
          </li>
        ))}
        {shown.length === 0 ? <p className="text-[0.85rem] text-muted">Nothing here.</p> : null}
      </ul>
    </Drawer>
  )
}

/* -------------------------------------------------------------- global search */

interface SearchHit {
  group: string
  label: string
  detail: string
  to: string
}

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const { role, option } = useSession()
  const [query, setQuery] = useState('')

  const index = useMemo<SearchHit[]>(() => {
    const base = option?.home ?? '/patient'
    const clinical = ['psychologist', 'psychiatrist', 'therapist', 'ot', 'gp', 'clinic'].includes(
      role ?? '',
    )
    const hits: SearchHit[] = []

    if (role === 'patient') {
      timeline
        .filter((e) => e.visibleTo.includes('patient'))
        .forEach((e) =>
          hits.push({ group: 'My story', label: e.title, detail: formatDate(e.date), to: `/patient/story/${e.id}` }),
        )
      strategies.forEach((s) =>
        s.patientId === 'pt-ananya'
          ? hits.push({ group: 'Strategies', label: s.title, detail: s.status, to: `/patient/support/${s.id}` })
          : null,
      )
      documents
        .filter((d) => d.patientId === 'pt-ananya')
        .forEach((d) =>
          hits.push({ group: 'Documents', label: d.title, detail: d.category, to: `/patient/documents/${d.id}` }),
        )
      requests
        .filter((r) => r.patientId === 'pt-ananya')
        .forEach((r) =>
          hits.push({ group: 'Requests', label: r.title, detail: r.status, to: `/patient/requests/${r.id}` }),
        )
      people
        .filter((p) => p.role !== 'patient' && p.role !== 'admin')
        .forEach((p) =>
          hits.push({ group: 'People', label: p.name, detail: p.title ?? '', to: '/patient/connections' }),
        )
    } else if (clinical) {
      patients.forEach((p) =>
        hits.push({ group: 'Patients', label: p.name, detail: p.context, to: `${base}/patients/${p.id}` }),
      )
      strategies.forEach((s) =>
        hits.push({
          group: 'Strategies',
          label: s.title,
          detail: `${s.status} · ${patients.find((p) => p.id === s.patientId)?.name ?? ''}`,
          to: `${base}/strategies/${s.id}`,
        }),
      )
      documents.forEach((d) =>
        hits.push({ group: 'Documents', label: d.title, detail: d.category, to: `${base}/documents` }),
      )
    } else if (role === 'employer' || role === 'university') {
      requests
        .filter((r) => r.destinationRole === role)
        .forEach((r) =>
          hits.push({ group: 'Requests', label: r.title, detail: r.status, to: `${base}/requests/${r.id}` }),
        )
    } else if (role === 'admin') {
      people.forEach((p) => hits.push({ group: 'Users', label: p.name, detail: p.title ?? p.role, to: '/admin/users' }))
    }
    return hits
  }, [role, option])

  const results = query.trim()
    ? index.filter((h) => `${h.label} ${h.detail} ${h.group}`.toLowerCase().includes(query.toLowerCase()))
    : index.slice(0, 8)

  const grouped = results.reduce<Record<string, SearchHit[]>>((acc, hit) => {
    ;(acc[hit.group] ||= []).push(hit)
    return acc
  }, {})

  return (
    <Drawer
      title="Search"
      subtitle="Results are limited to what your role is permitted to see"
      onClose={onClose}
      width="w-[30rem]"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search records, workflows, documents, strategies, people"
        className="mb-4 w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
      />
      {Object.entries(grouped).map(([group, hits]) => (
        <div key={group} className="mb-5">
          <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            {group}
          </h3>
          <ul className="space-y-1">
            {hits.map((hit) => (
              <li key={`${hit.group}-${hit.label}`}>
                <Link
                  to={hit.to}
                  onClick={onClose}
                  className="block rounded-2xl px-3 py-2 hover:bg-canvas"
                >
                  <span className="block text-[0.86rem] text-ink">{hit.label}</span>
                  <span className="block text-[0.78rem] text-muted">{hit.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {results.length === 0 ? <p className="text-[0.85rem] text-muted">No results.</p> : null}
    </Drawer>
  )
}

/* ------------------------------------------------------------ display settings */

export function DisplayPanel({ onClose }: { onClose: () => void }) {
  const { textSize, setTextSize, reducedMotion, setReducedMotion, density, setDensity } = useUI()
  return (
    <Drawer title="Display & help" subtitle="Change how ORCA looks and behaves" onClose={onClose}>
      <ExperienceLevel />

      <h3 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
        How much to show at once
      </h3>
      <div className="mb-2 space-y-2">
        {([
          {
            value: 'calm' as const,
            label: 'One thing at a time',
            detail:
              'Supporting sections start closed, with a label saying what is inside and how many items. Colour is used once per screen instead of on every status.',
          },
          {
            value: 'full' as const,
            label: 'Everything open',
            detail: 'Every section expanded, every status in colour. Nothing is closed.',
          },
        ]).map((choice) => (
          <label
            key={choice.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-[20px]  px-3.5 py-3 ${
              density === choice.value ? 'border-brand bg-brand-tint' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="density"
              className="mt-1"
              checked={density === choice.value}
              onChange={() => setDensity(choice.value)}
            />
            <span>
              <span className="block text-[0.86rem] font-medium text-ink">{choice.label}</span>
              <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-muted">{choice.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mb-6 text-[0.79rem] leading-relaxed text-muted">
        Nothing is removed either way. Closed sections say what they hold and open on one press.
      </p>

      <h3 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">Text size</h3>
      <div className="mb-6 flex gap-2">
        {(['default', 'large', 'xlarge'] as const).map((size) => (
          <button
            key={size}
            onClick={() => setTextSize(size)}
            aria-pressed={textSize === size}
            className={`rounded-2xl  px-3 py-2 text-[0.82rem] ${
              textSize === size ? 'border-brand bg-brand-tint text-brand-ink' : 'border-line text-ink-2'
            }`}
          >
            {size === 'default' ? 'Standard' : size === 'large' ? 'Large' : 'Larger'}
          </button>
        ))}
      </div>
      <h3 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">Motion</h3>
      <label className="mb-6 flex items-start gap-2.5 text-[0.85rem] text-ink">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => setReducedMotion(e.target.checked)}
          className="mt-1"
        />
        <span>
          Reduce movement and transitions
          <span className="block text-[0.8rem] text-muted">
            Nothing on screen will animate or slide.
          </span>
        </span>
      </label>
      <h3 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">Help</h3>
      <ul className="space-y-2 text-[0.85rem] text-ink-2">
        <li>
          <span className="font-medium text-ink">Status words</span> mean the same thing everywhere —
          “Awaiting approval” always means a person, not ORCA, has to decide.
        </li>
        <li>
          <span className="font-medium text-ink">Why am I seeing this?</span> appears beside anything
          ORCA worked out, and shows the evidence behind it.
        </li>
        <li>
          <span className="font-medium text-ink">Nothing is shared automatically.</span> Every
          disclosure is approved by the patient, for one recipient and one purpose.
        </li>
      </ul>
    </Drawer>
  )
}

/* --------------------------------------------------------------------- toast */

export function Toast() {
  const { toast, dismissToast } = useUI()
  if (!toast) return null
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl  border-line bg-ink px-4 py-3 text-[0.85rem] text-white shadow-lg"
    >
      <span>{toast}</span>
      <button onClick={dismissToast} className="text-white/70 hover:text-white">
        Dismiss
      </button>
    </div>
  )
}


/**
 * The interface's opinion about you, stated and overridable.
 *
 * ORCA quietly simplifies itself as someone gets familiar with it. That is a
 * good default and a terrible secret: an interface that changes without saying
 * so is disorienting for anyone, and for someone who navigates by position and
 * relies on things staying where they were, it is the specific failure this
 * whole product is meant to avoid causing.
 *
 * So the level is on screen, in words, with what it currently does — and can
 * be pinned. Someone coming back after a long gap, or a bad month, can have
 * the explanations back without having to prove they need them. Nobody has to
 * earn the simple version or justify wanting the detailed one.
 */
function ExperienceLevel() {
  const { level, visits, pinned, pinLevel, verbosity, setVerbosity } = useMaturity()

  const describe: Record<number, string> = {
    1: 'Headings carry a line of explanation, and the getting-started list is on your home page.',
    2: 'The explanations have stepped back. Shortcuts are offered, and the places you go often appear at the top of the menu.',
    3: 'Shortcuts first, prose trimmed. The interface stays out of the way.',
  }

  return (
    <section className="mb-6 border-b border-line pb-5">
      <h3 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
        How much ORCA explains itself
      </h3>
      <p className="text-[0.85rem] leading-relaxed text-ink-2">
        You are at level {level} of 3{pinned ? ' — set by you' : `, from ${visits} visit${visits === 1 ? '' : 's'}`}.
        {' '}
        {describe[level]}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((l) => (
          <button
            key={l}
            onClick={() => pinLevel(l)}
            aria-pressed={pinned === l}
            className={`rounded-2xl  px-3 py-1.5 text-[0.83rem] ${
              pinned === l
                ? 'border-brand bg-brand-tint font-medium text-brand-ink'
                : 'border-line text-ink-2 hover:text-ink'
            }`}
          >
            Level {l}
          </button>
        ))}
        {pinned ? (
          <button
            onClick={() => pinLevel(null)}
            className="rounded-2xl  border-line px-3 py-1.5 text-[0.83rem] text-ink-2 hover:text-ink"
          >
            Let it decide again
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-[0.85rem] font-medium text-ink">How much ORCA says</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ['detailed', 'Explain as it goes'],
            ['concise', 'Keep it short'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setVerbosity(value)}
              aria-pressed={verbosity === value}
              className={`rounded-2xl  px-3 py-1.5 text-[0.83rem] ${
                verbosity === value
                  ? 'border-brand bg-brand-tint font-medium text-brand-ink'
                  : 'border-line text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
