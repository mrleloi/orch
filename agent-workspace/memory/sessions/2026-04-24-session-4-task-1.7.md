# Session 4 — Task 1.7 — 2026-04-24

## Goal
Implement Events module (1.7a) and Tracing module (1.7b) for `@orch/core`. Replace TODO(1.7) markers in project-registry.service.ts with typed EventBusService calls. Deliver fully typed inter-module event bus, OTEL SDK bootstrap, pino-OTEL correlation, and W3C TRACEPARENT propagation utility.

## Session Type
MULTI_TASK_IMPL (2 subtasks: 1.7a Events + 1.7b Tracing, executed in single sandwich-dev call)

## Approach
Built 1.7a first (event-channels.ts → event-bus.service.ts → events.module.ts → spec → TODO replacement), then 1.7b (tracing.errors.ts → tracing.service.ts → tracing.module.ts → pino-otel.ts → specs). Fixed several TypeScript + lint issues iteratively before all gates passed.

Key decisions:
- Used `NodeTracerProvider` (not `BasicTracerProvider`) in tests because `BasicTracerProvider` uses `NoopContextManager` which breaks `trace.getActiveSpan()` inside async functions.
- Added `@opentelemetry/core`, `@opentelemetry/resources`, `@opentelemetry/sdk-trace-node` as direct deps because they are transitive through `sdk-node` but not directly importable via NodeNext resolution.
- Used `fs.readFileSync` + `__dirname` (CJS-compatible) for reading package.json version instead of `import.meta.url` (ESM-only, incompatible with `NodeNext` module + CJS output).
- `TraceFlags.SAMPLED` comparison cast to `number` const to satisfy `@typescript-eslint/no-unsafe-enum-comparison`.
- `createPinoOtelMixin` returns `(): object =>` (no unused params) to avoid `@typescript-eslint/no-unused-vars`.

## Accomplished
- Subtask 1.7a (Events):
  - `packages/core/src/modules/events/event-channels.ts` — EVENT_CHANNELS const, EventChannel union, EventPayloadMap interface
  - `packages/core/src/modules/events/event-bus.service.ts` — typed emit/on/once wrapper over EventEmitter2
  - `packages/core/src/modules/events/events.module.ts` — @Global() NestJS module
  - `packages/core/src/modules/events/event-bus.service.spec.ts` — 10 tests
  - `packages/core/src/modules/project-registry/project-registry.service.ts` — 8 TODO(1.7) markers replaced
  - `packages/core/src/modules/project-registry/project-registry.service.spec.ts` — updated to use EventBusService
  - `packages/core/src/modules/project-registry/project-registry.module.ts` — removed EventEmitterModule (global from EventsModule)

- Subtask 1.7b (Tracing):
  - `packages/core/src/modules/tracing/tracing.errors.ts` — TracingInitError domain error
  - `packages/core/src/modules/tracing/tracing.service.ts` — withSpan, getActiveTraceparent, injectTraceparentIntoEnv, getTracer
  - `packages/core/src/modules/tracing/tracing.module.ts` — @Global() NestJS module with NodeSDK bootstrap
  - `packages/core/src/modules/tracing/pino-otel.ts` — createPinoOtelMixin, createPinoOtelFormatter
  - `packages/core/src/modules/tracing/tracing.service.spec.ts` — 13 tests
  - `packages/core/src/modules/tracing/pino-otel.spec.ts` — 4 tests
  - `packages/core/package.json` — added OTEL deps + pino

## Gates Status
- Typecheck: PASS
- Lint: PASS (0 errors; 1 pre-existing warning in main.ts)
- Tests: PASS (274/274)
  - event-bus.service: 10 tests
  - tracing.service: 13 tests
  - pino-otel: 4 tests
  - project-registry: 16 tests (regression green)
  - Full suite: 274/274
- Invariants:
  - I-14 (no NestJS in domain): PASS
  - I-2 (no stockforge): PASS
  - TODO(1.7) markers removed: PASS
  - D7 TRACEPARENT via propagation.inject: PASS
  - TODO(1.11) preserved in admin.controller.ts: PASS

## Files Modified
- `packages/core/package.json` — added @opentelemetry/* deps + pino + @opentelemetry/core + @opentelemetry/resources + @opentelemetry/sdk-trace-node
- `packages/core/src/modules/events/event-channels.ts` (new)
- `packages/core/src/modules/events/event-bus.service.ts` (new)
- `packages/core/src/modules/events/events.module.ts` (new)
- `packages/core/src/modules/events/event-bus.service.spec.ts` (new)
- `packages/core/src/modules/tracing/tracing.errors.ts` (new)
- `packages/core/src/modules/tracing/tracing.service.ts` (new)
- `packages/core/src/modules/tracing/tracing.module.ts` (new)
- `packages/core/src/modules/tracing/pino-otel.ts` (new)
- `packages/core/src/modules/tracing/tracing.service.spec.ts` (new)
- `packages/core/src/modules/tracing/pino-otel.spec.ts` (new)
- `packages/core/src/modules/project-registry/project-registry.service.ts` — injected EventBusService, replaced 8 TODO(1.7) emits
- `packages/core/src/modules/project-registry/project-registry.service.spec.ts` — updated to use EventBusService
- `packages/core/src/modules/project-registry/project-registry.module.ts` — removed EventEmitterModule import (now global via EventsModule)
- `pnpm-lock.yaml`

## Decisions Made
- OTEL dep versions: api@^1.9.0, sdk-node@^0.57.0, sdk-trace-base@^1.30.0, exporter-trace-otlp-http@^0.57.0, auto-instrumentations-node@^0.57.0, resources@^1.30.0, core@^1.30.0, sdk-trace-node@^1.30.0
- pino@^9.5.0 added for OTEL mixin types
- NodeTracerProvider (not BasicTracerProvider) chosen for tests — needed for async context propagation
- CJS-compatible package.json version reading via `fs.readFileSync + __dirname` (not `import.meta.url`)

## Next Session Pickup
- Task 1.8 (Queue Module): can now import EventBusService and EVENT_CHANNELS for queue state change events
- Task 1.13 (AppModule wiring): must import EventsModule and TracingModule as @Global() providers
- EventsModule and TracingModule are NOT yet wired into AppModule (per task scope — Task 1.13 handles wiring)
- app.module.ts is unchanged — TracingModule and EventsModule are standalone until Task 1.13
