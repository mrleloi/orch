# Session 9 — 2026-04-25

## Goal
Task 2.1: Live Event Bridge — SSE Endpoint in Core. Add `GET /api/v1/events/stream` with BearerAuthGuard, per-subscriber bounded queue (200 events), heartbeat, disconnect cleanup, and OTEL span lifecycle. Fix carryover: hook.received POST-tx emission.

## Session Type
FOCUSED_IMPL

## Approach
Implemented `SseSubscription` (queue + EventBus bridge + heartbeat), `SseController` (NestJS controller with @UseGuards), `BearerAuthGuard` (guard wrapping existing timingSafeCompare logic), and `SseModule`. Added `@orch/shared` workspace dependency to core with a Jest shim for CJS compatibility. Fixed hooks.service.ts to emit hook.received POST-transaction.

## Accomplished
- Subtask A: `sse-subscription.ts` — bounded queue (MAX_BUFFER=200), EventBus channel-to-SSE-type mapping, heartbeat, disconnect via detach(), OTEL trace_id extraction
- Subtask B: `sse-controller.ts` — @Controller('api/v1/events'), @UseGuards(BearerAuthGuard), @Get('stream'), manual OTEL span lifecycle, types query filter
- Subtask C: `bearer-auth.guard.ts` — NestJS CanActivate guard (I-12 compliant, timing-safe)
- Subtask D: `sse.module.ts` — SseModule registered in AppModule
- Subtask E: `app.module.ts` — SseModule added to imports
- Subtask F: `hooks.service.ts` — moved hook.received emit to after $transaction (carryover fix)
- Subtask G: `package.json` — added @orch/shared workspace dep, fastify dev dep, Jest moduleNameMapper shim
- Subtask H: `__orch_shared_shim__.ts` — Jest CJS shim for @orch/shared (ESM package not directly consumable by ts-jest in CJS mode)
- Tests: 17 new tests in `sse-subscription.spec.ts` (14 per-plan + 3 constant validation)

## Gates Status
- Typecheck: PASS (pnpm -r run typecheck — 0 errors)
- Lint: PASS (pnpm -r run lint — 0 errors)
- Tests: PASS (702/702 core, 22/22 cli, 28/28 shared, 3/3 telegram, 3/3 web)
- Invariants: all green (I-1 CLEAN, I-2 CLEAN, I-4 CLEAN — only comments mention @orch/core, I-14 CLEAN)

## Files Modified
- `packages/core/src/modules/events/sse-controller.ts` (NEW)
- `packages/core/src/modules/events/sse-subscription.ts` (NEW)
- `packages/core/src/modules/events/sse-subscription.spec.ts` (NEW)
- `packages/core/src/modules/events/sse.module.ts` (NEW)
- `packages/core/src/modules/api/bearer-auth.guard.ts` (NEW)
- `packages/core/src/__orch_shared_shim__.ts` (NEW — Jest CJS shim)
- `packages/core/src/app.module.ts` (added SseModule import)
- `packages/core/src/modules/hooks/hooks.service.ts` (moved hook.received to post-tx)
- `packages/core/package.json` (added @orch/shared, fastify devDep, jest mapper, moduleNameMapper)
- `pnpm-lock.yaml` (lockfile update)

## Decisions Made
- D1: Created `BearerAuthGuard` (NestJS guard) alongside existing `BearerAuthMiddleware`. The spec requires @UseGuards(BearerAuthGuard) — NestJS middleware can't satisfy that syntax. The guard reuses timingSafeCompare from security module.
- D2: Jest shim at `src/__orch_shared_shim__.ts` to solve ESM/CJS incompatibility. @orch/shared is "type": "module" (ESM-only), but core's Jest config uses ts-jest in CJS mode. Symlink-following to shared/dist/index.js fails because it's ESM. Shim mirrors the types inline so ts-jest can process them.
- D3: `_handleEvent` and `_queue` exported (underscore-prefixed = internal test API) so tests can verify overflow logic without going through EventBus subscriptions (which synchronously flush, preventing queue buildup).
- D4: Moved hook.received emit to POST-transaction in hooks.service.ts (carryover fix). Previously emitted before $transaction — SSE subscribers could observe it before HookEvent DB row committed.

## Next Session Pickup
Task 2.2: Telegram Bot Scaffold + Auth + /status. Start from `agent-workspace/session-plans/pending/phase-2-interfaces.md` line 222+.
