# Session 2 — 2026-04-25

## Goal
Implement Task 1.11: REST API Module — versioned /api/v1 endpoints with Bearer auth,
zod validation, I-6 confirmation gate, and full test coverage.

## Session Type
FOCUSED_IMPL

## Approach
Studied the HookSecretMiddleware and hooks controller pattern in detail before writing
a single line. Extracted timing-safe comparison into a shared utility
(security/timing-safe-compare.ts) so BearerAuthMiddleware and HookSecretMiddleware
share the same implementation. Built the module bottom-up: shared utility, schemas,
middleware, controller, module, then wired into app.module.ts. Tests mirror the
hooks.controller.spec.ts and hook-secret.middleware.spec.ts patterns exactly.

## Accomplished
- Subtask: timing-safe-compare utility — `packages/core/src/modules/security/timing-safe-compare.ts`
- Subtask: API schemas (zod) — `packages/core/src/modules/api/schemas/api.schemas.ts`
- Subtask: BearerAuthMiddleware — `packages/core/src/modules/api/bearer-auth.middleware.ts`
- Subtask: ApiController (5 endpoints) — `packages/core/src/modules/api/api.controller.ts`
- Subtask: ApiModule — `packages/core/src/modules/api/api.module.ts`
- Subtask: app.module.ts updated — imports ApiModule
- Tests: timing-safe-compare.spec.ts (9 tests), bearer-auth.middleware.spec.ts (8 tests), api.controller.spec.ts (26 tests)

## Gates Status
- Typecheck: PASS
- Lint: PASS
- Tests: PASS (580/580 — 537 existing + 43 new)
- Invariants: all green (I-1: no SDK imports, I-2: no stockforge, I-3: verified, I-14: no NestJS in domain)

## Files Modified
packages/core/src/app.module.ts

## Files Added
packages/core/src/modules/api/api.controller.ts
packages/core/src/modules/api/api.controller.spec.ts
packages/core/src/modules/api/api.module.ts
packages/core/src/modules/api/bearer-auth.middleware.ts
packages/core/src/modules/api/bearer-auth.middleware.spec.ts
packages/core/src/modules/api/schemas/api.schemas.ts
packages/core/src/modules/security/timing-safe-compare.ts
packages/core/src/modules/security/timing-safe-compare.spec.ts

## Decisions Made
- Did NOT modify HookSecretMiddleware to use the new helper (out of scope; it still works correctly with its inline implementation).
- Used `@Controller('api/v1')` path prefix on the controller rather than a global prefix, consistent with how HooksController uses `@Controller('hooks')`. This avoids touching main.ts.
- `listActiveSessions()` is synchronous (SessionManager.getActiveSessions() returns synchronously) so no async needed.
- dedupKey for POST /queue = `${projectId}:${planPath}` — stable, deterministic, idempotent per I-8.

## Next Session Pickup
Task 1.12: CLI Package. app.module.ts already has ApiModule wired. All existing tests pass at 580.
