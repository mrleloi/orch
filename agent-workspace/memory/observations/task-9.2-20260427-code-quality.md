# Code Quality Review — Task 9.2 (test-coverage CF batch)
# Authored: 2026-04-27
# Reviewer: code-quality-reviewer (sonnet/medium, ORCH_SPAWNED)

## Verdict: FAIL

## Acceptance Gates

| Gate | Actual | Pass? |
|---|---|---|
| ≥6 new test cases (M1+M2) | 12 cases in config-style-lint.spec.ts (all new — file is `A`) | PASS |
| H7 skipIf(win32) wired in dispatch-recorder.spec.ts | 0 — H7 test does not exist | FAIL |
| vitest exit 0 | exit 0, 20 tests pass | PASS |

## MAJ-1 Blocking Failure

`tests/hooks/dispatch-recorder.spec.ts` (git status: M) has **no H7 test at all**.
No test named H7, no `skipIf`, no `process.platform === 'win32'` anywhere in the file.
The file shows 8 tests (H1-H6, T2, T4) — H7 was never added.
Contract: "Wire H7 skipIf(process.platform === 'win32') in dispatch-recorder.spec.ts."
Result: MAJ-1 undelivered.

## CF-35 Bug Verification — checkRequiredOrder off-by-one

**Confirmed. Bug is real.**

Location: `scripts/audit/config-style-lint.ts:971`

```typescript
let lastFoundIdx = -1;
for (const req of orderedRequired) {
  const foundIdx = sections.findIndex((s, i) => i > lastFoundIdx - 1 && match(s.heading, req));
  //  i > lastFoundIdx - 1  means i > (lastFoundIdx - 1)
  //  When lastFoundIdx = 2, this allows i=2 (re-scanning the same position).
  //  Correct: i > lastFoundIdx  (strictly after last found index)
  if (foundIdx === -1) continue;
  if (foundIdx < lastFoundIdx) {  // unreachable when findIndex scans from lastFoundIdx
```

- `checkAgentOrder` (line 981) calls `checkRequiredOrder` — **affected**
- `checkReferenceOrder` (line 1000) calls `checkRequiredOrder` — **affected**
- `checkHookProfileOrder` (line 1019) calls `checkRequiredOrder` — **affected**
- `checkDisciplineOrder` (line 988) has its own direct `findIndex` comparison — **NOT affected**
- `checkCommandOrder` (line 1006) has its own direct index comparison — **NOT affected**

## Do the new tests expose the bug?

**LR-05 agent PASS test (line 171):** Provides sections in correct order. The bug path is NOT exercised — correct ordering passes either way. Documents current behavior correctly.

**LR-05 discipline PASS test (line 188) and FAIL test (line 205):** These use `checkDisciplineOrder` (separate clean implementation). They correctly exercise the violation path AND pass today AND will pass after CF-35 fix.

**LR-05 command FAIL test (line 224):** Uses `checkCommandOrder` (also correct separate implementation). Passes today AND after CF-35.

**Conclusion:** None of the 4 LR-05 tests hit the buggy `checkRequiredOrder` path for agent/reference/hook-profile out-of-order detection. Tests that WOULD expose CF-35: an `agent` fixture with sections in wrong canonical order (e.g., Output before Process) — that test would pass today (bug hides violation) but fail after CF-35 fix. Such a test is absent. Existing tests are safe to keep and will not flip after CF-35 fix.

## Invariant Grep

| Invariant | Check Result |
|---|---|
| I-1 no SDK imports in core | PASS — test files only; no core changes |
| I-2 no project-name hardcoding | PASS |
| I-3 no claude-agent-sdk in non-test | PASS |
| I-5 no .ccs/.claude path access | PASS |
| I-14 no module-level let/var | PASS — all consts |

## Test Quality (M1 + M2 — config-style-lint.spec.ts)

- 12 tests: LR-23 ×4, LR-28 ×4, LR-05 ×4
- Fixtures: independent per test via `makeFile()` builder — GOOD
- Assertions: check ruleId, severity, message content — specific, not bare toBeTruthy
- LR-23 "subdomain" FAIL test (line 79): asserts `message.toContain('docs.npmjs.com')` — GOOD
- LR-28 FAIL test (line 116): asserts `message.toContain('machine-specific absolute path')` — GOOD
- No real FS I/O, no real timers, no real network — hermetic — GOOD
- Inline comment at line 159-165 documents the CF-35 bug clearly — GOOD

## Nitpicks

- LR-05 PASS agent test (line 171) only documents correct-order behavior. It will not flip after CF-35 but it also does not exercise the buggy path. A companion FAIL test for agent ordering would provide regression coverage once CF-35 is fixed — out of 9.2 scope.
- `makeFile` on line 18 uses `Partial<ParsedFile> & {path, type}` intersection — clean and concise.

---

status: FAIL
substage: 9.2
blocking_count: 1
concern_count: 1
