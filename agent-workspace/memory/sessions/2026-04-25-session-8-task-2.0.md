# Session 8 — 2026-04-25

## Goal
Task 2.0 — Phase 2 Kickoff: packages scaffold for `@orch/shared`, `@orch/telegram`, `@orch/web`, SSE event envelope type, env schema additions, and Phase 1 carryover bucket A housekeeping.

## Session Type
FOCUSED_IMPL

## Approach
Read session plan, agent-notes, phase-1-complete, and charter before writing any code. Discovered packages/shared, packages/telegram, and packages/web-ui already existed as stubs from Phase 1.0 scaffolding — updated each in-place rather than creating new directories. Built `@orch/shared` first (zod schemas, DTOs, SSE envelope), then `@orch/telegram` scaffold, then `@orch/web` (packages/web-ui, renamed to `@orch/web` in package.json). Applied Phase 1 carryover bucket A changes to core. Ran gates after each major change group.

## Accomplished
- A1 — `@orch/shared`: `src/events/event-types.ts`, `src/events/sse-envelope.ts`, `src/dto/{session,project,queue,hook-event}.dto.ts`, `src/env/schema.ts`, `src/index.ts` (barrel); 28 tests across 3 spec files
- A2 — `@orch/telegram` scaffold: `src/bot.ts`, `src/env.ts`, `src/index.ts`, `src/main.ts`, `README.md`; 3 tests in `src/bot.spec.ts`; package.json updated with grammy+pino+dotenv+@orch/shared deps
- A3 — `@orch/web` scaffold: updated `packages/web-ui` (renamed to `@orch/web`), fixed `vite.config.ts` (host 127.0.0.1, port 4142, strictPort), added `src/env.ts`, `src/vite-config.spec.ts`, `README.md`, `vitest.config.ts`; 3 tests
- A4 — Phase 1 carryover bucket A:
  - `.gitignore`: already had `*.db`, `*.db-*`, `.orch/` patterns — no change needed
  - `dev.db`: not git-tracked (confirmed with git ls-files) — no git rm needed
  - `packages/core/src/modules/db/prisma.service.ts`: `DATABASE_URL` default now `file:${ORCH_HOME}/orch.db` via `defaultDatabaseUrl()` helper
  - `packages/core/src/config/startup-checks.ts`: `checkDbSchema` now uses `SELECT name FROM sqlite_master WHERE type='table' AND name='Session' LIMIT 1` (cheap, no Prisma heavy init)
  - `packages/core/src/main.ts`: `unhandledRejection` + `uncaughtException` handlers already landed in Phase 1 Fix C2 — verified present, no re-add needed
- A5 — Root tooling: `package.json` scripts added `dev:telegram`, `dev:web`, `build:telegram`, `build:web`

## Gates Status
- Typecheck: PASS (all 5 packages clean)
- Lint: PASS (0 errors, 0 warnings)
- Tests: PASS (685 core + 22 cli + 28 shared + 3 telegram + 3 web = 741 total)
- Invariants: all green
  - I-4 (no `@orch/core` imports in telegram/web/shared): PASS (comments only, no actual imports)
  - I-14 (no `@nestjs` in shared): PASS
  - I-1/I-3 (no anthropic SDK): PASS
  - I-2 (no stockforge): PASS

## Files Modified
- `packages/shared/package.json` — added zod dep, exports field
- `packages/shared/src/index.ts` — full barrel export (was stub)
- `packages/shared/src/events/event-types.ts` — NEW
- `packages/shared/src/events/event-types.spec.ts` — NEW
- `packages/shared/src/events/sse-envelope.ts` — NEW
- `packages/shared/src/events/sse-envelope.spec.ts` — NEW
- `packages/shared/src/dto/session.dto.ts` — NEW
- `packages/shared/src/dto/project.dto.ts` — NEW
- `packages/shared/src/dto/queue.dto.ts` — NEW
- `packages/shared/src/dto/hook-event.dto.ts` — NEW
- `packages/shared/src/env/schema.ts` — NEW
- `packages/shared/src/env/schema.spec.ts` — NEW
- `packages/shared/dist/*` — built output (gitignored)
- `packages/telegram/package.json` — added grammy/pino/dotenv/@orch/shared deps + scripts
- `packages/telegram/src/index.ts` — updated (was stub)
- `packages/telegram/src/env.ts` — NEW
- `packages/telegram/src/bot.ts` — NEW
- `packages/telegram/src/bot.spec.ts` — NEW
- `packages/telegram/src/main.ts` — NEW
- `packages/telegram/README.md` — NEW
- `packages/web-ui/package.json` — renamed to `@orch/web`, added deps
- `packages/web-ui/vite.config.ts` — added server/preview host+port+strictPort
- `packages/web-ui/src/env.ts` — NEW
- `packages/web-ui/src/vite-config.spec.ts` — NEW
- `packages/web-ui/vitest.config.ts` — NEW
- `packages/web-ui/README.md` — updated from Vite template to Orch docs
- `packages/core/src/modules/db/prisma.service.ts` — `defaultDatabaseUrl()` uses ORCH_HOME
- `packages/core/src/config/startup-checks.ts` — cheap sqlite_master check
- `package.json` — added dev:telegram, dev:web, build:telegram, build:web scripts
- `pnpm-lock.yaml` — updated with new deps

## Decisions Made
- Used existing `packages/web-ui` directory (not new `packages/web`) — workspace picks up `packages/*`; renamed package.json `name` to `@orch/web`
- Did not add tsconfig path aliases in root (not needed — shared package built and dist/ consumed by symlink via pnpm workspace)
- `omit()` helper in schema.spec.ts instead of destructuring `_` prefix (avoids lint false positive)

## Next Session Pickup
Task 2.1 — Live Event Bridge: `GET /api/v1/events/stream` SSE endpoint in core.
Dependencies satisfied: `@orch/shared` with `SseEnvelopeSchema` and `EventType` union is now available.
Context: 685 core + 22 cli + 28 shared + 3 telegram + 3 web = 741 total tests.
