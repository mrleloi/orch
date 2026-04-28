# otel-tracing self-test

## Trigger

Editing `packages/core/src/modules/tracing/**`; OR creating spans, recording
metrics, propagating TRACEPARENT, reading/writing OTEL env vars; OR user
mentions Langfuse, SigNoz, OTLP, or trace export.

## Expected behavior (PASS)

Skill activates and `withSpan` helper is used (auto-end via try/finally).
Subprocess spawns include `TRACEPARENT`, `OTEL_SERVICE_NAME`, and
`CLAUDE_CODE_ENABLE_TELEMETRY` env vars. Span attributes use canonical
`gen_ai.usage.*` names. NO prompts or secrets recorded as attributes.

## Named failure modes

- F1: span created without `withSpan` — manual `startSpan` without matching
  `end()` causes a memory leak (Anti-Pattern #1)
- F2: subprocess spawn omits `TRACEPARENT`, `OTEL_SERVICE_NAME`, or
  `CLAUDE_CODE_ENABLE_TELEMETRY` env vars — breaks trace propagation
  (Anti-Pattern #2)
- F3: prompt or secret recorded as a span attribute — leaks secrets to the
  trace backend (Anti-Pattern #3)

## Metrics

- activation_count_per_session: 0-3
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. `grep -rn "tracer.startSpan" packages/core/src/` count MUST equal
   `grep -rn "span.end()" packages/core/src/` count (or both zero —
   `withSpan` is the preferred pattern and leaves no unmatched calls).
2. Every `execa(...)` call in `packages/core/src/` whose target is `claude`
   or `ccs` MUST have `TRACEPARENT` in its env literal (verify with a
   multiline grep across the spawn block).
3. NO `span.setAttribute(` call in `packages/core/src/` includes `prompt`
   or `token` as an attribute key — secret-redaction grep must return zero
   matches.
