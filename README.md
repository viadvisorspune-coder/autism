# ORCA — frontend

A working front end for ORCA: **one longitudinal patient model → multiple role-specific views → one shared agentic workflow layer → purpose-specific access.**

This repository contains the **frontend layer only**. It captures what a human does and displays what comes back. It holds no business logic of its own: permissions, consent, workflow state and execution belong to the backend, and understanding, reasoning and generation belong to the agent layer. Everything the screens display here is read from a mock system-of-record in `src/data/` that stands in for the backend.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

Sign in with anything (no credentials are checked), then pick a role. The role
you choose decides the whole information architecture — navigation, layout,
language and what is visible. Switch roles at any time from the profile menu in
the top bar.

## The eleven roles

| Experience | Role | The job the UI is shaped around |
| --- | --- | --- |
| Patient | Patient | Understand myself → get support → decide → share → track |
| Clinical | Psychologist | Understand patient → review change → work → document → coordinate |
| Clinical | Psychiatrist | Clinical context → change → appointment → clinical decision |
| Clinical | Therapist | Goal → intervention → outcome → adapt |
| Clinical | Occupational therapist | Function → environment → adaptation → outcome |
| Clinical | GP | Relevant context → current issue → care coordination |
| Organisation | Hospital / clinic | Coordinate → document → track → hand off |
| Organisation | Employer / HR | Request → review → implement → track |
| Organisation | University accessibility | Request → review → implement → track |
| Trusted | Trusted person | See what is shared → support → report |
| Admin | Administrator | Monitor → govern → audit |

They are not colour themes of one another. The patient experience is a single
calm column with a persistent **Talk to ORCA** action; clinical roles get
two-column workspaces and dense tables with contextual AI actions rather than a
permanent chatbot; employer and university get a request queue with no clinical
timeline anywhere in it; the administrator gets monitoring tables and no record
content at all.

## What lives where

```
src/
  app/
    App.tsx            route table for every role
    nav.ts             primary navigation per role, accent per experience
    shell/             top bar, primary nav, drawers (evidence, notifications, search, display)
  components/
    ui.tsx             design primitives: cards, tables, status pills, evidence tags, steps
    shared.tsx         the reusable human-in-the-loop screens (review, clarification,
                       memory validation, workflow state, evidence panel)
  data/
    types.ts           the shared longitudinal model, workflow and governance types
    db.ts              mock system-of-record: one patient story, fully populated
  routes/
    auth/              sign in, role selection, first-time setup
    patient/           home, ORCA Guide, story, profile, support, care, work, documents,
                       connections, requests, progress, privacy
    clinical/          dashboards, patient list and overview, session workspace, memory review,
                       strategies, outcomes, handover, OT and therapist workspaces, tasks,
                       permissions, documents, coordination, referrals
    org/               employer, university and clinic experiences
    trusted/           trusted person
    admin/             system dashboard, workflow monitor, audit log, access, integrations
  state/
    session.tsx        who is signed in and as which role (kept in sessionStorage)
    ui.tsx             evidence panel, toasts, text size and reduced motion preferences
```

## The story the data tells

One patient — Ananya Rao, 27, QA analyst and part-time design student — running
through every role. Meetings at work keep moving at short notice; written advance
notice helped when it arrived hours ahead and did not help when it arrived within
the hour; a quiet-space trial is running; a workplace request is with HR, who
have asked a clarification question. The same validated fact appears as a
patient-friendly support preference, a psychologist's functional context, an OT's
environmental observation and an employer's authorised workplace requirement —
without creating contradictory versions of the underlying record.

## Rules the interface enforces

These are visible in the UI because they are the point of the product, not
decoration:

- **Nothing is shared without an explicit approval**, for one recipient and one
  purpose. The disclosure review screen shows the exact content, the recipient,
  the reason, the sources, and what was withheld — with a Remove control on every
  item.
- **AI inference never becomes memory on its own.** Anything ORCA works out is
  labelled *AI interpretation* and appears as a candidate with its confidence and
  evidence — on the patient's profile and on the professional's memory review
  screen — until a person confirms, edits or rejects it.
- **Every AI-generated conclusion carries "Why am I seeing this?"** — a panel with
  the current input, relevant history, supporting and conflicting evidence, the
  interpretation, the uncertainty, and the sources.
- **Status language is global.** Draft, Active, Awaiting information, Awaiting
  approval, Awaiting professional review, Awaiting stakeholder, In progress,
  Completed, Requires adaptation, Escalated, Blocked, Cancelled — the same word
  means the same thing in every role.
- **Permission is a backend decision.** Roles outside a scope do not see the
  record at all: it is absent from their lists, their search and anything ORCA
  writes for them. The handover builder physically disables clinical categories
  for an employer recipient, and the audit log records denials alongside
  approvals.
- **Notifications always say three things**: what happened, why it matters, what
  you need to do.

## Accessibility and sensory load

Built for the population it serves: a warm low-glare palette, desaturated status
colours, no motion by default, plain language, one action per row, and a display
panel in the top bar for text size and reduced motion. Every interactive element
is a real control with a visible focus ring.

## Prototype boundaries

All data is fictional and lives in memory — nothing persists beyond the browser
session, no network calls are made, and no real system is written to. Actions
such as approving, sharing, revoking or signing a note update the screen and
confirm what would have happened, which is what a front end should do while the
backend and agent layers are built against the same contract.
