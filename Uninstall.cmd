@echo off
setlocal
cd /d "%~dp0"
title Hearthglass Uninstaller

echo =======================================================
echo         Hearthglass - Windows Uninstaller
echo =======================================================
echo.

rem In a source checkout the script is in wallpaper\; in a release zip or the
rem installed folder it sits next to this file.
set "SCRIPT=%~dp0wallpaper\uninstall.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0uninstall.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% EQU 0 (
    echo [OK] Uninstallation completed successfully.
) else (
    echo [ERROR] Uninstallation encountered an error with exit code %EXITCODE%.
)

echo.
echo Press any key to close this window...
pause >nul
exit /b %EXITCODE%
