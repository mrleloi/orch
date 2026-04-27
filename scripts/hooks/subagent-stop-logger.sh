#!/usr/bin/env bash
# subagent-stop-logger.sh — SubagentStop hook: logs structured SubagentStop events to
# .session-hooks.log for consumption by build-subagent-index.sh (path a).
#
# Hook invocation: Claude Code SubagentStop hook passes payload via stdin JSON:
#   { "agent_id": "...", "status": "...", "session_id": "..." }
#
# Falls back to env vars (CLAUDE_AGENT_ID, CLAUDE_AGENT_STATUS) if stdin is unavailable.
# Writes one line per SubagentStop event in the canonical format:
#   [TS] SubagentStop agentId=XXXX status=STATUS session=SESS
#
# Used by build-subagent-index.sh as path-a (forward-looking SubagentStop data source).
# Part of Phase 5.1 loop-resilience hardening — Task 5.1.7 (SC-15).

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
LOG_FILE="$PROJECT_DIR/agent-workspace/memory/.session-hooks.log"
TS="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')"

# ─── Parse stdin JSON (primary — per architect §7 Q4 resolution) ──────────────
STDIN_JSON="$(cat 2>/dev/null || true)"
AGENT_ID=""
STATUS=""
SESSION_ID=""

if [[ -n "$STDIN_JSON" ]]; then
  if command -v jq >/dev/null 2>&1; then
    AGENT_ID="$(printf '%s' "$STDIN_JSON" | jq -r '.agent_id // empty' 2>/dev/null || true)"
    STATUS="$(printf '%s' "$STDIN_JSON" | jq -r '.status // empty' 2>/dev/null || true)"
    SESSION_ID="$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null || true)"
  else
    # Bash-only regex fallback (Windows / minimal envs without jq)
    if [[ "$STDIN_JSON" =~ \"agent_id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      AGENT_ID="${BASH_REMATCH[1]}"
    fi
    if [[ "$STDIN_JSON" =~ \"status\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      STATUS="${BASH_REMATCH[1]}"
    fi
    if [[ "$STDIN_JSON" =~ \"session_id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      SESSION_ID="${BASH_REMATCH[1]}"
    fi
  fi
fi

# ─── Fall back to env vars if stdin didn't yield values ───────────────────────
# CLAUDE_AGENT_ID / CLAUDE_AGENT_STATUS may or may not be set depending on Claude Code version.
[[ -z "$AGENT_ID"    ]] && AGENT_ID="${CLAUDE_AGENT_ID:-}"
[[ -z "$STATUS"      ]] && STATUS="${CLAUDE_AGENT_STATUS:-}"
[[ -z "$SESSION_ID"  ]] && SESSION_ID="${CLAUDE_SESSION_ID:-}"

# ─── Guard: skip if no useful data ────────────────────────────────────────────
if [[ -z "$AGENT_ID" && -z "$STATUS" ]]; then
  printf '[subagent-stop-logger] no agent_id or status available — skipping log entry\n' >&2
  exit 0
fi

# ─── Ensure log directory exists and write entry ──────────────────────────────
mkdir -p "$(dirname "$LOG_FILE")"
printf '[%s] SubagentStop agentId=%s status=%s session=%s\n' \
  "$TS" "${AGENT_ID:-unknown}" "${STATUS:-unknown}" "${SESSION_ID:-}" \
  >> "$LOG_FILE"

# ─── Trigger incremental index update (--update mode) ─────────────────────────
# Run in background to avoid blocking the hook chain. Errors are non-fatal.
BUILD_SCRIPT="$PROJECT_DIR/scripts/utilities/build-subagent-index.sh"
if [[ -f "$BUILD_SCRIPT" ]]; then
  bash "$BUILD_SCRIPT" --update >/dev/null 2>&1 &
fi

exit 0
