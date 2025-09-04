#!/bin/bash

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
source venv/bin/activate
npm run dev &
sleep 5
open "http://localhost:3000"
echo "✅ App started! Opening in browser..."
echo "   If browser doesn't open, visit: http://localhost:3000"
LAUNCH_EOF

chmod +x launch.sh

# Create desktop shortcut
DESKTOP_FILE="$HOME/Desktop/Greenspace Detection.command"
cat > "$DESKTOP_FILE" << 'DESKTOP_EOF'
#!/bin/bash
cd "$HOME/Applications/Greenspace Detection"
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
