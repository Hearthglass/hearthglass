@echo off
setlocal
cd /d "%~dp0"
title Desktop Habitats Uninstaller

echo =======================================================
echo         Desktop Habitats - Windows Uninstaller
echo =======================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0wallpaper\uninstall.ps1"
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
