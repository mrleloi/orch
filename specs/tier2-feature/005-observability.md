---
spec_id: SPEC-2026-04-24-T2-005
tier: 2
status: approved
version: 1.0
created: 2026-04-24
related_specs: [SPEC-2026-04-24-T1-001]
---

# SPEC T2-005: Observability & Tracing

# PART A — BUSINESS SPECIFICATION

## A.1 Context

Observability is a charter first-class concern, not bolt-on. Without traces, users cannot answer:
- "Which session cost the most tokens yesterday?"
- "Why did handoff trigger at 189K tokens instead of 230K?"
- "How long does a typical FOCUSED_IMPL session take?"
- "Did ccs failover happen at session X?"

## A.2 Approach

Claude Code emits rich OTEL traces natively. Orch:
1. Emits its own spans for daemon operations (queue pickup, spawn, state transitions)
2. Propagates `TRACEPARENT` to Claude Code so its spans nest under Orch root
3. Exports all traces via OTLP
4. Default backend: Langfuse (self-hosted). Alt: SigNoz, Honeycomb, any OTLP receiver.

## A.3 User Value

- Debug sessions end-to-end via one trace view
- Cost attribution per project, per day, per session-type
- Performance metrics (latency, throughput)
- Alerting on anomalies (cost spike, error rate)

---

# PART B — AGENT CONTRACT

## B.1 Span Hierarchy

Every queue item = one trace:

```
orch.queue_item (root)
  attrs: project.id, queue_item.id, session_type, priority
  ├── orch.handoff_build
  │     attrs: handoff.strategy, handoff.input_length, handoff.output_length
  ├── orch.session_spawn
  │     attrs: ccs_profile, runtime.adapter, pid
  │     events: cli_command_composed, process_started
  │     └── claude_code.interaction  (Claude Code native)
  │         attrs: gen_ai.request.model, gen_ai.usage.input_tokens, etc.
  │         ├── claude_code.tool (native)
  │         │     └── claude_code.tool.execution
  │         ├── claude_code.llm_request
  │         └── claude_code.hook (if detailed tracing)
  ├── orch.hook_received (N of these)
  │     attrs: hook.type, hook.session_id
  ├── orch.state_transition (M of these)
  │     attrs: from_state, to_state, trigger_event
  └── orch.session_end
        attrs: end_reason, tokens_total, duration_seconds
```

## B.2 Propagation

When spawning Claude Code subprocess:
```typescript
const traceparent = tracer.getCurrentTraceparent();
execa('ccs', args, {
  env: {
    ...process.env,
    TRACEPARENT: traceparent,
    OTEL_SERVICE_NAME: `claude-code.${project.name}`,
  },
});
```

Claude Code will read `TRACEPARENT` and nest its spans.

## B.3 Exporter Configuration

Env vars:
- `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4318`)
- `OTEL_EXPORTER_OTLP_PROTOCOL` (default `http/protobuf`)
- `OTEL_SERVICE_NAME` (default `orch`)
- `ORCH_OTEL_ENABLED` (default `true`)

If `ORCH_OTEL_ENABLED=false`, no spans emitted. OTEL is optional for degraded mode.

## B.4 Metrics

OpenTelemetry metrics (counter/gauge/histogram):

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `orch.queue.pending_count` | gauge | project | Items waiting |
| `orch.queue.enqueued_total` | counter | project, source | Total enqueues |
| `orch.queue.completed_total` | counter | project, session_type | Completions |
| `orch.queue.failed_total` | counter | project, reason | Failures |
| `orch.session.duration_seconds` | histogram | project, session_type | Session wall time |
| `orch.session.tokens_total` | counter | project, session_type | Tokens per session (from Claude Code OTEL, aggregated) |
| `orch.hook.received_total` | counter | project, hook_type | Hooks received |
| `orch.state_transition_total` | counter | project, from, to | State changes |
| `orch.budget.breached_total` | counter | project, type | Budget hits |
| `orch.rate_limit.detected_total` | counter | project | Rate limit events |

## B.5 Logs

Structured JSON via pino. Correlated via `trace_id` (auto-injected from OTEL context).

Log levels:
- `debug`: internal state changes, queue ops
- `info`: session lifecycle, hooks
- `warn`: recoverable failures, near-limit
- `error`: unrecoverable failures, adapter errors
- `fatal`: daemon must exit

Every log line has:
```json
{
  "level": "info",
  "msg": "Session started",
  "trace_id": "abc123",
  "project": "stockforge",
  "session_id": "sess_001",
  "ts": "2026-04-24T12:34:56Z"
}
```

## B.6 TracingService API

```typescript
class TracingService {
  // Start a new span. Returns handle and current traceparent.
  async withSpan<T>(
    name: string,
    attrs: Record<string, string | number | boolean>,
    fn: (span: Span) => Promise<T>
  ): Promise<T>;

  // Emit a span event (for markers within a span)
  addEvent(name: string, attrs?: Record<string, any>): void;

  // Get traceparent of active span (for subprocess propagation)
  getActiveTraceparent(): string | undefined;

  // Record metric
  incrementCounter(name: string, labels: Record<string, string>, value?: number): void;
  recordHistogram(name: string, labels: Record<string, string>, value: number): void;
  setGauge(name: string, labels: Record<string, string>, value: number): void;
}
```

## B.7 Shutdown

On daemon shutdown:
- Flush pending spans (await `sdk.shutdown()`)
- Ensure metrics exported
- Max wait 5 seconds; after that, exit anyway (don't hang)

## B.8 Backend Setup Reference

Docker compose snippet for Langfuse stack included in `docker/docker-compose.observability.yml`:
- Postgres (Langfuse DB)
- Langfuse web
- Langfuse worker
- OTEL collector (receives OTLP, forwards to Langfuse)

OTEL collector config sends:
- Traces → Langfuse via Langfuse OTLP receiver
- Metrics → Prometheus (optional, for Grafana)
- Logs → stdout (pino already handles logging)

## B.9 Tests

- Unit: TracingService wraps function calls correctly
- Unit: attributes set on spans
- Unit: traceparent format is W3C-compliant
- Integration: in-memory span exporter + assertion on hierarchy
- Integration: subprocess invocation sees TRACEPARENT in env
- Integration: metrics increment correctly

## B.10 Observability Dogfooding

The daemon MUST be observable enough that during development, you can debug any session end reason via traces alone. "I don't know why it failed, let me add more logs" = not enough. The goal is traces that preempt the need for ad-hoc logging.
