---
name: systematic-debugging
description: Use when a bug has resisted 2+ fix attempts, when root cause is unclear, or when a symptom is intermittent. Enforces 4-phase evidence-then-hypothesis flow. Not for trivial typos or already-diagnosed bugs.
tools: [Read, Bash, Grep, Edit]
archetype: discipline
model: opus
---

# Systematic Debugging

## When to invoke

- Second fix attempt has failed on the same symptom
- "Works on my machine" / intermittent failures
- Data pipeline: output doesn't reproduce
- Integration: subprocess / hook / trace-context propagation
- Any bug where you catch yourself guessing

Invoke the `systematic-debugger` subagent for 4+ attempted fixes. For 2-3 attempts, apply this skill inline in the current session.

## Red Flags — STOP

- "I'll just try one more thing" (after 3 failed attempts) → WRONG, go to Phase 4.5
- "Let me add some defensive checks" → usually masks root cause, not fixes it
- "Maybe it's a timing issue, add a sleep" → almost never correct, use condition-based waiting
- "The library is broken" → extremely rare, investigate your usage first
- "Let me refactor while I'm here" → P3 violation, fix the bug with minimum change

## The 4 Phases

### Phase 1: Evidence Gathering

Before proposing any fix, instrument every component boundary the symptom crosses. For Orch-typical bugs:

| Boundary | Instrumentation |
|---|---|
| CLI subprocess | log args, env, exit code, stdout tail, wall time |
| Hook receiver | log raw payload, parsed object, route decision |
| State transition | log `from → to` at every I-11 transition |
| Trace propagation | log span IDs at spawn + TRACEPARENT env |
| Queue lifecycle | log enqueue / dequeue / ack / requeue events |
| File watcher | log event type + file path + debounce state |

Run the failing scenario ONCE with instrumentation. Save logs. Do not fix yet.

### Phase 2: Pattern Analysis

Write ONE sentence:
> "The break is at `<boundary>` because `<specific evidence>`."

If you can't write it, return to Phase 1 with more instrumentation.

### Phase 3: Hypothesis Testing

One hypothesis per iteration. Structure:

```
Hypothesis N:
  IF I change: <one specific thing>
  THEN symptom disappears BECAUSE <mechanism>

Test:
  Apply only that change.
  Run failing scenario.
  Observe.

Result: PASSED | FAILED
  PASSED → Phase 4
  FAILED → revert change, log, next hypothesis
```

**Never bundle hypotheses.** "Let me change X and Y together" is Phase 3 failure.

### Phase 4: Implementation

Once hypothesis validates:

1. Write regression test that reproduces bug. Must FAIL without fix.
2. Apply fix (same one change from Phase 3).
3. Run test: must pass.
4. Root-cause trace: why did this enter? Tighten a guardrail (lint rule, invariant, schema) if systemic.
5. Defense-in-depth: is there a second layer that should also catch this? (e.g., both zod schema AND runtime assertion)

### Phase 4.5: Architecture Stop

**If Phase 3 recorded 3+ FAILED hypotheses:** STOP. Write `agent-workspace/memory/escalation.md` with:
- The 3 hypotheses tried and why each failed
- Architecture candidates (wrong module boundary? wrong data ownership? wrong state shape?)
- Specific architecture question for orchestrator/human

Then HALT. No fourth hypothesis. The evidence is telling you the bug is not in implementation; it's in design.

## Rationalization Counters

**Pressure**: "The bug is in production, user is waiting, skip evidence gathering."
**Correct response**: Skipped evidence gathering produces fixes that don't fix. Rework is slower than discipline. Instrument THEN fix.

**Pressure**: "I'm 90% sure it's a race condition, just add a lock."
**Correct response**: 90% confidence without evidence is a guess. Instrument the race. If the race exists, the log will show it; if it doesn't, you saved yourself a bad lock.

**Pressure**: "3 hypotheses feels arbitrary, let me try more."
**Correct response**: 3 is not arbitrary; it's a threshold past which pattern-matching fails and architecture questions begin. The fourth attempt without architecture reconsideration has failure probability >95% historically.

## Orch-specific debugging playbooks

### Bug: ccs session not resuming
- Phase 1 instrument: subprocess exit code, stderr, `ccs list` output pre/post, auth state (without reading creds)
- Common root causes: stale PID file, profile mismatch, credentials rotated upstream

### Bug: hook payload dropped
- Phase 1 instrument: HTTP receiver raw body log, dedup key calculation, idempotency table state
- Common root causes: I-8 idempotency bug, body-parser middleware order, zod schema drift

### Bug: trace span orphaned
- Phase 1 instrument: TRACEPARENT env at spawn, child process OTEL init log
- Common root causes: env var not propagated via execa, OTEL SDK not initialized before first span

### Bug: Prisma + SQLite locking
- Phase 1 instrument: WAL mode check, concurrent writer count, transaction wait time
- Common root causes: transaction not awaited, missing WAL mode, long-held read txn
