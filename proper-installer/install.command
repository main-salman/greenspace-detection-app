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
