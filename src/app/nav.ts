import type { Role } from '../data/types'

export interface NavItem {
  label: string
  to: string
  end?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

/**
 * Primary navigation, grouped.
 *
 * A flat list of eleven destinations makes someone read all eleven to find
 * one. Grouping them under what they are FOR — the record, the clinical work,
 * who can see it — means the heading answers most of the question before any
 * item is read.
 *
 * The wording follows each role's own job, not the system's model of it: a
 * psychologist has a caseload, an employer has adjustments, an administrator
 * has accountability. Every destination in the flat version is still here and
 * nothing new was invented; they have only been sorted.
 */
export const navByRole: Record<Role, NavGroup[]> = {
  patient: [
    {
      title: 'Overview',
      items: [
      { label: 'Home', to: '/patient', end: true },
      ],
    },
    {
      title: 'My record',
      items: [
      { label: 'My Story', to: '/patient/story' },
      { label: 'My Profile', to: '/patient/profile' },
      { label: 'Documents', to: '/patient/documents' },
      ],
    },
    {
      title: 'My support',
      items: [
      { label: 'My Support', to: '/patient/support' },
      { label: 'My Care', to: '/patient/care' },
      { label: 'Calendar', to: '/patient/calendar' },
      { label: 'Progress', to: '/patient/progress' },
      ],
    },
    {
      title: 'Out in the world',
      items: [
      { label: 'Work / University', to: '/patient/work' },
      { label: 'Requests', to: '/patient/requests' },
      ],
    },
    {
      title: 'Who can see it',
      items: [
      { label: 'Connections', to: '/patient/connections' },
      { label: 'Privacy & Sharing', to: '/patient/privacy' },
      ],
    },
  ],
  psychologist: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/psychologist', end: true },
      ],
    },
    {
      title: 'Caseload',
      items: [
      { label: 'Patients', to: '/psychologist/patients' },
      { label: 'Session Workspace', to: '/psychologist/session' },
      { label: 'Calendar', to: '/psychologist/calendar' },
      ],
    },
    {
      title: 'Clinical work',
      items: [
      { label: 'Memory Review', to: '/psychologist/memory' },
      { label: 'Support Strategies', to: '/psychologist/strategies' },
      { label: 'Outcomes', to: '/psychologist/outcomes' },
      { label: 'Documents', to: '/psychologist/documents' },
      ],
    },
    {
      title: 'Coordination',
      items: [
      { label: 'Handover', to: '/psychologist/handover' },
      { label: 'Tasks', to: '/psychologist/tasks' },
      ],
    },
    {
      title: 'Governance',
      items: [
      { label: 'Permissions', to: '/psychologist/permissions' },
      ],
    },
  ],
  psychiatrist: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/psychiatrist', end: true },
      ],
    },
    {
      title: 'Caseload',
      items: [
      { label: 'Patients', to: '/psychiatrist/patients' },
      { label: 'Calendar', to: '/psychiatrist/calendar' },
      { label: 'Clinical Overview', to: '/psychiatrist/clinical' },
      { label: 'Timeline', to: '/psychiatrist/timeline' },
      ],
    },
    {
      title: 'Clinical work',
      items: [
      { label: 'Appointment Preparation', to: '/psychiatrist/appointments' },
      { label: 'Documents', to: '/psychiatrist/documents' },
      ],
    },
    {
      title: 'Coordination',
      items: [
      { label: 'Care Coordination', to: '/psychiatrist/coordination' },
      { label: 'Follow-ups', to: '/psychiatrist/tasks' },
      { label: 'Handover', to: '/psychiatrist/handover' },
      ],
    },
    {
      title: 'Governance',
      items: [
      { label: 'Permissions', to: '/psychiatrist/permissions' },
      ],
    },
  ],
  therapist: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/therapist', end: true },
      ],
    },
    {
      title: 'Caseload',
      items: [
      { label: 'Patients', to: '/therapist/patients' },
      { label: 'Session Workspace', to: '/therapist/session' },
      { label: 'Calendar', to: '/therapist/calendar' },
      ],
    },
    {
      title: 'Clinical work',
      items: [
      { label: 'Goals', to: '/therapist/goals' },
      { label: 'Interventions', to: '/therapist/interventions' },
      { label: 'Outcomes', to: '/therapist/outcomes' },
      ],
    },
    {
      title: 'Coordination',
      items: [
      { label: 'Handover', to: '/therapist/handover' },
      { label: 'Tasks', to: '/therapist/tasks' },
      ],
    },
  ],
  ot: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/ot', end: true },
      ],
    },
    {
      title: 'Caseload',
      items: [
      { label: 'Patients', to: '/ot/patients' },
      { label: 'Calendar', to: '/ot/calendar' },
      ],
    },
    {
      title: 'Assessment',
      items: [
      { label: 'Functional Profile', to: '/ot/functional' },
      { label: 'Environment', to: '/ot/environment' },
      ],
    },
    {
      title: 'Adaptation',
      items: [
      { label: 'Adaptation Trials', to: '/ot/trials' },
      { label: 'Outcomes', to: '/ot/outcomes' },
      ],
    },
    {
      title: 'Coordination',
      items: [
      { label: 'Reports', to: '/ot/documents' },
      { label: 'Handover', to: '/ot/handover' },
      ],
    },
  ],
  gp: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/gp', end: true },
      ],
    },
    {
      title: 'Caseload',
      items: [
      { label: 'Patients', to: '/gp/patients' },
      { label: 'Calendar', to: '/gp/calendar' },
      { label: 'Relevant Health Summary', to: '/gp/summary' },
      ],
    },
    {
      title: 'Coordination',
      items: [
      { label: 'Care Team', to: '/gp/care-team' },
      { label: 'Referrals', to: '/gp/referrals' },
      { label: 'Follow-ups', to: '/gp/tasks' },
      ],
    },
    {
      title: 'Records',
      items: [
      { label: 'Documents', to: '/gp/documents' },
      ],
    },
  ],
  clinic: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/clinic', end: true },
      ],
    },
    {
      title: 'People',
      items: [
      { label: 'Patients', to: '/clinic/patients' },
      ],
    },
    {
      title: 'Scheduling',
      items: [
      { label: 'Appointments', to: '/clinic/appointments' },
      { label: 'Pending Actions', to: '/clinic/pending' },
      ],
    },
    {
      title: 'Coordination',
      items: [
      { label: 'Care Coordination', to: '/clinic/coordination' },
      { label: 'Referrals', to: '/clinic/referrals' },
      ],
    },
    {
      title: 'Records',
      items: [
      { label: 'Documents', to: '/clinic/documents' },
      ],
    },
    {
      title: 'Governance',
      items: [
      { label: 'Access Management', to: '/clinic/access' },
      ],
    },
  ],
  employer: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/employer', end: true },
      ],
    },
    {
      title: 'People',
      items: [
      { label: 'Employees', to: '/employer/employees' },
      ],
    },
    {
      title: 'Adjustments',
      items: [
      { label: 'Accommodation Requests', to: '/employer/requests' },
      { label: 'Active Accommodations', to: '/employer/active' },
      ],
    },
    {
      title: 'Working on it',
      items: [
      { label: 'Tasks', to: '/employer/tasks' },
      { label: 'Communication', to: '/employer/communication' },
      ],
    },
    {
      title: 'Records',
      items: [
      { label: 'Documents', to: '/employer/documents' },
      ],
    },
  ],
  university: [
    {
      title: 'Overview',
      items: [
      { label: 'Dashboard', to: '/university', end: true },
      ],
    },
    {
      title: 'People',
      items: [
      { label: 'Students', to: '/university/students' },
      ],
    },
    {
      title: 'Adjustments',
      items: [
      { label: 'Accommodation Requests', to: '/university/requests' },
      { label: 'Approved Accommodations', to: '/university/active' },
      { label: 'Academic Support', to: '/university/support' },
      ],
    },
    {
      title: 'Working on it',
      items: [
      { label: 'Tasks', to: '/university/tasks' },
      ],
    },
    {
      title: 'Records',
      items: [
      { label: 'Documents', to: '/university/documents' },
      ],
    },
  ],
  trusted: [
    {
      title: 'Overview',
      items: [
      { label: 'Home', to: '/trusted', end: true },
      ],
    },
    {
      title: 'What is shared',
      items: [
      { label: 'Shared Information', to: '/trusted/shared' },
      ],
    },
    {
      title: 'Helping',
      items: [
      { label: 'Support', to: '/trusted/support' },
      { label: 'Add Observation', to: '/trusted/observation' },
      ],
    },
    {
      title: 'Governance',
      items: [
      { label: 'Permissions', to: '/trusted/permissions' },
      ],
    },
  ],
  admin: [
    {
      title: 'Overview',
      items: [
      { label: 'System Dashboard', to: '/admin', end: true },
      ],
    },
    {
      title: 'Operations',
      items: [
      { label: 'Workflow Monitoring', to: '/admin/workflows' },
      { label: 'Integrations', to: '/admin/integrations' },
      ],
    },
    {
      title: 'Accounts',
      items: [
      { label: 'Users', to: '/admin/users' },
      { label: 'Access Management', to: '/admin/access' },
      ],
    },
    {
      title: 'Accountability',
      items: [
      { label: 'Audit Logs', to: '/admin/audit' },
      ],
    },
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
