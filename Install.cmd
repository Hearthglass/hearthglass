@echo off
setlocal
cd /d "%~dp0"
title Hearthglass Installer

echo =======================================================
echo          Hearthglass - Windows Installer
echo =======================================================
echo.

rem In a source checkout the script is in wallpaper\; in a release zip or the
rem installed folder it sits next to this file.
set "SCRIPT=%~dp0wallpaper\install.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0install.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% EQU 0 (
    echo [OK] Installation completed successfully!
    echo Look for the fish icon in your system tray near the clock.
) else (
    echo [ERROR] Installation encountered an error with exit code %EXITCODE%.
)

echo.
echo Press any key to close this window...
pause >nul
exit /b %EXITCODE%
