@echo off
setlocal EnableExtensions
title My Sports Hub - Setup
echo.
echo  ==================================================
echo    My Sports Hub - install on Windows 11
echo  ==================================================
echo.
echo  Downloading the latest installer from GitHub...
echo    https://github.com/Breaddles00/my-sports-hub/releases/latest
echo.
set "SETUP=%TEMP%\My-Sports-Hub-Setup.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';" ^
  "$r = Invoke-RestMethod -Headers @{'User-Agent'='MySportsHub-Setup'} 'https://api.github.com/repos/Breaddles00/my-sports-hub/releases/latest';" ^
  "$a = $r.assets | Where-Object { $_.name -like 'My-Sports-Hub-Setup-*.exe' } | Select-Object -First 1;" ^
  "if (-not $a) { throw 'The latest release has no installer.' }" ^
  "Write-Host ('  Found ' + $a.name);" ^
  "Invoke-WebRequest -UseBasicParsing -Headers @{'User-Agent'='MySportsHub-Setup'} $a.browser_download_url -OutFile $env:SETUP"
if errorlevel 1 goto :fail

echo.
echo  Starting the installer...
start "" "%SETUP%"
exit /b 0

:fail
echo.
echo  The download failed - check your internet connection and try again, or download
echo  My-Sports-Hub-Setup-x.x.x.exe yourself from the link above.
start "" https://github.com/Breaddles00/my-sports-hub/releases/latest
pause
exit /b 1
