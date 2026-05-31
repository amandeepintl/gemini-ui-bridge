@echo off
cd /d "%~dp0"
set LOW_RESOURCE_MODE=false
set BROWSER_WINDOW_WIDTH=1280
set BROWSER_WINDOW_HEIGHT=820
set GEMINI_CAPTURE_MEDIA_REFS_FOR_TEXT=false
set GEMINI_RETURN_PROMPT_IN_RESPONSE=true
set GEMINI_RESPONSE_POLL_MS=700
set GEMINI_MEDIA_POLL_MS=1500
set GEMINI_STABLE_RESPONSE_MS=1200
set GEMINI_MAX_MEDIA_REFS=50
set GEMINI_IDLE_CLOSE_BROWSER_MINUTES=0
call npm run launch-browser
if errorlevel 1 (
  echo.
  echo Could not launch Chrome or Edge for Gemini.
  pause
  exit /b 1
)
node --max-old-space-size=256 src/http-server.js
echo.
echo Bridge stopped or failed to start.
pause
