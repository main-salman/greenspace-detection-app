@echo off
echo 🌱 Installing Greenspace Detection App...
echo ========================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    echo    Visit: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python 3 is not installed. Please install Python 3.8+ first.
    echo    Visit: https://python.org/
    pause
    exit /b 1
)

REM Set installation directory
set "INSTALL_DIR=%USERPROFILE%\Applications\Greenspace Detection"

echo 📁 Installing to: %INSTALL_DIR%

REM Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy application files
echo 📦 Copying application files...
xcopy /E /I /Y app "%INSTALL_DIR%"

REM Navigate to installation directory
cd /d "%INSTALL_DIR%"

REM Install Node.js dependencies
echo 📦 Installing Node.js dependencies...
npm install

REM Create Python virtual environment
echo 🐍 Setting up Python environment...
python -m venv venv
call venv\Scripts\activate.bat
pip install -r python_scripts\requirements.txt

REM Create launch script
echo @echo off > launch.bat
echo cd /d "%%~dp0" >> launch.bat
echo echo 🚀 Starting Greenspace Detection App... >> launch.bat
echo call venv\Scripts\activate.bat >> launch.bat
echo start /B npm run dev >> launch.bat
echo timeout /t 5 /nobreak ^>nul >> launch.bat
echo start http://localhost:3000 >> launch.bat
echo echo ✅ App started! Opening in browser... >> launch.bat
echo echo    If browser doesn't open, visit: http://localhost:3000 >> launch.bat

REM Create desktop shortcut
set "DESKTOP_FILE=%USERPROFILE%\Desktop\Greenspace Detection.bat"
echo @echo off > "%DESKTOP_FILE%"
echo cd /d "%INSTALL_DIR%" >> "%DESKTOP_FILE%"
echo call launch.bat >> "%DESKTOP_FILE%"

echo ✅ Desktop shortcut created
echo ✅ Installation completed successfully!
echo.
echo 🚀 To launch the app:
echo    Double-click 'Greenspace Detection.bat' on your Desktop
echo    Or run: %INSTALL_DIR%\launch.bat
echo.
echo 📝 The app will open in your default web browser
echo    URL: http://localhost:3000
pause
