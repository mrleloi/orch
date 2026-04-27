# prisma-sqlite — Skill Self-Test

## Trigger

- Editing prisma/schema.prisma
- Writing or editing any `*.repository.ts` under `packages/core/`
- Handling migration files
- User mentions WAL mode, SQLite concurrency, db locking, or busy_timeout

## Expected Behavior

Skill activates; status-transition repository methods use
`updateMany({where:{...status:'X'}, data:{status:'Y'}})` (atomic compare-and-swap, no race).
`PrismaService.onModuleInit` sets all 4 WAL pragmas: `journal_mode = WAL`,
`synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`.
No network IO (`fetch`/`execa`) inside `$transaction` blocks.

## Failure Modes

- F1: read-then-write pattern instead of `updateMany` with status guard -- race condition
  (Quick Reference shows the correct atomic pattern)
- F2: WAL setup missing `PRAGMA foreign_keys = ON` -- SQLite default is OFF,
  causing silent foreign-key violations
- F3: long-held transaction during network IO -- writer starvation (Anti-Pattern #1)

## Metrics

- activation_count_per_session: 0-3
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. Every `*.repository.ts` status-transition method uses
   `updateMany({where:{...status:'X'}, data:{status:'Y'}})` shape (multiline grep);
   NO read-then-update pairs in the same method body.
   `grep -rn "updateMany" packages/core/src/ --include="*.repository.ts"`
   (vacuously true until 5.3 adds repositories)

2. `onModuleInit` in `PrismaService` (or equivalent) contains all 4 pragmas:
   `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`,
   `foreign_keys = ON` -- grep all 4 verbatim in the same file.
   `grep -n "PRAGMA" packages/core/src/ -r --include="*.ts"`
   (vacuously true until PrismaService is implemented)

3. NO `await` on `fetch(` or `execa(` inside a `$transaction(async (tx) =>` block
   (multiline grep, network IO inside txn forbidden).
   `grep -rn "transaction" packages/core/src/ --include="*.ts"`
   (vacuously true until 5.3 adds transaction-bearing code)
