-- Accounts an administrator can actually manage.
--
-- The people list was a constant compiled into the interface, which meant
-- "adding a user" was a code change and the administrator screen was a
-- read-only table pretending otherwise. An administration screen that cannot
-- administer anything is worse than no screen: it implies a capability the
-- system does not have.

alter table app_users add column if not exists email text;
alter table app_users add column if not exists active boolean not null default true;

-- Deactivating is not deleting. A person who has left still appears in the
-- audit trail of everything they did, and a record that loses the identity
-- behind an action loses the point of having recorded it.
comment on column app_users.active is
  'False when the account is closed. The row stays: the audit trail refers to '
  'it, and an entry naming an id nobody can resolve is not an audit trail.';

create unique index if not exists app_users_email_idx on app_users (lower(email))
  where email is not null;

-- Backfill the sign-ins the interface has been using.
update app_users set email = v.email from (values
  ('u-ananya',   'ananya.rao@example.in'),
  ('u-kavita',   'k.nair@sahyadri.example'),
  ('u-arun',     'a.deshpande@sahyadri.example'),
  ('u-meera',    'm.joshi@sahyadri.example'),
  ('u-sana',     's.kulkarni@sahyadri.example'),
  ('u-vikram',   'v.rao@kothrudfamily.example'),
  ('u-priya',    'p.salvi@sahyadri.example'),
  ('u-anil',     'a.fernandes@northline.example'),
  ('u-ruth',     'r.menon@pid.example'),
  ('u-divya',    'divya.rao@example.in'),
  ('u-tejas',    't.bhatt@orca.example'),
  ('u-rohan',    'rohan.mehta@example.in'),
  ('u-farida',   'farida.q@example.in'),
  ('u-dev',      'dev.sharma@example.in'),
  ('u-neha',     'neha.iyer@example.in'),
  ('u-vaishali', 'v.kamat@trilight.example')
) as v(id, email)
where app_users.id = v.id and app_users.email is null;
