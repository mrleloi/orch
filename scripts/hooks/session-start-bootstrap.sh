#!/usr/bin/env bash
# session-start-bootstrap.sh — SessionStart hook that injects Orch resume context.
#
# Wired as SessionStart in .claude/settings.json.
# Reads hook payload from stdin; when source=startup|resume|clear, emits a JSON response
# with hookSpecificOutput.additionalContext pointing the model at the latest checkpoint.
#
# This is the clean alternative to SendKeys "continue" after /new — the new session reads
# this context injection as system-level guidance and resumes autonomously, without needing
# a typed user prompt.
set -euo pipefail
trap 'exit 0' ERR

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CHECKPOINT_DIR="$PROJECT_DIR/agent-workspace/memory/checkpoints"
LATEST="$CHECKPOINT_DIR/latest.md"

# Also log for observability.
mkdir -p "$PROJECT_DIR/agent-workspace/memory"
HOOK_LOG="$PROJECT_DIR/agent-workspace/memory/.session-hooks.log"

# Slurp stdin payload (Claude Code hook JSON) to detect the "source" field.
PAYLOAD=$(cat)
SOURCE=$(printf '%s' "$PAYLOAD" | node -e "
try { let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{ try { console.log(JSON.parse(s).source || ''); } catch { console.log(''); } }); } catch { console.log(''); }
" 2>/dev/null || echo "")

echo "[$(date -Iseconds)] SessionStart-bootstrap source=$SOURCE latest_exists=$([ -f "$LATEST" ] && echo yes || echo no)" >> "$HOOK_LOG"

# Only inject resume context for startup/resume/clear (i.e. brand-new or reopened sessions).
case "$SOURCE" in
  startup|resume|clear) ;;
  *) exit 0 ;;
esac

# If no checkpoint exists, nothing to resume — stay silent.
[ -f "$LATEST" ] || exit 0

# Reset the watchdog markers so the new session starts with a clean slate.
# Why .wind-down-fired must also be reset: the marker is "once-only auto-reboot fired
# in THIS session". Without resetting it on SessionStart, a single auto-reboot creates
# the marker permanently, and ALL future sessions' wind-down auto-reboot is silently
# blocked by the stale marker (observed 2026-04-26: 314K real tokens with marker
# present, no reboot ever fired). Same applies to .cliff-fired.
rm -f "$PROJECT_DIR/agent-workspace/memory/.cliff-fired" \
      "$PROJECT_DIR/agent-workspace/memory/.wind-down" \
      "$PROJECT_DIR/agent-workspace/memory/.wind-down-fired"

# Proactive guard: parse-check session-self-reboot.ps1 at SessionStart so encoding /
# syntax bugs surface BEFORE wind-down hits. If parse fails, write .auto-reboot-FAILED
# so the next budget-watchdog Stop hook surfaces the failure (and the operator/LLM
# sees it during the autonomous-resume context). Without this guard, a parse-broken
# .ps1 silently blocks all auto-reboots until the marker is manually cleared
# (observed 2026-04-26: em-dash UTF-8 bytes parsed by PowerShell as CP1252 garbage,
# script aborted before any SendKeys call, .auto-reboot-FAILED never written, all
# retries silently blocked by stale .wind-down-fired marker).
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    PS_SCRIPT="$PROJECT_DIR/scripts/session-self-reboot.ps1"
    if [ -f "$PS_SCRIPT" ] && command -v powershell.exe >/dev/null 2>&1; then
      PS_SCRIPT_WIN="$(cygpath -w "$PS_SCRIPT" 2>/dev/null || printf '%s' "$PS_SCRIPT")"
      PARSE_OUT=$(powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
        "try { \$null = [scriptblock]::Create((Get-Content -Raw -Path '$PS_SCRIPT_WIN')); 'PARSE_OK' } catch { 'PARSE_FAIL: ' + \$_.Exception.Message }" \
        2>&1 | tr -d '\r' | head -1 || echo "PARSE_FAIL: powershell.exe invocation failed")
      if ! printf '%s' "$PARSE_OUT" | grep -q '^PARSE_OK'; then
        printf 'AUTO-REBOOT FAILED at %s (SessionStart proactive parse-check)\nReason: PowerShell parser cannot load session-self-reboot.ps1. The reboot mechanism is broken; auto-reboot at wind-down WILL FAIL silently until fixed.\nParse output: %s\nFile: %s\nAction: investigate and fix encoding (likely non-ASCII chars like em-dash interpreted as CP1252) or syntax in scripts/session-self-reboot.ps1.\n' \
          "$(date -Iseconds)" "$PARSE_OUT" "$PS_SCRIPT_WIN" \
          > "$PROJECT_DIR/agent-workspace/memory/.auto-reboot-FAILED"
        echo "[$(date -Iseconds)] SessionStart-bootstrap PROACTIVE PARSE-CHECK FAILED: $PARSE_OUT" >> "$HOOK_LOG"
      else
        echo "[$(date -Iseconds)] SessionStart-bootstrap parse-check OK on session-self-reboot.ps1" >> "$HOOK_LOG"
      fi
    fi
    ;;
esac

# Build resume context as a single-line JSON string.
CONTEXT="AUTONOMOUS RESUME: Orch execution resumed via SessionStart hook. \
Read these in order before any tool call, do NOT ask the user anything: \
(1) $LATEST [handoff checkpoint with current phase, task, next_action], \
(2) CLAUDE.md [project rules: fully autonomous, subagents must run_in_background=true, hooks use \$CLAUDE_PROJECT_DIR, new sessions must use --rc, at 200K mark checkpoint+self-reboot], \
(3) PROJECT_CHARTER.md [immutable invariants], \
(4) agent-workspace/memory/current-execution.md [routing], \
(5) agent-workspace/session-plans/pending/phase-1-core.md [current phase plan]. \
Then resume at the checkpoint's next_action. Do NOT commit (I-6). Dispatch next subagent with run_in_background=true."

# Emit the Claude Code hook control JSON on stdout — this is the DOCUMENTED shape
# that injects additionalContext into the model's next turn.
node -e "
const ctx = process.argv[1];
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: ctx
  }
}));
" "$CONTEXT"

echo "[$(date -Iseconds)] SessionStart-bootstrap injected additionalContext" >> "$HOOK_LOG"

# Write ready marker (observability + idempotency tag for continue-injector).
printf 'ready_at=%s\nsession_id=%s\nsource=%s\n' "$(date -Iseconds)" "${CLAUDE_SESSION_ID:-unknown}" "$SOURCE" \
  > "$PROJECT_DIR/agent-workspace/memory/.session-ready"

# Spawn DETACHED continue-injector that — after the TUI init settles — SendKeys "continue"
# to the foreground terminal so the fresh session's LLM gets its first user prompt and
# triggers the autonomous resume turn. Without this, additionalContext alone is silent and
# the session sits idle waiting for a human to type.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    PS_SCRIPT="$(cygpath -w "$PROJECT_DIR/scripts/hooks/continue-injector.ps1")"
    # Launch detached so the hook returns fast; the injector outlives the hook.
    powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass \
      -Command "Start-Process -WindowStyle Hidden -FilePath powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','$PS_SCRIPT'" \
      >/dev/null 2>&1 &
    disown 2>/dev/null || true
    ;;
  Darwin)
    nohup osascript -e 'delay 2.5' \
      -e 'tell application "System Events" to keystroke "continue"' \
      -e 'tell application "System Events" to key code 36' \
      >/dev/null 2>&1 &
    disown 2>/dev/null || true
    ;;
  Linux)
    if command -v xdotool >/dev/null 2>&1; then
      ( sleep 2.5; xdotool type --delay 30 "continue"; xdotool key Return ) \
        >/dev/null 2>&1 &
      disown 2>/dev/null || true
    fi
    ;;
esac

echo "[$(date -Iseconds)] SessionStart-bootstrap spawned continue-injector" >> "$HOOK_LOG"

# 6.3.5 -- orphan-worktree sweep (SC-26).
# Lists .git/worktrees/orch-* dirs; for each, queries the orch DB for an
# ACTIVE session with that worktreePath; prunes unmatched dirs via
# `git worktree remove --force`. Idempotent; non-fatal on errors.
if command -v git >/dev/null 2>&1 && [ -d "$PROJECT_DIR/.git" ]; then
  for wt in "$PROJECT_DIR/.git/worktrees/orch-"*/; do
    [ -d "$wt" ] || continue
    SID=$(basename "$wt" | sed 's/^orch-//')
    # Query DB via npx (existing pattern in session-handoff.sh).
    ACTIVE=$(npx --no-install tsx "$PROJECT_DIR/scripts/utilities/session-active-check.ts" "$SID" 2>/dev/null || echo "no")
    if [ "$ACTIVE" != "yes" ]; then
      git -C "$PROJECT_DIR" worktree remove --force "$wt" 2>/dev/null || true
      echo "[$(date -Iseconds)] orphan-worktree-pruned sessionId=$SID path=$wt" >> "$HOOK_LOG"
    fi
  done
fi

exit 0
