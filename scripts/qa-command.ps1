param(
    [ValidateSet('correction-payload-mismatch')]
    [string]$Scenario
)
$ErrorActionPreference = 'Stop'
$port = if ($env:APP_PORT) { $env:APP_PORT } else { '8787' }
$base = "http://127.0.0.1:$port/api"
$operations = Invoke-RestMethod -Uri "$base/operations"
$latest = $operations.corrections | Select-Object -First 1
if (-not $latest) { throw 'Create at least one correction before running the mismatch check.' }
$details = $latest.details | ConvertFrom-Json -AsHashtable
$details['note'] = "intentional payload mismatch $([guid]::NewGuid())"
$body = @{ commandId = $latest.command_id; exceptionId = $latest.exception_id; kind = $latest.kind; details = $details } | ConvertTo-Json -Depth 8
try {
    Invoke-RestMethod -Method Post -ContentType 'application/json' -Uri "$base/corrections" -Body $body | Out-Null
    throw 'The API accepted a reused correction command ID with a changed payload.'
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 409) { throw }
    Write-Host 'PASS: changed payload was rejected with HTTP 409.'
}
