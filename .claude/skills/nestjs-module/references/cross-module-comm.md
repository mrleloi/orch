# EventBus Pattern and Cross-Module Communication Rules

## Preferred: EventBus (EventEmitter2)

```typescript
// Emitter
this.events.emit('queue.itemEnqueued', payload);

// Listener in another module
@OnEvent('queue.itemEnqueued')
handleEnqueued(payload: { projectId: string; itemId: string }) {
  // ...
}
```

## Allowed: Public Service via DI

```typescript
// session.service.ts can inject QueueService
constructor(private queue: QueueService) {}
```

## Forbidden: Import Repository from Other Module

```typescript
// WRONG
import { QueueRepository } from '../queue/queue.repository';
```

## Event Naming Convention

Use dot notation: <module>.<event>

Examples:
- queue.itemEnqueued
- session.started
- session.stopped
- project.registered
- hook.sessionStart

## Circular Import Prevention

If Module A needs Module B and Module B needs Module A:
- Extract shared logic into Module C (shared/common module)
- Or use EventBus so neither imports the other directly
- NEVER add @Global() to feature modules (only cross-cutting: config, logger)

## Module Dependency Rules

```
packages/core/src/modules/
  ↓ can import:
  shared/          # config, logger, db
  events/          # EventBus
  other-modules/   # only via exported service in index.ts
  ↑ cannot import:
  other-modules/   # internal files (repository, domain entity)
```
