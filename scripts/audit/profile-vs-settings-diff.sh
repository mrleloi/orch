#!/usr/bin/env bash
# profile-vs-settings-diff.sh — diff .orch/profile.yaml vs .claude/settings.json for conflicts.
# Spec: task-partition-matrix.md §7 T-038 (per-substage gate).
# Detects conflicting keys: model and effort values set in both profile and settings.json.
# A conflict = the same key is declared in both files with different/incompatible values.
# Exit: 0=PASS (no conflicts or files absent); 1=FAIL (conflicts found); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

PROFILE_FILE="${PROJECT_DIR}/.orch/profile.yaml"
SETTINGS_FILE="${PROJECT_DIR}/.claude/settings.json"

# Skip if neither file present — not an orch-profile project
if [[ ! -f "$PROFILE_FILE" && ! -f "$SETTINGS_FILE" ]]; then
  printf '[SKIP] profile-vs-settings-diff: neither .orch/profile.yaml nor .claude/settings.json found\n' >&2
  exit 2
fi

if [[ ! -f "$PROFILE_FILE" ]]; then
  printf '[SKIP] profile-vs-settings-diff: .orch/profile.yaml not found (no profile to compare)\n' >&2
  exit 0
fi

if [[ ! -f "$SETTINGS_FILE" ]]; then
  printf '[SKIP] profile-vs-settings-diff: .claude/settings.json not found (no settings to compare)\n' >&2
  exit 0
fi

CONFLICTS=0

flag_conflict() {
  CONFLICTS=$((CONFLICTS + 1))
  printf '[CONFLICT] profile-vs-settings-diff: key "%s" — profile=%s settings=%s\n' \
    "$1" "$2" "$3" >&2
}

# Extract model from profile.yaml (line: model: <value>)
PROFILE_MODEL=$(grep -iE '^\s*model\s*:' "$PROFILE_FILE" 2>/dev/null \
  | head -1 | sed 's/.*model[[:space:]]*:[[:space:]]*//' | tr -d '"'"'" | tr -d '[:space:]' || true)

# Extract model from settings.json (key "model": "value")
SETTINGS_MODEL=$(grep -oE '"model"\s*:\s*"[^"]*"' "$SETTINGS_FILE" 2>/dev/null \
  | head -1 | sed 's/"model"[[:space:]]*:[[:space:]]*"//' | tr -d '"' || true)

if [[ -n "$PROFILE_MODEL" && -n "$SETTINGS_MODEL" && "$PROFILE_MODEL" != "$SETTINGS_MODEL" ]]; then
  flag_conflict "model" "$PROFILE_MODEL" "$SETTINGS_MODEL"
fi

# Extract effort from profile.yaml (line: effort: <value>)
PROFILE_EFFORT=$(grep -iE '^\s*effort\s*:' "$PROFILE_FILE" 2>/dev/null \
  | head -1 | sed 's/.*effort[[:space:]]*:[[:space:]]*//' | tr -d '"'"'" | tr -d '[:space:]' || true)

# Extract effort from settings.json
SETTINGS_EFFORT=$(grep -oE '"effort"\s*:\s*"[^"]*"' "$SETTINGS_FILE" 2>/dev/null \
  | head -1 | sed 's/"effort"[[:space:]]*:[[:space:]]*"//' | tr -d '"' || true)

if [[ -n "$PROFILE_EFFORT" && -n "$SETTINGS_EFFORT" && "$PROFILE_EFFORT" != "$SETTINGS_EFFORT" ]]; then
  flag_conflict "effort" "$PROFILE_EFFORT" "$SETTINGS_EFFORT"
fi

# Check for any keys from profile that also appear in settings.json top-level
# This is a heuristic scan for additional overlap (non-exhaustive)
PROFILE_KEYS=$(grep -E '^\s*[a-z_]+\s*:' "$PROFILE_FILE" 2>/dev/null \
  | sed 's/^\s*\([a-z_]*\)\s*:.*/\1/' | sort -u || true)

for key in $PROFILE_KEYS; do
  [[ "$key" == "model" || "$key" == "effort" ]] && continue  # already checked
  SETTINGS_VAL=$(grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$SETTINGS_FILE" 2>/dev/null \
    | head -1 | sed "s/\"${key}\"[[:space:]]*:[[:space:]]*\"//" | tr -d '"' || true)
  PROFILE_VAL=$(grep -iE "^\s*${key}\s*:" "$PROFILE_FILE" 2>/dev/null \
    | head -1 | sed "s/.*${key}[[:space:]]*:[[:space:]]*//" | tr -d '"'"'" | tr -d '[:space:]' || true)
  if [[ -n "$SETTINGS_VAL" && -n "$PROFILE_VAL" && "$SETTINGS_VAL" != "$PROFILE_VAL" ]]; then
    flag_conflict "$key" "$PROFILE_VAL" "$SETTINGS_VAL"
  fi
done

if [[ "$CONFLICTS" -eq 0 ]]; then
  printf '[PASS] profile-vs-settings-diff: no conflicting keys between profile and settings\n'
  exit 0
else
  printf '[FAIL] profile-vs-settings-diff: %d conflict(s) found\n' "$CONFLICTS" >&2
  exit 1
fi
