@echo off
setlocal
cd /d "%~dp0"
title Desktop Habitats - Refresh

rem Copies this checkout's scenes into the installed app and restarts it, so edits
rem show up on the desktop. Stops the app first and clears its web cache so no stale
rem scripts are served. Leaves the start-at-login setting as it is.

echo Stopping Desktop Habitats...
taskkill /im DesktopHabitats.exe /f >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo Clearing the web cache...
set "WEBDATA=%LOCALAPPDATA%\DesktopHabitats\WebView2Data\EBWebView\Default"
if exist "%WEBDATA%\Cache" rmdir /s /q "%WEBDATA%\Cache"
if exist "%WEBDATA%\Code Cache" rmdir /s /q "%WEBDATA%\Code Cache"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0wallpaper\install.ps1" -NoStartup
if errorlevel 1 (
    echo.
    echo [ERROR] Refresh failed. See the messages above.
    pause
    exit /b 1
)

echo.
echo [OK] Desktop Habitats is running with the latest scenes.
ping -n 4 127.0.0.1 >nul
