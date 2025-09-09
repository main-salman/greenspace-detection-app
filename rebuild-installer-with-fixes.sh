#!/bin/bash

# Rebuild installer with timeout fixes for 3% hanging issue

set -e

echo "🔧 Rebuilding installer with timeout fixes..."
echo "============================================="

# Clean up
rm -rf final-installer/ dist-web/
mkdir -p final-installer/app
mkdir -p dist-web

# Copy source files to correct structure
echo "📦 Setting up correct file structure..."
cp -r src/* final-installer/app/
cp package.json final-installer/app/
cp next.config.js final-installer/app/
cp postcss.config.mjs final-installer/app/
cp eslint.config.mjs final-installer/app/
cp cities.json final-installer/app/
cp -r public/* final-installer/app/
mkdir -p final-installer/app/outputs
echo "# Processing outputs directory" > final-installer/app/outputs/.gitkeep

# Copy Python scripts to proper python_scripts directory
mkdir -p final-installer/app/python_scripts
cp python_scripts/*.py final-installer/app/python_scripts/
cp python_scripts/requirements.txt final-installer/app/python_scripts/
cp python_scripts/requirements.txt final-installer/app/requirements.txt

# Fix tsconfig.json for installer structure
cat > final-installer/app/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

# Fix Tailwind config for installer structure
cat > final-installer/app/tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
EOF

# Create comprehensive installation script with better diagnostics
cat > final-installer/install.command << 'EOF'
#!/bin/bash

cd "$(dirname "$0")"

echo "🌱 Installing Greenspace Detection App (v2.0 - Timeout Fix)..."
echo "============================================================"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Robust Node.js detection
detect_nodejs() {
    print_status "Detecting Node.js installation..."
    
    NODE_PATHS=(
        "/usr/local/bin/node"
        "/opt/homebrew/bin/node"
        "$HOME/.nvm/versions/node/*/bin/node"
        "$(which node 2>/dev/null)"
    )
    
    NPM_PATHS=(
        "/usr/local/bin/npm"
        "/opt/homebrew/bin/npm"
        "$HOME/.nvm/versions/node/*/bin/npm"
        "$(which npm 2>/dev/null)"
    )
    
    # Find working Node.js
    for node_path in "${NODE_PATHS[@]}"; do
        if [[ -n "$node_path" ]] && [[ -x "$node_path" ]]; then
            NODE_CMD="$node_path"
            break
        fi
    done
    
    # Find working npm
    for npm_path in "${NPM_PATHS[@]}"; do
        if [[ -n "$npm_path" ]] && [[ -x "$npm_path" ]]; then
            NPM_CMD="$npm_path"
            break
        fi
    done
    
    if [[ -n "$NODE_CMD" ]] && $NODE_CMD --version >/dev/null 2>&1; then
        NODE_VERSION=$($NODE_CMD --version)
        print_success "Found Node.js: $NODE_VERSION at $NODE_CMD"
    else
        print_error "Node.js is not installed or not working properly."
        echo "   Visit: https://nodejs.org/"
        exit 1
    fi
    
    if [[ -n "$NPM_CMD" ]] && $NPM_CMD --version >/dev/null 2>&1; then
        NPM_VERSION=$($NPM_CMD --version)
        print_success "Found npm: $NPM_VERSION at $NPM_CMD"
    else
        print_error "npm is not installed or not working properly."
        exit 1
    fi
}

print_status "Checking prerequisites..."
detect_nodejs

if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check for Xcode Command Line Tools
print_status "Checking for Xcode Command Line Tools..."
if ! xcode-select -p &> /dev/null; then
    print_warning "Xcode Command Line Tools not found!"
    echo "📋 Please install: xcode-select --install"
    echo "🔄 Continue anyway? (y/N)"
    read -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success "Xcode Command Line Tools found"
fi

INSTALL_DIR="$HOME/Applications/Greenspace Detection"
print_status "Installing to: $INSTALL_DIR"

mkdir -p "$INSTALL_DIR"
cp -r app/* "$INSTALL_DIR/"
cd "$INSTALL_DIR"

print_status "Installing Node.js dependencies..."
if ! "$NPM_CMD" install --no-audit --no-fund; then
    print_warning "Trying without optional dependencies..."
    if ! "$NPM_CMD" install --no-audit --no-fund --no-optional; then
        print_error "Installation failed!"
        exit 1
    fi
fi

print_status "Setting up Python environment with enhanced timeout handling..."
python3 -m venv venv
source venv/bin/activate
pip install -r python_scripts/requirements.txt

# Verify scipy and key dependencies
if python3 -c "import scipy, rasterio, numpy" 2>/dev/null; then
    print_success "Python environment with all dependencies ready"
else
    print_warning "Some Python dependencies may have issues - continuing anyway"
fi

# Create launcher with better error handling
cat > launch.sh << 'LAUNCH_EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Starting Greenspace Detection App (Enhanced Timeout Version)..."

NODE_PATHS=(
    "/usr/local/bin/node"
    "/opt/homebrew/bin/node"
    "$HOME/.nvm/versions/node/*/bin/node"
    "$(which node 2>/dev/null)"
)

NPM_PATHS=(
    "/usr/local/bin/npm"
    "/opt/homebrew/bin/npm"
    "$HOME/.nvm/versions/node/*/bin/npm"
    "$(which npm 2>/dev/null)"
)

for node_path in "${NODE_PATHS[@]}"; do
    if [[ -n "$node_path" ]] && [[ -x "$node_path" ]]; then
        NODE_CMD="$node_path"
        break
    fi
done

for npm_path in "${NPM_PATHS[@]}"; do
    if [[ -n "$npm_path" ]] && [[ -x "$npm_path" ]]; then
        NPM_CMD="$npm_path"
        break
    fi
done

if lsof -i :3000 >/dev/null 2>&1; then
    echo "✅ App is already running!"
    open http://localhost:3000 2>/dev/null
    exit 0
fi

pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

source venv/bin/activate

echo "⏳ Starting Next.js server with enhanced satellite processing..."
"$NPM_CMD" run dev &
SERVER_PID=$!

for i in {1..30}; do
    if lsof -i :3000 >/dev/null 2>&1; then
        echo "✅ App started successfully!"
        echo "🛰️  Enhanced timeout handling for satellite processing active"
        sleep 1
        open http://localhost:3000 2>/dev/null
        break
    fi
    sleep 1
done

if ! lsof -i :3000 >/dev/null 2>&1; then
    echo "❌ Failed to start server on port 3000"
    exit 1
fi

wait $SERVER_PID
LAUNCH_EOF

chmod +x launch.sh

# Create desktop shortcut
DESKTOP_FILE="$HOME/Desktop/Greenspace Detection.command"
cat > "$DESKTOP_FILE" << 'DESKTOP_EOF'
#!/bin/bash
cd "$HOME/Applications/Greenspace Detection"
pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 1
./launch.sh
DESKTOP_EOF

chmod +x "$DESKTOP_FILE"

print_success "Desktop shortcut created"
print_success "Installation completed successfully!"

echo ""
echo "🚀 To launch: Double-click 'Greenspace Detection.command' on Desktop"
echo "📝 URL: http://localhost:3000"
echo "🛰️  This version includes enhanced timeout handling to prevent 3% hanging"
echo ""
echo "Press any key to close..."
read -n 1
EOF

chmod +x final-installer/install.command
cp final-installer/install.command final-installer/install.sh

# Create Windows installer
cat > final-installer/install.bat << 'EOF'
@echo off
echo Installing Greenspace Detection App (Enhanced Timeout Version)...

node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not installed
    pause
    exit /b 1
)

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not installed
    pause
    exit /b 1
)

set INSTALL_DIR=%USERPROFILE%\Applications\Greenspace Detection
mkdir "%INSTALL_DIR%" 2>nul
xcopy /s /e app\* "%INSTALL_DIR%\" >nul
cd /d "%INSTALL_DIR%"

echo Installing dependencies...
npm install
python -m venv venv
call venv\Scripts\activate
pip install -r python_scripts\requirements.txt

echo Creating launcher...
echo @echo off > launch.bat
echo cd /d "%%~dp0" >> launch.bat
echo call venv\Scripts\activate >> launch.bat
echo start http://localhost:3000 >> launch.bat
echo npm run dev >> launch.bat

echo Installation completed! Enhanced timeout handling active.
pause
EOF

# Create README
cat > final-installer/README.txt << 'EOF'
# Greenspace Detection App - Enhanced Timeout Version

## Quick Installation

### Mac:
1. Extract ZIP file
2. Double-click "install.command"
3. Double-click Desktop shortcut

### Windows:
1. Extract ZIP file  
2. Double-click "install.bat"
3. Run launch.bat

## What's Fixed in This Version

✅ Enhanced timeout handling for satellite data downloads
✅ Better progress reporting during processing
✅ Improved error messages for network issues
✅ Prevents hanging at 3% during satellite processing

## System Requirements

- Node.js 18+
- Python 3.8+
- Xcode Command Line Tools (Mac)
- Internet connection

## Troubleshooting

If processing still gets stuck:
1. Check internet connection
2. Try a different city or date range
3. Restart the app and try again

The enhanced timeout system will automatically retry failed downloads
and provide better feedback about what's happening.
EOF

# Create final ZIP
echo "📦 Creating enhanced installer..."
cd final-installer
zip -r "../dist-web/greenspace-detection-web-installer.zip" .
cd ..

rm -rf final-installer/

SIZE=$(du -sh dist-web/greenspace-detection-web-installer.zip | cut -f1)
echo "✅ Enhanced installer created: $SIZE"
echo "🛰️  Now includes timeout fixes to prevent 3% hanging"

