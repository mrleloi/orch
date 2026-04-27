# Decision 005 — Trace Backend Toggle (Task 3.9)

**Date**: 2026-04-25  
**Status**: IMPLEMENTED (call-site wiring closed in Task 3.9, 2026-04-26)  
**Task**: Phase 3 Task 3.9 — Langfuse Backend Toggle

---

## Problem

Orch operators use different tracing backends depending on their setup:
- Grafana LGTM / Tempo (Orch's default, via standard OTLP HTTP)
- Langfuse (LLM-native tracing, popular for AI/agent workflows)
- No remote export (offline dev / testing environments)

A single hardcoded OTLP endpoint works for Grafana but fails silently for Langfuse
(wrong auth) and wastes resources when no backend is running.

---

## Decision

Add `ORCH_TRACE_BACKEND` env var (zod enum `'otlp' | 'langfuse' | 'none'`, default `'otlp'`).
Branch the OTLP exporter factory at bootstrap time, not at daemon startup. Three branches:

1. **`otlp`** (default): unchanged behavior. `OTLPTraceExporter` → `OTEL_EXPORTER_OTLP_ENDPOINT`.
2. **`langfuse`**: `OTLPTraceExporter` → `LANGFUSE_OTLP_ENDPOINT` with HTTP Basic auth header
   `Authorization: Basic base64(<LANGFUSE_PUBLIC_KEY>:<LANGFUSE_SECRET_KEY>)`.
   The Langfuse OTLP ingest endpoint accepts standard OTLP HTTP with Basic auth.
   No `@langfuse/*` SDK dependency — same wire protocol, different URL + header.
3. **`none`**: No `traceExporter` passed to NodeSDK. SDK starts without remote exporter.
   In-process `SpanProcessor` pipeline (including `ContextBudgetSpanProcessor` from Task 3.2)
   still receives spans because it is added to the SDK's `BasicTracerProvider` directly.

---

## Langfuse Auth Scheme

Langfuse OTLP endpoint (`https://cloud.langfuse.com`, `https://us.cloud.langfuse.com`,
or self-hosted equivalent) authenticates via HTTP Basic auth:

```
Authorization: Basic base64(<LANGFUSE_PUBLIC_KEY>:<LANGFUSE_SECRET_KEY>)
```

Reference: https://langfuse.com/docs/opentelemetry/get-started

The `buildLangfuseAuthHeader(publicKey, secretKey)` helper in `tracing-bootstrap.ts`
encapsulates this encoding. It is exported so it can be tested in isolation.

The Langfuse trace deep-link path follows the same pattern as Grafana Tempo:
`${ORCH_TRACE_BACKEND_UI_URL}/trace/${traceId}`. (Langfuse UI uses `/trace/:id` on
their cloud product.) The URL pattern is identical to OTLP so no separate
`LANGFUSE_PROJECT_ID` env var is required at this time.

---

## Zod Conditional Refinement (I-10)

Langfuse credentials (`LANGFUSE_OTLP_ENDPOINT`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`)
are individually optional but required as a group when `ORCH_TRACE_BACKEND=langfuse`.

This constraint lives in the `envSchema` via `superRefine()` — not in runtime guards.
Violating it causes `validateEnv()` to throw at daemon startup with a clear error message,
which satisfies I-10 (typed external input validated at schema boundary).

---

## `none` Branch Safety

When `traceBackend='none'`, the NodeSDK is still started (required for in-process
`SpanProcessor` registration). The `ContextBudgetSpanProcessor` (Task 3.2) is added
to the SDK's underlying `BasicTracerProvider` in `TracingModule.onModuleInit`. This
registration is independent of whether a remote exporter is wired; the processor
calls its own callback on every `span.end()` regardless of export path.

Test `tracing-bootstrap.spec.ts` — "traceBackend=none — in-process SpanProcessor still
receives spans" — verifies this via a standalone `BasicTracerProvider` + `InMemorySpanExporter`.

---

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/config/env.schema.ts` | Added `ORCH_TRACE_BACKEND`, `LANGFUSE_*` vars + `superRefine` |
| `packages/core/src/tracing-bootstrap.ts` | Added `TraceBackend`, `buildLangfuseAuthHeader()`, branched exporter factory |
| `packages/core/src/modules/api/api.controller.ts` | Extended `ConfigResponse` + `getConfig()` with `traceBackend` |
| `packages/web-ui/src/api/client.ts` | Extended `ConfigResponseSchema` with `traceBackend` field |
| `packages/web-ui/src/pages/SessionDetailPage.tsx` | Branched trace deep-link by `traceBackend` |
| `packages/core/src/config/env.schema.spec.ts` | +7 tests for `ORCH_TRACE_BACKEND` validation |
| `packages/core/src/tracing-bootstrap.spec.ts` | +8 tests for auth helper + exporter factory |
| `packages/web-ui/src/pages/session-detail.spec.tsx` | +3 tests for trace URL branching |
| `packages/core/src/tracing-bootstrap-startup.ts` | Refactored: exported `readBootstrapOptsFromEnv()`, wired `ORCH_TRACE_BACKEND` + `LANGFUSE_*` through to factory call |
| `packages/core/src/tracing-bootstrap-startup.spec.ts` | +4 unit tests for env→opts mapping (all 3 backends + missing-keys throw) |
| `packages/core/src/__e2e__/trace-backend-bootstrap.integration.spec.ts` | +3 integration smoke tests (bootstrap+span+shutdown per backend) |

---

## 2026-04-26 — Startup-wiring closed (Task 3.9 narrow)

The factory `bootstrapTracing()` and `buildLangfuseAuthHeader()` were pre-landed in session
#19, but `tracing-bootstrap-startup.ts` never passed `ORCH_TRACE_BACKEND` / `LANGFUSE_*` env
vars through to the factory call site. The toggle was dormant: regardless of env value, the
daemon always used the `'otlp'` default branch.

This session (Task 3.9, sandwich-dev, 2026-04-26):
1. Extracted `readBootstrapOptsFromEnv(env, packageVersion)` as a pure exported function in
   `tracing-bootstrap-startup.ts` — reads all 5 env vars and returns `BootstrapTracingOpts`.
2. Replaced the inline opts literal at line 42-47 with `bootstrapTracing(readBootstrapOptsFromEnv(...))`.
3. Added 4 unit tests covering all 3 backends + missing-keys throw path.
4. Added 3 integration smoke tests (full bootstrap→span→shutdown lifecycle per backend).

R2 unchanged: `tracing-bootstrap-startup.ts` remains the first import in `main.ts` with no
NestJS dependencies added.

D2 acknowledged: bogus `ORCH_TRACE_BACKEND` value silently falls through to "no remote
exporter" at bootstrap time; `validateEnv()` crashes the daemon with a clear zod error
a few ms later. Acceptable two-step failure mode — documented in a 3-line comment.

---

## Alternatives Rejected

- **`@langfuse/langfuse-js` SDK**: Rejected per spec — adds a dependency for a problem
  already solvable with standard OTLP HTTP + auth header. Karpathy P2 (simplest solution).
- **Separate trace-link URL per backend**: Rejected — Langfuse and Grafana Tempo both use
  `/trace/:id` as the path, so one pattern suffices.
- **Runtime credential guard**: Rejected — I-10 requires validation at schema boundary.
  `superRefine` is cleaner and catches misconfiguration at daemon startup.
