#!/usr/bin/env bash
# Builds the app, starts the COMPILED server on its own port, runs every check, stops the server.
set -euo pipefail

PORT="${VERIFY_PORT:-3100}"
export PORT
export BASE_URL="http://localhost:${PORT}"
export RATE_LIMIT_ENABLED=false   # test:ratelimit starts its own server with limits ON
LOG=/tmp/taskflow-verify.log

echo "Building..."
npm run --silent build

node dist/server.js > "$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "$BASE_URL/health" > /dev/null && break
  sleep 1
done
if ! curl -sf "$BASE_URL/health" > /dev/null; then
  echo "The compiled server did not start. Last log lines:"
  tail -n 30 "$LOG"
  exit 1
fi
echo "Compiled server is up on $BASE_URL"

for step in test:unit test:integration smoke; do
  echo
  echo "==== npm run $step"
  npm run --silent "$step"
done

echo
echo "Everything passed."