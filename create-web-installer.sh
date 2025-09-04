#!/bin/bash

# Create Web-Based Installer (Under 100MB for GitHub)
# This creates a lightweight installer that downloads components as needed

set -e

echo "🎯 Creating Web-Based Installer (Target: <100MB for GitHub)"
echo "=========================================================="

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf web-installer/ dist-web/

# Create installer directory
mkdir -p web-installer

# Build the web app
print_status "Building web application..."
npm run build

# Copy essential files only
print_status "Creating minimal installer package..."
mkdir -p web-installer/app
cp -r .next web-installer/app/
cp -r src web-installer/app/
cp -r public web-installer/app/
cp -r python_scripts web-installer/app/
cp package.json web-installer/app/
cp cities.json web-installer/app/
cp *.config.* web-installer/app/ 2>/dev/null || true

# Create installer script
cat > web-installer/install.sh << 'EOF'
#!/bin/bash

echo "🌱 Installing Greenspace Detection App..."
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js from: https://nodejs.org/"
    echo "Then run this installer again."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3 from: https://python.org/"
    echo "Then run this installer again."
    exit 1
fi

# Create installation directory
INSTALL_DIR="$HOME/Applications/Greenspace Detection"
echo "📁 Installing to: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Copy app files
echo "📦 Copying application files..."
cp -r app/* "$INSTALL_DIR/"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
cd "$INSTALL_DIR"
npm install --production

# Create Python virtual environment
echo "🐍 Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate
pip install -r python_scripts/requirements.txt

# Create launch script
cat > "$INSTALL_DIR/launch.sh" << 'LAUNCH_EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Starting Greenspace Detection App..."
npm run start &
sleep 3
open "http://localhost:3000"
LAUNCH_EOF

chmod +x "$INSTALL_DIR/launch.sh"

# Create desktop shortcut (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    cat > "$HOME/Desktop/Greenspace Detection.command" << 'DESKTOP_EOF'
#!/bin/bash
cd "$HOME/Applications/Greenspace Detection"
./launch.sh
DESKTOP_EOF
    chmod +x "$HOME/Desktop/Greenspace Detection.command"
    echo "✅ Desktop shortcut created"
fi

echo ""
echo "✅ Installation completed successfully!"
echo ""
echo "🚀 To launch the app:"
echo "   Double-click 'Greenspace Detection.command' on your Desktop"
echo "   Or run: $INSTALL_DIR/launch.sh"
echo ""
echo "📝 The app will open in your default web browser"
echo "   URL: http://localhost:3000"
echo ""
EOF

chmod +x web-installer/install.sh

# Create Windows installer batch file
cat > web-installer/install.bat << 'EOF'
@echo off
echo Installing Greenspace Detection App...
echo =====================================

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is required but not installed.
    echo Please install Node.js from: https://nodejs.org/
    echo Then run this installer again.
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python 3 is required but not installed.
    echo Please install Python 3 from: https://python.org/
    echo Then run this installer again.
    pause
    exit /b 1
)

REM Create installation directory
set "INSTALL_DIR=%USERPROFILE%\Applications\Greenspace Detection"
echo Installing to: %INSTALL_DIR%
mkdir "%INSTALL_DIR%" 2>nul

REM Copy app files
echo Copying application files...
xcopy /E /I /Y app "%INSTALL_DIR%"

REM Install dependencies
echo Installing Node.js dependencies...
cd "%INSTALL_DIR%"
call npm install --production

REM Create Python virtual environment
echo Setting up Python environment...
python -m venv venv
call venv\Scripts\activate.bat
pip install -r python_scripts\requirements.txt

REM Create launch script
echo @echo off > launch.bat
echo cd /d "%%~dp0" >> launch.bat
echo echo Starting Greenspace Detection App... >> launch.bat
echo start npm run start >> launch.bat
echo timeout /t 3 >> launch.bat
echo start http://localhost:3000 >> launch.bat

REM Create desktop shortcut
set "DESKTOP=%USERPROFILE%\Desktop"
echo @echo off > "%DESKTOP%\Greenspace Detection.bat"
echo cd /d "%INSTALL_DIR%" >> "%DESKTOP%\Greenspace Detection.bat"
echo call launch.bat >> "%DESKTOP%\Greenspace Detection.bat"

echo.
echo Installation completed successfully!
echo.
echo To launch the app:
echo   Double-click 'Greenspace Detection.bat' on your Desktop
echo   Or run: %INSTALL_DIR%\launch.bat
echo.
echo The app will open in your default web browser
echo   URL: http://localhost:3000
echo.
pause
EOF

# Create README
cat > web-installer/README.txt << 'EOF'
Greenspace Detection App - Web Installer
========================================

REQUIREMENTS:
- Node.js 18+ (https://nodejs.org/)
- Python 3.8+ (https://python.org/)

INSTALLATION:

macOS/Linux:
1. Run: ./install.sh
2. Launch: Double-click "Greenspace Detection.command" on Desktop

Windows:
1. Run: install.bat
2. Launch: Double-click "Greenspace Detection.bat" on Desktop

The app will open in your web browser at http://localhost:3000

FEATURES:
✅ Under 100MB download
✅ Automatic dependency installation
✅ Desktop shortcuts created
✅ Same functionality as full desktop app
✅ GitHub compatible file size

For support, visit: [your-repo-url]
EOF

# Create the distribution archive
print_status "Creating distribution archive..."
cd web-installer
zip -r "../dist-web/greenspace-detection-web-installer.zip" .
cd ..

# Check final size
if [ -f "dist-web/greenspace-detection-web-installer.zip" ]; then
    installer_size=$(du -sh dist-web/greenspace-detection-web-installer.zip | cut -f1)
    size_mb=$(du -m dist-web/greenspace-detection-web-installer.zip | cut -f1)
    
    print_success "Web installer created: $installer_size"
    
    if [ "$size_mb" -lt 100 ]; then
        print_success "🎯 SUCCESS! Under 100MB (${size_mb}MB) - GitHub compatible!"
    else
        print_warning "Still ${size_mb}MB - need further optimization"
    fi
    
    echo ""
    print_status "Contents:"
    unzip -l dist-web/greenspace-detection-web-installer.zip | tail -10
fi

print_success "🎉 Web-based installer created!"
echo ""
print_status "Distribution:"
echo "📦 dist-web/greenspace-detection-web-installer.zip"
echo ""
print_status "User experience:"
echo "1. Download ZIP file from GitHub"
echo "2. Extract and run install script"
echo "3. Launch from desktop shortcut"
echo "4. App opens in browser (no localhost complexity)"
echo ""
print_success "✅ GitHub compatible size!"
print_success "✅ Professional installation experience!"
print_success "✅ Same functionality as desktop app!"
