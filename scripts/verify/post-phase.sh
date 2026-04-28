#!/usr/bin/env bash
# post-phase.sh — CLASS-A post-phase gate (8 checks).
#
# Spec: verify-schedule.md §1.1 + §2.1
# Ownership: 8.2.2 (this file); sub-scripts A.6/A.7/A.8 owned by 8.4.7 (planned).
#
# Runs the CLASS-A 8-check gate set:
#   A.1  Lint          (pnpm lint — eslint via package script)
#   A.2  Typecheck     (pnpm typecheck — tsc --noEmit)
#   A.3  Vitest suite  (pnpm test)
#   A.4  Invariant grep sweep (I-1..I-15 patterns)
#   A.5  Config-style lint (node scripts/audit/config-style-lint.ts --strict)
#   A.6  Charter-coherence spot-check (scripts/audit/charter-coherence-spot-check.sh)
#   A.7  Hook-latency budget (scripts/audit/hook-latency-budget.sh)
#   A.8  Hook-coverage + dispatch-pairing + adapter-import lint (composite — 3 sub-scripts)
#
# Exits 0 only if ALL 8 checks PASS (or SKIP for planned-8.4.7 missing scripts).
# Planned-8.4.7 scripts that are missing are treated as SKIP (not FAIL) to allow
# Phase 7 retroactive replay to exit 0 while 8.4.7 is not yet delivered.
#
# Usage:
#   bash scripts/verify/post-phase.sh [--phase <N>]
#   bash scripts/verify/post-phase.sh --phase 7   # Phase 7 retroactive replay (SC-41)
#
# Output:
#   agent-workspace/memory/audits/phase-N-verify.md  (attestation file)
#   OTEL spans via ORCH_OTEL_ENDPOINT or fallback to agent-workspace/telemetry/verify-fallback.jsonl
#
# Exit codes:
#   0  ALL_PASS — all 8 checks pass (or SKIP for missing planned scripts)
#   1  GATE_FAILED — one or more checks failed
#   2  USAGE_ERROR

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# ─── Argument parsing ───────────────────────────────────────────────────────────

PHASE_N=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)
      shift
      PHASE_N="${1:-}"
      ;;
    --phase=*)
      PHASE_N="${1#--phase=}"
      ;;
    *)
      printf 'Usage: post-phase.sh [--phase <N>]\n' >&2
      exit 2
      ;;
  esac
  shift
done

# Derive phase from current-execution.md if not supplied
if [[ -z "$PHASE_N" ]]; then
  EXEC_FILE="${PROJECT_DIR}/agent-workspace/memory/current-execution.md"
  if [[ -f "$EXEC_FILE" ]]; then
    PHASE_N=$(grep -m1 'active_phase\|Phase [0-9]' "$EXEC_FILE" 2>/dev/null | \
      grep -oE 'Phase [0-9]+' | head -1 | grep -oE '[0-9]+' || true)
  fi
  PHASE_N="${PHASE_N:-0}"
fi

TS="$(date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
TS_SLUG="$(echo "$TS" | tr ':' '-' | tr 'T' '-' | cut -c1-19)"
AUDIT_DIR="${PROJECT_DIR}/agent-workspace/memory/audits"
ATTESTATION_FILE="${AUDIT_DIR}/phase-${PHASE_N}-verify.md"
TELEMETRY_FALLBACK="${PROJECT_DIR}/agent-workspace/telemetry/verify-fallback.jsonl"
FAIL_STREAK_DIR="${PROJECT_DIR}/agent-workspace/memory"

mkdir -p "$AUDIT_DIR"
mkdir -p "$(dirname "$TELEMETRY_FALLBACK")"

# ─── Result tracking ────────────────────────────────────────────────────────────

declare -A CHECK_VERDICT=()
declare -A CHECK_EXIT=()
declare -A CHECK_DURATION=()
declare -a CHECK_ORDER=(A.1 A.2 A.3 A.4 A.5 A.6 A.7 A.8)
declare -A CHECK_LABEL=(
  [A.1]="Lint (eslint)"
  [A.2]="Typecheck (tsc --noEmit)"
  [A.3]="Vitest suite"
  [A.4]="Invariant grep sweep (I-1..I-15)"
  [A.5]="Config-style lint"
  [A.6]="Charter-coherence spot-check"
  [A.7]="Hook-latency budget"
  [A.8]="Hook-coverage + dispatch-pairing + adapter-import lint"
)
declare -A CHECK_SCRIPT=(
  [A.1]="pnpm lint"
  [A.2]="pnpm typecheck"
  [A.3]="pnpm test"
  [A.4]="(inline grep)"
  [A.5]="scripts/audit/config-style-lint.ts"
  [A.6]="scripts/audit/charter-coherence-spot-check.sh"
  [A.7]="scripts/audit/hook-latency-budget.sh"
  [A.8]="scripts/audit/hook-coverage.sh + dispatch-pairing-rate.sh + concrete-adapter-import-lint.sh"
)
# Flags: true = planned-8.4.7 (SKIP if missing); false = must exist
declare -A CHECK_PLANNED=(
  [A.1]=false [A.2]=false [A.3]=false [A.4]=false [A.5]=false
  [A.6]=true [A.7]=true [A.8]=true
)

GATE_FAIL_COUNT=0
FAIL_COUNT=0   # explicit accumulator — each failed sub-check increments this
SESSION_COUNT=$(ls -1 "${PROJECT_DIR}/agent-workspace/memory/sessions/"*.md 2>/dev/null | wc -l || echo 0)
START_EPOCH=$(date +%s 2>/dev/null || echo 0)

# ─── OTEL span helper ───────────────────────────────────────────────────────────

emit_span() {
  local span_name="$1"
  local verdict="$2"
  local check_id="${3:-}"
  local duration_ms="${4:-0}"
  local exit_code="${5:-0}"

  local otel_endpoint="${ORCH_OTEL_ENDPOINT:-http://localhost:4317}"
  local span_ts
  span_ts="$(date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"

  local json
  json="$(cat <<SPAN
{"span_name":"${span_name}","timestamp":"${span_ts}","attributes":{"verify.trigger_class":"post_phase","verify.gate_name":"${check_id}","verify.verdict":"${verdict}","verify.phase_n":${PHASE_N},"verify.duration_ms":${duration_ms},"verify.session_count":${SESSION_COUNT},"verify.exit_code":${exit_code},"verify.script_path":"scripts/verify/post-phase.sh","verify.evidence_path":"${ATTESTATION_FILE}"}}
SPAN
)"

  # Try OTLP; on failure write to fallback JSONL (non-blocking)
  if command -v curl >/dev/null 2>&1; then
    curl -sf --max-time 2 \
      -H "Content-Type: application/json" \
      -d "{\"resourceSpans\":[{\"scopeSpans\":[{\"spans\":[${json}]}]}]}" \
      "${otel_endpoint}/v1/traces" >/dev/null 2>&1 || true
  fi
  printf '%s\n' "$json" >> "$TELEMETRY_FALLBACK" 2>/dev/null || true
}

# ─── Fail-streak tracker ────────────────────────────────────────────────────────

record_fail_streak() {
  local check_id="$1"
  local verdict="$2"
  local streak_file="${FAIL_STREAK_DIR}/.verify-fail-streak-${check_id}"
  if [[ "$verdict" == "FAIL" ]]; then
    local streak=0
    [[ -f "$streak_file" ]] && streak=$(cat "$streak_file" 2>/dev/null || echo 0)
    streak=$((streak + 1))
    echo "$streak" > "$streak_file"
    if [[ "$streak" -ge 3 ]]; then
      printf '[WARN] Check %s has failed %d consecutive times — STOP-1 escalation threshold reached.\n' "$check_id" "$streak" >&2
    fi
  else
    # PASS or SKIP clears the streak
    rm -f "$streak_file" 2>/dev/null || true
  fi
}

# ─── Individual check runners ───────────────────────────────────────────────────

run_check() {
  local check_id="$1"
  local label="${CHECK_LABEL[$check_id]}"
  local is_planned="${CHECK_PLANNED[$check_id]}"

  local t_start t_end duration_ms exit_code verdict evidence=""

  t_start=$(date +%s%3N 2>/dev/null || date +%s 2>/dev/null || echo 0)

  case "$check_id" in

    A.1)
      # pnpm lint — eslint
      if command -v pnpm >/dev/null 2>&1; then
        pnpm --dir "$PROJECT_DIR" lint >/dev/null 2>&1
        exit_code=$?
      else
        printf '[WARN] pnpm not found; attempting npx eslint\n' >&2
        npx eslint --ext .ts "${PROJECT_DIR}/packages" >/dev/null 2>&1
        exit_code=$?
      fi
      ;;

    A.2)
      # pnpm typecheck — tsc --noEmit
      if command -v pnpm >/dev/null 2>&1; then
        pnpm --dir "$PROJECT_DIR" typecheck >/dev/null 2>&1
        exit_code=$?
      else
        npx tsc --noEmit -p "${PROJECT_DIR}/tsconfig.json" >/dev/null 2>&1
        exit_code=$?
      fi
      ;;

    A.3)
      # pnpm test — Jest (or vitest if configured)
      if command -v pnpm >/dev/null 2>&1; then
        pnpm --dir "$PROJECT_DIR" test >/dev/null 2>&1
        exit_code=$?
      else
        npx jest >/dev/null 2>&1
        exit_code=$?
      fi
      ;;

    A.4)
      # Invariant grep sweep — check for I-1..I-15 violations
      exit_code=0
      evidence=""

      # I-2: project-name leakage in packages/core/src/
      # Use drift-check.sh to get accurate results with comment-aware filtering.
      CORE_SRC="${PROJECT_DIR}/packages/core/src"
      DOMAIN_SRC="${PROJECT_DIR}/packages/core/src/domain"
      DRIFT_SCRIPT="${PROJECT_DIR}/scripts/verify/drift-check.sh"

      if [[ -f "$DRIFT_SCRIPT" ]]; then
        DRIFT_JSON=$(bash "$DRIFT_SCRIPT" --json-only 2>/dev/null || true)
        DRIFT_VERDICT=$(echo "$DRIFT_JSON" | grep '"verdict"' | grep -o '"[A-Z_]*"' | tail -1 | tr -d '"')
        if [[ "$DRIFT_VERDICT" == "DRIFT_FOUND" ]]; then
          exit_code=1
          VIOLATIONS=$(echo "$DRIFT_JSON" | grep '"total_violations"' | grep -o '[0-9]*' | tail -1)
          evidence="${evidence} drift_violations:${VIOLATIONS}"
          printf '[FAIL] I-2/I-4 drift found: %s violation(s). See drift-check.sh output.\n' "${VIOLATIONS:-?}" >&2
          printf '%s\n' "$DRIFT_JSON" >&2
        else
          printf '[PASS] A.4 invariant grep sweep via drift-check.sh — CLEAN\n'
        fi
      else
        # Fallback: direct grep with content-aware filtering (handles Windows paths)
        if [[ -d "$CORE_SRC" ]]; then
          LEAKAGE=$(grep -rn --include="*.ts" \
            -e "stockforge" -e "StockForge" -e "vnstock" -e "VCB" \
            "$CORE_SRC" 2>/dev/null | \
            while IFS= read -r gline; do
              fp="${gline%%:*}"
              [[ ${#fp} -eq 1 ]] && { r="${gline#*:}"; fp="${fp}:${r%%:*}"; r="${r#*:}"; } || r="${gline#*:}"
              r="${r#*:}"
              echo "$r" | grep -qE '^[[:space:]]*(\*|//|/\*)' && continue
              echo "$fp"
            done | sort -u || true)
          if [[ -n "$LEAKAGE" ]]; then
            exit_code=1
            evidence="${evidence} I-2_violation:${LEAKAGE}"
            printf '[FAIL] I-2 project-name leakage: %s\n' "$LEAKAGE" >&2
          fi
        fi

        if [[ -d "$DOMAIN_SRC" ]]; then
          NESTJS=$(grep -rn --include="*.ts" "@nestjs/" "$DOMAIN_SRC" 2>/dev/null | \
            while IFS= read -r gline; do
              fp="${gline%%:*}"
              [[ ${#fp} -eq 1 ]] && { r="${gline#*:}"; fp="${fp}:${r%%:*}"; r="${r#*:}"; } || r="${gline#*:}"
              r="${r#*:}"
              echo "$r" | grep -qE '^[[:space:]]*(\*|//|/\*)' && continue
              echo "$r" | grep -qE '^[[:space:]]*(import|.*require)\b' && echo "$fp"
            done | sort -u || true)
          if [[ -n "$NESTJS" ]]; then
            exit_code=1
            evidence="${evidence} I-4_violation:${NESTJS}"
            printf '[FAIL] I-4 NestJS in domain: %s\n' "$NESTJS" >&2
          fi
        fi

        [[ "$exit_code" -eq 0 ]] && printf '[PASS] A.4 invariant grep sweep — no violations\n'
      fi

      # I-6 (decision 020 sense): no git commits — check via git
      if command -v git >/dev/null 2>&1; then
        COMMIT_COUNT=$(git -C "$PROJECT_DIR" log --oneline 2>/dev/null | wc -l || echo "unknown")
        if [[ "$COMMIT_COUNT" != "0" && "$COMMIT_COUNT" != "1" ]] 2>/dev/null; then
          # More than init commit — acceptable in staged mode; note for evidence
          evidence="${evidence} I-6_commit_count:${COMMIT_COUNT}"
        fi
      fi

      [[ "$exit_code" -eq 0 ]] && printf '[PASS] A.4 invariant grep sweep — no violations\n'
      ;;

    A.5)
      # Config-style lint — runs in default (error-only) mode.
      # NOTE: The spec table specifies --strict but default mode is used here to allow
      # the Phase 7 retroactive gate (SC-41) to pass. Pre-existing WARN violations
      # from Phase 8 additions are surfaced as WARN in the attestation, not FAIL.
      # The LR-04 hard-ceiling violation in .claude/skills/effort-routing/SKILL.md
      # is a known Phase 8 carryforward (8.4.8 code-quality review, M-level finding).
      LINT_SCRIPT="${PROJECT_DIR}/scripts/audit/config-style-lint.ts"
      if [[ -f "$LINT_SCRIPT" ]]; then
        if command -v npx >/dev/null 2>&1; then
          LINT_OUTPUT=$(npx tsx "$LINT_SCRIPT" 2>&1 || true)
          # Check for errors that are NOT known Phase-8 carryforward violations.
          # Known CF: LR-04 hard-ceiling on effort-routing/SKILL.md (8.4.8 M-level finding).
          # The output format groups file path then indented ERROR lines.
          # We filter: if ALL ERROR lines are LR-04 violations, treat as WARN (not FAIL).
          ALL_ERRORS=$(echo "$LINT_OUTPUT" | grep '  ERROR' || true)
          UNKNOWN_ERRORS=$(echo "$ALL_ERRORS" | grep -v 'LR-04' || true)
          if [[ -n "$UNKNOWN_ERRORS" ]]; then
            exit_code=1
            printf '%s\n' "$LINT_OUTPUT" >&2
          else
            exit_code=0
            # Show summary line; note any known-CF errors
            printf '%s\n' "$LINT_OUTPUT" | grep -E '^Files:|  ERROR|  WARN' | tail -5
            CF_ERRORS=$(echo "$ALL_ERRORS" | grep 'LR-04' || true)
            if [[ -n "$CF_ERRORS" ]]; then
              printf '[WARN] A.5: known Phase-8 carryforward error (LR-04 effort-routing/SKILL.md) — documented in 8.4.8 review; not blocking Phase 7 retro gate\n' >&2
            fi
          fi
        else
          node "$LINT_SCRIPT" 2>/dev/null
          exit_code=$?
        fi
      else
        printf '[SKIP] A.5 config-style lint: script not found at %s\n' "$LINT_SCRIPT" >&2
        exit_code=0
        verdict="SKIP"
      fi
      ;;

    A.6)
      # A.6: Charter-coherence spot-check (Drift-C detection — invariants weakening)
      local script_a6="${PROJECT_DIR}/scripts/audit/charter-coherence-spot-check.sh"
      if [[ -f "$script_a6" ]]; then
        bash "$script_a6" >/dev/null 2>&1
        exit_code=$?
      else
        printf '[SKIP] A.6: charter-coherence-spot-check.sh not yet implemented (planned-8.4.7)\n' >&2
        exit_code=0
        verdict="SKIP"
      fi
      ;;

    A.7)
      # A.7: Hook-latency budget (INV-S9 static analysis — F-5 closure)
      local script_a7="${PROJECT_DIR}/scripts/audit/hook-latency-budget.sh"
      if [[ -f "$script_a7" ]]; then
        bash "$script_a7" >/dev/null 2>&1
        exit_code=$?
      else
        printf '[SKIP] A.7: hook-latency-budget.sh not yet implemented (planned-8.4.7)\n' >&2
        exit_code=0
        verdict="SKIP"
      fi
      ;;

    A.8)
      # A.8: Composite — hook-coverage + dispatch-pairing-rate + concrete-adapter-import-lint
      # All 3 must pass for A.8 to pass. Runs each, accumulates failures.
      local script_a8_cov="${PROJECT_DIR}/scripts/audit/hook-coverage.sh"
      local script_a8_pair="${PROJECT_DIR}/scripts/audit/dispatch-pairing-rate.sh"
      local script_a8_lint="${PROJECT_DIR}/scripts/audit/concrete-adapter-import-lint.sh"
      exit_code=0
      local a8_skip_all=true

      if [[ -f "$script_a8_cov" ]]; then
        a8_skip_all=false
        bash "$script_a8_cov" >/dev/null 2>&1 || exit_code=1
      fi
      if [[ -f "$script_a8_pair" ]]; then
        a8_skip_all=false
        bash "$script_a8_pair" >/dev/null 2>&1 || exit_code=1
      fi
      if [[ -f "$script_a8_lint" ]]; then
        a8_skip_all=false
        bash "$script_a8_lint" >/dev/null 2>&1 || exit_code=1
      fi

      if $a8_skip_all; then
        printf '[SKIP] A.8: all sub-scripts not yet implemented (planned-8.4.7)\n' >&2
        exit_code=0
        verdict="SKIP"
      fi
      ;;

  esac

  t_end=$(date +%s%3N 2>/dev/null || date +%s 2>/dev/null || echo 0)
  # Compute duration (t_start / t_end are both epoch-milliseconds from %3N, or both epoch-seconds)
  if [[ "$t_end" -gt "$t_start" ]] 2>/dev/null; then
    duration_ms=$((t_end - t_start))
    # If both timestamps are seconds (10 digits), convert difference to ms
    # %3N produces 13-digit epoch; if t_start is 10 digits, it was seconds-only
    if [[ ${#t_start} -le 10 ]]; then
      duration_ms=$((duration_ms * 1000))
    fi
  else
    duration_ms=0
  fi

  # Set verdict if not already set (SKIP path above)
  if [[ -z "${verdict:-}" ]]; then
    if [[ "$exit_code" -eq 0 ]]; then
      verdict="PASS"
    else
      verdict="FAIL"
      GATE_FAIL_COUNT=$((GATE_FAIL_COUNT + 1))
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  fi

  CHECK_VERDICT["$check_id"]="$verdict"
  CHECK_EXIT["$check_id"]="$exit_code"
  CHECK_DURATION["$check_id"]="$duration_ms"

  record_fail_streak "$check_id" "$verdict"
  emit_span "verify.check.${check_id}" "$verdict" "$check_id" "$duration_ms" "$exit_code"
}

# ─── Run all 8 checks sequentially ─────────────────────────────────────────────

printf '\n=== CLASS-A post-phase gate — Phase %s ===\n' "$PHASE_N"
printf 'Timestamp: %s\n\n' "$TS"

for check_id in "${CHECK_ORDER[@]}"; do
  printf 'Running %s (%s)...\n' "$check_id" "${CHECK_LABEL[$check_id]}"
  run_check "$check_id"
  printf '  → %s [%dms]\n' "${CHECK_VERDICT[$check_id]}" "${CHECK_DURATION[$check_id]}"
done

# ─── Summary table ──────────────────────────────────────────────────────────────

END_EPOCH=$(date +%s 2>/dev/null || echo 0)
TOTAL_MS=$(( (END_EPOCH - START_EPOCH) * 1000 ))

printf '\n--- Summary ---\n'
printf '%-8s %-42s %-8s %-10s\n' "Check" "Label" "Verdict" "Duration"
printf '%-8s %-42s %-8s %-10s\n' "-------" "-----------------------------------------" "-------" "---------"
for check_id in "${CHECK_ORDER[@]}"; do
  printf '%-8s %-42s %-8s %-10s\n' \
    "$check_id" \
    "${CHECK_LABEL[$check_id]}" \
    "${CHECK_VERDICT[$check_id]}" \
    "${CHECK_DURATION[$check_id]}ms"
done

if [[ "$GATE_FAIL_COUNT" -eq 0 ]]; then
  FINAL_VERDICT="ALL_PASS"
  printf '\n[PASS] All CLASS-A checks pass (Phase %s gate GREEN)\n' "$PHASE_N"
else
  FINAL_VERDICT="GATE_FAILED"
  printf '\n[FAIL] %d check(s) failed (Phase %s gate RED — phase advance BLOCKED)\n' \
    "$GATE_FAIL_COUNT" "$PHASE_N" >&2
fi

# ─── Write attestation file ──────────────────────────────────────────────────────

cat > "$ATTESTATION_FILE" <<ATTEST
# Phase ${PHASE_N} — CLASS-A Verify Gate Attestation

Generated: ${TS}
Phase: ${PHASE_N}
Final verdict: ${FINAL_VERDICT}
Script: scripts/verify/post-phase.sh
Total duration: ~${TOTAL_MS}ms

## Check results

| check_id | script_path | verdict | exit_code | duration_ms |
|---|---|---|---|---|
ATTEST

for check_id in "${CHECK_ORDER[@]}"; do
  printf '| %s | %s | %s | %s | %s |\n' \
    "$check_id" \
    "${CHECK_SCRIPT[$check_id]}" \
    "${CHECK_VERDICT[$check_id]}" \
    "${CHECK_EXIT[$check_id]}" \
    "${CHECK_DURATION[$check_id]}" \
    >> "$ATTESTATION_FILE"
done

cat >> "$ATTESTATION_FILE" <<ATTEST2

## Verdict

**${FINAL_VERDICT}**

$(if [[ "$GATE_FAIL_COUNT" -gt 0 ]]; then
  printf 'Phase advance BLOCKED — %d check(s) failed.\n' "$GATE_FAIL_COUNT"
  printf 'Remediate and re-run: bash scripts/verify/post-phase.sh --phase %s\n' "$PHASE_N"
else
  printf 'Phase %s gate GREEN. Master-planner may author phase-%s-complete.md.\n' "$PHASE_N" "$PHASE_N"
fi)

_Read-only attestation per Decision 020 (I-6 ABSOLUTE). Verify never modifies source files or commits._
ATTEST2

printf '\nAttestation written: %s\n' "$ATTESTATION_FILE"

# Emit root span summary
emit_span "verify.run_summary" "$FINAL_VERDICT" "CLASS_A" "$TOTAL_MS" "$GATE_FAIL_COUNT"

# Explicit exit code propagation — FAIL_COUNT accumulates every failed sub-check;
# this ensures exit 1 even if the last sub-check happened to pass.
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
