# Task 5.3.3 — Atomic claim service QueueClaimService.claim

## Status
DONE_WITH_CONCERNS

## Files Changed
- packages/core/src/modules/queue/queue-claim.service.ts (NEW, ~165 lines)
- packages/core/src/modules/queue/queue-claim.service.spec.ts (NEW, ~250 lines)
- packages/core/src/modules/queue/queue.module.ts (MODIFIED: +2 lines additive)

## Tests Added
- packages/core/src/modules/queue/queue-claim.service.spec.ts: 6 cases

## Gates
- typecheck: PASS (my files); pre-existing state-machine.ts error from parallel task not in scope
- lint: PASS (my files); pre-existing lint errors in 5.3.4/5.3.5 files not in scope
- test: PASS 6/6
- invariants:
  - INV-I1 grep: PASS (0 hits)
  - INV-I12: PASS (DomainError wrap verified in case 6)
  - INV-I14: PASS (no module-level mutable state)
  - I-6 no commit: PASS (no commit made)

## Deviations from Plan

1. **CURRENT_TIMESTAMP replaced with parameterized ${now}**: The architect's SQL used
   `CURRENT_TIMESTAMP` in the WHERE clause. In practice, SQLite stores Prisma DateTime
   as ISO-8601 with T separator (e.g., "2026-04-26T06:39:00.000Z") while CURRENT_TIMESTAMP
   uses space separator ("2026-04-26 06:39:00"). String comparison then breaks because
   'T' > ' ' in ASCII, making expired claims never sweep-eligible. Fix: pass `new Date()`
   as a typed parameter so Prisma uses the same ISO-8601 format for both sides.
   This is semantically equivalent — both sides now compare using the same format.

2. **Prisma client regeneration required**: The packages/core/node_modules/.prisma/client/
   had stale generated types (missing claimedBy/claimExpiresAt) despite the task spec
   claiming "pnpm prisma generate has run". Ran `pnpm prisma generate` and manually
   copied index.d.ts + index.js from pnpm store to the local path used by jest's
   moduleNameMapper. Without this, all 6 tests would fail with `claimedBy = undefined`.

## Concerns (DONE_WITH_CONCERNS)

1. **Stale Prisma client in jest**: The jest moduleNameMapper in package.json points to
   `packages/core/node_modules/.prisma/client/` which is NOT updated by `pnpm prisma generate`
   (that generates to the pnpm store). This is a structural issue that will affect future
   tasks using new Prisma columns in tests. The 5.3.4 (mailbox) implementer will face the
   same issue for WorkerMailbox. Recommend: update package.json jest moduleNameMapper to
   point to the pnpm store path, or add a postinstall/prepare script to copy.

2. **Pre-existing typecheck error** in `src/domain/state-machine.ts` (TS2366). Not from
   my task's files. Likely from a parallel task (5.3.5 or 5.3.x) that modified the state
   machine. The spec-compliance-reviewer should flag this.

## Assumptions Made
- The architect's `CURRENT_TIMESTAMP` SQL was written assuming a non-Prisma driver where
  datetime storage format matches CURRENT_TIMESTAMP format. Parameterizing `now` is the
  correct fix for Prisma + SQLite.
- The `@prisma/client` moduleNameMapper path in jest config is intentional (points to local
  copy for isolation) but was not updated by prisma generate. Manual copy was the least
  invasive fix.
