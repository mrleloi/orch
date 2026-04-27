#!/usr/bin/env bash
# budget-watchdog.sh — hook-fired budget watchdog
# Wired as a PostToolUse (and Stop) hook in .claude/settings.json.
# Reads the transcript JSONL, sums real token usage, and auto-triggers session-self-reboot
# when the cliff threshold is crossed.
#
# Input (via stdin JSON from Claude Code):
#   { "session_id": "...", "transcript_path": "...", "cwd": "...", "hook_event_name": "...", ... }
#
# Env overrides:
#   ORCH_WIND_DOWN_TOKENS  (default 200000) — advisory marker written
#   ORCH_CLIFF_TOKENS      (default 230000) — hard auto-reboot fires
#   ORCH_WATCHDOG_DISABLE=1 — skip entirely (useful for headless subprocess sessions)
set -euo pipefail

# Hooks in "fire-and-forget" mode must always exit 0 even on internal errors, so we don't
# block the LLM turn on a diagnostic bug.
trap 'exit 0' ERR

WIND_DOWN="${ORCH_WIND_DOWN_TOKENS:-200000}"
CLIFF="${ORCH_CLIFF_TOKENS:-230000}"

# Disable switch for edge cases.
[ "${ORCH_WATCHDOG_DISABLE:-0}" = "1" ] && exit 0

# Read hook payload (JSON) from stdin.
PAYLOAD=$(cat)
TRANSCRIPT=$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).transcript_path || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)
HOOK_EVENT=$(printf '%s' "$PAYLOAD" | node -e "
try {
  let s = '';
  process.stdin.on('data', c => s += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(s).hook_event_name || ''); } catch { console.log(''); }
  });
} catch { console.log(''); }
" 2>/dev/null || true)

# Fallback: some hook runtimes put payload in argv — or we read nothing and should skip.
if [ -z "${TRANSCRIPT:-}" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0
fi

# Compute running context size.
# Try two strategies, prefer precise-from-transcript if available; else file-size heuristic.
#
# Strategy A: parse transcript JSONL for latest `message.usage.input_tokens`. Claude Code
#   v2.1+ may nest usage at different paths; we scan a few plausible shapes.
# Strategy B: transcript file size / 3.5 bytes-per-token (empirical for claude-v2.1 JSONL
#   with cached prompt prefix + tool results). Imperfect but monotonic — enough to trip
#   the cliff reliably.
TOTAL=$(node -e "
const fs = require('fs');
const path = process.argv[1];
function pickUsage(o) {
  return o && (o.message && o.message.usage) || o.usage || o.response && o.response.usage || null;
}
try {
  const raw = fs.readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  let latest = null;
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      const u = pickUsage(o);
      if (u && (u.input_tokens || u.cache_read_input_tokens || u.cache_creation_input_tokens)) {
        latest = u;
      }
    } catch {}
  }
  let ctx = 0;
  if (latest) {
    ctx = (latest.input_tokens||0)
        + (latest.cache_creation_input_tokens||0)
        + (latest.cache_read_input_tokens||0);
  }
  // Fallback if no usage found: file size heuristic.
  if (ctx === 0) {
    const stat = fs.statSync(path);
    ctx = Math.floor(stat.size / 3.5);
  }
  console.log(ctx);
} catch { console.log(0); }
" "$TRANSCRIPT" 2>/dev/null || echo 0)

# Persist the latest reading for /budget-check skill + human inspection.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
mkdir -p "$PROJECT_DIR/agent-workspace/memory"
printf '%s\n' "$TOTAL" > "$PROJECT_DIR/agent-workspace/memory/.transcript-tokens"

# Log a line for observability (bounded — don't spam).
HOOK_LOG="$PROJECT_DIR/agent-workspace/memory/.session-hooks.log"
printf '[%s] watchdog tokens=%s wind_down=%s cliff=%s\n' "$(date -Iseconds)" "$TOTAL" "$WIND_DOWN" "$CLIFF" >> "$HOOK_LOG"

# Wind-down marker (written once when crossed).
WIND_DOWN_MARK="$PROJECT_DIR/agent-workspace/memory/.wind-down"
WIND_DOWN_FIRED="$PROJECT_DIR/agent-workspace/memory/.wind-down-fired"
CLIFF_MARK="$PROJECT_DIR/agent-workspace/memory/.cliff-fired"
FAILED_MARKER="$PROJECT_DIR/agent-workspace/memory/.auto-reboot-FAILED"
mkdir -p "$PROJECT_DIR/agent-workspace/memory/handoff-logs"

# Auto-recovery: if a prior auto-reboot attempt FAILED (e.g., screen was locked,
# SendKeys blocked by UIPI), the failure marker is left by session-self-reboot.ps1.
# We clear the once-only markers so this hook invocation can RETRY the reboot.
# Without this, the .cliff-fired / .wind-down-fired markers persist and silently
# block all future retry attempts until manual cleanup. Observed 2026-04-26:
# screen locked at cliff-firing time (13:48 + 13:50), all 4 SendKeys attempts
# returned "Access is denied" against LockApp foreground; user only saw "nothing
# happen" because marker prevented retry once screen was unlocked.
if [ -f "$FAILED_MARKER" ]; then
  rm -f "$WIND_DOWN_FIRED" "$CLIFF_MARK" "$FAILED_MARKER"
  printf '[%s] watchdog: prior auto-reboot FAILED — cleared once-only markers to retry\n' \
    "$(date -Iseconds)" >> "$HOOK_LOG"
fi

if [ "$TOTAL" -ge "$WIND_DOWN" ] && [ "$TOTAL" -lt "$CLIFF" ]; then
  if [ ! -f "$WIND_DOWN_MARK" ]; then
    printf 'wind_down_crossed_at=%s\ntokens=%s\n' "$(date -Iseconds)" "$TOTAL" > "$WIND_DOWN_MARK"
    printf '[%s] WIND_DOWN crossed tokens=%s — auto-reboot will fire at next Stop hook\n' "$(date -Iseconds)" "$TOTAL" >> "$HOOK_LOG"
  fi

  # Auto-reboot at wind-down: only on Stop hook (end of turn) so we don't kill
  # in-flight subagents mid-turn. Once-only via .wind-down-fired marker.
  #
  # NOTE 2026-04-27: invoke SYNCHRONOUSLY (not `( nohup ... & ) </dev/null`).
  # Background-detached processes lose interactive desktop access on Windows
  # (Window Station / UIPI). Symptom: SendKeys::SendWait throws "Access is
  # denied" — observed in auto-wind-down-1777169587.log + auto-cliff-1777172497.log
  # at 2026-04-26. Sync invocation inherits the hook's interactive context from
  # the TUI ancestor, so SendKeys works. Bounded by `timeout 8s` to keep Stop
  # hook latency < 8s (Claude Code Stop spec allows ~60s).
  if [ "$HOOK_EVENT" = "Stop" ] && [ ! -f "$WIND_DOWN_FIRED" ]; then
    printf 'wind_down_fired_at=%s\ntokens=%s\n' "$(date -Iseconds)" "$TOTAL" > "$WIND_DOWN_FIRED"
    printf '[%s] WIND_DOWN auto-reboot firing on Stop tokens=%s\n' "$(date -Iseconds)" "$TOTAL" >> "$HOOK_LOG"
    timeout 8 bash "$PROJECT_DIR/scripts/session-self-reboot.sh" "continue from checkpoint" \
        >> "$PROJECT_DIR/agent-workspace/memory/handoff-logs/auto-wind-down-$(date +%s).log" 2>&1 || true
  fi
fi

# Cliff: HARD auto-reboot — fires regardless of hook event (PostToolUse or Stop).
# This is the backstop if wind-down's Stop-only path was missed (e.g., a turn that
# never ends, or a hook-event detection failure).
# Same sync-invocation rationale as wind-down above (UIPI Windows fix 2026-04-27).
if [ "$TOTAL" -ge "$CLIFF" ] && [ ! -f "$CLIFF_MARK" ]; then
  printf 'cliff_fired_at=%s\ntokens=%s\n' "$(date -Iseconds)" "$TOTAL" > "$CLIFF_MARK"
  printf '[%s] CLIFF tokens=%s — firing session-self-reboot.sh\n' "$(date -Iseconds)" "$TOTAL" >> "$HOOK_LOG"
  timeout 8 bash "$PROJECT_DIR/scripts/session-self-reboot.sh" "continue from checkpoint" \
      >> "$PROJECT_DIR/agent-workspace/memory/handoff-logs/auto-cliff-$(date +%s).log" 2>&1 || true
fi

# === Phase 5.1 Mode-C premature-wind-down guard ===
# Detects when the LLM ends its turn citing budget pressure (Mode C confabulation) even
# though the REAL transcript token count is well below the wind-down threshold.
#
# Q1 resolution (impl time, 2026-04-27): Stop hook decision JSON shape validated against
# .claude/skills/claude-code-hooks/SKILL.md. The SKILL doc describes Stop hooks as
# "async-safe" without specifying a blocking JSON format. INV-9 in the architect doc
# specifies: {"decision":"block","reason":"..."} per the "Claude Code Stop hook spec".
# Architect doc §B signature and §E both use this shape. This implementation follows that.
# If Claude Code does not parse this as a block, the guard degrades gracefully (LLM sees
# the JSON as informative stdout text). Exit 0 always (INV-9).
#
# Trigger conditions (ALL five must hold):
#   1. HOOK_EVENT == "Stop"       (end-of-turn only — not PostToolUse)
#   2. autonomous_mode == true    (current-execution.md gate)
#   3. real tokens (TOTAL) < ORCH_WIND_DOWN_TOKENS - 20000  (default < 180K)
#   4. .wind-down marker absent   (if present, wind-down is legitimate)
#   5. last 200 lines of transcript contain a rationalization phrase
#
# Rationalization phrases (any one match triggers):
#   "approaching 200K", "give next task fresh envelope", "past 150K.*soft-prep",
#   "near wind-down", "wind-down threshold", "start summarizing",
#   "write checkpoint and end turn", "finish in-flight subagents"
#
# On trigger: emits {"decision":"block","reason":"..."} JSON to stdout AND appends a
#   forensic line to agent-workspace/memory/.autonomous-premature-windown-alert.log
# Always exits 0 (INV-9).

if [ "$HOOK_EVENT" = "Stop" ]; then
  EXEC_FILE="$PROJECT_DIR/agent-workspace/memory/current-execution.md"
  if [ -f "$EXEC_FILE" ] && grep -qE '^\*\*autonomous_mode\*\*:\s*true' "$EXEC_FILE" 2>/dev/null; then
    SOFT_LIMIT=$(( WIND_DOWN - 20000 ))
    if [ "$TOTAL" -lt "$SOFT_LIMIT" ] && [ ! -f "$WIND_DOWN_MARK" ]; then
      # Scan last 200 lines of transcript for rationalization phrases.
      # tail -n 200 is O(constant) on all platforms — reads from end-of-file.
      TAIL_TXT=$(tail -n 200 "$TRANSCRIPT" 2>/dev/null || true)
      if printf '%s' "$TAIL_TXT" | grep -qE '(approaching.{0,20}200K|give next task fresh envelope|past 150K[, ]?soft.?prep|near wind.?down|wind.?down threshold|start summarizing|write checkpoint and end turn|finish in.?flight subagents)'; then
        # Emit Stop-blocking decision JSON to stdout.
        # Claude Code parses Stop hook stdout for {"decision":"block","reason":"..."} and
        # feeds `reason` back to the LLM as a system message, re-running the turn.
        printf '{"decision":"block","reason":"[ORCH MODE-C GUARD] Real transcript = %s tokens (threshold = %s). Self-track inflates ~25%% over real. .wind-down marker is ABSENT. Do NOT end turn citing budget pressure — dispatch the next subagent and continue. Reference: agent-workspace/constitution/autonomous-protocol.md § TURN-END DISCIPLINE."}\n' \
          "$TOTAL" "$WIND_DOWN"
        # Append forensic line to premature-windown alert log (append-only, INV-4).
        ALERT_LOG="$PROJECT_DIR/agent-workspace/memory/.autonomous-premature-windown-alert.log"
        mkdir -p "$(dirname "$ALERT_LOG")"
        printf '[%s] MODE-C GUARD BLOCKED Stop. real_tokens=%s soft_limit=%s wind_down_marker=absent transcript=%s\n' \
          "$(date -Iseconds)" "$TOTAL" "$SOFT_LIMIT" "$TRANSCRIPT" >> "$ALERT_LOG"
        # Exit 0 always — blocking is signaled via stdout JSON, never via exit code (INV-9).
        exit 0
      fi
    fi
  fi
fi
# === end Phase 5.1 Mode-C guard ===

exit 0
