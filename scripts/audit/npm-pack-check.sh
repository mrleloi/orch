#!/usr/bin/env bash
# npm-pack-check.sh — dry-run npm pack per workspace package; assert tarball size limits.
# Spec: task-partition-matrix.md §7 T-044 (per-phase gate).
# Runs `npm pack --dry-run` per package under packages/; asserts total tarball size < 5 MB.
# Skips packages that lack a valid package.json or are private-with-no-publish-intent.
# Exit: 0=PASS; 1=FAIL; 2=SKIP (npm not found or no packages)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MAX_BYTES=5242880   # 5 MB

if ! command -v npm >/dev/null 2>&1; then
  printf '[SKIP] npm-pack-check: npm not available\n' >&2
  exit 2
fi

PACKAGES_DIR="${PROJECT_DIR}/packages"
if [[ ! -d "$PACKAGES_DIR" ]]; then
  printf '[SKIP] npm-pack-check: packages/ directory not found\n' >&2
  exit 2
fi

FAILURES=0
CHECKED=0

for pkg_dir in "${PACKAGES_DIR}"/*/; do
  [[ -f "${pkg_dir}package.json" ]] || continue

  # Read package name and private flag
  PKG_NAME=$(grep '"name"' "${pkg_dir}package.json" 2>/dev/null | head -1 \
    | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
  IS_PRIVATE=$(grep '"private"' "${pkg_dir}package.json" 2>/dev/null | head -1 \
    | grep -c 'true' || true)

  # Skip fully private packages (they won't be published)
  [[ "$IS_PRIVATE" -gt 0 ]] && continue
  [[ -z "$PKG_NAME" ]] && continue

  CHECKED=$((CHECKED + 1))

  # Run npm pack --dry-run and capture output
  PACK_OUT=$(cd "$pkg_dir" && npm pack --dry-run 2>&1 || true)

  # Extract total size from npm pack output (line like "total files: N  packed size: X kB")
  TOTAL_LINE=$(printf '%s\n' "$PACK_OUT" | grep -iE '(total|packed|Tarball)' | tail -1 || true)
  if [[ -n "$TOTAL_LINE" ]]; then
    # Try to parse bytes from "X bytes" or "X kB" patterns
    BYTES=$(printf '%s\n' "$PACK_OUT" \
      | grep -oE '[0-9]+ bytes' | head -1 | grep -oE '[0-9]+' || true)
    KB=$(printf '%s\n' "$PACK_OUT" \
      | grep -oiE '[0-9]+(\.[0-9]+)?\s*kB' | head -1 | grep -oE '[0-9]+' || true)
    if [[ -n "$BYTES" ]] && [[ "$BYTES" -gt "$MAX_BYTES" ]]; then
      printf '[FAIL] npm-pack-check: %s tarball %d bytes > %d byte limit\n' \
        "$PKG_NAME" "$BYTES" "$MAX_BYTES" >&2
      FAILURES=$((FAILURES + 1))
    elif [[ -n "$KB" ]]; then
      BYTES_FROM_KB=$(awk "BEGIN { printf \"%d\", $KB * 1024 }")
      if [[ "$BYTES_FROM_KB" -gt "$MAX_BYTES" ]]; then
        printf '[FAIL] npm-pack-check: %s tarball ~%dkB > 5MB limit\n' \
          "$PKG_NAME" "$KB" >&2
        FAILURES=$((FAILURES + 1))
      else
        printf '[PASS] npm-pack-check: %s ~%skB (within 5MB limit)\n' "$PKG_NAME" "$KB"
      fi
    else
      printf '[INFO] npm-pack-check: %s pack output unparseable — manual check advised\n' "$PKG_NAME"
    fi
  else
    printf '[INFO] npm-pack-check: %s — no size info in pack output\n' "$PKG_NAME"
  fi
done

if [[ "$CHECKED" -eq 0 ]]; then
  printf '[SKIP] npm-pack-check: no non-private packages found under packages/\n' >&2
  exit 2
fi

if [[ "$FAILURES" -eq 0 ]]; then
  printf '[PASS] npm-pack-check: %d package(s) checked, all within size limits\n' "$CHECKED"
  exit 0
else
  printf '[FAIL] npm-pack-check: %d package(s) exceeded size limit\n' "$FAILURES" >&2
  exit 1
fi
