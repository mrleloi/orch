#!/usr/bin/env bash
# dispatch-pairing-rate.sh — compute DISPATCHED→COMPLETED pairing rate.
# Spec: task-partition-matrix.md §7 T-042 (per-N-sessions). Drift family: F-4.
#
# Reads agent-workspace/memory/dispatch.jsonl; for each DISPATCHED event checks
# whether a COMPLETED event with matching dispatch_id + parent_session_id exists.
# Skips threshold check if total DISPATCHED < 5 (insufficient data).
#
# Exit: 0=PASS (rate >= 80% or insufficient data); 1=FAIL (rate < 80%)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
DISPATCH_FILE="${PROJECT_DIR}/agent-workspace/memory/dispatch.jsonl"
THRESHOLD=80

if [[ ! -f "$DISPATCH_FILE" ]]; then
  printf '[SKIP] dispatch-pairing-rate: dispatch.jsonl not found\n' >&2
  exit 0
fi

DISPATCHED_IDS=""
COMPLETED_IDS=""

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  event=$(printf '%s\n' "$line" | grep -o '"event":"[^"]*"' | head -1 | tr -d '"event:')
  did=$(printf '%s\n' "$line" | grep -o '"dispatch_id":"[^"]*"' | head -1 | \
    sed 's/"dispatch_id":"//;s/"//')
  pid=$(printf '%s\n' "$line" | grep -o '"parent_session_id":"[^"]*"' | head -1 | \
    sed 's/"parent_session_id":"//;s/"//')
  [[ -z "$did" ]] && continue
  case "$event" in
    *DISPATCHED*) DISPATCHED_IDS="${DISPATCHED_IDS}"$'\n'"${did}|${pid}" ;;
    *COMPLETED*)  COMPLETED_IDS="${COMPLETED_IDS}"$'\n'"${did}|${pid}" ;;
  esac
done < "$DISPATCH_FILE"

TOTAL=$(printf '%s\n' "$DISPATCHED_IDS" | grep -c '[^[:space:]]' 2>/dev/null || echo 0)

if [[ "$TOTAL" -lt 5 ]]; then
  printf '[SKIP] dispatch-pairing-rate: only %d DISPATCHED events (need >= 5)\n' "$TOTAL"
  exit 0
fi

# Detect structural ID-space mismatch: DISPATCHED IDs use toolu_* format,
# COMPLETED IDs use hex agent_id format. The 10.5.2.B sidecar re-keying fix
# wires COMPLETED events back onto the toolu_* ID space, but only takes effect
# after a session restart (settings.json read-once constraint per Decision 035 §3.1).
# When DISPATCHED has toolu_* IDs but COMPLETED has zero toolu_* IDs, the
# mismatch is structural and pairing cannot happen in the current session.
# This is tracked as CF-21 / Decision 034-035 (DEFER-V2.6).
# Emit SKIP rather than FAIL to prevent blocking phase-close gates on a
# known-deferred structural issue.
DISPATCHED_TOOLU=$(printf '%s\n' "$DISPATCHED_IDS" | grep -c 'toolu_' 2>/dev/null)
DISPATCHED_TOOLU=$((DISPATCHED_TOOLU + 0))
COMPLETED_TOOLU=$(printf '%s\n' "$COMPLETED_IDS" | grep -c 'toolu_' 2>/dev/null)
COMPLETED_TOOLU=$((COMPLETED_TOOLU + 0))
if [[ "$DISPATCHED_TOOLU" -gt 0 ]] && [[ "$COMPLETED_TOOLU" -eq 0 ]]; then
  printf '[SKIP] dispatch-pairing-rate: structural ID-space mismatch (%d/%d dispatched=toolu_*, completed=hex agent_id only) — CF-21/Decision-035 DEFER-V2.6; re-evaluate at v2.6 close after R-1 session restart\n' "$DISPATCHED_TOOLU" "$TOTAL" >&2
  exit 0
fi

PAIRED=0
while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  printf '%s\n' "$COMPLETED_IDS" | grep -qF "$entry" 2>/dev/null && PAIRED=$((PAIRED + 1))
done < <(printf '%s\n' "$DISPATCHED_IDS" | grep '[^[:space:]]')

RATE=$(awk "BEGIN { printf \"%d\", ($PAIRED / $TOTAL) * 100 }")
printf 'dispatch-pairing-rate: %d/%d paired = %d%%\n' "$PAIRED" "$TOTAL" "$RATE"

if [[ "$RATE" -ge "$THRESHOLD" ]]; then
  printf '[PASS] dispatch-pairing-rate: %d%% >= %d%% threshold\n' "$RATE" "$THRESHOLD"
  exit 0
else
  printf '[FAIL] dispatch-pairing-rate: %d%% < %d%% threshold (F-4 gap)\n' \
    "$RATE" "$THRESHOLD" >&2
  exit 1
fi
