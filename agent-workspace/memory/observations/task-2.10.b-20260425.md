# Task 2.10.b — SIGKILL-timeout branch integration test

## Status
DONE_WITH_CONCERNS

## Files Changed
- packages/core/src/modules/sessions/claude-code-adapter.integration.spec.ts: lines 1-197

## Tests Added
- packages/core/src/modules/sessions/claude-code-adapter.integration.spec.ts: 1 test case
  (skipped on win32 via `isWin32 ? it.skip : it`)

## Gates
- typecheck: PASS
- lint: PASS
- test:integration: PRE-EXISTING FAILURE in ccs suite (ORCH_SKIP_INTEGRATION not set); new SIGKILL test: SKIPPED on win32 (expected)
- test (default): PASS (754/754)
- invariants: N/A (no production code changes)

## Deviations from Plan
1. `TerminationReason` union does not include `'idle_timeout'` (plan spec used that value).
   Used `'timeout'` instead — it is a valid member of the union.
2. `vi.*` replaced with `jest.*` throughout (test runner is Jest 30, not Vitest).
3. Timer strategy: Preferred B (fake timers) used since no injectable timeout override exists.
   Spawned child BEFORE activating fake timers to avoid interfering with cpSpawn event loop.
4. `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync(5001)` pattern used.
   After advancing, switched back to real timers before `setTimeout(r, 50)` OS-reap wait.

## Concerns (DONE_WITH_CONCERNS)
- The test is gated with `it.skip` on win32 (this machine IS win32). The test executes as
  "skipped" in CI here. It WILL run on Linux/macOS where SIGTERM ignore actually works.
- The pre-existing ccs integration test fails in this environment because `ccs` binary is
  not on PATH and ORCH_SKIP_INTEGRATION is not set. This is pre-existing, not caused by 2.10.b.

## Assumptions Made
- `TerminationReason` `'idle_timeout'` in plan spec was a typo; `'timeout'` is the correct value.
- The adapter's `terminate()` uses `TERMINATE_TIMEOUT_MS = DEFAULT_TERMINATE_TIMEOUT_MS = 5_000ms`.
- `jest.advanceTimersByTimeAsync(5001)` in Jest 30 correctly fires both the setInterval polls
  (at 200, 400, ...) and the setTimeout at 5000ms, with microtask flushing in between.
- Spy on `adapter.logger.warn` (NestJS Logger instance, private field) via bracket notation
  is sufficient to capture the structured log call — NestJS Logger.warn accepts an object.
