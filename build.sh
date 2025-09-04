#!/bin/bash

# Greenspace Detection App - Desktop Build Script
# Builds standalone desktop applications for macOS and Windows

set -e  # Exit on any error

echo "🚀 Building Greenspace Detection Desktop App"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
print_status "Checking prerequisites..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    print_status "Installing Node.js dependencies..."
    npm install
fi

# Check if Python virtual environment exists
if [ ! -d "venv" ]; then
    print_status "Creating Python virtual environment..."
    python3 -m venv venv
    
    # Activate virtual environment
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        source venv/Scripts/activate
    else
        source venv/bin/activate
    fi
    
    print_status "Installing Python dependencies..."
    pip install -r python_scripts/requirements.txt
    pip install pyinstaller
else
    # Activate existing virtual environment
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        source venv/Scripts/activate
    else
        source venv/bin/activate
    fi
    
    # Install pyinstaller if not present
    if ! pip show pyinstaller > /dev/null 2>&1; then
        print_status "Installing PyInstaller..."
        pip install pyinstaller
    fi
fi

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf dist/
rm -rf out/
rm -rf python_runtime/
rm -rf build/  # PyInstaller build directory

# Create directories
mkdir -p python_runtime
mkdir -p electron/icons

# Step 1: Build Next.js app for production
print_status "Building Next.js application..."
npm run build

# Export static files
print_status "Exporting Next.js static files..."
npx next build && npx next export

# Step 2: Create Python standalone executables
print_status "Creating Python standalone executables..."

# Create PyInstaller spec files for each Python script
create_pyinstaller_spec() {
    local script_name=$1
    local spec_file="python_scripts/${script_name%.py}.spec"
    
    cat > "$spec_file" << EOF
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['${script_name}'],
    pathex=[],
    binaries=[],
    datas=[
        ('requirements.txt', '.'),
    ],
    hiddenimports=[
        'rasterio',
        'rasterio.crs',
        'rasterio.transform',
        'numpy',
        'shapely',
        'shapely.geometry',
        'cv2',
        'requests',
        'pyproj',
        'PIL',
        'matplotlib',
        'scipy',
        'scipy.ndimage',
        'scipy.spatial',
        'skimage',
        'skimage.filters',
        'skimage.morphology',
        'concurrent.futures',
        'threading',
        'multiprocessing',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='${script_name%.py}',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
EOF
}

# Build Python scripts
cd python_scripts

# Create specs for main processing scripts
create_pyinstaller_spec "satellite_processor_fixed.py"
create_pyinstaller_spec "generate_change_visualization.py"

print_status "Building satellite_processor_fixed executable..."
pyinstaller satellite_processor_fixed.spec --clean --noconfirm

print_status "Building generate_change_visualization executable..."
pyinstaller generate_change_visualization.spec --clean --noconfirm

# Copy executables to python_runtime directory
cd ..
mkdir -p python_runtime/bin

# Copy based on platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    cp python_scripts/dist/satellite_processor_fixed/satellite_processor_fixed python_runtime/bin/
    cp python_scripts/dist/generate_change_visualization/generate_change_visualization python_runtime/bin/
    chmod +x python_runtime/bin/*
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    cp python_scripts/dist/satellite_processor_fixed/satellite_processor_fixed.exe python_runtime/bin/
    cp python_scripts/dist/generate_change_visualization/generate_change_visualization.exe python_runtime/bin/
else
    # Linux
    cp python_scripts/dist/satellite_processor_fixed/satellite_processor_fixed python_runtime/bin/
    cp python_scripts/dist/generate_change_visualization/generate_change_visualization python_runtime/bin/
    chmod +x python_runtime/bin/*
fi

# Copy requirements.txt and other necessary files
cp python_scripts/requirements.txt python_runtime/

print_success "Python executables created successfully!"

# Step 3: Create app icons (using a simple approach - you can replace with actual icons)
print_status "Creating application icons..."

# Create a simple icon (replace this with actual icon creation)
# For now, we'll create placeholder files
touch electron/icons/icon.icns  # macOS
touch electron/icons/icon.ico   # Windows
touch electron/icons/icon.png   # Linux

print_warning "Using placeholder icons. Replace electron/icons/* with actual app icons."

# Step 4: Build Electron app
print_status "Building Electron applications..."

# Install electron dependencies if not already installed
if ! npm list electron &> /dev/null; then
    print_status "Installing Electron dependencies..."
    npm install
fi

# Build for current platform first
print_status "Building for current platform..."
npm run electron:dist

# Try to build for other platforms if on macOS (cross-compilation works best on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    print_status "Building for Windows (from macOS)..."
    npx electron-builder --win --x64 || print_warning "Windows build failed (this is normal if Wine is not installed)"
    
    print_status "Building for macOS (Intel + Apple Silicon)..."
    npx electron-builder --mac --universal || print_warning "Universal macOS build failed, trying individual architectures..."
    npx electron-builder --mac --x64 || print_warning "macOS x64 build failed"
    npx electron-builder --mac --arm64 || print_warning "macOS ARM64 build failed"
fi

# Step 5: Display results
print_success "Build completed!"
echo ""
echo "📦 Built applications can be found in:"
echo "   dist/"
echo ""

if [ -d "dist" ]; then
    print_status "Generated files:"
    ls -la dist/
    echo ""
    
    # Check for specific installer files
    if ls dist/*.dmg 1> /dev/null 2>&1; then
        print_success "macOS DMG installer created: $(ls dist/*.dmg)"
    fi
    
    if ls dist/*.exe 1> /dev/null 2>&1; then
        print_success "Windows EXE installer created: $(ls dist/*.exe)"
    fi
    
    if ls dist/*.AppImage 1> /dev/null 2>&1; then
        print_success "Linux AppImage created: $(ls dist/*.AppImage)"
    fi
else
    print_warning "No dist directory found. Build may have failed."
fi

echo ""
print_status "To test the application locally:"
echo "   npm run electron"
echo ""

print_success "🎉 Desktop build process completed!"
echo ""
print_status "Next steps:"
echo "1. Replace placeholder icons in electron/icons/ with actual app icons"
echo "2. Test the generated installers on target platforms"
echo "3. Consider code signing for distribution (especially for macOS)"
echo ""

# Cleanup
print_status "Cleaning up temporary files..."
rm -rf python_scripts/build/
rm -rf python_scripts/dist/
rm -rf python_scripts/*.spec

print_success "Build script finished!"
