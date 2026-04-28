#!/usr/bin/env bash
# settings-version-check.sh — Decision 035 §6 CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE.
# Claude Code reads .claude/settings.json ONCE at session start (Decision 035 §3.1).
# Mid-session edits are inert until next boot. This script detects drift.
#
# Usage:
#   bash scripts/audit/settings-version-check.sh --init   # SessionStart: capture baseline hash
#   bash scripts/audit/settings-version-check.sh          # audit: compare baseline vs on-disk
#
# Exit codes:
#   0 — PASS (hashes match OR --init succeeded)
#   1 — FAIL (divergence detected; settings.json edited mid-session; restart required)
#   2 — SKIP (no baseline; first run) OR PROJECT_DIR/settings.json not found
#
# NOT auto-wired into settings.json SessionStart per DR4 (Decision 035 §6): wiring in this
# session would be inert (read-once). Wire --init in v2.7 after a fresh session boot.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SETTINGS_FILE="${PROJECT_DIR}/.claude/settings.json"
MEMORY_DIR="${PROJECT_DIR}/agent-workspace/memory"
BASELINE_FILE="${MEMORY_DIR}/.settings-loaded-hash"

# sha256 helper — portable: Linux sha256sum, macOS shasum -a 256, Windows Git Bash sha256sum
sha256_of_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    printf '[WARN] settings-version-check: no sha256sum or shasum found\n' >&2
    echo "HASH_UNAVAILABLE"
  fi
}

if [[ ! -d "$PROJECT_DIR" ]]; then
  printf '[SKIP] settings-version-check: PROJECT_DIR not found: %s\n' "$PROJECT_DIR" >&2
  exit 2
fi

if [[ ! -f "$SETTINGS_FILE" ]]; then
  printf '[SKIP] settings-version-check: .claude/settings.json not found: %s\n' "$SETTINGS_FILE" >&2
  exit 2
fi

mkdir -p "$MEMORY_DIR"

# --init: SessionStart mode — capture baseline hash
if [[ "${1:-}" == "--init" ]]; then
  HASH="$(sha256_of_file "$SETTINGS_FILE")"
  printf '%s\n' "$HASH" > "$BASELINE_FILE"
  printf '[PASS] settings-version-check --init: baseline captured (hash=%s)\n' "${HASH:0:16}..." >&2
  exit 0
fi

# audit mode: compare baseline vs on-disk
if [[ ! -f "$BASELINE_FILE" ]]; then
  printf '[SKIP] settings-version-check: no baseline at %s; run --init at SessionStart.\n' "$BASELINE_FILE" >&2
  exit 2
fi

BASELINE_HASH="$(cat "$BASELINE_FILE" | tr -d '[:space:]')"
CURRENT_HASH="$(sha256_of_file "$SETTINGS_FILE")"

if [[ "$BASELINE_HASH" == "$CURRENT_HASH" ]]; then
  printf '[PASS] settings-version-check: in-memory hash matches on-disk (settings.json unchanged this session)\n'
  exit 0
else
  TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")"
  printf '[FAIL] settings-version-check: divergence detected — settings.json edited mid-session at %s; restart required (per Decision 035 §3.1)\n' "$TIMESTAMP" >&2
  printf '  baseline hash: %s\n' "$BASELINE_HASH" >&2
  printf '  current hash:  %s\n' "$CURRENT_HASH" >&2
  exit 1
fi
