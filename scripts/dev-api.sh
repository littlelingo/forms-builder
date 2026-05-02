#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -x ".venv/bin/python3" ]]; then
  echo "Missing .venv/bin/python3. Install API dependencies first:"
  echo "  .venv/bin/pip install -e 'apps/api[dev]'"
  exit 1
fi

HOST="${API_HOST:-127.0.0.1}"
PORT="${API_PORT:-8000}"
RELOAD="${API_RELOAD:-1}"

echo "Starting backend on http://${HOST}:${PORT}"
if [[ "$RELOAD" == "0" ]]; then
  echo "Uvicorn reload is disabled."
  exec .venv/bin/python3 -m uvicorn form_builder_api.main:app \
    --app-dir apps/api/src \
    --host "$HOST" \
    --port "$PORT"
fi

echo "Uvicorn reload is enabled for backend code changes."

exec .venv/bin/python3 -m uvicorn form_builder_api.main:app \
  --app-dir apps/api/src \
  --reload \
  --host "$HOST" \
  --port "$PORT"
