#!/usr/bin/env bash
# tool-call-first-lint.sh — Stop hook lint for Mode A (narrate-without-tool-call).
# Reads stdin JSON (Stop hook payload), reads transcript JSONL, classifies the LAST
# completed assistant turn, and emits an advisory-or-blocking warning.
#
# Exit codes:
#   0  — clean, no Mode-A pattern detected
#   0 (with stderr warning) — Mode-A suspected; in v1 we only WARN to stderr
#                             (additionalContexts injection deferred to v2)
#   2  — would-block (currently NOT used; reserved for v2 when injection is wired
#         and false-positive rate measured below 5% over 100+ turns)
#
# Inputs:
#   stdin: { "transcript_path": "...", "session_id": "..." }
#   env:   CLAUDE_PROJECT_DIR (project root; fallback ".")
#
# Side effects:
#   Appends one line to $CLAUDE_PROJECT_DIR/agent-workspace/memory/.tool-call-first-lint.log
#
# Performance: Uses awk + grep for all parsing — no spawned subprocesses beyond
# those built into bash. Targets < 100ms wallclock for the empty-payload path and
# < 200ms for fixture-sized transcripts per INV-10.
#
# v2 upgrade plan:
#   When false-positive rate is confirmed < 5% over 100+ autonomous turns:
#   1. Change emit_warning to emit stdout JSON: {"decision":"block","reason":"..."}
#   2. Change exit code from 0 to 2 for Mode-A cases.
#   3. Add additionalContexts injection to re-surface the narration verb.
#   Until then, v1 is advisory-only (always exits 0).

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
LOG_DIR="$PROJECT_DIR/agent-workspace/memory"
mkdir -p "$LOG_DIR"
LINT_LOG="$LOG_DIR/.tool-call-first-lint.log"
TS="$(date -Iseconds 2>/dev/null || date)"

# ---------------------------------------------------------------------------
# Helper: contains_narration_verb
# Reads text content from stdin.
# Returns 0 (match) if a present-progressive dispatch narration verb is present.
# ---------------------------------------------------------------------------
contains_narration_verb() {
  grep -qEi \
    '(Dispatching|Will run|Will dispatch|About to|Now (running|dispatching)|Awaiting (sandwich|task|spec|code|systematic|verifier|reviewer|implementer))' \
    2>/dev/null
}

# ---------------------------------------------------------------------------
# Helper: get_verb_hint <text>
# Extracts the first matching narration verb phrase from the given text.
# ---------------------------------------------------------------------------
get_verb_hint() {
  local text="$1"
  printf '%s' "$text" | grep -oEi \
    '(Dispatching|Will run|Will dispatch|About to|Now (running|dispatching)|Awaiting (sandwich|task|spec|code|systematic|verifier|reviewer|implementer))[^.!?\n]*' \
    2>/dev/null | head -1 || true
}

# ---------------------------------------------------------------------------
# Helper: extract_last_assistant_turn <transcript_path>
# Reads the last 32 KiB of the transcript JSONL using awk (fast, no subprocess
# startup overhead). Outputs to stdout:
#   Line 1: "HAS_TOOL_USE=1" or "HAS_TOOL_USE=0"
#   Line 2+: text content from text blocks (empty if none)
# Returns exit code 1 if no assistant turn found.
# ---------------------------------------------------------------------------
extract_last_assistant_turn() {
  local transcript_path="$1"
  tail -c 32768 "$transcript_path" 2>/dev/null | awk '
  {
    # Keep last line where "role":"assistant" appears (assistant turn)
    if (index($0, "\"role\":\"assistant\"") > 0) {
      last_line = $0
    }
  }
  END {
    if (last_line == "") { exit 1 }
    # Check for tool_use block (substring match — works on partial JSON per architect §7 R-4)
    if (index(last_line, "\"type\":\"tool_use\"") > 0) {
      print "HAS_TOOL_USE=1"
    } else {
      print "HAS_TOOL_USE=0"
    }
    # Extract all "text":"..." values (covers text blocks and filters via verb check later)
    s = last_line
    while (length(s) > 0) {
      i = index(s, "\"text\":\"")
      if (i == 0) break
      s = substr(s, i + 8)  # skip past "text":"
      j = index(s, "\"")
      if (j == 0) break
      val = substr(s, 1, j - 1)
      if (length(val) > 0) print val
      s = substr(s, j + 1)
    }
  }
  '
}

# ---------------------------------------------------------------------------
# Helper: emit_warning <session_id> <verb_hint>
# Appends a structured log line to the lint log and prints to stderr.
# ---------------------------------------------------------------------------
emit_warning() {
  local session_id="$1"
  local verb_hint="$2"
  local msg="[TS=$TS] [session=$session_id] mode_a_suspected=true narration_only=true verb_hint=\"$verb_hint\""
  echo "$msg" >> "$LINT_LOG"
  echo "[tool-call-first-lint] WARNING: Mode-A suspected — narration verb without tool_use block detected. $msg" >&2
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# 1. Read stdin JSON (Stop hook payload) — pure grep+sed extraction (no subprocess)
STDIN_JSON="$(cat 2>/dev/null || true)"
TRANSCRIPT_PATH=""
SESSION_ID=""

if [[ -n "$STDIN_JSON" ]]; then
  TRANSCRIPT_PATH="$(printf '%s' "$STDIN_JSON" | \
    grep -o '"transcript_path":"[^"]*"' | \
    sed 's/"transcript_path":"//;s/"//' | head -1 || true)"
  SESSION_ID="$(printf '%s' "$STDIN_JSON" | \
    grep -o '"session_id":"[^"]*"' | \
    sed 's/"session_id":"//;s/"//' | head -1 || true)"
fi

# 1a. If transcript_path missing or file does not exist, exit 0 silent
if [[ -z "$TRANSCRIPT_PATH" ]] || [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

# 2. Verify autonomous mode — mirror autonomous-stop-watchdog.sh:23-29 pattern
EXEC_FILE="$PROJECT_DIR/agent-workspace/memory/current-execution.md"
if [[ ! -f "$EXEC_FILE" ]]; then
  exit 0
fi
if ! grep -qE '^\*\*autonomous_mode\*\*:\s*true' "$EXEC_FILE" 2>/dev/null; then
  exit 0
fi

# 3 + 4. Extract last assistant turn in a single awk pass
TURN_OUTPUT=""
if ! TURN_OUTPUT="$(extract_last_assistant_turn "$TRANSCRIPT_PATH")"; then
  echo "[TS=$TS] [session=${SESSION_ID:-unknown}] parse_error=no_assistant_turn_found" >> "$LINT_LOG"
  exit 0
fi

if [[ -z "$TURN_OUTPUT" ]]; then
  echo "[TS=$TS] [session=${SESSION_ID:-unknown}] parse_error=empty_content" >> "$LINT_LOG"
  exit 0
fi

# Parse the structured output: first line is HAS_TOOL_USE flag, rest is text
HAS_TOOL_USE_LINE="$(printf '%s\n' "$TURN_OUTPUT" | head -1)"
TEXT_CONTENT="$(printf '%s\n' "$TURN_OUTPUT" | tail -n +2)"

HAS_TOOL_USE="0"
if [[ "$HAS_TOOL_USE_LINE" == "HAS_TOOL_USE=1" ]]; then
  HAS_TOOL_USE="1"
fi

# 5. Check for narration verb in text content
NARRATION_VERB_HIT=""
if [[ -n "$TEXT_CONTENT" ]]; then
  if printf '%s' "$TEXT_CONTENT" | contains_narration_verb; then
    NARRATION_VERB_HIT="$(get_verb_hint "$TEXT_CONTENT")"
  fi
fi

if [[ -z "$NARRATION_VERB_HIT" ]]; then
  # No narration verb — clean turn
  exit 0
fi

# Turn has a narration verb. Check if it ALSO has a tool_use block.
if [[ "$HAS_TOOL_USE" == "1" ]]; then
  # Tool call present — discipline maintained, not Mode-A
  exit 0
fi

# 6. Mode-A detected: emit advisory warning (v1 — never blocks)
emit_warning "${SESSION_ID:-unknown}" "$NARRATION_VERB_HIT"

# 7. v1 exit code is always 0 — advisory only
exit 0
