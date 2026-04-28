#!/usr/bin/env bash
# hook-coverage.sh — assert required Claude Code hook events are wired in settings.json.
# Spec: task-partition-matrix.md §7 T-039 (per-phase).
# Exit: 0=PASS all required events wired; 1=FAIL missing event(s)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SETTINGS="${PROJECT_DIR}/.claude/settings.json"

REQUIRED_EVENTS=(PreToolUse PostToolUse Stop SessionStart)
MISSING_COUNT=0
MISSING_EVENTS=""

if [[ ! -f "$SETTINGS" ]]; then
  printf '[FAIL] hook-coverage: .claude/settings.json not found\n' >&2
  exit 1
fi

for event in "${REQUIRED_EVENTS[@]}"; do
  if ! grep -q "\"${event}\"" "$SETTINGS" 2>/dev/null; then
    MISSING_COUNT=$((MISSING_COUNT + 1))
    MISSING_EVENTS="${MISSING_EVENTS:+${MISSING_EVENTS}, }${event}"
    printf '[FAIL] hook-coverage: required event "%s" missing from settings.json\n' "$event" >&2
  fi
done

if [[ "$MISSING_COUNT" -eq 0 ]]; then
  printf '[PASS] hook-coverage: all required events wired (%s)\n' \
    "$(IFS=', '; echo "${REQUIRED_EVENTS[*]}")"
  exit 0
else
  printf '[FAIL] hook-coverage: %d missing event(s): %s\n' "$MISSING_COUNT" "$MISSING_EVENTS" >&2
  exit 1
fi
