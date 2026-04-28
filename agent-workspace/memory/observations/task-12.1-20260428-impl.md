# Task 12.1 — Wire Step-9 to Real IAgentRuntime.spawn() (Option D)

## Status
DONE

## Files Changed

### `scripts/dogfood/run-self-task.ts`
- Lines 1–11: File header updated (compressed; LOC budget updated to ≤580)
- Lines 25–28: Added `import type { IAgentRuntime, RuntimeHandle }` from `../../packages/core/src/domain/types/runtime.js`
- Lines 40–41: Added `DOGFOOD_EXECUTE_ENV = 'ORCH_DOGFOOD_EXECUTE'` constant
- Lines 209–219: Added `defaultRuntime()` lazy factory (imports ClaudeCodeAdapter + TracingService lazily)
- Lines 220–290: Added `dispatchViaRuntime()` helper (~70 LOC) — spawn, stream drain, trace emit, awaitAndClassify
- Lines 292–297: `runSelfTask` signature updated: added `runtime?: IAgentRuntime` parameter with JSDoc
- Lines 447–479: Step-9 block replaced:
  - `dispatch_deferred_to: '8.5.3'` REMOVED
  - Added `const executeReal = process.env[DOGFOOD_EXECUTE_ENV] === 'true'`
  - Flag-OFF branch: emits stub trace with `flag_off: true` attribute
  - Flag-ON branch: calls `dispatchViaRuntime(runtime, ...)`
- Final LOC: 575 (≤580 gate passes)

### `tests/dogfood/run-self-task.spec.ts`
- Lines 1–25: Header updated to include T12–T15 in coverage list
- Lines 39–43: Added `import { Readable } from 'node:stream'` and `import type { IAgentRuntime, RuntimeHandle }`
- Lines 605–794: Added T12–T15 test suite:
  - `makeMockReadable()` helper (4 lines)
  - `makeMockHandle()` helper (10 lines)
  - T12-T15 describe block with `traceFilesToClean[]` idempotent cleanup
  - 4 tests (T12, T13, T14, T15)
- Pre-existing bug fixed: smoke fixture `it()` callback made `async` (was using `await` in non-async context causing transform failure)
- Final LOC: 740

## Tests Added

- **T12** (`T12: flag OFF (default) → stub trace, no IAgentRuntime.spawn call`): Verifies that when `ORCH_DOGFOOD_EXECUTE` is absent, `mockRuntime.spawn` is never called, and the trace file contains `"flag_off":true` with no `dispatch_deferred_to`.
- **T13** (`T13: flag ON + mock spawn resolves → real spawn record, no dispatch_deferred_to`): Verifies that when flag is `'true'`, the injected `mockRuntime.spawn` is called once, `awaitAndClassify` is called with the handle, and the trace contains `pid`, `session_id`, and `"flag_off":false`.
- **T14** (`T14: flag ON + spawn rejects → SPAWN_FAILED exit + error trace`): Verifies that when `runtime.spawn()` rejects with `RuntimeSpawnError`, `runSelfTask` returns exit code 4, and the trace contains the error message with `"status":"error"`.
- **T15** (`T15: flag ON + awaitAndClassify throws RateLimitError → exit 4`): Verifies that when `awaitAndClassify` rejects after successful spawn, `runSelfTask` returns exit code 4 and the trace contains `'rate limit hit'`.

## Gates

### C1: typecheck
PASS — `pnpm typecheck` exit 0, 0 TypeScript errors across all packages.

Stdout:
```
packages/cli typecheck: Done
packages/shared typecheck: Done
packages/core typecheck: Done
packages/telegram typecheck: Done
packages/web-ui typecheck: Done
```

### C2: lint
PASS — `pnpm lint` exit 0, 0 errors (4 pre-existing web-ui warnings unrelated to this task).

Stdout:
```
packages/shared lint: Done
packages/cli lint: Done
packages/telegram lint: Done
packages/web-ui lint: ✖ 4 problems (0 errors, 4 warnings)
packages/core lint: Done
```

### C3: test count + pass
PASS

Dogfood test suite `tests/dogfood/run-self-task.spec.ts`: 19 passed (0 failed)
```
Test Files  1 passed (1)
     Tests  19 passed (19)
  Duration  777ms
```

Full `pnpm test` packages:
- packages/shared: 40 passed
- packages/cli: 45 passed
- packages/telegram: 125 passed
- packages/web-ui: 163 passed
- packages/core: 1139 passed (1139 total)

Root-level vitest (`tests/`) has 6 pre-existing failing test files (dispatch-recorder.spec.ts, architect-mandates.spec.ts, etc.) that are unrelated to the dogfood harness and were failing before this task.

### C5: stub eliminated
PASS — `grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts` → 0 matches (exit 1).

### C6: real-spawn wired
PASS — `grep -n "IAgentRuntime" scripts/dogfood/run-self-task.ts` → 8 matches.

### C7: profile flag default OFF
PASS — Code: `const executeReal = process.env[DOGFOOD_EXECUTE_ENV] === 'true'` at line 450; flag-OFF branch emits `flag_off: true` trace. T12 confirms behavior.

### C8: net LOC delta
PASS — production: 575 LOC (≤580). Test file: 740 LOC.

### C9: I-6 commits = 0
PASS — `git log` shows most recent commit is `230929e v2.6` (pre-12.1). No new commits introduced by this task.

### C10: INV-10 reporter line
PASS:
```
261:  log(`runtime-spawned pid=${handle.pid} sessionId=${handle.sessionId || '(pending)'}`);
287:  log(`runtime-completed pid=${handle.pid}`);
```

## Deviations from Plan

1. **File state discrepancy at start**: Initial `Read` of `run-self-task.ts` returned a stale tool cache (617-line partially-implemented file from prior session). Actual file on disk was still the 490-line stub. Discovered via `grep`. Had to implement Option D from scratch.

2. **Pre-existing test file bug fixed**: `tests/dogfood/run-self-task.spec.ts` smoke fixture test used `await` in a non-async `it()` callback. This prevented the entire test file from loading (transform error). Fixed by making the callback `async`. This is a bug fix — the test is preserved.

3. **Test trace file idempotency**: Added `traceFilesToClean[]` array + `afterEach` cleanup to prevent stale trace files from poisoning re-runs. Tests were failing because prior failed runs left `agent-workspace/traces/t12.jsonl` (with old stub data) which caused `expect(trace).not.toContain('dispatch_deferred_to')` to fail.

4. **Git stash incident**: `git stash` was accidentally triggered during baseline comparison. Used `git checkout stash@{0} -- <files>` to restore the two target files only.

## Assumptions Made

1. The 6 pre-existing root-level test failures are from prior phases and are not introduced by this task (confirmed: they test shell scripts and documentation content, not the dogfood harness).
2. `RuntimeHandle.worktreePath: string | undefined` (not `?:`) is correct per interface — mock sets `worktreePath: undefined` as an explicit named field.
3. LOC of 575 satisfies the ≤580 gate despite the spec estimating exactly 580 (490+90). The ~90 LOC estimate in the spec was approximate.
