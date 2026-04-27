# Migrations

Migration flow, in-memory tests, common errors, query performance, file locations.

## Migrations

```bash
# Dev: create migration
pnpm prisma migrate dev --name <description>

# Prod: apply (non-interactive)
pnpm prisma migrate deploy
```

`orch start` should run `migrate deploy` on boot if `DATABASE_URL` points to existing file. Fresh install: create file + apply all migrations.

## In-Memory for Tests

Vitest setup:

```typescript
// vitest.setup.ts
process.env.DATABASE_URL = 'file::memory:?cache=shared';

// Helper to reset between tests
export async function resetDb(db: DbService) {
  const tables = ['hook_event', 'session', 'queue_item', 'decision', 'project'];
  for (const t of tables) {
    await db.$executeRawUnsafe(`DELETE FROM ${t}`);
  }
}
```

For multi-test concurrency, spawn fresh file DB per test suite instead.

## Common Errors

### `SQLITE_BUSY: database is locked`
Cause: writer starvation, long transaction, or missing WAL/busy_timeout.
Fix: check PRAGMA settings; shorten transactions; ensure migrations aren't running during app code.

### `SQLITE_READONLY`
Cause: trying to write on a :memory: DB that Prisma opened read-only, or file permissions.
Fix: check DATABASE_URL and filesystem permissions.

### `Unique constraint failed`
Legitimate — means duplicate insert attempted. Handle in service layer (catch and return existing, or propagate as conflict error).

## Query Performance

- Always index FK columns
- Index columns used in WHERE + ORDER BY together (compound index)
- Use `EXPLAIN QUERY PLAN` to verify
- SQLite can handle millions of rows if indexes are right; don't over-engineer

## File Locations

Default DB: `~/.orch/data/orch.db` (via `ORCH_HOME`).
Backups: `orch backup` command creates `~/.orch/backups/orch-<timestamp>.db` (copy file while DB idle, or use `.backup` SQL).
