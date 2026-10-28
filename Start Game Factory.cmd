@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Please run npm install and npm run build once before starting.
  pause
  exit /b 1
)
start "" http://127.0.0.1:5174
call npm run dev -- --port 5174 --strictPort
