---
name: phase-advance
description: Use to validate current phase completion criteria and advance to the next phase. Invoked automatically at end of each phase in autonomous mode.
tools: [Read, Write, Bash]
---

# /phase-advance — Move to Next Phase

> Validates current phase is complete, writes completion marker, advances.
> Invoked automatically at end of each phase in autonomous mode.

## Steps

### 1. Read Current Phase
From `current-execution.md` → phase number N.

### 2. Check Completion Criteria
Open `agent-workspace/session-plans/pending/phase-N-*.md`. Read success criteria section.

For each criterion:
- Find evidence (file exists, test output, log entry)
- Mark ✅ or ❌

### 3. If Criteria Incomplete
STOP. Do NOT advance. Report:
```
Cannot advance — Phase N criteria not met:
- ❌ <criterion 1>
- ❌ <criterion 2>
```

Write incomplete list to `escalation.md` if in autonomous mode and critical.

### 4. Write Phase Completion
Write to agent-workspace/memory/phase-N-complete.md:

```markdown
# Phase N Complete — <DATE>

## Evidence Summary
- ✅ Criterion 1: <evidence>
- ✅ Criterion 2: <evidence>
...

## Total Effort
- Sessions: M
- Tokens: Approx XK (from aggregated OTEL)
- Wall time: ~X hours
- Files created: Z
- Tests: T passing

## Decisions Made
[Links to decisions/NNN-*.md from this phase]

## Lessons for Next Phase
- <insight 1>
- <insight 2>

## Handoff to Phase N+1
- Starting point: <>
- Key context: <>
```

### 5. Move Phase Plan
```bash
mv agent-workspace/session-plans/pending/phase-N-*.md \
   agent-workspace/session-plans/completed/
```

### 6. Update current-execution.md
- Phase: N → N+1
- Phase file: updated pointer
- Status: not_started

### 7. Load Next Phase Plan
If `phase-(N+1)-*.md` exists → read it, ready to execute.
If this was the final phase → write `project-complete.md` instead, celebrate.

### 8. Report
```
Phase N → Phase N+1

Completed:
- [evidence summary]

Next: Phase N+1 — <title>
First task: <task N+1.1 name>
Autonomous: proceeding.
```

## Spawned Session Handling

Advance without user prompt. Begin Phase N+1 Task 1 immediately.
In interactive mode: after report, ask "Proceed to Phase N+1?" and wait.
