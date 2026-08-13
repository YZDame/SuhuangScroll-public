param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\Suhuang Scroll",
    [string]$BinDir = "$env:LOCALAPPDATA\Suhuang\bin",
    [string]$Repository = "YZDame/SuhuangScroll-public"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($InstallDir) -or $InstallDir -eq "\" -or $InstallDir -eq $env:USERPROFILE) {
    throw "Unsafe install directory: $InstallDir"
}

if ($env:PROCESSOR_ARCHITECTURE -notin @("AMD64", "x86_64")) {
    throw "Only Windows x64 is supported."
}

if ($Version -eq "latest") {
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repository/releases/latest"
    $tag = $release.tag_name
} else {
    $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
}
$versionNumber = $tag.TrimStart("v")
$asset = "Suhuang-v$versionNumber-windows-x64.zip"
$baseUrl = "https://github.com/$Repository/releases/download/$tag"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("suhuang-" + [guid]::NewGuid())
$archive = Join-Path $tempDir $asset
$checksumPath = "$archive.sha256"
$staging = Join-Path $tempDir "staging"

try {
    New-Item -ItemType Directory -Force -Path $tempDir, $staging | Out-Null
    Invoke-WebRequest "$baseUrl/$asset" -OutFile $archive
    Invoke-WebRequest "$baseUrl/$asset.sha256" -OutFile $checksumPath

    $expected = ((Get-Content $checksumPath -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        throw "SHA256 mismatch for $asset"
    }

    Expand-Archive -Path $archive -DestinationPath $staging
    $packageRoot = Join-Path $staging "suhuang-scroll"
    if (-not (Test-Path (Join-Path $packageRoot "bin\suhuang.cmd")) -or
        -not (Test-Path (Join-Path $packageRoot "release.json"))) {
        throw "Downloaded package has an invalid layout."
    }

    $backup = "$InstallDir.previous"
    New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir -Parent) | Out-Null
    if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
    if (Test-Path $InstallDir) { Move-Item $InstallDir $backup }
    try {
        Move-Item $packageRoot $InstallDir
    } catch {
        if (Test-Path $backup) { Move-Item $backup $InstallDir }
        throw
    }
    if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }

    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    $shim = Join-Path $BinDir "suhuang.cmd"
    "@echo off`r`n`"$InstallDir\bin\suhuang.cmd`" %*`r`n" | Set-Content -Encoding ASCII $shim

    $skillsRoot = Join-Path $env:USERPROFILE ".agents\skills"
    New-Item -ItemType Directory -Force -Path $skillsRoot | Out-Null
    Get-ChildItem (Join-Path $InstallDir "skills") -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-Path (Join-Path $_.FullName "SKILL.md")) {
            $target = Join-Path $skillsRoot $_.Name
            if (-not (Test-Path $target)) {
                New-Item -ItemType Junction -Path $target -Target $_.FullName | Out-Null
            }
        }
    }

    Write-Host "Installed Suhuang Scroll $versionNumber to $InstallDir"
    Write-Host "Command shim: $shim"
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathEntries = @($userPath -split ";" | Where-Object { $_ })
    if ($BinDir -notin $pathEntries) {
        $newPath = (@($pathEntries) + $BinDir) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "Added $BinDir to the user PATH. Open a new terminal before running suhuang."
    }
    & (Join-Path $InstallDir "bin\suhuang.cmd") doctor
} finally {
    if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
}
