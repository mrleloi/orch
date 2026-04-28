---
name: prisma-sqlite
description: Use when editing `prisma/schema.prisma`, any repository class under `packages/core/`, migration files, or when the user mentions WAL mode, SQLite concurrency, or db locking.
allowed-tools: [Read, Bash, Grep, Edit]
archetype: reference
---

# Prisma + SQLite — Orch Patterns

## When to Use

- Adding/modifying prisma/schema.prisma
- Writing `*.repository.ts` files
- Handling migrations
- Debugging DB concurrency, lock errors, performance

## Reference Index

| Topic | File | When to read |
|-------|------|--------------|
| Schema patterns | `.claude/skills/prisma-sqlite/references/schema-patterns.md` | full Prisma schema (Project, QueueItem, Session, HookEvent, Decision) |
| WAL + concurrency | `.claude/skills/prisma-sqlite/references/wal.md` | WAL setup, busy_timeout, foreign_keys, transaction rules |
| Repository pattern | `.claude/skills/prisma-sqlite/references/repository-pattern.md` | repository template, atomic-update via updateMany |
| Migrations | `.claude/skills/prisma-sqlite/references/migrations.md` | migration flow, in-memory tests, common errors, query performance |

## Quick Reference: Atomic Status Transition

```typescript
await db.$transaction(async (tx) => {
  const result = await tx.queueItem.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'running', startedAt: new Date() },
  });
  if (result.count === 0) throw new StateConflictError(); // someone else took it
});
```

The `updateMany` with status guard is the optimistic-lock pattern. Avoid read-then-write — race condition.

## Quick Reference: WAL Setup

```typescript
async onModuleInit() {
  await this.$connect();
  await this.$executeRawUnsafe('PRAGMA journal_mode = WAL');
  await this.$executeRawUnsafe('PRAGMA synchronous = NORMAL');
  await this.$executeRawUnsafe('PRAGMA busy_timeout = 5000');
  await this.$executeRawUnsafe('PRAGMA foreign_keys = ON');
}
```

`foreign_keys = ON` is critical — SQLite default is OFF.

## Anti-Patterns (top 3)

- Holding transactions open during network IO (writer starvation)
- Forgetting `foreign_keys = ON`
- Skipping indexes "because data is small"

See `.claude/skills/prisma-sqlite/references/wal.md` and `.claude/skills/prisma-sqlite/references/repository-pattern.md` for full anti-patterns lists.
