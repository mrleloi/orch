#!/usr/bin/env bash
# dry-run.sh — Verify npm tarball shape for all publishable Orch packages.
#
# For each package: runs `npm pack --dry-run --json`, checks tarball size (<5MB),
# and fails if any internal/credential paths are included.
#
# CF-30: also enforces a minimum tarball size (>=10KB) and minimum file count (>=3)
# to catch packages accidentally published before running `pnpm build`.
#
# Usage:
#   bash scripts/publish/dry-run.sh
#
# Exit codes:
#   0  — all packages pass
#   1  — one or more packages fail (see output for details)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Publishable packages — add @orch/shared or others here when they become public.
PACKAGES=(
  "packages/core"
  "packages/cli"
)

# Maximum allowed tarball size in bytes (5 MB).
MAX_BYTES=5000000

# CF-30: Minimum allowed tarball size in bytes (10 KB).
# A real package must be at least this large; anything smaller indicates a missing build step.
MIN_BYTES=10000

# CF-30: Minimum number of files a tarball must contain.
# A real package must have at least: package.json + dist entry + README/LICENSE = 3 files.
MIN_FILE_COUNT=3

# Patterns that must NOT appear in the file list.
FORBIDDEN_PATTERNS=(
  "agent-workspace/"
  ".test."
  ".spec."
  ".env"
  ".git/"
  "credentials"
  "secrets"
  "node_modules/"
  "coverage/"
  "*.log"
  "agent-workspace"
  "session-plans"
  "agent-workspace/memory"
  "agent-workspace/constitution"
)

OVERALL_PASS=true

check_package() {
  local pkg_rel="$1"
  local pkg_dir="$PROJECT_DIR/$pkg_rel"
  local pkg_name
  # Read package name using node from within the package directory to avoid
  # Windows/POSIX path translation issues with absolute POSIX paths.
  pkg_name="$(cd "$pkg_dir" && node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    process.stdout.write(p.name);
  " 2>/dev/null || echo "$pkg_rel")"

  echo ""
  echo "=========================================="
  echo "Checking: $pkg_name ($pkg_rel)"
  echo "=========================================="

  if [ ! -f "$pkg_dir/package.json" ]; then
    echo "ERROR: package.json not found at $pkg_dir/package.json"
    return 1
  fi

  # Run npm pack --dry-run --json from the package directory.
  local pack_output
  pack_output=$(cd "$pkg_dir" && npm pack --dry-run --json 2>/dev/null || true)

  if [ -z "$pack_output" ]; then
    echo "ERROR: npm pack produced no output for $pkg_name."
    echo "  Possible cause: package not built (dist/ missing). Run pnpm build first."
    return 1
  fi

  # Extract total tarball size (bytes).
  local tarball_size
  tarball_size=$(echo "$pack_output" | node -e "
    let raw = '';
    process.stdin.on('data', d => raw += d);
    process.stdin.on('end', () => {
      try {
        const arr = JSON.parse(raw);
        const entry = Array.isArray(arr) ? arr[0] : arr;
        process.stdout.write(String(entry.size || entry.unpackedSize || 0));
      } catch(e) {
        process.stdout.write('0');
      }
    });
  ")

  echo "Tarball size: $tarball_size bytes (min: $MIN_BYTES, max: $MAX_BYTES)"

  local size_ok=true

  # Maximum size check.
  if [ "$tarball_size" -gt "$MAX_BYTES" ] 2>/dev/null; then
    echo "FAIL: tarball size $tarball_size exceeds $MAX_BYTES bytes (5MB limit)."
    size_ok=false
  else
    echo "OK: size within maximum limit."
  fi

  # CF-30: Minimum-size assertion — reject suspiciously small tarballs.
  # A real package tarball should be at least 10KB. 659 bytes (observed 8.7.5) means
  # the package was not built before pack or the dist/ tree is absent.
  if [ "$tarball_size" -lt "$MIN_BYTES" ] 2>/dev/null || [ "$tarball_size" -eq 0 ] 2>/dev/null; then
    echo "FAIL: tarball size $tarball_size is below minimum $MIN_BYTES bytes (10KB). Run pnpm build first."
    size_ok=false
  fi

  # Extract file list.
  local file_list
  file_list=$(echo "$pack_output" | node -e "
    let raw = '';
    process.stdin.on('data', d => raw += d);
    process.stdin.on('end', () => {
      try {
        const arr = JSON.parse(raw);
        const entry = Array.isArray(arr) ? arr[0] : arr;
        const files = (entry.files || []).map(f => typeof f === 'string' ? f : f.path);
        process.stdout.write(files.join('\n'));
      } catch(e) {
        process.stdout.write('');
      }
    });
  ")

  echo ""
  echo "Files in tarball:"
  echo "$file_list" | sed 's/^/  /'

  # CF-30: Minimum file-count assertion — a real package must contain at least 3 files
  # (e.g. package.json + at least one dist file + README/LICENSE). Single-file or
  # empty tarballs indicate a missing build step.
  local file_count
  file_count=$(echo "$file_list" | grep -c '[^[:space:]]' 2>/dev/null || echo 0)
  echo ""
  echo "File count: $file_count (minimum: $MIN_FILE_COUNT)"
  if [ "$file_count" -lt "$MIN_FILE_COUNT" ] 2>/dev/null; then
    echo "FAIL: tarball contains only $file_count file(s); expected at least $MIN_FILE_COUNT. Run pnpm build first."
    size_ok=false
  else
    echo "OK: file count meets minimum."
  fi

  # Check for forbidden paths.
  local paths_ok=true
  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    # Use grep -F for literal pattern matching; suppress errors for empty input.
    local matches
    matches=$(echo "$file_list" | grep -iF "$pattern" 2>/dev/null || true)
    if [ -n "$matches" ]; then
      echo ""
      echo "FAIL: forbidden path pattern '$pattern' found in tarball:"
      echo "$matches" | sed 's/^/  /'
      paths_ok=false
    fi
  done

  if $paths_ok; then
    echo ""
    echo "OK: no forbidden paths in tarball."
  fi

  # Aggregate result for this package.
  if $size_ok && $paths_ok; then
    echo ""
    echo "PASS: $pkg_name"
    return 0
  else
    echo ""
    echo "FAIL: $pkg_name"
    return 1
  fi
}

# Run checks for all packages.
for pkg in "${PACKAGES[@]}"; do
  if ! check_package "$pkg"; then
    OVERALL_PASS=false
  fi
done

echo ""
echo "=========================================="
if $OVERALL_PASS; then
  echo "ALL PACKAGES PASS — tarball shape is clean."
  exit 0
else
  echo "ONE OR MORE PACKAGES FAILED — see details above."
  exit 1
fi
