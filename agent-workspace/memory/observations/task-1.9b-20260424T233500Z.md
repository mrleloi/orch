# Task 1.9b — RequestQueue

## Status
DONE

## Files Changed
- `packages/core/src/domain/errors.ts` — added `QueueCancelledError` (lines 144–170 approx)
- `packages/core/src/modules/events/event-channels.ts` — added `rqueue.*` channel constants, extended `EventChannel` union, added 5 `rqueue.*` entries to `EventPayloadMap`
- `packages/core/src/modules/sessions/request-queue.ts` — NEW, 210 lines
- `packages/core/src/modules/sessions/request-queue.spec.ts` — NEW, 370 lines
- `packages/core/src/modules/sessions/sessions.module.ts` — added `RequestQueue` as provider+export, added `EventsModule` import

## Tests Added
- `request-queue.spec.ts`: 32 test cases

## Gates
- typecheck: PASS
- lint: PASS (0 errors; 1 pre-existing warning in main.ts — unrelated)
- test: PASS (394/394 — was 362, added 32)
- invariants: PASS — `grep -rn "claude-agent-sdk|@anthropic-ai/sdk" packages/core/src/modules/sessions/` → empty

## Deviations from Plan
1. Event channel naming: used `rqueue.*` instead of `queue.*` — the plan spec says `queue.enqueued` etc., but those keys already exist in `event-channels.ts` mapped to DB-backed `QueueItem` payloads from Task 1.8. Reusing them would cause a type collision. `rqueue.*` (request-queue) avoids the conflict while remaining semantically clear.
2. `cancel()` is not `async` — returns `Promise.resolve()` explicitly. The `@typescript-eslint/require-await` lint rule rejects `async` functions with no `await`. Using `Promise.resolve()` return is the pattern used in `ClaudeCodeAdapter`.

## Concerns
None.

## Assumptions Made
1. `rqueue.*` event channels do not conflict with existing `queue.*` channels from Task 1.8 (confirmed by reading event-channels.ts).
2. `EventsModule` is `@Global()` so `EventBusService` is already injectable — the explicit import in `SessionsModule` is for documentation clarity (matches the adapter's comment pattern).
3. Test suite uses direct instantiation (`new RequestQueue(mockEventBus)`) — no NestJS testing module needed since RequestQueue has no complex DI.
4. `QueueCancelledError` placed in `packages/core/src/domain/errors.ts` alongside all other error subclasses (matches existing pattern).
5. Memory cleanup implemented via `cleanup()` helper called in `finally` block — removes Map entries after queue drains to prevent unbounded growth.

## Open Questions for 1.9c/d
- `SessionManager` (1.9d) will call `queue.cancel(sessionKey)` + `handle.abort()` in its `/cancel` flow. The queue does NOT call abort directly — this is correct per spec.
- `getActiveKeys()` will be used by `AgentWatchdog` (1.9c) and `SessionManager` (1.9d) to iterate active sessions.
- The `cancelledKeys` Set is never cleared after cancel. If 1.9d wants to reuse a sessionKey after cancel, it will need `RequestQueue` to expose a `reset(sessionKey)` method (or 1.9d simply creates a new instance per project). This is a design question for 1.9d.
