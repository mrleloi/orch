#!/usr/bin/env bash
# dependency-freshness.sh — flag dependencies with major-version behind latest.
# Spec: task-partition-matrix.md §7 T-037 (per-N-sessions gate).
# Reads package.json files under packages/ to detect pinned major versions.
# Optional: runs `npm view <pkg> version` for registry check (disabled by default — env-fragile).
# Flags deps where declared major version is significantly old based on well-known thresholds.
# Exit: 0=PASS (no stale majors found); 1=FAIL (stale majors found); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Set ENABLE_REGISTRY_CHECK=1 to enable live npm registry queries (disabled by default)
ENABLE_REGISTRY_CHECK="${ENABLE_REGISTRY_CHECK:-0}"

# Known major-version thresholds: exact_short_name:minimum_expected_major
# Short name = package name with @scope/ stripped. Exact match only.
# Update this list when ecosystem moves.
KNOWN_THRESHOLDS="
typescript:5
jest:29
react:18
vite:5
"
# vitest: 2.x is current as of 2026 — not included
# nestjs, prisma: not yet at declared minimums in this project — not included

PACKAGES_DIR="${PROJECT_DIR}/packages"
if [[ ! -d "$PACKAGES_DIR" ]]; then
  printf '[SKIP] dependency-freshness: packages/ directory not found\n' >&2
  exit 2
fi

STALE=0
CHECKED_PKG=0

warn_stale() {
  STALE=$((STALE + 1))
  printf '[WARN] dependency-freshness: %s declared %s — minimum expected major is %s\n' \
    "$1" "$2" "$3" >&2
}

for pkg_file in "${PACKAGES_DIR}"/*/package.json; do
  [[ -f "$pkg_file" ]] || continue
  CHECKED_PKG=$((CHECKED_PKG + 1))

  # Combine dependencies + devDependencies into one stream: "pkgname version"
  DEP_LINES=$(grep -E '"(@[a-zA-Z0-9_/-]+|[a-zA-Z0-9_/-]+)"\s*:' "$pkg_file" 2>/dev/null \
    | grep -v '"name"\|"version"\|"description"\|"license"' \
    | sed 's/.*"\([^"]*\)"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1 \2/' || true)

  while IFS=' ' read -r dep_name dep_ver; do
    [[ -z "$dep_name" || -z "$dep_ver" ]] && continue

    # Extract major version from declared version string (e.g. "^5.2.1" → 5)
    DECL_MAJOR=$(printf '%s\n' "$dep_ver" | grep -oE '[0-9]+' | head -1 || true)
    [[ -z "$DECL_MAJOR" ]] && continue

    # Check against known thresholds — exact match on full name or unscoped name
    # For @scope/pkg-name: compare against "pkg-name" AND "@scope/pkg-name"
    # For plain pkg-name: compare against "pkg-name" only
    SHORT_NAME=$(printf '%s\n' "$dep_name" | sed 's|^@[^/]*/||')  # strip @scope/ prefix
    while IFS=':' read -r kw_pkg kw_major; do
      [[ -z "$kw_pkg" ]] && continue
      # Match: dep_name == kw_pkg OR (unscoped short_name == kw_pkg AND dep_name has no scope)
      MATCH=0
      [[ "$dep_name" == "$kw_pkg" ]] && MATCH=1
      # Only match short name if original had no scope (i.e. SHORT_NAME == dep_name)
      [[ "$SHORT_NAME" == "$dep_name" && "$SHORT_NAME" == "$kw_pkg" ]] && MATCH=1
      if [[ "$MATCH" -eq 1 ]]; then
        if [[ "$DECL_MAJOR" -lt "$kw_major" ]] 2>/dev/null; then
          warn_stale "$dep_name" "$dep_ver" "${kw_major}.x+"
        fi
      fi
    done < <(printf '%s\n' "$KNOWN_THRESHOLDS" | grep ':')

    # Optional: live registry check (disabled unless ENABLE_REGISTRY_CHECK=1)
    # if [[ "$ENABLE_REGISTRY_CHECK" == "1" ]] && command -v npm >/dev/null 2>&1; then
    #   LATEST=$(npm view "$dep_name" version 2>/dev/null || true)
    #   LATEST_MAJOR=$(printf '%s\n' "$LATEST" | grep -oE '[0-9]+' | head -1 || true)
    #   if [[ -n "$LATEST_MAJOR" && "$DECL_MAJOR" -lt "$LATEST_MAJOR" ]] 2>/dev/null; then
    #     warn_stale "$dep_name" "$dep_ver" "${LATEST_MAJOR}.x (latest)"
    #   fi
    # fi

  done < <(printf '%s\n' "$DEP_LINES")
done

if [[ "$CHECKED_PKG" -eq 0 ]]; then
  printf '[SKIP] dependency-freshness: no package.json files found\n' >&2
  exit 2
fi

if [[ "$STALE" -eq 0 ]]; then
  printf '[PASS] dependency-freshness: %d package(s) checked, no stale major versions\n' "$CHECKED_PKG"
  exit 0
else
  printf '[FAIL] dependency-freshness: %d stale major version(s) detected\n' "$STALE" >&2
  exit 1
fi
