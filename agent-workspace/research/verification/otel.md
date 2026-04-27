# Primitive Verification — OTEL End-to-End

**Date**: 2026-04-24
**Source**: Claude Code docs (Context7) + `reference-repos/claude-code-otel/` + `reference-repos/ccs/docs/`
**Verification method**: Spec read + docker-compose inspection. Live docker-compose-up deferred to Phase 3.

---

## Summary

Claude Code ships with OTEL telemetry built in. Enabling it is a matter of setting env vars in `.claude/settings.json`. No code changes to Claude Code, no plugin.

For Orch, the verification reduces to:
1. Confirm Claude Code emits spans when env is set → **YES** (documented by Anthropic + verified by ColeMurray/claude-code-otel ref repo)
2. Confirm a local OTLP endpoint can receive → **YES** (Langfuse, SigNoz, Jaeger, any OTLP collector works)
3. Confirm parent trace context (`TRACEPARENT`) propagates from orch → claude subprocess → claude's spans → **Standard W3C behavior** (see `headless-trace.md`)

---

## Claude Code Telemetry Env Vars

Required to enable:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",

    "OTEL_SERVICE_NAME": "claude-code",
    "OTEL_RESOURCE_ATTRIBUTES": "service.version=2.1,deployment.environment=dev",

    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_TRACES_EXPORTER": "otlp",

    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",

    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer <token-if-needed>"
  }
}
```

This is already set in the Orch project's own `.claude/settings.json`:
```
OTEL_SERVICE_NAME=claude-code-orch-builder
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

---

## What Spans Claude Code Emits

Per Anthropic docs + ColeMurray/claude-code-otel readme:

- **Root span per session**: `claude.session`
- **Per assistant turn**: `claude.turn`
- **Per tool call**: `claude.tool.<name>` (e.g. `claude.tool.Bash`, `claude.tool.Edit`)
- **Per API call**: `claude.api.messages` (includes input_tokens, output_tokens, cost)
- **MCP calls**: `claude.mcp.<server>.<tool>`

Attributes include:
- `claude.session_id`
- `claude.model` (e.g. "claude-opus-4-7")
- `claude.input_tokens`, `claude.output_tokens`, `claude.cache_read_tokens`, `claude.cache_creation_tokens`
- `claude.cost_usd`
- `claude.tool.result_size` / `claude.tool.error`

Orch's tracing module will create its own parent spans (`orch.session.run`, `orch.queue.item`, etc.) and Claude Code's spans will nest under those via TRACEPARENT propagation.

---

## Backend Options (for local self-hosted)

### Option A: Langfuse (default per ADR-005)

Pros: LLM-specific UI (sessions, generations, scores, costs). Built for Anthropic/OpenAI tracing patterns. Matches our "cost attribution is first-class" charter principle (O-3).

Cons: PostgreSQL dependency. Requires an OTEL Collector in front of it to accept OTLP (Langfuse ingests via HTTP POST, not native OTLP gRPC).

Minimal stack:
```
claude-code → OTEL Collector (localhost:4317)
                    ↓ (Langfuse exporter)
             Langfuse Server (localhost:3100)
                    ↓
             Postgres
```

### Option B: SigNoz

Pros: Native OTLP ingestion (no collector needed). Traces + metrics + logs in one UI. Open-source.

Cons: Heavier stack (ClickHouse). Less LLM-specific UI than Langfuse.

### Option C: Jaeger + Prometheus (minimal)

Pros: smallest footprint. Pure OTEL.
Cons: No LLM-specific UI, cost attribution requires dashboarding ourselves.

**Decision**: Default Langfuse. Support SigNoz via config toggle. Jaeger-only not offered (would fork the ADR).

---

## docker-compose Reference (from ColeMurray/claude-code-otel)

Will be copied into `docker/otel-stack/docker-compose.yaml` during Phase 3. Key services:

- `otel-collector` (port 4317 gRPC, 4318 HTTP) — receives from Claude Code, exports to Langfuse
- `langfuse-web` (port 3100) — UI
- `postgres` — Langfuse storage
- `clickhouse` (optional) — if SigNoz swap

Orch ships this as an optional bundle; users can BYO OTEL backend.

---

## Phase 1 vs Phase 3 Work Split

**Phase 1** (Core Daemon MVP):
- `packages/core/src/modules/tracing/` — OTEL SDK setup in the orch daemon
- Emit `orch.session.run`, `orch.queue.item`, `orch.hook.received` spans
- Propagate TRACEPARENT to spawned claude subprocess

**Phase 3** (Intelligence):
- docker-compose for Langfuse
- Cost aggregation queries
- Dashboard widgets pulling from trace data
- Session end categorization (rate_limit vs user_exit vs context_full) as trace attribute

---

## Assumptions Flagged

| Assumption | Phase | How to verify |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` accepts `http://` (not just https) on localhost | Phase 1 | Start otel-collector, run claude, check incoming spans |
| gRPC exporter works on Windows Git Bash environment | Phase 1 | Smoke test from this machine |
| Langfuse OTLP bridge captures `claude.cost_usd` attribute | Phase 3 | Inspect Langfuse UI after sample session |
| Cost attribution per-project works via `service.namespace` attribute | Phase 3 | Orch sets per-project namespace; verify in UI |

---

## Verdict

Primitive is spec-confirmed and backed by existing open-source reference (ColeMurray). No experimental validation needed before Phase 1 core daemon work begins. Actual docker-compose-up and UI verification pushed to Phase 3 where dashboards are built.
