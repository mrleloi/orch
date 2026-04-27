#!/usr/bin/env bash
# budget-check.sh — read budget-tracker.md, print status + exit non-zero over threshold
# Usage:
#   ./scripts/budget-check.sh             # current status
#   ./scripts/budget-check.sh --quiet     # silent; only exit code
#   ./scripts/budget-check.sh --cliff 250000   # override cliff threshold
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TRACKER="$PROJECT_DIR/agent-workspace/memory/budget-tracker.md"

CLIFF=250000
WIND_DOWN=200000
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) QUIET=1; shift ;;
    --cliff) CLIFF="$2"; shift 2 ;;
    --wind-down) WIND_DOWN="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ ! -f "$TRACKER" ]; then
  [ "$QUIET" = 0 ] && echo "[WARN] budget-tracker.md missing — cannot assess"
  exit 2
fi

# Parse "main_session_estimated_tokens: NNN" (or similar) from tracker
USED=$(grep -E '^[[:space:]]*main_session_estimated_tokens:' "$TRACKER" | head -1 | awk '{print $2}')
USED=${USED:-0}

PCT_CLIFF=$(( USED * 100 / CLIFF ))

STATUS="ok"
EXIT=0
if [ "$USED" -ge "$CLIFF" ]; then
  STATUS="CLIFF_EXCEEDED"; EXIT=3
elif [ "$USED" -ge "$WIND_DOWN" ]; then
  STATUS="WIND_DOWN_RECOMMENDED"; EXIT=1
fi

if [ "$QUIET" = 0 ]; then
  printf 'Budget tracker: %d / %d (%d%%) — status: %s\n' "$USED" "$CLIFF" "$PCT_CLIFF" "$STATUS"
  if [ "$EXIT" = 1 ]; then
    echo "  -> recommend: /context-save now; write checkpoint; wind-down protocol"
  elif [ "$EXIT" = 3 ]; then
    echo "  -> MANDATORY: stop dispatching subagents; handoff via scripts/session-handoff.sh"
  fi
fi
exit "$EXIT"
