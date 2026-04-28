#!/usr/bin/env bash
# drift-check.sh — B.2 drift-check gate.
#
# Spec: verify-schedule.md §2.2 B.2 (charter-cite spot-check / drift patterns).
# Also consumed by: post-phase.sh (CLASS-A check A.4 complement), post-n-sessions.sh (B.2).
#
# Checks for known drift patterns:
#   1. Project-name leakage in packages/core/src/ (I-2: project-agnostic core)
#      Patterns: stockforge, StockForge, vnstock, VCB
#   2. NestJS imports in packages/core/src/domain/ (architecture.md domain-zero-framework)
#   3. Hardcoded absolute paths in packages/core/src/ (I-5 indirect)
#   4. LLM calls in daemon state-machine code (I-1: daemon-dumb)
#   5. Direct cross-feature module imports in packages/core/src/ (architecture.md)
#
# Output: JSON summary to stdout with drift findings per KPI.
# Exit codes:
#   0  CLEAN — no drift patterns found
#   1  DRIFT_FOUND — one or more patterns matched
#   2  USAGE_ERROR
#
# Usage:
#   bash scripts/verify/drift-check.sh
#   bash scripts/verify/drift-check.sh --json-only   # suppress human-readable header

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CORE_SRC="${PROJECT_DIR}/packages/core/src"
DOMAIN_SRC="${PROJECT_DIR}/packages/core/src/domain"

JSON_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --json-only) JSON_ONLY=true ;;
  esac
done

# ─── KPI counters ───────────────────────────────────────────────────────────────

KPI_PROJECT_LEAKAGE=0
KPI_NESTJS_IN_DOMAIN=0
KPI_HARDCODED_PATHS=0
KPI_LLM_IN_DAEMON=0
KPI_CROSS_FEATURE_IMPORTS=0

LEAKAGE_FILES=""
NESTJS_FILES=""
HARDCODED_FILES=""
LLM_DAEMON_FILES=""
CROSS_FEATURE_FILES=""

# ─── Check 1: project-name leakage in packages/core/src/ ───────────────────────
# Excludes: comment-only lines (lines starting with // or * or /*) that merely
# QUOTE the invariant text (e.g., "no 'stockforge'"). We look for actual code use:
# string literals, identifiers, or import paths. Lines where the pattern appears
# inside a JSDoc comment quoting the invariant are excluded via context filter.

if [[ -d "$CORE_SRC" ]]; then
  # Grep output format: filepath:lineno:content
  # For comment-exclusion we need to test the CONTENT portion.
  # On Windows, paths contain 'C:/' making naive colon-splitting ambiguous.
  # Strategy: use perl-style regex via grep to match only lines where the
  # content (after the last filepath:lineno: prefix) is NOT a pure comment.
  #
  # We test by matching the pattern against lines that also contain non-comment code.
  # A line is "non-comment" if the content portion does NOT start with whitespace + (* or //)
  #
  # Implementation: extract content using sed (strip 'filepath:digits:' prefix while
  # preserving Windows drive letter paths), then filter.
  LEAKAGE_MATCHES=$(grep -rn --include="*.ts" --include="*.js" \
    -e "stockforge" -e "StockForge" -e "vnstock" -e "VCB" \
    "$CORE_SRC" 2>/dev/null | \
    while IFS= read -r line; do
      # Extract filepath: everything up to the last ':digits:' before the content
      # Handles both Unix (/path/file.ts:22:content) and Windows (C:/path/file.ts:22:content)
      # Strip the :digits:content suffix to get just the filepath
      filepath="${line%%:*}"
      # For Windows paths (single-char drive), include the next component
      if [[ ${#filepath} -eq 1 ]]; then
        rest="${line#*:}"
        filepath="${filepath}:${rest%%:*}"
        rest="${rest#*:}"  # skip to after filepath
      else
        rest="${line#*:}"
      fi
      # Now rest starts with lineno:content — strip lineno
      rest="${rest#*:}"
      # rest is now the content line
      # Skip if content is a pure comment (JSDoc or // line)
      if echo "$rest" | grep -qE '^[[:space:]]*(\*|//|/\*)'; then
        continue
      fi
      echo "$filepath"
    done | sort -u || true)
  if [[ -n "$LEAKAGE_MATCHES" ]]; then
    KPI_PROJECT_LEAKAGE=$(echo "$LEAKAGE_MATCHES" | grep -c . 2>/dev/null || echo 0)
    LEAKAGE_FILES=$(echo "$LEAKAGE_MATCHES" | tr '\n' ',' | sed 's/,$//')
  fi
fi

# ─── Check 2: @nestjs/* imports in packages/core/src/domain/ ───────────────────
# Specifically looks for actual import statements, not comment-only mentions.
# E.g., "ZERO @nestjs/* imports" in a JSDoc is not a violation.

if [[ -d "$DOMAIN_SRC" ]]; then
  # Only flag actual import/require statements, not JSDoc comments quoting the invariant.
  # Use same content-aware filtering to handle Windows paths.
  NESTJS_MATCHES=$(grep -rn --include="*.ts" \
    "@nestjs/" \
    "$DOMAIN_SRC" 2>/dev/null | \
    while IFS= read -r line; do
      filepath="${line%%:*}"
      if [[ ${#filepath} -eq 1 ]]; then
        rest="${line#*:}"
        filepath="${filepath}:${rest%%:*}"
        rest="${rest#*:}"
      else
        rest="${line#*:}"
      fi
      rest="${rest#*:}"  # strip lineno
      # Skip comment lines
      if echo "$rest" | grep -qE '^[[:space:]]*(\*|//|/\*)'; then
        continue
      fi
      # Only flag if this is an import/require statement
      if echo "$rest" | grep -qE '^[[:space:]]*(import|.*require)\b'; then
        echo "$filepath"
      fi
    done | sort -u || true)
  if [[ -n "$NESTJS_MATCHES" ]]; then
    KPI_NESTJS_IN_DOMAIN=$(echo "$NESTJS_MATCHES" | grep -c . 2>/dev/null || echo 0)
    NESTJS_FILES=$(echo "$NESTJS_MATCHES" | tr '\n' ',' | sed 's/,$//')
  fi
fi

# ─── Check 3: hardcoded absolute paths in packages/core/src/ ───────────────────
# Exclude test fixtures (*.spec.ts, *.test.ts) and exclude string interpolation
# patterns (e.g., `${HOME}/...`) — look for literal /home/, /Users/, C:\, etc.

if [[ -d "$CORE_SRC" ]]; then
  HARDCODED_MATCHES=$(grep -rnl --include="*.ts" \
    -e '"/home/' -e "'/home/" \
    -e '"/Users/' -e "'/Users/" \
    -e '"C:\\' -e "'C:\\" \
    -e '"C:/' -e "'C:/" \
    "$CORE_SRC" 2>/dev/null | grep -v '\.spec\.ts$' | grep -v '\.test\.ts$' || true)
  if [[ -n "$HARDCODED_MATCHES" ]]; then
    KPI_HARDCODED_PATHS=$(echo "$HARDCODED_MATCHES" | grep -c . 2>/dev/null || echo 0)
    HARDCODED_FILES=$(echo "$HARDCODED_MATCHES" | tr '\n' ',' | sed 's/,$//')
  fi
fi

# ─── Check 4: LLM calls in daemon state-machine logic ──────────────────────────
# Per I-1: LLM calls only inside workers, never in daemon logic.
# Daemon files are in packages/core/src/ excluding workers/, agents/, claude/ subdirs.
# Look for Anthropic SDK imports or direct model API calls in non-worker paths.

if [[ -d "$CORE_SRC" ]]; then
  # Find TS files that import Anthropic SDK or call claude models directly
  # in non-worker directories
  DAEMON_LLM_MATCHES=$(grep -rli --include="*.ts" \
    -e "from '@anthropic-ai/sdk'" \
    -e 'require("@anthropic-ai/sdk")' \
    -e "new Anthropic(" \
    "$CORE_SRC" 2>/dev/null | \
    grep -v '/workers/' | \
    grep -v '/agents/' | \
    grep -v '\.spec\.ts$' | \
    grep -v '\.test\.ts$' || true)
  if [[ -n "$DAEMON_LLM_MATCHES" ]]; then
    KPI_LLM_IN_DAEMON=$(echo "$DAEMON_LLM_MATCHES" | grep -c . 2>/dev/null || echo 0)
    LLM_DAEMON_FILES=$(echo "$DAEMON_LLM_MATCHES" | tr '\n' ',' | sed 's/,$//')
  fi
fi

# ─── Check 5: direct cross-feature module imports ──────────────────────────────
# Per architecture.md: no direct imports between feature modules via services.
# Feature modules (service-level): dispatch, telemetry, tenancy, session, queue
# NOTE: 'config' is a shared-constants module providing cross-cutting defaults;
#   importing config/defaults.* from a feature module is legitimate and excluded.
# NOTE: 'modules/' is the NestJS application-layer module dir; imports within
#   modules/ are also excluded (module DI wiring is expected there).
# Pattern: import from '../../<other-feature>/<service-file>' where the import
#   targets a service or class, not shared constants (defaults, types, errors).

if [[ -d "$CORE_SRC" ]]; then
  FEATURE_MODULES="dispatch telemetry tenancy session queue"
  for feat in $FEATURE_MODULES; do
    FEAT_DIR="${CORE_SRC}/${feat}"
    [[ ! -d "$FEAT_DIR" ]] && continue
    for other_feat in $FEATURE_MODULES; do
      [[ "$feat" == "$other_feat" ]] && continue
      CROSS_MATCHES=$(grep -rn --include="*.ts" \
        -e "from '.*/${other_feat}/" \
        -e "from \".*/${other_feat}/" \
        "$FEAT_DIR" 2>/dev/null | \
        # Exclude comment lines
        grep -v '^\s*[*/]\+' | grep -v '^\s*//' | \
        # Exclude imports of shared constants (defaults, types, errors, index)
        grep -v '/defaults' | grep -v '/types' | grep -v '/errors' | \
        grep -v "/${other_feat}/index" | \
        # Exclude test files
        grep -v '\.spec\.ts:' | grep -v '\.test\.ts:' | \
        cut -d: -f1 | sort -u || true)
      if [[ -n "$CROSS_MATCHES" ]]; then
        KPI_CROSS_FEATURE_IMPORTS=$((KPI_CROSS_FEATURE_IMPORTS + $(echo "$CROSS_MATCHES" | grep -c . 2>/dev/null || echo 0)))
        if [[ -n "$CROSS_FEATURE_FILES" ]]; then
          CROSS_FEATURE_FILES="${CROSS_FEATURE_FILES},$(echo "$CROSS_MATCHES" | tr '\n' ',' | sed 's/,$//')"
        else
          CROSS_FEATURE_FILES=$(echo "$CROSS_MATCHES" | tr '\n' ',' | sed 's/,$//')
        fi
      fi
    done
  done
fi

# ─── Aggregate verdict ──────────────────────────────────────────────────────────

TOTAL_VIOLATIONS=$((KPI_PROJECT_LEAKAGE + KPI_NESTJS_IN_DOMAIN + KPI_HARDCODED_PATHS + KPI_LLM_IN_DAEMON + KPI_CROSS_FEATURE_IMPORTS))

if [[ "$TOTAL_VIOLATIONS" -eq 0 ]]; then
  VERDICT="CLEAN"
  EXIT_CODE=0
else
  VERDICT="DRIFT_FOUND"
  EXIT_CODE=1
fi

# ─── JSON output ────────────────────────────────────────────────────────────────

TS="$(date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! $JSON_ONLY; then
  if [[ "$VERDICT" == "CLEAN" ]]; then
    printf '[PASS] drift-check: no drift patterns found\n'
  else
    printf '[FAIL] drift-check: %d violation(s) detected\n' "$TOTAL_VIOLATIONS" >&2
  fi
fi

cat <<EOF
{
  "verdict": "${VERDICT}",
  "timestamp": "${TS}",
  "total_violations": ${TOTAL_VIOLATIONS},
  "kpis": {
    "project_name_leakage": ${KPI_PROJECT_LEAKAGE},
    "nestjs_in_domain": ${KPI_NESTJS_IN_DOMAIN},
    "hardcoded_paths": ${KPI_HARDCODED_PATHS},
    "llm_in_daemon": ${KPI_LLM_IN_DAEMON},
    "cross_feature_imports": ${KPI_CROSS_FEATURE_IMPORTS}
  },
  "files": {
    "project_name_leakage": "${LEAKAGE_FILES}",
    "nestjs_in_domain": "${NESTJS_FILES}",
    "hardcoded_paths": "${HARDCODED_FILES}",
    "llm_in_daemon": "${LLM_DAEMON_FILES}",
    "cross_feature_imports": "${CROSS_FEATURE_FILES}"
  }
}
EOF

exit "$EXIT_CODE"
