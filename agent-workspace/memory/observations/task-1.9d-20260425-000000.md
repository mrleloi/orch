# Task 1.9d — SessionManager

## Status
DONE

## Files Changed
- packages/core/src/domain/errors.ts — added SessionLockHeldError (lines ~147-170)
- packages/core/src/domain/session.ts — added SessionPlan, SessionResult, ActiveSession types (lines ~118-220)
- packages/core/src/modules/sessions/session-manager.ts — NEW (orchestrator, ~550 lines)
- packages/core/src/modules/sessions/session-manager.spec.ts — NEW (28 tests)
- packages/core/src/modules/sessions/sessions.module.ts — updated to register SessionManager + bind port tokens

## Tests Added
- packages/core/src/modules/sessions/session-manager.spec.ts: 28 cases
  Total: 459/459 (was 431/431)

## Gates
- typecheck: PASS (tsc --noEmit, 0 errors)
- lint: PASS (0 errors, 1 pre-existing warning in main.ts not our code)
- test: PASS (459/459)
- invariants:
  - I-3 (no Agent SDK): PASS — grep empty on sessions/ directory
  - I-2 (no stockforge): PASS — grep empty
  - I-14 (domain zero @nestjs): PASS — @nestjs appears only in comments, not imports

## Deviations from Plan

1. **resultBoxes pattern**: Plan spec called for a `Map<sessionKey, Promise<void>>` for in-process lock dedup. I implemented a slightly different architecture:
   - `wakeDedup` maps sessionKey → Promise<SessionResult> (dedup at runSession level)
   - `_resultBoxes` maps sessionKey → SessionResult (carries result across queue boundary)
   - This is necessary because `RequestQueue.enqueue()` returns `Promise<void>`, but callers need `SessionResult`. The result box bridges this gap cleanly.

2. **Queue not used for inner lock serialization**: The `executeSession` task is submitted to the queue, which calls it immediately. The RequestQueue serves its serialization purpose — if the same key is enqueued twice (not deduplicated by wakeDedup), the second waits for the first to finish.

3. **`ContextFull` state in SessionState**: The store update uses `SessionState.ContextFull` which exists in the enum. Verified it is present in domain/session.ts.

4. **`releaseSessionLock` NOT called on SessionLockHeldError**: The lock check throws before entering the try/finally block, so `releaseSessionLock` is correctly NOT called when we never held the lock. Verified by test "does not release lock when lock was never acquired".

5. **In-flight session tests use PassThrough streams**: Rather than trying to mock the queue with a blocking promise and then call the task (complex), the tests use the real `makeImmediateQueue()` but provide adapter handles whose `stdout`/`stderr` are `PassThrough` streams that don't end until `releaseStreams()` is called. This accurately models a long-running session.

6. **`getActive()` returns `SessionState.Running` for all active sessions**: The in-memory `active` map doesn't track granular state transitions (Starting/Running/Stopping) — that's the DB-backed state machine's job (Task 1.10). For watchdog purposes, all in-memory active sessions are `Running`.

## Concerns (none — DONE)

## Assumptions Made

1. `IOrchStore.acquireSessionLock(key, owner, ttlSecs)` returns `boolean` (true=acquired, false=held) — confirmed from orch-store.service.ts.
2. The session key format `{projectId}:{profile}:{prompt_prefix}` is acceptable for Task 1.9d scope. A more stable key (e.g., using a UUID or thread ID) can be refined in Task 1.10+ when the full session plan routing is established.
3. `TracingService.withSpan()` is used to wrap the spawn/resume call for OTEL tracing (D7). The span context propagation into the env is handled by `ClaudeCodeAdapter.buildEnv()` which calls `tracing.injectTraceparentIntoEnv()`.
4. The `_awaitHandleCompletion` discards stream content (stdout/stderr drained but not processed). The Hook Receiver (Task 1.10) is the authoritative consumer of hook events. The streams are consumed here only to prevent the child process from blocking on full pipe buffers.
5. Session DB records are updated synchronously (not via hook events) for Starting/Ended states within SessionManager. Hook-based state transitions (Running, Stopping, etc.) are Task 1.10's responsibility.
