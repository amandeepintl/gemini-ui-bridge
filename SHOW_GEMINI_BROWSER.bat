@echo off
cd /d "%~dp0"
echo Showing Gemini bridge browser...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/v1/browser/visibility' -ContentType 'application/json' -Body '{\"visibility\":\"visible\"}' | ConvertTo-Json -Depth 5; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Bridge server not reachable, trying direct DevTools connection...
  call npm run browser-show
)
echo.
pause
