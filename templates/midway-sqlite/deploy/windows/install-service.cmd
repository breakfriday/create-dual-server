@echo off
setlocal
cd /d "%~dp0"
echo Run this script as Administrator.
"%~dp0service.exe" install
if errorlevel 1 goto failed
"%~dp0service.exe" start
if errorlevel 1 goto failed
"%~dp0service.exe" status
pause
exit /b 0
:failed
echo Service installation or startup failed. Check logs and service.xml.
pause
exit /b 1
