#!/usr/bin/env bash

set -euo pipefail

PORT="${WEB_PORT:-5173}"
pattern="vite.*--host.*--port ${PORT}"

pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -z "$pids" ]]; then
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
fi

if [[ -z "$pids" ]]; then
  echo "No frontend process found on port ${PORT}."
  exit 0
fi

echo "Stopping frontend on port ${PORT}: ${pids}"
kill $pids
