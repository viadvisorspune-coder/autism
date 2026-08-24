# Evaluation and robustness

How ORCA was tested, what broke, what that revealed, and what changed as a
result.

Every entry below is a real failure observed during the build, not a
hypothetical. Each names how it was found, what the diagnosis turned out to be,
what changed, and the commit that carries the fix — so any of it can be checked
against the repository rather than taken on trust.

Three of these changed the architecture rather than the code.

---

## 1. The system answered a question with a document, three minutes late

**How it was found.** A patient typed *"who is Tejas?"* into the chat.

**What happened.** The message went to the agentic workflow. Fifteen steps ran.
Roughly three minutes later a PDF was produced, and an approval box appeared
asking someone to authorise a "non-identifying clarification" before the person
could be told who their own occupational therapist was.

**Diagnosis.** Not a bug in any step. Every message was being sent to a pipeline
built for producing documents, because that was the only path that existed.
Classification was supposed to prevent this, but the classification step was a
"Workflow Inputs" action — it cannot call a tool, so it classified nothing — and
the routing step's decision was never written anywhere a later step could read.

**Change.** The interface now decides before anything is sent. A message that
asks *to know* something is answered in the browser from the record already
loaded there, in under a second, with sources. A message that asks for something
*to be done* — a letter written, a request sent, someone told — starts a run.
The test is a verb that does something plus a thing to do it to.

**Evidence.** `646cf49`, `83fc38c`. Asking "who is Tejas" now produces an
immediate sourced answer and **no run appears in the workflow platform at all**,
which is the observable check.

**What it cost to learn.** Roughly a day, and it was the most valuable day of
the build. The instinct to put every capability behind one orchestrator is
strong and wrong.

---

## 2. A permanent failure reported itself as temporary

**How it was found.** Every message took twenty seconds to fail, consistently.

**What happened.** The trigger endpoint returned:

```json
{ "error": { "code": "public_trigger_start_interrupted",
             "phase": "workflow_start",
             "retryable": true } }
```

**Diagnosis.** The account had run out of credits. The quota check threw
somewhere the platform's handler had no case for, so an exhausted account — a
condition that will still be true in two seconds — was reported with
`retryable: true`. Honouring that instruction meant every single message paid
four seconds of deliberate waiting to rediscover something the previous message
had already established. Correct behaviour, wrong premise.

Isolating it took probing the endpoint without a secret: a 400 (missing
idempotency key) proved the URL was right, a 403 would have proved the secret
was wrong. Neither appeared, which placed the fault after authentication, in
run creation.

**Change.** Retries still honour the platform's own verdict, because that is the
right default. But the first interruption is remembered, and for five minutes
afterwards an identical failure returns immediately instead of waiting. If the
condition really was transient the window lapses and the next message tries
properly.

**Evidence.** `ff02730` added the retry, `a31ce61` added the breaker. Kept in
memory rather than the database on purpose — a cache of somebody else's outage
is not something to write into a patient's record.

**Wider lesson.** An upstream service's error taxonomy is a claim, not a fact. It
is worth honouring and worth bounding.

---

## 3. The safety agent was right about what it could see

**How it was found.** Ordinary questions were being held as privacy incidents.

**What happened.** Asking about a clinician already connected to the record
produced a block: *the requester is unauthenticated, the person is unidentified,
no disclosure-eligible evidence exists.*

**Diagnosis.** The agent was behaving correctly. The metadata it received
carried an actor id and nothing else. It had no way to know that the trigger
function had already checked that person's relationship to the record before
calling out. It was reasoning soundly from a genuinely incomplete picture.

**Change.** The trigger now states what was verified and how: the relationship
in words, the exact check that ran, and — reported honestly — whether identity
was *proven* or merely asserted. In demonstration mode `identity_verified` is
`false`, because it is: there is no sign-in yet, so the actor is asserted by the
caller. An agent that blocks on that is behaving correctly, and lying to it to
make the block disappear would have been a worse bug than the block.

**Evidence.** `f0fb666`, extended in `83fc38c`.

**Wider lesson.** When an agent refuses, the first question is what it could see,
not what it decided. Two of the three agent failures in this build were
information problems wearing the costume of judgement problems.

---

## 4. One document per stage instead of one per request

**How it was found.** A single request produced several part-documents.

**Diagnosis.** The artefact tool ran at every stage that had something to say,
and each call created a new document.

**Change.** One document per run. Sections accumulate into it; the tool is told
explicitly not to produce anything for a question, and never more than once.

**Evidence.** `635b2cf`.

---

## 5. "This is now with Processing, and nothing will move until they decide"

**How it was found.** Reading the patient's chat.

**Diagnosis.** `waiting_for` is an engineering field holding whatever a run is
blocked on. Sometimes that is a person. Sometimes it is the string `Processing`,
which the trigger writes the moment a run begins. The interface rendered both
the same way, so a verb was announced as a colleague who had not yet made up
their mind. An earlier version of the same bug named the workflow vendor.

**Change.** A list of things that are states rather than people. Anything on it
is described as work in progress; only an actual named person or role produces
"this is with them". The vendor's name now appears nowhere a patient can reach.

**Evidence.** `1d510fe`, and `64a2b1f` for the vendor leak.

**Wider lesson.** Every field that reaches a person needs a rule for what it says
when it holds something the designer did not anticipate.

---

## 6. "which one" was answered with a paragraph about headphones

**How it was found.** A two-word follow-up.

**What happened.** ORCA had just listed three things. The person asked *"which
one"* and received a confident answer about noise-cancelling headphones —
which was not among the three.

**Diagnosis.** Two independent faults compounding. The record search matched
substrings, and `one` sits inside `headph**one**s`. And a follow-up was treated
as a brand-new question, matched against the whole record from scratch.

**Change.** Matching is whole-word, and words under four letters only count when
the record has a synonym for them. ORCA keeps its own last answer, so *"which
one"*, *"why"* and *"tell me more"* continue the sentence before them.

**Evidence.** `491db06`. Verified against the exact failing case: the query
"which one" now produces zero search terms and falls to the continuation path,
while "why is the office so hard" still matches the desk and meeting entries and
no longer matches headphones.

---

## 7. Every account showed the same person

**How it was found.** Opening the calendar as a psychologist and seeing the demo
patient's appointments.

**Diagnosis.** Three separate causes, each sufficient on its own.

- Signing in stored the **role**, not the person. The session then resolved the
  first account with that role. Two different patients resolved to one of them.
- Profile items had no owner. The database column existed; the frontend type had
  dropped it, so one shared list answered for everybody — a clinician opening
  one patient read another's "what helps me", and the answer engine quoted it
  back about whoever asked. The most personal table in the record was the only
  one with no `patient_id`.
- Four of the five patients had no history at all, so an empty screen and a
  wrong screen were indistinguishable.

**Change.** The session stores who signed in. Profile items carry their owner and
every consumer is scoped. The other four patients have real records,
deliberately unlike the first: a warehouse team lead whose difficulty is noise
and rota changes, an architecture student whose difficulty is studio crits, a
freelancer with no employer to ask, and a first-year who has told nobody. Reads
are scoped per connection rather than per role.

**Evidence.** `376ca22`. Verified in a browser across three accounts: the
psychologist sees three patients, the occupational therapist two, the university
adviser one — matching their actual connections.

**Wider lesson.** A prototype that renders the wrong person's record reads as
working, while one that renders nothing reads as broken. The dangerous failure
is the one that looks fine, so the fallback to demonstration data is now the
last resort rather than the default.

---

---

## 8. A failed read that looked like an empty record

**How it was found.** Checking whether the backend was finished, by asking it for
a timeline.

**What happened.** `{"events": []}`. Twelve events sat in the table.

**Diagnosis.** The read asked for a column called `evidence_status`. The column
is `evidence`. PostgREST rejected the whole select, and the error was discarded
by a destructure that took only `data` — so the caller received an empty array
and rendered it faithfully. Every patient's story and profile read "nothing
recorded yet" on the deployed app. The frontend held the mirror image: it
mapped `evidence_status` off a bundle that returns `evidence`, so every event
arrived with no evidence status — the one field separating something a person
mentioned once from something a clinician documented.

**Change.** Both column names corrected; those two reads now return the error
instead of swallowing it, and the four other reads that render primary content
log theirs. A sweep of every field the frontend reads against the actual schema
found three more dead reads, since fixed or derived.

**Wider lesson.** This is the most dangerous bug shape in the system, and it is
worth naming precisely: a failure that renders as an empty record. Nobody
reports it, because an empty record is a plausible thing to have. A screen that
cannot tell "nothing happened" from "the question failed" will always be
believed when it says nothing happened.

---

## 9. The agent that had nothing to work with, and said so

**How it was found.** A run completed both steps and the person got no answer.

**What happened.** The reply tool was called with:

```json
{"actor_id":"","patient_id":"","text":"the record was not retrieved because
 required patient metadata was unavailable","workflow_run_id":null}
```

The API returned 400, correctly — both ids are required so a reply cannot be
written into nobody's conversation.

**Diagnosis.** The workflow platform's public trigger carries a single field.
The metadata object sent beside it never reaches the agents. An agent asked for
a patient id therefore had nothing to give, and sent an empty string — which
satisfies the connector schema and fails at the API.

**Change.** The ids now lead the trigger text, where the agent actually reads.
The backend also resolves them when they arrive blank, from the run the
application created moments earlier.

**What the agent got right.** Asked what medication to take, with no record, it
did not invent one. It reported that retrieval had failed and why. That is the
behaviour the whole evidence architecture exists to produce, and it held under
the worst conditions available — no context at all.

---

## 10. Documents the agents could not see

**How it was found.** Asking whether a newly seeded set of documents would reach
the workflows.

**Diagnosis.** The retrieval endpoint every agent shares had never queried the
documents table. Ten stakeholders' contributions — the occupational therapist's
workplace observation, HR's adjustment request, a sister's note about what a
hard day looks like — were invisible to every agent in both workflows.

**Change.** Documents are returned inside the existing `records` array with
category `Documents`, rather than as a field of their own. The connector
contract fixes the response shape, so a new top-level field would have required
editing and re-uploading eight files; a document fits the record shape exactly.
Scoped by each document's own access list, so an employer's agent reads HR's
request and not the therapist's observation.

**Wider lesson.** A contract you do not control is a constraint on where the
answer can go, not on whether there is one.

## Edge cases the system is built to handle

These are designed-for rather than discovered, and each is observable.

| Case | Behaviour |
|---|---|
| Consent lapsed past its review date | Read refused with the reason; the record disappears from that clinician's caseload rather than silently emptying |
| Patient shared only part of their record | Counts they may not see return `null`, not `0`, and the interface says "not shared with you" rather than "none" |
| Backend unreachable | Demonstration data renders with a banner saying so on every screen; no screen claims to be showing a real record |
| Workflow service down | The record still answers, from the browser, with sources |
| Question matches nothing | ORCA says so plainly and offers to think it through, rather than answering a different question |
| Same action sent twice | Idempotency key returns the original run instead of starting a second |
| Run stalls | Following stops at a ceiling rather than spinning indefinitely |
| Approval never answered | The run stays visibly blocked and names who it is with — a person, never a process |

## What is still weak

Stated plainly, because a testing section that reports only successes is not a
testing section.

- **Identity is asserted, not proven.** There is no sign-in, so the actor is
  whoever the caller claims to be. Scope is enforced server-side and refusals
  are recorded, but this demonstrates the permission model rather than defending
  it. Every affected function says so in its own header comment.
- **Cross-patient reads are counts only.** A clinician's caseload view returns
  numbers and dates, never content. Opening a record still goes through the
  ordinary per-record checks. This is deliberate, but it means a caseload
  question cannot be answered richly.
- **A connector call can be resolved by inference.** When an agent sends an
  empty patient id, the backend falls back to the newest run still open, on the
  assumption it is the one that just triggered. Under concurrent users this
  guesses, and a wrong guess writes into the wrong person's record. It is
  bounded to fifteen minutes, requires the run to be in progress, and refuses
  outright when more than one candidate exists — but it is a demonstration
  affordance, not a permission model, and should be deleted rather than kept
  the day the trigger can carry structured metadata.
- **Role is asserted, not derived.** The read endpoint takes the caller's role
  from the request body. Scope is then enforced correctly against that role,
  but nothing proves the claim. This is the same gap as asserted identity,
  one level up, and it is the first thing sign-in should close.
- **Uploaded documents are registered, not read.** Nothing extracts text from a
  file. The interface says so rather than implying otherwise, and every
  document with nothing extracted reports that plainly to agents as well.
- **The agentic workflow is not yet reliable.** One agent produces findings
  without calling the tool that would ground them — the failure mode where a
  language model reports something plausible about a real person from nothing.
  Diagnosed, not yet fixed, and the interface is built so that this does not
  block a person from getting an answer.
