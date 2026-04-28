---
name: context-restore
description: Use at session start when resuming after a crash, compact, or split — restores context from the latest (or specified) checkpoint in agent-workspace/memory/checkpoints/.
allowed-tools: [Read, Bash, Glob]
---

# /context-restore — Resume From Checkpoint

## Purpose

Reconstructs session state from a previous `/context-save` checkpoint. Use when:
- Session was crashed or context-compacted
- A new session is picking up a split work stream
- Orchestrator spawned a session to continue from a specific point

Input: optional `$ARGUMENTS` — a checkpoint slug. If empty → use the most recent checkpoint.

## Process

### Step 1: Locate checkpoint

If `$ARGUMENTS` is empty:
```bash
ls -t agent-workspace/memory/checkpoints/ | head -1
```

Else: look for `<slug>*.md` in that directory.

If none exist → STOP, tell user/orchestrator to use `/session-start` instead.

### Step 2: Read checkpoint

Read the checkpoint file fully. Extract:
- Session type
- Goal
- Plan path
- Current task/subtask
- Files to reload
- Next action

### Step 3: Load pointed-to artifacts

In this order:
1. Session plan at `plan_path`
2. `agent-workspace/memory/current-execution.md` (may have advanced since checkpoint)
3. Each file listed in "Files modified" — inspect current state (may differ from checkpoint if another session ran meanwhile)
4. Referenced decisions in `decisions/`

### Step 4: Reconcile

Compare checkpoint state against current git state:

```bash
git status
git diff --stat
```

If files have been modified beyond the checkpoint's record → flag "state has advanced beyond checkpoint". Human decision required (or, in spawned mode, escalate).

### Step 5: Produce resume summary

Output to invoker (or embed in session-start narrative):

```markdown
## Resumed from checkpoint: <slug>

- **Session type**: <type>
- **Goal**: <one sentence>
- **Where we left off**: <exact next action>
- **Files in-flight**: [list]
- **Invariants pending**: [list]
- **Decisions made before this checkpoint**: [list refs]

Ready to continue. Next action: <the exact next step from checkpoint>
```

> **Note**: `/session-start` is the standard entry point. `/context-restore` is specifically for continuing an interrupted work stream — it assumes a checkpoint exists.

## Spawned Session Handling

If `ORCH_SPAWNED=true`:
- Do not ask the user to confirm resume point.
- If state has advanced beyond checkpoint → write escalation and HALT.
- Emit structured completion:
  ```yaml
  ---
  status: DONE | STATE_MISMATCH
  checkpoint_loaded: <path>
  next_action:
    command: <what to run next>
    args: { ... }
  ---
  ```
