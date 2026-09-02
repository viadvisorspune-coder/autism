/**
 * Three fixed answers, so a demonstration never depends on a workflow.
 *
 * WHY THIS EXISTS. Everything else in ORCA routes a question to a Yoxa
 * deployment and waits for the answer to come back. That is the real product
 * and it is the right design, and it also means a demonstration is only as
 * reliable as a third-party workflow, a network, and a queue on the day. Three
 * questions are answered here instead: one that returns text, one that returns
 * a file this module typesets, and one that returns a file Yoxa actually
 * produced, kept verbatim. Between them they cover both shapes of output the
 * product has, without anything leaving this function.
 *
 * WHAT IT IS NOT. It is not a fallback, a cache, or a stand-in for a workflow
 * that failed. It matches three exact questions and nothing else — a question one
 * word different routes normally and hits the real lanes. Nothing here degrades
 * gracefully into answering questions it does not know, because a demonstration
 * fixture that starts answering real questions is indistinguishable from the
 * product being wrong.
 *
 * IT SAYS WHAT IT IS. Every answer carries a line naming itself as a fixed
 * demonstration answers, for the same reason the rehearsal answer in `start.ts`
 * does: a screen full of realistic prose about somebody's medical record is
 * exactly the thing that must never be mistaken for a real reading of it. The
 * line is small and sits at the foot, so it does not dominate the demo, and it
 * is not removable by configuration — if these should not be visible, the
 * fixtures should not be deployed.
 *
 * WHOSE RECORD. All three are written against Ananya Rao's seeded record and
 * are only served when the subject of the request is that record. Served
 * against anybody else they would be assertions about a person they were not
 * written about, which is the worst thing this file could do.
 */

import { admin } from './yoxa.ts'
import type { AppActor } from './app.ts'
import { type Block, simplePdf } from './pdf.ts'
import { approvalDraftPdf } from './fixture-pdf.ts'

/** The one record these answers are about. */
const SUBJECT = 'pt-ananya'

/**
 * What a fixture writes into `current_step`, and the marker routing excludes.
 *
 * Exported because two files depend on the exact string and a copy in each is
 * a silent divergence waiting to happen: change it here and `orca-chat` stops
 * recognising fixtures, which does not fail — it quietly starts drafting real
 * documents from canned answers again.
 */
export const CANNED_STEP = 'Fixed demonstration answer'

/**
 * What a fixture's run is called in the run list.
 *
 * The same labels `start.ts` uses, so a fixture is filed under the lane it
 * reports rather than under a second vocabulary. Naming the PDF fixture
 * "Produce" while its `workflow_name` said `fifteen` put one run under two
 * different names depending on which column a screen read.
 */
const TYPE_LABEL: Record<string, string> = {
  understand: 'Understand',
  produce: 'Produce',
  chat: 'Chat',
  fifteen: 'End-to-end support coordination',
}

/**
 * Punctuation and spacing removed before matching.
 *
 * A person typing the demonstration question will not reproduce the curly
 * apostrophe or the question mark exactly, and failing to match on that would
 * make the fixture look broken in the one situation it exists for. Word order
 * and word choice still have to be right — this normalises the typing, not the
 * question.
 */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

interface Fixture {
  /** Accepted phrasings, all normalised the same way as the incoming message. */
  asks: string[]
  /** Reported to the interface as though routing had chosen it, because it would have. */
  path: string
  lane: string
  reason: string
  answerHtml: string
  /** Present on the fixture whose output is a file rather than a reply. */
  document?: {
    title: string
    category: string
    fileName: string
    /**
     * Either the blocks to typeset, or a file that already exists.
     *
     * `blocks` is for a document this file composes. `bytes` is for one a
     * workflow already produced and that is kept verbatim -- regenerating it
     * would make it a different artefact from the one it claims to be.
     */
    blocks?: Block[]
    bytes?: () => Uint8Array
  }
}

/** The line every answer ends with. */
const MARKER =
  `<p class="o-meta">This is one of three fixed demonstration answers built into ORCA. ` +
  `It was not produced by a workflow and the record was not read to write it. ` +
  `Every other question goes to a real lane.</p>`

const FIXTURES: Fixture[] = [
  /* ------------------------------------------------- text in, text out */
  {
    asks: [
      'can you summarise my ot progress',
      'can you summarize my ot progress',
      'summarise my ot progress',
      'summarize my ot progress',
    ],
    path: 'understand_only',
    lane: 'understand',
    reason: 'Your record will be read and the answer shown here. Nothing is sent to anyone.',
    answerHtml:
      `<p>Here is what I found in your record.</p>` +
      `<h3>Occupational therapy has moved from assessment to strategies that are being tested at work.</h3>` +
      `<ul>` +
      `<li><strong>Assessment is done.</strong> Sana Iyer completed a functional assessment on ` +
      `2 May 2026 covering daily routines, workplace environment and sensory factors, and filed ` +
      `the report.</li>` +
      `<li><strong>The workplace itself was looked at.</strong> On 4 August 2026 an environmental ` +
      `observation found your desk sits on the main walkway between the kitchen and the ` +
      `stairwell, and named movement in peripheral vision as a recurring demand during focused ` +
      `work.</li>` +
      `<li><strong>One strategy is running and partly working.</strong> Written advance notice of ` +
      `schedule changes started on 21 July 2026. Your own note says a few hours of notice worked ` +
      `well and same-hour changes did not — which is a result, not a failure.</li>` +
      `<li><strong>The quiet room is being used as intended.</strong> On 12 August 2026 you used ` +
      `it for twenty minutes after an unplanned meeting and did not need to leave early.</li>` +
      `</ul>` +
      `<p>What the record does <em>not</em> contain is a follow-up occupational therapy review ` +
      `since the August observation, so there is no professional judgement on the record about ` +
      `whether the desk position has changed. That is a gap rather than a negative finding.</p>` +
      `<h4>Where this comes from</h4>` +
      `<ul>` +
      `<li>Occupational therapy assessment — Sana Iyer, 2 May 2026</li>` +
      `<li>OT environmental observation, open-plan desk position — Sana Iyer, 4 August 2026</li>` +
      `<li>Advance-notice strategy started — your own entry, 21 July 2026</li>` +
      `<li>Quiet-room use after unplanned meeting — your own entry, 12 August 2026</li>` +
      `</ul>` +
      MARKER,
  },

  /* -------------------------------------------------- text in, PDF out */
  {
    asks: [
      'prepare a formal summary of my workplace adjustments for occupational health',
      'prepare a formal summary of my workplace adjustments for occupational health please',
    ],
    path: 'fifteen_step',
    lane: 'fifteen',
    reason:
      'This is a formal document for someone outside your care team, so it goes through ' +
      'the full checks and comes back as a file you approve before it is sent.',
    answerHtml:
      `<p>The document is written and attached below. <strong>It has not been sent to anyone.</strong> ` +
      `It sits on your record as a draft awaiting your review, and occupational health will not ` +
      `see it unless you approve the disclosure.</p>` +
      `<p>It covers the two adjustments currently in place, the entries each one rests on, and ` +
      `what has been observed since each started. It deliberately does not include your ` +
      `diagnosis, your psychology sessions, or anything from your record outside work — an ` +
      `occupational health referral about adjustments does not need any of that, and including ` +
      `it would be a wider disclosure than the one you asked for.</p>` +
      `<h4>What was left out on purpose</h4>` +
      `<ul>` +
      `<li>Clinical detail from sessions with Dr Kavita Nair, beyond the one dated agreement to ` +
      `trial advance notice</li>` +
      `<li>University entries, which are not the employer's business</li>` +
      `</ul>` +
      MARKER,
    document: {
      title: 'Workplace adjustments — summary for occupational health',
      category: 'Employment',
      fileName: 'workplace-adjustments-summary.pdf',
      blocks: [
        { style: 'title', text: 'Workplace adjustments' },
        { style: 'title', text: 'Summary for occupational health' },
        {
          style: 'meta',
          text:
            'Subject: Ananya Rao. Prepared by ORCA on the instruction of Ananya Rao. ' +
            'Prepared for occupational health, Northline Technologies. ' +
            'Draft — not disclosed until approved by the subject.',
        },
        { style: 'rule' },

        { style: 'heading', text: 'What this document is' },
        {
          style: 'body',
          text:
            'A summary of the workplace adjustments currently in place for Ananya Rao, the ' +
            'evidence each one rests on, and what has been observed since it started. Every ' +
            'statement below names the record entry it comes from. Nothing here is inferred.',
        },

        { style: 'heading', text: 'Adjustments in place' },
        {
          style: 'bullet',
          text:
            'Written advance notice of meeting and schedule changes. Agreed at a review with ' +
            'Dr Kavita Nair on 28 July 2026 and started on 21 July 2026. Observed effect: a few ' +
            'hours of notice worked well; changes made within the same hour did not.',
        },
        {
          style: 'bullet',
          text:
            'Access to the second-floor quiet room. Recorded use on 12 August 2026 for twenty ' +
            'minutes following an unplanned meeting, after which the working day continued ' +
            'without an early finish.',
        },

        { style: 'heading', text: 'Environment' },
        {
          style: 'body',
          text:
            'An occupational therapy environmental observation on 4 August 2026 recorded that ' +
            'the desk is positioned on the main walkway between the kitchen and the stairwell, ' +
            'and identified movement in peripheral vision as a recurring demand during focused ' +
            'work. No change of desk position is recorded since that observation.',
        },

        { style: 'heading', text: 'Frequency of the demand being adjusted for' },
        {
          style: 'body',
          text:
            'Three sprint meetings in August 2026 moved with under thirty minutes’ notice ' +
            '(entry of 18 August 2026). A handover meeting added the same morning on 16 June ' +
            '2026 cost the remainder of that afternoon and required working late. These are the ' +
            'events the advance-notice adjustment exists to reduce.',
        },

        { style: 'heading', text: 'What is not in this document' },
        {
          style: 'body',
          text:
            'Diagnosis, psychology session content, and university records are deliberately ' +
            'excluded. They are not required to assess workplace adjustments and were not ' +
            'included in the disclosure Ananya Rao asked for.',
        },

        { style: 'rule' },
        {
          style: 'meta',
          text:
            'Sources: occupational therapy assessment, 2 May 2026 (Sana Iyer); studio brief ' +
            'change, 30 May 2026; unplanned handover meeting, 16 June 2026; advance-notice ' +
            'strategy started, 21 July 2026; session with Dr Kavita Nair, 28 July 2026; OT ' +
            'environmental observation, 4 August 2026 (Sana Iyer); quiet-room use, 12 August ' +
            '2026; meetings rescheduled at short notice, 18 August 2026.',
        },
        {
          style: 'meta',
          text:
            'This is a fixed demonstration document built into ORCA. It was not produced by a ' +
            'workflow and the record was not read to write it.',
        },
      ],
    },
  },
  /* --------------------------- text in, a real workflow file back out */
  {
    /*
     * The wording Yoxa itself was given.
     *
     * The document's own status page quotes the trigger it was produced from --
     * "i want to get something approved from kavita" -- so the fixture matches
     * that rather than a tidier sentence somebody might prefer. A fixture whose
     * question does not match the artefact's own account of its origin is a
     * fixture that contradicts itself on page one.
     */
    asks: [
      'i want to get something approved from kavita',
      'i want to get something approved from dr kavita nair',
      'i need to get something approved from kavita',
    ],
    /*
     * Understand then Produce, which is what routing chooses for a document
     * request with no recent retrieval behind it and a recipient inside the
     * care team. Kavita is a psychologist, so this never escalates to the
     * fifteen-step chain: that path is for a disclosure leaving the care
     * relationship, and this one does not leave it.
     */
    path: 'understand_then_produce',
    lane: 'produce',
    reason:
      'Your record will be read first, then a draft written from what is found. ' +
      'You see the draft before anyone else.',
    answerHtml:
      `<p>The draft is written and attached below. <strong>It has not been sent to Dr Nair ` +
      `and it has not been approved by anyone.</strong> It sits on your record awaiting your ` +
      `review.</p>` +
      `<p>It came back as a template rather than a finished message, and the document says why ` +
      `on its own second page: the request named who to ask but not what is being asked for. ` +
      `Who Kavita is in this context, what needs approving, for whom, by when, and on what ` +
      `evidence are all unconfirmed, so the draft leaves each of them as a bracket for you to ` +
      `fill rather than guessing at them.</p>` +
      `<h4>What it refused to do</h4>` +
      `<ul>` +
      `<li>Invent the subject of the approval, or who it concerns</li>` +
      `<li>Assume consent, access, or authorisation had been established</li>` +
      `<li>Present itself as approved, or as evidence that anybody had agreed</li>` +
      `</ul>` +
      `<p>Tell me what you are asking Dr Nair to approve and I can fill the brackets from your ` +
      `record instead of leaving them open.</p>` +
      MARKER,
    document: {
      title: 'Draft approval request to Dr Kavita Nair',
      category: 'Clinical',
      fileName: 'draft-approval-request-to-kavita.pdf',
      // Kept byte for byte. See fixture-pdf.ts.
      bytes: approvalDraftPdf,
    },
  },
]

/** The fixture for this question, if there is one and it is about the right record. */
export function cannedFor(message: string, patientId: string | null): Fixture | null {
  if (patientId !== SUBJECT) return null
  const asked = normalise(message)
  return FIXTURES.find((f) => f.asks.includes(asked)) ?? null
}

/**
 * Record the answer as a completed run, so everything downstream is unchanged.
 *
 * The alternative was returning the answer inline and teaching the interface a
 * sixth response shape. This writes the same row a real run writes, already
 * finished, and hands back its id — so polling, rendering, source lists,
 * attachments, the run history and the audit trail all work because none of
 * them can tell the difference. The one place that can is the row itself, which
 * records the path as a fixture.
 */
export async function serveCanned(
  fixture: Fixture,
  actor: AppActor,
  patientId: string,
  message: string,
): Promise<{ runId: string } | { error: string }> {
  const { data: run, error } = await admin
    .from('workflow_runs')
    .insert({
      patient_id: patientId,
      actor_id: actor.id,
      type: TYPE_LABEL[fixture.lane] ?? fixture.lane,
      workflow_name: fixture.lane,
      stakeholder: actor.name,
      current_step: CANNED_STEP,
      status: 'Completed',
      idempotency_key: crypto.randomUUID(),
      path: fixture.path,
      route_reason: fixture.reason,
      trigger_text: message,
      answer_html: fixture.answerHtml,
      dry_run: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !run) return { error: error?.message ?? 'could_not_record_run' }

  if (fixture.document) {
    const documentId = `doc-${crypto.randomUUID().slice(0, 8)}`
    const path = `${patientId}/${documentId}/${fixture.document.fileName}`
    const { error: upload } = await admin.storage
      .from('orca-artifacts')
      .upload(path, fixture.document.bytes?.() ?? simplePdf(fixture.document.blocks ?? []), {
        contentType: 'application/pdf',
        upsert: true,
      })

    /**
     * A failed upload leaves the answer and loses the file, deliberately.
     *
     * The text already says the document is attached, which would be a lie
     * with nothing attached — so the run is marked so the discrepancy is
     * visible rather than silently absent. Failing the whole request instead
     * would lose an answer that is otherwise correct.
     */
    if (upload) {
      await admin
        .from('workflow_runs')
        .update({ current_step: `Fixed answer stored; file could not be: ${upload.message}` })
        .eq('id', run.id)
      return { runId: run.id }
    }

    await admin.from('documents').insert({
      id: documentId,
      patient_id: patientId,
      title: fixture.document.title,
      file_type: 'PDF',
      category: fixture.document.category,
      source_label: 'ORCA demonstration',
      status: 'Awaiting review',
      extracted: [],
      // The subject and the clinicians already looking after her. Not the
      // employer: this document is about a disclosure that has not been made.
      access: ['patient', 'psychologist', 'ot'],
      storage_path: path,
      workflow_run_id: run.id,
    })
  }

  return { runId: run.id }
}
