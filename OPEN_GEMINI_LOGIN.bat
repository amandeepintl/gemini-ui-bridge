@echo off
cd /d "%~dp0"
set GEMINI_BROWSER_VISIBILITY=visible
set GEMINI_BRING_TO_FRONT=true
call npm run launch-browser
if errorlevel 1 (
  echo.
  echo Could not launch Chrome or Edge for Gemini.
  pause
  exit /b 1
)
echo Opening Gemini in the bridge browser...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/v1/open' -ContentType 'application/json' -Body '{\"visibility\":\"visible\"}' | ConvertTo-Json -Depth 5; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo The bridge server is not running, so opening Gemini directly instead.
  echo Leave this window open while you sign in.
  echo.
  call npm run open
)
echo.
pause
