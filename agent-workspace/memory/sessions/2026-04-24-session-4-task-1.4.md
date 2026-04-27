# Session 4 — 2026-04-24 (Task 1.4)

## Goal
Implement the Prisma schema, migrations, db module (PrismaService, OrchStoreService), and tests for the persistence layer.

## Session Type
FOCUSED_IMPL

## Approach
Read all domain entity files to ensure 1:1 schema alignment, then built the Prisma schema (Prisma 7 with better-sqlite3 adapter), ran migrations, implemented NestJS db module with WAL pragmas, and wrote full CRUD + dedup + transaction tests using per-test tmp-file SQLite for isolation.

## Accomplished
- Subtask 1: `packages/core/prisma/schema.prisma` — 6 models (Project, Session, QueueItem, HookEvent, HandoffContext, SessionLock), all indices per spec, unique index on `HookEvent.dedupKey`
- Subtask 2: Migration files — `20260424145848_init` + `20260424150118_add_session_lock`
- Subtask 3: `packages/core/src/modules/db/prisma.module.ts` — NestJS DbModule exporting PrismaService + OrchStoreService
- Subtask 4: `packages/core/src/modules/db/prisma.service.ts` — extends PrismaClient with better-sqlite3 adapter, applies WAL/FK/busy_timeout pragmas on init
- Subtask 5: `packages/core/src/modules/db/orch-store.service.ts` — full IOrchStore implementation with I-12 error mapping, transaction support, duck-typed Prisma error guard
- Subtask 6: `packages/core/src/modules/db/prisma.service.spec.ts` + `orch-store.service.spec.ts` — 211 tests total, all passing

## Gates Status
- Validate: PASS
- Generate: PASS
- Migrate: PASS
- Typecheck: PASS
- Lint: PASS (1 pre-existing warning in main.ts — not our code)
- Tests: PASS (211/211)
- I-14: PASS — no Prisma imports in domain/
- I-2: PASS — no stockforge/StockForge references
- D2: PASS — no journal_mode=DELETE

## Files Modified
- `packages/core/prisma/schema.prisma` (new)
- `packages/core/prisma.config.ts` (new)
- `packages/core/prisma/migrations/20260424145848_init/migration.sql` (new)
- `packages/core/prisma/migrations/20260424150118_add_session_lock/migration.sql` (new)
- `packages/core/src/modules/db/prisma.module.ts` (new)
- `packages/core/src/modules/db/prisma.service.ts` (new)
- `packages/core/src/modules/db/prisma.service.spec.ts` (new)
- `packages/core/src/modules/db/orch-store.service.ts` (new)
- `packages/core/src/modules/db/orch-store.service.spec.ts` (new)
- `packages/core/package.json` (added prisma scripts + dependencies)
- `packages/core/tsconfig.json` (added paths alias for @prisma/client)

## Decisions Made
1. **Prisma 7 + better-sqlite3 adapter**: Prisma 7 requires an adapter; `@prisma/adapter-better-sqlite3` is the official SQLite option. Better than libsql for local-file SQLite.
2. **prisma.config.ts for datasource**: Prisma 7 moved datasource URL from schema.prisma to prisma.config.ts. Added `datasource.url` there.
3. **TypeScript paths alias**: Resolved pnpm virtual store `@prisma/client` resolution gap by adding `paths: { "@prisma/client": ["./node_modules/.prisma/client/index"] }` in tsconfig + `moduleNameMapper` in Jest config.
4. **Duck-typed Prisma error guard**: Used `isPrismaKnownError()` (property check on `.code`) instead of `instanceof Prisma.PrismaClientKnownRequestError` to avoid class resolution gap across pnpm virtual store.
5. **SessionLock table added**: IOrchStore requires lock methods; added `SessionLock` model (not in original spec table list but needed for interface compliance). Added as 2nd migration.
6. **enqueueItem project lookup**: `QueueItemDraft` only has `sessionKey` but Prisma `QueueItem` needs `projectId` FK. Implemented lookup via `profileJson LIKE "%\"projectId\":\"<extracted>\"%"` query.
7. **Test isolation**: Per-test tmp-file SQLite with better-sqlite3 direct migration application (no CLI spawn — I-13 compliant).
8. **BigInt PRAGMA results**: SQLite PRAGMA integer results come back as BigInt via better-sqlite3/Prisma; test assertions use `Number()` conversion.

## Concerns for Task 1.5+
- The `enqueueItem` project lookup via `profileJson LIKE` is fragile if JSON key ordering changes. A dedicated `Project.logicalProjectId` column would be cleaner (suggest for later task).
- The `prisma.config.ts` uses `earlyAccess: true` — this is required for Prisma 7 config API (still experimental in 7.8.0).
- The `sessionKeyToProjectId` helper is used in multiple places; if session key format changes, update all call sites.

## Next Session Pickup
Task 1.5 (Secret Redactor) can start cleanly. The DbModule is fully wired and tested. No open work items from this session.
