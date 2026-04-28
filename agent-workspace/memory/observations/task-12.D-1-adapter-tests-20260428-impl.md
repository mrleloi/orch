# Task 12.D-1 — subscription-mode branch tests for ClaudeCodeAdapter

## Status
DONE

## Files Changed
- packages/core/src/modules/sessions/claude-code-adapter.spec.ts: +78 LOC (lines 406-483 approx; 3 new test cases inside the `spawn` describe block)

## Tests Added
- packages/core/src/modules/sessions/claude-code-adapter.spec.ts: 3 new cases
  1. `ORCH_RUNTIME_MODE=subscription: invokes claude binary with --rc, -p, --output-format stream-json`
  2. `ORCH_RUNTIME_MODE unset (default): invokes ccs with [profile, -p, prompt, --output-format, stream-json]`
  3. `ORCH_RUNTIME_MODE=arbitrary-value: falls back to ccs (strict equality check)`

## Vitest / Jest Output Snippet
```
Test Suites: 1 passed, 1 total
Tests:       76 passed, 76 total
Snapshots:   0 total
Time:        1.787 s, estimated 2 s
Ran all test suites matching claude-code-adapter.spec.ts.
```

Previous count (stash baseline): 73 tests
New count: 76 tests
Delta: +3 tests (all new)

## Gates
- typecheck: PASS (jest run succeeded without type errors; tsc not run separately as tests already validate types via ts-jest)
- lint: not run (no new imports; existing patterns matched)
- test: PASS (76/76)
- invariants: PASS — no git commits made (I-6 absolute)

## I-6 Status
`git diff --stat` shows `claude-code-adapter.spec.ts | 78 +++++` as an unstaged working-tree change. No new commits.
`git log --oneline -3` shows last commit is `230929e v2.6: Phase 11 v2.6 carryforward burndown + SC-39 ENABLE_RETRY window` — unchanged.

## Deviations from Plan
- The plan said "use `vi.mocked(execa)` exactly like existing tests". The existing test file uses `jest.mock`/`jest.fn()` (not vitest `vi.mocked`), and the test runner is Jest (not vitest). Tests were written matching the actual existing pattern (`mockExeca.mock.calls`), which is correct.
- The vitest command in the task envelope (`npx vitest run ...`) fails with "jest is not defined" — the correct command is `npx jest "claude-code-adapter.spec.ts"` inside `packages/core/`. This was diagnosed and corrected immediately.

## Assumptions Made
- Existing test count was 73 (verified by stash+run baseline).
- `ORCH_RUNTIME_MODE` save/restore pattern uses try/finally per-test (no `beforeEach`/`afterEach` needed since each test manages its own env var).
- `profile || 'self'` in the subscription-mode args resolves to `'myprofile'` when profile is `'myprofile'` (tested accordingly).
