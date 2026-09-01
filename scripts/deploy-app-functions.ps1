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
  supabase functions deploy $fn --project-ref $ref
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
