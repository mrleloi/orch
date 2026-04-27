# WAL Mode + Concurrency

WAL setup, busy_timeout, foreign_keys, concurrency rules.

## Startup: WAL Mode

SQLite default uses rollback journal — single-writer, poor concurrency. Orch needs WAL.

```typescript
// packages/core/src/modules/db/db.service.ts
@Injectable()
export class DbService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // Enable WAL for better concurrency
    await this.$executeRawUnsafe('PRAGMA journal_mode = WAL');
    await this.$executeRawUnsafe('PRAGMA synchronous = NORMAL');
    await this.$executeRawUnsafe('PRAGMA busy_timeout = 5000');
    await this.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

## Concurrency Rules

**Rule 1: One writer at a time.**
SQLite serializes writes. WAL lets readers proceed during writes, but writes still block each other.

**Rule 2: Use transactions for multi-step operations.**
```typescript
// WRONG — race condition
const item = await repo.find(id);
if (item.status === 'pending') {
  await repo.update(id, { status: 'running' });
}

// RIGHT — atomic
await db.$transaction(async (tx) => {
  const result = await tx.queueItem.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'running' },
  });
  if (result.count === 0) throw new StateConflictError();
});
```

**Rule 3: Short transactions.**
Don't do IO (HTTP calls, subprocess spawns) inside a transaction. Do the DB work, commit, then do IO.

**Rule 4: `busy_timeout` to avoid SQLITE_BUSY.**
Set during WAL setup (5000ms = 5s retry on lock). Most transient locks resolve within.

## Anti-Patterns

- Holding transactions open during network IO
- Forgetting `foreign_keys = ON` (SQLite default is OFF — a trap)
- Running migrations from app code without a lock (multiple instances → race)
