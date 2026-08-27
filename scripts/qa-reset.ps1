param(
    [ValidateSet('round-trip', 'team-day', 'overdraw', 'exact-fit', 'stack-lifecycle', 'powersync-round-trip', 'shortage-reasons', 'concurrent-overdraw', 'concurrent-exact-fit', 'correction-projections', 'azure-round-trip', 'azure-overdraw')]
    [string]$Scenario
)
$ErrorActionPreference = 'Stop'
$Scenario = switch ($Scenario) {
    { $_ -in @('stack-lifecycle', 'powersync-round-trip', 'azure-round-trip') } { 'round-trip'; break }
    { $_ -in @('shortage-reasons') } { 'team-day'; break }
    { $_ -in @('concurrent-overdraw', 'correction-projections', 'azure-overdraw') } { 'overdraw'; break }
    'concurrent-exact-fit' { 'exact-fit'; break }
    default { $_ }
}
$port = if ($env:APP_PORT) { $env:APP_PORT } else { '8787' }
$base = "http://127.0.0.1:$port/api"
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$date = (Get-Date '2070-01-01').AddDays([Convert]::ToInt32($suffix.Substring(0, 3), 16) % 3000).ToString('yyyy-MM-dd')

function Invoke-PocPost([string]$Path, [hashtable]$Body) {
    Invoke-RestMethod -Method Post -ContentType 'application/json' -Uri "$base$Path" -Body ($Body | ConvertTo-Json -Depth 8)
}

$product = Invoke-PocPost '/products' @{ name = "QA $Scenario $suffix" }
$plannedLot = Invoke-PocPost '/lots' @{ productId = $product.id; code = "QA-P-$suffix"; location = 'QA North house'; recordedQuantity = 30 }
$alternativeLot = Invoke-PocPost '/lots' @{ productId = $product.id; code = "QA-A-$suffix"; location = 'QA West house'; recordedQuantity = $(if ($Scenario -eq 'overdraw') { 6 } elseif ($Scenario -eq 'exact-fit') { 10 } else { 20 }) }
$plan = Invoke-PocPost '/plans' @{ serviceDate = $date; teamCount = $(if ($Scenario -eq 'round-trip') { 1 } else { 2 }); truckCount = 2 }
$detail = Invoke-RestMethod -Uri "$base/plans/$($plan.id)"
$allocation = Invoke-PocPost '/allocations' @{ truckId = $detail.trucks[0].id; lotId = $plannedLot.id; quantity = 10 }
$published = Invoke-PocPost "/plans/$($plan.id)/publish" @{}

@{
    scenario = $Scenario
    date = $date
    planId = $plan.id
    productId = $product.id
    plannedLotId = $plannedLot.id
    alternativeLotId = $alternativeLot.id
    allocationId = $allocation.id
    teams = $(if ($Scenario -eq 'round-trip') { @(1) } else { @(1, 2) })
    status = $published.status
} | ConvertTo-Json -Depth 5
