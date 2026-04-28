---
name: verification-before-completion
description: Use after any implementation task before declaring it done. Enforces evidence-based completion — "done" requires artifacts, not assertions. Applies to every IMPL subtask, not just session end.
allowed-tools: [Bash, Read, Grep]
archetype: discipline
model: sonnet
---

# Verification Before Completion

## When to invoke

Before writing "task done", "implemented", "fixed" anywhere (commit message, session log, self-report, orchestrator response) — run the checklist.

Not once per session. **Once per task.**

## Red Flags — STOP

- "Looks good to me" without running gates → reject your own conclusion
- "The test passes on my machine" → rerun in a fresh shell
- "I verified similar code earlier" → each task is its own verification
- "Tests aren't needed for this small change" → ALWAYS wrong for production code
- "I'll add the test after" → no; then = never

## The Checklist

Copy this into your response/log before claiming done:

```markdown
## Completion Verification — Task <id>

- [ ] **Scoped typecheck**: `pnpm run typecheck` passed (paste last 3 lines)
- [ ] **Scoped lint**: `pnpm run lint <scope>` passed
- [ ] **Scoped tests**: `pnpm test <scope>` — show count `N passed, 0 failed`
- [ ] **Invariant grep** (relevant subset):
  - I-1 no SDK in core: PASS
  - I-2 no project-name hardcoding: PASS
  - I-3 no agent-sdk in non-test: PASS
  - I-5 no ~/.ccs or ~/.claude path: PASS
  - I-14 no module-level mutable state: PASS
- [ ] **Diff self-audit (P3)**: `git diff --stat` reviewed; every changed line traces to task
- [ ] **No speculative flexibility (P2)**: no "for future" abstractions present
- [ ] **Spec Part B match**: specific clauses B.N.M ticked
- [ ] **Logs/traces propagated (I-9)**: log lines include {level, msg, trace_id, module}
- [ ] **External boundary typed (I-10)**: zod.parse at HTTP/YAML/Telegram entry

All checked? → state DONE. Any unchecked? → state DONE_WITH_CONCERNS or BLOCKED.
```

## Rationalization Counters

**Pressure**: "Tests are green, other checks are noise."
**Correct response**: Green tests only prove what tests measure. Invariant greps catch what tests don't — SDK imports, project-name hardcoding, state mutation. Both are necessary.

**Pressure**: "I can't paste `pnpm test` output, the orchestrator doesn't need it."
**Correct response**: Evidence > assertion. "Tests pass" without output is a claim; pasted output is a fact. Reviewers read code AND evidence, not claims.

**Pressure**: "The invariant check is done centrally at session-end."
**Correct response**: Session-end is too late. A violation at task 3 of 7 means tasks 4-7 were built on a cracked foundation. Check per task.

## What "done" means

| Task status | Meaning | Allowed follow-up |
|---|---|---|
| DONE | All checklist items pass, evidence pasted | orchestrator moves to next task or reviewer |
| DONE_WITH_CONCERNS | Checklist passes except X, X is non-blocking, documented | orchestrator logs concerns, moves on |
| BLOCKED | Gate fails 3x on same issue | escalate, do NOT claim done |
| NEEDS_CONTEXT | Ambiguity can't be resolved from available specs/code | request context from orchestrator, do NOT claim done |

"Partially done" is not a status. Either the task is done, not done, or blocked.

## Integration with other skills

- **subagent-driven-development**: task-implementer MUST run this before reporting
- **systematic-debugging**: Phase 4 fix isn't complete without this checklist
- **sandwich-dev**: session-end can only run after every task passes this
