# Desktop Habitats Windows Installer
# Builds the wallpaper agent, installs it to %LOCALAPPDATA%\Programs\DesktopHabitats
# with its own copy of the aquarium, and starts it now and at every login.
param(
    [switch]$NoStartup = $false
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Split-Path -Parent $here
$appName = "Desktop Habitats"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\DesktopHabitats"
$startupDir = [Environment]::GetFolderPath("Startup")
$startMenuDir = [Environment]::GetFolderPath("Programs")
$shortcutName = "$appName.lnk"

Write-Host "Installing $appName..." -ForegroundColor Cyan

# 1. Check for dotnet SDK
if (-not (Get-Command "dotnet" -ErrorAction SilentlyContinue)) {
    Write-Error "The .NET 8 SDK is required to build Desktop Habitats. Please install it from https://dotnet.microsoft.com/download"
    exit 1
}

# 2. Stop any existing running instance
$runningProcesses = Get-Process -Name "DesktopHabitats" -ErrorAction SilentlyContinue
if ($runningProcesses) {
    Write-Host "Stopping running instance..." -ForegroundColor Yellow
    $runningProcesses | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# 3. Publish application
$csproj = Join-Path $here "windows\DesktopHabitats.csproj"
Write-Host "Building Desktop Habitats..." -ForegroundColor Cyan
dotnet publish $csproj -c Release -o $installDir --nologo -v q
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 4. Copy scenes, vendor, and ui assets
Write-Host "Copying scene assets..." -ForegroundColor Cyan
$assetsToCopy = @("scenes", "vendor", "ui")
foreach ($asset in $assetsToCopy) {
    $src = Join-Path $project $asset
    $dst = Join-Path $installDir $asset
    if (Test-Path $src) {
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

# 5. Copy uninstaller scripts into installation directory
Copy-Item (Join-Path $project "Uninstall.cmd") -Destination (Join-Path $installDir "Uninstall.cmd") -Force
Copy-Item (Join-Path $here "uninstall.ps1") -Destination (Join-Path $installDir "uninstall.ps1") -Force

# 6. Create Start Menu shortcuts
$exePath = Join-Path $installDir "DesktopHabitats.exe"
$wshShell = New-Object -ComObject WScript.Shell

$startMenuShortcut = Join-Path $startMenuDir $shortcutName
$shortcut = $wshShell.CreateShortcut($startMenuShortcut)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "Desktop Habitats - Living aquarium on your desktop"
$shortcut.Save()

$uninstallShortcutPath = Join-Path $startMenuDir "Uninstall Desktop Habitats.lnk"
$uShortcut = $wshShell.CreateShortcut($uninstallShortcutPath)
$uShortcut.TargetPath = Join-Path $installDir "Uninstall.cmd"
$uShortcut.WorkingDirectory = $installDir
$uShortcut.Description = "Uninstall Desktop Habitats"
$uShortcut.Save()

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) $shortcutName
$dShortcut = $wshShell.CreateShortcut($desktopShortcut)
$dShortcut.TargetPath = $exePath
$dShortcut.WorkingDirectory = $installDir
$dShortcut.IconLocation = "$exePath,0"
$dShortcut.Description = "Start Desktop Habitats"
$dShortcut.Save()

# 7. Create Startup shortcut unless -NoStartup was passed
if (-not $NoStartup) {
    $startupShortcut = Join-Path $startupDir $shortcutName
    $shortcut = $wshShell.CreateShortcut($startupShortcut)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = "Desktop Habitats"
    $shortcut.Save()
    Write-Host "Configured to start at login." -ForegroundColor Green
}

# 7. Start the application
Write-Host "Starting Desktop Habitats..." -ForegroundColor Green
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $exePath
$startInfo.WorkingDirectory = $installDir
$startInfo.UseShellExecute = $true
[System.Diagnostics.Process]::Start($startInfo) | Out-Null

Write-Host @"

Desktop Habitats installed successfully!
  Location: $installDir
  Executable: $exePath

Look for the fish icon in your Windows system tray (near the clock).
Click it to change environment, feed the fish, or pause the scene.
"@ -ForegroundColor Cyan
