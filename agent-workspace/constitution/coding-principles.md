# Coding Principles

> TypeScript + NestJS specifics for Orch. Complement Karpathy P1-P4.

---

## TypeScript Rules

### Strict Mode, Always

`tsconfig.json` must have:
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "strictPropertyInitialization": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true
}
```

### No `any`
Never use `any`. Prefer:
- `unknown` when type is truly dynamic, then narrow
- `never` for impossible branches
- Specific union types over broad ones

If `any` seems necessary:
1. Consider if the design is wrong
2. Use `unknown` + type guard
3. Last resort: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with comment explaining why

### Prefer `interface` over `type` for Object Shapes
Reason: better error messages, declaration merging, performance.
Use `type` for: unions, intersections, mapped types, tuples.

### Discriminated Unions for State
```typescript
// Good
type SessionState =
  | { kind: 'queued'; queuedAt: Date }
  | { kind: 'running'; startedAt: Date; pid: number }
  | { kind: 'ended'; endedAt: Date; reason: EndReason };

// Exhaustive switch works perfectly
```

### No `enum`, Use String Literal Unions or `as const`
```typescript
// Prefer
type HookType = 'session-start' | 'session-end' | 'stop' | 'subagent-stop';

// Or
const HOOK_TYPES = ['session-start', 'session-end', 'stop', 'subagent-stop'] as const;
type HookType = typeof HOOK_TYPES[number];

// Avoid
enum HookType { ... } // causes ESM issues, runtime overhead
```

### Async/Await, Not `.then`
Only use raw Promises when:
- `Promise.all` / `Promise.race` / `Promise.allSettled`
- Creating a Promise in an adapter

### Error Handling

**Domain errors** — typed subclasses of `DomainError`:
```typescript
export class RuntimeUnavailableError extends DomainError {
  readonly code = 'RUNTIME_UNAVAILABLE';
}
```

**At adapter boundary** — catch raw errors, wrap in domain error:
```typescript
try {
  return await execa('claude', args);
} catch (cause) {
  throw new RuntimeUnavailableError('claude CLI failed', { cause });
}
```

**In services** — let domain errors propagate, NestJS filter handles:
```typescript
// No try/catch unless you have a specific recovery plan
```

**Never** — `catch (e) { console.log(e) }` silent swallow.

---

## NestJS Rules

### Module per Feature, Not per Layer
```
modules/
├── queue/
│   ├── queue.module.ts
│   ├── queue.service.ts
│   ├── queue.repository.ts   # Prisma wrapper
│   ├── queue.controller.ts   # HTTP
│   └── queue.service.spec.ts
```

Not:
```
controllers/
services/
repositories/
```

### Providers via Tokens (Symbols) for Adapters
```typescript
// interface
export const AGENT_RUNTIME = Symbol('AGENT_RUNTIME');
export interface IAgentRuntime { ... }

// module
{
  provide: AGENT_RUNTIME,
  useClass: ClaudeCodeAdapter, // or swappable
}

// usage
constructor(@Inject(AGENT_RUNTIME) private runtime: IAgentRuntime) {}
```

This makes adapter swapping trivial.

### No Circular Module Imports
If Module A imports Module B and B needs A's service → use `@nestjs/event-emitter` instead. Publish event, B listens.

### Global Modules Are Code Smell
`@Global()` is for cross-cutting (config, logger, event bus). Not for "I don't want to import this everywhere."

### Lifecycle Hooks Over Module Constructor
```typescript
async onModuleInit() { /* load config, connect DB */ }
async onApplicationBootstrap() { /* start watchers, bots */ }
async onModuleDestroy() { /* cleanup */ }
```

Constructor should only assign DI deps. No async work.

---

## Testing Rules

### Vitest as Test Runner
Fast, ESM-native, compatible with Jest assertions.

### Test File Layout
Colocated: `foo.service.ts` + `foo.service.spec.ts`.

### Three Test Layers

1. **Unit** (`*.spec.ts`) — pure function, service with mocked deps. No I/O.
2. **Integration** (`*.integration.spec.ts`) — test module with real Prisma (in-memory SQLite), mocked adapters.
3. **E2E** (`test/e2e/*.e2e.spec.ts`) — full NestJS app, real HTTP, mocked external CLIs.

### Coverage Targets (per Charter)
- `packages/core/src/domain/`: >90%
- `packages/core/src/modules/`: >70% (especially state machine, queue)
- `packages/core/src/adapters/`: >60% (external dep boundary)

### Test Naming
`describe('<ClassName>', () => { it('should <behavior> when <condition>', ...) })`

### No Snapshot Tests for Business Logic
Snapshots encourage "matches previous output" without verifying correctness. Use explicit `expect(...).toEqual(...)` with hand-written expected values.

---

## Dependencies

### Core Dependencies (required)
- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify` — framework
- `@nestjs/config` — env vars
- `@nestjs/event-emitter` — internal events
- `@nestjs/schedule` — cron if needed
- `prisma`, `@prisma/client` — DB
- `zod` — validation
- `pino`, `nestjs-pino` — logging
- `execa` — subprocess (better than `child_process`)
- `chokidar` — file watch
- `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` — tracing
- `@opentelemetry/exporter-trace-otlp-http` — OTLP export
- `simple-git` — git operations
- `yaml` — profile parsing

### Telegram Package
- `grammy` — Telegram bot

### Web UI Package
- `react`, `react-dom`
- `vite`, `@vitejs/plugin-react`
- `tailwindcss`
- `@tanstack/react-query` — API state
- `socket.io-client` — WS
- `lucide-react` — icons
- `react-router-dom` — routing

### Dev Deps
- `vitest`, `@vitest/coverage-v8`
- `eslint`, `@typescript-eslint/*`
- `prettier`
- `husky`, `lint-staged` — git hooks

### Forbidden
- `axios` — use native `fetch` (Node 20+)
- `moment` — use native `Date` or `date-fns` if needed
- `lodash` — native array/object methods cover 95% of needs
- Any package with < 1000 weekly downloads unless thoroughly vetted

---

## File Naming

- Classes: `PascalCase.ts` (e.g., `QueueService.ts` — but NestJS convention is kebab-case)
- **Follow NestJS kebab-case**: `queue.service.ts`, `queue.module.ts`
- Interfaces: `<name>.interface.ts` or grouped in `interfaces.ts`
- Domain entities: singular, lowercase: `queue-item.ts`, `session.ts`
- Schemas (zod): `<n>.schema.ts`
- DTOs: `<n>.dto.ts`

---

## Import Order (eslint rule)

1. Node builtins (`fs`, `path`)
2. External packages (`@nestjs/*`, `zod`, ...)
3. Internal packages (`@orch/shared`)
4. Relative imports (`../domain/session`)

Separated by blank lines. Prettier + eslint-plugin-import enforces.

---

## Git Commit Discipline

### Format (Conventional Commits)
```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`

Example:
```
feat(queue): add file watcher for session-plans/pending

Watches all managed projects' session-plans folders.
New .md file triggers enqueue event.

Closes #12
Decision: decisions/003-file-watcher-vs-polling.md
```

### Commit Frequency
- One commit per completed task (session plan task)
- No "WIP" commits pushed to main
- Squash PR commits if they're noisy

### Never Auto-Commit (Invariant reminder)
Even in autonomous mode, stage changes and report in session log. User decides when to commit.

Exception: inside a single session, if you need to commit to test git integration, note it clearly in session log.

---

## Pre-Submission Checklist

Before declaring a task done:

1. `pnpm run typecheck` passes (no errors)
2. `pnpm run lint` passes
3. `pnpm run test` passes (relevant tests)
4. Invariants I-1, I-2, I-3, I-14 `grep` checks pass
5. Files modified are a subset of files task description covers (P3 check)
6. Session log entry for this task written

If step 1-3 fails and you've tried 3 times → STOP-1.
