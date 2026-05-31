@echo off
cd /d "%~dp0"
set GEMINI_BROWSER_VISIBILITY=offscreen
set GEMINI_BRING_TO_FRONT=false
set LOW_RESOURCE_MODE=true
set AUTO_LAUNCH_REAL_BROWSER=true
npm start
pause
