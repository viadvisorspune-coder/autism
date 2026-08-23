# Test cases for the routing change

Three cases, run in this order. Each one is observable in three places — the
browser, the Yoxa run list, and the database — and each fails differently, so a
failure tells you where the fault is rather than only that there is one.

Sign in as **Ananya Rao** (patient) unless stated otherwise.

---

## Case 1 — the question that must never reach Yoxa

**Type:** `who is Tejas?`

This is the control. It proves the front-first routing still holds, and it must
pass before either of the others means anything.

| Where | Expected |
|---|---|
| Browser | A sourced answer in well under a second, naming Tejas Kulkarni and his role |
| Yoxa | **No run appears at all** |
| Database | No new row in `workflow_runs` |

```sql
select id, type, current_step, started_at
from workflow_runs
order by started_at desc
limit 3;
```

Note the newest `started_at` before typing. It must be unchanged after.

**Fails if** a run appears. That means `laneFor()` classified a lookup as an
action, and the routing change is not the thing to look at.

---

## Case 2 — the action, and the plan it produces

**Type:** `Can you draft a letter to my employer asking for written notice when
meetings move?`

A verb that does something (`draft`), a recipient (`employer`), an artefact
(`letter`) — so `laneFor()` returns `act`, and the trigger sends `LANE: make`.

| Where | Expected |
|---|---|
| Browser | An immediate sentence from the record, then one line saying it has been started. No step names, no vendor, no queue position |
| Yoxa | A run appears. The first step calls **ORCA Workflow Routing** and its badge reads `Succeeded`, not `Skipped` |
| Database | The run carries a plan |

```sql
select id, current_step, jsonb_pretty(steps)
from workflow_runs
order by started_at desc
limit 1;
```

**Pass:** `steps` holds a short list of step names — six or so, not all fifteen —
and the first entry's `detail` reads `Planned for the make lane.`

**Then check who called it:**

```sql
select occurred_at, action, why
from audit_log
where action like 'Workflow route:%'
order by occurred_at desc
limit 5;
```

Exactly one row per run. More than one means the routing connector is attached
to more than one step, and each call overwrites the plan the last one set.

**Fails if:**

- `steps` is empty or holds all fifteen — the agent called the tool without a
  `plan`, or with everything on it. The tool description says *"Fewer is the
  correct answer, not a shortcut."*
- The tool badge reads `Skipped` — the agent decided not to call it. Check the
  Orchestrator's Behaviour field carries the plan instruction.
- The call 400s on `lane` or `plan` — `workflow-state` was not redeployed before
  the YAML was re-uploaded.

---

## Case 3 — the stand-down

Still in case 2's run, look at the steps that are **not** on the plan.

| Where | Expected |
|---|---|
| Yoxa | Each off-plan agent produces one line saying its step is not needed, and its tool badge is blank or `Skipped` |
| Database | No artefact rows for an `answer`-lane run |

The strongest single check is Output Artefact. Its description says: *"If the
lane is answer, reply in words instead and do not call this at all."* So run the
same test through the answer lane:

1. Type something the record cannot match — `what should I do about the new
   building?`
2. ORCA says nothing matched and offers **Think this through properly**
3. Press it. That forces lane `ask`, and the trigger sends `LANE: answer`

```sql
select count(*) from artifacts
where workflow_run_id = '<the run id>';
```

**Pass:** `0`. And a reply arrives in the conversation:

```sql
select author, left(text, 120), created_at
from conversation_messages
order by created_at desc
limit 5;
```

There must be an `orca` row carrying that run's `workflow_run_id`.

**Fails if** a PDF is produced for an answer-lane run. That is the original bug
this whole architecture was built to stop — a question answered with a document,
minutes late.

---

## What each failure points at

| Symptom | Look at |
|---|---|
| A run appears for a plain question | `src/lib/route.ts`, `laneFor()` |
| Routing tool `Skipped` | Orchestrator Behaviour field |
| Plan empty or complete | The `plan` field description in the routing YAML |
| 400 on `lane` / `plan` | `workflow-state` not deployed |
| Two `Workflow route:` rows per run | Routing connector attached to more than one step |
| Off-plan agents still working | Stand-down text missing from those agents' Behaviour |
| PDF for an answer-lane run | Output Artefact agent ignoring its lane instruction |
| No reply in the conversation | Conversation Reply connector not attached, or not deployed |
