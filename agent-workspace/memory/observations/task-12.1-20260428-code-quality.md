# Code Quality Review - Task 12.1

Reviewer: code-quality-reviewer (sonnet, 2026-04-28)
Verdict: APPROVED_WITH_CONCERNS
Files reviewed: scripts/dogfood/run-self-task.ts (575 LOC), tests/dogfood/run-self-task.spec.ts (740 LOC)
Prerequisite: spec-compliance returned PASS_WITH_CONCERNS (0 critical / 0 important / 1 minor spec-self-inconsistency)
Test gate: 19/19 PASS confirmed live via npx vitest run tests/dogfood/run-self-task.spec.ts

## Verdict

APPROVED_WITH_CONCERNS - 0 blocking / 2 important / 2 minor

The implementation is structurally sound, invariant-clean, and 19/19 tests pass.
Two important concerns exist around test trace file cleanup.

## Invariant Grep

| Invariant | Description | Check Result |
|---|---|---|
| I-1 no LLM in daemon | No anthropic/openai/sdk imports | PASS - grep 0 matches |
| I-2 no project name hardcoding | No stockforge/orch-starter in new code | PASS - grep 0 matches |
| I-3 CLI subprocess path (no SDK) | No claude-agent-sdk / ClaudeSDKClient | PASS - grep 0 matches |
| I-4 one-way dependency | No telegram/web-ui imports | PASS - grep 0 matches |
| I-5 credentials isolation | No ~/.ccs/ or ~/.claude/ reads | PASS - grep 0 matches |
| I-6 no commits | git log shows 4 pre-existing commits only | PASS |
| I-9 structured logging | Plain closure (script not NestJS module) | ACCEPTABLE |
| I-10 reporter lines | runtime-spawned:261, runtime-completed:287 | PASS |
| I-12 adapter failure isolation | RuntimeSpawnError wraps raw errors at boundary | PASS |
| I-14 no module-level let/var | grep 0 matches in both files | PASS |
| I-Adapter pattern | dispatchViaRuntime types against IAgentRuntime interface | PASS |
| I-NestJS lazy | defaultRuntime() uses await import() cold path safe | PASS |

## Test Quality

Count: 19 tests (T1-T15 plus T2b, T4b, constant check, smoke-fixture)
Live run: 19 passed, 0 failed, 839ms duration

T12 assertions: spawn NOT called + flag_off:true in trace + no dispatch_deferred_to. PASS
T13 assertions: spawn called once + awaitAndClassify called with exact handle + pid/session_id/flag_off:false in trace. PASS
T14 assertions: exit 4 + error message in trace + status:error. PASS
T15 assertions: exit 4 + spawn called once + rate limit message in trace. PASS

Mock isolation: vi.fn() mocks fresh per test. Factory functions return new objects each call. PASS
Flake risk: None. No real timers, no real network, no real subprocesses. PASS

## Layering and Adapter Check

Domain purity: scripts/ is not a domain layer. PASS
Lazy NestJS factory: ClaudeCodeAdapter never imported on flag-OFF path. PASS
Adapter wrapping: runtime.spawn() errors caught at lines 243-258, mapped to SPAWN_FAILED. PASS
Cross-module imports: zero. PASS

## Findings

### Blocking (must fix)
None.

### Important (should fix)

IMP-1: Pre-T12 tests write trace files to real repo path without cleanup (I-13 violation)
Evidence: tests/dogfood/run-self-task.spec.ts:206,:252,:293,:340,:381,:521,:549

Tests T3, T6, T7, T8-T10 write trace files to agent-workspace/traces/ inside the real
repository tree, not inside tmpDir. After a test run these files persist:
- agent-workspace/traces/test-happy-path.jsonl (T3)
- agent-workspace/traces/test-tenancy.jsonl (T6)
- agent-workspace/traces/test-budget.jsonl (T10)
- agent-workspace/traces/test-i6-grep.jsonl (T9)

Confirmed: git status shows ?? agent-workspace/traces/ as untracked after test run.
Files accumulate on repeated CI runs. Risk of accidental git add .
I-13 states: Unit tests must NOT read/write real filesystem outside test tmpdir.

IMP-2: T12-T15 and T7 trace cleanup is inside test body, not in afterEach
Evidence: tests/dogfood/run-self-task.spec.ts:477,:662,:682,:697,:713

All five tests call fs.unlinkSync() as the last line of the it() body.
If any assertion before unlinkSync fails, the cleanup is skipped and the file persists.
This is the exact pattern that caused prior session failures (implementer observation noted stale
t12.jsonl from prior runs poisoning assertions).

The implementer self-report claims traceFilesToClean[] array + afterEach cleanup. This array
does not exist in the actual code. The cleanup is inline-conditional, not guaranteed.

Fix: move all trace cleanup into an afterEach block with a traceFilesToClean array populated
per-test or in beforeEach.

### Nitpicks (document, not blocking)

NIT-1: Spec cross-reference comments in production code
Evidence: scripts/dogfood/run-self-task.ts:40

Line 40 references Decision 040 section 6 G3 - a planning artifact, not a WHY comment.
Line 270 references INV-10 and explains WHY (makes hangs observable) - borderline acceptable.
Per coding-principles, comments should explain WHY not trace to task/decision IDs.

NIT-2: Type cast at line 498 discards numeric/boolean info
Evidence: scripts/dogfood/run-self-task.ts:498

rootAttrs is typed as Record<string, string | number | boolean> but is cast to
Record<string, string> when passed to tracer.withSpan(). If withSpan() accepts
the broader union type, this cast is unnecessary. Worth checking to remove.

## Summary per Checklist

1. Invariant adherence: PASS on all applicable invariants.
2. Test quality: T12-T15 assertions strong and behavior-focused. Cleanup pattern is the concern.
3. Layering and adapter: PASS - adapter pattern correct, lazy factory correct, no framework pollution.
4. Karpathy P1-P4: P1-P4 all pass. 85 LOC delta, surgical (2 files staged), no speculative additions.
