# Deploy ORCA's own application-facing Edge Functions.
#
# Three of them: app-read, app-write and orca-chat. orca-chat is on this list
# because routing, the two demonstration answers and the PDF generator all live
# in supabase/functions/_shared, and _shared is not a deployable unit -- the CLI
# bundles it into whichever function imports it. Deploying app-read and
# app-write alone leaves a changed router sitting in git while the live chat
# keeps running the old one, which stays invisible until somebody asks a
# question and gets the wrong path back.
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
$branch = 'main'

# The functions this script owns. The connector functions Yoxa calls
# (identity-access, knowledge-evidence, workflow-state and the rest) are
# deliberately not here: they change on a different cadence, and redeploying
# them for a frontend change is how a working connector gets broken.
$functions = @('app-read', 'app-write', 'orca-chat')

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

# Deploy what is on main, which is where the merged work is. Deploying from a
# stale checkout ships old functions while the new screens call them, and that
# looks like the frontend is broken rather than the backend being behind.
Write-Host ''
Write-Host "Fetching $branch" -ForegroundColor Cyan
git fetch origin $branch
git checkout $branch
git pull origin $branch

foreach ($fn in $functions) {
  Write-Host ''
  Write-Host "Deploying $fn" -ForegroundColor Cyan
  & $cli @pre functions deploy $fn --project-ref $ref
  if ($LASTEXITCODE -ne 0) {
    throw "$fn did not deploy. Nothing after this ran."
  }
}

Write-Host ''
Write-Host 'All three deployed.' -ForegroundColor Green
Write-Host ''
Write-Host 'Two things this script does not do:'
Write-Host '  1. Apply pending migrations. Run:'
Write-Host '       npx supabase@latest db push --project-ref zievqdkhxenenpyxqese'
Write-Host '     20260901000001 turns on row-level security for the twelve'
Write-Host '     stage-1 tables, which were readable by anyone holding the'
Write-Host '     public key. Nothing reads them, so nothing breaks.'
Write-Host '  2. Rebuild and redeploy the frontend, for the interface changes.'
