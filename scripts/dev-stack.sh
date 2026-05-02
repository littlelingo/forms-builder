#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

api_pid=""
web_pid=""

cleanup() {
  if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill "$api_pid" 2>/dev/null || true
  fi

  if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

./scripts/dev-api.sh &
api_pid=$!

./scripts/dev-web.sh &
web_pid=$!

echo "Frontend and backend are starting."
echo "Frontend: http://${WEB_HOST:-127.0.0.1}:${WEB_PORT:-5173}"
echo "Backend:  http://${API_HOST:-127.0.0.1}:${API_PORT:-8000}"
echo "Press Ctrl+C to stop both."

while true; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    wait "$api_pid" || true
    break
  fi

  if ! kill -0 "$web_pid" 2>/dev/null; then
    wait "$web_pid" || true
    break
  fi

  sleep 1
done
