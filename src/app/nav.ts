import type { Role } from '../data/types'

export interface NavItem {
  label: string
  to: string
  end?: boolean
}

/**
 * Primary navigation changes by role. The wording follows the information
 * architecture exactly — each role's navigation is its job, not a themed copy
 * of another role's.
 */
export const navByRole: Record<Role, NavItem[]> = {
  patient: [
    { label: 'Home', to: '/patient', end: true },
    { label: 'My Story', to: '/patient/story' },
    { label: 'My Profile', to: '/patient/profile' },
    { label: 'My Support', to: '/patient/support' },
    { label: 'My Care', to: '/patient/care' },
    { label: 'Work / University', to: '/patient/work' },
    { label: 'Documents', to: '/patient/documents' },
    { label: 'Connections', to: '/patient/connections' },
    { label: 'Requests', to: '/patient/requests' },
    { label: 'Progress', to: '/patient/progress' },
    { label: 'Privacy & Sharing', to: '/patient/privacy' },
  ],
  psychologist: [
    { label: 'Dashboard', to: '/psychologist', end: true },
    { label: 'Patients', to: '/psychologist/patients' },
    { label: 'Session Workspace', to: '/psychologist/session' },
    { label: 'Memory Review', to: '/psychologist/memory' },
    { label: 'Support Strategies', to: '/psychologist/strategies' },
    { label: 'Outcomes', to: '/psychologist/outcomes' },
    { label: 'Documents', to: '/psychologist/documents' },
    { label: 'Handover', to: '/psychologist/handover' },
    { label: 'Tasks', to: '/psychologist/tasks' },
    { label: 'Permissions', to: '/psychologist/permissions' },
  ],
  psychiatrist: [
    { label: 'Dashboard', to: '/psychiatrist', end: true },
    { label: 'Patients', to: '/psychiatrist/patients' },
    { label: 'Clinical Overview', to: '/psychiatrist/clinical' },
    { label: 'Timeline', to: '/psychiatrist/timeline' },
    { label: 'Appointment Preparation', to: '/psychiatrist/appointments' },
    { label: 'Documents', to: '/psychiatrist/documents' },
    { label: 'Care Coordination', to: '/psychiatrist/coordination' },
    { label: 'Follow-ups', to: '/psychiatrist/tasks' },
    { label: 'Handover', to: '/psychiatrist/handover' },
    { label: 'Permissions', to: '/psychiatrist/permissions' },
  ],
  therapist: [
    { label: 'Dashboard', to: '/therapist', end: true },
    { label: 'Patients', to: '/therapist/patients' },
    { label: 'Goals', to: '/therapist/goals' },
    { label: 'Session Workspace', to: '/therapist/session' },
    { label: 'Interventions', to: '/therapist/interventions' },
    { label: 'Outcomes', to: '/therapist/outcomes' },
    { label: 'Handover', to: '/therapist/handover' },
    { label: 'Tasks', to: '/therapist/tasks' },
  ],
  ot: [
    { label: 'Dashboard', to: '/ot', end: true },
    { label: 'Patients', to: '/ot/patients' },
    { label: 'Functional Profile', to: '/ot/functional' },
    { label: 'Environment', to: '/ot/environment' },
    { label: 'Adaptation Trials', to: '/ot/trials' },
    { label: 'Outcomes', to: '/ot/outcomes' },
    { label: 'Reports', to: '/ot/documents' },
    { label: 'Handover', to: '/ot/handover' },
  ],
  gp: [
    { label: 'Dashboard', to: '/gp', end: true },
    { label: 'Patients', to: '/gp/patients' },
    { label: 'Relevant Health Summary', to: '/gp/summary' },
    { label: 'Care Team', to: '/gp/care-team' },
    { label: 'Documents', to: '/gp/documents' },
    { label: 'Referrals', to: '/gp/referrals' },
    { label: 'Follow-ups', to: '/gp/tasks' },
  ],
  clinic: [
    { label: 'Dashboard', to: '/clinic', end: true },
    { label: 'Patients', to: '/clinic/patients' },
    { label: 'Appointments', to: '/clinic/appointments' },
    { label: 'Care Coordination', to: '/clinic/coordination' },
    { label: 'Referrals', to: '/clinic/referrals' },
    { label: 'Documents', to: '/clinic/documents' },
    { label: 'Pending Actions', to: '/clinic/pending' },
    { label: 'Access Management', to: '/clinic/access' },
  ],
  employer: [
    { label: 'Dashboard', to: '/employer', end: true },
    { label: 'Employees', to: '/employer/employees' },
    { label: 'Accommodation Requests', to: '/employer/requests' },
    { label: 'Active Accommodations', to: '/employer/active' },
    { label: 'Tasks', to: '/employer/tasks' },
    { label: 'Documents', to: '/employer/documents' },
    { label: 'Communication', to: '/employer/communication' },
  ],
  university: [
    { label: 'Dashboard', to: '/university', end: true },
    { label: 'Students', to: '/university/students' },
    { label: 'Accommodation Requests', to: '/university/requests' },
    { label: 'Approved Accommodations', to: '/university/active' },
    { label: 'Academic Support', to: '/university/support' },
    { label: 'Documents', to: '/university/documents' },
    { label: 'Tasks', to: '/university/tasks' },
  ],
  trusted: [
    { label: 'Home', to: '/trusted', end: true },
    { label: 'Shared Information', to: '/trusted/shared' },
    { label: 'Support', to: '/trusted/support' },
    { label: 'Add Observation', to: '/trusted/observation' },
    { label: 'Permissions', to: '/trusted/permissions' },
  ],
  admin: [
    { label: 'System Dashboard', to: '/admin', end: true },
    { label: 'Workflow Monitoring', to: '/admin/workflows' },
    { label: 'Audit Logs', to: '/admin/audit' },
    { label: 'Users', to: '/admin/users' },
    { label: 'Access Management', to: '/admin/access' },
    { label: 'Integrations', to: '/admin/integrations' },
  ],
}

/** Accent class per experience — one accent per experience, never per screen. */
export const accentByExperience = {
  patient: { text: 'text-brand', bg: 'bg-brand', tint: 'bg-brand-tint', border: 'border-brand' },
  clinical: {
    text: 'text-clinical',
    bg: 'bg-clinical',
    tint: 'bg-clinical-tint',
    border: 'border-clinical',
  },
  organisation: { text: 'text-org', bg: 'bg-org', tint: 'bg-org-tint', border: 'border-org' },
  trusted: { text: 'text-brand', bg: 'bg-brand', tint: 'bg-brand-tint', border: 'border-brand' },
  admin: { text: 'text-admin', bg: 'bg-admin', tint: 'bg-admin-tint', border: 'border-admin' },
} as const
