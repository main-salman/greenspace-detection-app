#!/bin/bash

# Optimized Greenspace Detection App - Lightweight Desktop Build Script
# Creates much smaller desktop applications by optimizing bundled content

set -e  # Exit on any error

echo "🚀 Building Optimized Greenspace Detection Desktop App"
echo "====================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf dist/
rm -rf .next/
rm -rf python_runtime/
rm -rf python_scripts/build/
rm -rf python_scripts/dist/

# Check prerequisites
print_status "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing Node.js dependencies..."
    npm install
fi

# Ensure Python environment exists
if [ ! -d "venv" ]; then
    print_status "Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r python_scripts/requirements.txt
else
    source venv/bin/activate
fi

# Step 1: Build Next.js for standalone mode
print_status "Building optimized Next.js application..."
export NODE_ENV=production
npm run build

# Step 2: Create minimal Python environment (no PyInstaller)
print_status "Creating lightweight Python environment..."
mkdir -p python_runtime

# Copy only essential Python files
cp -r venv/lib python_runtime/
cp -r venv/bin python_runtime/

# Remove unnecessary files to reduce size
print_status "Optimizing Python environment size..."
find python_runtime -name "*.pyc" -delete
find python_runtime -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find python_runtime -name "test*" -type d -exec rm -rf {} + 2>/dev/null || true
find python_runtime -name "*test*" -type d -exec rm -rf {} + 2>/dev/null || true
find python_runtime -name "*.so.debug" -delete 2>/dev/null || true

# Remove large unnecessary packages
print_status "Removing large unnecessary packages..."
rm -rf python_runtime/lib/python*/site-packages/{matplotlib/tests,scipy/tests,numpy/tests} 2>/dev/null || true
rm -rf python_runtime/lib/python*/site-packages/{IPython,jupyter*,notebook*} 2>/dev/null || true
rm -rf python_runtime/lib/python*/site-packages/pandas/tests 2>/dev/null || true

print_success "Python environment optimized!"

# Step 3: Create app icons (lightweight)
print_status "Creating lightweight app icons..."
mkdir -p electron/icons

# Create simple PNG icon if ImageMagick is available
if command -v convert &> /dev/null; then
    # Create a simple green circle icon
    convert -size 512x512 xc:transparent \
            -fill "#4CAF50" -draw "circle 256,256 256,100" \
            -fill "#2E7D32" -draw "circle 256,256 256,200" \
            -fill "white" -font Arial-Bold -pointsize 48 \
            -gravity center -annotate +0-20 "GS" \
            -gravity center -annotate +0+20 "DET" \
            electron/icons/icon.png
    
    # Convert to other formats
    convert electron/icons/icon.png -resize 256x256 electron/icons/icon-256.png
    convert electron/icons/icon.png electron/icons/icon.ico
    
    # Create ICNS for macOS if iconutil is available
    if command -v iconutil &> /dev/null; then
        mkdir -p electron/icons/icon.iconset
        convert electron/icons/icon.png -resize 16x16 electron/icons/icon.iconset/icon_16x16.png
        convert electron/icons/icon.png -resize 32x32 electron/icons/icon.iconset/icon_16x16@2x.png
        convert electron/icons/icon.png -resize 32x32 electron/icons/icon.iconset/icon_32x32.png
        convert electron/icons/icon.png -resize 64x64 electron/icons/icon.iconset/icon_32x32@2x.png
        convert electron/icons/icon.png -resize 128x128 electron/icons/icon.iconset/icon_128x128.png
        convert electron/icons/icon.png -resize 256x256 electron/icons/icon.iconset/icon_128x128@2x.png
        convert electron/icons/icon.png -resize 256x256 electron/icons/icon.iconset/icon_256x256.png
        convert electron/icons/icon.png -resize 512x512 electron/icons/icon.iconset/icon_256x256@2x.png
        convert electron/icons/icon.png -resize 512x512 electron/icons/icon.iconset/icon_512x512.png
        convert electron/icons/icon.png -resize 1024x1024 electron/icons/icon.iconset/icon_512x512@2x.png
        
        iconutil -c icns electron/icons/icon.iconset -o electron/icons/icon.icns
        rm -rf electron/icons/icon.iconset
    fi
else
    # Create minimal placeholder files
    touch electron/icons/icon.png
    touch electron/icons/icon.ico
    touch electron/icons/icon.icns
fi

# Step 4: Build optimized Electron app
print_status "Building optimized Electron application..."

# Build for current platform only to reduce size
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - build for current architecture only
    if [[ $(uname -m) == "arm64" ]]; then
        print_status "Building for Apple Silicon (ARM64)..."
        npx electron-builder --mac --arm64
    else
        print_status "Building for Intel (x64)..."
        npx electron-builder --mac --x64
    fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    print_status "Building for Windows..."
    npx electron-builder --win --x64
else
    print_status "Building for Linux..."
    npx electron-builder --linux --x64
fi

# Step 5: Display results
print_success "Optimized build completed!"
echo ""

if [ -d "dist" ]; then
    print_status "Generated files:"
    du -sh dist/* | sort -hr
    echo ""
    
    total_size=$(du -sh dist/ | cut -f1)
    print_success "Total build size: $total_size"
    
    # Check for specific installer files
    if ls dist/*.dmg 1> /dev/null 2>&1; then
        dmg_size=$(du -sh dist/*.dmg | cut -f1)
        print_success "macOS DMG installer: $dmg_size"
    fi
    
    if ls dist/*.exe 1> /dev/null 2>&1; then
        exe_size=$(du -sh dist/*.exe | cut -f1)
        print_success "Windows EXE installer: $exe_size"
    fi
else
    print_warning "No dist directory found. Build may have failed."
fi

echo ""
print_status "Optimization summary:"
echo "✅ Excluded source code and development files"
echo "✅ Used Next.js standalone build"
echo "✅ Minimal Python environment bundling"
echo "✅ Removed test files and cache"
echo "✅ Single architecture build"
echo ""

print_success "🎉 Optimized desktop build process completed!"
echo ""
print_status "File size comparison:"
echo "  Previous: ~350MB+ DMG files"
echo "  Optimized: Significantly smaller (check above)"
echo ""

# Cleanup
print_status "Cleaning up temporary files..."
rm -rf python_runtime/

print_success "Optimized build script finished!"
