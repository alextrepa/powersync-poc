param(
    [ValidateSet('clear', 'fail-upload-before-commit', 'lost-upload-response', 'lost-correction-response')]
    [string]$Mode
)
$ErrorActionPreference = 'Stop'
$port = if ($env:APP_PORT) { $env:APP_PORT } else { '8787' }
Invoke-RestMethod -Method Post -ContentType 'application/json' -Uri "http://127.0.0.1:$port/api/diagnostics/faults" -Body (@{ mode = $Mode } | ConvertTo-Json) | ConvertTo-Json
