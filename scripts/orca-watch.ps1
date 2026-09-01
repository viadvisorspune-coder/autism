# orca-watch.ps1 - what has actually reached Supabase.
#
#   .\orca-watch.ps1              one look
#   .\orca-watch.ps1 -Watch       re-check every 15 seconds until Ctrl+C
#
# Run it from the repo root so it can read the key out of .env.local:
#   .\scripts\orca-watch.ps1 -Watch
# Nothing is written; every call is a read.

param([switch]$Watch, [int]$Every = 15)

$ref = 'zievqdkhxenenpyxqese'

$envFile = Join-Path $PSScriptRoot '.env.local'
if (-not (Test-Path $envFile)) { $envFile = '.\.env.local' }
if (-not (Test-Path $envFile)) {
  Write-Host "Can't find .env.local - run this from your repo folder." -ForegroundColor Red
  return
}
$key = (Select-String -Path $envFile -Pattern 'VITE_SUPABASE_PUBLISHABLE_KEY=(.+)').Matches[0].Groups[1].Value.Trim()

$url     = "https://$ref.supabase.co/functions/v1/app-read"
$headers = @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }

function Read-Resource($resource) {
  $body = @{ resource = $resource; role = 'admin'; actor_id = 'u-tejas'; patient_id = 'pt-ananya' } | ConvertTo-Json
  try { (Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body).data }
  catch { Write-Host "  read failed: $($_.Exception.Message)" -ForegroundColor Red; $null }
}

function Show-Once {
  Clear-Host
  Write-Host "ORCA - $(Get-Date -Format 'HH:mm:ss')`n" -ForegroundColor Cyan

  $runs = (Read-Resource 'workflow_runs').runs
  if (-not $runs) { return }

  # A rehearsal says so in its own text; it is not a real answer.
  $real = $runs | Where-Object { $_.answer_html -and $_.answer_html -notmatch 'Rehearsal' }
  $open = $runs | Where-Object { $_.status -eq 'In progress' }

  Write-Host ("runs: {0}   real answers: {1}   still open: {2}" -f $runs.Count, $real.Count, $open.Count) -ForegroundColor Yellow
  Write-Host ''

  $runs | Select-Object -First 8 | ForEach-Object {
    $answered = if ($_.answer_html -and $_.answer_html -notmatch 'Rehearsal') { 'ANSWER' }
                elseif ($_.answer_html) { 'rehearsal' } else { '-' }
    $srcCount = if ($_.result.sources) { "$($_.result.sources.Count) src" } else { '' }
    $colour = switch ($answered) { 'ANSWER' { 'Green' } 'rehearsal' { 'DarkGray' } default { 'Gray' } }
    Write-Host ("  {0}  {1,-10} {2,-24} {3,-9} {4,-6} {5}" -f
      $_.started_at.Substring(5,11), $_.workflow_name, $_.path, $_.status, $answered, $srcCount) -ForegroundColor $colour
  }

  # The newest real answer, so you can read what actually came back.
  $latest = $real | Select-Object -First 1
  if ($latest) {
    Write-Host "`nlatest answer  ($($latest.workflow_name), $($latest.started_at.Substring(0,16)))" -ForegroundColor Cyan
    $plain = $latest.answer_html -replace '<[^>]+>', ' ' -replace '\s+', ' '
    Write-Host ("  " + $plain.Trim().Substring(0, [Math]::Min(260, $plain.Trim().Length)))
    if ($latest.result.sources) {
      # if/else rather than ??, which needs PowerShell 7 - this runs on 5.1 too.
      $ids = $latest.result.sources | ForEach-Object { if ($_.id) { $_.id } else { $_.item_id } }
      Write-Host "  cites: $($ids -join ', ')" -ForegroundColor DarkCyan
    } else {
      Write-Host "  cites: nothing - sources did not come through" -ForegroundColor DarkYellow
    }
  }

  # Messages in Ananya's thread, which is what she actually sees.
  $convo = Read-Resource 'conversation'
  if ($convo.messages) {
    $fromOrca = @($convo.messages | Where-Object { $_.author -eq 'orca' })
    Write-Host "`nmessages in her thread: $($convo.messages.Count)  (from ORCA: $($fromOrca.Count))" -ForegroundColor Yellow
    $fromOrca | Select-Object -Last 2 | ForEach-Object {
      $t = $_.text -replace '<[^>]+>', ' ' -replace '\s+', ' '
      Write-Host ("  {0}  {1}" -f $_.created_at.Substring(11,5), $t.Trim().Substring(0, [Math]::Min(90, $t.Trim().Length)))
    }
  }

  # Anything a Produce or 15-step run delivered as a file.
  $docs = $convo.attachments
  if ($docs) {
    Write-Host "`ndocuments delivered: $($docs.Count)" -ForegroundColor Yellow
    $docs | Select-Object -Last 3 | ForEach-Object {
      Write-Host ("  {0}  {1}" -f $_.file_type, $_.title)
    }
  }
}

if ($Watch) {
  Write-Host "watching every $Every s - Ctrl+C to stop" -ForegroundColor DarkGray
  while ($true) { Show-Once; Start-Sleep -Seconds $Every }
} else {
  Show-Once
}
