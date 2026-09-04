# SPDX-License-Identifier: GPL-2.0-or-later

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = Join-Path $projectRoot 'release'
$stageRoot = Join-Path $releaseRoot 'windows-x64-stage'
$pluginRoot = Join-Path $stageRoot 'obs-3dgs'
$archivePath = Join-Path $releaseRoot 'obs-3dgs-0.1.0-beta.1-windows-x64.zip'
$checksumPath = "$archivePath.sha256"
$cmakeCommand = Get-Command cmake -ErrorAction SilentlyContinue
$cmake = if ($cmakeCommand) { $cmakeCommand.Source } else { 'C:\Program Files\CMake\bin\cmake.exe' }
if (-not (Test-Path -LiteralPath $cmake)) { throw 'CMake was not found.' }

foreach ($candidate in @($stageRoot, $archivePath, $checksumPath)) {
    $resolvedParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $candidate))
    if (-not $resolvedParent.StartsWith([System.IO.Path]::GetFullPath($releaseRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside the release directory: $candidate"
    }
    if (Test-Path -LiteralPath $candidate) {
        Remove-Item -LiteralPath $candidate -Recurse -Force
    }
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
& $cmake --install (Join-Path $projectRoot 'build_x64') --config RelWithDebInfo --prefix $stageRoot
if ($LASTEXITCODE -ne 0) { throw 'CMake install failed.' }

Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\sbom.cdx.json') -Destination (Join-Path $pluginRoot 'data\licenses\sbom.cdx.json')
Compress-Archive -LiteralPath $pluginRoot -DestinationPath $archivePath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\\', '/') })
    foreach ($required in @(
        'obs-3dgs/bin/64bit/obs-3dgs.dll',
        'obs-3dgs/data/locale/en-US.ini',
        'obs-3dgs/data/locale/zh-CN.ini',
        'obs-3dgs/data/web/index.html',
        'obs-3dgs/data/licenses/sbom.cdx.json'
    )) {
        if ($required -notin $entries) { throw "Release archive is missing $required" }
    }
    $forbidden = @($entries | Where-Object { $_ -match '(^|/)(samples|node_modules|include|lib)/|\.map$' })
    if ($forbidden.Count -gt 0) { throw "Release archive contains forbidden entries: $($forbidden -join ', ')" }
    if (@($entries | Where-Object { -not $_.StartsWith('obs-3dgs/') }).Count -gt 0) {
        throw 'Every archive entry must be inside the top-level obs-3dgs folder.'
    }
} finally {
    $archive.Dispose()
}

$fileHashCommand = Get-Command Get-FileHash -ErrorAction SilentlyContinue
if ($fileHashCommand) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
} else {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $archiveStream = [System.IO.File]::OpenRead($archivePath)
    try {
        $hash = -join ($sha256.ComputeHash($archiveStream) | ForEach-Object { $_.ToString('x2') })
    } finally {
        $archiveStream.Dispose()
        $sha256.Dispose()
    }
}
Set-Content -LiteralPath $checksumPath -Value "$hash  $(Split-Path -Leaf $archivePath)" -Encoding utf8NoBOM
Write-Host "Created $archivePath"
Write-Host "SHA-256 $hash"
