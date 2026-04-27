# Task 7.1.2 — Migrate api-truncation + narration-grep INV-10 Reporter

## Status
DONE

## Files Changed
- tests/hooks/api-truncation.spec.ts: lines 13 (import), 29-32 (accumulator), 121 (push site 1), 155 (push site 2), 176-186 (afterAll reporter); removed original lines 116-118 (site 1 comments+assert) and 152-153 (site 2 comment+assert)
- tests/hooks/narration-grep-refinement.spec.ts: lines 17 (import), 32-35 (accumulator), 112 (push site 1), 173-183 (afterAll reporter); removed original lines 105-106 (comment+assert)

## Tests Added
- No new test cases added (existing 104 tests preserved). Added INV-10 reporter accumulator + afterAll reporter to 2 files.

## Gates
- typecheck: PASS
- lint: PASS (0 errors; 4 pre-existing web-ui warnings unrelated to changes)
- test: PASS (104/104)
- invariants:
  - G1 LOC delta sum: PASS (30 ≤ 40; api-truncation +14, narration-grep +16)
  - G2 forbidden patterns: PASS (0 matches for useFakeTimers/advanceTimersByTime/process.platform)
  - G3 push counts: PASS (api-truncation: 2, narration-grep: 1)
  - G4 assertion removal: PASS (0 toBeLessThan(1000) remaining in both files)
  - G5 test total: PASS (104/104)
  - G5 INV-10 reporter lines: PASS (4 total: tool-call-first + mode-c-guard + api-truncation + narration-grep)
  - G5 failing count: PASS (0)
  - G6 I-6: PASS (fatal: no commits yet)
  - Mandate B staged: PASS (A  status for both files)

## Deviations from Plan
- Actual pre-edit LOC was 173/170 vs spec-stated 151/146. Same discrepancy as 7.1.1 (spec baselines were stale). Net delta 30 satisfies ≤40 combined cap.

## Concerns
None.

## Assumptions Made
1. afterAll placed INSIDE describe block (before closing }); matches 7.1.1 pattern
2. eslint-disable-next-line no-console added before console.log; matches 7.1.1 pattern and ESLint config
3. Single accumulator per file covers all assertion sites in that file
4. Push replaces each toBeLessThan(1000) assertion; orphaned INV-10 comments also removed
