#!/bin/bash

# Test script for Electron development
echo "🧪 Testing Electron Desktop App"
echo "================================"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check if Python environment is set up
if [ ! -d "venv" ]; then
    echo "Setting up Python environment..."
    ./setup.sh
fi

# Build Next.js app for Electron
echo "Building Next.js app..."
npm run build

# Start Electron app
echo "Starting Electron app..."
npm run electron
