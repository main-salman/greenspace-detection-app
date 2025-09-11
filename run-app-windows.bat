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

REM Start Next.js dev server in background
if exist .dev_pid (
  for /f %%p in (.dev_pid) do (
    tasklist /FI "PID eq %%p" | findstr /I "%%p" >nul 2>nul && (
      echo Server already running (PID %%p).
      goto :OPEN
    )
  )
  del /q .dev_pid >nul 2>nul
)

start "greenspace-dev" /B cmd /c "npm run dev > .dev_log 2>&1"
REM Capture PID via wmic (fallback to powershell if needed)
for /f "tokens=2" %%a in ('tasklist /FI "WINDOWTITLE eq greenspace-dev" ^| findstr /I greenspace-dev') do echo %%a > .dev_pid

:WAIT
for /l %%i in (1,1,50) do (
  powershell -Command "try { iwr http://localhost:3000 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul && goto :OPEN
  timeout /t 1 >nul
)

:OPEN
start http://localhost:3000

echo Done. To stop the server, terminate the process listed in .dev_pid or close the dev window.
endlocal
