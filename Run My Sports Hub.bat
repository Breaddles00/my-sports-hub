@echo off
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe (
  echo My Sports Hub has not been set up yet. Running setup first...
  call "Setup My Sports Hub.bat"
  exit /b
)
if not exist dist\app.js call npm run build:renderer
start "" node_modules\electron\dist\electron.exe "%~dp0."
