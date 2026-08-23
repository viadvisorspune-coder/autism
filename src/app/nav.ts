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
 * Primary navigation.
 *
 * This used to run to sixteen destinations in six groups, and roughly half of
 * them were the same record sliced a different way: a Timeline page, a
 * Documents page, an Appointment Preparation page, a Clinical Overview page —
 * each showing one table's worth of one patient, each reached from the
 * sidebar, none of them linking to the others. Choosing between sixteen things
 * to reach one person's record is not navigation, it is a quiz.
 *
 * Those slices now live inside the record itself, behind the patient's name,
 * as tabs. What is left here is only what is genuinely top-level: what needs me
 * today, who I look after, the work my own role does, and the settings I touch
 * twice a year.
 *
 * Every group answers a question a person would actually ask. Nothing was
 * deleted — the destinations that left this list are all reachable, and most of
 * them are now one click from a name rather than two from a menu.
 */

/**
 * The clinical roles share a shape: a day, a caseload, their own craft, and the
 * governance they rarely touch. Only the middle group differs, because that is
 * the only part where the job differs.
 */
function clinical(base: string, addLabel: string, craft: NavItem[]): NavGroup[] {
  return [
    {
      title: 'Today',
      items: [
        { label: 'What needs me', to: base, end: true },
        { label: 'My calendar', to: `${base}/calendar` },
      ],
    },
    {
      title: 'My caseload',
      items: [
        { label: 'People', to: `${base}/patients` },
        { label: addLabel, to: `${base}/add` },
      ],
    },
    { title: 'My work', items: craft },
    {
      title: 'Settings',
      items: [{ label: 'Who can see what', to: `${base}/permissions` }],
    },
  ]
}

/** Employers and universities do the same job under different words. */
function organisation(base: string, peopleLabel: string, activeLabel: string): NavGroup[] {
  return [
    {
      title: 'Today',
      items: [{ label: 'What needs me', to: base, end: true }],
    },
    {
      title: 'People',
      items: [
        { label: peopleLabel, to: `${base}/${peopleLabel === 'Students' ? 'students' : 'employees'}` },
        { label: 'Record something', to: `${base}/add` },
      ],
    },
    {
      title: 'Adjustments',
      items: [
        { label: 'Requests to me', to: `${base}/requests` },
        { label: activeLabel, to: `${base}/active` },
        { label: 'My tasks', to: `${base}/tasks` },
      ],
    },
  ]
}

export const navByRole: Record<Role, NavGroup[]> = {
  patient: [
    {
      title: 'Today',
      items: [
        { label: 'Home', to: '/patient', end: true },
        { label: 'My care', to: '/patient/care' },
        { label: 'Calendar', to: '/patient/calendar' },
      ],
    },
    {
      title: 'Me',
      items: [
        { label: 'My story', to: '/patient/story' },
        { label: 'About me', to: '/patient/profile' },
        { label: 'What helps', to: '/patient/support' },
        { label: 'How it is going', to: '/patient/progress' },
      ],
    },
    {
      title: 'Out in the world',
      items: [
        { label: 'Work / University', to: '/patient/work' },
        { label: 'Requests', to: '/patient/requests' },
        { label: 'My documents', to: '/patient/documents' },
      ],
    },
    {
      title: 'Who can see it',
      items: [
        { label: 'People I have shared with', to: '/patient/connections' },
        { label: 'Privacy', to: '/patient/privacy' },
      ],
    },
  ],

  psychologist: clinical('/psychologist', 'Add a session', [
    { label: 'Session workspace', to: '/psychologist/session' },
    { label: 'Support strategies', to: '/psychologist/strategies' },
    { label: 'Outcomes', to: '/psychologist/outcomes' },
    { label: 'Memory review', to: '/psychologist/memory' },
    { label: 'Handover', to: '/psychologist/handover' },
  ]),

  psychiatrist: clinical('/psychiatrist', 'Add a clinical entry', [
    { label: 'Appointment preparation', to: '/psychiatrist/appointments' },
    { label: 'Care coordination', to: '/psychiatrist/coordination' },
    { label: 'Follow-ups', to: '/psychiatrist/tasks' },
    { label: 'Handover', to: '/psychiatrist/handover' },
  ]),

  therapist: clinical('/therapist', 'Record a session', [
    { label: 'Session workspace', to: '/therapist/session' },
    { label: 'Goals', to: '/therapist/goals' },
    { label: 'Interventions', to: '/therapist/interventions' },
    { label: 'Outcomes', to: '/therapist/outcomes' },
    { label: 'Handover', to: '/therapist/handover' },
  ]),

  ot: clinical('/ot', 'Add an observation', [
    { label: 'Functional profile', to: '/ot/functional' },
    { label: 'Environment', to: '/ot/environment' },
    { label: 'Adaptation trials', to: '/ot/trials' },
    { label: 'Outcomes', to: '/ot/outcomes' },
    { label: 'Handover', to: '/ot/handover' },
  ]),

  gp: clinical('/gp', 'Add a visit', [
    { label: 'Care team', to: '/gp/care-team' },
    { label: 'Referrals', to: '/gp/referrals' },
    { label: 'Follow-ups', to: '/gp/tasks' },
  ]),

  clinic: [
    {
      title: 'Today',
      items: [
        { label: 'What needs us', to: '/clinic', end: true },
        { label: 'Appointments', to: '/clinic/appointments' },
      ],
    },
    {
      title: 'People',
      items: [
        { label: 'Patients', to: '/clinic/patients' },
        { label: 'Record something', to: '/clinic/add' },
      ],
    },
    {
      title: 'Coordination',
      items: [
        { label: 'Waiting on us', to: '/clinic/pending' },
        { label: 'Referrals', to: '/clinic/referrals' },
      ],
    },
    {
      title: 'Settings',
      items: [{ label: 'Who can see what', to: '/clinic/access' }],
    },
  ],

  employer: organisation('/employer', 'Employees', 'In place'),
  university: organisation('/university', 'Students', 'Approved'),

  trusted: [
    {
      title: 'Today',
      items: [{ label: 'Home', to: '/trusted', end: true }],
    },
    {
      title: 'Helping',
      items: [
        { label: 'Share something', to: '/trusted/add' },
        { label: 'What has been shared', to: '/trusted/shared' },
        { label: 'How to help', to: '/trusted/support' },
      ],
    },
    {
      title: 'Settings',
      items: [{ label: 'What I can see', to: '/trusted/permissions' }],
    },
  ],

  admin: [
    {
      title: 'Today',
      items: [
        { label: 'System health', to: '/admin', end: true },
        { label: 'Workflow runs', to: '/admin/workflows' },
      ],
    },
    {
      title: 'Accounts',
      items: [
        { label: 'Users', to: '/admin/users' },
        { label: 'Access', to: '/admin/access' },
      ],
    },
    {
      title: 'Accountability',
      items: [
        { label: 'Audit log', to: '/admin/audit' },
        { label: 'Integrations', to: '/admin/integrations' },
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
