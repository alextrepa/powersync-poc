$ErrorActionPreference = 'Stop'

$required = @(
    'README.md'
    'BACKLOG.md'
    'docs/product-spec.md'
    'docs/technical-design.md'
    'docs/test-plan.md'
    'tests/qa/README.md'
)

$missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
if ($missing.Count -gt 0) {
    throw "Missing required files: $($missing -join ', ')"
}

$drafts = @(Select-String -Path $required -Pattern '\bTBD\b|\[To be written\]|\[Content here\]' -AllMatches)
if ($drafts.Count -gt 0) {
    $drafts | ForEach-Object { Write-Error "$($_.Path):$($_.LineNumber): $($_.Line)" }
    throw 'Draft markers remain in the specification set.'
}

$productSpec = Get-Content -Raw 'docs/product-spec.md'
$requirementIds = @(
    [regex]::Matches($productSpec, '\*\*((?:FR|NFR)-\d{3})\*\*') |
        ForEach-Object { $_.Groups[1].Value }
)
$duplicateRequirements = @($requirementIds | Group-Object | Where-Object Count -gt 1)
if ($duplicateRequirements.Count -gt 0) {
    throw "Duplicate requirement IDs: $($duplicateRequirements.Name -join ', ')"
}

$backlog = Get-Content -Raw 'BACKLOG.md'
$taskIds = @(
    [regex]::Matches($backlog, '\*\*([A-Z]+-\d{3})\*\*') |
        ForEach-Object { $_.Groups[1].Value }
)
$duplicateTasks = @($taskIds | Group-Object | Where-Object Count -gt 1)
if ($duplicateTasks.Count -gt 0) {
    throw "Duplicate backlog IDs: $($duplicateTasks.Name -join ', ')"
}

$qaRoutineFiles = @(
    Get-ChildItem -LiteralPath 'tests/qa/routines' -Filter '*.md' -File |
        Sort-Object Name
)
if ($qaRoutineFiles.Count -eq 0) {
    throw 'Expected at least one manual QA routine.'
}

$qaRoutineIds = @()
$qaRequiredSections = @(
    '## Outcome'
    '## Preconditions'
    '## Procedure'
    '## Pass criteria'
    '## Evidence'
    '## Execution log'
)
foreach ($routine in $qaRoutineFiles) {
    $content = Get-Content -Raw -LiteralPath $routine.FullName
    $idMatch = [regex]::Match($content, '(?m)^# (QA-\d{3}): .+$')
    if (-not $idMatch.Success) {
        throw "Missing QA-NNN title in $($routine.FullName)"
    }
    $qaRoutineIds += $idMatch.Groups[1].Value

    if ($content -notmatch '(?m)^Routine state: (planned|executable|retired)$') {
        throw "Missing or invalid routine state in $($routine.FullName)"
    }
    foreach ($section in $qaRequiredSections) {
        if (-not $content.Contains($section)) {
            throw "Missing $section in $($routine.FullName)"
        }
    }
    if ($content -notmatch '(?m)^1\. .+$') {
        throw "Routine has no numbered procedure in $($routine.FullName)"
    }
}

$duplicateQaIds = @($qaRoutineIds | Group-Object | Where-Object Count -gt 1)
if ($duplicateQaIds.Count -gt 0) {
    throw "Duplicate manual QA IDs: $($duplicateQaIds.Name -join ', ')"
}

$qaIndex = Get-Content -Raw -LiteralPath 'tests/qa/README.md'
$catalogQaIds = @(
    [regex]::Matches($qaIndex, '(?m)^\| (QA-\d{3}) \|') |
        ForEach-Object { $_.Groups[1].Value }
)
$catalogDifferences = @(Compare-Object ($qaRoutineIds | Sort-Object) ($catalogQaIds | Sort-Object))
if ($catalogDifferences.Count -gt 0) {
    throw "Manual QA catalog does not match routine files: $($catalogDifferences.InputObject -join ', ')"
}

$brokenLinks = @()
$documentsToCheck = @($required | Where-Object { $_ -like '*.md' }) + @($qaRoutineFiles.FullName)
foreach ($path in $documentsToCheck) {
    $file = Get-Item -LiteralPath $path
    $content = Get-Content -Raw $file.FullName
    foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\((?!https?://)([^)#]+)(?:#[^)]+)?\)')) {
        $target = Join-Path $file.DirectoryName $match.Groups[1].Value
        if (-not (Test-Path -LiteralPath $target)) {
            $brokenLinks += "$path -> $($match.Groups[1].Value)"
        }
    }

    $fenceCount = ([regex]::Matches($content, '(?m)^```')).Count
    if ($fenceCount % 2 -ne 0) {
        throw "Unbalanced code fences in $path"
    }
}

if ($brokenLinks.Count -gt 0) {
    throw "Broken relative links: $($brokenLinks -join ', ')"
}

$scenarioCount = @(Select-String -Path 'docs/test-plan.md' -Pattern '^### Scenario:').Count
if ($scenarioCount -lt 25) {
    throw "Expected at least 25 Gherkin scenarios, found $scenarioCount."
}

Write-Host "Specification checks passed: $($requirementIds.Count) requirements, $($taskIds.Count) backlog tasks, $scenarioCount Gherkin scenarios, and $($qaRoutineFiles.Count) manual QA routines."
