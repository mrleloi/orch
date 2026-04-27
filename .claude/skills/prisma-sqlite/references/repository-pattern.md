# Repository Pattern

Repository template + atomic-update pattern + transaction rules.

## Pattern

```typescript
@Injectable()
export class QueueRepository {
  constructor(private db: DbService) {}

  async insert(input: EnqueueInput): Promise<QueueItem> {
    return this.db.queueItem.create({
      data: {
        projectId: input.projectId,
        planId: input.frontmatter.id,
        planPath: input.planPath,
        sessionType: input.frontmatter.session_type,
        priority: input.priority,
        status: 'pending',
      },
    });
  }

  async getNext(projectId: string): Promise<QueueItem | null> {
    return this.db.$transaction(async (tx) => {
      const item = await tx.queueItem.findFirst({
        where: { projectId, status: 'pending' },
        orderBy: [{ priority: 'desc' }, { enqueuedAt: 'asc' }],
      });
      if (!item) return null;
      // Optimistic lock via conditional update
      const updated = await tx.queueItem.updateMany({
        where: { id: item.id, status: 'pending' },
        data: { status: 'running', startedAt: new Date() },
      });
      if (updated.count === 0) return null; // someone else took it
      return { ...item, status: 'running' };
    });
  }

  // ... complete, fail, cancel, list, etc.
}
```

## Anti-Patterns

- Using SQLite like Postgres (no row-level locking, no deferred constraints)
- `autoincrement` IDs without thought — prefer `cuid()` or `uuid()` for distributed-friendly IDs
- Skipping indexes "because data is small" — add them proactively
