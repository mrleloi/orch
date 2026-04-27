---
name: session-end
description: Use to close a work session — persists state, writes session log, stages changes, and prepares handoff. Not optional.
tools: [Read, Write, Bash]
---

# /session-end — Close Work Session

## Steps

### 1. Summarize
Review: goal, accomplished, blocked/unresolved, surprises.

### 2. Write Session Log
Write to agent-workspace/memory/sessions/YYYY-MM-DD-session-N.md:

```markdown
# Session N — YYYY-MM-DD
## Goal / Type / Context Budget / Approach
## Accomplished  [task + file refs]
## Blocked / Unresolved  [item — reason]
## Decisions Made  [refs to decisions/NNN.md]
## Learned Rules / Patterns Noticed
## Files Modified  [git diff --name-only]
## Next Session Pickup  [specific instruction]
## Gates Status  [Typecheck|Lint|Tests|Invariants]
```

### 3. Update project.md
If architectural decision made, phase boundary reached, or invariant needs adjustment.

### 4. Update current-execution.md
Move completed tasks, update Next Up, increment session counter, update active phase.

### 5. Append to agent-notes.md (if new rule learned)
Format: `## YYYY-MM-DD — <Rule one-liner>` / Context / Rule / Evidence path.

### 6. Write Decisions (if autonomous mode made any)
`agent-workspace/memory/decisions/NNN-<slug>.md` per template.

### 7. Check Phase Completion
If all criteria met: write `phase-N-complete.md`, advance `current-execution.md` phase → N+1, move plan to `completed/`.

### 8. Stage Changes
```bash
git add -A && git status
```
Report what's staged. Do NOT commit unless user explicitly requested.

### 9. Write Escalation Sentinel (G-1 — always)
Always write `agent-workspace/memory/escalation.md`. `status: NONE` = clean close.

```markdown
---
status: NONE | STOP-1 | STOP-2 | STOP-3 | STOP-4 | STOP-5
last_session: <id>   last_check: <ISO-ts UTC>   phase: <N>
---
## Trigger  ## Evidence  ## Last attempted fix  ## Question for user
```

### 10. Output Session End Summary
Summary / Files Changed / Memory Updated / Gates Status / Phase Status / Next Pickup / Staged for Commit.

## Error Handling

- Can't write session log → CRITICAL, try tmp location, report
- Gates failed → do NOT claim success
- Phase advance logic fails → STOP, escalate

## Spawned Session Handling

- Do NOT wait for user confirmation
- Proceed to next task or next phase automatically
- Only stop on STOP conditions (see autonomous-protocol.md)
