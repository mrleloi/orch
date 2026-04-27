#!/usr/bin/env bash
# session-self-reboot.sh — cross-platform wrapper around session-self-reboot.ps1
# Sends /new + "continue" keystrokes to the current Claude Code TUI.
#
# Usage (from the main Claude Code session, via Bash tool):
#   bash scripts/session-self-reboot.sh
#   bash scripts/session-self-reboot.sh "custom first prompt"
#
# Platform notes:
#   - Windows: delegates to PowerShell SendKeys (System.Windows.Forms).
#   - macOS: uses osascript (AppleScript System Events).
#   - Linux: uses xdotool if available.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# First arg accepted for back-compat but IGNORED — fresh session bootstraps via SessionStart hook.

PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FAIL_MARKER="$PROJECT_DIR/agent-workspace/memory/.auto-reboot-FAILED"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    PS_SCRIPT_WIN="$(cygpath -w "$SCRIPT_DIR/session-self-reboot.ps1")"
    # Capture PS exit code. Parse-error or any non-zero return MUST surface as
    # .auto-reboot-FAILED so budget-watchdog.sh's retry path clears the once-only
    # markers on the next Stop hook. Without this, a broken .ps1 silently blocks
    # every future reboot in the session (observed 2026-04-26: em-dash UTF-8
    # bytes parsed as CP1252 garbage -> parser abort -> .auto-reboot-FAILED
    # never written -> .wind-down-fired persists -> all retries blocked).
    if ! powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PS_SCRIPT_WIN"; then
      EXIT=$?
      mkdir -p "$(dirname "$FAIL_MARKER")"
      printf 'AUTO-REBOOT FAILED at %s\nReason: powershell.exe exited %s (script parse error / other PS-level failure -- did NOT reach SendKeys logic).\nFile: %s\nAction: investigate scripts/session-self-reboot.ps1; common causes: non-ASCII chars (em-dash) parsed as CP1252 garbage, missing braces, or PS module import failure.\nNext Stop hook: budget-watchdog.sh will detect this marker and retry the reboot.\n' \
        "$(date -Iseconds)" "$EXIT" "$PS_SCRIPT_WIN" > "$FAIL_MARKER"
      echo "[ERROR] session-self-reboot.ps1 exited $EXIT; wrote .auto-reboot-FAILED for watchdog retry" >&2
      exit "$EXIT"
    fi
    ;;
  Darwin)
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    rm -f "$PROJECT_DIR/agent-workspace/memory/.session-ready"
    rm -f "$PROJECT_DIR"/agent-workspace/memory/.continue-fired-*
    # Only send /new here; fresh session's SessionStart hook will auto-inject "continue".
    osascript <<EOF
delay 0.4
tell application "System Events"
  keystroke "/new"
  key code 36
end tell
EOF
    ;;
  Linux)
    if ! command -v xdotool >/dev/null 2>&1; then
      echo "[ERROR] xdotool not installed; install: apt install xdotool" >&2
      exit 1
    fi
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    rm -f "$PROJECT_DIR/agent-workspace/memory/.session-ready"
    rm -f "$PROJECT_DIR"/agent-workspace/memory/.continue-fired-*
    sleep 0.4
    xdotool type --delay 30 "/new"
    xdotool key Return
    ;;
  *)
    echo "[ERROR] Unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac

echo "[INFO] /new + Enter sent. Fresh session will auto-bootstrap via SessionStart hook."
