$ErrorActionPreference = 'Stop'

$required = @('AZURE_RESOURCE_GROUP', 'AZURE_LOCATION', 'AZURE_SQL_SERVER_NAME', 'AZURE_SQL_DATABASE', 'AZURE_SQL_ADMIN_USER', 'AZURE_SQL_ADMIN_PASSWORD', 'AZURE_TESTER_IP')
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Set $name before provisioning the temporary Azure SQL gate." }
}
if ($env:AZURE_RESOURCE_GROUP -notmatch '^canopy-powersync-poc-') {
    throw 'AZURE_RESOURCE_GROUP must start with canopy-powersync-poc- so cleanup cannot target an unrelated group.'
}

az group create --name $env:AZURE_RESOURCE_GROUP --location $env:AZURE_LOCATION --output none
if ($LASTEXITCODE -ne 0) { throw 'Azure resource group provisioning failed.' }
az deployment group create --resource-group $env:AZURE_RESOURCE_GROUP --template-file (Join-Path $PSScriptRoot '..\infra\azure\main.bicep') `
  --parameters serverName=$env:AZURE_SQL_SERVER_NAME databaseName=$env:AZURE_SQL_DATABASE administratorLogin=$env:AZURE_SQL_ADMIN_USER `
  administratorLoginPassword=$env:AZURE_SQL_ADMIN_PASSWORD testerIpAddress=$env:AZURE_TESTER_IP --output table
if ($LASTEXITCODE -ne 0) { throw 'Azure SQL deployment failed.' }

Write-Host 'Temporary S3 Azure SQL database provisioned. Run just azure-prepare next; charges accrue until just azure-clean succeeds.'
