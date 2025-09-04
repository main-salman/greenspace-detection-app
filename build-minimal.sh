#!/bin/bash

# Ultra-Minimal Greenspace Detection App Builder
# Target: Under 100MB for GitHub compatibility

set -e

echo "🎯 Building Ultra-Minimal Desktop App (Target: <100MB)"
echo "====================================================="

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Clean everything
print_status "Aggressive cleanup..."
rm -rf dist/ .next/ python_runtime/ python_scripts/{build,dist} out/

# Create ultra-minimal package.json for Electron
print_status "Creating ultra-minimal Electron configuration..."

# Backup original package.json
cp package.json package.json.backup

# Create minimal configuration
cat > package-minimal.json << 'EOF'
{
  "name": "greenspace-app",
  "version": "0.1.0",
  "main": "electron/main.js",
  "appId": "com.greenspace.detection",
  "productName": "Greenspace Detection",
  "directories": {
    "output": "dist"
  },
  "files": [
    ".next/standalone/server.js",
    ".next/standalone/.next/**/*",
    ".next/static/**/*",
    "electron/main.js",
    "electron/preload.js", 
    "electron/python-installer.js",
    "python_scripts/*.py",
    "python_scripts/requirements.txt",
    "cities.json",
    "public/cities.json",
    "public/*.svg"
  ],
  "compression": "maximum",
  "mac": {
    "category": "public.app-category.utilities",
    "target": [{"target": "zip", "arch": ["arm64"]}]
  },
  "win": {
    "target": [{"target": "zip", "arch": ["x64"]}]
  },
  "electronVersion": "32.3.3"
}
EOF

# Build Next.js in standalone mode
print_status "Building ultra-compact Next.js..."
export NODE_ENV=production
npm run build

# Check standalone build size
if [ -d ".next/standalone" ]; then
    standalone_size=$(du -sh .next/standalone | cut -f1)
    print_status "Next.js standalone size: $standalone_size"
fi

# Build minimal Electron app
print_status "Building minimal Electron app..."
npx electron-builder --config package-minimal.json --mac --arm64

# Check results
if [ -d "dist" ]; then
    print_status "Build results:"
    du -sh dist/* | sort -hr
    echo ""
    
    # Find the smallest package
    if ls dist/*.zip 1> /dev/null 2>&1; then
        zip_size=$(du -sh dist/*.zip | cut -f1)
        print_success "Minimal ZIP package: $zip_size"
        
        # Check if under 100MB
        size_mb=$(du -m dist/*.zip | cut -f1)
        if [ "$size_mb" -lt 100 ]; then
            print_success "🎯 SUCCESS! Under 100MB (${size_mb}MB) - GitHub compatible!"
        else
            print_warning "Still ${size_mb}MB - above 100MB limit"
        fi
    fi
    
    if ls dist/mac-arm64/*.app 1> /dev/null 2>&1; then
        app_size=$(du -sh dist/mac-arm64/*.app | cut -f1)
        print_status "Raw app bundle: $app_size"
    fi
fi

# Cleanup
rm -f package-minimal.json

print_success "🎉 Ultra-minimal build completed!"
echo ""
print_status "If still over 100MB, consider:"
echo "1. Web-only distribution (users run: npm install && npm run dev)"
echo "2. Separate Python installer download"
echo "3. On-demand dependency downloading"
