@echo off
cd /d "%~dp0"
set GEMINI_BROWSER_VISIBILITY=visible
set GEMINI_BRING_TO_FRONT=true
call npm run launch-browser
echo.
pause
