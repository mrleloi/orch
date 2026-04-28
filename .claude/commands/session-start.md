---
name: session-start
description: Use at the start of every work session to load project context, identify session type, and output a session brief.
allowed-tools: [Read, Bash, Glob]
---

# /session-start — Begin Work Session

## When to Use

At the start of every session. In autonomous mode, triggered by SessionStart hook or first-prompt awareness.

## Steps

Input: optional `$ARGUMENTS` — session goal override; if absent: infer from `current-execution.md`.

### 1. Check if first session
If `current-execution.md` shows `phase: 0` and no session logs exist → first session.
Output: welcome message + suggest reading `docs/DAY_1_CHECKLIST.md`.

### 2. Load State
Read in order:
1. `agent-workspace/memory/current-execution.md`
2. `agent-workspace/memory/project.md`
3. Last 3 session logs in `agent-workspace/memory/sessions/`
4. Active escalation if `agent-workspace/memory/escalation.md` exists → STOP immediately and report

### 3. Determine Session Type
Apply decision tree from `session-budgets.md`:
- Plan exists for current task? → FOCUSED_IMPL / MULTI_TASK_IMPL
- No plan? → PLAN (invoke master-planner)
- Previous failed? → RECOVERY first
- Research tasks? → RESEARCH

### 4. Estimate Budget
Per session-budgets.md formula. If > 250K: flag split.

### 5. Load Session Plan
Look in `session-plans/pending/` for matching plan.
If found: load.
If missing: invoke master-planner subagent to create.

### 6. Output Session Brief

```markdown
# Session Brief — Session N — <DATE>

## Goal
<From plan>

## Session Type
<TYPE>

## Context Budget Estimate
- Fixed overhead: X K
- Variable: Y K
- Working space: Z K
- **Total**: XXX K (of 250K cap)

## Current Phase
Phase N — <name>

## Recent Sessions
- N-1: <summary>
- N-2: <summary>
- N-3: <summary>

## Files to Load
<list>

## Active Constraints
<from constitution>

## Task Plan
<from session plan file>

## Spawned Mode
<active|not active — see current-execution.md>
```

### 7a. Autonomous Mode: Proceed
Skip user confirmation. Begin executing task plan.

### 7b. Interactive Mode: Wait
Ask user to confirm or adjust brief before proceeding.

## First Session Output

If phase 0 + session 1:

```markdown
# Welcome to Orch

This is the first session. Let me load the starter kit.

## Charter Summary
<2 sentences from PROJECT_CHARTER.md vision>

## Recommended First Actions
1. Read `PROJECT_CHARTER.md` fully
2. Read `agent-workspace/constitution/autonomous-protocol.md`
3. Follow Phase 0 master plan: agent-workspace/session-plans/pending/phase-0-research.md

## Spawned Mode
`current-execution.md` shows `autonomous_mode: true`.
Proceeding to Phase 0 Task 1: Scaffold Repo Structure.
```

## Error Handling

- Missing memory file → report, do not guess
- Missing constitution file → CRITICAL, stop
- `current-execution.md` contradicts `project.md` → flag for human

## Anti-Patterns to Avoid

- Skipping memory load "to save time"
- Loading entire codebase upfront
- Guessing session type (follow decision tree)
- Proceeding without checking escalation file

## Spawned Session Handling

Skip user confirmation. Proceed autonomously based on `current-execution.md`.
