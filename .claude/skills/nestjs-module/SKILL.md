---
name: nestjs-module
description: Use when creating, editing, or reviewing a NestJS feature module, service, controller, or DI wiring in `packages/core/`. Do NOT use for general TypeScript work that doesn't touch NestJS-specific constructs.
allowed-tools: [Read, Bash, Grep, Edit]
archetype: reference
---

# NestJS Module -- Orch Patterns

## When to Use

Any task creating/modifying:
- `*.module.ts`
- `*.service.ts`
- `*.controller.ts`
- `*.repository.ts`
- Dependency injection setup
- Module-level tests

## Reference Index

| Topic | File | When to read |
|-------|------|--------------|
| Module/service/repo templates, barrel rules | `.claude/skills/nestjs-module/references/module-template.md` | creating any new feature module |
| Adapter pattern, DI tokens, IAgentRuntime | `.claude/skills/nestjs-module/references/adapter-pattern.md` | wiring adapters or swapping runtimes |
| EventBus, cross-module communication rules | `.claude/skills/nestjs-module/references/cross-module-comm.md` | adding cross-module dependencies |
| Lifecycle hooks, Test.createTestingModule | `.claude/skills/nestjs-module/references/lifecycle-and-testing.md` | onModuleInit/Destroy or writing module tests |

## Quick Reference

```typescript
// Minimal module shape
@Module({
  imports: [DbModule, EventsModule],
  providers: [QueueService, QueueRepository],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}

// DI adapter token (core pattern -- see adapter-pattern.md)
export const AGENT_RUNTIME = Symbol.for('AGENT_RUNTIME');
@Injectable() class SessionService {
  constructor(@Inject(AGENT_RUNTIME) private runtime: IAgentRuntime) {}
}

// Cross-module via EventBus (preferred)
this.events.emit('queue.itemEnqueued', { projectId, itemId });

// Lifecycle hook (preferred over constructor async)
async onModuleInit() { await this.loadAll(); this.startWatching(); }
async onModuleDestroy() { this.stopWatching(); }
```

## Anti-Patterns

- Barrel `export *` from module (exposes private internals)
- Circular module imports (use events instead)
- `@Global()` decorator for features (only for cross-cutting: config, logger)
- Service methods without Promise return when doing IO
- Constructors with async work (use `onModuleInit`)
- Injecting concrete classes instead of interfaces for adapters
