/**
 * workflow_state_service — the run's state machine.
 *
 * The orchestrator asks what may happen next; this decides and records it. A
 * step that needs a person stays open until that person acts, which is why
 * "waiting_for" is always a named human or organisation, never a component.
 */
import { admin, guard, json, recordAudit, str } from '../_shared/yoxa.ts'

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

    let run: Record<string, unknown> | null = null

    if (workflowRunId) {
      const { data } = await admin.from('workflow_runs').select('*').eq('id', workflowRunId).maybeSingle()
      run = data
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
    } else if (purpose !== 'route') {
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
