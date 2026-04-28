#!/usr/bin/env bash
# concrete-adapter-import-lint.sh — detect concrete adapter imports in domain/.
# Spec: task-partition-matrix.md §7 T-040 ("grep new ClaudeCodeAdapter in domain/").
# Invariant: I-1 (adapter abstraction). Drift family: F-6.
# Exit: 0=CLEAN no concrete adapters in domain; 1=VIOLATIONS found

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
DOMAIN_SRC="${PROJECT_DIR}/packages/core/src/domain"

ADAPTER_PATTERN="ClaudeCodeAdapter|CodexAdapter"

if [[ ! -d "$DOMAIN_SRC" ]]; then
  printf '[SKIP] concrete-adapter-import-lint: packages/core/src/domain/ not found\n' >&2
  exit 0
fi

MATCHES=$(grep -rn --include="*.ts" \
  -E "(import|new)[[:space:]]+.*($ADAPTER_PATTERN)" \
  "$DOMAIN_SRC" 2>/dev/null | \
  while IFS= read -r line; do
    fp="${line%%:*}"
    [[ ${#fp} -eq 1 ]] && { r="${line#*:}"; fp="${fp}:${r%%:*}"; r="${r#*:}"; } || r="${line#*:}"
    r="${r#*:}"
    printf '%s\n' "$r" | grep -qE '^[[:space:]]*(\*|//|/\*)' && continue
    printf '%s\n' "$fp" | grep -qE '\.(spec|test)\.ts$' && continue
    printf '%s\n' "$fp"
  done | sort -u || true)

if [[ -z "$MATCHES" ]]; then
  printf '[PASS] concrete-adapter-import-lint: no concrete adapter imports in domain/ (I-1 clean)\n'
  exit 0
fi

COUNT=$(printf '%s\n' "$MATCHES" | grep -c . || echo 0)
printf '[FAIL] concrete-adapter-import-lint: %d file(s) in domain/ import concrete adapters (I-1 violation)\n' \
  "$COUNT" >&2
printf '%s\n' "$MATCHES" | while IFS= read -r f; do printf '  %s\n' "$f" >&2; done
printf 'Fix: use IAgentRuntime / IAGENT_RUNTIME token instead of concrete class.\n' >&2
exit 1
