@echo off
REM LightUp - one-click launcher
REM Starts the local server and opens Chrome.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install --no-audit --no-fund
)
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8765/index.html"
node serve.mjs
