#!/usr/bin/env bash
set -euo pipefail

# Greenspace Detection - macOS stop script
# Stops the Next.js dev server started by run-app-mac.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "🛑 Stopping Next.js dev server..."

if [ -f .dev_pid ]; then
  PID=$(cat .dev_pid)
  if ps -p "$PID" >/dev/null 2>&1; then
    echo "   Killing process $PID..."
    kill "$PID" || true
    # Wait a moment for graceful shutdown
    sleep 1
    # Force kill if still running
    if ps -p "$PID" >/dev/null 2>&1; then
      echo "   Force killing process $PID..."
      kill -9 "$PID" || true
    fi
    rm -f .dev_pid
    echo "✅ Server stopped."
  else
    echo "ℹ️  Process $PID not found (already stopped)."
    rm -f .dev_pid
  fi
else
  echo "ℹ️  No .dev_pid file found."
  # Fallback: check for process on port 3000
  PORT_PID=$(lsof -ti:3000 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    echo "   Found process $PORT_PID on port 3000, stopping it..."
    kill "$PORT_PID" || true
    sleep 1
    if ps -p "$PORT_PID" >/dev/null 2>&1; then
      kill -9 "$PORT_PID" || true
    fi
    echo "✅ Server stopped."
  else
    echo "ℹ️  No server found running on port 3000."
  fi
fi

