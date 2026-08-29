# Duplicating ORCA

Standing up an independent copy of this project — a new GitHub repository and a
new Supabase project behind it — so that changes in the copy touch nothing in
the original.

Two steps need credentials that only you hold: creating the GitHub repository
and creating the Supabase project. Everything after each of those is scripted
or a single command.

## 1. The GitHub repository

A fork is the wrong shape here. A fork stays attached to the parent — it shows
as "forked from", its pull requests default to targeting the original, and
GitHub keeps the two in one network. For a copy you intend to diverge from,
you want an unrelated repository that happens to share a history.

**The short way.** Use GitHub's importer at <https://github.com/new/import>:
give it `https://github.com/viadvisorspune-coder/autism` as the source, name
the new repository, pick its visibility. It copies every branch and every
commit, and the result has no link to the original.

**The explicit way**, if you would rather see what is happening. Create the new
repository empty — no README, no .gitignore, no licence, or the mirror push
will be rejected as a non-fast-forward. Then:

```bash
git clone --bare https://github.com/viadvisorspune-coder/autism.git
git -C autism.git push --mirror https://github.com/viadvisorspune-coder/<new-name>.git
rm -rf autism.git
```

`--mirror` pushes every branch and tag exactly as they are, so the copy starts
with the full history rather than a flattened snapshot.

Then point a working clone at the copy:

```bash
git clone https://github.com/viadvisorspune-coder/<new-name>.git
```

What a duplicate does **not** carry over: issues, pull requests, releases,
Actions secrets, branch protection rules, collaborators, or webhooks. Those are
repository settings rather than repository content, and they have to be set up
again on the copy if you want them.

## 2. The Supabase project

Create the project at <https://supabase.com/dashboard/new> — choose an
organisation, a region, and a database password, and save that password
somewhere you can find it. Wait for provisioning to finish.

Then, from a clone of the copy:

```bash
scripts/bootstrap-supabase.sh <project-ref>
```

The project ref is the subdomain of the project URL:
`https://<project-ref>.supabase.co`.

The script links the repository to the project, applies every migration in
`supabase/migrations/` in order, and deploys every Edge Function with the
`verify_jwt` settings recorded in `supabase/config.toml`. It needs the Supabase
CLI and either a completed `supabase login` or `SUPABASE_ACCESS_TOKEN` in the
environment.

Two flags:

- `--seed` also loads `supabase/seed/*.sql`, the stage 1 test data. Needs
  `DATABASE_URL` set to the project's connection string, and `psql`.
- `--skip-functions` links and migrates only.

### Secrets

The functions authenticate Yoxa themselves — that is why `verify_jwt` is off
for them — so they are inert until their tokens exist:

```bash
cp supabase/.env.functions.example supabase/.env.functions
# fill it in
supabase secrets set --env-file supabase/.env.functions
```

`supabase/.env.functions` is gitignored. Generate `YOXA_CONNECTOR_TOKEN` with
`openssl rand -hex 32` and paste the same value into each Yoxa connector's
configuration.

### The frontend

```bash
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` to `https://<project-ref>.supabase.co` and
`VITE_SUPABASE_PUBLISHABLE_KEY` to the publishable key from Project settings →
API keys. Both are public by design; row-level security is what enforces who
can read what. The service_role key never belongs in this app.

### Afterwards

`supabase link` rewrites `project_id` in `supabase/config.toml`. Commit that
change in the copy — it is the record of which project the copy talks to, and
leaving it pointing at the original's ref is the one mistake that quietly
undoes the separation.

If you use Yoxa, each connector's configuration also needs the new function
URLs: `https://<project-ref>.supabase.co/functions/v1/<function-name>`.
