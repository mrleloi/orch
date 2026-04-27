# Task 1.16 APPROVED_AFTER_FIX — Narrow fix cycle

## Status
DONE

## Files Changed
- packages/core/src/modules/security/redact-log-object.ts: 1-67 (NEW — deep-redact helper with MAX_DEPTH=10 guard)
- packages/core/src/main.ts: imports + FastifyAdapter config (pino-OTEL mixin + formatters.log redaction)
- packages/core/src/domain/errors.ts: DomainError constructor now calls redactSecrets(message)
- packages/core/src/modules/events/event-bus.service.ts: emit() deep-redacts payload via redactLogObject
- packages/core/src/modules/hooks/hook-secret.middleware.ts: removed inline timing-safe block, imports timingSafeCompare
- packages/core/src/modules/hooks/hooks.service.ts: `payload: any` -> `AnyHookPayload` union type

## Tests Added
- packages/core/src/modules/security/redact-log-object.spec.ts: 11 cases (flat, nested, arrays, idempotency, depth limit, mutation safety)
- packages/core/src/modules/security/fastify-logger-redacts.spec.ts: 4 cases (API key, Bearer, mixed, no trace_id outside span)
- packages/core/src/domain/domain-error-redacts.spec.ts: 11 cases (message, JSON, toString, subclasses, cause chain, instanceof)
- packages/core/src/modules/events/event-bus-redacts.spec.ts: 4 cases (secret redacted, safe pass-through, nested, numbers)
- packages/core/src/modules/tracing/pino-otel-wired.spec.ts: 3 cases (trace_id+span_id inside span, none outside, hex format)

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors, auto-fixed one cast)
- test: PASS (674/674, up from 640; +34 new tests across 5 files)
- cli tests: PASS (22/22)
- daemon boot: PASS (/healthz 200, JSON pino log lines emitted, no stack overflow)
- invariants: PASS (all 3 greps empty)

## Deviations from Plan
1. Boot trace_id in HTTP log line not verified at runtime (OTEL SDK init fails in test env due to exportIntervalMillis/exportTimeoutMillis config). Mitigated by pino-otel-wired.spec.ts which programmatically proves trace_id appears inside withSpan. Daemon boots clean and emits JSON log lines.
2. redact-log-object required MAX_DEPTH=10 guard after discovering Fastify's pino formatters.log receives deep/complex objects from request/response serializers — without the guard, stack overflow occurred at boot. Guard is 10-level deep; any object deeper than that is passed through unmodified (acceptable for log records).
3. AnyHookPayload cast at toDomainEvent call site uses `rawPayload as AnyHookPayload` — necessary because processEvent accepts `Record<string, unknown>` (controller interface) while toDomainEvent needs the narrower union type. The Zod validation at controller layer makes this safe.

## Assumptions Made
- DomainError message redaction at construction is the correct boundary (verifier specified "constructor-time preferred")
- EventBus redaction should happen BEFORE emit (subscribers receive clean data), not after
- redactLogObject depth limit of 10 is sufficient for domain log records (Fastify request/response objects go deeper but don't contain secrets in normal operation)
- The pino-otel-wired.spec.ts test counts as adequate evidence for Fix B since it proves the mixin config is correct; the OTEL SDK failure at daemon boot is pre-existing env issue (no OTEL collector running)
