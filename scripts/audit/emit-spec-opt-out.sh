#!/usr/bin/env bash
# emit-spec-opt-out.sh — verify "no-emit" hook configurations actually suppress emit hooks.
# Spec: task-partition-matrix.md §7 T-046 (ad-hoc gate). G.8 opt-out spec closure.
# Checks that any settings.json hook configuration claiming "no emit" (ORCH_HOOK_PROFILE=minimal
# or matcher that would skip component-telemetry.sh) does not also fire component-telemetry.sh.
# If component-telemetry.sh is wired to ALL PostToolUse events without profile guard, flags it.
# Exit: 0=PASS (opt-out respected or no emit hooks wired); 1=FAIL (spurious emit found); 2=SKIP

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

SETTINGS_FILE="${PROJECT_DIR}/.claude/settings.json"
TELEMETRY_HOOK="${PROJECT_DIR}/scripts/hooks/component-telemetry.sh"

if [[ ! -f "$SETTINGS_FILE" ]]; then
  printf '[SKIP] emit-spec-opt-out: .claude/settings.json not found\n' >&2
  exit 2
fi

FAILURES=0

# Check 1: if ORCH_HOOK_PROFILE=minimal is set AND component-telemetry.sh is in settings.json,
# verify the hook entry has a profile guard (only fires for non-minimal profiles).
CURRENT_PROFILE="${ORCH_HOOK_PROFILE:-standard}"

if [[ "$CURRENT_PROFILE" == "minimal" ]]; then
  # In minimal profile, component-telemetry.sh should NOT be firing
  # Check if settings.json binds component-telemetry.sh to PostToolUse unconditionally
  TELEMETRY_IN_SETTINGS=$(grep -c 'component-telemetry' "$SETTINGS_FILE" 2>/dev/null || echo 0)
  if [[ "$TELEMETRY_IN_SETTINGS" -gt 0 ]]; then
    # Check for a profile guard around the telemetry hook invocation
    PROFILE_GUARD=$(grep -A 10 'component-telemetry' "$SETTINGS_FILE" 2>/dev/null \
      | grep -cE '(minimal|ORCH_HOOK_PROFILE|hook_profile)' || echo 0)
    if [[ "$PROFILE_GUARD" -lt 1 ]]; then
      printf '[FAIL] emit-spec-opt-out: ORCH_HOOK_PROFILE=minimal but component-telemetry.sh' >&2
      printf ' has no profile guard in settings.json (emit opt-out not respected)\n' >&2
      FAILURES=$((FAILURES + 1))
    fi
  fi
fi

# Check 2: if component-telemetry.sh exists and is wired, verify the script itself
# has an opt-out guard (checks ORCH_HOOK_PROFILE != minimal or similar)
if [[ -f "$TELEMETRY_HOOK" ]]; then
  INTERNAL_GUARD=$(grep -cE '(ORCH_HOOK_PROFILE|minimal|opt.?out|no.?emit|DISABLE)' \
    "$TELEMETRY_HOOK" 2>/dev/null || echo 0)
  if [[ "$INTERNAL_GUARD" -lt 1 ]]; then
    printf '[WARN] emit-spec-opt-out: component-telemetry.sh has no internal profile/opt-out guard\n'
    printf '       Consumers relying on ORCH_HOOK_PROFILE=minimal to suppress emit may be surprised.\n'
    # This is a warning (not a hard fail) — the settings.json may gate it externally
  fi
fi

# Check 3: look for any spec-opt-out templates in utilities/templates/
# If a spec-opt-out template declares "no emit" but uses a hook that fires telemetry, flag it.
OPT_OUT_DIR="${PROJECT_DIR}/scripts/utilities/templates"
if [[ -d "$OPT_OUT_DIR" ]]; then
  while IFS= read -r -d '' tmpl; do
    NO_EMIT=$(grep -cE '(no.emit|opt.out.*emit|emit.*opt.out|disable.*telemetry)' \
      "$tmpl" 2>/dev/null || echo 0)
    HAS_EMIT=$(grep -cE 'component-telemetry' "$tmpl" 2>/dev/null || echo 0)
    if [[ "$NO_EMIT" -gt 0 && "$HAS_EMIT" -gt 0 ]]; then
      TMPL_NAME=$(basename "$tmpl")
      printf '[FAIL] emit-spec-opt-out: template %s claims no-emit but references component-telemetry\n' \
        "$TMPL_NAME" >&2
      FAILURES=$((FAILURES + 1))
    fi
  done < <(find "$OPT_OUT_DIR" -name "*.md" -o -name "*.yaml" -o -name "*.json" -print0 2>/dev/null)
fi

if [[ "$FAILURES" -eq 0 ]]; then
  printf '[PASS] emit-spec-opt-out: no spurious emit-hook opt-out violations found\n'
  exit 0
else
  printf '[FAIL] emit-spec-opt-out: %d violation(s) found\n' "$FAILURES" >&2
  exit 1
fi
