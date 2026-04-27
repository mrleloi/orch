# Task 1.13 — Close-out DI Fix + Daemon Boot

## Status
DONE

## Files Changed
- packages/core/src/modules/sessions/session-manager.ts: constructor param IOrchStore → OrchStoreService (DI fix)
- packages/core/src/modules/sessions/agent-watchdog.ts: added @Optional() to WatchdogOptions param (DI fix)
- packages/core/src/app.module.spec.ts: added DI compile test describe block (5 new tests)
- packages/core/src/app.module.spec.ts: added migration helpers + Test import
- packages/core/package.json: build script now clears tsbuildinfo before nest build; added @prisma/client-runtime-utils moduleNameMapper
- packages/core/prisma/schema.prisma: removed explicit output override (prisma generate now auto-detects virtual store)
- packages/cli/src/index.spec.ts: fixed fragile test (mock fs.existsSync so it passes regardless of dist presence)
- .npmrc: added public-hoist-pattern for @prisma/* to fix pnpm virtual store resolution
- prisma generate: run with no output to populate virtual store; also run prisma migrate deploy on /tmp/orch-test/dev.db

## Tests Added
- packages/core/src/app.module.spec.ts: 5 DI compile test cases
  - compiles without UnknownDependenciesException
  - resolves OrchStoreService
  - resolves SessionManager
  - resolves EventBusService
  - onModuleInit populates OrchContext

## Gates
- typecheck: PASS
- lint: PASS
- test: PASS (621/621 core, 22/22 cli)
- invariants: PASS (no @anthropic-ai/sdk, no stockforge, no @nestjs in domain/)

## Deviations from Plan
1. AgentWatchdog WatchdogOptions default param was a second interface-injection bug. Fixed with @Optional().
2. prisma generate needed explicit action: removed output override so Prisma auto-detects the virtual store location (pnpm-idiomatic).
3. Added .npmrc with public-hoist-pattern for @prisma/* — required for pnpm to hoist prisma packages so the daemon can resolve @prisma/client at runtime.
4. build script: must clear tsbuildinfo before nest build (incremental build skips emit if cache says nothing changed, leaving dist empty after deleteOutDir).
5. better-sqlite3 native binary: the pnpm install --force (attempted during .npmrc setup) removed the prebuilt binary. Re-ran prebuild-install to restore it.
6. CLI test "exits with error when core dist is missing" was a fragile test that assumed dist/main.js was absent. Fixed by mocking fs.existsSync.

## Concerns
- The pnpm virtual store symlink (.prisma/client) gets cleared on pnpm install. The .npmrc public-hoist-pattern fix + running prisma generate (no output) after install is the permanent fix. Added to docs but no postinstall script.
- better-sqlite3 native binary needs prebuild-install after fresh pnpm installs. Same issue — no postinstall script. Developer runbook needed.

## Assumptions Made
- AgentWatchdog's WatchdogOptions default param was intentionally testable via direct construction (not DI), just needed @Optional() for NestJS DI compilation.
- The pnpm virtual store symlink approach is acceptable as a runtime fix (not persisted through reinstall, requires prisma generate).
