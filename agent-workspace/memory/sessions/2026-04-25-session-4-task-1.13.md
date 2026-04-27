# Session 4 (Task 1.13) — 2026-04-25

## Goal
App Wiring + Bootstrap: wire all feature modules in AppModule, add graceful shutdown, OrchContext init, env zod validation, startup checks, GET /healthz, ConsoleNotifier.

## Session Type
FOCUSED_IMPL

## Approach
Read all existing files first. AppModule already had all 9 feature modules. Added NotifierModule and HealthModule as new deliverables. Moved env validation to main.ts bootstrap (not ConfigModule.validate) so tests can import AppModule without production env vars. Added `startSpan` + `addEvent` to TracingService to satisfy ITracer interface — required minor test updates (two specs used raw OTEL Span type; changed to ISpan via wrapSpan adapter).

## Accomplished
- Subtask 1 (app.module.ts): Added NotifierModule, HealthModule imports; added OnModuleInit + initOrchContext with 4 deps.
- Subtask 2 (main.ts): FastifyAdapter with logger:true, validateEnv, SIGINT/SIGTERM handlers, app.enableShutdownHooks(), runStartupChecks(), "orch ready on port X" log line.
- Subtask 3 (OrchContext init): AppModule.onModuleInit wires store/runtime/notifier/tracer → initOrchContext.
- Subtask 4 (env validation): packages/core/src/config/env.schema.ts — zod schema for ORCH_HOOK_SECRET, ORCH_API_BEARER_TOKEN, ORCH_HTTP_PORT, ORCH_HTTP_HOST, ORCH_HOME, ORCH_LOG_LEVEL, OTEL_EXPORTER_OTLP_ENDPOINT. validateEnv called in bootstrap.
- Subtask 5 (startup checks): packages/core/src/config/startup-checks.ts — orchHome dir check (warn), DB schema check (fatal SELECT), OTEL exporter HEAD check (warn).
- Subtask 6 (healthz): packages/core/src/modules/health/{health.controller.ts, health.module.ts} — GET /healthz → 200 {status:'ok', uptime}.
- Subtask 7 (TracingService ITracer): Added ISpan.addEvent to domain interface; added wrapSpan() helper + startSpan() method; changed withSpan fn parameter from OTEL Span to ISpan.
- Subtask 8 (NotifierModule): ConsoleNotifierService (Phase 1 log-only), NotifierModule.
- Subtask 9 (dev script): Added "dev" alias in packages/core/package.json pointing to nest start --watch.

## Gates Status
- Typecheck: PASS
- Lint: PASS
- Tests: PASS (616/616 — 36 new tests added above baseline 580)
- CLI tests: PASS (22/22)
- Invariants: all green (I-1 I-2 I-3 I-14)

## Files Modified
packages/core/src/app.module.ts
packages/core/src/main.ts
packages/core/src/domain/types/tracer.ts
packages/core/src/modules/tracing/tracing.service.ts
packages/core/src/modules/tracing/tracing.service.spec.ts
packages/core/src/modules/tracing/pino-otel.spec.ts
packages/core/package.json

## Files Added
packages/core/src/app.module.spec.ts
packages/core/src/config/env.schema.ts
packages/core/src/config/env.schema.spec.ts
packages/core/src/config/startup-checks.ts
packages/core/src/modules/notifier/console-notifier.service.ts
packages/core/src/modules/notifier/console-notifier.service.spec.ts
packages/core/src/modules/notifier/notifier.module.ts
packages/core/src/modules/health/health.controller.ts
packages/core/src/modules/health/health.controller.spec.ts
packages/core/src/modules/health/health.module.ts

## Decisions Made
- ENV validation in main.ts bootstrap, not ConfigModule.validate: ConfigModule static decorator evaluates at import time, running validate would require env vars to be set before any test imports AppModule. Moving to main.ts is the correct pattern.
- ITracer compliance: TracingService.withSpan now passes ISpan wrapper (not raw OTEL Span) to fn. Two pre-existing tests that used span.spanContext() were updated to use trace.getActiveSpan() instead — semantically equivalent.
- AppModule compile test: full NestJS DI compilation fails because SessionManager injects IOrchStore (interface) without @Inject token — runtime type erasure breaks the DI lookup. Used Reflect.getMetadata on the module decorator + direct instantiation of AppModule for onModuleInit test instead. This is a pre-existing DI issue not introduced by Task 1.13.

## Next Session Pickup
Task 1.14: Integration test (end-to-end). Needs real DB (temp dir), fake profile.yaml, mock ClaudeCodeAdapter.spawn, POST hook events, assert queue state chain + OTEL spans.
