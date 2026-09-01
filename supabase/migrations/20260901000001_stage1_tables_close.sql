-- Row-level security on the stage-1 tables, which never had it.
--
-- WHAT WAS OPEN. Twelve tables were created in the stage-1 slice and no
-- `enable row level security` was ever run against any of them, while every
-- table in the original schema has had it since day one. PostgREST exposes
-- every table in `public` to the anon role, and the publishable key that
-- reaches it ships inside the browser bundle by design — so a table with no
-- RLS is a table anyone can read. Verified against the live project: an
-- anonymous GET with the public key returned real rows from `subjects`,
-- `users`, `record_items`, `consents`, `access_policies` and `runs`, including
-- a date of birth and an email address, while the same request against
-- `timeline_events`, `patients` and `documents` correctly returned nothing.
--
-- WHY ENABLING IT IS SAFE HERE. Nothing reads these tables. Not the browser —
-- it never queries a table directly, only Edge Functions — and not one of the
-- eighteen Edge Functions, connectors included. The stage-1 schema was built
-- as a parallel model and deliberately never joined to the running one, and
-- its own migration says so. So there is no policy to write yet and no caller
-- to break: RLS on with no policy means the anon and authenticated roles get
-- no rows, and the service-role key every function uses bypasses RLS as it
-- always has.
--
-- WHAT THIS DOES NOT DO. It does not decide who may read these tables when
-- they are eventually wired up. That is a policy question and it belongs with
-- the code that first needs them, written against the same helpers the
-- original schema uses (orca_owns_patient, orca_connected_to and the rest).
-- Denying everyone is the correct default until somebody has a reason to be
-- allowed, and it is the only default that fails safe.
--
-- `force` as well as `enable`: without it, the table's owner — which is the
-- role migrations run as — keeps bypassing its own policies, so a future
-- policy would be silently inert for exactly the connection most likely to be
-- used to test it.

alter table users                     enable row level security;
alter table users                     force row level security;
alter table subjects                  enable row level security;
alter table subjects                  force row level security;
alter table stakeholder_relationships enable row level security;
alter table stakeholder_relationships force row level security;
alter table record_items              enable row level security;
alter table record_items              force row level security;
alter table consents                  enable row level security;
alter table consents                  force row level security;
alter table access_policies           enable row level security;
alter table access_policies           force row level security;
alter table runs                      enable row level security;
alter table runs                      force row level security;
alter table agents_run                enable row level security;
alter table agents_run                force row level security;
alter table context_briefs            enable row level security;
alter table context_briefs            force row level security;
alter table files                     enable row level security;
alter table files                     force row level security;
alter table support_strategies        enable row level security;
alter table support_strategies        force row level security;
alter table support_outcomes          enable row level security;
alter table support_outcomes          force row level security;
