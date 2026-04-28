#!/usr/bin/env bash
# oss-readiness.sh — verify OSS publishing readiness checklist.
# Spec: task-partition-matrix.md §7 T-043 (per-phase gate).
# Checks: LICENSE, CONTRIBUTING.md, README.md install section, no hardcoded secrets,
#   package.json names not project-specific (no 'stockforge' / absolute paths).
# Exit: 0=PASS; 1=FAIL (≥1 check failed); 2=SKIP (PROJECT_DIR not found)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [[ ! -d "$PROJECT_DIR" ]]; then
  printf '[SKIP] oss-readiness: PROJECT_DIR not found: %s\n' "$PROJECT_DIR" >&2
  exit 2
fi

FAILURES=0

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[FAIL] oss-readiness: %s\n' "$1" >&2
}

# Check 1: LICENSE file present
[[ -f "${PROJECT_DIR}/LICENSE" ]] \
  || fail "LICENSE file missing (required for OSS publishing)"

# Check 2: CONTRIBUTING.md present
[[ -f "${PROJECT_DIR}/CONTRIBUTING.md" ]] \
  || fail "CONTRIBUTING.md missing"

# Check 3: README.md exists and has install-like section
if [[ -f "${PROJECT_DIR}/README.md" ]]; then
  grep -qiE '(install|npm install|pnpm install|yarn add|getting started|quick start)' \
    "${PROJECT_DIR}/README.md" 2>/dev/null \
    || fail "README.md exists but lacks install/getting-started instructions"
else
  fail "README.md missing"
fi

# Check 4: no hardcoded secrets patterns in source TS/JS
# Patterns: bare API keys, tokens, passwords assigned in code
SECRET_HITS=$(grep -r --include="*.ts" --include="*.js" \
  -E '(api_?key|secret|password|token|auth)\s*[=:]\s*["'"'"'][A-Za-z0-9/+_\-]{12,}["'"'"']' \
  "${PROJECT_DIR}/packages" 2>/dev/null \
  | grep -vE '(spec|test|mock|example|placeholder|YOUR_|REPLACE|process\.env)' \
  | grep -vE '^\s*//' || true)
if [[ -n "$SECRET_HITS" ]]; then
  COUNT=$(printf '%s\n' "$SECRET_HITS" | grep -c . || echo 0)
  fail "Possible hardcoded secret(s) in source: ${COUNT} match(es)"
fi

# Check 5: no project-specific names hardcoded in packages/core/ (non-comment lines only)
# Filter: skip comment lines (// ..., * ..., /* ...) and test/example files
SPECIFIC_HITS=$(grep -r --include="*.ts" \
  -iE '(stockforge|managed[_-]?project[_-]?name)' \
  "${PROJECT_DIR}/packages/core/src" 2>/dev/null \
  | grep -vE '(spec|test|example)' \
  | grep -vE '^\s*[/*]' \
  | grep -vE ':[[:space:]]*[/*]' || true)
if [[ -n "$SPECIFIC_HITS" ]]; then
  COUNT=$(printf '%s\n' "$SPECIFIC_HITS" | grep -c . || echo 0)
  fail "Project-specific name(s) in packages/core/src: ${COUNT} match(es) (I-P3 violation)"
fi

# Check 6: root package.json name should not be project-specific
ROOT_PKG="${PROJECT_DIR}/package.json"
if [[ -f "$ROOT_PKG" ]]; then
  PKG_NAME=$(grep '"name"' "$ROOT_PKG" | head -1 | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
  printf '%s\n' "$PKG_NAME" | grep -qiE '(stockforge|my[_-]?project)' \
    && fail "root package.json name is project-specific: ${PKG_NAME}"
fi

if [[ "$FAILURES" -eq 0 ]]; then
  printf '[PASS] oss-readiness: all checks clean\n'
  exit 0
else
  printf '[FAIL] oss-readiness: %d check(s) failed\n' "$FAILURES" >&2
  exit 1
fi
