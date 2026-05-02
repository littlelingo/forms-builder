#!/usr/bin/env bash

set -euo pipefail

PORT="${API_PORT:-8000}"
pattern="uvicorn.*form_builder_api\\.main:app.*--port ${PORT}"

pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -z "$pids" ]]; then
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
fi

if [[ -z "$pids" ]]; then
  echo "No backend process found on port ${PORT}."
  exit 0
fi

echo "Stopping backend on port ${PORT}: ${pids}"
kill $pids
