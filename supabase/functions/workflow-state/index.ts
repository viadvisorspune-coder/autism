/**
 * workflow_state_service — the run's state machine.
 *
 * The orchestrator asks what may happen next; this decides and records it. A
 * step that needs a person stays open until that person acts, which is why
 * "waiting_for" is always a named human or organisation, never a component.
 */
import { admin, guard, json, list, recordAudit, str } from '../_shared/yoxa.ts'

type Purpose = 'route' | 'sufficiency' | 'define_goal' | 'governance_route' | 'execution_status' | 'close'

const HUMAN_GATES = new Set(['Awaiting approval', 'Awaiting professional review', 'Awaiting information'])

Deno.serve(
  guard(async (_req, { body }) => {
    const purpose = (str(body.purpose) ?? 'route') as Purpose
    const patientId = str(body.patient_id)
    const workflowRunId = str(body.workflow_run_id)
    const type = str(body.workflow_type) ?? 'End-to-end support coordination'
    const step = str(body.current_step)
    const requestedStatus = str(body.status)
    const waitingFor = str(body.waiting_for)
    const note = str(body.note)

    if (!patientId && !workflowRunId) {
      return json({ error: 'patient_id or workflow_run_id is required' }, 400)
    }

    // Patients are created by the application, never by a workflow run. An
    // unknown id is a typo or an upstream bug, and inventing a record for a
    // person nobody registered would be worse than refusing.
    if (patientId) {
      const { data: known } = await admin
        .from('patients')
        .select('id')
        .eq('id', patientId)
        .maybeSingle()

      if (!known) {
        return json(
          {
            error: 'patient_not_found',
            patient_id: patientId,
            fix: 'Use the id of a patient that exists in the application. Seeded ids: pt-ananya, pt-rohan, pt-farida, pt-dev, pt-neha.',
          },
          404,
        )
      }
    }

    let run: Record<string, unknown> | null = null

    if (workflowRunId) {
      const { data } = await admin.from('workflow_runs').select('*').eq('id', workflowRunId).maybeSingle()
      run = data
    }

    // The interface starts a run the moment a person presses send, so that the
    // waiting is visible from the first second. Yoxa's agents then arrive
    // without knowing that id and would otherwise open a second run for the
    // same action — leaving the person watching a row that never moves while
    // the real work happened somewhere they could not see.
    //
    // So: adopt the waiting run rather than opening another. Only one that is
    // still sitting at the trigger, for this patient, from the last ten
    // minutes — narrow enough that it cannot capture an unrelated run.
    if (!run && patientId) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: waiting } = await admin
        .from('workflow_runs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('current_step', 'Trigger received')
        .eq('waiting_for', 'Yoxa')
        .gte('started_at', tenMinutesAgo)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (waiting) {
        const { data: adopted } = await admin
          .from('workflow_runs')
          .update({
            current_step: step ?? waiting.current_step,
            waiting_for: waitingFor ?? null,
            status: requestedStatus ?? 'In progress',
            steps: [
              { label: 'Trigger received', state: 'done', detail: 'Sent to the agent layer.' },
              { label: step ?? 'Understanding the request', state: 'current', detail: note },
            ],
            updated_at: new Date().toISOString(),
          })
          .eq('id', waiting.id as string)
          .select('*')
          .single()
        run = adopted
      }
    }

    if (!run) {
      const { data, error } = await admin
        .from('workflow_runs')
        .insert({
          patient_id: patientId,
          type,
          stakeholder: str(body.stakeholder) ?? 'Patient',
          current_step: step ?? 'Trigger received',
          status: 'In progress',
          steps: [{ label: step ?? 'Trigger received', state: 'current', detail: note }],
        })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)
      run = data
    } else if (purpose === 'route') {
      /**
       * Routing that leaves something behind.
       *
       * This branch used to do nothing. `purpose: route` read the run and
       * returned it, so the tool named "Workflow Routing" — whose whole job is
       * to establish which steps are required — could not record the answer
       * anywhere a later step might find it. The decision evaporated the
       * moment it was made, which is why every step ran on everything.
       *
       * Now the plan is written into the run. Two things follow from that and
       * both matter. Later steps calling this endpoint get the plan back in
       * `steps`, so standing down becomes a fact they can read rather than an
       * instruction they might have missed. And ORCA's own interface already
       * renders `steps`, so the routing decision becomes visible to the person
       * waiting — they can see what was planned for them, which is a better
       * answer to "what is happening" than a spinner.
       *
       * Called without a plan it still just reads, exactly as before.
       */
      const plan = list(body.plan)
      const lane = str(body.lane)

      if (plan.length) {
        const steps = plan.map((label, i) => ({
          label,
          state: i === 0 ? 'current' : 'todo',
          detail: i === 0 && lane ? `Planned for the ${lane} lane.` : null,
        }))

        const { data, error } = await admin
          .from('workflow_runs')
          .update({
            current_step: plan[0],
            steps,
            updated_at: new Date().toISOString(),
          })
          .eq('id', run.id as string)
          .select('*')
          .single()
        if (error) return json({ error: error.message }, 400)
        run = data
      }
    } else {
      const steps = Array.isArray(run.steps) ? [...(run.steps as Record<string, unknown>[])] : []
      const previous = steps.find((s) => s.state === 'current')
      if (previous && step && previous.label !== step) {
        previous.state = 'done'
        previous.completedOn = new Date().toISOString().slice(0, 10)
      }
      if (step && !steps.some((s) => s.label === step)) {
        steps.push({ label: step, state: 'current', detail: note })
      }

      const closing = purpose === 'close'
      const status = closing ? 'Completed' : (requestedStatus ?? (run.status as string))

      const { data, error } = await admin
        .from('workflow_runs')
        .update({
          current_step: step ?? run.current_step,
          status,
          waiting_for: waitingFor ?? run.waiting_for,
          steps,
          goal: purpose === 'define_goal' ? (body.goal ?? run.goal) : run.goal,
          updated_at: new Date().toISOString(),
          closed_at: closing ? new Date().toISOString() : null,
          closure_reason: closing ? (str(body.closure_reason) ?? 'completed') : null,
        })
        .eq('id', run.id as string)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)
      run = data
    }

    if (!run) return json({ error: 'workflow_run_not_found' }, 404)

    const status = run.status as string
    const blocked = HUMAN_GATES.has(status)

    await recordAudit({
      actorLabel: 'ORCA Orchestrator agent',
      patientId: (run.patient_id as string) ?? patientId,
      action: `Workflow ${purpose}: ${run.current_step}`,
      record: `Workflow ${run.id}`,
      accessType: 'Write',
      why: note ?? purpose,
      result: 'Allowed',
      workflowRunId: run.id as string,
    })

    // What was planned, so every later caller reads the same list.
    const planned = (Array.isArray(run.steps) ? run.steps : []).map((x: Record<string, unknown>) =>
      String(x.label ?? ''),
    ).filter(Boolean)

    return json({
      workflow_run_id: run.id,
      patient_id: run.patient_id,
      type: run.type,
      status,
      current_step: run.current_step,
      waiting_for: run.waiting_for,
      blocked_on_human: blocked,
      next_action: blocked
        ? `Waiting for ${run.waiting_for ?? 'a person'}. No further step may run until they decide.`
        : planned.length
          ? `Planned steps: ${planned.join(', ')}. A step not on this list is not needed for this request — say so in one line and stop.`
          : 'Continue to the next workflow step.',
      steps: (Array.isArray(run.steps) ? run.steps : []).map((s: Record<string, unknown>) => ({
        label: String(s.label ?? ''),
        state: String(s.state ?? 'todo'),
        detail: s.detail ? String(s.detail) : null,
      })),
      updated_at: run.updated_at,
    })
  }),
)
