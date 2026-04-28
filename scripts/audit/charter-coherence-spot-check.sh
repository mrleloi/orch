#!/usr/bin/env bash
# charter-coherence-spot-check.sh — detect hard-rule keyword softening in constitution docs.
# Spec: task-partition-matrix.md §7 T-036 (per-phase, A.6 gate).
# Drift family closed: Drift-C (8.2.3 adversarial — invariants weakening undetected).
#
# Checks git diff HEAD on agent-workspace/constitution/ for:
#   1. Hard-rule keywords (MUST, NEVER, ABSOLUTE) removed + soft equivalents added
#   2. Net loss of NEVER/MUST/ABSOLUTE keyword lines
#   3. Bypass-permitting language added (may bypass, can bypass, do not prompt)
#   4. Strikethrough (~~) applied to hard-rule sentences
#   5. Red Flags "→ NO" items flipped to "→ YES"
#
# Exit: 0=CLEAN; 1=DRIFT_FOUND

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CONSTITUTION_DIR="${PROJECT_DIR}/agent-workspace/constitution"

VIOLATIONS=0
VIOLATION_DETAILS=""

add_violation() {
  VIOLATIONS=$((VIOLATIONS + 1))
  if [[ -n "$VIOLATION_DETAILS" ]]; then
    VIOLATION_DETAILS="${VIOLATION_DETAILS}
  $1"
  else
    VIOLATION_DETAILS="  $1"
  fi
}

if ! command -v git >/dev/null 2>&1; then
  printf '[SKIP] charter-coherence-spot-check: git not available\n' >&2; exit 0
fi
if ! git -C "$PROJECT_DIR" rev-parse HEAD >/dev/null 2>&1; then
  printf '[SKIP] charter-coherence-spot-check: not a git repo\n' >&2; exit 0
fi

# Collect diffs (working tree + staged)
FULL_DIFF=$(
  git -C "$PROJECT_DIR" diff HEAD -- "${CONSTITUTION_DIR}/" 2>/dev/null
  git -C "$PROJECT_DIR" diff --cached -- "${CONSTITUTION_DIR}/" 2>/dev/null
)

if [[ -n "$FULL_DIFF" ]]; then
  ADDED=$(printf '%s\n' "$FULL_DIFF" | grep '^+' | grep -v '^+++' || true)
  REMOVED=$(printf '%s\n' "$FULL_DIFF" | grep '^-' | grep -v '^---' || true)

  # Check 1: hard-rule keyword lines removed + soft replacement added
  HARD_PAT='\b(MUST|NEVER|REQUIRED|ALWAYS|ABSOLUTE|FORBIDDEN)\b'
  SOFT_PAT='\b(may |can |should |optional|recommended|allowed|permitted)\b'
  REMOVED_HARD=$(printf '%s\n' "$REMOVED" | grep -iE "$HARD_PAT" || true)
  if [[ -n "$REMOVED_HARD" ]]; then
    COUNT=$(printf '%s\n' "$REMOVED_HARD" | grep -c . || echo 0)
    ADDED_SOFT=$(printf '%s\n' "$ADDED" | grep -iE "$SOFT_PAT" || true)
    if [[ -n "$ADDED_SOFT" ]]; then
      add_violation "Hard-rule keyword(s) softened: ${COUNT} removed + soft replacements added"
    else
      add_violation "Hard-rule keyword line(s) deleted with no replacement: ${COUNT}"
    fi
  fi

  # Check 2: net loss of NEVER/MUST/ABSOLUTE
  for kw in NEVER MUST ABSOLUTE; do
    R=$(printf '%s\n' "$REMOVED" | grep -cE "\b${kw}\b" || true)
    A=$(printf '%s\n' "$ADDED" | grep -cE "\b${kw}\b" || true)
    R=${R:-0}; A=${A:-0}
    NET=$((R - A))
    [[ "$NET" -gt 0 ]] && add_violation "Net loss of ${kw} rule lines: ${NET} removed without replacement"
  done

  # Check 3: bypass-permitting language added
  # Two-step: find candidate bypass lines, then exclude denial-qualified lines
  # (lines that contain "→ NO," are Red-Flags denial blocks — not genuine softening)
  BYPASS_CANDIDATES=$(printf '%s\n' "$ADDED" | \
    grep -iE '(may bypass|can bypass|allowed to bypass|do not prompt|bypass.*confirm)' || true)
  BYPASS=$(printf '%s\n' "$BYPASS_CANDIDATES" | \
    grep -v '→ NO,' || true)
  if [[ -n "$BYPASS" ]]; then
    COUNT=$(printf '%s\n' "$BYPASS" | grep -c . || echo 0)
    add_violation "Bypass-permitting language added: ${COUNT} line(s)"
  fi

  # Check 4: strikethrough on hard-rule sentences
  STRUCK=$(printf '%s\n' "$ADDED" | \
    grep -E '~~[^~]+(MUST|NEVER|No |auto-destructive|confirmation)[^~]+~~' || true)
  if [[ -n "$STRUCK" ]]; then
    COUNT=$(printf '%s\n' "$STRUCK" | grep -c . || echo 0)
    add_violation "Hard-rule sentence struck through (~~): ${COUNT} line(s)"
  fi

  # Check 5: Red Flags "→ NO" flipped to "→ YES"
  NO_REM=$(printf '%s\n' "$REMOVED" | grep -E '→ NO[,.]? ' || true)
  YES_ADD=$(printf '%s\n' "$ADDED" | grep -E '→ YES' || true)
  if [[ -n "$NO_REM" && -n "$YES_ADD" ]]; then
    add_violation "Red Flags STOP rule flipped: '→ NO' removed and '→ YES' added"
  fi
fi

if [[ "$VIOLATIONS" -eq 0 ]]; then
  printf '[PASS] charter-coherence-spot-check: no hard-rule softening detected\n'
  exit 0
else
  printf '[FAIL] charter-coherence-spot-check: %d violation(s) detected\n' "$VIOLATIONS" >&2
  printf '%s\n' "$VIOLATION_DETAILS" >&2
  exit 1
fi
