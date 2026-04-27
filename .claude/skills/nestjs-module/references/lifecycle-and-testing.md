# Lifecycle Hooks and Testing with Test.createTestingModule

## Lifecycle Hooks

```typescript
@Injectable()
export class ProjectRegistryService
  implements OnModuleInit, OnModuleDestroy {

  async onModuleInit() {
    // After DI is ready, before requests come in
    await this.loadAll();
    this.startWatching();
  }

  async onModuleDestroy() {
    // Before shutdown
    this.stopWatching();
  }
}
```

Prefer lifecycle hooks over constructor for async work.

## Unit Testing with Mocks

```typescript
import { Test } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('QueueService', () => {
  let service: QueueService;
  let repoMock: jest.Mocked<QueueRepository>;
  let eventsMock: jest.Mocked<EventBus>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: QueueRepository, useValue: createMock<QueueRepository>() },
        { provide: EventBus, useValue: createMock<EventBus>() },
      ],
    }).compile();

    service = module.get(QueueService);
    repoMock = module.get(QueueRepository);
    eventsMock = module.get(EventBus);
  });

  it('should emit event on enqueue', async () => {
    repoMock.insert.mockResolvedValue(fakeItem);
    await service.enqueue(fakeInput);
    expect(eventsMock.emit).toHaveBeenCalledWith(
      'queue.itemEnqueued',
      expect.objectContaining({ itemId: fakeItem.id }),
    );
  });
});
```

## Integration Testing (Real Prisma In-Memory)

```typescript
// queue.service.integration.spec.ts
describe('QueueService integration', () => {
  let service: QueueService;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Use in-memory SQLite for tests
    prisma = new PrismaClient({
      datasources: { db: { url: 'file::memory:?cache=shared' } },
    });
    await prisma.'PRAGMA journal_mode=WAL';
    // Run migrations
    await prisma.();

    const module = await Test.createTestingModule({
      imports: [QueueModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = module.get(QueueService);
  });

  afterAll(() => prisma.());
});
```

## Anti-Patterns

- Barrel export * from module (exposes private internals)
- Circular module imports (use events instead)
- Module-level mutable state (use service scope)
- @Global() decorator for features (only for cross-cutting: config, logger)
- Service methods that do not return a Promise when doing IO
- Constructors with async work (use onModuleInit)
- Injecting concrete classes instead of interfaces for adapters
