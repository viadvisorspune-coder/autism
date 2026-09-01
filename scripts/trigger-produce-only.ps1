# Trigger the PRODUCE workflow through the produce_only path, from outside the app.
#
# WHY THIS IS TWO CALLS AND NOT ONE. produce_only is not a path you can ask for.
# It is chosen when routing finds a completed UNDERSTAND run for the same actor
# and subject, less than an hour old, with an answer on it -- that recent
# retrieval is the material PRODUCE drafts from. Send a document request with no
# such run behind it and routing correctly does something else: it chains
# UNDERSTAND then PRODUCE, or refuses if the reading lane is not configured.
# PRODUCE never runs on nothing.
#
# So this makes the condition true and then relies on the real router, rather
# than forcing the lane with the `workflow` override. The override would start
# the PRODUCE deployment, but it bypasses routing entirely and reports the path
# as understand_only -- you would see the workflow fire and the record would say
# the wrong thing about why.
#
# NO SECRETS HERE. The Yoxa trigger URLs and deployment secrets live in the Edge
# Function's environment and never reach a caller. The only key this needs is
# the Supabase publishable key, which is browser-facing by design, and it is
# read from the environment rather than written into this file.
#
# Written ASCII-only with no em-dashes and no smart quotes: Windows PowerShell
# 5.1 reads a file without a BOM as ANSI, and one stray character breaks parsing
# with an error pointing at the wrong line.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base    = 'https://zievqdkhxenenpyxqese.supabase.co/functions/v1'
$actor   = 'u-ananya'
$patient = 'pt-ananya'

# Set this first, in the same shell:
#   $env:SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...'
$key = $env:SUPABASE_PUBLISHABLE_KEY
if (-not $key) {
  throw 'Set $env:SUPABASE_PUBLISHABLE_KEY first. It is the same publishable key the frontend uses; it is not a secret, but it does not belong in this file.'
}

$headers = @{ apikey = $key; Authorization = "Bearer $key" }

function Send-Orca([hashtable]$body) {
  Invoke-RestMethod -Method Post -Uri "$base/orca-chat" -Headers $headers `
    -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 4) -TimeoutSec 60
}

# ---------------------------------------------------------------- step 1 of 2
#
# A real UNDERSTAND run, so there is something for PRODUCE to draft from. The
# lane is named explicitly here because this step is setup rather than the thing
# being demonstrated, and a question that happened to route somewhere else would
# leave step 2 with nothing.

Write-Host 'Step 1: reading the record (UNDERSTAND).' -ForegroundColor Cyan
$read = Send-Orca @{
  message    = 'What has changed for me over the last six months?'
  actor_id   = $actor
  patient_id = $patient
  workflow   = 'understand'
}
Write-Host "  run $($read.run_id)"

# Yoxa is asynchronous: the trigger returns long before the answer does, and
# routing only counts a run that has an answer on it. Poll until it lands.
Write-Host 'Waiting for it to come back. Routing ignores a run with no answer.' -ForegroundColor DarkGray
$deadline = (Get-Date).AddMinutes(6)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 10
  $runs = Invoke-RestMethod -Method Post -Uri "$base/app-read" -Headers $headers `
    -ContentType 'application/json' -TimeoutSec 45 -Body (@{
      resource   = 'workflow_runs'
      role       = 'patient'
      actor_id   = $actor
      patient_id = $patient
    } | ConvertTo-Json)

  $row = $runs.data.runs | Where-Object { $_.id -eq $read.run_id } | Select-Object -First 1
  if (-not $row) { Write-Host '  not on the record yet'; continue }
  Write-Host ("  {0}  {1}" -f $row.status, $row.current_step)
  if ($row.answer_html) { $ready = $true; break }
  if ($row.status -eq 'Blocked' -or $row.status -eq 'Cancelled') {
    throw "The UNDERSTAND run ended as $($row.status): $($row.current_step). Nothing was drafted."
  }
}
if (-not $ready) {
  throw 'The UNDERSTAND run did not return an answer within six minutes. Without it a document request chains rather than taking produce_only, so nothing was sent.'
}

# ---------------------------------------------------------------- step 2 of 2
#
# The document request. No recipient is named and no formal wording is used, so
# this stays inside the care team and does not escalate to the fifteen-step
# path. Routing now finds the run above and chooses produce_only on its own.

Write-Host ''
Write-Host 'Step 2: asking for the document.' -ForegroundColor Cyan
$draft = Send-Orca @{
  message    = 'Write a summary of the last six months.'
  actor_id   = $actor
  patient_id = $patient
}

Write-Host ''
Write-Host "path     $($draft.path)"     -ForegroundColor Green
Write-Host "workflow $($draft.workflow)" -ForegroundColor Green
Write-Host "run      $($draft.run_id)"
Write-Host "reason   $($draft.reason)"

if ($draft.path -ne 'produce_only') {
  Write-Host ''
  Write-Host "Routing chose $($draft.path) rather than produce_only." -ForegroundColor Yellow
  Write-Host 'Usually the UNDERSTAND run aged past the hour, or the PRODUCE lane is not configured.'
  Write-Host 'Nothing is wrong with what ran; it is just not the path you asked to see.'
}
