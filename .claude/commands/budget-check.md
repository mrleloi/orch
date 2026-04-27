---
name: budget-check
description: Use to inspect current session token usage and report threshold warnings. Auto-runs at 50%, 70%, 85% thresholds.
tools: [Read, Bash]
---

# /budget-check — Inspect Session Token Usage

> Reports current session consumption + threshold warnings.
> Auto-runs at 50%, 70%, 85% thresholds.

## Steps

### 1. Estimate Current Usage
- Sum input tokens from all messages
- Sum output tokens
- Include tool use overhead

### 2. Compare to Budget
- From `current-execution.md` session type: get budget (e.g., 150K for FOCUSED_IMPL)
- Calculate percentage used

### 3. Report

```markdown
## Budget Check — Session N

- Session type: <TYPE>
- Budget: X K
- Used: Y K
- Percent: Z%
- Remaining: (X-Y) K

## Threshold Status
- <50%: normal
- 50-70%: caution — avoid large new file loads
- 70-85%: finalize current task, prepare handoff
- >85%: immediate handoff
- >92%: emergency stop
```

### 4. Auto-Actions

If threshold crossed:
- 50%: log, notify "entering caution zone"
- 70%: suggest completing current task, then /session-end
- 85%: force `/session-end` now
- 92%: emergency — stop mid-task if necessary, detailed handoff note

> **Token sources**: status indicator (bottom of terminal), OTEL spans `claude_code.interaction`, or `/cost` built-in command.

## Spawned Session Handling

Automatically respect thresholds. Do not ignore for "just one more thing".
