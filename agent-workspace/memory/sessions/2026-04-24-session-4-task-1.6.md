# Session 4 — Task 1.6 — 2026-04-24

## Goal
Implement the ProjectRegistryModule: scan ~/.orch/projects/*.yaml, validate with ProfileSchema, persist to DB via OrchStoreService, watch for file changes with chokidar, expose POST /admin/reload endpoint.

## Session Type
FOCUSED_IMPL

## Approach
Read all reference files (profile.ts, errors.ts, store.ts, orch-store.service.ts, existing modules) to understand the exact contracts before writing a line. Implemented the service with a clean in-memory Map cache, chokidar watcher with 500ms debounce, reload() method diffing cache vs disk. Added chokidar v5 ESM transform override to package.json jest config (transformIgnorePatterns) since chokidar v5 is ESM-only and ts-jest runs in CommonJS mode. All events marked TODO(1.7) for EventBusService wiring.

## Accomplished
- Subtask 1: `resolveProjectsDir()` helper — uses ORCH_HOME env or ~/.orch/projects; mkdir best-effort
- Subtask 2: `ProjectRegistryService` — onModuleInit scans+validates+upserts+starts watcher; reload() diffs cache; listProjects/getProject public API; all events marked TODO(1.7)
- Subtask 3: `AdminController` — POST /admin/reload with TODO(1.11) auth comment
- Subtask 4: `ProjectRegistryModule` — imports DbModule + EventEmitterModule.forRoot()
- Subtask 5: `project-registry.service.spec.ts` — 12 tests covering happy path, invalid yaml, file change, file delete, reload counts
- Subtask 6: `admin.controller.spec.ts` — 4 tests covering reload endpoint shape, call count, error propagation

## Gates Status
- Typecheck: PASS
- Lint: PASS (0 errors; 1 pre-existing warning in main.ts, out of scope)
- Tests: PASS (247/247 full suite; 16/16 project-registry specs)
- Invariants:
  - I-5: PASS (no actual reads to .ccs/ or .claude/ — grep matches were comment text only)
  - I-10: PASS (all YAML input goes through parseProfile() which calls ProfileSchema.safeParse(); no `as Profile` casts in production code)
  - I-2: PASS (no stockforge/StockForge)
  - Schema single source: PASS (no z.object in module; ProfileSchema imported from domain/profile.ts)

## Files Modified
- packages/core/src/modules/project-registry/project-registry.service.ts (new)
- packages/core/src/modules/project-registry/project-registry.module.ts (new)
- packages/core/src/modules/project-registry/admin.controller.ts (new)
- packages/core/src/modules/project-registry/project-registry.service.spec.ts (new)
- packages/core/src/modules/project-registry/admin.controller.spec.ts (new)
- packages/core/package.json (added chokidar, @nestjs/event-emitter, js-yaml deps + transformIgnorePatterns jest config)
- pnpm-lock.yaml (updated)

## Decisions Made
- **Chokidar v5 ESM**: Added `transformIgnorePatterns` to jest config to handle chokidar's ESM-only format under pnpm's nested node_modules path (`.pnpm/` prefix).
- **listProjects/getProject sync**: Changed from `async` to synchronous returning `Promise.resolve()` to satisfy `@typescript-eslint/require-await` lint rule while keeping the `Promise<>` return type as specified.
- **upsertToDb**: Accesses Prisma through the store's `db` field via a type cast since IOrchStore doesn't expose a `upsertProject` method in Phase 1 contract. This keeps the adapter boundary contained.
- **EventEmitter2 placement**: Used `@nestjs/event-emitter`'s `EventEmitter2` directly. Each emit call marked `TODO(1.7)` as instructed.

## TODO Markers Added
- project-registry.service.ts:155 — `TODO(1.7): wire through EventBusService once available` (project.invalid on scan error)
- project-registry.service.ts:175 — `TODO(1.7): wire through EventBusService once available` (project.registered on add)
- project-registry.service.ts:185 — `TODO(1.7): wire through EventBusService once available` (project.updated on diff)
- project-registry.service.ts:203 — `TODO(1.7): wire through EventBusService once available` (project.removed on removal)
- project-registry.service.ts:330 — `TODO(1.7): wire through EventBusService once available` (project.invalid in watcher)
- project-registry.service.ts:344 — `TODO(1.7): wire through EventBusService once available` (project.removed on projectId change)
- project-registry.service.ts:353 — `TODO(1.7): wire through EventBusService once available` (project.registered in watcher)
- project-registry.service.ts:357 — `TODO(1.7): wire through EventBusService once available` (project.updated in watcher)
- project-registry.service.ts:370 — `TODO(1.7): wire through EventBusService once available` (project.removed on unlink)
- admin.controller.ts:10 — `TODO(1.11): bearer-auth middleware` (REST auth gate)

## Next Session Pickup
Task 1.7 (EventBusService) can now replace the raw EventEmitter2.emit() calls at all TODO(1.7) sites. The ProjectRegistryModule must be imported into AppModule when the bootstrap task (1.13) wires everything together.
