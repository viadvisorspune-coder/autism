#!/usr/bin/env bash
#
# Bring a brand-new, empty Supabase project up to this repository's state:
# every migration, every Edge Function, every function secret.
#
# Creating the project itself is the one step that cannot be automated from
# here — it needs your Supabase login and a choice of organisation and region.
# Create it at https://supabase.com/dashboard/new, then run:
#
#   scripts/bootstrap-supabase.sh <project-ref>
#
# The project ref is the subdomain of the project URL:
# https://<project-ref>.supabase.co
#
# Options:
#   --seed         also load supabase/seed/*.sql (stage 1 test data).
#                  Requires DATABASE_URL to be set to the project's
#                  connection string, and psql on PATH.
#   --skip-functions   link and migrate only.

set -euo pipefail

PROJECT_REF="${1:-}"
shift || true

SEED=0
SKIP_FUNCTIONS=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --skip-functions) SKIP_FUNCTIONS=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "$PROJECT_REF" ]; then
  echo "usage: $0 <project-ref> [--seed] [--skip-functions]" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "The Supabase CLI is not installed." >&2
  echo "  brew install supabase/tap/supabase   (or see https://supabase.com/docs/guides/cli)" >&2
  exit 1
fi

# `link` needs credentials: either an interactive `supabase login` already done,
# or SUPABASE_ACCESS_TOKEN in the environment (a personal access token from
# https://supabase.com/dashboard/account/tokens).
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && ! supabase projects list >/dev/null 2>&1; then
  echo "Not authenticated with Supabase. Run 'supabase login', or set SUPABASE_ACCESS_TOKEN." >&2
  exit 1
fi

echo "==> Linking to project $PROJECT_REF"
# This rewrites project_id in supabase/config.toml, which is how every later
# command knows which project it is talking to. Commit that change afterwards.
supabase link --project-ref "$PROJECT_REF"

echo "==> Applying migrations"
# Ordered by filename, which is why they are timestamped. On an empty project
# this builds the whole schema, RLS policies, functions and base seed.
supabase db push

if [ "$SEED" -eq 1 ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "--seed needs DATABASE_URL (Project settings -> Database -> Connection string)." >&2
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "--seed needs psql on PATH." >&2
    exit 1
  fi
  # Explicit order, not a glob: the fixture has to exist before the test that
  # reads it, and alphabetical order puts them the wrong way round.
  for f in supabase/seed/stage1_test_data.sql supabase/seed/stage1_access_test.sql; do
    echo "==> Seeding $(basename "$f")"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
fi

if [ "$SKIP_FUNCTIONS" -eq 0 ]; then
  echo "==> Deploying Edge Functions"
  # Deploys every directory under supabase/functions except _shared. The
  # per-function verify_jwt = false settings come from supabase/config.toml,
  # so do not pass --no-verify-jwt here: config.toml is the record.
  supabase functions deploy

  SECRETS_FILE="supabase/.env.functions"
  if [ -f "$SECRETS_FILE" ]; then
    echo "==> Setting function secrets from $SECRETS_FILE"
    supabase secrets set --env-file "$SECRETS_FILE"
  else
    cat >&2 <<EOF

Note: $SECRETS_FILE does not exist, so no function secrets were set.
The functions are deployed but the Yoxa connectors will reject calls until
they have their tokens. Copy supabase/.env.functions.example to
$SECRETS_FILE, fill it in, and re-run:

  supabase secrets set --env-file $SECRETS_FILE

EOF
  fi
fi

cat <<EOF

==> Done. The project is at https://$PROJECT_REF.supabase.co

Remaining, by hand:

  1. Point the frontend at the new project. In .env.local:

       VITE_SUPABASE_URL=https://$PROJECT_REF.supabase.co
       VITE_SUPABASE_PUBLISHABLE_KEY=<Project settings -> API keys -> publishable>

     Both values are public by design; RLS is what enforces access. Never put
     the service_role key in this app.

  2. Commit the project_id change that 'supabase link' made to
     supabase/config.toml.

  3. If you use Yoxa, update each connector's configuration to the new
     function URLs (https://$PROJECT_REF.supabase.co/functions/v1/<name>)
     and to the same YOXA_CONNECTOR_TOKEN you set as a function secret.
EOF
