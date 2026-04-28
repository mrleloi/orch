#!/usr/bin/env bash
# effort-prepend.sh — verify every DISPATCHED event in dispatch.jsonl has an /effort annotation.
# Spec: task-partition-matrix.md §7 T-048 (per-tool-use gate). Decision 027 §"Consequences" 5.
# Reads agent-workspace/memory/dispatch.jsonl; checks DISPATCHED rows for "effort" field.
# An /effort annotation is present if the dispatch row has "effort":"<mode>" key.
# Exit: 0=PASS (all dispatches annotated or insufficient data); 1=FAIL (missing annotations); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

DISPATCH_FILE="${PROJECT_DIR}/agent-workspace/memory/dispatch.jsonl"
MIN_EVENTS=3   # skip threshold check below this count

if [[ ! -f "$DISPATCH_FILE" ]]; then
  printf '[SKIP] effort-prepend: dispatch.jsonl not found at %s\n' "$DISPATCH_FILE" >&2
  exit 2
fi

TOTAL=0
MISSING=0

while IFS= read -r line; do
  [[ -z "$line" ]] && continue

  # Only check DISPATCHED rows
  EVENT=$(printf '%s\n' "$line" | grep -o '"event":"[^"]*"' | head -1 \
    | sed 's/"event":"//;s/"//')
  [[ "$EVENT" != *"DISPATCHED"* ]] && continue

  TOTAL=$((TOTAL + 1))

  # Check for "effort" key in the dispatch record
  HAS_EFFORT=0
  printf '%s\n' "$line" | grep -q '"effort"' 2>/dev/null && HAS_EFFORT=1
  if [[ "$HAS_EFFORT" -lt 1 ]]; then
    DISPATCH_ID=$(printf '%s\n' "$line" | grep -o '"dispatch_id":"[^"]*"' | head -1 \
      | sed 's/"dispatch_id":"//;s/"//')
    AGENT=$(printf '%s\n' "$line" | grep -o '"agent_type":"[^"]*"' | head -1 \
      | sed 's/"agent_type":"//;s/"//')
    printf '[MISSING] effort-prepend: dispatch_id=%s agent=%s has no /effort annotation\n' \
      "${DISPATCH_ID:-unknown}" "${AGENT:-unknown}" >&2
    MISSING=$((MISSING + 1))
  fi

done < "$DISPATCH_FILE"

if [[ "$TOTAL" -lt "$MIN_EVENTS" ]]; then
  printf '[SKIP] effort-prepend: only %d DISPATCHED event(s) (need >= %d for threshold check)\n' \
    "$TOTAL" "$MIN_EVENTS"
  exit 0
fi

RATE=$(awk "BEGIN { printf \"%d\", (($TOTAL - $MISSING) / $TOTAL) * 100 }" 2>/dev/null || echo 100)
printf 'effort-prepend: %d/%d dispatches annotated (%d%%)\n' \
  "$((TOTAL - MISSING))" "$TOTAL" "$RATE"

if [[ "$MISSING" -eq 0 ]]; then
  printf '[PASS] effort-prepend: all %d dispatch(es) have /effort annotation\n' "$TOTAL"
  exit 0
else
  printf '[FAIL] effort-prepend: %d dispatch(es) missing /effort annotation (Decision 027 §5)\n' \
    "$MISSING" >&2
  exit 1
fi
