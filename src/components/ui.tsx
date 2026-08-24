import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useUI } from '../state/ui'
import type { EvidenceStatus, WorkflowStatus, WorkflowStep } from '../data/types'

/* ---------------------------------------------------------------- primitives */

export function Card({
  children,
  className = '',
  as: As = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'li'
}) {
  return (
    <As
      className={`rounded-[20px] elevate bg-surface ${className}`}
    >
      {children}
    </As>
  )
}

export function CardHead({
  title,
  meta,
  action,
}: {
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2>
        {meta ? <p className="mt-0.5 text-[0.8rem] text-muted">{meta}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-2xl  px-3.5 py-2 text-[0.85rem] font-medium transition-colors disabled:opacity-50'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-ink',
  // Filled rather than outlined: with the strokes gone, a secondary button on
  // a white card needs something to stand on or it reads as a link.
  secondary: 'bg-surface-2 text-ink hover:bg-brand-tint',
  quiet: 'bg-transparent text-ink-2 hover:bg-surface-2',
  danger: 'bg-state-alert-tint text-state-alert hover:bg-state-alert/15',
}

export function Button({
  children,
  variant = 'secondary',
  onClick,
  type = 'button',
  className = '',
  disabled,
}: {
  children: ReactNode
  variant?: ButtonVariant
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  to,
  children,
  variant = 'secondary',
  className = '',
}: {
  to: string
  children: ReactNode
  variant?: ButtonVariant
  className?: string
}) {
  return (
    <Link to={to} className={`${buttonBase} ${buttonVariants[variant]} ${className}`}>
      {children}
    </Link>
  )
}

/* ------------------------------------------------------------------- status */

const statusTone: Record<WorkflowStatus | 'Recorded', string> = {
  Draft: 'bg-state-neutral-tint text-state-neutral',
  Active: 'bg-state-info-tint text-state-info',
  'In progress': 'bg-state-info-tint text-state-info',
  'Awaiting information': 'bg-state-wait-tint text-state-wait',
  'Awaiting approval': 'bg-state-wait-tint text-state-wait',
  'Awaiting professional review': 'bg-state-wait-tint text-state-wait',
  'Awaiting stakeholder': 'bg-state-wait-tint text-state-wait',
  Completed: 'bg-state-good-tint text-state-good',
  'Requires adaptation': 'bg-state-wait-tint text-state-wait',
  Escalated: 'bg-state-alert-tint text-state-alert',
  Blocked: 'bg-state-alert-tint text-state-alert',
  Cancelled: 'bg-state-neutral-tint text-state-neutral',
  Recorded: 'bg-state-neutral-tint text-state-neutral',
}

/** The dot that carries the meaning when calm mode drops the tinted fill. */
const statusDot: Record<WorkflowStatus | 'Recorded', string> = {
  Draft: 'bg-state-neutral',
  Active: 'bg-state-info',
  'In progress': 'bg-state-info',
  'Awaiting information': 'bg-state-wait',
  'Awaiting approval': 'bg-state-wait',
  'Awaiting professional review': 'bg-state-wait',
  'Awaiting stakeholder': 'bg-state-wait',
  Completed: 'bg-state-good',
  'Requires adaptation': 'bg-state-wait',
  Escalated: 'bg-state-alert',
  Blocked: 'bg-state-alert',
  Cancelled: 'bg-state-neutral',
  Recorded: 'bg-state-neutral',
}

/**
 * The word is the status; the colour only repeats it. In calm mode the fill is
 * dropped and a dot carries the colour, so a list of twelve statuses reads as a
 * list rather than as twelve separate alarms. Nothing is lost — the same word
 * is present either way, which is why the word was never allowed to be
 * decorative in the first place.
 */
export function StatusPill({ status }: { status: WorkflowStatus | 'Recorded' }) {
  return (
    <span
      className={`status-chip inline-flex shrink-0 items-center gap-1.5 rounded-full  border-transparent px-2.5 py-1 text-[0.72rem] font-medium ${statusTone[status]}`}
    >
      <span className={`status-dot h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[status]}`} aria-hidden />
      {status}
    </span>
  )
}

const evidenceTone: Record<EvidenceStatus, string> = {
  Reported: 'border-line-strong text-muted',
  'Professionally documented': 'text-state-info',
  Validated: 'text-state-good',
  'AI interpretation': 'text-state-wait',
}

export function EvidenceTag({ status }: { status: EvidenceStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-2xl  px-2 py-0.5 text-[0.7rem] ${evidenceTone[status]}`}
    >
      {status}
    </span>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-2xl bg-canvas px-2 py-0.5 text-[0.72rem] text-ink-2">
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------- layout */

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string
  description?: string
  breadcrumbs?: { label: string; to?: string }[]
  actions?: ReactNode
}) {
  return (
    <header className="mb-6">
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-[0.78rem] text-muted">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-ink hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
              {i < breadcrumbs.length - 1 ? <span aria-hidden>/</span> : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-[1.45rem] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {description ? <p className="mt-1.5 text-[0.9rem] leading-relaxed text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const map = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' }
  return <div className={`grid gap-4 ${map[cols]}`}>{children}</div>
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-[0.8rem] text-muted">{item.label}</dt>
          <dd className="text-[0.88rem] leading-relaxed text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-[20px]  border-dashed border-line-strong bg-surface-2 px-5 py-8 text-center">
      <p className="text-[0.9rem] font-medium text-ink">{title}</p>
      {detail ? <p className="mt-1 text-[0.82rem] text-muted">{detail}</p> : null}
    </div>
  )
}

export function Table({
  columns,
  rows,
}: {
  // Headers may be interactive — a sortable column is still a column.
  columns: ReactNode[]
  rows: { key: string; cells: ReactNode[]; to?: string }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className="px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-0 hover:bg-surface-2">
              {row.cells.map((cell, i) => (
                <td key={i} className="px-5 py-3 align-top text-[0.85rem] text-ink">
                  {i === 0 && row.to ? (
                    <Link to={row.to} className="font-medium text-ink hover:underline">
                      {cell}
                    </Link>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[0.85rem] text-muted">Nothing to show here yet.</p>
      ) : null}
    </div>
  )
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={tab === active}
          onClick={() => onChange(tab)}
          className={`-mb-px border-b-2 px-3 py-2 text-[0.85rem] font-medium ${
            tab === active
              ? 'border-brand text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

export function FilterChips({
  options,
  active,
  onChange,
}: {
  options: string[]
  active: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={option === active}
          className={`rounded-full  px-3 py-1 text-[0.78rem] ${
            option === active
              ? 'border-brand bg-brand-tint text-brand-ink'
              : 'bg-surface-2 text-ink-2 hover:border-line-strong'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ workflow */

export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => (
        <li key={step.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              aria-hidden
              className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full  text-[0.6rem] ${
                step.state === 'done'
                  ? 'border-state-good bg-state-good text-white'
                  : step.state === 'current'
                    ? 'border-brand bg-brand-tint text-brand'
                    : 'bg-surface-2 text-transparent'
              }`}
            >
              {step.state === 'done' ? '✓' : '•'}
            </span>
            {i < steps.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
          </div>
          <div className="pb-4">
            <p
              className={`text-[0.86rem] ${
                step.state === 'todo' ? 'text-muted' : 'font-medium text-ink'
              }`}
            >
              {step.label}
              {step.state === 'current' ? (
                <span className="ml-2 text-[0.72rem] font-normal text-brand">In progress</span>
              ) : null}
            </p>
            {step.detail ? <p className="mt-0.5 text-[0.8rem] text-muted">{step.detail}</p> : null}
            {step.completedOn ? (
              <p className="mt-0.5 text-[0.75rem] text-muted">Completed {formatDate(step.completedOn)}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'wait' | 'alert' | 'good'
  title: string
  children?: ReactNode
}) {
  const tones = {
    info: 'bg-state-info-tint',
    wait: 'bg-state-wait-tint',
    alert: 'bg-state-alert-tint',
    good: 'bg-state-good-tint',
  }
  return (
    <div className={`rounded-[20px]  px-4 py-3 ${tones[tone]}`}>
      <p className="text-[0.85rem] font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">{children}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------------- utils */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatDate(iso: string) {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function formatDateTime(iso: string) {
  const [datePart, timePart] = iso.split('T')
  // Hours and minutes. The raw tail carries seconds and a UTC offset, which is
  // machine detail nobody reading a notification needs.
  return timePart ? `${formatDate(datePart)}, ${timePart.slice(0, 5)}` : formatDate(datePart)
}

/* --------------------------------------------------- progressive disclosure */

/**
 * A section that can start closed without concealing what is inside it.
 *
 * Three rules, and they are the difference between disclosure and hiding:
 *   1. The control always says what is inside, including how many items.
 *   2. It opens and closes on one press, and stays where the user put it.
 *   3. Full mode opens everything, so nobody has to hunt.
 *
 * `important` sections ignore calm mode and stay open. Something a person is
 * being asked to decide is never collapsed behind a chevron — that is not
 * calm, it is a page deciding on their behalf that it can wait.
 */
export function Section({
  title,
  count,
  summary,
  important = false,
  children,
  action,
}: {
  title: string
  count?: number
  summary?: string
  important?: boolean
  children: ReactNode
  action?: ReactNode
}) {
  const { density } = useUI()
  const startOpen = important || density === 'full'
  const [open, setOpen] = useState(startOpen)
  const id = useId()

  // Switching the preference re-sets sections that have not been touched, so
  // "show me everything" actually shows everything.
  useEffect(() => {
    setOpen(important || density === 'full')
  }, [density, important])

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          className="disclosure-summary group inline-flex items-center gap-2 rounded-2xl py-1 text-left"
        >
          <span
            aria-hidden
            className={`inline-block text-[0.7rem] text-muted ${open ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted group-hover:text-ink-2">
            {title}
          </span>
          {typeof count === 'number' ? (
            <span className="text-[0.78rem] text-muted">({count})</span>
          ) : null}
          {!open ? (
            <span className="text-[0.78rem] font-normal normal-case tracking-normal text-muted">
              — show
            </span>
          ) : null}
        </button>
        {action}
      </div>
      {!open && summary ? (
        <p className="mb-2 text-[0.83rem] leading-relaxed text-muted">{summary}</p>
      ) : null}
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

/** A labelled dropdown. Quieter than a row of chips once there are more than
 *  four options, and it does not reflow the page as the list changes. */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <label className="flex items-center gap-2" htmlFor={id}>
      <span className="text-[0.8rem] text-muted">{label}</span>
      <span className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none rounded-2xl  bg-surface-2 py-2 pl-3 pr-8 text-[0.85rem] text-ink outline-none hover:border-line-strong"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.65rem] text-muted"
        >
          ▼
        </span>
      </span>
    </label>
  )
}

/** A column header that sorts, and says which way it is sorting. */
export function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="inline-flex items-center gap-1 text-left uppercase tracking-[0.06em] hover:text-ink"
    >
      {label}
      <span aria-hidden className={`text-[0.6rem] ${active ? 'text-ink' : 'text-line-strong'}`}>
        {active && direction === 'desc' ? '▼' : '▲'}
      </span>
    </button>
  )
}

/* --------------------------------------------------------------- stat row */

export interface Stat {
  label: string
  value: number | string
  detail?: string
  tone?: 'neutral' | 'wait' | 'good' | 'alert'
}

/**
 * The four numbers a role checks before doing anything else.
 *
 * Not a dashboard of everything countable — four at most, chosen because each
 * one changes what the person does next. A tile showing a number nobody would
 * act on is a tile teaching people that these tiles are decorative.
 */
export function StatRow({ stats }: { stats: Stat[] }) {
  const tones = {
    neutral: 'text-ink',
    wait: 'text-state-wait',
    good: 'text-state-good',
    alert: 'text-state-alert',
  }
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-[20px]  bg-surface-2 px-4 py-3.5">
          <p className="text-[0.78rem] text-muted">{s.label}</p>
          <p className={`mt-1 text-[1.6rem] font-semibold tracking-[-0.02em] ${tones[s.tone ?? 'neutral']}`}>
            {s.value}
          </p>
          {s.detail ? <p className="mt-0.5 text-[0.78rem] text-muted">{s.detail}</p> : null}
        </div>
      ))}
    </div>
  )
}
