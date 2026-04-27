#!/usr/bin/env bash
# orch-autoloop.sh — LAUNCHER that keeps spawning fresh Claude Code sessions until a stop
# sentinel is written. Use this when you want truly autonomous multi-session execution
# without manually typing /new each time.
#
# Each iteration:
#   1. Reads the latest checkpoint (or the initial kickoff file)
#   2. Spawns `claude --rc "orch-<timestamp>" "<bootstrap>"` — interactive TTY session
#   3. Waits for claude to exit (user-closed or programmatic /exit)
#   4. Checks for stop sentinel ./.orch-stop — if present, exit the loop; else repeat
#
# The inner session is responsible for:
#   - Reading checkpoints/latest.md for context
#   - Doing work (dispatching subagents, etc.)
#   - At 200K: writing a new checkpoint + latest.md
#   - At 230K: writing `.orch-stop` with reason="cliff" (or continuing next iteration by not writing it)
#   - When Phase 4 complete: writing `.orch-stop` with reason="done"
#   - Exiting cleanly so this launcher can start the next iteration
#
# Usage:
#   bash scripts/orch-autoloop.sh              # loop until .orch-stop
#   ORCH_CCS_PROFILE=work bash scripts/orch-autoloop.sh    # route through ccs
#   ORCH_MAX_ITER=10 bash scripts/orch-autoloop.sh         # safety cap
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKPOINT_DIR="$PROJECT_DIR/agent-workspace/memory/checkpoints"
STOP_SENTINEL="$PROJECT_DIR/.orch-stop"
MAX_ITER="${ORCH_MAX_ITER:-50}"

cd "$PROJECT_DIR"

# Clean any stale stop sentinel from a previous run.
[ -f "$STOP_SENTINEL" ] && rm "$STOP_SENTINEL"

ITER=0
while [ "$ITER" -lt "$MAX_ITER" ]; do
  ITER=$(( ITER + 1 ))
  echo "[autoloop] ===== iteration $ITER / $MAX_ITER at $(date -Iseconds) ====="

  # Resolve the latest checkpoint.
  CHECKPOINT="$CHECKPOINT_DIR/latest.md"
  if [ ! -f "$CHECKPOINT" ]; then
    CHECKPOINT=$(ls -t "$CHECKPOINT_DIR"/*.md 2>/dev/null | head -1)
  fi
  if [ -z "${CHECKPOINT:-}" ] || [ ! -f "$CHECKPOINT" ]; then
    echo "[autoloop] [ERROR] no checkpoint found in $CHECKPOINT_DIR — aborting" >&2
    exit 1
  fi

  RC_NAME="orch-autoloop-iter$ITER-$(date +%s)"
  BOOTSTRAP="You are Claude (Opus 4.7) resuming the Orch autonomous execution.

STEP 1 — read in order:
- $CHECKPOINT
- $PROJECT_DIR/CLAUDE.md
- $PROJECT_DIR/PROJECT_CHARTER.md
- $PROJECT_DIR/agent-workspace/memory/current-execution.md
- $PROJECT_DIR/agent-workspace/memory/budget-tracker.md (reset your counter to 0)
- $PROJECT_DIR/agent-workspace/session-plans/pending/phase-1-core.md

STEP 2 — honor rules:
- Autonomous; never ask user
- Every Agent dispatch: run_in_background=true
- Every new session: --rc flag (autoloop handles it)
- At YOUR 200K: write new checkpoint, copy to latest.md, DO NOT write $STOP_SENTINEL, exit turn — autoloop spawns iteration $(( ITER + 1 )) automatically
- When Phase 4 complete OR a real STOP condition: write '\$STOP_SENTINEL with a reason line, exit turn

STEP 3 — resume at the 'next_action' of the checkpoint.

Begin."

  # Strip CLAUDECODE so the inner claude doesn't refuse via nested-session guard.
  unset CLAUDECODE

  if [ -n "${ORCH_CCS_PROFILE:-}" ]; then
    ccs "$ORCH_CCS_PROFILE" claude --rc "$RC_NAME" "$BOOTSTRAP" || true
  else
    claude --rc "$RC_NAME" "$BOOTSTRAP" || true
  fi

  # Post-iteration: check stop sentinel.
  if [ -f "$STOP_SENTINEL" ]; then
    echo "[autoloop] stop sentinel found ($(cat "$STOP_SENTINEL")); exiting."
    rm "$STOP_SENTINEL"
    exit 0
  fi

  echo "[autoloop] iteration $ITER done; no stop sentinel; looping."
  sleep 2
done

echo "[autoloop] [WARN] hit MAX_ITER=$MAX_ITER without stop sentinel; aborting." >&2
exit 2
