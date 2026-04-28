#!/usr/bin/env bash
# hook-latency-budget.sh — static analysis for INV-S9 latency violations in hook scripts.
# Spec: task-partition-matrix.md §7 T-033 (per-phase, A.7 gate).
# INV-S9: hooks must complete <50ms median, <200ms p99. Drift family: F-5.
#
# Checks .claude/hooks/ and scripts/hooks/ for blocking constructs:
#   - bare sleep <N>  (not inside fire-and-forget subshell)
#   - synchronous curl/wget (not ending with &)
#
# Static analysis only — no runtime execution.
# Exit: 0=CLEAN; 1=VIOLATIONS found

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

VIOLATIONS=0
VIOLATION_FILES=""

add_violation() {
  VIOLATIONS=$((VIOLATIONS + 1))
  VIOLATION_FILES="${VIOLATION_FILES:+${VIOLATION_FILES}, }$(basename "$1")"
}

for hook_dir in "${PROJECT_DIR}/.claude/hooks" "${PROJECT_DIR}/scripts/hooks"; do
  [[ ! -d "$hook_dir" ]] && continue

  while IFS= read -r -d '' script; do
    case "$script" in *.sh|*.bash) ;; *) continue ;; esac

    FILE_FAIL=0

    # Blocking sleep: bare sleep not in a comment
    BARE_SLEEP=$(grep -nE '^\s*sleep\s+[0-9]' "$script" 2>/dev/null | \
      grep -vE '^\s*#' || true)
    if [[ -n "$BARE_SLEEP" ]]; then
      printf '[WARN] %s: bare sleep in hook path (INV-S9 risk)\n' "$script" >&2
      FILE_FAIL=1
    fi

    # Synchronous network: curl/wget not fire-and-forget (line not ending with &)
    SYNC_NET=$(grep -nE '^\s*(curl|wget)\s' "$script" 2>/dev/null | \
      grep -vE '&\s*$' | grep -vE '^\s*#' || true)
    if [[ -n "$SYNC_NET" ]]; then
      printf '[WARN] %s: synchronous network call (INV-S9 risk)\n' "$script" >&2
      FILE_FAIL=1
    fi

    [[ "$FILE_FAIL" -eq 1 ]] && add_violation "$script"

  done < <(find "$hook_dir" -maxdepth 2 -type f -print0 2>/dev/null)
done

if [[ "$VIOLATIONS" -eq 0 ]]; then
  printf '[PASS] hook-latency-budget: no blocking patterns in hook scripts (INV-S9 clean)\n'
  exit 0
else
  printf '[FAIL] hook-latency-budget: %d file(s) with blocking patterns: %s\n' \
    "$VIOLATIONS" "$VIOLATION_FILES" >&2
  exit 1
fi
