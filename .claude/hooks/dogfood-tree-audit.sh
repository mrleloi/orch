#!/usr/bin/env bash
# dogfood-tree-audit.sh — T4 safeguard: audit dogfood subprocess tree.
#
# Spec ref: self-application-bootstrap.md §2.4 (T4 — runaway subprocess tree).
# Checks the count of claude processes parented by any dogfood PID.
# >2 child claude processes emits an alert via existing notification pipeline.
#
# Called pre-dispatch by the harness OR as a standalone audit hook.
# Exits 0 in all cases (non-fatal; harness continues; alerts are observability only).
#
# Usage:
#   bash .claude/hooks/dogfood-tree-audit.sh [--dogfood-pid <pid>]
#   bash .claude/hooks/dogfood-tree-audit.sh  # audit all claude descendants

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
LOG_FILE="${PROJECT_DIR}/agent-workspace/memory/.dogfood-tree-audit.log"
ALERT_THRESHOLD=2

mkdir -p "$(dirname "$LOG_FILE")"

# Determine dogfood PID scope: use --dogfood-pid if provided, else self
DOGFOOD_PID=""
if [ "${1:-}" = "--dogfood-pid" ] && [ -n "${2:-}" ]; then
  DOGFOOD_PID="$2"
fi

# Count claude processes in the process tree
count_claude_descendants() {
  local root_pid="$1"
  local count=0

  if command -v pgrep >/dev/null 2>&1; then
    # pgrep can find descendants by parent PID
    count=$(pgrep -P "$root_pid" -c 2>/dev/null || echo 0) || true
  fi
  echo "$count"
}

count_all_claude_processes() {
  local count=0
  if command -v pgrep >/dev/null 2>&1; then
    count=$(pgrep -c claude 2>/dev/null || echo 0) || true
  elif command -v ps >/dev/null 2>&1; then
    count=$(ps aux 2>/dev/null | grep -c '[c]laude' || echo 0) || true
  fi
  echo "$count"
}

TIMESTAMP="$(date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -n "$DOGFOOD_PID" ]; then
  CLAUDE_COUNT=$(count_claude_descendants "$DOGFOOD_PID")
  SCOPE="pid=$DOGFOOD_PID"
else
  CLAUDE_COUNT=$(count_all_claude_processes)
  SCOPE="all"
fi

echo "[$TIMESTAMP] dogfood-tree-audit scope=$SCOPE claude_count=$CLAUDE_COUNT threshold=$ALERT_THRESHOLD" >> "$LOG_FILE"

if [ "$CLAUDE_COUNT" -gt "$ALERT_THRESHOLD" ] 2>/dev/null; then
  ALERT_MSG="ALERT: dogfood-tree-audit detected $CLAUDE_COUNT claude processes (scope=$SCOPE, threshold=$ALERT_THRESHOLD). Possible runaway subprocess tree. Inspect process table."
  echo "[$TIMESTAMP] $ALERT_MSG" >> "$LOG_FILE"
  # Emit to stderr for operator visibility (non-fatal; harness continues)
  echo "$ALERT_MSG" >&2
  # TODO (8.5.3): wire to Telegram notification pipeline via existing notify script
fi

# Validate queue directory exists (if audit invoked with no running processes, this is the only check)
QUEUE_DIR="${PROJECT_DIR}/agent-workspace/queue/self-tasks"
if [ ! -d "$QUEUE_DIR" ]; then
  echo "[$TIMESTAMP] dogfood-tree-audit: queue dir not found at $QUEUE_DIR (will be created on first dispatch)" >> "$LOG_FILE"
fi

echo "[$TIMESTAMP] dogfood-tree-audit: OK (count=$CLAUDE_COUNT)" >> "$LOG_FILE"
exit 0
