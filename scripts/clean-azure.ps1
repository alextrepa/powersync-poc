$ErrorActionPreference = 'Stop'
if (-not $env:AZURE_RESOURCE_GROUP -or $env:AZURE_RESOURCE_GROUP -notmatch '^canopy-powersync-poc-') {
    throw 'Refusing cleanup: AZURE_RESOURCE_GROUP must start with canopy-powersync-poc-.'
}
if ($env:AZURE_CLEAN_CONFIRM -ne $env:AZURE_RESOURCE_GROUP) {
    throw 'Set AZURE_CLEAN_CONFIRM to the exact dedicated resource-group name before cleanup.'
}
az group delete --name $env:AZURE_RESOURCE_GROUP --yes --no-wait
if ($LASTEXITCODE -ne 0) { throw 'Azure cleanup request failed.' }
Write-Host 'Azure resource-group deletion accepted. Verify completion in the Azure activity log.'
