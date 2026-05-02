#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${WEB_HOST:-127.0.0.1}"
PORT="${WEB_PORT:-5173}"

echo "Starting frontend on http://${HOST}:${PORT}"
echo "Vite dev mode is enabled, so frontend changes hot reload automatically."

exec npm run dev --workspace @form-builder/web -- --host "$HOST" --port "$PORT"

