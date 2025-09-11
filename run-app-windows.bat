@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Greenspace Detection - Windows bootstrapper
REM - Installs Node deps
REM - Creates Python venv and installs requirements
REM - Starts Next.js dev server in background
REM - Opens browser at http://localhost:3000

cd /d %~dp0

REM Check prerequisites
where node >nul 2>nul || (echo Node.js is required && exit /b 1)
where npm >nul 2>nul || (echo npm is required && exit /b 1)
where py >nul 2>nul || where python >nul 2>nul || (echo Python is required (py or python) && exit /b 1)

REM Install Node dependencies
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)

REM Setup Python venv
if not exist venv (
  where py >nul 2>nul && (py -3 -m venv venv) || (python -m venv venv)
)

call venv\Scripts\activate.bat
py -3 -m pip install --upgrade pip 2>nul || python -m pip install --upgrade pip
py -3 -m pip install -r python_scripts\requirements.txt 2>nul || python -m pip install -r python_scripts\requirements.txt

REM Start Next.js dev server in background (no PID bookkeeping to avoid cmd parsing issues)
start "" /MIN cmd /c "npm run dev > .dev_log 2>&1"

REM Wait until http://localhost:3000 responds (PowerShell loop, avoids FOR/PAREN parsing)
powershell -NoProfile -Command "for($i=0; $i -lt 50; $i++){ try { iwr http://localhost:3000 -UseBasicParsing | Out-Null; exit 0 } catch {} Start-Sleep -Milliseconds 500 }"

start "" http://localhost:3000

echo Done. Server logs in .dev_log. Close the dev window to stop the server.
endlocal
