# Is there ANY way to read a finished run out of Yoxa?
#
# This is the question the whole answer path hangs on. UNDERSTAND and PRODUCE
# are locked with no API connectors, so unless Yoxa will tell us what a run
# produced, their answers stay inside Yoxa and the person never sees them.
#
# An earlier probe tried six URLs and got six 404s, but it was narrower than it
# should have been: it only used workflow_run_id, only one auth header, and
# only one URL family. The trigger response also returns trigger_attempt_id,
# and that is an equally likely handle.
#
# Read-only. Every request is a GET. Nothing is triggered, changed or deleted.
# The secret is typed at a prompt and never written to disk.

$deploymentId = Read-Host 'Deployment id'
$runId        = Read-Host 'workflow_run_id from a finished run'
$attemptId    = Read-Host 'trigger_attempt_id from the same run (Enter to skip)'
$secret       = Read-Host 'Deployment secret'

$origin = 'https://yoxa.ai'

# Every plausible shape, not just the ones that occurred to me first.
$paths = @(
  "/api/v1/public/workflow-deployments/$deploymentId/runs/$runId",
  "/api/v1/public/workflow-deployments/$deploymentId/runs/$runId/result",
  "/api/v1/public/workflow-deployments/$deploymentId/runs/$runId/output",
  "/api/v1/public/workflow-deployments/$deploymentId/runs",
  "/api/v1/public/workflow-deployments/$deploymentId/workflow-runs/$runId",
  "/api/v1/public/workflow-deployments/$deploymentId/workflow-runs",
  "/api/v1/public/workflow-deployments/$deploymentId/executions/$runId",
  "/api/v1/public/workflow-deployments/$deploymentId/results/$runId",
  "/api/v1/public/workflow-deployments/$deploymentId/outputs",
  "/api/v1/public/workflow-deployments/$deploymentId/hitl/requests",
  "/api/v1/public/workflow-deployments/$deploymentId",
  "/api/v1/public/workflow-runs/$runId",
  "/api/v1/public/runs/$runId"
)
if ($attemptId) {
  $paths += @(
    "/api/v1/public/workflow-deployments/$deploymentId/trigger-attempts/$attemptId",
    "/api/v1/public/workflow-deployments/$deploymentId/triggers/$attemptId",
    "/api/v1/public/workflow-deployments/$deploymentId/trigger/$attemptId",
    "/api/v1/public/trigger-attempts/$attemptId"
  )
}

# Two auth styles. A route that exists but rejects our header answers 401 or
# 403, not 404 — so trying both tells a missing route apart from a wrong one.
$auths = @{
  'X-Yoxa-Deployment-Secret' = @{ 'X-Yoxa-Deployment-Secret' = $secret }
  'Authorization: Bearer'    = @{ 'Authorization' = "Bearer $secret" }
}

Write-Host ''
$found = $false

foreach ($authName in $auths.Keys) {
  Write-Host "--- $authName ---" -ForegroundColor Cyan
  foreach ($path in $paths) {
    $code = 'ERR'
    try {
      $r = Invoke-WebRequest -Method Get -Uri "$origin$path" -Headers $auths[$authName] `
             -TimeoutSec 20 -ErrorAction Stop
      $code = [int]$r.StatusCode
    } catch {
      # Windows PowerShell 5.1 throws on any non-2xx and has no
      # -SkipHttpErrorCheck, so the status comes off the exception.
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    }

    $colour = switch ($code) { 200 {'Green'} 401 {'Yellow'} 403 {'Yellow'} default {'DarkGray'} }
    Write-Host ("  {0,-5} {1}" -f $code, $path) -ForegroundColor $colour

    if ($code -eq 200) {
      $found = $true
      Write-Host ''
      Write-Host "    FOUND: $authName  $path" -ForegroundColor Green
      Write-Host ''
      Write-Host $r.Content.Substring(0, [Math]::Min(900, $r.Content.Length))
      Write-Host ''
    }
  }
  Write-Host ''
}

if (-not $found) {
  Write-Host 'No readable route. Any yellow above is still useful — it means the' -ForegroundColor Yellow
  Write-Host 'route exists and only the auth was wrong, which is a small fix.'   -ForegroundColor Yellow
}
Write-Host 'Green = works. Yellow = route exists, auth wrong. Grey = no such route.' -ForegroundColor Cyan
