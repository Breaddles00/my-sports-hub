@echo off
setlocal EnableExtensions
title My Sports Hub - Setup
cd /d "%~dp0"
echo.
echo  ==================================================
echo    My Sports Hub - build from source on Windows 11
echo  ==================================================
echo.
echo  Tip: you don't need this script to install the app. The easiest way is to
echo  download My-Sports-Hub-Setup-x.x.x.exe from:
echo    https://github.com/Breaddles00/my-sports-hub/releases/latest
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is required to build the app and was not found.
  where winget >nul 2>nul
  if not errorlevel 1 (
    echo  Installing Node.js LTS with winget...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    echo.
    echo  Node.js installed. CLOSE this window and double-click "Setup My Sports Hub.bat" again.
  ) else (
    echo  Opening the Node.js download page. Install the LTS version, then run this file again.
    start "" https://nodejs.org/en/download
  )
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do echo  Found Node.js %%v
echo.
echo  [1/3] Installing dependencies (first run takes a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo  [2/3] Building the app...
call npm run build:renderer
if errorlevel 1 goto :fail

echo.
echo  [3/3] Creating the Windows installer...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --publish never
if errorlevel 1 goto :fallback

echo.
echo  Done! The installer and portable app are in the "release" folder.
echo  Launching the installer now...
set "INSTALLER="
for %%f in ("release\My-Sports-Hub-Setup-*.exe") do set "INSTALLER=%%~ff"
if defined INSTALLER (
  start "" "%INSTALLER%"
) else (
  start "" "release"
)
echo.
pause
exit /b 0

:fallback
echo.
echo  The installer step failed (usually a Windows permission issue - turning on
echo  Developer Mode in Settings ^> System ^> For developers, or running this file as
echo  administrator, fixes it). Setting up My Sports Hub to run from this folder instead...
call node_modules\.bin\electron.cmd . --create-shortcuts
echo.
echo  My Sports Hub is ready: open it from the Start menu or the Desktop shortcut.
echo  (Keep this folder where it is - the shortcuts point to it.)
start "" node_modules\electron\dist\electron.exe "%~dp0."
echo.
pause
exit /b 0

:fail
echo.
echo  Setup failed - see the messages above. Check your internet connection and try again.
pause
exit /b 1
