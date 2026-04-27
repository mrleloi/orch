# Session 4 — 2026-04-24 (Task 1.8)

## Goal
Implement the Queue module for Phase 1: QueueRepository, QueueService, QueueWatcherService, QueueModule, plus Prisma migration for dedupKey uniqueness constraint, and full test coverage.

## Session Type
MULTI_TASK_IMPL

## Approach
Read all referenced source files before writing a line. Identified that:
1. schema.prisma lacked `@@unique([projectId, dedupKey])` on QueueItem — added it plus a manual migration SQL file (prisma migrate dev is non-interactive in CI).
2. `queue.quarantined` channel was missing from event-channels.ts — surgically added it.
3. State machine transitions required a two-step Active → Failed → Quarantined|Pending flow in QueueService.fail().
4. Chokidar v5 on Windows does not fire events on glob patterns — fixed by watching the directory directly and filtering `.md` files in the handler.

## Accomplished
- Subtask 1: `queue.errors.ts` — QueueDedupError, QueueStateTransitionError (DomainError subclasses, I-12)
- Subtask 2: `queue.repository.ts` — Prisma wrapper, all CRUD methods with tx support, I-8 dedup via unique constraint
- Subtask 3: `queue.service.ts` — enqueue/next/complete/fail/pause/resume with zod validation (I-10), state machine checks (I-11), event emission, span wrapping
- Subtask 4: `queue-watcher.service.ts` — chokidar directory watcher, YAML frontmatter parser, debounce, sha256 dedupKey
- Subtask 5: `queue.module.ts` — NestJS module wiring
- Subtask 6: `queue.repository.spec.ts` — 16 tests covering create/find/dedup/atomicity/priority/state
- Subtask 7: `queue.service.spec.ts` — 22 tests covering all public methods, concurrency, retry/quarantine
- Subtask 8: `queue-watcher.service.spec.ts` — 8 tests covering watcher lifecycle, file events, YAML parse
- Schema: `prisma/schema.prisma` — added `@@unique([projectId, dedupKey])`
- Migration: `20260424160000_add_queue_dedup_unique/migration.sql`
- Event channels: added `queue.quarantined` channel + payload to event-channels.ts

## Gates Status
- Typecheck: PASS
- Lint: PASS (pre-existing warning in main.ts only)
- Tests (queue scope): PASS (70/70)
- Tests (full suite): PASS (318/318)
- Invariants:
  - I-14: PASS (domain does not import from modules/queue/)
  - I-2: PASS (no "stockforge" in queue module)
  - Atomicity test: PASS (nextForProject concurrency test passes)
  - Dedup test: PASS (idempotent enqueue test passes)

## Files Modified
- `packages/core/src/modules/queue/queue.errors.ts` (new)
- `packages/core/src/modules/queue/queue.repository.ts` (new)
- `packages/core/src/modules/queue/queue.service.ts` (new)
- `packages/core/src/modules/queue/queue-watcher.service.ts` (new)
- `packages/core/src/modules/queue/queue.module.ts` (new)
- `packages/core/src/modules/queue/queue.repository.spec.ts` (new)
- `packages/core/src/modules/queue/queue.service.spec.ts` (new)
- `packages/core/src/modules/queue/queue-watcher.service.spec.ts` (new)
- `packages/core/prisma/schema.prisma` (added @@unique constraint)
- `packages/core/prisma/migrations/20260424160000_add_queue_dedup_unique/migration.sql` (new)
- `packages/core/src/modules/events/event-channels.ts` (added queue.quarantined channel)

## Decisions Made
- **dedupKey strategy**: sha256(absolutePath + ':' + mtime.getTime()) — deterministic, file+mtime specific
- **YAML frontmatter parser**: inline using js-yaml (already a dep; no gray-matter needed)
- **Quarantine threshold**: 3 attempts (spec-specified; `attempts >= maxAttempts`)
- **Debounce interval**: 300ms per-path (spec-specified)
- **Migration**: Added manually (prisma migrate dev requires interactive TTY)
- **Chokidar watch strategy**: Directory watch (not glob) — chokidar v5 glob patterns unreliable on Windows
- **queue.quarantined channel**: Added to event-channels.ts as minimal required addition (spec requires emitting this event; 3 lines added)
- **State machine flow for fail()**: Active → Failed (step 1) → Pending|Quarantined (step 2); matches QUEUE_ITEM_TRANSITIONS table

## Next Session Pickup
- Task 1.9: Watchdog service (HeartbeatTimeout detection + QueueService integration)
- Task 1.10: Hooks receiver (hooks HTTP controller + HooksService using transition() from state-machine.ts)
- QueueModule is NOT yet imported in app.module.ts (spec said not to modify app.module.ts; orchestrator will handle wiring)
