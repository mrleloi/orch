# 004 — Context-Full Ingestion Mode

## Status
Decided 2026-04-25 (Phase 3 Task 3.1, sandwich-architect).

## Context
Charter goal F4 (`PROJECT_CHARTER.md` line 83) requires:
> "When OTEL span reports tokens > 230K, Orch gracefully ends current session and spawns next with handoff context."

Charter Principle 1 (`PROJECT_CHARTER.md` line 53):
> "Daemon is dumb, workers are smart. Orchestration logic is deterministic code. LLM reasoning is exclusively inside Claude Code sessions it spawns. The daemon does NOT call Anthropic API directly."

Charter Principle 10 (`PROJECT_CHARTER.md` line 71):
> "No feature creep into agent intelligence. Tempting to add 'smart routing', 'auto-planning', 'auto-review'. Resist. Those belong in Claude Code + project's own subagents."

Invariant I-1 (`agent-workspace/constitution/invariants.md` line 8):
> "The daemon (`@orch/core`) must NEVER call an LLM API directly."

Invariant I-15 (`agent-workspace/constitution/invariants.md` line 268):
> "Every LLM invocation (inside workers, via OTEL spans) must record `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read_tokens`, `gen_ai.request.model`, `project.id`. These come from Claude Code's native OTEL emission. Orch just propagates `TRACEPARENT` so they nest under Orch root span."

We must decide: **how does the ContextBudgetService observe per-span `gen_ai.usage.input_tokens` values flowing through the OTEL pipeline?** The detector must (a) react in time to fire at 200K warn / 230K force thresholds before the 250K cliff, (b) not break the existing OTLP exporter chain, (c) be deterministic and unit-testable.

## Options considered

### 1. Custom `SpanProcessor` registered in the OTEL provider chain

**Pros**
- Standard, documented OTEL extension point. Multiple SpanProcessors can be added to a `BasicTracerProvider` / `NodeTracerProvider` via `addSpanProcessor()` — they compose, the OTLP `BatchSpanProcessor` keeps doing its job in parallel.
- `onEnd(span)` fires synchronously in the same tick the span ends. Latency from token arrival → detector decision is sub-millisecond.
- Pure, deterministic: just inspect `span.attributes` for `gen_ai.usage.input_tokens` and `project.id`.
- Trivially testable with the upstream `InMemorySpanExporter` + a real `NodeTracerProvider`. No mocking.
- I-1 safe: zero LLM imports. We only read attributes already populated by Claude Code's own OTEL SDK (per I-15) and forwarded through hooks-receiver.

**Cons**
- Touches `tracing-bootstrap.ts` (and/or `tracing.module.ts`) — the SpanProcessor must be attached to the same `NodeTracerProvider` instance that bootstrap creates. Requires either exposing the provider, or constructing the SpanProcessor via DI and registering it in `tracing.module.ts:onModuleInit`.
- The `NodeSDK` shim (used in bootstrap) does not expose the underlying provider via a public API. We must use the documented escape: call `trace.getTracerProvider()` after `sdk.start()` returns, cast to `BasicTracerProvider`, and call `addSpanProcessor`. This is a known but slightly less ergonomic path than wiring the processor into the `NodeSDK` constructor. Acceptable; established pattern in the OTEL ecosystem.

### 2. Polling via OTLP exporter tail / span store query

**Pros**
- Decouples ContextBudgetService from the in-process tracer provider entirely.

**Cons**
- We do NOT run a span store inside the daemon. Polling implies either (a) writing every span to a SQLite buffer first, or (b) querying the downstream collector (Grafana LGTM) over HTTP. Both add dependencies that did not exist before and turn an in-process problem into a distributed one.
- Latency is gated by polling interval. If we poll every 5s we may be 5s late in firing `force_handoff` near the 230K cliff — not safe (token rate during heavy tool use is bursty).
- Adds a new failure mode: collector unreachable → detector blind → context-full undetected → 250K hard cap (charter R-1) breached.
- Violates Karpathy P2 (Simplicity First) — adds infra to solve an in-process problem.

### 3. EventBus hook from the existing OTEL module

**Pros**
- No tracer-internals access needed.

**Cons**
- The current `tracing` module does NOT emit per-span EventBus events. There is no such event channel in `event-channels.ts` (verified — only `project.*`, `queue.*`, `session.*`, `hook.*`, `runtime.*`, `rqueue.*`).
- To use this option we would first have to ADD a per-span emitter to `tracing.module.ts` — which is itself a SpanProcessor under the hood. So Option 3 collapses into Option 1 with extra indirection.
- Indirection cost (serialise span → emit → deserialise → check) buys nothing since the consumer (`ContextBudgetService`) is in-process anyway.

## Decision

**Choose Option 1: custom `ContextBudgetSpanProcessor`** that implements `SpanProcessor` and is registered against the provider in `tracing.module.ts:onModuleInit` (or wired in `tracing-bootstrap.ts` if the implementer determines DI ordering forces it earlier).

Reasons (charter-tied):
- **P1 (Think Before Coding)**: minimum code that solves F4. One processor class, one Map for state, one `addSpanProcessor` call.
- **P2 (Simplicity First)**: Option 1 is ~50 LOC + tests. Options 2 & 3 each add infra.
- **I-1 safe by construction**: the processor only READS attributes already present on the span. It never imports `@anthropic-ai/sdk`, `openai`, or any LLM client. Grep check `grep -rn "anthropic\|openai" packages/core/src/modules/context-budget/` MUST return zero in the implementer's gate.
- **I-15 alignment**: I-15 explicitly says token attributes come from Claude Code's native OTEL emission and Orch just propagates `TRACEPARENT`. Reading those same attributes back off the span is the symmetric, correct consumption path.
- **Determinism**: `SpanProcessor.onEnd` is synchronous. Threshold crossing is `if (total >= warnAt && !nearLimitFired) emit(...)`. No async race.

## Consequences

What this commits us to:
1. `packages/core/src/modules/context-budget/context-budget.span-processor.ts` will exist and implement the OTEL `SpanProcessor` interface (`onStart`, `onEnd`, `shutdown`, `forceFlush`).
2. `tracing-bootstrap.ts` will expose a hook (or `tracing.module.ts` will resolve the provider via `trace.getTracerProvider()`) so the new processor can be added without rewriting the bootstrap. Implementer Task 3.2 must NOT remove or shadow the existing `BatchSpanProcessor` — composition only.
3. The `BatchSpanProcessor` for OTLP export remains unchanged. Span flow on `onEnd`: `[ContextBudgetSpanProcessor.onEnd] → [BatchSpanProcessor.onEnd] → OTLP collector`. Both run; either order is fine since they don't communicate.
4. Tests use upstream `@opentelemetry/sdk-trace-base` `InMemorySpanExporter` + `NodeTracerProvider` directly — NOT the production bootstrap. This keeps unit tests fast and isolated (I-13).

How this can be revisited:
- If a future Codex/Gemini adapter emits token usage via a different attribute name, extend the processor's attribute key list rather than swapping ingestion mode. The mechanism still applies.
- If, in v2, multi-process orch becomes a goal, we may revisit toward a shared store. Not before.
- If the OTEL SDK changes the public contract of `addSpanProcessor`, the implementer must confirm the new path before touching production tracing.

## Cross-references
- Charter F4: `PROJECT_CHARTER.md:83`
- Charter Principle 1 (daemon dumb): `PROJECT_CHARTER.md:53`
- Charter Principle 10 (no agent-intel creep): `PROJECT_CHARTER.md:71`
- I-1: `agent-workspace/constitution/invariants.md:8`
- I-10: `agent-workspace/constitution/invariants.md:198`
- I-15: `agent-workspace/constitution/invariants.md:268`
- SYNTHESIS D6 (OTEL stack): `agent-workspace/research/SYNTHESIS.md:93`
- Existing tracing bootstrap: `packages/core/src/tracing-bootstrap.ts`
- Existing tracing module: `packages/core/src/modules/tracing/tracing.module.ts`
