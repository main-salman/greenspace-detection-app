#!/bin/bash

# Ultra-Lightweight Greenspace Detection App Builder
# Creates minimal desktop app that downloads Python dependencies on first run

set -e

echo "🚀 Building Ultra-Lightweight Greenspace Detection Desktop App"
echo "=============================================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Clean everything
print_status "Cleaning all build artifacts..."
rm -rf dist/ .next/ python_runtime/ python_scripts/{build,dist} out/

# Build Next.js in standalone mode
print_status "Building ultra-compact Next.js application..."
export NODE_ENV=production
npm run build

# Create minimal Electron package configuration
print_status "Updating package.json for minimal build..."

# Temporarily update package.json for ultra-light build
cat > package-electron.json << 'EOF'
{
  "name": "greenspace-app",
  "version": "0.1.0",
  "main": "electron/main.js",
  "build": {
    "appId": "com.greenspace.detection",
    "productName": "Greenspace Detection",
    "directories": {
      "output": "dist"
    },
    "files": [
      ".next/standalone/**/*",
      ".next/static/**/*", 
      "electron/main.js",
      "electron/preload.js",
      "python_scripts/*.py",
      "python_scripts/requirements.txt",
      "cities.json",
      "public/cities.json",
      "public/*.svg",
      "public/*.ico",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.utilities",
      "target": [{"target": "dir", "arch": ["arm64"]}]
    },
    "win": {
      "target": [{"target": "dir", "arch": ["x64"]}]
    },
    "compression": "maximum",
    "nsis": {
      "oneClick": true,
      "createDesktopShortcut": false,
      "createStartMenuShortcut": true
    }
  }
}
EOF

# Build ultra-light version
print_status "Building ultra-lightweight Electron app..."
npx electron-builder --config package-electron.json --mac --arm64

# Check the size
if [ -d "dist" ]; then
    print_status "Build size analysis:"
    du -sh dist/* | sort -hr
    echo ""
    
    app_size=$(du -sh dist/mac-arm64/*.app 2>/dev/null | cut -f1 || echo "N/A")
    print_success "Ultra-light app bundle size: $app_size"
    
    # Create a simple ZIP instead of DMG for even smaller distribution
    if [ -d "dist/mac-arm64" ]; then
        print_status "Creating ZIP distribution..."
        cd dist/mac-arm64
        zip -r "../Greenspace-Detection-Ultra-Light.zip" "Greenspace Detection.app"
        cd ../..
        
        zip_size=$(du -sh dist/Greenspace-Detection-Ultra-Light.zip | cut -f1)
        print_success "Ultra-light ZIP package: $zip_size"
    fi
fi

# Cleanup
rm -f package-electron.json

print_success "🎉 Ultra-lightweight build completed!"
echo ""
print_status "Distribution files:"
echo "📦 dist/Greenspace-Detection-Ultra-Light.zip - Download and unzip"
echo "📱 dist/mac-arm64/Greenspace Detection.app - Direct app bundle"
echo ""
print_warning "Note: This ultra-light version requires Python to be installed on the target machine"
print_warning "Or consider using the previous optimized build with bundled Python (~180MB)"
