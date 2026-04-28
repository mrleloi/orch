#!/usr/bin/env bash
# architect-spec-vs-reality-loc.sh — measure architect LOC estimate vs implementer actual.
# Spec: task-partition-matrix.md §7 T-050 hybrid (per-substage gate). Mandate F closure.
# Reads agent-workspace/memory/sessions/ for task-implementer reports containing LOC data.
# Parses "Files Changed" sections for "N LOC" mentions; extracts planned vs actual delta.
# Reports sessions where actual LOC > 1.5× or < 0.5× spec estimate (Mandate F thresholds).
# Exit: 0=PASS (no outliers or insufficient data); 1=FAIL (outliers found); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

SESSIONS_DIR="${PROJECT_DIR}/agent-workspace/memory/sessions"
THRESHOLD_HIGH=150   # 1.5× → 150%
THRESHOLD_LOW=50     # 0.5× → 50%

if [[ ! -d "$SESSIONS_DIR" ]]; then
  printf '[SKIP] architect-spec-vs-reality-loc: sessions/ directory not found\n' >&2
  exit 2
fi

OUTLIERS=0
SESSIONS_CHECKED=0

# Look for session files that contain LOC estimates and actual LOC
while IFS= read -r -d '' session_file; do
  [[ -f "$session_file" ]] || continue
  FILENAME=$(basename "$session_file")

  # Look for lines with "est LOC", "target LOC" or "~N LOC" (spec estimate)
  # and lines with "actual N LOC" or "N LOC" in Files Changed section
  SPEC_LOC=$(grep -iE '(est(imated)? loc|target loc|~[0-9]+ loc|loc.*budget|budget.*loc)' \
    "$session_file" 2>/dev/null \
    | grep -oE '[0-9]+' | head -1 || true)

  ACTUAL_LOC=$(grep -iE '(actual [0-9]+ loc|[0-9]+ loc.*actual|\([0-9]+ loc\)|NEW[^|]*[0-9]+ LOC)' \
    "$session_file" 2>/dev/null \
    | grep -oE '[0-9]+' | head -1 || true)

  [[ -z "$SPEC_LOC" || -z "$ACTUAL_LOC" ]] && continue
  [[ "$SPEC_LOC" -lt 10 ]] && continue   # ignore trivially small estimates

  SESSIONS_CHECKED=$((SESSIONS_CHECKED + 1))

  # Compute ratio as integer percentage
  RATIO=$(awk "BEGIN { printf \"%d\", ($ACTUAL_LOC / $SPEC_LOC) * 100 }" 2>/dev/null || echo 100)

  if [[ "$RATIO" -gt "$THRESHOLD_HIGH" || "$RATIO" -lt "$THRESHOLD_LOW" ]]; then
    OUTLIERS=$((OUTLIERS + 1))
    printf '[OUTLIER] architect-spec-vs-reality-loc: %s — spec=%s actual=%s ratio=%d%%\n' \
      "$FILENAME" "$SPEC_LOC" "$ACTUAL_LOC" "$RATIO" >&2
  fi

done < <(find "$SESSIONS_DIR" -maxdepth 1 -name "*.md" -type f -print0 2>/dev/null)

if [[ "$SESSIONS_CHECKED" -lt 3 ]]; then
  printf '[SKIP] architect-spec-vs-reality-loc: only %d session(s) with LOC data (need >=3)\n' \
    "$SESSIONS_CHECKED"
  exit 0
fi

if [[ "$OUTLIERS" -eq 0 ]]; then
  printf '[PASS] architect-spec-vs-reality-loc: %d session(s) checked, no outliers (Mandate F clean)\n' \
    "$SESSIONS_CHECKED"
  exit 0
else
  printf '[FAIL] architect-spec-vs-reality-loc: %d outlier(s) in %d sessions (Mandate F violations)\n' \
    "$OUTLIERS" "$SESSIONS_CHECKED" >&2
  exit 1
fi
