@echo off
setlocal
cd /d "%~dp0"
title Desktop Habitats Installer

echo =======================================================
echo          Desktop Habitats - Windows Installer
echo =======================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0wallpaper\install.ps1"
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
