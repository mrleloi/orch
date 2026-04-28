#!/usr/bin/env bash
# autonomous-stop-watchdog.sh — fired by Stop hook.
# Detects when a Stop event fires while current-execution.md has autonomous_mode: true,
# and the last assistant turn ended with a narration-as-action pattern
# (e.g., "Dispatching X", "Now running Y", "Awaiting Z") without a corresponding tool call.
#
# This is a SOFT WARNING: it logs the suspected loop-break to a watchdog file so the
# user (or a future auditor) has a paper trail of every autonomous-mode silent stop.
# It does NOT auto-inject "continue" — that is the user's call to make from the chat UI.
#
# Stop hook stdin is JSON with at least: {"transcript_path": "...", "session_id": "..."}.
# We are conservative: any failure -> exit 0 silently to never break the parent hook chain.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
LOG_DIR="$PROJECT_DIR/agent-workspace/memory"
mkdir -p "$LOG_DIR"
WATCHDOG_LOG="$LOG_DIR/.autonomous-stop-watchdog.log"
TS="$(date -Iseconds 2>/dev/null || date)"

# === CF-DOGFOOD-4: Stale .dogfood-stop marker visibility ===
# If the .dogfood-stop marker exists at any invocation of this script (Stop or SessionStart),
# emit a loud warning to the watchdog log AND to stderr so the operator sees it during
# the hook pipeline output. We do NOT auto-clear the marker — it exists to halt dogfood
# dispatches and must only be removed by a deliberate human action.
#
# SessionStart wiring: to also catch stale markers at session start, add this script
# under the SessionStart hook in .claude/settings.json.
DOGFOOD_STOP_MARKER_EARLY="$LOG_DIR/.dogfood-stop"
if [[ -f "$DOGFOOD_STOP_MARKER_EARLY" ]]; then
  MARKER_TS="$(head -1 "$DOGFOOD_STOP_MARKER_EARLY" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:+]+' | head -1 || echo "unknown")"
  {
    printf '[%s] [STALE-MARKER] .dogfood-stop present from %s; remove if intentional (rm %s)\n' \
      "$TS" "$MARKER_TS" "$DOGFOOD_STOP_MARKER_EARLY"
  } >> "$WATCHDOG_LOG"
  printf '[autonomous-stop-watchdog] [STALE-MARKER] .dogfood-stop present from %s; remove if intentional (rm %s)\n' \
    "$MARKER_TS" "$DOGFOOD_STOP_MARKER_EARLY" >&2
fi
# === end CF-DOGFOOD-4 ===

# 1. Are we in autonomous mode?
EXEC_FILE="$PROJECT_DIR/agent-workspace/memory/current-execution.md"
if [[ ! -f "$EXEC_FILE" ]]; then
  exit 0
fi
if ! grep -qE '^\*\*autonomous_mode\*\*:\s*true' "$EXEC_FILE" 2>/dev/null; then
  exit 0
fi

# 2. Read Stop hook stdin (best-effort). jq preferred; fall back to bash regex on Windows.
STDIN_JSON="$(cat 2>/dev/null || true)"
TRANSCRIPT_PATH=""
SESSION_ID=""
if [[ -n "$STDIN_JSON" ]]; then
  if command -v jq >/dev/null 2>&1; then
    TRANSCRIPT_PATH="$(printf '%s' "$STDIN_JSON" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
    SESSION_ID="$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null || true)"
  else
    # Bash-only regex fallback (Windows / minimal envs without jq).
    if [[ "$STDIN_JSON" =~ \"transcript_path\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      TRANSCRIPT_PATH="${BASH_REMATCH[1]}"
    fi
    if [[ "$STDIN_JSON" =~ \"session_id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      SESSION_ID="${BASH_REMATCH[1]}"
    fi
  fi
fi

# 3. Inspect the last assistant text for narration-as-action AND for API error signatures AND for premature-windown.
NARRATION_HIT=""
API_ERROR_HIT=""
API_REQUEST_ID=""
PREMATURE_WINDOWN_HIT=""
REAL_TRANSCRIPT_TOKENS=""
WIND_DOWN_MARKER=""
if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
  # Take the last 8 KiB of the transcript (raw JSONL, not pretty).
  LAST_TAIL="$(tail -c 8192 "$TRANSCRIPT_PATH" 2>/dev/null || true)"
  # Failure mode A: narration verbs WITHOUT a paired tool_use block in the SAME assistant turn.
  # Refined per Phase 5.1.5 — old grep over-fired ~33× during Phase 2-3, all turning out to be Mode B.
  # New logic: verb regex match AND no tool_use block in the last 8 KiB of transcript.
  if printf '%s' "$LAST_TAIL" | grep -qiE '(Dispatching|Now running|Now dispatching|Will dispatch|Will run|Awaiting (sandwich|task|spec|code|systematic|verifier|reviewer|implementer))' ; then
    # Check for tool_use block presence in the same tail. If absent, narration is the WHOLE turn → suspected.
    if ! printf '%s' "$LAST_TAIL" | grep -qE '"type":"tool_use"' ; then
      NARRATION_HIT="suspected"
    fi
  fi
  # Failure mode B: Anthropic API error signatures truncating the stream.
  if printf '%s' "$LAST_TAIL" | grep -qE '(overloaded_error|"type":"error".*"Overloaded"|rate_limit_error|api_error|"status":5[0-9][0-9])' ; then
    API_ERROR_HIT="suspected"
    API_REQUEST_ID="$(printf '%s' "$LAST_TAIL" | grep -oE '"request_id":"req_[A-Za-z0-9]+"' | head -1 | sed 's/.*"\(req_[A-Za-z0-9]*\)".*/\1/')"
  fi
  # Failure mode C: premature wind-down — assistant wrote a checkpoint or cited "wind-down" / "fresh envelope"
  # but real transcript is well under threshold AND no .wind-down marker exists.
  TOKENS_FILE="$LOG_DIR/.transcript-tokens"
  WIND_DOWN_FILE="$LOG_DIR/.wind-down"
  if [[ -f "$TOKENS_FILE" ]]; then
    REAL_TRANSCRIPT_TOKENS="$(tr -d '[:space:]' < "$TOKENS_FILE" 2>/dev/null || true)"
  fi
  if [[ -f "$WIND_DOWN_FILE" ]]; then
    WIND_DOWN_MARKER="present"
  fi
  # Detect: tail shows wind-down language OR checkpoint write, AND real tokens < 200000, AND no marker.
  WIND_DOWN_LANGUAGE=""
  if printf '%s' "$LAST_TAIL" | grep -qiE '(approaching.{0,20}(200K|wind-down|wind down)|past 150K|fresh envelope|fresh budget|writing checkpoint|ending turn cleanly|reboot.{0,30}(envelope|budget|next))' ; then
    WIND_DOWN_LANGUAGE="suspected"
  fi
  if [[ "$WIND_DOWN_LANGUAGE" == "suspected" && -z "$WIND_DOWN_MARKER" && -n "$REAL_TRANSCRIPT_TOKENS" ]]; then
    # Numeric compare; treat empty/non-numeric as 0.
    if [[ "$REAL_TRANSCRIPT_TOKENS" =~ ^[0-9]+$ ]] && (( REAL_TRANSCRIPT_TOKENS < 200000 )); then
      PREMATURE_WINDOWN_HIT="suspected"
    fi
  fi
fi

# 4. Append a structured warning line to the watchdog log.
{
  printf '[%s] STOP autonomous_mode=true session=%s narration_hit=%s api_error=%s request_id=%s premature_windown=%s real_tokens=%s wind_down_marker=%s transcript=%s\n' \
    "$TS" "${SESSION_ID:-unknown}" "${NARRATION_HIT:-clean}" "${API_ERROR_HIT:-clean}" "${API_REQUEST_ID:-none}" "${PREMATURE_WINDOWN_HIT:-clean}" "${REAL_TRANSCRIPT_TOKENS:-unknown}" "${WIND_DOWN_MARKER:-absent}" "${TRANSCRIPT_PATH:-unknown}"
} >> "$WATCHDOG_LOG"

# 5. If API error truncation suspected, write a louder alert file the user/auditor can spot easily.
if [[ "$API_ERROR_HIT" == "suspected" ]]; then
  ALERT_FILE="$LOG_DIR/.autonomous-api-error-alert.log"
  {
    printf '[%s] LIKELY API-TRUNCATION STOP. session=%s request_id=%s. Loop state may be inconsistent — re-derive next-action from checkpoints/latest.md before resuming.\n' \
      "$TS" "${SESSION_ID:-unknown}" "${API_REQUEST_ID:-unknown}"
  } >> "$ALERT_FILE"
fi

# === Phase 5.1 Mode-B auto-recovery (SC-2) ===
# Trigger: API_ERROR_HIT=suspected AND no recovery-fired marker for this request_id.
# Strategy: read .transcript-tokens; choose continue-injector vs session-self-reboot.
# Idempotency: marker file per request_id (or per session+TS-minute when request_id unknown).
#   Marker: $LOG_DIR/.api-truncation-recovery-fired-<key>
#   Written BEFORE dispatch to close the TOCTOU race (two concurrent watchdog fires both
#   check, both see no marker, both dispatch). In practice Stop hooks fire serially so
#   concurrent fires are non-existent, but the residual window is documented here.
#   NOTE: no flock() — not portable to Windows bash. Residual race window: microseconds.
#
# ORCH_RECOVERY_DRY_RUN=1: skip the actual background spawn (CI / test escape).
#   The marker file and alert log entry are still written for test assertion coverage.
#
# Cross-platform: continue-injector.ps1 is Windows-only. On non-Windows (no powershell.exe
#   on PATH), recovery always falls back to session-self-reboot.sh regardless of token level.

if [[ "$API_ERROR_HIT" == "suspected" ]]; then
  RECOVERY_KEY="${API_REQUEST_ID:-${SESSION_ID:-unknown}-$(date +%Y%m%d%H%M)}"
  RECOVERY_MARKER="$LOG_DIR/.api-truncation-recovery-fired-$RECOVERY_KEY"
  if [[ ! -f "$RECOVERY_MARKER" ]]; then
    # Read real tokens; fall back to 0 if file missing/unparseable.
    REAL_TOK="$(tr -d '[:space:]' < "$LOG_DIR/.transcript-tokens" 2>/dev/null || echo 0)"
    [[ "$REAL_TOK" =~ ^[0-9]+$ ]] || REAL_TOK=0
    WIND_DOWN="${ORCH_WIND_DOWN_TOKENS:-200000}"

    # Decide tier: under wind-down → continue-injector (cheap, preserves context);
    # at/over wind-down → reboot (fresh budget needed).
    # On non-Windows (no powershell.exe), always use reboot-fallback.
    if (( REAL_TOK >= WIND_DOWN )); then
      RECOVERY_MODE="reboot"
      RECOVERY_CMD=( bash "$PROJECT_DIR/scripts/session-self-reboot.sh" )
    else
      # Windows-only injector at present; sh wrapper emits a warning on non-Windows.
      if [[ -f "$PROJECT_DIR/scripts/hooks/continue-injector.ps1" ]] && command -v powershell.exe >/dev/null 2>&1; then
        RECOVERY_MODE="injector"
        RECOVERY_CMD=( powershell.exe -ExecutionPolicy Bypass -File "$(cygpath -w "$PROJECT_DIR/scripts/hooks/continue-injector.ps1" 2>/dev/null || printf '%s' "$PROJECT_DIR/scripts/hooks/continue-injector.ps1")" )
      else
        RECOVERY_MODE="reboot-fallback"
        RECOVERY_CMD=( bash "$PROJECT_DIR/scripts/session-self-reboot.sh" )
      fi
    fi

    # Write marker FIRST (before dispatch), so concurrent watchdog fires lose the race.
    mkdir -p "$LOG_DIR"
    {
      printf 'fired_at=%s\nrequest_id=%s\nsession=%s\nreal_tokens=%s\nmode=%s\n' \
        "$TS" "${API_REQUEST_ID:-none}" "${SESSION_ID:-unknown}" "$REAL_TOK" "$RECOVERY_MODE"
    } > "$RECOVERY_MARKER"

    # NOTE 2026-04-27: invoke SYNCHRONOUSLY (not `( nohup ... & ) </dev/null`).
    # Detached background processes lose interactive desktop access on Windows
    # (Window Station / UIPI). SendKeys::SendWait throws "Access is denied" —
    # observed in auto-{wind-down,cliff}-*.log on 2026-04-26. Sync inherits the
    # hook's interactive context from the TUI ancestor. Bounded by `timeout 8s`.
    # Skip the actual spawn when ORCH_RECOVERY_DRY_RUN=1 (CI / test escape).
    HANDOFF_LOG="$PROJECT_DIR/agent-workspace/memory/handoff-logs/api-truncation-recovery-$(date +%s)-$RECOVERY_KEY.log"
    mkdir -p "$(dirname "$HANDOFF_LOG")"
    if [[ "${ORCH_RECOVERY_DRY_RUN:-0}" != "1" ]]; then
      timeout 8 "${RECOVERY_CMD[@]}" >> "$HANDOFF_LOG" 2>&1 || true
    fi

    # Append a louder log entry into the API alert log for forensics parity with lines 99-105.
    {
      printf '[%s] AUTO-RECOVERY FIRED. session=%s request_id=%s real_tokens=%s mode=%s marker=%s\n' \
        "$TS" "${SESSION_ID:-unknown}" "${API_REQUEST_ID:-unknown}" "$REAL_TOK" "$RECOVERY_MODE" "$(basename "$RECOVERY_MARKER")"
    } >> "$LOG_DIR/.autonomous-api-error-alert.log"
  fi
fi
# === end Phase 5.1 Mode-B auto-recovery ===

# 6. If premature wind-down suspected, write a louder alert file. This is the Mode C signature:
#    autonomous_mode=true, real-transcript < 200K, no .wind-down marker, but tail shows wind-down language.
#    Likely the LLM ended turn citing self-track illusion. Loop is dead until user resumes.
if [[ "$PREMATURE_WINDOWN_HIT" == "suspected" ]]; then
  ALERT_FILE="$LOG_DIR/.autonomous-premature-windown-alert.log"
  {
    printf '[%s] LIKELY MODE-C PREMATURE WIND-DOWN STOP. session=%s real_tokens=%s (threshold=200000) wind_down_marker=absent. The LLM probably cited self-track approaching wind-down without checking real transcript. Loop is dead — task-notification will not arrive. RESUME by reading checkpoints/latest.md and dispatching the next subagent.\n' \
      "$TS" "${SESSION_ID:-unknown}" "${REAL_TRANSCRIPT_TOKENS:-unknown}"
  } >> "$ALERT_FILE"
fi

# === Mode-C auto-recovery (added 2026-04-27 after Recurrence #2 in Session #37) ===
# Trigger: PREMATURE_WINDOWN_HIT=suspected AND no recovery-fired marker for this session+minute.
# Strategy: real tokens are guaranteed <200K (detection condition line 91), so action is
#   continue-injector.ps1 — cheap, preserves context, sends "continue" keystroke to TUI.
#   Mirrors the Mode-B "under wind-down → injector" branch (lines 140-152).
# Idempotency: marker keyed off session_id + minute so we fire AT MOST once per minute
#   per session even if the LLM repeatedly stalls early in the same chat.
# ORCH_RECOVERY_DRY_RUN=1: skip actual spawn (CI / test escape). Marker still written.
# Cross-platform: Windows-only (PowerShell + SendKeys). Non-Windows: log and skip.

if [[ "$PREMATURE_WINDOWN_HIT" == "suspected" ]]; then
  MODE_C_KEY="${SESSION_ID:-unknown}-$(date +%Y%m%d%H%M)"
  MODE_C_MARKER="$LOG_DIR/.mode-c-recovery-fired-$MODE_C_KEY"
  if [[ ! -f "$MODE_C_MARKER" ]]; then
    # Decide injector path. Mode C is by definition under wind-down; prefer injector over reboot.
    if [[ -f "$PROJECT_DIR/scripts/hooks/continue-injector.ps1" ]] && command -v powershell.exe >/dev/null 2>&1; then
      MODE_C_RECOVERY_MODE="injector"
      MODE_C_CMD=( powershell.exe -ExecutionPolicy Bypass -File "$(cygpath -w "$PROJECT_DIR/scripts/hooks/continue-injector.ps1" 2>/dev/null || printf '%s' "$PROJECT_DIR/scripts/hooks/continue-injector.ps1")" )
    else
      MODE_C_RECOVERY_MODE="skip-non-windows"
      MODE_C_CMD=()
    fi

    # Write marker FIRST (TOCTOU: see Mode-B recovery comment lines 116-120).
    {
      printf 'fired_at=%s\nsession=%s\nreal_tokens=%s\nmode=%s\n' \
        "$TS" "${SESSION_ID:-unknown}" "${REAL_TRANSCRIPT_TOKENS:-unknown}" "$MODE_C_RECOVERY_MODE"
    } > "$MODE_C_MARKER"

    if [[ "$MODE_C_RECOVERY_MODE" == "injector" && "${ORCH_RECOVERY_DRY_RUN:-0}" != "1" ]]; then
      # Bypass continue-injector's per-session marker since this is mid-session re-fire.
      # The injector's `.continue-fired-<SessionTag>` is keyed off `.session-ready` LastWriteTime,
      # which is stable within a session. Delete it so this Mode-C re-fire is allowed.
      rm -f "$LOG_DIR"/.continue-fired-* 2>/dev/null || true

      # Sync invocation per the Mode-B comment lines 161-166 (Windows desktop access).
      MODE_C_HANDOFF_LOG="$PROJECT_DIR/agent-workspace/memory/handoff-logs/mode-c-recovery-$(date +%s)-$MODE_C_KEY.log"
      mkdir -p "$(dirname "$MODE_C_HANDOFF_LOG")"
      timeout 8 "${MODE_C_CMD[@]}" >> "$MODE_C_HANDOFF_LOG" 2>&1 || true
    fi

    {
      printf '[%s] MODE-C AUTO-RECOVERY FIRED. session=%s real_tokens=%s mode=%s marker=%s\n' \
        "$TS" "${SESSION_ID:-unknown}" "${REAL_TRANSCRIPT_TOKENS:-unknown}" "$MODE_C_RECOVERY_MODE" "$(basename "$MODE_C_MARKER")"
    } >> "$LOG_DIR/.autonomous-premature-windown-alert.log"
  fi
fi
# === end Mode-C auto-recovery ===

exit 0
