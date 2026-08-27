$ErrorActionPreference = 'Stop'

$required = @('AZURE_SQL_SERVER', 'AZURE_SQL_DATABASE', 'AZURE_SQL_ADMIN_USER', 'AZURE_SQL_ADMIN_PASSWORD', 'AZURE_SQL_APP_PASSWORD')
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Set $name before preparing Azure SQL." }
}

$source = Get-Content (Join-Path $PSScriptRoot '..\infra\sqlserver\init.sql') -Raw
$appUser = if ($env:AZURE_SQL_APP_USER) { $env:AZURE_SQL_APP_USER } else { 'plant_app' }
$start = $source.IndexOf("IF OBJECT_ID('dbo._powersync_checkpoints'")
$end = $source.IndexOf('DECLARE @tries int')
if ($start -lt 0 -or $end -le $start) { throw 'Could not isolate the portable schema from init.sql.' }
$schema = $source.Substring($start, $end - $start)
$temp = Join-Path ([IO.Path]::GetTempPath()) ("canopy-azure-{0}.sql" -f [guid]::NewGuid())

try {
    $bootstrap = @"
IF (SELECT is_cdc_enabled FROM sys.databases WHERE name = DB_NAME()) = 0 EXEC sys.sp_cdc_enable_db;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '`$(AppUser)')
  EXEC('CREATE USER [' + '`$(AppUser)' + '] WITH PASSWORD = ''' + '`$(AppPassword)' + '''');
"@
    [IO.File]::WriteAllText($temp, $bootstrap + [Environment]::NewLine + $schema, [Text.UTF8Encoding]::new($false))
    docker run --rm -v "${temp}:/scripts/azure.sql:ro" mcr.microsoft.com/mssql-tools /opt/mssql-tools18/bin/sqlcmd `
      -C -b -S "$env:AZURE_SQL_SERVER,1433" -d $env:AZURE_SQL_DATABASE -U $env:AZURE_SQL_ADMIN_USER -P $env:AZURE_SQL_ADMIN_PASSWORD `
      -v AppUser="$appUser" AppPassword="${env:AZURE_SQL_APP_PASSWORD}" -i /scripts/azure.sql
    if ($LASTEXITCODE -ne 0) { throw 'Azure SQL schema preparation failed.' }
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}

Write-Host 'Azure SQL schema and CDC configuration completed.'
