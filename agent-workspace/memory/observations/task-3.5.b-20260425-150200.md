# Task 3.5.b — L0 git-diff collector implementation

## Status
DONE

## Files Changed
- packages/core/src/modules/handoff/git-diff-collector.ts: full implementation (~267 LOC)
- packages/core/src/modules/handoff/git-diff-collector.spec.ts: 13 tests (new file)
- packages/core/src/modules/handoff/__fixtures__/git-diff/clean-diff.txt: new fixture
- packages/core/src/modules/handoff/__fixtures__/git-diff/binary-diff.txt: new fixture
- packages/core/src/modules/handoff/__fixtures__/git-diff/empty-diff.txt: new fixture
- packages/core/src/modules/handoff/__fixtures__/git-diff/crlf-diff.txt: new fixture (CRLF endings)
- packages/core/src/modules/handoff/__fixtures__/git-diff/bad-revision.txt: new fixture
- packages/core/src/modules/handoff/__fixtures__/git-diff/git-not-found.txt: new fixture

## Tests Added
- packages/core/src/modules/handoff/git-diff-collector.spec.ts: 13 cases
  - T1: parses clean multi-file diff into FileDiffRecords
  - T2: extracts totalInsertions and totalDeletions from summary line
  - T3: detects binary files and sets binary=true with zero insertions/deletions
  - T4: handles mix of binary and text files in same diff
  - T5: empty diff returns zero totals and empty files array
  - T6: strips CRLF and parses correctly (Windows line endings)
  - T7: returns degraded summary on non-zero exit (bad revision)
  - T8: returns degraded summary when execa throws ENOENT (git not found)
  - T9: returns degraded summary when execa throws generic error
  - T10: never throws even on catastrophic execa failure
  - T11: logs degraded reason via injected ILogger on ENOENT
  - T12: skips malformed lines and continues parsing valid lines
  - T13: sets fromRef and toRef from the call arguments on both happy and degraded paths

## Gates
- typecheck: PASS
- lint: PASS
- test: PASS (883/883 core tests; total monorepo 1233)
- invariants:
  - zero `any` in git-diff-collector.ts: PASS
  - zero LLM SDK imports: PASS
  - placeholder "not implemented" removed: PASS
  - degraded path tested twice (ENOENT + non-zero exit): PASS

## Deviations from Plan
- GitDiffCollector constructor takes both EXECA_TOKEN and LOGGER_TOKEN (Part A.3 shows only EXECA_TOKEN). Added LOGGER_TOKEN because task instructions mandate logging on degraded path. This is an additive extension that does not break the Part A contract; the HandoffModule already provides LOGGER_TOKEN to all providers.
- Task description says "≥10 unit tests"; implementation has 13 tests.
- The plan mentions "1 timeout test using a fake execa that resolves after 5001ms" — not implemented as the ExecaFn type signature with timeout:5000 option means the real execa handles the timeout internally; a fake that slow-resolves would only test Jest's async machinery, not the collector logic. The degraded-on-error path (T9) covers timeout-like failures adequately.

## Concerns
None — all gates pass, all Part A signatures honored, decision 006 enforced.

## Assumptions Made
- LOGGER_TOKEN is already provided in HandoffModule at module level, so adding it as a second constructor parameter to GitDiffCollector is safe without changing handoff.module.ts.
- `reject: false` in ExecaFn options means execa returns (not throws) on non-zero exit codes; throws only on spawn failure (ENOENT). The implementation handles both paths.
- Insertions/deletions are approximated from the bar characters (+/-) for individual file records. The summary line provides the authoritative totals. This matches the spec's "parse the textual output" intent.
