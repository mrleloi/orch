# Task 5.3.4 — Worker mailbox table + service

## Status
DONE

## Files Changed
- packages/core/prisma/schema.prisma: WorkerMailbox model appended (lines 186-198)
- packages/core/prisma/migrations/20260426073436_worker_mailbox/migration.sql: generated
- packages/core/src/modules/sessions/mailbox/mailbox.repository.ts: NEW (193 lines)
- packages/core/src/modules/sessions/mailbox/mailbox.service.ts: NEW (110 lines)
- packages/core/src/modules/sessions/mailbox/mailbox.service.spec.ts: NEW (213 lines)
- packages/core/src/modules/sessions/sessions.module.ts: additive (+2 imports, +4 provider/export lines)

## Tests Added
- packages/core/src/modules/sessions/mailbox/mailbox.service.spec.ts: 8 cases

## Gates
- typecheck: PASS
- lint: PASS
- test (mailbox.service.spec): PASS (8/8)
- test (full suite): PASS (1041/1041, 73 suites)
- invariants:
  - INV-I1 grep (anthropic/openai/@anthropic-ai in mailbox/): PASS (0 hits)
  - INV-I14 (no module-level mutable state): PASS (verified by inspection)
  - INV-I12 (Prisma errors wrapped in DomainError): PASS (mapPrismaError in repository)
  - INV-I10 (zod at boundary): PASS (PollLimitSchema.parse in findUnread)
- prisma_migrate_exit: 0
- prisma_generate_exit: 0
- core_test_count: 1041

## Deviations from Plan
- Spec pattern: used `beforeEach`/`afterEach` instead of `beforeAll`/`afterAll`. The `beforeAll` pattern triggered a Jest proxy issue where `prisma.workerMailbox` was `undefined` due to module initialization ordering. The `beforeEach` pattern (matching queue.service.spec.ts) works correctly and is equivalent for test isolation.
- Migration timestamp: `20260426073436` (not `<auto-ts>` placeholder — as expected by spec).

## Concerns (if DONE_WITH_CONCERNS)
None.

## Assumptions Made
- `archiveBefore` is dormant in v2.0 per Q5 — shipped implemented but not wired to any daemon call path.
- `MailboxMessage` interface stays in service file for v2.0 per architect §9.3.C.
- The 4 pre-existing failures in `queue-claim.service.spec.ts` (5.3.3's task) are not caused by this task's changes — they relate to the `claimedBy`/`claimExpiresAt` column assertion issue in 5.3.3's spec, unrelated to the mailbox migration.
