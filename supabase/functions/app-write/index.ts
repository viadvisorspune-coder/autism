/**
 * app_write — the decisions people make in ORCA's own interface.
 *
 * Everything here is one person deciding something about one record, so every
 * action records who decided it and why, and every one of them is visible to
 * the other people connected to that record within seconds. That last part is
 * the point: an approval that only exists in the tab that raised it is not a
 * shared decision, it is a note to self.
 *
 * DEMO BOUNDARY, same as app-read and workflow-trigger: identity is asserted
 * rather than proven while ORCA has no sign-in. Scope is still enforced here —
 * a role that may not act on a record is refused and the refusal is recorded.
 */
import { admin, cors, json, list, recordAudit, str } from '../_shared/yoxa.ts'
import { actorFromRequest, forbidden, mayActOnPatient, unauthorised } from '../_shared/app.ts'
import { type NotificationKind, notifyRoles, retireAsks } from '../_shared/notify.ts'

type Action =
  | 'propose_appointment'
  | 'answer_appointment'
  | 'edit_appointment'
  | 'raise_review'
  | 'decide_review'
  | 'decide_access_request'
  | 'withdraw_review'
  | 'say'
  | 'mark_seen'
  | 'add_user'
  | 'update_user'
  | 'set_user_active'
  | 'add_entry'
  | 'share_document'
  | 'request_access'
  | 'decide_access'
  | 'set_sharing'
  | 'add_task'
  | 'update_task'
  | 'update_entry'
  | 'prepare_appointment'
  | 'decide_request'
  | 'ask_about_request'
  | 'add_strategy'
  | 'record_outcome'
  | 'end_strategy'
  | 'set_review_date'

/**
 * Every role the record knows about.
 *
 * Mirrors the `orca_role` enum in the schema. A value outside it makes Postgres
 * reject the whole insert with a type error, which arrives at the browser as a
 * 400 saying nothing useful — so it is checked here, where the answer can name
 * what was wrong.
 */
const ROLES = new Set([
  'patient',
  'psychologist',
  'psychiatrist',
  'therapist',
  'ot',
  'gp',
  'clinic',
  'employer',
  'university',
  'trusted',
  'admin',
])

/** Only these roles may be asked to decide something clinical. */
const DECIDING_ROLES = new Set([
  'patient',
  'psychologist',
  'psychiatrist',
  'therapist',
  'ot',
  'gp',
  'clinic',
  'trusted',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const actor = await actorFromRequest(req, body)
  if (!actor) return unauthorised()

  const action = str(body.action) as Action | null
  const patientId = str(body.patient_id)
  if (!action) return json({ error: 'action is required' }, 400)

  // Managing accounts is not acting on a record, so it is gated on being an
  // administrator rather than on a connection to a patient. An administrator
  // may create an account; they still cannot read what it can see.
  if (action === 'add_user' || action === 'update_user' || action === 'set_user_active') {
    if (actor.role !== 'admin') {
      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        action: `Attempted ${action} without administrator rights`,
        record: 'Accounts',
        accessType: 'Write',
        why: 'Not an administrator',
        result: 'Denied',
      })
      return forbidden('Only an administrator can manage accounts.')
    }
    return manageAccounts(action, body, actor)
  }

  if (!patientId) return json({ error: 'patient_id is required' }, 400)

  // Checked for every action, not assumed from the role name.
  if (!(await mayActOnPatient(actor.id, patientId))) {
    await recordAudit({
      actorId: actor.id,
      actorLabel: actor.name,
      actorRole: actor.role,
      patientId,
      action: `Attempted ${action} outside their scope`,
      record: `Patient ${patientId}`,
      accessType: 'Write',
      why: 'No live connection to this record',
      result: 'Denied',
    })
    return forbidden('You do not have access to this record.')
  }

  switch (action) {
    /* ---------------------------------------------------------- raise */

    case 'raise_review': {
      const title = str(body.title)
      const reason = str(body.reason)
      if (!title || !reason) return json({ error: 'title and reason are required' }, 400)

      const assignedTo = list(body.assigned_to).filter((r) => DECIDING_ROLES.has(r))
      if (!assignedTo.length) {
        return json(
          {
            error: 'assigned_to is required',
            fix: 'Name at least one role who should decide this. A decision with nobody assigned is a decision nobody makes.',
          },
          400,
        )
      }

      const { data, error } = await admin
        .from('review_items')
        .insert({
          patient_id: patientId,
          title,
          reason,
          understanding: str(body.understanding),
          evidence: list(body.evidence),
          uncertainty: str(body.uncertainty),
          proposed_action: str(body.proposed_action),
          decision_required: str(body.decision_required) ?? 'Approve, edit, or decline',
          assigned_to: assignedTo,
          status: 'Awaiting approval',
          workflow_run_id: str(body.workflow_run_id),
        })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      await notify(
        patientId,
        assignedTo,
        `${actor.name} has asked for a decision`,
        title,
        data.id,
        'asking',
        str(body.workflow_run_id),
      )

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Raised for decision: ${title}`,
        record: `Review ${data.id}`,
        accessType: 'Write',
        why: reason,
        result: 'Allowed',
        workflowRunId: str(body.workflow_run_id),
      })

      return json({ review: data, note: `Sent to ${assignedTo.join(', ')}.` })
    }

    /* --------------------------------------------------------- decide */

    case 'decide_review': {
      const reviewId = str(body.review_id)
      const decision = str(body.decision)
      if (!reviewId || !decision) return json({ error: 'review_id and decision are required' }, 400)

      const { data: item } = await admin
        .from('review_items')
        .select('*')
        .eq('id', reviewId)
        .maybeSingle()
      if (!item) return json({ error: 'review_not_found' }, 404)
      if (item.patient_id !== patientId) {
        return json({ error: 'review_belongs_to_another_patient' }, 400)
      }

      // Only the people it was addressed to. A decision made by whoever
      // happened to be looking is not the decision that was asked for.
      const assigned = (item.assigned_to as string[]) ?? []
      if (!assigned.includes(actor.role)) {
        await recordAudit({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: `Attempted to decide a review addressed to ${assigned.join(', ')}`,
          record: `Review ${reviewId}`,
          accessType: 'Approve',
          why: 'Not the assigned decider',
          result: 'Denied',
        })
        return forbidden(
          `This was addressed to ${assigned.join(' or ')}, not to you. It is still waiting for them.`,
        )
      }

      // Already answered: say so rather than overwriting somebody's decision.
      if (item.status !== 'Awaiting approval' && item.status !== 'Awaiting professional review') {
        return json({
          review: item,
          already_decided: true,
          note: `${item.decided_by ? 'Already decided' : 'No longer open'}. Nothing was changed.`,
        })
      }

      const status = decision === 'Declined' ? 'Cancelled' : 'Completed'

      const { data, error } = await admin
        .from('review_items')
        .update({
          status,
          decision,
          decided_by: actor.id,
          decided_at: new Date().toISOString(),
          proposed_action: str(body.edited_action) ?? item.proposed_action,
        })
        .eq('id', reviewId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      // The ask goes before the answer arrives, so the inbox never holds both
      // halves of the same decision at once.
      await retireAsks(reviewId)

      // Back to whoever raised it, and to the patient, who is entitled to know
      // what was decided about them even when they were not the decider.
      await notify(
        patientId,
        ['patient', ...assigned.filter((r) => r !== actor.role)],
        `${actor.name} decided: ${decision}`,
        item.title as string,
        reviewId,
        'telling',
        (item.workflow_run_id as string) ?? null,
      )

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Decided "${item.title}": ${decision}`,
        record: `Review ${reviewId}`,
        accessType: 'Approve',
        why: str(body.note) ?? decision,
        result: 'Allowed',
        workflowRunId: (item.workflow_run_id as string) ?? null,
      })

      return json({ review: data, already_decided: false })
    }

    case 'withdraw_review': {
      const reviewId = str(body.review_id)
      if (!reviewId) return json({ error: 'review_id is required' }, 400)

      const { data, error } = await admin
        .from('review_items')
        .update({ status: 'Cancelled', decision: 'Withdrawn', decided_by: actor.id, decided_at: new Date().toISOString() })
        .eq('id', reviewId)
        .eq('patient_id', patientId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      // Withdrawn closes it as surely as decided does, and leaves nothing to
      // announce — so the ask goes and no receipt replaces it.
      await retireAsks(reviewId)

      return json({ review: data })
    }

    /* ------------------------------------------------- access requests */

    case 'decide_access_request': {
      const requestId = str(body.request_id)
      const approve = body.approve === true
      if (!requestId) return json({ error: 'request_id is required' }, 400)

      // Only the patient decides who may see their record. Not a clinician,
      // not an administrator, not ORCA.
      const { data: patient } = await admin
        .from('patients')
        .select('user_id')
        .eq('id', patientId)
        .maybeSingle()
      if (patient?.user_id !== actor.id) {
        return forbidden('Only the person whose record this is can decide who may see it.')
      }

      const { data: request } = await admin
        .from('consent_gates')
        .select('*')
        .eq('id', requestId)
        .eq('patient_id', patientId)
        .maybeSingle()
      if (!request) return json({ error: 'access_request_not_found' }, 404)
      if (request.status !== 'Pending') {
        return json({ access_request: request, already_decided: true })
      }

      const grantedScope = list(body.granted_scope)

      const { data, error } = await admin
        .from('consent_gates')
        .update({
          status: approve ? 'Approved' : 'Declined',
          decided_by: actor.id,
          decided_at: new Date().toISOString(),
          decision_note: str(body.note),
          granted_scope: approve ? (grantedScope.length ? grantedScope : (request.requested_scope as string[])) : null,
        })
        .eq('id', requestId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      // Approving a request does not itself grant anything. The connection is
      // what grants access, and writing it is a separate, deliberate act —
      // which is also what makes the consent event appear in the history.
      if (approve) {
        const { error: connectionError } = await admin.from('connections').insert({
          id: `cn-${requestId.slice(0, 8)}`,
          patient_id: patientId,
          person_id: request.requested_by,
          relationship: String(request.requested_role),
          purpose: String(request.purpose),
          access_scope: (data.granted_scope as string[]) ?? [],
          consent_given: new Date().toISOString().slice(0, 10),
          consent_status: 'Active',
          review_due: new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        })
        if (connectionError && connectionError.code !== '23505') {
          return json({ error: connectionError.message }, 400)
        }
      }

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: approve ? 'Gave access' : 'Declined a request for access',
        record: `Access request ${requestId}`,
        accessType: approve ? 'Share' : 'Revoke',
        why: str(body.note) ?? String(request.purpose),
        result: 'Allowed',
      })

      return json({ access_request: data, already_decided: false })
    }

    /* ------------------------------------------------ the conversation */

    // Everything said to ORCA and everything it says back, kept. An assistant
    // that greets someone identically every time has not been listening; it
    // has been performing listening.
    case 'say': {
      const text = str(body.text)
      const author = str(body.author) === 'orca' ? 'orca' : 'person'
      if (!text) return json({ error: 'text is required' }, 400)

      const { data: existing } = await admin
        .from('conversations')
        .select('id')
        .eq('patient_id', patientId)
        .eq('actor_id', actor.id)
        .maybeSingle()

      let conversationId = existing?.id as string | undefined
      if (!conversationId) {
        const { data: created, error } = await admin
          .from('conversations')
          .insert({ patient_id: patientId, actor_id: actor.id })
          .select('id')
          .single()
        if (error) return json({ error: error.message }, 400)
        conversationId = created.id as string
      }

      const { data, error } = await admin
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          author,
          author_id: author === 'person' ? actor.id : null,
          text,
          workflow_run_id: str(body.workflow_run_id),
        })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      await admin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

      return json({ message: data, conversation_id: conversationId })
    }

    // ------------------------------------------------------- appointments

    /**
     * Propose a time. Not book one.
     *
     * Either side can propose and either side must agree, which is the only
     * arrangement that reflects how this actually works: a clinic offering a
     * slot has not booked the person, and a person asking for one has not
     * booked the clinician. Everything starts as a proposal and becomes real
     * only when the other party accepts.
     *
     * A proposed time carries who proposed it, so the person looking at it
     * knows whether they are being asked or being told.
     */
    case 'propose_appointment': {
      const scheduledFor = str(body.scheduled_for)
      const purpose = str(body.purpose)
      const withWhom = str(body.professional_id)
      if (!scheduledFor) return json({ error: 'scheduled_for is required' }, 400)
      if (!purpose) return json({ error: 'purpose is required' }, 400)

      const { data, error } = await admin
        .from('appointments')
        .insert({
          id: `ap-${crypto.randomUUID().slice(0, 8)}`,
          patient_id: patientId,
          professional_id: withWhom ?? (actor.role === 'patient' ? null : actor.id),
          scheduled_for: scheduledFor,
          purpose,
          location: str(body.location) ?? 'To be confirmed',
          // Proposed, not booked. The status language is shared across the
          // whole system, and "awaiting stakeholder" is what this is.
          status: 'Awaiting stakeholder',
          preparation_status: 'Not started',
          questions: [],
        })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: 'Proposed an appointment',
        record: `Appointment ${data.id}`,
        accessType: 'Write',
        why: purpose,
        result: 'Allowed',
      })

      return json({ appointment: data, note: 'Proposed. It is not booked until the other person agrees.' })
    }

    /** Accept, decline, or suggest a different time. */
    case 'answer_appointment': {
      const appointmentId = str(body.appointment_id)
      const answer = str(body.answer)
      if (!appointmentId) return json({ error: 'appointment_id is required' }, 400)
      if (!answer || !['accept', 'decline', 'reschedule'].includes(answer)) {
        return json({ error: 'answer must be accept, decline or reschedule' }, 400)
      }

      const patch: Record<string, unknown> =
        answer === 'accept'
          ? { status: 'Active' }
          : answer === 'decline'
            ? { status: 'Cancelled' }
            : { status: 'Awaiting stakeholder', scheduled_for: str(body.scheduled_for) }

      if (answer === 'reschedule' && !str(body.scheduled_for)) {
        return json({ error: 'scheduled_for is required to suggest a different time' }, 400)
      }

      const { data, error } = await admin
        .from('appointments')
        .update(patch)
        .eq('id', appointmentId)
        .eq('patient_id', patientId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Appointment ${answer === 'accept' ? 'accepted' : answer === 'decline' ? 'declined' : 'moved'}`,
        record: `Appointment ${appointmentId}`,
        accessType: 'Write',
        why: str(body.reason) ?? '',
        result: 'Allowed',
      })

      return json({ appointment: data })
    }

    /** Change the details of one already agreed. Time changes go back to proposal. */
    case 'edit_appointment': {
      const appointmentId = str(body.appointment_id)
      if (!appointmentId) return json({ error: 'appointment_id is required' }, 400)

      const patch: Record<string, unknown> = {}
      if (str(body.purpose)) patch.purpose = str(body.purpose)
      if (str(body.location)) patch.location = str(body.location)
      if (Array.isArray(body.questions)) patch.questions = body.questions
      // Moving a time un-agrees it. Somebody who agreed to Tuesday has not
      // agreed to Thursday, and silently sliding it would be the kind of
      // unannounced change this whole record exists to prevent.
      if (str(body.scheduled_for)) {
        patch.scheduled_for = str(body.scheduled_for)
        patch.status = 'Awaiting stakeholder'
      }
      if (!Object.keys(patch).length) return json({ error: 'nothing to change' }, 400)

      const { data, error } = await admin
        .from('appointments')
        .update(patch)
        .eq('id', appointmentId)
        .eq('patient_id', patientId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      return json({
        appointment: data,
        note: patch.scheduled_for
          ? 'The time changed, so it needs agreeing again.'
          : 'Updated.',
      })
    }

    /**
     * A professional putting something into the record.
     *
     * The platform read in one direction until now. A psychologist finishing a
     * session had nowhere to write it up, which meant the thing this record
     * most needs — what a clinician actually observed, in the week it happened
     * — arrived late, second-hand, or not at all.
     *
     * Three rules hold here and none of them is negotiable.
     *
     * It is attributed. `source_id` is the person who wrote it and
     * `source_label` says so in words, so nothing in a patient's history is
     * ever anonymous.
     *
     * Its standing depends on who wrote it. A clinician's note is
     * professionally documented; a trusted person's observation is reported.
     * Flattening those two into one confidence level is how a family member's
     * impression ends up quoted back as a clinical finding.
     *
     * And it does not change the patient's own profile. Writing a note is not
     * a decision about somebody. If the author asks for the longer picture to
     * be revisited, that becomes a *proposal* a human still has to accept —
     * the same rule that governs every other route into this record.
     */
    /**
     * Sharing a document with people who are already connected.
     *
     * The one action in this product that actually moves information across a
     * boundary, so it is the one that must leave the most behind. Three
     * writes, not one: the document's access list changes, its own sharing
     * history gains a line, and the disclosure log gains a row. All three
     * because a person asking "who has this?" and a person asking "what has
     * been released about me?" are different questions, and each is asked from
     * a different screen.
     *
     * Recipients are named as roles, because that is how the person thinks
     * about it — "my psychologist", not a user id. Each role is resolved to
     * somebody they have already connected with live consent. A role with no
     * live connection is not an error and not silently dropped: it comes back
     * in `refused`, with the reason, so the interface can say who did not
     * receive it rather than implying everybody did.
     */
    case 'share_document': {
      const documentId = str(body.document_id)
      const wanted = list(body.recipients).map((r) => String(r).toLowerCase())
      const purpose = str(body.purpose) ?? 'Shared by the person this record is about'
      if (!documentId) return json({ error: 'document_id is required' }, 400)
      if (!wanted.length) return json({ error: 'recipients is required' }, 400)

      const { data: doc } = await admin
        .from('documents')
        .select('id, title, access, sharing_history')
        .eq('id', documentId)
        .eq('patient_id', patientId)
        .maybeSingle()
      if (!doc) return json({ error: 'document_not_found', document_id: documentId }, 404)

      // Only people the patient has already connected, and only while that
      // consent is live. Sharing cannot be the thing that creates a
      // relationship — that decision belongs on the connections screen, where
      // it is made deliberately rather than as a side effect of sending a file.
      const { data: links } = await admin
        .from('connections')
        .select('person_id, consent_status, review_due')
        .eq('patient_id', patientId)
      const live = (links ?? []).filter(
        (l) =>
          l.consent_status === 'Active' &&
          (!l.review_due || new Date(String(l.review_due)) >= new Date()),
      )
      const { data: people } = live.length
        ? await admin
            .from('app_users')
            .select('id, name, role, organisation')
            .in('id', live.map((l) => String(l.person_id)))
        : { data: [] as Record<string, unknown>[] }

      const granted: { role: string; id: string; name: string }[] = []
      const refused: { role: string; reason: string }[] = []
      for (const role of wanted) {
        const match = (people ?? []).find((p) => String(p.role) === role)
        if (match) granted.push({ role, id: String(match.id), name: String(match.name) })
        else
          refused.push({
            role,
            reason: 'Nobody in that role has a live connection to this record.',
          })
      }

      if (!granted.length) {
        await recordAudit({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: `Tried to share ${doc.title}`,
          record: `Document ${doc.id}`,
          accessType: 'Share',
          why: 'None of the named recipients hold a live connection.',
          result: 'Denied',
        })
        return json({ error: 'no_live_recipients', refused }, 403)
      }

      const today = new Date().toISOString().slice(0, 10)
      const history = Array.isArray(doc.sharing_history) ? doc.sharing_history : []
      const additions = granted.map((g) => ({
        date: today,
        recipient: g.name,
        purpose,
      }))
      const access = [...new Set([...(doc.access ?? []), ...granted.map((g) => g.role)])]

      const { error: updateError } = await admin
        .from('documents')
        .update({ access, sharing_history: [...history, ...additions] })
        .eq('id', doc.id)
      if (updateError) return json({ error: updateError.message }, 400)

      for (const g of granted) {
        await admin.from('disclosures').insert({
          patient_id: patientId,
          recipient: g.name,
          recipient_id: g.id,
          purpose,
          content_scope: [String(doc.title)],
          items_shared: [String(doc.title)],
          approved_by: actor.id,
        })
        await recordAudit({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: `Shared ${doc.title} with ${g.name}`,
          record: `Document ${doc.id}`,
          accessType: 'Share',
          why: purpose,
          result: 'Allowed',
        })
      }

      return json({
        document_id: doc.id,
        title: doc.title,
        shared_with: granted,
        refused,
        note: 'Recorded in the disclosure log and on the document itself. It can be revoked from Privacy.',
      })
    }

    case 'add_entry': {
      const kind = str(body.kind)
      const kindLabel = str(body.kind_label) ?? 'Entry'
      const fields = (body.fields ?? {}) as Record<string, unknown>
      if (!kind) return json({ error: 'kind is required' }, 400)

      // Written by a professional means professionally documented. Written by
      // somebody close to them means reported. Both are worth having; they are
      // not worth the same.
      const evidence = actor.role === 'trusted' ? 'Reported' : 'Professionally documented'
      const category = CATEGORY_FOR[actor.role] ?? 'Clinical'

      // The first substantial thing they wrote is the summary. Better than a
      // generated one: it is their sentence, and they can see it above.
      const written = Object.entries(fields)
        .filter(([name, value]) => !SKIP_IN_SUMMARY.has(name) && typeof value === 'string' && value.trim())
        .map(([name, value]) => `${label(name)}: ${String(value).trim()}`)

      if (!written.length) return json({ error: 'nothing was written' }, 400)

      const { data: event, error } = await admin
        .from('timeline_events')
        .insert({
          id: `ev-${crypto.randomUUID().slice(0, 8)}`,
          patient_id: patientId,
          occurred_on: str(body.occurred_on) ?? null,
          title: `${kindLabel} — ${actor.name}`,
          category,
          source_id: actor.id,
          source_label: `${actor.name}${actor.role ? `, ${actor.role}` : ''}`,
          summary: written.slice(0, 3).join('\n'),
          context: written.length > 3 ? written.slice(3).join('\n') : null,
          evidence,
          status: 'Recorded',
          visible_to: VISIBLE_TO[actor.role] ?? ['patient'],
        })
        .select('id')
        .single()

      if (error) return json({ error: error.message }, 400)

      /**
       * A file added to the record is a document, not only a timeline entry.
       *
       * It used to be only the entry, so an upload appeared in the history and
       * then could not be found, opened or shared — there was no row for it in
       * the table the whole document layer reads. Somebody who had just
       * attached a letter and asked to share it was told, correctly and
       * uselessly, that nothing matched.
       *
       * Visible to the patient alone until they decide otherwise. Sharing is a
       * separate action with its own audit line, and it should never be
       * something a file does by arriving.
       */
      let documentId: string | null = null
      if (kind === 'document') {
        const title = String((fields.title as string) ?? kindLabel)
        const { data: doc } = await admin
          .from('documents')
          .insert({
            id: `doc-${crypto.randomUUID().slice(0, 8)}`,
            patient_id: patientId,
            title,
            file_type: title.toLowerCase().endsWith('.pdf')
              ? 'PDF'
              : /\.(png|jpe?g|gif|webp|heic)$/i.test(title)
                ? 'Image'
                : /\.docx?$/i.test(title)
                  ? 'DOCX'
                  : 'Structured',
            category: String((fields.category as string) ?? 'Personal'),
            source_id: actor.id,
            source_label: actor.name,
            status: 'Uploaded',
            // Nothing has read it, and the record should say so rather than
            // leaving a reader to assume the blank means nothing was found.
            extracted: [],
            related_event_ids: [event.id],
            access: ['patient'],
          })
          .select('id')
          .single()
        documentId = doc ? String(doc.id) : null
      }

      // Asked for, never assumed. And it is a proposal: what somebody wrote
      // this afternoon does not get to rewrite who a person is.
      let proposed = false
      if (body.propose === true) {
        const { error: proposalError } = await admin.from('memory_candidates').insert({
          patient_id: patientId,
          proposal: `From ${actor.name}'s ${kindLabel.toLowerCase()}: ${written[0]}`,
          confidence: 0.5,
          evidence: [{ label: kindLabel, source: actor.name, event_id: event.id }],
          related_history: 'Added from a professional entry; not yet checked against the rest of the record.',
          raised_for: ['patient'],
          status: 'Pending',
        })
        proposed = !proposalError
      }

      let followUp = false
      if (body.follow_up === true) {
        const { error: taskError } = await admin.from('tasks').insert({
          patient_id: patientId,
          title: `Follow up: ${kindLabel.toLowerCase()} of ${str(body.occurred_on) ?? 'today'}`,
          detail: str(fields.follow_up) ?? written[0],
          for_roles: [actor.role],
          status: 'Active',
        })
        followUp = !taskError
      }

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Added a ${kindLabel.toLowerCase()} to the record`,
        record: `Event ${event.id}`,
        accessType: 'Write',
        why: written[0].slice(0, 200),
        result: 'Allowed',
      })

      return json({
        event_id: event.id,
        document_id: documentId,
        proposed,
        follow_up: followUp,
        note: proposed
          ? 'Saved under your name. ORCA will propose what it changes about the longer picture; nothing is added to their profile until somebody agrees to it.'
          : 'Saved under your name.',
      })
    }

    // Stamped when someone leaves, so next time ORCA can say what changed
    // rather than making them re-read a page they have already read.
    case 'mark_seen': {
      const { error } = await admin
        .from('user_visits')
        .upsert(
          { user_id: actor.id, patient_id: patientId, last_seen_at: new Date().toISOString() },
          { onConflict: 'user_id,patient_id' },
        )
      if (error) return json({ error: error.message }, 400)
      return json({ seen: true })
    }

    /* ----------------------------------------------------------- tasks
     *
     * Open items, which is the thing every professional here was doing in a
     * notebook. A clinician reads an answer and thinks "someone should chase
     * that"; a coordinator's entire job is the list of those. The table has
     * existed since the first migration and nothing has ever written to it.
     *
     * ADDRESSED TO A ROLE, NEVER TO A PERSON. "The occupational therapist needs
     * to set a review date" survives that occupational therapist going on
     * leave; the same task addressed by id becomes invisible the moment
     * somebody changes job, which is exactly when it matters most that it did
     * not. `for_roles` is the column that has always said so.
     *
     * NOT CLINICAL CONTENT. A task is a note about work, and it is deliberately
     * not written into the timeline: an open item is not a fact about somebody's
     * life and does not belong in the record of one.
     */
    case 'add_task': {
      const title = str(body.title)
      if (!title) return json({ error: 'title is required' }, 400)

      const asked = Array.isArray(body.for_roles) ? (body.for_roles as unknown[]).map(String) : []
      const forRoles = asked.filter((r) => ROLES.has(r))
      // Falls back to the person raising it rather than to a default role.
      // A task assigned to nobody is a task nobody sees; a task assigned to a
      // role chosen by this function is one somebody else is now expected to do
      // because of a line of code.
      if (!forRoles.length && actor.role) forRoles.push(String(actor.role))
      if (!forRoles.length) return json({ error: 'for_roles is required' }, 400)

      const { data, error } = await admin
        .from('tasks')
        .insert({
          patient_id: patientId,
          title,
          detail: str(body.detail) ?? null,
          due_on: str(body.due_on) ?? null,
          for_roles: forRoles,
          status: 'Active',
        })
        .select('id')
        .single()

      if (error) return json({ error: error.message }, 400)
      return json({
        task_id: data?.id ?? null,
        note: `Open for ${forRoles.join(', ')}. This is not part of the clinical record.`,
      })
    }

    /**
     * Closing one, or handing it to a different role.
     *
     * `Completed` and `Cancelled` are both endings and the record keeps which:
     * "this was done" and "this stopped mattering" are different facts about a
     * piece of work, and collapsing them loses the only interesting half.
     */
    case 'update_task': {
      const id = str(body.task_id)
      if (!id) return json({ error: 'task_id is required' }, 400)

      const patch: Record<string, unknown> = {}
      const status = str(body.status)
      if (status) {
        if (!['Active', 'Completed', 'Cancelled'].includes(status)) {
          return json({ error: 'status must be Active, Completed or Cancelled' }, 400)
        }
        patch.status = status
      }
      if (Array.isArray(body.for_roles)) {
        const forRoles = (body.for_roles as unknown[]).map(String).filter((r) => ROLES.has(r))
        if (!forRoles.length) return json({ error: 'for_roles must name a real role' }, 400)
        patch.for_roles = forRoles
      }
      if (str(body.due_on)) patch.due_on = str(body.due_on)

      /**
       * Chasing, which is a coordinator's whole job and had no record.
       *
       * Appended rather than replacing, and dated, because the useful fact is
       * not that somebody chased — it is that they chased three times and
       * nothing happened, which is the thing you take to a meeting. A field
       * that overwrites loses exactly that.
       */
      const chase = str(body.chase)
      if (chase) {
        const { data: existing } = await admin
          .from('tasks')
          .select('detail')
          .eq('id', id)
          .maybeSingle()
        patch.detail = [
          String(existing?.detail ?? '').trim(),
          `Chased ${new Date().toISOString().slice(0, 10)} by ${actor.name}: ${chase}`,
        ]
          .filter(Boolean)
          .join('\n')
      }

      if (!Object.keys(patch).length) return json({ error: 'nothing to change' }, 400)

      const { error } = await admin.from('tasks').update(patch).eq('id', id)
      if (error) return json({ error: error.message }, 400)
      return json({ updated: true })
    }

    /**
     * Correcting a note you have just written.
     *
     * TWENTY-FOUR HOURS, AND ONLY YOUR OWN. The window is short because the
     * thing being allowed is fixing a typo or a sentence that came out wrong
     * while it was being written — not revising what you thought last March
     * once you know how it turned out. After a day, the way to change a record
     * is to add to it, which is what everything else here does.
     *
     * NOTHING IS DESTROYED. The previous text is kept on the entry with the
     * time it was replaced, so the current version reads first and the earlier
     * one is still there. An edit that erases what was said is indistinguishable
     * from the note never having said it, and in a record that exists to show
     * what was known and when, that is the one thing an edit must not be.
     */
    case 'update_entry': {
      const entryId = str(body.entry_id)
      const what = str(body.what)
      if (!entryId || !what) return json({ error: 'entry_id and what are required' }, 400)

      const { data: entry } = await admin
        .from('timeline_events')
        .select('id, patient_id, source_id, summary, context, recorded_on')
        .eq('id', entryId)
        .maybeSingle()
      if (!entry) return json({ error: 'entry_not_found' }, 404)
      if (entry.patient_id !== patientId) {
        return json({ error: 'entry_belongs_to_another_patient' }, 400)
      }

      // Yours only. Editing somebody else's note is not a correction, it is a
      // rewrite of what they said — and the way to disagree with a colleague's
      // entry is to write your own.
      if (entry.source_id !== actor.id) {
        await recordAudit({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: 'Attempted to edit an entry written by somebody else',
          record: `Entry ${entryId}`,
          accessType: 'Write',
          why: 'Not the author',
          result: 'Denied',
        })
        return forbidden(
          'This was written by somebody else. You can add your own entry saying what you think is wrong with it, but you cannot change theirs.',
        )
      }

      const written = Date.parse(String(entry.recorded_on ?? ''))
      const age = Number.isFinite(written) ? Date.now() - written : Infinity
      if (age > 24 * 60 * 60 * 1000) {
        return json(
          {
            error: 'too_old',
            fix: 'This was written more than a day ago. Add a new entry saying what has changed — the record keeps both, which is what makes it worth anything later.',
          },
          400,
        )
      }

      const kept = [
        String(entry.context ?? '').trim(),
        `Replaced ${new Date().toISOString().slice(0, 16).replace('T', ' ')}: ${entry.summary}`,
      ]
        .filter(Boolean)
        .join('\n\n')

      const { error } = await admin
        .from('timeline_events')
        .update({ summary: what, context: kept })
        .eq('id', entryId)
      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: 'Corrected their own entry within a day of writing it',
        record: `Entry ${entryId}`,
        accessType: 'Write',
        why: str(body.reason) ?? 'Correction',
        result: 'Allowed',
      })

      return json({
        updated: true,
        note: 'The earlier wording is kept on the entry. Nothing was erased.',
      })
    }

    /**
     * The questions somebody wants to ask at an appointment.
     *
     * The column has been there since the first migration and nothing has ever
     * written to it. This is the smallest feature in the product and possibly
     * the most useful one in it: the reason people leave appointments without
     * asking the thing they came to ask is not that they forgot it, it is that
     * recalling it while somebody is talking at you is a different and much
     * harder task than having written it down.
     *
     * NOT SENT ANYWHERE. These are notes to self, visible to the person and to
     * the clinician they are for — which is the point, because a clinician who
     * can see the list before the room can plan around it. Nothing is
     * disclosed by writing one and nobody is notified.
     */
    case 'prepare_appointment': {
      const appointmentId = str(body.appointment_id)
      if (!appointmentId) return json({ error: 'appointment_id is required' }, 400)

      const questions = Array.isArray(body.questions)
        ? (body.questions as unknown[]).map(String).map((q) => q.trim()).filter(Boolean)
        : []

      const { data, error } = await admin
        .from('appointments')
        .update({
          questions,
          // Three states rather than a boolean: "not started", "in progress"
          // and "ready" are different things to a person deciding whether they
          // have done enough, and a checkbox collapses the middle one.
          preparation_status: questions.length ? 'In progress' : 'Not started',
        })
        .eq('id', appointmentId)
        .eq('patient_id', patientId)
        .select('id, questions, preparation_status')
        .single()
      if (error) return json({ error: error.message }, 400)

      return json({
        appointment: data,
        note: 'Kept with the appointment. Nothing was sent and nobody was told.',
      })
    }

    /* -------------------------------------------------- accommodations
     *
     * An employer's actual job, which the interface gave him no way to do.
     * Anil received a chat box and nothing to do with what it told him — but
     * his job is receiving a request, deciding on it, putting it in place and
     * reviewing it, and only the first of those existed.
     *
     * APPROVE IN PART IS NOT A COURTESY. Real accommodation decisions are
     * rarely yes or no: three days at home is refusable where two is not, and a
     * binary forces the whole request to fail on the half that could not be
     * met. Forcing that binary produces worse outcomes for the person than a
     * partial yes with a reason, so the partial is a first-class answer here
     * rather than a decline with an apology attached.
     *
     * EVERY DECISION ENTERS HER RECORD, WITH HIS NAME ON IT. An accommodation
     * decision is a fact about somebody's working life and belongs in the
     * record of it — filed as employer-reported, which is the honest weight,
     * and readable next to what the clinical side says. That pairing is the
     * whole contradiction-detection case, working rather than described.
     */
    case 'decide_request': {
      const requestId = str(body.request_id)
      const decision = str(body.decision)
      const reason = str(body.reason)
      if (!requestId || !decision) return json({ error: 'request_id and decision are required' }, 400)
      if (!['Approved', 'Approved in part', 'Declined'].includes(decision)) {
        return json({ error: 'decision must be Approved, Approved in part or Declined' }, 400)
      }
      // A partial or a refusal without a reason is a decision the person cannot
      // respond to, appeal, or plan around. Approval needs no justification;
      // the other two do.
      if (decision !== 'Approved' && !reason) {
        return json(
          {
            error: 'reason is required',
            fix: 'A partial or declined decision without a reason cannot be responded to or appealed. Say what could not be met and why.',
          },
          400,
        )
      }

      const { data: request } = await admin
        .from('requests')
        .select('id, patient_id, title, requested_adjustment, destination_role, status')
        .eq('id', requestId)
        .maybeSingle()
      if (!request) return json({ error: 'request_not_found' }, 404)
      if (request.patient_id !== patientId) {
        return json({ error: 'request_belongs_to_another_patient' }, 400)
      }
      // Addressed to a role. Somebody deciding a request that was sent to
      // somebody else is not the decision that was asked for.
      if (String(request.destination_role) !== actor.role) {
        await recordAudit({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: `Attempted to decide a request addressed to ${request.destination_role}`,
          record: `Request ${requestId}`,
          accessType: 'Approve',
          why: 'Not the addressee',
          result: 'Denied',
        })
        return forbidden(
          `This was sent to the ${request.destination_role}, not to you. It is still waiting for them.`,
        )
      }

      const { error } = await admin
        .from('requests')
        .update({
          status: decision === 'Declined' ? 'Cancelled' : 'Completed',
          implementation: str(body.implementation) ?? null,
          review_date: str(body.review_date) ?? null,
          steps: [
            ...((request as Record<string, unknown>).steps as unknown[] ?? []),
            {
              at: new Date().toISOString(),
              by: actor.name,
              role: actor.role,
              decision,
              reason: reason ?? null,
            },
          ],
        })
        .eq('id', requestId)
      if (error) return json({ error: error.message }, 400)

      // Into her record, with his name on it.
      await admin.from('timeline_events').insert({
        id: `ev-${crypto.randomUUID().slice(0, 8)}`,
        patient_id: patientId,
        occurred_on: new Date().toISOString().slice(0, 10),
        title: `${decision}: ${request.title}`,
        category: actor.role === 'university' ? 'University' : 'Work',
        source_id: actor.id,
        source_label: `${actor.name}${actor.role ? `, ${actor.role}` : ''}`,
        summary: [
          request.requested_adjustment ? `Requested: ${request.requested_adjustment}` : null,
          `Decision: ${decision}`,
          reason ? `Reason: ${reason}` : null,
          str(body.implementation) ? `In place: ${str(body.implementation)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        evidence: 'Reported',
        status: 'Recorded',
        visible_to: ['patient', actor.role],
      })

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `${decision}: ${request.title}`,
        record: `Request ${requestId}`,
        accessType: 'Approve',
        why: reason ?? 'Approved as asked',
        result: 'Allowed',
      })

      return json({
        decided: true,
        note: 'This is now in their record, with your name on it. They can see what you decided and why.',
      })
    }

    /**
     * Asking a question about a request instead of deciding it.
     *
     * The fourth answer, and the one that keeps a bad decision from being
     * forced. An employer who cannot tell whether "a quieter space" means a
     * room or a corner should be able to ask rather than guess — and the
     * question goes to the person, not to their clinician, because what is
     * being asked about is what they need rather than why they need it.
     */
    case 'ask_about_request': {
      const requestId = str(body.request_id)
      const question = str(body.question)
      if (!requestId || !question) return json({ error: 'request_id and question are required' }, 400)

      const { data: request } = await admin
        .from('requests')
        .select('id, patient_id, title, clarifications')
        .eq('id', requestId)
        .maybeSingle()
      if (!request) return json({ error: 'request_not_found' }, 404)
      if (request.patient_id !== patientId) {
        return json({ error: 'request_belongs_to_another_patient' }, 400)
      }

      const { error } = await admin.from('request_clarifications').insert({
        id: `rc-${crypto.randomUUID().slice(0, 8)}`,
        request_id: requestId,
        asked_on: new Date().toISOString().slice(0, 10),
        asked_by_label: `${actor.name}${actor.role ? `, ${actor.role}` : ''}`,
        question,
      })
      if (error) return json({ error: error.message }, 400)

      await admin.from('requests').update({ status: 'Awaiting information' }).eq('id', requestId)

      return json({
        asked: true,
        note: 'Sent to them, not to their clinician. Nothing was decided and the request is still open.',
      })
    }

    /* ------------------------------------------------------ strategies
     *
     * An occupational therapist's job is a loop: propose something, wait, find
     * out whether it worked, adapt or stop. The tables for it have been there
     * since the first migration and the loop had no interface — it existed only
     * as rows somebody else had seeded.
     *
     * THE OUTCOME IS THE POINT, AND IT IS THE HALF THAT GOES MISSING. Anybody
     * can record a plan. What makes a strategy worth anything later is whether
     * it helped, said in the same three words every time so a year of them can
     * be read as a line rather than as forty paragraphs.
     *
     * A REVIEW DATE IS A DATE, NOT A REMINDER. Nothing chases it and nobody is
     * notified when it passes; the screen shows what is overdue and a person
     * decides. Saying so is the difference between a tool somebody trusts and
     * one they assume is watching for them.
     */
    case 'add_strategy': {
      const title = str(body.title)
      const goal = str(body.goal)
      if (!title || !goal) return json({ error: 'title and goal are required' }, 400)

      const { data, error } = await admin
        .from('strategies')
        .insert({
          id: `st-${crypto.randomUUID().slice(0, 8)}`,
          patient_id: patientId,
          title,
          goal,
          rationale: str(body.rationale) ?? null,
          conditions: str(body.conditions) ?? null,
          success_criteria: str(body.success_criteria) ?? null,
          starts_on: str(body.starts_on) ?? null,
          duration_weeks: typeof body.duration_weeks === 'number' ? body.duration_weeks : null,
          review_date: str(body.review_date) ?? null,
          environment: str(body.environment) ?? null,
          owner_id: actor.id,
          status: 'Active',
          phase: 'Trial',
        })
        .select('id')
        .single()

      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Started a strategy: ${title}`,
        record: `Strategy ${data?.id}`,
        accessType: 'Write',
        why: goal,
        result: 'Allowed',
      })

      return json({
        strategy_id: data?.id ?? null,
        note: str(body.review_date)
          ? `Review date set. Nothing chases it — it appears here as overdue when it passes.`
          : 'No review date set. Without one this stays open until somebody ends it.',
      })
    }

    /**
     * What happened when it was tried.
     *
     * Three words and a sentence. The three words are constrained by the table
     * and deliberately: an outcome written freehand every time cannot be read
     * across a year, and "worked quite well I think" and "helped" are the same
     * finding recorded two ways.
     */
    case 'record_outcome': {
      const strategyId = str(body.strategy_id)
      const note = str(body.note)
      const helpfulness = str(body.helpfulness)
      if (!strategyId || !note || !helpfulness) {
        return json({ error: 'strategy_id, note and helpfulness are required' }, 400)
      }
      if (!['Helped', 'Partly helped', 'Did not help'].includes(helpfulness)) {
        return json({ error: 'helpfulness must be Helped, Partly helped or Did not help' }, 400)
      }

      // The strategy has to belong to this record. Without the check, a
      // strategy id from another person's record would take an outcome written
      // about somebody else entirely.
      const { data: strategy } = await admin
        .from('strategies')
        .select('id, patient_id, title')
        .eq('id', strategyId)
        .maybeSingle()
      if (!strategy) return json({ error: 'strategy_not_found' }, 404)
      if (strategy.patient_id !== patientId) {
        return json({ error: 'strategy_belongs_to_another_patient' }, 400)
      }

      const { error } = await admin.from('strategy_checkins').insert({
        strategy_id: strategyId,
        recorded_on: str(body.recorded_on) ?? new Date().toISOString().slice(0, 10),
        note,
        helpfulness,
        reported_by: actor.id,
      })
      if (error) return json({ error: error.message }, 400)

      return json({ recorded: true, note: `Recorded against ${strategy.title}.` })
    }

    /**
     * Ending one, with the reason kept.
     *
     * "Stopped because it worked and is now just how she does it" and "stopped
     * because it made mornings worse" are opposite findings, and a status alone
     * records neither. The reason goes in as a final outcome so it sits at the
     * end of the same line as everything else that was ever observed about it.
     */
    case 'end_strategy': {
      const strategyId = str(body.strategy_id)
      const reason = str(body.reason)
      if (!strategyId || !reason) return json({ error: 'strategy_id and reason are required' }, 400)

      const { data: strategy } = await admin
        .from('strategies')
        .select('id, patient_id, title')
        .eq('id', strategyId)
        .maybeSingle()
      if (!strategy) return json({ error: 'strategy_not_found' }, 404)
      if (strategy.patient_id !== patientId) {
        return json({ error: 'strategy_belongs_to_another_patient' }, 400)
      }

      const helpfulness = str(body.helpfulness)
      if (helpfulness && ['Helped', 'Partly helped', 'Did not help'].includes(helpfulness)) {
        await admin.from('strategy_checkins').insert({
          strategy_id: strategyId,
          recorded_on: new Date().toISOString().slice(0, 10),
          note: `Ended: ${reason}`,
          helpfulness,
          reported_by: actor.id,
        })
      }

      const { error } = await admin
        .from('strategies')
        .update({ status: 'Completed', phase: 'Ended' })
        .eq('id', strategyId)
      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Ended a strategy: ${strategy.title}`,
        record: `Strategy ${strategyId}`,
        accessType: 'Write',
        why: reason,
        result: 'Allowed',
      })

      return json({ ended: true })
    }

    /** Moving the review date, which is the most common edit and the only one. */
    case 'set_review_date': {
      const strategyId = str(body.strategy_id)
      const reviewDate = str(body.review_date)
      if (!strategyId || !reviewDate) {
        return json({ error: 'strategy_id and review_date are required' }, 400)
      }
      const { error } = await admin
        .from('strategies')
        .update({ review_date: reviewDate })
        .eq('id', strategyId)
        .eq('patient_id', patientId)
      if (error) return json({ error: error.message }, 400)
      return json({ updated: true, note: 'Nothing chases this date. It shows here when it passes.' })
    }

    /* --------------------------------------------------------- consent
     *
     * Three actions, and between them they are the whole consent model as
     * something that happens rather than something that is described.
     *
     * None of them moves any information. `request_access` records that
     * somebody wants to be able to ask; `decide_access` records the subject's
     * answer; `set_sharing` records the subject withdrawing or restoring
     * access wholesale. What each one changes is what the NEXT question is
     * allowed to do — and that check happens where questions are asked, not
     * here.
     */

    /**
     * Somebody asking the subject for a part of the record they cannot see.
     *
     * Raised at the gate, by the person who was stopped. Their own words are
     * kept because the subject is being asked to weigh a purpose, and "Sana
     * wants clinical access" is not a purpose — "what medication is she on"
     * is.
     */
    case 'request_access': {
      const domain = str(body.domain)
      if (!domain) return json({ error: 'domain is required' }, 400)

      // One open request per person per domain. Asking twice is not two
      // decisions, and a queue of identical cards is a way of wearing
      // somebody down into saying yes.
      const { data: already } = await admin
        .from('consent_gates')
        .select('id')
        .eq('patient_id', patientId)
        .eq('person_id', actor.id)
        .eq('domain', domain)
        .eq('status', 'pending')
        .maybeSingle()
      if (already) {
        return json({ request_id: already.id, note: 'You have already asked for this. It is waiting.' })
      }

      const { data: created, error } = await admin
        .from('consent_gates')
        .insert({
          patient_id: patientId,
          person_id: actor.id,
          person_name: actor.name,
          person_role: actor.role,
          domain,
          question: str(body.question),
        })
        .select('id')
        .single()
      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: 'Asked for access to a part of the record',
        record: `Consent gate ${created.id}`,
        accessType: 'Read',
        why: `${domain}: ${str(body.question) ?? 'no reason given'}`,
        result: 'Allowed',
      })

      await notifyRoles({
        patientId,
        kind: 'asking' as NotificationKind,
        what: `${actor.name} has asked to see part of your record`,
        why: str(body.question) ?? `They want access to ${domain} information.`,
        roles: ['patient'],
      })

      return json({
        request_id: created.id,
        note: 'Asked. Nothing was read, and nothing will be unless they agree.',
      })
    }

    /**
     * The subject answering. Only the subject.
     *
     * A clinician cannot approve their own colleague's request, and an
     * administrator cannot approve any of them — the entire value of the gate
     * is that the person it protects is the one who opens it.
     */
    case 'decide_access': {
      if (actor.role !== 'patient') {
        return forbidden('Only the person whose record it is can answer this.')
      }
      const requestId = str(body.request_id)
      const decision = str(body.decision)
      if (!requestId) return json({ error: 'request_id is required' }, 400)
      if (decision !== 'granted' && decision !== 'declined') {
        return json({ error: 'decision must be granted or declined' }, 400)
      }

      const { data: updated, error } = await admin
        .from('consent_gates')
        .update({ status: decision, decided_at: new Date().toISOString(), decided_by: actor.id })
        .eq('id', requestId)
        .eq('patient_id', patientId)
        .eq('status', 'pending')
        .select('id, person_id, domain')
        .maybeSingle()
      if (error) return json({ error: error.message }, 400)
      if (!updated) {
        return json({ error: 'not_pending', fix: 'That request has already been answered.' }, 409)
      }

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: decision === 'granted' ? 'Granted access' : 'Declined access',
        record: `Consent gate ${updated.id}`,
        accessType: decision === 'granted' ? 'Share' : 'Revoke',
        why: `${updated.domain} for ${updated.person_id}`,
        result: 'Allowed',
      })

      return json({
        decision,
        note:
          decision === 'granted'
            ? 'They can ask about this now. You can stop it at any time in Sharing.'
            : 'Declined. Nothing was read, and they are told only that you declined.',
      })
    }

    /**
     * The subject withdrawing or restoring access wholesale.
     *
     * Recorded as an event with a time rather than as a flag, because
     * withdrawing consent and later restoring it is a history somebody may
     * need to account for — and a boolean flipped back and forth keeps none.
     */
    case 'set_sharing': {
      if (actor.role !== 'patient') {
        return forbidden('Only the person whose record it is can change who can see it.')
      }
      const personId = str(body.person_id)
      const sharing = body.sharing === true
      if (!personId) return json({ error: 'person_id is required' }, 400)

      if (sharing) {
        const { error } = await admin
          .from('sharing_stops')
          .update({ resumed_at: new Date().toISOString() })
          .eq('patient_id', patientId)
          .eq('person_id', personId)
          .is('resumed_at', null)
        if (error) return json({ error: error.message }, 400)
      } else {
        const { data: open } = await admin
          .from('sharing_stops')
          .select('id')
          .eq('patient_id', patientId)
          .eq('person_id', personId)
          .is('resumed_at', null)
          .maybeSingle()
        if (!open) {
          const { error } = await admin
            .from('sharing_stops')
            .insert({ patient_id: patientId, person_id: personId, decided_by: actor.id })
          if (error) return json({ error: error.message }, 400)
        }
      }

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: sharing ? 'Started sharing again' : 'Stopped sharing',
        record: `Person ${personId}`,
        accessType: sharing ? 'Share' : 'Revoke',
        why: 'Decided by the person whose record it is.',
        result: 'Allowed',
      })

      return json({
        sharing,
        note: sharing
          ? 'They can see their part of your record again.'
          : 'They can see nothing. Anything already shared stays in their own notes.',
      })
    }

    default:
      return json({ error: 'unknown_action', action }, 400)
  }
})

/**
 * Which shelf a role's entries belong on.
 *
 * An OT's observation is functional, an employer's is about work. Filing them
 * all as "Clinical" would make a patient's timeline read as though every part
 * of their life were a medical event, which is the exact framing this product
 * exists to avoid.
 */
const CATEGORY_FOR: Record<string, string> = {
  psychologist: 'Clinical',
  psychiatrist: 'Clinical',
  therapist: 'Support',
  ot: 'Functional',
  gp: 'Clinical',
  clinic: 'Appointments',
  employer: 'Work',
  university: 'University',
  trusted: 'Personal',
}

/**
 * Who can see it, decided by who wrote it.
 *
 * An employer writes about a workplace adjustment and that is between them and
 * the person; it does not join the clinical record. The patient is on every
 * list, always, because it is their record and there is no entry here they are
 * not entitled to read.
 */
const VISIBLE_TO: Record<string, string[]> = {
  psychologist: ['patient', 'psychologist', 'psychiatrist', 'therapist', 'ot', 'gp'],
  psychiatrist: ['patient', 'psychologist', 'psychiatrist', 'gp'],
  therapist: ['patient', 'psychologist', 'therapist', 'ot'],
  ot: ['patient', 'psychologist', 'therapist', 'ot'],
  gp: ['patient', 'gp', 'psychologist', 'psychiatrist'],
  clinic: ['patient', 'clinic', 'psychologist'],
  employer: ['patient', 'employer'],
  university: ['patient', 'university'],
  trusted: ['patient', 'trusted'],
}

/** Structural fields. Repeating them in the summary tells nobody anything. */
const SKIP_IN_SUMMARY = new Set(['patient', 'date', 'stage'])

/** `patient_reported` is a column name. "Patient reported" is a sentence. */
function label(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A decision nobody is told about is a decision nobody acts on.
 *
 * The category, the instruction and the link all used to be written here as
 * constants, which made every notification an approval request pointing at the
 * patient's own screen — wrong for the receipt written when a review closes,
 * and wrong for every clinician it was addressed to. They live in
 * _shared/notify.ts now, worked out from the kind and the recipient.
 *
 * The review id used to be discarded here — `void reviewId`, on the reasoning
 * that a notification is a thing a person reads and an id belongs in the audit
 * trail. True, and it cost the inbox its only way to find the ask again once
 * somebody had answered it, so spent questions never left. It is stored.
 */
const notify = (
  patientId: string,
  roles: string[],
  what: string,
  detail: string,
  reviewId: string,
  kind: NotificationKind = 'asking',
  workflowRunId: string | null = null,
) => notifyRoles({ patientId, roles, kind, what, why: detail, workflowRunId, reviewId })


/* --------------------------------------------------------------- accounts */

/**
 * Creating, editing and closing accounts.
 *
 * Closing is not deleting. A person who has left still appears in the audit
 * trail of everything they did, and an entry naming an id nobody can resolve
 * is not an audit trail — so the row stays and is marked inactive.
 */
async function manageAccounts(
  action: 'add_user' | 'update_user' | 'set_user_active',
  body: Record<string, unknown>,
  actor: { id: string; name: string; role: string },
): Promise<Response> {
  if (action === 'add_user') {
    const name = str(body.name)
    const role = str(body.user_role)
    const email = str(body.email)
    if (!name || !role || !email) {
      return json({ error: 'name, user_role and email are required' }, 400)
    }

    const id = str(body.user_id) ?? `u-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${crypto.randomUUID().slice(0, 4)}`

    const { data, error } = await admin
      .from('app_users')
      .insert({
        id,
        name,
        role,
        email: email.toLowerCase(),
        title: str(body.title),
        organisation: str(body.organisation),
        pronouns: str(body.pronouns),
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return json({ error: 'That email already has an account.' }, 409)
      }
      return json({ error: error.message }, 400)
    }

    await recordAudit({
      actorId: actor.id,
      actorLabel: actor.name,
      actorRole: actor.role,
      action: `Created an account for ${name} (${role})`,
      record: `User ${id}`,
      accessType: 'Write',
      why: str(body.reason) ?? 'Account created by an administrator',
      result: 'Allowed',
    })

    // Creating an account grants nothing. Access to any record still requires
    // that patient to make a connection, which is theirs alone to make.
    return json({
      user: data,
      note: `${name} can now sign in. They can see nothing until a patient gives them access.`,
    })
  }

  if (action === 'update_user') {
    const id = str(body.user_id)
    if (!id) return json({ error: 'user_id is required' }, 400)

    const patch: Record<string, unknown> = {}
    for (const field of ['name', 'title', 'organisation', 'pronouns'] as const) {
      const value = str(body[field])
      if (value !== null) patch[field] = value
    }
    const email = str(body.email)
    if (email) patch.email = email.toLowerCase()
    const role = str(body.user_role)
    if (role) patch.role = role

    if (!Object.keys(patch).length) return json({ error: 'nothing to change' }, 400)

    const { data, error } = await admin
      .from('app_users')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return json({ error: error.message }, 400)

    await recordAudit({
      actorId: actor.id,
      actorLabel: actor.name,
      actorRole: actor.role,
      action: `Changed the account for ${data.name}`,
      record: `User ${id}`,
      accessType: 'Write',
      why: Object.keys(patch).join(', '),
      result: 'Allowed',
    })

    return json({ user: data })
  }

  const id = str(body.user_id)
  const active = body.active === true
  if (!id) return json({ error: 'user_id is required' }, 400)

  const { data, error } = await admin
    .from('app_users')
    .update({ active })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return json({ error: error.message }, 400)

  await recordAudit({
    actorId: actor.id,
    actorLabel: actor.name,
    actorRole: actor.role,
    action: active ? `Reopened the account for ${data.name}` : `Closed the account for ${data.name}`,
    record: `User ${id}`,
    accessType: active ? 'Write' : 'Revoke',
    why: str(body.reason) ?? 'Administrator action',
    result: 'Allowed',
  })

  return json({
    user: data,
    note: active
      ? `${data.name} can sign in again.`
      : `${data.name} can no longer sign in. Their history stays in the audit trail.`,
  })
}
