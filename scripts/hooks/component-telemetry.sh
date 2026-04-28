#!/usr/bin/env bash
# component-telemetry.sh — Claude Code hook: records one JSONL line per hook event.
# Wired as PostToolUse / SubagentStop / SessionStart in .claude/settings.json.
#
# Input (via stdin JSON from Claude Code):
#   PostToolUse:   { "tool_name": "...", "tool_input": {...}, "session_id": "...", "hook_event_name": "...", ... }
#   SubagentStop:  { "status": "...", "session_id": "...", "hook_event_name": "...", ... }
#   SessionStart:  { "session_id": "...", "hook_event_name": "...", ... }
#
# Behavior contract (§3.2.C):
#   1. Daemon-dumb: zero LLM calls, zero network. Shell + node -e only.
#   2. Append-only to component-telemetry.jsonl; rotate at 10 MB.
#   3. Dedup: if (ts, component_name) matches previous line → skip.
#   4. Always exits 0 (hook fire-and-forget mode).
set -uo pipefail
trap 'exit 0' ERR

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MEMORY_DIR="$PROJECT_DIR/agent-workspace/memory"
mkdir -p "$MEMORY_DIR"

JSONL_FILE="$MEMORY_DIR/component-telemetry.jsonl"
TOKENS_FILE="$MEMORY_DIR/.transcript-tokens"
TOKENS_PREV_FILE="$MEMORY_DIR/.transcript-tokens-prev"
WATCHDOG_LOG="$MEMORY_DIR/.autonomous-stop-watchdog.log"

# ---------------------------------------------------------------------------
# Read payload from stdin (matches budget-watchdog.sh pattern lines 28-46)
# ---------------------------------------------------------------------------
PAYLOAD="$(cat)"

# Fast-path skip: if payload is empty, exit immediately. Avoids fork cost.
if [ -z "$PAYLOAD" ]; then
  exit 0
fi

# Spawn detached background subshell for all expensive work (7x node -e parses,
# classify, compute, append). Parent exits immediately after fork — INV-S9 fix
# (architect §10: POSIX >> append-atomicity is sufficient; no flock needed).
(
# Extract fields via node -e to handle arbitrary JSON safely.
HOOK_EVENT_NAME="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).hook_event_name || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

SESSION_ID="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).session_id || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

TOOL_NAME="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).tool_name || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

SUBAGENT_TYPE="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try {
      const p = JSON.parse(s);
      console.log((p.tool_input && p.tool_input.subagent_type) || '');
    } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

PAYLOAD_STATUS="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).status || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

PAYLOAD_ERROR="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).error || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

PAYLOAD_DECISION="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).decision || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

# agent_id — hex identifier present in SubagentStop payloads (Case γ sidecar lookup).
AGENT_ID="$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).agent_id || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

# If payload could not be parsed at all (all fields empty and tool_name also empty on PostToolUse
# events), skip rather than writing a malformed row.
if [ -z "$HOOK_EVENT_NAME" ] && [ -z "$SESSION_ID" ] && [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# classify_component — derives component_type, component_name, trigger
# ---------------------------------------------------------------------------
classify_component() {
  local hook_event="$1"
  local tool_name="$2"
  local subagent_type="$3"
  # Parameters 4+5 used only for SubagentStop sidecar lookup (SC-39 Case γ).
  local subagent_agent_id="${4:-}"
  local subagent_session="${5:-}"

  COMP_TYPE=""
  COMP_NAME=""
  TRIGGER=""

  case "$hook_event" in
    PostToolUse)
      # skill: tool_name matches ^skill:(\w+)$
      if printf '%s' "$tool_name" | grep -qE '^skill:([A-Za-z0-9_-]+)$'; then
        COMP_TYPE="skill"
        COMP_NAME="$(printf '%s' "$tool_name" | sed 's/^skill://')"
        TRIGGER="keyword_match"
      # agent dispatch: tool_name == "Task"
      elif [ "$tool_name" = "Task" ]; then
        COMP_TYPE="agent"
        COMP_NAME="${subagent_type:-unknown-agent}"
        TRIGGER="agent_dispatch"
      # command: starts with slash: or matches .claude/commands/ filename pattern
      elif printf '%s' "$tool_name" | grep -qE '^slash:'; then
        COMP_TYPE="command"
        COMP_NAME="$(printf '%s' "$tool_name" | sed 's|^slash:/\?||')"
        TRIGGER="explicit_invoke"
      elif printf '%s' "$tool_name" | grep -qE '\.claude/commands/'; then
        COMP_TYPE="command"
        COMP_NAME="$(basename "$tool_name" .md)"
        TRIGGER="explicit_invoke"
      else
        # Generic tool — record as hook event
        COMP_TYPE="hook"
        COMP_NAME="${tool_name:-PostToolUse}"
        TRIGGER="hook_event"
      fi
      ;;
    SubagentStop)
      COMP_TYPE="agent"
      TRIGGER="agent_dispatch"
      # SC-39 Case γ: look up named agent type from sidecar file using hex agent_id.
      # Sidecar file: $MEMORY_DIR/.dispatch-pending-<session_id>.jsonl
      # Entry shape (written by dispatch-jsonl-recorder.sh PostToolUse):
      #   {"dispatch_id":"<hex>","tool_use_id":"toolu_*","agent_type":"<type>","model":"..."}
      # "last match wins" — tail the file and grep for dispatch_id matching hex agent_id.
      local sidecar_name sidecar_match sidecar_type
      sidecar_name="${subagent_session:+$MEMORY_DIR/.dispatch-pending-${subagent_session}.jsonl}"
      sidecar_type=""
      if [ -n "$subagent_agent_id" ] && [ -n "$sidecar_name" ] && [ -f "$sidecar_name" ]; then
        sidecar_match="$(grep "\"dispatch_id\":\"${subagent_agent_id}\"" "$sidecar_name" | tail -1 2>/dev/null || true)"
        if [ -n "$sidecar_match" ]; then
          sidecar_type="$(printf '%s' "$sidecar_match" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).agent_type || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"
        fi
      fi
      if [ -n "$sidecar_type" ]; then
        COMP_NAME="$sidecar_type"
      else
        COMP_NAME="${subagent_type:-unknown-agent}"
      fi
      ;;
    SessionStart|Stop|PreToolUse|SessionEnd|UserPromptSubmit|PreCompact|Notification)
      COMP_TYPE="hook"
      COMP_NAME="$hook_event"
      TRIGGER="hook_event"
      ;;
    *)
      # Unknown hook event name
      COMP_TYPE="hook"
      COMP_NAME="${hook_event:-unknown}"
      TRIGGER="hook_event"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# compute_tokens_real — delta between current transcript-tokens and previous snapshot
# ---------------------------------------------------------------------------
compute_tokens_real() {
  local current_tokens=0
  local prev_tokens=0

  if [ -f "$TOKENS_FILE" ]; then
    current_tokens="$(tr -d '[:space:]' < "$TOKENS_FILE" 2>/dev/null || echo 0)"
    [[ "$current_tokens" =~ ^[0-9]+$ ]] || current_tokens=0
  fi

  if [ -f "$TOKENS_PREV_FILE" ]; then
    prev_tokens="$(tr -d '[:space:]' < "$TOKENS_PREV_FILE" 2>/dev/null || echo 0)"
    [[ "$prev_tokens" =~ ^[0-9]+$ ]] || prev_tokens=0
  fi

  # Snapshot current for next invocation
  printf '%s\n' "$current_tokens" > "$TOKENS_PREV_FILE"

  TOKENS_REAL=$(( current_tokens - prev_tokens ))
  if [ "$TOKENS_REAL" -lt 0 ]; then
    TOKENS_REAL=0
  fi
}

# ---------------------------------------------------------------------------
# compute_duration_ms — elapsed ms since previous event for same session_id
# ---------------------------------------------------------------------------
compute_duration_ms() {
  local session="$1"
  local ts_file="$MEMORY_DIR/.last-event-ts-${session}"
  local now_ms=0
  local prev_ms=0

  # Current epoch in ms (bash arithmetic; GNU date with %3N for ms precision)
  now_ms="$(date -u +%s%3N 2>/dev/null || echo 0)"
  [[ "$now_ms" =~ ^[0-9]+$ ]] || now_ms=0

  if [ -f "$ts_file" ]; then
    prev_ms="$(tr -d '[:space:]' < "$ts_file" 2>/dev/null || echo 0)"
    [[ "$prev_ms" =~ ^[0-9]+$ ]] || prev_ms=0
  fi

  # Write current ts for next call
  printf '%s\n' "$now_ms" > "$ts_file"

  DURATION_MS=$(( now_ms - prev_ms ))
  if [ "$DURATION_MS" -lt 0 ] || [ "$prev_ms" -eq 0 ]; then
    DURATION_MS=0
  fi
}

# ---------------------------------------------------------------------------
# skip_if_duplicate — returns 0 (skip) if current (ts, component_name) within 1ms of previous
# ---------------------------------------------------------------------------
skip_if_duplicate() {
  local ts_val="$1"
  local comp_name="$2"

  if [ ! -f "$JSONL_FILE" ]; then
    return 1
  fi

  local last_line
  last_line="$(tail -n 1 "$JSONL_FILE" 2>/dev/null || true)"
  if [ -z "$last_line" ]; then
    return 1
  fi

  # Extract ts and component_name from last line via node -e
  local last_ts last_name
  last_ts="$(printf '%s' "$last_line" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).ts || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

  last_name="$(printf '%s' "$last_line" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).component_name || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)"

  if [ "$last_name" = "$comp_name" ] && [ "$last_ts" = "$ts_val" ]; then
    return 0  # duplicate → skip
  fi
  return 1  # not duplicate → proceed
}

# ---------------------------------------------------------------------------
# correlate_failure_mode — checks watchdog log last 5 lines for Mode A/B/C at same minute
# ---------------------------------------------------------------------------
correlate_failure_mode() {
  FAILURE_MODE="null"

  if [ ! -f "$WATCHDOG_LOG" ]; then
    return
  fi

  local current_minute
  current_minute="$(date -u +%Y-%m-%dT%H:%M 2>/dev/null || true)"

  local last_lines
  last_lines="$(tail -n 5 "$WATCHDOG_LOG" 2>/dev/null || true)"

  if [ -z "$last_lines" ] || [ -z "$current_minute" ]; then
    return
  fi

  # Check if any of the last 5 lines are within the current minute
  if printf '%s' "$last_lines" | grep -q "$current_minute"; then
    # Determine which mode from the line content
    if printf '%s' "$last_lines" | grep -q "narration_hit=suspected"; then
      FAILURE_MODE='"A"'
    elif printf '%s' "$last_lines" | grep -q "api_error=suspected"; then
      FAILURE_MODE='"B"'
    elif printf '%s' "$last_lines" | grep -q "premature_windown=suspected"; then
      FAILURE_MODE='"C"'
    fi
  fi
}

# ---------------------------------------------------------------------------
# append_with_rotation — appends one JSONL line; rotates when file > 10 MB
# ---------------------------------------------------------------------------
# Concurrent-safety note: relies on POSIX >> append-atomicity per line
# (each line ≤ 480 bytes ≤ PIPE_BUF=4096). Rotation is best-effort; rare
# concurrent rotation may lose one in-flight line (acceptable per
# JSONL-as-best-effort design; precedent: mailbox count-idempotency 5.4.9).
# Do NOT add flock — Windows Git Bash portability invariant (precedent:
# autonomous-stop-watchdog.sh:120, 5.1.3 architect §469).
append_with_rotation() {
  local json_line="$1"
  local max_bytes=10485760

  # Rotate if file exceeds 10 MB
  if [ -f "$JSONL_FILE" ]; then
    local fsize=0
    fsize="$(stat -c%s "$JSONL_FILE" 2>/dev/null || stat -f%z "$JSONL_FILE" 2>/dev/null || echo 0)"
    [[ "$fsize" =~ ^[0-9]+$ ]] || fsize=0

    if [ "$fsize" -ge "$max_bytes" ]; then
      # Shift segments: .5 deleted, .4→.5, .3→.4, .2→.3, .1→.2, current→.1
      rm -f "${JSONL_FILE}.5"
      for i in 4 3 2 1; do
        local next=$(( i + 1 ))
        [ -f "${JSONL_FILE}.${i}" ] && mv "${JSONL_FILE}.${i}" "${JSONL_FILE}.${next}" || true
      done
      mv "$JSONL_FILE" "${JSONL_FILE}.1"
    fi
  fi

  # Append-only (INV-S3)
  printf '%s\n' "$json_line" >> "$JSONL_FILE"
}

# ---------------------------------------------------------------------------
# compose_event_jsonl — builds the JSON line matching ComponentEventSchema
# ---------------------------------------------------------------------------
compose_event_jsonl() {
  local comp_type="$1"
  local comp_name="$2"
  local trigger="$3"
  local outcome="$4"
  local tokens_real="$5"
  local duration_ms="$6"
  local session_id="$7"
  local failure_mode="$8"
  local ts_val="$9"

  # Sanitize comp_name for JSON (escape quotes, remove newlines)
  comp_name="$(printf '%s' "$comp_name" | tr -d '\n\r' | sed 's/"/\\"/g')"
  session_id_json="null"
  if [ -n "$session_id" ]; then
    session_id_json="\"$(printf '%s' "$session_id" | sed 's/"/\\"/g')\""
  fi

  printf '{"ts":"%s","component_type":"%s","component_name":"%s","trigger":"%s","outcome":"%s","tokens_real":%s,"duration_ms":%s,"session_id":%s,"task_id":null,"failure_mode":%s}' \
    "$ts_val" \
    "$comp_type" \
    "$comp_name" \
    "$trigger" \
    "$outcome" \
    "$tokens_real" \
    "$duration_ms" \
    "$session_id_json" \
    "$failure_mode"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# Determine timestamp at ms precision
TS="$(date -u +%FT%T.%3NZ 2>/dev/null || date -u +%FT%TZ 2>/dev/null || true)"

# Classify component (pass agent_id + session_id for SubagentStop sidecar lookup)
classify_component "$HOOK_EVENT_NAME" "$TOOL_NAME" "$SUBAGENT_TYPE" "${AGENT_ID:-}" "${SESSION_ID:-}"

# Map outcome
OUTCOME="ok"
if [ -n "$PAYLOAD_ERROR" ]; then
  OUTCOME="error"
elif [ "$PAYLOAD_DECISION" = "deny" ]; then
  # Phase 5.3.5 — SC-12: hook deny → outcome=reject
  OUTCOME="reject"
elif [ -n "$PAYLOAD_STATUS" ]; then
  case "$PAYLOAD_STATUS" in
    error)    OUTCOME="error" ;;
    timeout)  OUTCOME="timeout" ;;
    denied)   OUTCOME="reject" ;;
    no_op)    OUTCOME="no_op" ;;
    *)        OUTCOME="ok" ;;
  esac
fi

# Skip if duplicate (same ts + component_name as last line)
if skip_if_duplicate "$TS" "$COMP_NAME"; then
  exit 0
fi

# Compute telemetry values
compute_tokens_real
compute_duration_ms "${SESSION_ID:-default}"
correlate_failure_mode
# Phase 5.3.5 — SC-12: Mode H = hook deny (decision=deny overrides watchdog-derived failure_mode)
[ "$PAYLOAD_DECISION" = "deny" ] && FAILURE_MODE='"H"'

# Compose and append
JSON_LINE="$(compose_event_jsonl \
  "$COMP_TYPE" \
  "$COMP_NAME" \
  "$TRIGGER" \
  "$OUTCOME" \
  "$TOKENS_REAL" \
  "$DURATION_MS" \
  "${SESSION_ID:-}" \
  "$FAILURE_MODE" \
  "$TS")"

append_with_rotation "$JSON_LINE"

) </dev/null >/dev/null 2>&1 &

# Best-effort detach (Bash 4+; ignore failure on minimal shells)
disown 2>/dev/null || true

exit 0
