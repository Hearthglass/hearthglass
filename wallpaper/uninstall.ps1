# Hearthglass Windows Uninstaller
# Stops the wallpaper agent and removes installed files and shortcuts.

$ErrorActionPreference = "Continue"

$appName = "Hearthglass"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\Hearthglass"
$startupDir = [Environment]::GetFolderPath("Startup")
$startMenuDir = [Environment]::GetFolderPath("Programs")
$shortcutName = "$appName.lnk"

Write-Host "Uninstalling $appName..." -ForegroundColor Cyan

# 1. Stop running instance
$runningProcesses = Get-Process -Name "Hearthglass" -ErrorAction SilentlyContinue
if ($runningProcesses) {
    Write-Host "Stopping Hearthglass..." -ForegroundColor Yellow
    $runningProcesses | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# 2. Remove shortcuts
$startMenuShortcut = Join-Path $startMenuDir $shortcutName
if (Test-Path $startMenuShortcut) {
    Remove-Item $startMenuShortcut -Force
    Write-Host "Removed Start Menu shortcut." -ForegroundColor Green
}

$uninstallShortcut = Join-Path $startMenuDir "Uninstall Hearthglass.lnk"
if (Test-Path $uninstallShortcut) {
    Remove-Item $uninstallShortcut -Force
    Write-Host "Removed Uninstall shortcut." -ForegroundColor Green
}

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) $shortcutName
if (Test-Path $desktopShortcut) {
    Remove-Item $desktopShortcut -Force
}

$startupShortcut = Join-Path $startupDir $shortcutName
if (Test-Path $startupShortcut) {
    Remove-Item $startupShortcut -Force
    Write-Host "Removed Startup shortcut." -ForegroundColor Green
}

# 3. Clean up registry Run entry if any
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$entry = Get-ItemProperty -Path $runKey -Name "Hearthglass" -ErrorAction SilentlyContinue
if ($entry) {
    Remove-ItemProperty -Path $runKey -Name "Hearthglass" -Force
}

# 4. Remove installation files
if (Test-Path $installDir) {
    try {
        Remove-Item $installDir -Recurse -Force -ErrorAction Stop
        Write-Host "Removed application directory: $installDir" -ForegroundColor Green
    }
    catch {
        # If uninstaller itself was launched from inside installDir, clean all other files
        Get-ChildItem -Path $installDir -Exclude "Uninstall.cmd", "uninstall.ps1" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned application directory: $installDir" -ForegroundColor Green
    }
}

Write-Host "Hearthglass uninstalled." -ForegroundColor Cyan
