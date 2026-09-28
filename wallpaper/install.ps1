# Hearthglass Windows Installer
# Builds the wallpaper agent (or, from a release zip, takes the prebuilt one), installs it
# to %LOCALAPPDATA%\Programs\Hearthglass with its own copy of the scenes, and starts it
# now and at every login.
param(
    [switch]$NoStartup = $false
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# A release zip has the built app next to this script; a source checkout keeps this
# script in wallpaper\ and builds the app.
$prebuilt = Test-Path (Join-Path $here "Hearthglass.exe")
$project = if ($prebuilt) { $here } else { Split-Path -Parent $here }
$appName = "Hearthglass"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\Hearthglass"
$startupDir = [Environment]::GetFolderPath("Startup")
$startMenuDir = [Environment]::GetFolderPath("Programs")
$shortcutName = "$appName.lnk"

Write-Host "Installing $appName..." -ForegroundColor Cyan

# 1. Check for dotnet SDK
if (-not $prebuilt -and -not (Get-Command "dotnet" -ErrorAction SilentlyContinue)) {
    Write-Error "The .NET 8 SDK is required to build Hearthglass. Please install it from https://dotnet.microsoft.com/download"
    exit 1
}

# 2. Stop any existing running instance
$runningProcesses = Get-Process -Name "Hearthglass" -ErrorAction SilentlyContinue
if ($runningProcesses) {
    Write-Host "Stopping running instance..." -ForegroundColor Yellow
    $runningProcesses | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Replace an installation made before the project was renamed from Desktop Habitats,
# carrying its saved settings over.
Get-Process -Name "DesktopHabitats" -ErrorAction SilentlyContinue | Stop-Process -Force
$oldData = Join-Path $env:LOCALAPPDATA "DesktopHabitats"
$newData = Join-Path $env:LOCALAPPDATA "Hearthglass"
$oldSettings = Join-Path $oldData "settings.json"
if ((Test-Path $oldSettings) -and -not (Test-Path (Join-Path $newData "settings.json"))) {
    New-Item -ItemType Directory -Force $newData | Out-Null
    Copy-Item $oldSettings $newData
}
foreach ($old in @(
    (Join-Path $env:LOCALAPPDATA "Programs\DesktopHabitats"),
    $oldData,
    (Join-Path $startMenuDir "Desktop Habitats.lnk"),
    (Join-Path $startMenuDir "Uninstall Desktop Habitats.lnk"),
    (Join-Path $startupDir "Desktop Habitats.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "Desktop Habitats.lnk"))) {
    if (Test-Path $old) { Remove-Item $old -Recurse -Force -ErrorAction SilentlyContinue }
}
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "DesktopHabitats" -ErrorAction SilentlyContinue

# 3. Publish application, or copy the prebuilt one
if ($prebuilt) {
    if ((Resolve-Path $here).Path -ne [IO.Path]::GetFullPath($installDir)) {
        Write-Host "Copying Hearthglass..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Force $installDir | Out-Null
        Get-ChildItem $here | Where-Object { $_.Name -notin @("scenes", "vendor", "ui") } |
            Copy-Item -Destination $installDir -Recurse -Force
    }
} else {
    $csproj = Join-Path $here "windows\Hearthglass.csproj"
    Write-Host "Building Hearthglass..." -ForegroundColor Cyan
    dotnet publish $csproj -c Release -o $installDir --nologo -v q
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

# 4. Copy scenes, vendor, and ui assets
Write-Host "Copying scene assets..." -ForegroundColor Cyan
$assetsToCopy = @("scenes", "vendor", "ui")
foreach ($asset in $assetsToCopy) {
    $src = Join-Path $project $asset
    $dst = Join-Path $installDir $asset
    if ((Test-Path $src) -and ((Resolve-Path $src).Path -ne [IO.Path]::GetFullPath($dst))) {
        if (Test-Path $dst) {
            Remove-Item $dst -Recurse -Force
        }
        Copy-Item -Path $src -Destination $dst -Recurse -Force
    }
}

# Remove scene test folders from installed bundle
Get-ChildItem -Path (Join-Path $installDir "scenes") -Filter "tests" -Directory -Recurse | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
}

# 5. Copy uninstaller scripts into installation directory (a release zip's are copied above)
if (-not $prebuilt) {
    Copy-Item (Join-Path $project "Uninstall.cmd") -Destination (Join-Path $installDir "Uninstall.cmd") -Force
    Copy-Item (Join-Path $here "uninstall.ps1") -Destination (Join-Path $installDir "uninstall.ps1") -Force
}

# 6. Create Start Menu shortcuts
$exePath = Join-Path $installDir "Hearthglass.exe"
$wshShell = New-Object -ComObject WScript.Shell

$startMenuShortcut = Join-Path $startMenuDir $shortcutName
$shortcut = $wshShell.CreateShortcut($startMenuShortcut)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "Hearthglass - Living aquarium on your desktop"
$shortcut.Save()

$uninstallShortcutPath = Join-Path $startMenuDir "Uninstall Hearthglass.lnk"
$uShortcut = $wshShell.CreateShortcut($uninstallShortcutPath)
$uShortcut.TargetPath = Join-Path $installDir "Uninstall.cmd"
$uShortcut.WorkingDirectory = $installDir
$uShortcut.Description = "Uninstall Hearthglass"
$uShortcut.Save()

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) $shortcutName
$dShortcut = $wshShell.CreateShortcut($desktopShortcut)
$dShortcut.TargetPath = $exePath
$dShortcut.WorkingDirectory = $installDir
$dShortcut.IconLocation = "$exePath,0"
$dShortcut.Description = "Start Hearthglass"
$dShortcut.Save()

# 7. Create Startup shortcut unless -NoStartup was passed
if (-not $NoStartup) {
    $startupShortcut = Join-Path $startupDir $shortcutName
    $shortcut = $wshShell.CreateShortcut($startupShortcut)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = "Hearthglass"
    $shortcut.Save()
    Write-Host "Configured to start at login." -ForegroundColor Green
}

# 7. Start the application
Write-Host "Starting Hearthglass..." -ForegroundColor Green
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $exePath
$startInfo.WorkingDirectory = $installDir
$startInfo.UseShellExecute = $true
[System.Diagnostics.Process]::Start($startInfo) | Out-Null

Write-Host @"

Hearthglass installed successfully!
  Location: $installDir
  Executable: $exePath

Look for the fish icon in your Windows system tray (near the clock).
Click it to change environment, feed the fish, or pause the scene.
"@ -ForegroundColor Cyan
