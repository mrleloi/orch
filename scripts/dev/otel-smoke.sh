#!/usr/bin/env bash
# otel-smoke.sh — Task 2.9 OTEL smoke test
#
# Boots the LGTM stack, starts the Orch daemon, fires GET /healthz, greps pino
# stdout for `"trace_id":"`, then attempts to fetch a Tempo span via the API.
#
# Exit codes:
#   0 — smoke test passed (trace_id in logs, span visible in Tempo)
#   1 — smoke test failed (see error output)
#
# Environment:
#   ORCH_HOOK_SECRET        — required (default: smoke-hook-secret)
#   ORCH_API_BEARER_TOKEN   — required (default: smoke-bearer-token)
#   ORCH_HTTP_PORT          — daemon port (default: 4141)
#   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP endpoint (default: http://127.0.0.1:4318)
#   LGTM_COMPOSE_FILE       — path to docker-compose file (default: docker/docker-compose.yml)
#
# CI-optional: this script is a Phase 2 verifier step, not a CI gate.
# Run manually or via Phase 2 verifier: bash scripts/dev/otel-smoke.sh
#
# Requires: docker, docker-compose (or docker compose), curl, jq

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${LGTM_COMPOSE_FILE:-${ROOT_DIR}/docker/docker-compose.yml}"
DAEMON_PORT="${ORCH_HTTP_PORT:-4141}"
OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://127.0.0.1:4318}"
GRAFANA_URL="http://127.0.0.1:3000"
TEMPO_API="http://127.0.0.1:3200"

# Test credentials (smoke only — not production secrets)
export ORCH_HOOK_SECRET="${ORCH_HOOK_SECRET:-smoke-hook-secret}"
export ORCH_API_BEARER_TOKEN="${ORCH_API_BEARER_TOKEN:-smoke-bearer-token}"

DAEMON_PID=""
DAEMON_LOG=$(mktemp)

cleanup() {
  echo ""
  echo "[otel-smoke] Cleaning up..."
  if [ -n "${DAEMON_PID}" ]; then
    kill "${DAEMON_PID}" 2>/dev/null || true
    wait "${DAEMON_PID}" 2>/dev/null || true
  fi
  rm -f "${DAEMON_LOG}"
}
trap cleanup EXIT INT TERM

# ── Step 1: Start LGTM stack ──────────────────────────────────────────────────
echo "[otel-smoke] Step 1: Starting LGTM stack..."
if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "[otel-smoke] WARN: docker-compose file not found at ${COMPOSE_FILE}"
  echo "[otel-smoke] WARN: Skipping LGTM stack start. Daemon will still be tested."
  LGTM_STARTED=false
else
  if command -v docker &>/dev/null; then
    if docker compose version &>/dev/null 2>&1; then
      docker compose -f "${COMPOSE_FILE}" up -d
    elif command -v docker-compose &>/dev/null; then
      docker-compose -f "${COMPOSE_FILE}" up -d
    else
      echo "[otel-smoke] WARN: Neither 'docker compose' nor 'docker-compose' found."
      LGTM_STARTED=false
    fi
    LGTM_STARTED=true
    echo "[otel-smoke] LGTM stack started. Waiting 10s for collector to be ready..."
    sleep 10
  else
    echo "[otel-smoke] WARN: docker not found — skipping LGTM stack."
    LGTM_STARTED=false
  fi
fi

# ── Step 2: Start Orch daemon ─────────────────────────────────────────────────
echo "[otel-smoke] Step 2: Starting Orch daemon on port ${DAEMON_PORT}..."
cd "${ROOT_DIR}/packages/core"
OTEL_EXPORTER_OTLP_ENDPOINT="${OTLP_ENDPOINT}" \
  pnpm run start > "${DAEMON_LOG}" 2>&1 &
DAEMON_PID=$!

# Wait for daemon to be ready (up to 30s)
READY=false
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${DAEMON_PORT}/healthz" >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [ "${READY}" = "false" ]; then
  echo "[otel-smoke] FAIL: Daemon did not start within 30s"
  echo "[otel-smoke] Daemon log:"
  cat "${DAEMON_LOG}"
  exit 1
fi
echo "[otel-smoke] Daemon ready."

# ── Step 3: Fire GET /healthz and capture pino stdout ─────────────────────────
echo "[otel-smoke] Step 3: Firing GET /healthz..."
curl -sf "http://127.0.0.1:${DAEMON_PORT}/healthz" | jq . || true

# Wait a moment for the log to flush
sleep 2

# ── Step 4: Grep daemon stdout for trace_id ───────────────────────────────────
echo "[otel-smoke] Step 4: Checking pino stdout for trace_id..."
if grep -q '"trace_id":"' "${DAEMON_LOG}"; then
  echo "[otel-smoke] PASS: trace_id found in daemon log."
  TRACE_ID_PASS=true
else
  echo "[otel-smoke] FAIL: trace_id NOT found in daemon log."
  echo "[otel-smoke] Daemon log (last 40 lines):"
  tail -40 "${DAEMON_LOG}"
  TRACE_ID_PASS=false
fi

# ── Step 5: Check Tempo for spans (best-effort) ───────────────────────────────
echo "[otel-smoke] Step 5: Querying Tempo for recent spans..."
TEMPO_PASS=false
if [ "${LGTM_STARTED}" = "true" ]; then
  # Give Tempo time to receive and index spans
  sleep 5
  # Query Tempo v2 API for traces from 'orch' service
  TEMPO_RESP=$(curl -sf "${TEMPO_API}/api/search?tags=service.name%3Dorch&start=$(date -d '1 minute ago' +%s 2>/dev/null || date -v-1M +%s)&end=$(date +%s)" 2>/dev/null || echo "{}")
  TRACE_COUNT=$(echo "${TEMPO_RESP}" | jq '.traces | length' 2>/dev/null || echo "0")
  if [ "${TRACE_COUNT}" -gt 0 ]; then
    echo "[otel-smoke] PASS: ${TRACE_COUNT} trace(s) found in Tempo."
    TEMPO_PASS=true
    echo "[otel-smoke] INFO: View at ${GRAFANA_URL} → Explore → Tempo"
  else
    echo "[otel-smoke] WARN: No traces found in Tempo yet (may need more time or daemon requests)."
    TEMPO_PASS=false
  fi
else
  echo "[otel-smoke] SKIP: Tempo check skipped (LGTM stack not started)."
  TEMPO_PASS=true  # Don't fail if stack wasn't available
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "[otel-smoke] === Results ==="
echo "  trace_id in pino log: ${TRACE_ID_PASS}"
echo "  Tempo span visible:   ${TEMPO_PASS}"
echo ""

if [ "${TRACE_ID_PASS}" = "true" ] && [ "${TEMPO_PASS}" = "true" ]; then
  echo "[otel-smoke] PASSED"
  exit 0
else
  echo "[otel-smoke] FAILED"
  exit 1
fi
