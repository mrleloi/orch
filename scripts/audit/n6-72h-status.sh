#!/usr/bin/env bash
# n6-72h-status.sh — report status of a running or completed N6 72h RSS verification.
# Spec: task-partition-matrix.md §7 T-035 (ad-hoc). Drift family: F-1.
# Reads n6-72h.pid written by n6-72h-launcher.sh; reports PID liveness,
#   elapsed time, last RSS sample from log, and estimated completion time.
# Exit: 0=RUNNING or COMPLETED; 1=NO_RUN_FOUND (no PID file); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

PID_FILE="${PROJECT_DIR}/agent-workspace/memory/n6-72h.pid"
LOG_FILE="${PROJECT_DIR}/agent-workspace/memory/n6-72h.log"
DURATION_SEC=259200   # 72h expected duration

if [[ ! -f "$PID_FILE" ]]; then
  printf '[INFO] n6-72h-status: no active run found (PID file missing).\n'
  printf '       Launch with: bash scripts/audit/n6-72h-launcher.sh\n'
  exit 1
fi

MEASURE_PID=$(sed -n '1p' "$PID_FILE" | tr -d '[:space:]')
START_TS=$(sed -n '2p' "$PID_FILE" | tr -d '[:space:]')
TARGET_PID=$(sed -n '3p' "$PID_FILE" | tr -d '[:space:]')

printf 'n6-72h-status:\n'
printf '  measure-rss PID : %s\n' "$MEASURE_PID"
printf '  target daemon PID: %s\n' "${TARGET_PID:-unknown}"
printf '  started         : %s\n' "${START_TS:-unknown}"

# Check if still running
if kill -0 "$MEASURE_PID" 2>/dev/null; then
  STATUS="RUNNING"
  printf '  status          : RUNNING\n'
else
  STATUS="STOPPED"
  printf '  status          : STOPPED (process no longer running)\n'
fi

# Compute elapsed from START_TS
NOW_EPOCH=$(date +%s 2>/dev/null || echo 0)
if [[ -n "$START_TS" ]]; then
  START_EPOCH=$(date -d "$START_TS" +%s 2>/dev/null \
    || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$START_TS" +%s 2>/dev/null \
    || echo 0)
  if [[ "$START_EPOCH" -gt 0 && "$NOW_EPOCH" -gt 0 ]]; then
    ELAPSED=$((NOW_EPOCH - START_EPOCH))
    ELAPSED_H=$((ELAPSED / 3600))
    REMAINING=$((DURATION_SEC - ELAPSED))
    REMAINING_H=$((REMAINING / 3600))
    printf '  elapsed         : %dh (%ds)\n' "$ELAPSED_H" "$ELAPSED"
    if [[ "$REMAINING" -gt 0 ]]; then
      printf '  remaining       : ~%dh\n' "$REMAINING_H"
    else
      printf '  remaining       : COMPLETE (past 72h window)\n'
    fi
  fi
fi

# Show last RSS sample from log
if [[ -f "$LOG_FILE" ]]; then
  LAST_LINE=$(grep -E '^\d{4}-|rss_kb|RSS' "$LOG_FILE" 2>/dev/null | tail -1 || true)
  [[ -n "$LAST_LINE" ]] && printf '  last log entry  : %s\n' "$LAST_LINE"
  EXIT_CODE=$(grep -oE 'exit (code )?[0-9]+' "$LOG_FILE" 2>/dev/null | tail -1 || true)
  [[ -n "$EXIT_CODE" ]] && printf '  exit status     : %s\n' "$EXIT_CODE"
fi

if [[ "$STATUS" == "RUNNING" ]]; then
  printf '[PASS] n6-72h-status: run in progress\n'
  exit 0
else
  printf '[INFO] n6-72h-status: run stopped — check log for results: %s\n' "$LOG_FILE"
  exit 0
fi
