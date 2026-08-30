# Does Yoxa let us read a finished run?
#
# If it does, ORCA can poll for results and no workflow needs an output
# connector added to it. This tries the endpoint shapes Yoxa's own URLs already
# use and reports which one answers.
#
# It is read-only. Every request is a GET; nothing is triggered, changed or
# deleted. Your secret is read at the prompt and never written to disk.

$deploymentId = Read-Host 'Deployment id (the UNDERSTAND one)'
$runId        = Read-Host 'A workflow_run_id from a run that has finished'
$secret       = Read-Host 'Deployment secret'

$origin = 'https://yoxa.ai'

# Shapes worth trying, in order of how likely they look given the two endpoints
# Yoxa has already documented:
#   POST /api/v1/public/workflow-deployments/{id}/trigger
#   POST /api/v1/public/workflow-deployments/{id}/hitl/requests/{rid}/respond
# Both put the deployment first and the resource under it, so the run is most
# likely in the same place.
$candidates = @(
  "/api/v1/public/workflow-deployments/$deploymentId/runs/$runId",
  "/api/v1/public/workflow-deployments/$deploymentId/workflow-runs/$runId",
  "/api/v1/public/workflow-deployments/$deploymentId/runs/$runId/result",
  "/api/v1/public/workflow-deployments/$deploymentId/runs/$runId/output",
  "/api/v1/public/workflow-runs/$runId",
  "/api/v1/public/runs/$runId"
)

Write-Host ''
Write-Host 'Probing...' -ForegroundColor Cyan
Write-Host ''

foreach ($path in $candidates) {
  $uri = "$origin$path"
  try {
    $response = Invoke-WebRequest -Method Get -Uri $uri `
      -Headers @{ 'X-Yoxa-Deployment-Secret' = $secret } `
      -SkipHttpErrorCheck -TimeoutSec 20
    $code = $response.StatusCode
  } catch {
    $code = 'ERR'
  }

  # 200 is the prize. 401/403 still means the route EXISTS and only the auth
  # shape is wrong, which is a much smaller problem than no route at all — so
  # it is called out separately from a plain 404.
  $colour = switch ($code) {
    200     { 'Green' }
    401     { 'Yellow' }
    403     { 'Yellow' }
    default { 'DarkGray' }
  }
  Write-Host ("{0,-5} {1}" -f $code, $path) -ForegroundColor $colour

  if ($code -eq 200) {
    Write-Host ''
    Write-Host 'FOUND IT. First 600 characters of the response:' -ForegroundColor Green
    Write-Host ''
    $response.Content.Substring(0, [Math]::Min(600, $response.Content.Length))
    Write-Host ''
    break
  }
}

Write-Host ''
Write-Host 'Green = works. Yellow = route exists, auth header is wrong. Grey = no such route.' -ForegroundColor Cyan
