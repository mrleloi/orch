---
name: context-save
description: Save a mid-session checkpoint to agent-workspace/memory/checkpoints/ with structured context. Complements git checkpoints for crash-safety in long sessions.
tools: [Read, Write, Bash]
---

# /context-save — Mid-Session Checkpoint

## Purpose

Writes a structured checkpoint snapshot of the current session state. Enables:
- Recovery if the session crashes or context overflows
- Handoff if splitting a session at a budget cliff
- Pause-and-resume patterns for long autonomous runs

Input: optional `$ARGUMENTS` — a short slug for the checkpoint (defaults to timestamp).

## When to invoke

- Budget approaching 60-70% threshold
- Mid-task at a natural boundary (subtask just passed verification)
- About to dispatch a long-running subagent
- Manually requested by user

## Process

### Step 1: Collect state

- Current session type and goal (from session log-in-progress or conversation)
- Active session plan path
- Current task_id or subtask
- Files modified so far (staged, not committed): `git diff --name-only --cached` + `git diff --name-only`
- Decisions made this session (files written to `decisions/` this session)
- Failed approaches attempted (brief notes)
- Budget consumed (estimate)
- Next steps planned

### Step 2: Write checkpoint

`agent-workspace/memory/checkpoints/<slug>-<timestamp>.md`:

```markdown
# Checkpoint: <slug>
Created: <ISO timestamp>
Session: <CLAUDE_SESSION_ID if available>

## Session Context
- **Type**: PLAN | FOCUSED_IMPL | MULTI_TASK_IMPL | VERIFY | RESEARCH | RECOVERY
- **Goal**: <one sentence>
- **Plan path**: agent-workspace/session-plans/pending/NNN-*.md
- **Current task/subtask**: <id or "—">

## Decisions made this session
- [ref to decisions/NNN-*.md]

## Files modified (staged or unstaged)
- path/to/file1.ts — [what changed]
- path/to/file2.ts — [what changed]

## Failed approaches (learned, avoid retry)
- Tried X — failed because Y

## Budget
- Consumed: ~NNK
- Remaining: ~NNK
- Thresholds hit: [50% | 70% | 85% | —]

## Resume instructions (for /context-restore or a fresh session)
1. Read this checkpoint
2. Read the session plan at <plan_path>
3. Re-open files: <list>
4. Continue from: <exact next action>

## Invariant state
- All invariants that have been checked this session: [list]
- Any pending invariant concerns: [list]
```

### Step 3: Stage checkpoint (do not commit)

```bash
git add agent-workspace/memory/checkpoints/<slug>-<timestamp>.md
```

Git history of checkpoints becomes a natural recovery log. Do NOT commit — staging is enough.

### Step 4: Report

Return to invoker: checkpoint path + one-line resume hint.

> **Note**: `/session-end` writes the authoritative session log. Checkpoints are transient snapshots during a session. On clean end, the last checkpoint can be deleted or left for history.

## Spawned Session Handling

If `ORCH_SPAWNED=true`:
- Always include `CLAUDE_SESSION_ID` if available
- Emit structured completion:
  ```yaml
  ---
  status: DONE
  checkpoint_path: <abs path>
  resume_hint: <one-liner>
  ---
  ```
