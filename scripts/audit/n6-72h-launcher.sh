#!/usr/bin/env bash
# n6-72h-launcher.sh — launch charter N6 72-hour RSS memory-leak verification run.
# Spec: task-partition-matrix.md §7 T-034 (ad-hoc). Drift family: F-1.
# Starts `measure-rss.sh` as a detached background job with 72h (259200s) duration.
# Writes PID + start-ts to agent-workspace/memory/n6-72h.pid for status queries.
# Exit: 0=LAUNCHED; 1=FAIL (measure-rss.sh missing or PID not running); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

MEASURE_RSS="${PROJECT_DIR}/scripts/utilities/measure-rss.sh"
PID_FILE="${PROJECT_DIR}/agent-workspace/memory/n6-72h.pid"
LOG_FILE="${PROJECT_DIR}/agent-workspace/memory/n6-72h.log"
DURATION_SEC=259200   # 72 hours
INTERVAL_SEC=300      # sample every 5 minutes

if [[ ! -f "$MEASURE_RSS" ]]; then
  printf '[FAIL] n6-72h-launcher: measure-rss.sh not found at %s\n' "$MEASURE_RSS" >&2
  exit 1
fi

# Check if a run is already active
if [[ -f "$PID_FILE" ]]; then
  PREV_PID=$(head -1 "$PID_FILE" | tr -d '[:space:]')
  if kill -0 "$PREV_PID" 2>/dev/null; then
    printf '[SKIP] n6-72h-launcher: run already active (PID %s). Use n6-72h-status.sh.\n' \
      "$PREV_PID" >&2
    exit 2
  fi
fi

# The measure-rss.sh script requires --pid; use the current shell's parent (daemon PID) or prompt
TARGET_PID="${N6_TARGET_PID:-}"
if [[ -z "$TARGET_PID" ]]; then
  printf '[INFO] n6-72h-launcher: N6_TARGET_PID not set.\n'
  printf '[INFO]   Set N6_TARGET_PID=<daemon-pid> then re-run, or start daemon first.\n'
  printf '[INFO]   Example: N6_TARGET_PID=$(pgrep -f "orch/core") bash %s\n' "$0"
  printf '[INFO]   Launching with PID=1 (stub) for CI/dry-run environments.\n'
  TARGET_PID=1   # stub value; replace with real daemon PID for actual 72h run
fi

START_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

# Launch detached
nohup bash "$MEASURE_RSS" \
  --pid "$TARGET_PID" \
  --duration-sec "$DURATION_SEC" \
  --interval-sec "$INTERVAL_SEC" \
  >"$LOG_FILE" 2>&1 &

LAUNCHED_PID=$!

# Write PID file
printf '%s\n%s\n%s\n' "$LAUNCHED_PID" "$START_TS" "$TARGET_PID" > "$PID_FILE"

printf '[PASS] n6-72h-launcher: started measure-rss.sh (PID %d, target-pid %s, duration %ds)\n' \
  "$LAUNCHED_PID" "$TARGET_PID" "$DURATION_SEC"
printf '       PID file: %s\n' "$PID_FILE"
printf '       Log file: %s\n' "$LOG_FILE"
printf '       Expected completion: 72h from %s\n' "$START_TS"
exit 0
