param(
    [ValidateSet('health', 'inventory', 'plans', 'operations', 'business-probe', 'powersync-checkpoint', 'round-trip', 'pickup-result', 'conflict-result', 'correction-result', 'azure-result')]
    [string]$View = 'health'
)
$ErrorActionPreference = 'Stop'
if ($View -eq 'powersync-checkpoint') {
    docker compose exec -T powersync-storage psql -U powersync -d powersync -c 'SELECT id FROM powersync.instance; SELECT count(*) AS bucket_rows FROM powersync.bucket_data;'
    if ($LASTEXITCODE -ne 0) { throw 'PowerSync storage inspection failed.' }
    exit 0
}
$port = if ($env:APP_PORT) { $env:APP_PORT } else { '8787' }
$path = switch ($View) {
    'health' { 'health' }
    'inventory' { 'lots' }
    'plans' { 'plans' }
    'operations' { 'operations' }
    'business-probe' { 'products' }
    'powersync-checkpoint' { 'health' }
    'round-trip' { 'operations' }
    'pickup-result' { 'operations' }
    'conflict-result' { 'operations' }
    'correction-result' { 'operations' }
    'azure-result' { 'operations' }
}
$result = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/$path"
$result | ConvertTo-Json -Depth 12
