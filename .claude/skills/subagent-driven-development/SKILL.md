---
name: subagent-driven-development
description: Use when executing a session plan that has N discrete tasks. Drives subagent-per-task execution with two-stage review. Mandatory for MULTI_TASK_IMPL sessions with 3+ tasks. Cannot be rationalized away by "the session is small enough to do in one subagent."
allowed-tools: [Read, Task, Bash]
archetype: discipline
model: opus
---

# Subagent-Driven Development

## When to invoke

- Session plan exists with 3+ tasks
- Session type is MULTI_TASK_IMPL
- Any FOCUSED_IMPL where tasks touch independent modules

Even 1% chance this applies → invoke. Not optional, not rationalizable.

## Red Flags — STOP if you catch yourself thinking

- "It's easier to just do all tasks in one subagent" → wrong, context pollution
- "The two-stage review is redundant because I already checked" → wrong, you have implementer's bias
- "Fresh context per task is wasteful" → wrong, that IS the mechanism
- "This task is trivial, skip the reviewer" → wrong, triviality is judged AFTER review not before
- "I'll self-review quickly" → wrong, same-agent review = echo chamber

## Rationalization Counters

**Pressure**: "User wants it fast, orchestration overhead is slowing us down."
**Correct response**: The overhead is paid in compute, not quality. Orchestrator runs subagents in sequence; the wall clock cost is lower than one confused session rewriting its own mistakes.

**Pressure**: "The task is 5 lines, the reviewers will rubber-stamp."
**Correct response**: Rubber-stamping is evidence of healthy process, not wasted work. A 5-line task still has a spec contract to check; the reviewer is 2K tokens, not a ceremony.

**Pressure**: "I already know this code, I'll do all tasks together."
**Correct response**: Knowing the code is exactly when context pollution is most dangerous. Confidence without isolation = quiet drift.

## The Flow

```
For each task in session plan, in order:

  Step 1. Dispatch task-implementer (sonnet, FRESH context)
          - Input: task_id, plan_path, spec_refs
          - Output: status (DONE | BLOCKED | ...), observation_path

  Step 2. IF status != DONE and != DONE_WITH_CONCERNS:
            escalate → STOP
          ELSE:
            continue

  Step 3. Dispatch spec-compliance-reviewer (sonnet, FRESH context)
          - Input: task_id, plan_path, spec_refs, observation_path
          - Reads ACTUAL code, not observation report
          - Output: verdict (PASS | FAIL)

  Step 4. IF verdict == FAIL:
            dispatch task-implementer again with fix list
            loop back to Step 3 (max 3 iterations)
          ELSE:
            continue

  Step 5. Dispatch code-quality-reviewer (sonnet, FRESH context)
          - Input: diff, observation_path, spec review path
          - Output: verdict (APPROVED | REJECTED)

  Step 6. IF verdict == REJECTED:
            dispatch task-implementer with fix list
            loop back to Step 5 (max 2 iterations)
          ELSE IF verdict == APPROVED_WITH_CONCERNS:
            append concerns to agent-notes.md, proceed
          ELSE:
            proceed

  Step 7. Mark task done in session plan
  Step 8. Next task
```

## Hard rules

- **Fresh context per task.** Each subagent dispatch starts clean. No inherited conversation history.
- **Two-stage review, never one.** Spec compliance first, code quality second. Do NOT combine.
- **Reviewer reads code, not reports.** The implementer's self-report is a claim; the diff is evidence.
- **Max 3 spec-fix loops, max 2 quality-fix loops.** Beyond that → escalate architecture question.
- **Orchestrator (main session) does not write code.** Only dispatches subagents, reads reports, decides next step.

## When NOT to use

- Session type is PLAN, RESEARCH, VERIFY (those have their own patterns)
- Session has exactly 1 task AND spec is <500 words AND no cross-module touches → use sandwich-dev instead (per-session)

## Example dispatch transcript (compact)

```
Orchestrator → task-implementer(task_id="2.1", plan="003-queue-module.md")
task-implementer → "status: DONE, observation: obs/task-2.1-*.md, files: 4"

Orchestrator → spec-compliance-reviewer(task_id="2.1", observation="...")
spec-reviewer → "verdict: PASS, no missing clauses"

Orchestrator → code-quality-reviewer(task_id="2.1", ...)
quality-reviewer → "verdict: APPROVED, 2 nits logged"

Orchestrator → mark task 2.1 done, dispatch task 2.2
```

## Cost model

Per task (typical):
- task-implementer: 20-40K tokens (sonnet)
- spec-compliance-reviewer: 8-15K tokens (sonnet)
- code-quality-reviewer: 10-20K tokens (sonnet)

Total per task: ~40-75K sonnet tokens. A 5-task session: ~200-375K sonnet, vs ~150K single opus session. Cost parity approximately; quality substantially higher due to context isolation.
