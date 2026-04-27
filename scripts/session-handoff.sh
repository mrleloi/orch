#!/usr/bin/env bash
# session-handoff.sh — spawn a fresh Claude Code session that resumes the current Orch work
# Usage:
#   ./scripts/session-handoff.sh              # uses latest checkpoint
#   ./scripts/session-handoff.sh <slug>       # uses specific checkpoint by slug
#   ORCH_CCS_PROFILE=work ./scripts/session-handoff.sh   # route through ccs profile
set -euo pipefail

# Resolve project dir (script is in scripts/, project root is one up)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKPOINT_DIR="$PROJECT_DIR/agent-workspace/memory/checkpoints"

# Pick checkpoint
if [ $# -ge 1 ]; then
  CHECKPOINT=$(ls -t "$CHECKPOINT_DIR"/*"$1"*.md 2>/dev/null | head -1)
else
  CHECKPOINT=$(ls -t "$CHECKPOINT_DIR"/*.md 2>/dev/null | grep -v 'latest\.md$' | head -1)
fi

if [ -z "${CHECKPOINT:-}" ] || [ ! -f "$CHECKPOINT" ]; then
  echo "[ERROR] No checkpoint found in $CHECKPOINT_DIR" >&2
  exit 1
fi

echo "[INFO] Resuming from checkpoint: $(basename "$CHECKPOINT")"

# Bootstrap prompt — session-agnostic; the resume target reads the checkpoint for specifics
BOOTSTRAP="You are Claude (Opus 4.7) resuming a FULL AUTONOMOUS Orch execution session.

STEP 1 — read these files in order before any other action:
- $CHECKPOINT    (the handoff checkpoint — has current phase/task/next-action)
- $PROJECT_DIR/CLAUDE.md    (project instructions)
- $PROJECT_DIR/PROJECT_CHARTER.md    (immutable vision + invariants)
- $PROJECT_DIR/agent-workspace/memory/current-execution.md    (routing)
- $PROJECT_DIR/agent-workspace/memory/budget-tracker.md    (budget discipline — reset your counter to 0, cliff rules apply)
- $PROJECT_DIR/agent-workspace/session-plans/pending/phase-1-core.md    (current-phase plan)

STEP 2 — honor hard project rules:
- Fully autonomous; never ask the user — resolve ambiguity via charter + decisions/NNN-*.md
- Every Agent dispatch MUST use run_in_background=true
- Hook commands use \$CLAUDE_PROJECT_DIR
- Every spawn of a fresh claude session MUST use --rc (Remote Control); scripts/session-handoff.sh handles this
- At YOUR ~200K mark: write a new checkpoint to agent-workspace/memory/checkpoints/, update latest.md, then invoke 'ORCH_HEADLESS=1 scripts/session-handoff.sh' IN BACKGROUND via your Bash tool BEFORE ending your turn. This chains the autonomous loop.
- Never commit (I-6); stage only

STEP 3 — resume at the 'next_action' section of the checkpoint. Dispatch the next subagent via Agent tool (run_in_background=true). Continue the task loop until (a) Phase 4 complete (STOP-5), (b) you hit your own 200K mark (checkpoint + self-handoff), or (c) a real STOP-1/2/3/4 condition.

Begin now."

# Spawn fresh claude session in Remote Control ACTIVE mode (required by project rule).
# --rc (alias of --remote-control) makes the session controllable from claude.ai / Claude app.
# Session name includes current phase/task slug for discoverability.
RC_NAME="${ORCH_RC_NAME:-orch-$(basename "$CHECKPOINT" .md)}"

# Strip CLAUDECODE so a nested claude-from-claude spawn doesn't trip the nested-session guard.
# (ccs does this automatically when invoked; mirror the behavior for direct claude spawns.)
unset CLAUDECODE

cd "$PROJECT_DIR"

# Autonomous mode (ORCH_HEADLESS=1): use -p so the session runs without TTY, reads bootstrap,
# executes Phase plan loop, writes next checkpoint, and exits. Required for in-session self-handoff
# (the outgoing session triggers this script in the background before ending its own turn).
if [ "${ORCH_HEADLESS:-0}" = "1" ]; then
  LOG_DIR="$PROJECT_DIR/agent-workspace/memory/handoff-logs"
  mkdir -p "$LOG_DIR"
  LOG_FILE="$LOG_DIR/$(date +%Y%m%dT%H%M%SZ)-$RC_NAME.log"
  echo "[INFO] Headless handoff → $LOG_FILE"
  if [ -n "${ORCH_CCS_PROFILE:-}" ]; then
    exec ccs "$ORCH_CCS_PROFILE" claude --rc "$RC_NAME" -p "$BOOTSTRAP" > "$LOG_FILE" 2>&1
  else
    exec claude --rc "$RC_NAME" -p "$BOOTSTRAP" > "$LOG_FILE" 2>&1
  fi
fi

# Interactive mode (default): user launches manually; attaches to their terminal.
if [ -n "${ORCH_CCS_PROFILE:-}" ]; then
  exec ccs "$ORCH_CCS_PROFILE" claude --rc "$RC_NAME" "$BOOTSTRAP"
else
  exec claude --rc "$RC_NAME" "$BOOTSTRAP"
fi
