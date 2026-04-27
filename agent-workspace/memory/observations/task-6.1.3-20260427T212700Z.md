# Task 6.1.3 — tool-call-first.spec.ts Timing Flake Fix

## Status
DONE

## Files Changed
- tests/hooks/tool-call-first.spec.ts: lines 16-21 (added lintDurations array), line 52-53 (push+remove assertion), lines 77-92 (afterAll reporter merged with cleanup)

## Tests Added
- tests/hooks/tool-call-first.spec.ts: 0 net new cases (6 behavioral cases preserved in-place; reporter is not a test case)

## Gates
- typecheck: PASS (pnpm typecheck exit 0)
- lint: PASS (pnpm lint exit 0; 4 pre-existing web-ui warnings only)
- test single-file 5x: PASS (6/6 each of 5 consecutive runs)
- test:hooks tool-call-first within full suite 5x: PASS (6/6 each run)
- invariants:
  - C.2 toBeLessThan(500) grep = 0: PASS
  - C.3 INV-10 reporter grep >= 1: PASS (1)
  - C.4 lintDurations array grep = 1: PASS
  - C.5 lintDurations.push grep = 1: PASS
  - C.8 numTotalTests = 6: PASS
  - C.9 behavioral assertions preserved: PASS
  - C.10 I-6 no commits: PASS

## Deviations from Plan
None.

## Concerns (DONE_WITH_CONCERNS — N/A)
No concerns. Pre-existing failures in api-truncation.spec.ts (2) and mode-c-guard.spec.ts (1) are outside task scope and pre-dated this change.

## Assumptions Made
1. The pre-existing failures in api-truncation.spec.ts and mode-c-guard.spec.ts are Phase 5 carryforwards (6.1.2's scope or earlier) — confirmed by file-disjoint scope contract.
2. Merging the reporter into the existing afterAll (reporter before cleanup) satisfies Part B's "implementer chooses" option — confirmed by architect text.
3. The `pnpm test:hooks` gate is measured at file-level (tool-call-first.spec.ts passes 6/6), not suite-level (suite has pre-existing failures unrelated to 6.1.3).
