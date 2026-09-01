# Deploy ORCA's own read and write paths.
#
# Both functions import from supabase/functions/_shared, and the CLI bundles
# that directory automatically -- there is nothing to deploy separately for it.
#
# verify_jwt is already false for both in supabase/config.toml, so no flag is
# needed here. Passing one on the command line would override the file and is
# the kind of difference that only shows up in production.
#
# Written ASCII-only with no em-dashes and no smart quotes. Windows PowerShell
# 5.1 reads a file without a BOM as ANSI, and a single stray character breaks
# parsing with an error that points at the wrong line.

$ErrorActionPreference = 'Stop'

$ref = 'zievqdkhxenenpyxqese'
$branch = 'claude/create-ui-lrq2tx'

# Installed, or borrowed for the length of this script.
#
# The CLI is not installed on every machine that has this repository, and
# "the term 'supabase' is not recognized" reads like a broken command rather
# than a missing tool. npx runs the same binary without installing it, and
# npm install -g supabase is refused by design, so this is the sanctioned
# no-install route rather than a workaround.
if (Get-Command supabase -ErrorAction SilentlyContinue) {
  $cli = 'supabase'
  $pre = @()
  Write-Host 'Using the installed Supabase CLI.' -ForegroundColor DarkGray
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  $cli = 'npx'
  $pre = @('supabase@latest')
  Write-Host 'Supabase CLI not on PATH. Running it through npx.' -ForegroundColor DarkGray
} else {
  throw 'Neither the Supabase CLI nor npx is available. Install Node, or install the CLI with: scoop bucket add supabase https://github.com/supabase/scoop-bucket.git ; scoop install supabase'
}

# Whether this machine has ever logged in. Checked before the first deploy
# rather than after, so the failure is one line about signing in instead of an
# access error in the middle of a deploy.
& $cli @pre projects list *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Not signed in. A browser will open.' -ForegroundColor Yellow
  & $cli @pre login
  if ($LASTEXITCODE -ne 0) { throw 'Sign-in did not complete. Nothing was deployed.' }
}

# The code is on the feature branch. Deploying from main would ship the old
# functions and the new screens would keep failing in a way that looks like the
# frontend is broken.
Write-Host ''
Write-Host "Fetching $branch" -ForegroundColor Cyan
git fetch origin $branch
git checkout $branch
git pull origin $branch

foreach ($fn in @('app-read', 'app-write')) {
  Write-Host ''
  Write-Host "Deploying $fn" -ForegroundColor Cyan
  & $cli @pre functions deploy $fn --project-ref $ref
  if ($LASTEXITCODE -ne 0) {
    throw "$fn did not deploy. Nothing after this ran."
  }
}

Write-Host ''
Write-Host 'Both deployed.' -ForegroundColor Green
Write-Host 'New reads:   tasks, and context on the timeline read.'
Write-Host 'New actions: add_task, update_task, update_entry, prepare_appointment,'
Write-Host '             decide_request, ask_about_request, add_strategy,'
Write-Host '             record_outcome, end_strategy, set_review_date.'
