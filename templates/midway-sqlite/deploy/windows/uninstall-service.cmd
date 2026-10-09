@echo off
setlocal
cd /d "%~dp0"
echo Run this script as Administrator.
"%~dp0service.exe" stop
"%~dp0service.exe" uninstall
if errorlevel 1 goto failed
echo Service removed. Configuration, database and logs have been preserved.
pause
exit /b 0
:failed
echo Service removal failed. Check logs and service.xml.
pause
exit /b 1
