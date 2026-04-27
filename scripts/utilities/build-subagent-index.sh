#!/usr/bin/env bash
# build-subagent-index.sh — parse .session-hooks.log for SubagentStop events (path a)
# AND parse agent-workspace/memory/**/*.md for historical agentId citations (path b),
# then emit agent-workspace/memory/subagent-index.md with a structured markdown table.
#
# Usage:
#   bash scripts/utilities/build-subagent-index.sh                    # default in/out paths
#   bash scripts/utilities/build-subagent-index.sh <hooks_log> <output>   # explicit paths
#   bash scripts/utilities/build-subagent-index.sh --update           # idempotent re-run
#
# Inputs:
#   $1 (or --update): optional hooks log path override (default: $PROJECT_DIR/agent-workspace/memory/.session-hooks.log)
#   $2: optional output path override (default: $PROJECT_DIR/agent-workspace/memory/subagent-index.md)
#
# Output:
#   Markdown table with columns:
#   agentId | type | model | start_ts | return_ts | duration_s | session_id | task_id | verdict_class | source
#
# Sources:
#   path a: .session-hooks.log SubagentStart/SubagentStop events (forward-looking)
#   path b: agent-workspace/memory/**/*.md agentId citations with verdict-class hints
#
# Verdict class ENUM:
#   ok | ok_with_concerns | fail | rejected | approved | approved_after_fix | unknown
#
# Idempotent: writes via temp file rename. Running multiple times produces identical output.
#
# Closes SC-15 (subagent failure-rate index). Part of Phase 5.1 loop-resilience hardening.

set -euo pipefail

# ─── Argument parsing ──────────────────────────────────────────────────────────
UPDATE_MODE=false
HOOKS_ARG=""
OUTPUT_ARG=""

for arg in "$@"; do
  case "$arg" in
    --update) UPDATE_MODE=true ;;
    *)
      if [[ -z "$HOOKS_ARG" ]]; then
        HOOKS_ARG="$arg"
      elif [[ -z "$OUTPUT_ARG" ]]; then
        OUTPUT_ARG="$arg"
      fi
      ;;
  esac
done

# ─── Path resolution ───────────────────────────────────────────────────────────
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
INPUT_HOOKS="${HOOKS_ARG:-$PROJECT_DIR/agent-workspace/memory/.session-hooks.log}"
INPUT_MEMORY_DIR="$PROJECT_DIR/agent-workspace/memory"
OUTPUT="${OUTPUT_ARG:-$PROJECT_DIR/agent-workspace/memory/subagent-index.md}"

GEN_TS="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')"

# ─── Helpers ───────────────────────────────────────────────────────────────────

# Map raw verdict text → verdict_class ENUM
classify_verdict() {
  local raw="$1"
  # Normalise to uppercase for matching
  local up
  up="$(printf '%s' "$raw" | tr '[:lower:]' '[:upper:]')"
  case "$up" in
    *APPROVED_AFTER_FIX*) printf 'approved_after_fix' ;;
    *APPROVED*)           printf 'approved' ;;
    *DONE_WITH_CONCERNS*) printf 'ok_with_concerns' ;;
    *PASS_WITH_CONCERNS*) printf 'ok_with_concerns' ;;
    *DONE*)               printf 'ok' ;;
    *PASS*)               printf 'ok' ;;
    *FAIL*)               printf 'fail' ;;
    *BLOCKED*)            printf 'fail' ;;
    *REJECTED*)           printf 'rejected' ;;
    *)                    printf 'unknown' ;;
  esac
}

# Extract type hint from context.
# context_before = text on the same line BEFORE the agentId token (most reliable).
# context_full   = entire line + prev line (fallback).
# Priority: look in the 120 chars immediately before agentId first.
extract_type() {
  local context_before="$1"
  local context_full="$2"

  # Helper: scan a string for role names, return first match or ""
  _scan_roles() {
    local s
    s="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
    case "$s" in
      *TASK-IMPLEMENTER*)    printf 'task-implementer'       ; return ;;
      *SPEC-COMPLIANCE*)     printf 'spec-compliance-reviewer'; return ;;
      *CODE-QUALITY*)        printf 'code-quality-reviewer'  ; return ;;
      *SANDWICH-VERIFIER*)   printf 'sandwich-verifier'      ; return ;;
      *SANDWICH-ARCHITECT*)  printf 'sandwich-architect'     ; return ;;
      *SANDWICH-DEV*)        printf 'sandwich-dev'           ; return ;;
      *MASTER-PLANNER*)      printf 'master-planner'         ; return ;;
      *RESEARCH-SCANNER*)    printf 'research-scanner'       ; return ;;
      *SYSTEMATIC-DEBUGGER*) printf 'systematic-debugger'    ; return ;;
    esac
    printf ''
  }

  local result

  # 1. Try last 300 chars of context_before (closest to agentId token — most accurate).
  #    Budget-tracker lines are long; trim to get the dispatch sentence only.
  local proximate="${context_before: -300}"
  result="$(_scan_roles "$proximate")"
  [[ -n "$result" ]] && { printf '%s' "$result"; return; }

  # 2. Full before_aid (in case the role is further back)
  result="$(_scan_roles "$context_before")"
  [[ -n "$result" ]] && { printf '%s' "$result"; return; }

  # 3. Fall back to full context (may pick wrong role from noisy lines)
  result="$(_scan_roles "$context_full")"
  [[ -n "$result" ]] && { printf '%s' "$result"; return; }

  printf 'unknown'
}

# Extract model hint from context.
# $1 = proximate context (text before agentId on line); $2 = full context (fallback).
extract_model() {
  local context_before="${1:-}"
  local context_full="${2:-$context_before}"

  _scan_model() {
    local s
    s="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
    case "$s" in
      *OPUS*)   printf 'opus'   ; return ;;
      *SONNET*) printf 'sonnet' ; return ;;
    esac
    printf ''
  }

  local result
  result="$(_scan_model "$context_before")"
  [[ -n "$result" ]] && { printf '%s' "$result"; return; }
  result="$(_scan_model "$context_full")"
  [[ -n "$result" ]] && { printf '%s' "$result"; return; }
  printf 'unknown'
}

# Extract task_id from context (looks for patterns like 3.7, 1.9b, 5.1.7 etc.)
extract_task_id() {
  local context="$1"
  local task_id=""
  # Match "Task N.N" or "task N.N" patterns
  if [[ "$context" =~ [Tt]ask[[:space:]]+([0-9]+\.[0-9]+[a-z]*(\.[0-9]+)*) ]]; then
    task_id="${BASH_REMATCH[1]}"
  fi
  printf '%s' "${task_id:-unknown}"
}

# ─── Path A: parse .session-hooks.log for SubagentStart/SubagentStop events ────

declare -A AGENT_START_TS=()
declare -A AGENT_STOP_TS=()
declare -A AGENT_TYPE_HOOKS=()
declare -A AGENT_MODEL_HOOKS=()
declare -A AGENT_SESSION_HOOKS=()
declare -A AGENT_VERDICT_HOOKS=()
declare -A AGENT_TASK_HOOKS=()

parse_hooks_log() {
  if [[ ! -f "$INPUT_HOOKS" ]]; then
    printf '[build-subagent-index] hooks log not found: %s (skipping path a)\n' "$INPUT_HOOKS" >&2
    return 0
  fi

  while IFS= read -r line; do
    # SubagentStart line format:
    # [TS] SubagentStart agentId=XXXX type=TYPE model=MODEL session=SESS task=TASK
    if [[ "$line" =~ \[([^]]+)\][[:space:]]+SubagentStart[[:space:]]+agentId=([^[:space:]]+) ]]; then
      local ts="${BASH_REMATCH[1]}"
      local aid="${BASH_REMATCH[2]}"
      AGENT_START_TS["$aid"]="$ts"

      # Extract optional fields
      local type="unknown" model="unknown" session="" task="unknown"
      [[ "$line" =~ type=([^[:space:]]+) ]]    && type="${BASH_REMATCH[1]}"
      [[ "$line" =~ model=([^[:space:]]+) ]]   && model="${BASH_REMATCH[1]}"
      [[ "$line" =~ session=([^[:space:]]+) ]]  && session="${BASH_REMATCH[1]}"
      [[ "$line" =~ task=([^[:space:]]+) ]]    && task="${BASH_REMATCH[1]}"

      AGENT_TYPE_HOOKS["$aid"]="$type"
      AGENT_MODEL_HOOKS["$aid"]="$model"
      AGENT_SESSION_HOOKS["$aid"]="$session"
      AGENT_TASK_HOOKS["$aid"]="$task"
    fi

    # SubagentStop line format:
    # [TS] SubagentStop agentId=XXXX status=STATUS session=SESS
    if [[ "$line" =~ \[([^]]+)\][[:space:]]+SubagentStop[[:space:]]+agentId=([^[:space:]]+) ]]; then
      local ts="${BASH_REMATCH[1]}"
      local aid="${BASH_REMATCH[2]}"
      AGENT_STOP_TS["$aid"]="$ts"

      local status="unknown"
      [[ "$line" =~ status=([^[:space:]]+) ]] && status="${BASH_REMATCH[1]}"
      AGENT_VERDICT_HOOKS["$aid"]="$(classify_verdict "$status")"

      # Capture session from SubagentStop too if not already set
      if [[ -z "${AGENT_SESSION_HOOKS[$aid]:-}" ]]; then
        [[ "$line" =~ session=([^[:space:]]+) ]] && AGENT_SESSION_HOOKS["$aid"]="${BASH_REMATCH[1]}"
      fi
    fi
  done < "$INPUT_HOOKS"
}

# ─── Path B: scan agent-workspace/memory/**/*.md for agentId citations ─────────

declare -A BT_FIRST_LINE=()   # first line-number where agentId appears
declare -A BT_LAST_LINE=()    # last line-number where agentId appears
declare -A BT_FILE=()         # which file
declare -A BT_TYPE=()
declare -A BT_MODEL=()
declare -A BT_SESSION=()
declare -A BT_TASK=()
declare -A BT_VERDICT=()

parse_memory_files() {
  # Scan all .md files in agent-workspace/memory (not session-plans which has placeholder text)
  local -a md_files=()
  while IFS= read -r -d '' f; do
    md_files+=("$f")
  done < <(find "$INPUT_MEMORY_DIR" -maxdepth 3 -name "*.md" -print0 2>/dev/null)

  for md_file in "${md_files[@]:-}"; do
    [[ -z "${md_file:-}" ]] && continue
    [[ ! -f "$md_file" ]] && continue

    local line_num=0
    local prev_context=""

    while IFS= read -r line; do
      ((line_num++)) || true

      # Match agentId pattern: "agentId <hex-or-alnum id>" where id starts with 'a' and is ≥8 chars
      if [[ "$line" =~ agentId[[:space:]]+([a-f0-9]{8,}) ]]; then
        local aid="${BASH_REMATCH[1]}"

        # Skip placeholder/example agentIds from spec text
        [[ "$aid" == "axxxxxxxxxx" ]] && continue
        [[ "$aid" == "a1234567" ]] && continue

        # Extract text BEFORE the agentId on this line — most proximate role context.
        # E.g. "...Dispatching **sandwich-architect** (opus, ~30K, bg, tool-call-first, agentId XXXX)"
        # → proximate = "...Dispatching **sandwich-architect** (opus, ~30K, bg, tool-call-first, "
        local before_aid="${line%%agentId*}"

        # Full context window: proximate + prev line (fallback for multi-line mentions)
        local context_full="$prev_context $line"

        # Record first occurrence (start_ts proxy = "n/a" since no timestamp in .md files)
        if [[ -z "${BT_FILE[$aid]:-}" ]]; then
          BT_FILE["$aid"]="$md_file"
          BT_FIRST_LINE["$aid"]="$line_num"
          BT_TYPE["$aid"]="$(extract_type "$before_aid" "$context_full")"
          BT_MODEL["$aid"]="$(extract_model "$before_aid" "$context_full")"
          BT_TASK["$aid"]="$(extract_task_id "$context_full")"
          BT_SESSION["$aid"]=""
        fi
        BT_LAST_LINE["$aid"]="$line_num"

        # Extract verdict from the same line or nearby context
        # Look for status keywords following the agentId or in the context window
        local verdict_raw=""
        # Check current line first
        if [[ "$line" =~ (DONE_WITH_CONCERNS|APPROVED_AFTER_FIX|PASS_WITH_CONCERNS|DONE|PASS|FAIL|BLOCKED|REJECTED|APPROVED) ]]; then
          verdict_raw="${BASH_REMATCH[1]}"
        elif [[ "$prev_context" =~ (DONE_WITH_CONCERNS|APPROVED_AFTER_FIX|PASS_WITH_CONCERNS|DONE|PASS|FAIL|BLOCKED|REJECTED|APPROVED) ]]; then
          verdict_raw="${BASH_REMATCH[1]}"
        fi
        BT_VERDICT["$aid"]="$(classify_verdict "${verdict_raw:-unknown}")"
      fi

      # Keep a sliding 2-line context for type/model extraction
      prev_context="$line"

    done < "$md_file"
  done
}

# ─── Duration calculator ────────────────────────────────────────────────────────

calc_duration() {
  local start="$1"
  local stop="$2"
  if [[ -z "$start" || -z "$stop" || "$start" == "n/a" || "$stop" == "n/a" ]]; then
    printf 'n/a'
    return
  fi
  # Try GNU date epoch conversion; fall back to n/a on Windows or minimal envs
  local t1 t2
  t1="$(date -d "$start" +%s 2>/dev/null || printf '')"
  t2="$(date -d "$stop" +%s 2>/dev/null || printf '')"
  if [[ -n "$t1" && -n "$t2" ]]; then
    printf '%d' "$((t2 - t1))"
  else
    printf 'n/a'
  fi
}

# ─── Table builder ─────────────────────────────────────────────────────────────

build_table() {
  # Collect all known agentIds from both sources
  declare -A ALL_AIDS=()

  # From hooks log (path a)
  for aid in "${!AGENT_START_TS[@]}" "${!AGENT_STOP_TS[@]}"; do
    ALL_AIDS["$aid"]=1
  done

  # From budget tracker / memory files (path b)
  for aid in "${!BT_FILE[@]}"; do
    ALL_AIDS["$aid"]=1
  done

  # Emit header
  printf '# Subagent Index — generated %s\n\n' "$GEN_TS"
  printf '| agentId | type | model | start_ts | return_ts | duration_s | session_id | task_id | verdict_class | source |\n'
  printf '|---|---|---|---|---|---|---|---|---|---|\n'

  # We'll collect rows for sorting
  local -a rows=()

  for aid in "${!ALL_AIDS[@]}"; do
    # Determine source and fields
    local source type model start_ts return_ts duration session_id task_id verdict_class

    local from_hooks=false
    local from_bt=false
    [[ -n "${AGENT_START_TS[$aid]:-}" || -n "${AGENT_STOP_TS[$aid]:-}" ]] && from_hooks=true
    [[ -n "${BT_FILE[$aid]:-}" ]] && from_bt=true

    if $from_hooks && $from_bt; then
      source="hooks_log+budget_tracker"
    elif $from_hooks; then
      source="hooks_log"
    else
      source="budget_tracker"
    fi

    # Prefer hooks log data, fall back to budget_tracker
    start_ts="${AGENT_START_TS[$aid]:-${BT_FIRST_LINE[$aid]:+n/a}}"
    start_ts="${start_ts:-n/a}"
    return_ts="${AGENT_STOP_TS[$aid]:-${BT_LAST_LINE[$aid]:+n/a}}"
    return_ts="${return_ts:-n/a}"
    duration="$(calc_duration "$start_ts" "$return_ts")"
    type="${AGENT_TYPE_HOOKS[$aid]:-${BT_TYPE[$aid]:-unknown}}"
    model="${AGENT_MODEL_HOOKS[$aid]:-${BT_MODEL[$aid]:-unknown}}"
    session_id="${AGENT_SESSION_HOOKS[$aid]:-${BT_SESSION[$aid]:-n/a}}"
    task_id="${AGENT_TASK_HOOKS[$aid]:-${BT_TASK[$aid]:-unknown}}"
    verdict_class="${AGENT_VERDICT_HOOKS[$aid]:-${BT_VERDICT[$aid]:-unknown}}"

    # Clamp session_id display length
    [[ -z "$session_id" ]] && session_id="n/a"

    # Sort key: start_ts (ISO sorts lexicographically; n/a goes last)
    local sort_key="$start_ts"
    [[ "$sort_key" == "n/a" ]] && sort_key="9999-99-99"

    rows+=("$sort_key|$aid|$type|$model|$start_ts|$return_ts|$duration|$session_id|$task_id|$verdict_class|$source")
  done

  # Sort rows by start_ts (field 1)
  local sorted_rows
  sorted_rows="$(printf '%s\n' "${rows[@]:-}" | sort -t'|' -k1,1)"

  # Emit rows (strip the sort_key prefix)
  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    # Strip leading sort_key (everything before first '|' after the date)
    local data="${row#*|}"
    local r_aid r_type r_model r_start r_return r_dur r_sess r_task r_verdict r_source
    IFS='|' read -r r_aid r_type r_model r_start r_return r_dur r_sess r_task r_verdict r_source <<< "$data"
    printf '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' \
      "$r_aid" "$r_type" "$r_model" "$r_start" "$r_return" "$r_dur" "$r_sess" "$r_task" "$r_verdict" "$r_source"
  done <<< "$sorted_rows"

  # Emit summary
  local total_rows="${#ALL_AIDS[@]}"
  printf '\n---\n\n_Total rows: %d — Sources: path-a (SubagentStop hooks), path-b (memory .md agentId citations)_\n' "$total_rows"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

main() {
  # Ensure output directory exists
  local out_dir
  out_dir="$(dirname "$OUTPUT")"
  mkdir -p "$out_dir"

  # Parse both sources
  parse_hooks_log
  parse_memory_files

  # Build output via temp file (idempotent rename)
  local tmp_out="${OUTPUT}.tmp.$$"
  build_table > "$tmp_out"
  mv "$tmp_out" "$OUTPUT"

  local row_count
  row_count="$(grep -c '^|' "$OUTPUT" 2>/dev/null || printf '0')"
  # Subtract 2 for header + separator rows
  local data_rows=$(( row_count - 2 ))
  [[ "$data_rows" -lt 0 ]] && data_rows=0

  printf '[build-subagent-index] Done. Output: %s (%d data rows)\n' "$OUTPUT" "$data_rows" >&2
}

main "$@"
