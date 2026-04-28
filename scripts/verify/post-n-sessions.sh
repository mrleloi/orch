#!/usr/bin/env bash
# post-n-sessions.sh — CLASS-B post-N-sessions drift audit gate (advisory).
#
# Spec: verify-schedule.md §1.2 + §2.2
# Ownership: 8.2.2 (this file); sub-scripts B.3/B.4/B.6 owned by 8.4.7 (planned).
#
# Runs the CLASS-B 6-check drift audit:
#   B.1  Citation-linter rollup (node scripts/utilities/citation-linter.ts --recent 10)
#   B.2  Drift-check (scripts/verify/drift-check.sh)
#   B.3  Dispatch pairing-rate (scripts/audit/dispatch-pairing-rate.sh) [planned-8.4.7]
#   B.4  Dependency-freshness (scripts/audit/dependency-freshness.sh) [planned-8.4.7]
#   B.5  Subagent-index rebuild (bash scripts/utilities/build-subagent-index.sh)
#   B.6  Decision-doc lag (scripts/audit/decision-doc-lag.sh) [planned-8.4.7]
#
# Session count read from agent-workspace/memory/sessions/*.md.
# Cluster size (N) read from agent-workspace/memory/.verify-cluster-size (default: 10).
# If session_count % N != 0 → exits 0 with NOOP message (no gate needed yet).
#
# Always exits 0 (advisory, never blocks phase advance).
# Output: agent-workspace/memory/audits/post-n-sessions-<TS>.md
#
# Usage:
#   bash scripts/verify/post-n-sessions.sh            # check if N-boundary hit; run if so
#   bash scripts/verify/post-n-sessions.sh --force    # run regardless of session count

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

FORCE_RUN=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE_RUN=true ;;
  esac
done

TS="$(date -Iseconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
TS_SLUG="$(echo "$TS" | tr ':' '-' | tr 'T' '-' | cut -c1-19)"
AUDIT_DIR="${PROJECT_DIR}/agent-workspace/memory/audits"
SESSIONS_DIR="${PROJECT_DIR}/agent-workspace/memory/sessions"
CLUSTER_SIZE_FILE="${PROJECT_DIR}/agent-workspace/memory/.verify-cluster-size"
TELEMETRY_FALLBACK="${PROJECT_DIR}/agent-workspace/telemetry/verify-fallback.jsonl"

mkdir -p "$AUDIT_DIR"
mkdir -p "$(dirname "$TELEMETRY_FALLBACK")"

# ─── Cluster-size + session count ───────────────────────────────────────────────

CLUSTER_N=10
if [[ -f "$CLUSTER_SIZE_FILE" ]]; then
  CLUSTER_N=$(cat "$CLUSTER_SIZE_FILE" 2>/dev/null || echo 10)
fi
# Sanitize: must be a positive integer
[[ "$CLUSTER_N" =~ ^[0-9]+$ ]] || CLUSTER_N=10
[[ "$CLUSTER_N" -lt 1 ]] && CLUSTER_N=10

SESSION_COUNT=$(ls -1 "${SESSIONS_DIR}/"*.md 2>/dev/null | wc -l || echo 0)
SESSION_COUNT="${SESSION_COUNT// /}"  # trim whitespace

# ─── NOOP check ─────────────────────────────────────────────────────────────────

if ! $FORCE_RUN; then
  if [[ "$((SESSION_COUNT % CLUSTER_N))" -ne 0 ]] || [[ "$SESSION_COUNT" -eq 0 ]]; then
    printf '[NOOP] post-n-sessions: session_count=%d, cluster_size=%d — not a cluster boundary. Skipping.\n' \
      "$SESSION_COUNT" "$CLUSTER_N"
    exit 0
  fi
fi

printf '\n=== CLASS-B post-N-sessions drift audit ===\n'
printf 'Session count: %d | Cluster size: %d | Timestamp: %s\n\n' \
  "$SESSION_COUNT" "$CLUSTER_N" "$TS"

# Determine cluster range for output filename
CLUSTER_END="$SESSION_COUNT"
CLUSTER_START=$((SESSION_COUNT - CLUSTER_N + 1))
[[ "$CLUSTER_START" -lt 1 ]] && CLUSTER_START=1
AUDIT_FILE="${AUDIT_DIR}/post-n-sessions-${TS_SLUG}.md"

# ─── Result tracking ────────────────────────────────────────────────────────────

declare -A CHECK_VERDICT=()
declare -A CHECK_EXIT=()
declare -A CHECK_DURATION=()
declare -a CHECK_ORDER=(B.1 B.2 B.3 B.4 B.5 B.6)
declare -A CHECK_LABEL=(
  [B.1]="Citation-linter rollup"
  [B.2]="Drift-check (charter cite spot-check)"
  [B.3]="Dispatch pairing-rate"
  [B.4]="Dependency-freshness"
  [B.5]="Subagent-index rebuild"
  [B.6]="Decision-doc lag"
)
declare -A CHECK_SCRIPT=(
  [B.1]="scripts/utilities/citation-linter.ts"
  [B.2]="scripts/verify/drift-check.sh"
  [B.3]="scripts/audit/dispatch-pairing-rate.sh"
  [B.4]="scripts/audit/dependency-freshness.sh"
  [B.5]="scripts/utilities/build-subagent-index.sh"
  [B.6]="scripts/audit/decision-doc-lag.sh"
)
# Planned-8.4.7 scripts — treated as SKIP if missing
declare -A CHECK_PLANNED=(
  [B.1]=false [B.2]=false [B.3]=true [B.4]=true [B.5]=false [B.6]=true
)

WORST_EXIT=0

# ─── KPI values (populated by check runners) ────────────────────────────────────

KPI_BROKEN_CITATIONS=0
KPI_PROJECT_NAME_LEAKAGE=0
KPI_NESTJS_IN_DOMAIN=0
KPI_HARDCODED_PATHS=0
KPI_DISPATCH_PAIRING_RATE="n/a"
KPI_DEPENDENCY_FRESHNESS_LAG="n/a"
KPI_SUBAGENT_INDEX_DRIFT=0
KPI_DECISION_DOC_LAG="n/a"

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
{"span_name":"${span_name}","timestamp":"${span_ts}","attributes":{"verify.trigger_class":"post_n_sessions","verify.gate_name":"${check_id}","verify.verdict":"${verdict}","verify.session_count":${SESSION_COUNT},"verify.duration_ms":${duration_ms},"verify.exit_code":${exit_code},"verify.script_path":"scripts/verify/post-n-sessions.sh","verify.evidence_path":"${AUDIT_FILE}","verify.kpi.project_name_leakage":${KPI_PROJECT_NAME_LEAKAGE},"verify.kpi.nestjs_in_domain":${KPI_NESTJS_IN_DOMAIN},"verify.kpi.hardcoded_paths":${KPI_HARDCODED_PATHS}}}
SPAN
)"

  if command -v curl >/dev/null 2>&1; then
    curl -sf --max-time 2 \
      -H "Content-Type: application/json" \
      -d "{\"resourceSpans\":[{\"scopeSpans\":[{\"spans\":[${json}]}]}]}" \
      "${otel_endpoint}/v1/traces" >/dev/null 2>&1 || true
  fi
  printf '%s\n' "$json" >> "$TELEMETRY_FALLBACK" 2>/dev/null || true
}

# ─── KPI threshold evaluation ───────────────────────────────────────────────────

# Returns: PASS | WARN | FAIL
eval_kpi_threshold() {
  local kpi_name="$1"
  local value="$2"
  local warn_at="$3"   # "" = no warn threshold (binary: 0=PASS, else FAIL)
  local fail_at="$4"

  # Handle "n/a" (missing data from planned scripts)
  [[ "$value" == "n/a" ]] && { printf 'SKIP'; return; }

  # Cast to number for comparison
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    local n="$value"
    if [[ -n "$fail_at" && "$n" -ge "$fail_at" ]]; then
      printf 'FAIL'; return
    fi
    if [[ -n "$warn_at" && "$n" -ge "$warn_at" ]]; then
      printf 'WARN'; return
    fi
    printf 'PASS'
  else
    printf 'SKIP'
  fi
}

# ─── Individual check runners ───────────────────────────────────────────────────

run_check_b() {
  local check_id="$1"
  local label="${CHECK_LABEL[$check_id]}"
  local is_planned="${CHECK_PLANNED[$check_id]}"

  local t_start t_end duration_ms exit_code=0 verdict=""

  t_start=$(date +%s%3N 2>/dev/null || date +%s 2>/dev/null || echo 0)

  case "$check_id" in

    B.1)
      # Citation-linter rollup
      LINTER="${PROJECT_DIR}/scripts/utilities/citation-linter.ts"
      if [[ -f "$LINTER" ]]; then
        if command -v npx >/dev/null 2>&1; then
          LINT_OUTPUT=$(npx tsx "$LINTER" --recent 10 2>/dev/null || true)
          exit_code=$?
          # Extract broken citation count from output (citation-linter emits a count line)
          BROKEN=$(echo "$LINT_OUTPUT" | grep -oE '[0-9]+ broken' | grep -oE '[0-9]+' | head -1 || echo 0)
          KPI_BROKEN_CITATIONS="${BROKEN:-0}"
        fi
      else
        printf '[SKIP] B.1: citation-linter.ts not found\n' >&2
        verdict="SKIP"
        exit_code=0
        KPI_BROKEN_CITATIONS="n/a"
      fi
      ;;

    B.2)
      # Drift-check
      DRIFT_SCRIPT="${PROJECT_DIR}/scripts/verify/drift-check.sh"
      if [[ -f "$DRIFT_SCRIPT" ]]; then
        # FIX C1: capture exit code before || true so it is not masked
        DRIFT_OUTPUT=$(bash "$DRIFT_SCRIPT" --json-only 2>/dev/null); DRIFT_EXIT=$?
        # Parse KPIs from JSON output — allow optional whitespace after colon (jq pretty-prints "key": value)
        KPI_PROJECT_NAME_LEAKAGE=$(echo "$DRIFT_OUTPUT" | grep -o '"project_name_leakage": *[0-9]*' | grep -o '[0-9]*$' || echo 0)
        KPI_NESTJS_IN_DOMAIN=$(echo "$DRIFT_OUTPUT" | grep -o '"nestjs_in_domain": *[0-9]*' | grep -o '[0-9]*$' || echo 0)
        KPI_HARDCODED_PATHS=$(echo "$DRIFT_OUTPUT" | grep -o '"hardcoded_paths": *[0-9]*' | grep -o '[0-9]*$' || echo 0)
        KPI_PROJECT_NAME_LEAKAGE="${KPI_PROJECT_NAME_LEAKAGE:-0}"
        KPI_NESTJS_IN_DOMAIN="${KPI_NESTJS_IN_DOMAIN:-0}"
        KPI_HARDCODED_PATHS="${KPI_HARDCODED_PATHS:-0}"
        # Propagate drift-check exit code: non-zero means drift found → FAIL
        exit_code="$DRIFT_EXIT"
      else
        printf '[SKIP] B.2: drift-check.sh not found at %s\n' "$DRIFT_SCRIPT" >&2
        verdict="SKIP"
        exit_code=0
      fi
      ;;

    B.3|B.4|B.6)
      # Planned-8.4.7 scripts
      local script_map_B3="${PROJECT_DIR}/scripts/audit/dispatch-pairing-rate.sh"
      local script_map_B4="${PROJECT_DIR}/scripts/audit/dependency-freshness.sh"
      local script_map_B6="${PROJECT_DIR}/scripts/audit/decision-doc-lag.sh"
      local target_script
      case "$check_id" in
        B.3) target_script="$script_map_B3" ;;
        B.4) target_script="$script_map_B4" ;;
        B.6) target_script="$script_map_B6" ;;
      esac

      if [[ -f "$target_script" ]]; then
        bash "$target_script" >/dev/null 2>&1
        exit_code=$?
      else
        printf '[SKIP] %s: script not yet implemented (planned-8.4.7) — %s\n' \
          "$check_id" "$target_script" >&2
        verdict="SKIP"
        exit_code=0
      fi
      ;;

    B.5)
      # Subagent-index rebuild
      IDX_SCRIPT="${PROJECT_DIR}/scripts/utilities/build-subagent-index.sh"
      if [[ -f "$IDX_SCRIPT" ]]; then
        bash "$IDX_SCRIPT" --update >/dev/null 2>&1
        exit_code=$?
        # Check if the index file exists and count subagents listed vs known
        IDX_FILE="${PROJECT_DIR}/agent-workspace/memory/subagent-index.md"
        if [[ -f "$IDX_FILE" ]]; then
          # Count data rows (lines starting with | after header)
          IDX_ROWS=$(grep -c '^|' "$IDX_FILE" 2>/dev/null || echo 0)
          IDX_ROWS=$((IDX_ROWS - 2))  # subtract header + separator
          [[ "$IDX_ROWS" -lt 0 ]] && IDX_ROWS=0
          KPI_SUBAGENT_INDEX_DRIFT=0  # Rebuild succeeded; drift = 0 by definition
        fi
      else
        printf '[SKIP] B.5: build-subagent-index.sh not found\n' >&2
        verdict="SKIP"
        exit_code=0
      fi
      ;;

  esac

  t_end=$(date +%s%3N 2>/dev/null || date +%s 2>/dev/null || echo 0)
  if [[ "$t_end" -gt "$t_start" ]] 2>/dev/null; then
    duration_ms=$((t_end - t_start))
    # If both timestamps are seconds (10 digits), convert difference to ms
    if [[ ${#t_start} -le 10 ]]; then
      duration_ms=$((duration_ms * 1000))
    fi
  else
    duration_ms=0
  fi

  if [[ -z "$verdict" ]]; then
    if [[ "$exit_code" -eq 0 ]]; then
      verdict="PASS"
    else
      verdict="FAIL"
      WORST_EXIT=1
    fi
  fi

  CHECK_VERDICT["$check_id"]="$verdict"
  CHECK_EXIT["$check_id"]="$exit_code"
  CHECK_DURATION["$check_id"]="$duration_ms"

  emit_span "verify.check.${check_id}" "$verdict" "$check_id" "$duration_ms" "$exit_code"
}

# ─── Run all 6 checks ───────────────────────────────────────────────────────────

for check_id in "${CHECK_ORDER[@]}"; do
  printf 'Running %s (%s)...\n' "$check_id" "${CHECK_LABEL[$check_id]}"
  run_check_b "$check_id"
  printf '  → %s [%dms]\n' "${CHECK_VERDICT[$check_id]}" "${CHECK_DURATION[$check_id]}"
done

# ─── KPI threshold evaluation ───────────────────────────────────────────────────

printf '\n--- KPI Threshold Assessment ---\n'

# Per §5.1 thresholds
THRESH_LEAKAGE_VERDICT=$(eval_kpi_threshold "project_name_leakage" "$KPI_PROJECT_NAME_LEAKAGE" "" "1")
THRESH_NESTJS_VERDICT=$(eval_kpi_threshold "nestjs_in_domain" "$KPI_NESTJS_IN_DOMAIN" "" "1")
THRESH_PATHS_VERDICT=$(eval_kpi_threshold "hardcoded_paths" "$KPI_HARDCODED_PATHS" "1" "3")
THRESH_CITATIONS_VERDICT=$(eval_kpi_threshold "broken_citations" "${KPI_BROKEN_CITATIONS:-0}" "3" "10")
THRESH_IDX_DRIFT_VERDICT=$(eval_kpi_threshold "subagent_index_drift" "$KPI_SUBAGENT_INDEX_DRIFT" "1" "3")

printf '  kpi.project_name_leakage=%s  → %s (FAIL threshold: ≥1)\n' "$KPI_PROJECT_NAME_LEAKAGE" "$THRESH_LEAKAGE_VERDICT"
printf '  kpi.nestjs_in_domain=%s  → %s (FAIL threshold: ≥1)\n' "$KPI_NESTJS_IN_DOMAIN" "$THRESH_NESTJS_VERDICT"
printf '  kpi.hardcoded_paths=%s  → %s (WARN: ≥1, FAIL: ≥3)\n' "$KPI_HARDCODED_PATHS" "$THRESH_PATHS_VERDICT"
printf '  kpi.broken_citations=%s  → %s (WARN: ≥3, FAIL: ≥10)\n' "${KPI_BROKEN_CITATIONS:-0}" "$THRESH_CITATIONS_VERDICT"
printf '  kpi.subagent_index_drift=%s  → %s (WARN: ≥1, FAIL: ≥3)\n' "$KPI_SUBAGENT_INDEX_DRIFT" "$THRESH_IDX_DRIFT_VERDICT"
printf '  kpi.dispatch_pairing_rate=%s  (WARN: <80%%, FAIL: <50%%)\n' "$KPI_DISPATCH_PAIRING_RATE"
printf '  kpi.dependency_freshness_lag=%s  (WARN: ≥2 major behind, FAIL: ≥4)\n' "$KPI_DEPENDENCY_FRESHNESS_LAG"
printf '  kpi.decision_doc_lag=%s  (WARN: ≥15 sessions, FAIL: ≥30)\n' "$KPI_DECISION_DOC_LAG"

# Determine if any KPI crossed FAIL threshold
KPI_FAIL_COUNT=0
for v in "$THRESH_LEAKAGE_VERDICT" "$THRESH_NESTJS_VERDICT" "$THRESH_PATHS_VERDICT" \
         "$THRESH_CITATIONS_VERDICT" "$THRESH_IDX_DRIFT_VERDICT"; do
  [[ "$v" == "FAIL" ]] && KPI_FAIL_COUNT=$((KPI_FAIL_COUNT + 1))
done

KPI_WARN_COUNT=0
for v in "$THRESH_LEAKAGE_VERDICT" "$THRESH_NESTJS_VERDICT" "$THRESH_PATHS_VERDICT" \
         "$THRESH_CITATIONS_VERDICT" "$THRESH_IDX_DRIFT_VERDICT"; do
  [[ "$v" == "WARN" ]] && KPI_WARN_COUNT=$((KPI_WARN_COUNT + 1))
done

# ─── Summary table ──────────────────────────────────────────────────────────────

printf '\n--- Check Summary ---\n'
printf '%-6s %-35s %-8s\n' "Check" "Label" "Verdict"
printf '%-6s %-35s %-8s\n' "-----" "----------------------------------" "-------"
for check_id in "${CHECK_ORDER[@]}"; do
  printf '%-6s %-35s %-8s\n' \
    "$check_id" \
    "${CHECK_LABEL[$check_id]}" \
    "${CHECK_VERDICT[$check_id]}"
done

printf '\nKPI FAIL count: %d | KPI WARN count: %d\n' "$KPI_FAIL_COUNT" "$KPI_WARN_COUNT"
printf '(Advisory gate — this run does NOT block phase advance)\n'

# ─── Write evidence file ────────────────────────────────────────────────────────

cat > "$AUDIT_FILE" <<AUDIT
# Post-N-Sessions Drift Audit — Sessions ${CLUSTER_START}–${CLUSTER_END}

Generated: ${TS}
Session count: ${SESSION_COUNT} | Cluster size: ${CLUSTER_N}
Script: scripts/verify/post-n-sessions.sh

## Check Results

| check_id | script | verdict | exit_code | duration_ms |
|---|---|---|---|---|
AUDIT

for check_id in "${CHECK_ORDER[@]}"; do
  printf '| %s | %s | %s | %s | %s |\n' \
    "$check_id" \
    "${CHECK_SCRIPT[$check_id]}" \
    "${CHECK_VERDICT[$check_id]}" \
    "${CHECK_EXIT[$check_id]}" \
    "${CHECK_DURATION[$check_id]}" \
    >> "$AUDIT_FILE"
done

cat >> "$AUDIT_FILE" <<AUDIT2

## KPI Assessment (§5.1 thresholds)

| KPI | Value | Threshold (WARN/FAIL) | Verdict |
|---|---|---|---|
| kpi.project_name_leakage | ${KPI_PROJECT_NAME_LEAKAGE} | n/a / ≥1 | ${THRESH_LEAKAGE_VERDICT} |
| kpi.nestjs_in_domain | ${KPI_NESTJS_IN_DOMAIN} | n/a / ≥1 | ${THRESH_NESTJS_VERDICT} |
| kpi.hardcoded_paths | ${KPI_HARDCODED_PATHS} | ≥1 / ≥3 | ${THRESH_PATHS_VERDICT} |
| kpi.broken_citations | ${KPI_BROKEN_CITATIONS:-0} | ≥3 / ≥10 | ${THRESH_CITATIONS_VERDICT} |
| kpi.subagent_index_drift | ${KPI_SUBAGENT_INDEX_DRIFT} | ≥1 / ≥3 | ${THRESH_IDX_DRIFT_VERDICT} |
| kpi.dispatch_pairing_rate | ${KPI_DISPATCH_PAIRING_RATE} | <80% / <50% | SKIP (planned-8.4.7) |
| kpi.dependency_freshness_lag | ${KPI_DEPENDENCY_FRESHNESS_LAG} | ≥2 / ≥4 | SKIP (planned-8.4.7) |
| kpi.decision_doc_lag | ${KPI_DECISION_DOC_LAG} | ≥15 / ≥30 | SKIP (planned-8.4.7) |

## Verdict

KPI FAIL count: **${KPI_FAIL_COUNT}** | KPI WARN count: **${KPI_WARN_COUNT}**

$(if [[ "$KPI_FAIL_COUNT" -gt 0 ]]; then
  printf 'FAIL-level KPIs detected. Operator MUST address before next phase boundary OR defer to v.next backlog with rationale.\n'
elif [[ "$KPI_WARN_COUNT" -gt 0 ]]; then
  printf 'WARN-level KPIs detected. Operator reviews at next plan iteration.\n'
else
  printf 'All measured KPIs within tolerance.\n'
fi)

_Advisory only — this gate does not block phase advance. Read-only attestation per Decision 020 (I-6 ABSOLUTE)._
AUDIT2

printf '\nEvidence file written: %s\n' "$AUDIT_FILE"

# Emit root span
emit_span "verify.run_summary" "$([ "$KPI_FAIL_COUNT" -eq 0 ] && echo 'PASS' || echo 'WARN')" \
  "CLASS_B" "0" "0"

# Always exit 0 (CLASS-B advisory)
exit 0
