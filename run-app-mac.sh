#!/usr/bin/env bash
set -euo pipefail

# Greenspace Detection - macOS bootstrapper
# - Installs Node deps
# - Creates Python venv and installs requirements
# - Starts Next.js dev server in background
# - Opens browser at http://localhost:3000

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "🔧 Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ python3 is required"; exit 1; }

echo "📦 Installing Node dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "🐍 Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r python_scripts/requirements.txt

echo "🚀 Starting Next.js dev server..."
if [ -f .dev_pid ]; then
  if ps -p "$(cat .dev_pid)" >/dev/null 2>&1; then
    echo "ℹ️ Server already running (PID $(cat .dev_pid))."
  else
    rm -f .dev_pid
  fi
fi

if [ ! -f .dev_pid ]; then
  nohup npm run dev > .dev_log 2>&1 & echo $! > .dev_pid
  echo "📝 Logs: $ROOT_DIR/.dev_log"
fi

echo "⏳ Waiting for http://localhost:3000 to be ready..."
for i in {1..50}; do
  if curl -fsS http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

echo "🌐 Opening browser..."
open "http://localhost:3000" || true

echo "✅ Done. Press Ctrl+C to stop viewing logs; server keeps running."
echo "   To stop the server: kill $(cat .dev_pid) && rm -f .dev_pid"


