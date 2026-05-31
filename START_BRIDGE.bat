@echo off
cd /d "%~dp0"
call npm run launch-browser
if errorlevel 1 (
  echo.
  echo Could not launch Chrome or Edge for Gemini.
  pause
  exit /b 1
)
call npm start
echo.
echo Bridge stopped or failed to start.
pause
