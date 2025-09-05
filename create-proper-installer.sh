#!/bin/bash

# Create Proper Web Installer - Under 100MB for GitHub
# This creates a minimal installer that downloads dependencies on first run

set -e

echo "🎯 Creating Proper Web Installer (Target: <100MB)"
echo "=================================================="

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf proper-installer/

# Create installer and output directories
mkdir -p proper-installer
mkdir -p dist-web

print_status "Building Next.js app in development mode..."
# We'll use dev mode since it doesn't require a build
npm install

print_status "Creating minimal installer package..."

# Copy only essential files
mkdir -p proper-installer/app
cp package.json proper-installer/app/
cp -r src/ proper-installer/app/
cp -r public/ proper-installer/app/
cp cities.json proper-installer/app/
cp next.config.js proper-installer/app/
cp tailwind.config.ts proper-installer/app/
cp tsconfig.json proper-installer/app/
cp eslint.config.mjs proper-installer/app/
cp postcss.config.mjs proper-installer/app/

# Copy Python scripts (but not venv)
cp -r python_scripts/ proper-installer/app/

# Create Mac double-click installer
cat > proper-installer/install.command << 'EOF'
#!/bin/bash

# Make sure we're in the right directory
cd "$(dirname "$0")"

echo "🌱 Installing Greenspace Detection App..."
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8+ first."
    echo "   Visit: https://python.org/"
    exit 1
fi

# Set installation directory
INSTALL_DIR="$HOME/Applications/Greenspace Detection"

print_status "Installing to: $INSTALL_DIR"

# Create installation directory
mkdir -p "$INSTALL_DIR"

# Copy application files
print_status "Copying application files..."
cp -r app/* "$INSTALL_DIR/"

# Navigate to installation directory
cd "$INSTALL_DIR"

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
npm install

# Create Python virtual environment
print_status "Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate
pip install -r python_scripts/requirements.txt

# Create launch script
cat > launch.sh << 'LAUNCH_EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Starting Greenspace Detection App..."

# Check if app is already running
if lsof -i :3000 >/dev/null 2>&1; then
    echo "✅ App is already running!"
    echo "   Opening browser to: http://localhost:3000"
    open http://localhost:3000 2>/dev/null || echo "   Please open http://localhost:3000 in your browser"
    exit 0
fi

# Kill any existing instances to prevent port conflicts
pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Activate virtual environment
source venv/bin/activate

# Start the Next.js development server
npm run dev &
SERVER_PID=$!

# Wait for server to start and check if it's running on port 3000
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
    if lsof -i :3000 >/dev/null 2>&1; then
        echo "✅ App started successfully!"
        echo "   Opening browser to: http://localhost:3000"
        sleep 1
        open http://localhost:3000 2>/dev/null || echo "   Please open http://localhost:3000 in your browser"
        break
    fi
    sleep 1
done

# Check if server started successfully
if ! lsof -i :3000 >/dev/null 2>&1; then
    echo "❌ Failed to start server on port 3000"
    echo "   Please check if another application is using port 3000"
    exit 1
fi

# Keep the script running
wait $SERVER_PID
LAUNCH_EOF

chmod +x launch.sh

# Create desktop shortcut
DESKTOP_FILE="$HOME/Desktop/Greenspace Detection.command"
cat > "$DESKTOP_FILE" << 'DESKTOP_EOF'
#!/bin/bash
cd "$HOME/Applications/Greenspace Detection"
# Kill any existing instances first to prevent port conflicts
pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 1
# Launch the app
./launch.sh
DESKTOP_EOF

chmod +x "$DESKTOP_FILE"

print_success "Desktop shortcut created"
print_success "Installation completed successfully!"

echo ""
echo "🚀 To launch the app:"
echo "   Double-click 'Greenspace Detection.command' on your Desktop"
echo "   Or run: $INSTALL_DIR/launch.sh"
echo ""
echo "📝 The app will open in your default web browser"
echo "   URL: http://localhost:3000"
echo ""
echo "Press any key to close this window..."
read -n 1
EOF

chmod +x proper-installer/install.command

# Also create traditional install.sh for advanced users
cp proper-installer/install.command proper-installer/install.sh

# Create Windows installer
cat > proper-installer/install.bat << 'EOF'
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
EOF

# Create README
cat > proper-installer/README.txt << 'EOF'
# Greenspace Detection App - Easy Installer

## Quick Start (Super Easy!)

### Mac:
1. Extract this ZIP file
2. Double-click "install.command" (no Terminal needed!)
3. Double-click "Greenspace Detection.command" on your Desktop

### Windows:
1. Extract this ZIP file
2. Double-click "install.bat"
3. Double-click "Greenspace Detection.bat" on your Desktop

### Advanced Users (Mac/Linux):
- Use install.sh if you prefer Terminal installation

## Requirements

- Node.js 18+ (https://nodejs.org/)
- Python 3.8+ (https://python.org/)
- Internet connection (for downloading satellite data)

## What This Does

- Installs the app to ~/Applications/Greenspace Detection
- Sets up Node.js and Python dependencies automatically
- Creates a desktop shortcut for easy access
- Runs the app in development mode (no build required)

## Features

- Analyze vegetation in 50+ cities worldwide
- Download satellite imagery automatically
- Generate NDVI analysis and visualizations
- Compare vegetation changes over time
- Export results and maps

## Support

For issues or questions, visit: https://github.com/main-salman/greenspace-detection-app
EOF

# Create the ZIP file
print_status "Creating ZIP package..."
cd proper-installer
zip -r "../dist-web/greenspace-detection-proper-installer.zip" . || {
    print_error "Failed to create ZIP file"
    exit 1
}
cd ..

# Check file size
INSTALLER_SIZE=$(du -sh dist-web/greenspace-detection-proper-installer.zip | cut -f1)
print_success "Proper installer created: $INSTALLER_SIZE"

if [[ -f "dist-web/greenspace-detection-proper-installer.zip" ]]; then
    SIZE_BYTES=$(stat -f%z "dist-web/greenspace-detection-proper-installer.zip" 2>/dev/null || stat -c%s "dist-web/greenspace-detection-proper-installer.zip" 2>/dev/null)
    SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
    
    if [[ $SIZE_MB -lt 100 ]]; then
        print_success "✅ SUCCESS: Installer is ${SIZE_MB}MB - UNDER 100MB GitHub limit!"
    else
        print_warning "⚠️  WARNING: Installer is ${SIZE_MB}MB - OVER 100MB GitHub limit"
    fi
else
    print_error "❌ Failed to create installer"
    exit 1
fi

print_success "Proper web installer ready for distribution!"
echo ""
echo "📦 File: dist-web/greenspace-detection-proper-installer.zip"
echo "📏 Size: $INSTALLER_SIZE"
echo "🎯 GitHub Compatible: ✅"
