# Spec Compliance Review - Task 12.1

Reviewer: spec-compliance-reviewer (sonnet, 2026-04-28)
Verdict: PASS_WITH_CONCERNS
Files: scripts/dogfood/run-self-task.ts (575 LOC), tests/dogfood/run-self-task.spec.ts (740 LOC)
Spec: 12.1-cf-dogfood-2-wire-step9-architect.md Part B contract

## Verdict

PASS_WITH_CONCERNS - 1 minor concern (spec self-inconsistency), 0 blocking issues

## Contract Match Matrix

B.1 stub replacement | grep exit 1 in run-self-task.ts | PASS
B.1 flag-OFF branch stub trace + return | run-self-task.ts:452-467 | PASS
B.1 flag-ON branch calls dispatchViaRuntime | run-self-task.ts:470-477 | PASS
B.2 runSelfTask signature optional runtime? IAgentRuntime | run-self-task.ts:293-296 | PASS
B.2 defaultRuntime() lazy factory | run-self-task.ts:211-219 | PASS
B.2 dispatchViaRuntime() signature matches spec | run-self-task.ts:225-232 | PASS
B.2 runtime.spawn() called | run-self-task.ts:238-243 | PASS
B.2 stream drain stdout+stderr | run-self-task.ts:263-268 | PASS
B.2 awaitAndClassify used | run-self-task.ts:286 | PASS
B.3 DOGFOOD_EXECUTE_ENV = ORCH_DOGFOOD_EXECUTE | run-self-task.ts:41 | PASS
B.3 strict === true comparison | run-self-task.ts:450 | PASS
B.3 no profile.yaml or disk flag | 0 grep matches | PASS
B.4 spawn failure -> SPAWN_FAILED exit 4 | run-self-task.ts:243-258,500-509 | PASS
B.4 awaitAndClassify failure -> exit 4 | run-self-task.ts:286,500-509 | PASS
B.4 SPAWN_FAILED=4 reused no new codes | run-self-task.ts:68 | PASS
B.5 flag-OFF spanName dogfood.subprocess_spawn flag_off:true | run-self-task.ts:455,462 | PASS
B.5 flag-ON spanName dogfood.subprocess_spawn flag_off:false | run-self-task.ts:272,281 | PASS
B.5 spawn error trace status:error spawn_error field | run-self-task.ts:245-257 | PASS
B.6 T12: no spawn flag_off:true no dispatch_deferred_to | spec.ts:651-663 | PASS
B.6 T13: spawn called pid session_id flag_off:false | spec.ts:665-683 | PASS
B.6 T14: exit 4 status:error error msg | spec.ts:685-698 | PASS
B.6 T15: exit 4 rate limit error msg | spec.ts:700-714 | PASS
I-6 zero commits | git log 4 pre-existing only | PASS
C.5 no dispatch_deferred_to in production | 0 matches | PASS
C.8 LOC <=580 | wc-l=575 | PASS
C.10 reporter lines | run-self-task.ts:261,287 | PASS
F1 no child_process import | 0 matches | PASS
I-1 no LLM/API calls | 0 matches | PASS
I-3 no hardcoded project names | 0 matches | PASS

## Missing Requirements

None. All Part B clauses implemented. T12-T15 all present with correct assertions.

## Over-Building

Zero unrequested additions. All additions are explicitly spec-required.

## Concerns

### Minor 1: Spec Internal Inconsistency on Flag-OFF Span Name

Section 1.2 states the span should be named dogfood.subprocess_spawn_skipped.
Section 3.3 B.3 and Section 3.6 B.5 both show dogfood.subprocess_spawn.
T12 spec template only asserts flag_off:true - no span name check.

Implementation uses dogfood.subprocess_spawn (run-self-task.ts:455) per binding Part B.
String dogfood.subprocess_spawn_skipped: appears once in spec (Section 1.2), zero in code.
Classification: Minor spec authoring artifact. No code fix required.

## Acceptance Gate Summary

C.5: PASS - grep exit 1, 0 matches
C.6: PASS - 7 IAgentRuntime matches
C.8: PASS - 575 LOC (<=580)
C.9: PASS - 4 pre-existing commits only
C.10: PASS - lines 261,287

C.1,C.2,C.3,C.4: implementer self-reports PASS; code-quality-reviewer should run C.3 live.

## Race-Aftermath Sanity

Both files staged (M  prefix). 3 stashes present (race debris + pre-existing). Not violations.
Route stash cleanup to user via orchestrator.

## Required Fixes (blocking)

None.

## Next Action

PASS_WITH_CONCERNS -> dispatch code-quality-reviewer (task 12.1)
---

## Detailed Per-Check Results

### Check 1: Section 1.2 IN-SCOPE Deliverables

1a. runSelfTask signature extended with optional runtime injection
  PASS. run-self-task.ts:293-296: export async function runSelfTask(envelopePath: string, runtime?: IAgentRuntime): Promise<number>

1b. ORCH_DOGFOOD_EXECUTE env constant name
  PASS. run-self-task.ts:41: const DOGFOOD_EXECUTE_ENV = ORCH_DOGFOOD_EXECUTE
  read site: run-self-task.ts:450: process.env[DOGFOOD_EXECUTE_ENV] === true

1c. Stream drain (stdout/stderr line-pump)
  PASS. run-self-task.ts:263-268: handle.stdout.on(data,...) + handle.stderr.on(data,...) both wired
  Data consumed (logged as first 200 chars), not buffered.

1d. awaitAndClassify() used for child exit translation
  PASS. run-self-task.ts:286: await runtime.awaitAndClassify(handle)

1e. Trace span names - MINOR CONCERN
  Section 1.2 requires dogfood.subprocess_spawn_skipped for flag-OFF.
  Section 3.3 B.3 and Section 3.6 B.5 both specify dogfood.subprocess_spawn with flag_off:true.
  Implementation follows the binding Part B sections; Section 1.2 is a spec authoring artifact.
  run-self-task.ts:455: spanName: dogfood.subprocess_spawn (flag-OFF)
  run-self-task.ts:272: spanName: dogfood.subprocess_spawn (flag-ON)
  The _skipped variant name appears zero times in implementation.

1f. EXIT_CODES.SPAWN_FAILED = 4 reused
  PASS. run-self-task.ts:68: SPAWN_FAILED: 4. No new exit codes added.

### Check 2: Four New Tests T12-T15

T12 (run-self-task.spec.ts:651-663):
  - ORCH_DOGFOOD_EXECUTE deleted in beforeEach:632
  - mockRuntime.spawn NOT called (assertion line 658)
  - trace contains flag_off:true (line 660)
  - trace not contain dispatch_deferred_to (line 661)
  - exit is EXIT_CODES.OK (line 657)
  PASS

T13 (run-self-task.spec.ts:665-683):
  - ORCH_DOGFOOD_EXECUTE set to true (line 666)
  - spawn called once (line 675)
  - awaitAndClassify called with mockHandle (line 676)
  - trace contains pid:99999 (line 678)
  - trace contains session_id:mock-session-uuid (line 679)
  - trace contains flag_off:false (line 680)
  - trace not contain dispatch_deferred_to (line 681)
  PASS

T14 (run-self-task.spec.ts:685-698):
  - RuntimeSpawnError imported from packages/core/src/domain/errors.js (line 687)
  - spawn rejects with RuntimeSpawnError (line 689)
  - exit is EXIT_CODES.SPAWN_FAILED = 4 (line 693)
  - trace contains error message ccs binary not found on PATH (line 695)
  - trace matches status:error (line 696)
  PASS

T15 (run-self-task.spec.ts:700-714):
  - ORCH_DOGFOOD_EXECUTE set to true (line 701)
  - spawn succeeds with pid:11111 (line 704)
  - awaitAndClassify throws RateLimitError (line 705)
  - exit is EXIT_CODES.SPAWN_FAILED = 4 (line 709)
  - spawn called once (line 710)
  - trace contains rate limit hit (line 712)
  - error ends up in dogfood.dispatch_substage outer-catch record at run-self-task.ts:507
  PASS

### Check 3: Section 2 Option D Selected

  PASS. Env-var only flag (run-self-task.ts:41,450). No profile.yaml entry.
  LOC delta: 575 - 490 (baseline) = 85, within the ~90 LOC target.
  Gate C.8 passes: 575 <= 580.

### Check 4: No dispatch_deferred_to in Production

  PASS. grep exit 1, 0 matches in scripts/dogfood/run-self-task.ts.
  Occurrences in tests are negative assertions and comments (non-violations):
  - spec.ts:19: coverage comment listing T13 name
  - spec.ts:661: expect(trace).not.toContain(dispatch_deferred_to)
  - spec.ts:681: expect(trace).not.toContain(dispatch_deferred_to)

### Check 5: Acceptance Gate G3 (Decision 040 Section 6)

  C.5 stub eliminated: PASS - 0 matches
  C.6 real-spawn wired: PASS - 7 IAgentRuntime matches
  C.8 LOC delta: PASS - 575 <= 580
  C.9 I-6 commits=0: PASS - 4 pre-existing commits

### Check 6: Charter-Coherence Spot-Check

  I-1 (no LLM in daemon): PASS. No anthropic/openai/fetch/axios calls found.
  I-3 (project-agnostic): PASS. No stockforge or project-specific strings.
  I-6 (no commits): PASS. git log shows 230929e, 2a395d5, 92f50ec, 326ab0c (all pre-12.1).
  P3 (surgical): PASS. Only scripts/dogfood/run-self-task.ts and tests/dogfood/run-self-task.spec.ts staged.