#!/bin/bash

# Greenspace Detection App Setup Script
# This script ensures all dependencies and directories are properly set up after cloning

echo "🌱 Setting up Greenspace Detection App..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    echo "   Visit: https://python.org/"
    exit 1
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Node.js dependencies"
    exit 1
fi

# Create Python virtual environment
echo "🐍 Setting up Python virtual environment..."
python3 -m venv venv

# Activate virtual environment and install Python dependencies
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    source venv/Scripts/activate
else
    # macOS/Linux
    source venv/bin/activate
fi

echo "📦 Installing Python dependencies..."
pip install -r python_scripts/requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Python dependencies"
    exit 1
fi

# Ensure required directories exist
echo "📁 Creating required directories..."
mkdir -p public/outputs
mkdir -p debug_output
mkdir -p test_output

# Check if cities.json exists
if [ ! -f "cities.json" ]; then
    echo "⚠️  Warning: cities.json not found in root directory"
    echo "   The app needs cities.json to function properly"
fi

# Check if public/cities.json exists
if [ ! -f "public/cities.json" ]; then
    echo "⚠️  Warning: public/cities.json not found"
    echo "   Copying cities.json to public/ directory..."
    if [ -f "cities.json" ]; then
        cp cities.json public/cities.json
        echo "✅ Copied cities.json to public/ directory"
    else
        echo "❌ Cannot copy cities.json - file not found"
    fi
fi

echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "🚀 To start the application:"
echo "   npm run dev"
echo ""
echo "📝 The app will be available at: http://localhost:3000"
echo ""
echo "🔧 For Python processing to work, make sure you have:"
echo "   - GDAL installed on your system"
echo "   - Internet connection for satellite data downloads"
echo ""
