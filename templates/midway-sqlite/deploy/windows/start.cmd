@echo off
setlocal
set "NODE_ENV=production"
set "SERVER_CONFIG_FILE=%~dp0config\server.json"
cd /d "%~dp0app"
if errorlevel 1 exit /b 1
"%~dp0runtime\node.exe" "%~dp0app\bootstrap.js"
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
