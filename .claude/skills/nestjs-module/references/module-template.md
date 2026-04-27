# Module, Service, Repository Templates with index.ts Barrel Rules

## Module Template

```typescript
import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueRepository } from './queue.repository';
import { QueueController } from './queue.controller';

@Module({
  imports: [
    // Other @orch/core modules
    DbModule,
    EventsModule,
  ],
  providers: [
    QueueService,
    QueueRepository,
  ],
  controllers: [
    QueueController,
  ],
  exports: [
    QueueService, // only the public service
  ],
})
export class QueueModule {}
```

## Service Template

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '../events/event-bus.service';
import { QueueRepository } from './queue.repository';
import { EnqueueInput, QueueItem } from './dto';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly repo: QueueRepository,
    private readonly events: EventBus,
  ) {}

  async enqueue(input: EnqueueInput): Promise<QueueItem> {
    const item = await this.repo.insert(input);
    this.events.emit('queue.itemEnqueued', {
      projectId: item.projectId,
      itemId: item.id,
    });
    this.logger.log({ msg: 'Item enqueued', itemId: item.id });
    return item;
  }
}
```

## index.ts Barrel Rules

```typescript
// GOOD -- exports only what is public
export { QueueModule } from './queue.module';
export { QueueService } from './queue.service';
export type { EnqueueInput, QueueItemDto } from './dto';

// BAD -- exposes internals
export * from './queue.repository'; // repository is private!
```

## Feature Module Structure

Each feature module lives in packages/core/src/modules/<feature>/:

```
modules/queue/
├── queue.module.ts         # @Module decorator + imports/providers/exports
├── queue.service.ts        # Public API (exported)
├── queue.repository.ts     # Prisma wrapper (private)
├── queue.controller.ts     # HTTP endpoints (if applicable)
├── queue.service.spec.ts   # Unit tests
├── queue.service.integration.spec.ts  # With real Prisma in-memory
└── index.ts                # Barrel: exports ONLY public surface
```

## Fastify Platform

Use @nestjs/platform-fastify (not express) for speed:

```typescript
// main.ts
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: false }), // pino handles logging separately
);
await app.listen(config.port, config.bind);
```
