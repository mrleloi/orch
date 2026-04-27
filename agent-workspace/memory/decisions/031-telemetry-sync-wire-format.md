---
id: 031
title: Telemetry sync wire format — opt-in NDJSON over HTTPS, OFF by default, OTLP-coexistent
status: ratified
date: 2026-04-27
phase: 8 (substage 8.0.3)
authoring_agent: master-planner (opus 4.7, /effort max, ORCH_SPAWNED, session #40)
authority: master plan §10 D-E + research output 8.0.2 §S4 (telemetry patterns)
addresses_questions: []
---

# Decision 031 — Telemetry sync wire format

## Context

Phase 8 Dimension 7 (user brief §1.7) names "telemetry collection sync to upstream" as a v2.3 deliverable: orch should be able to forward anonymized usage data to a future shared upstream endpoint, opt-in only, default OFF. SC-46 (master plan §1, line 32) requires "telemetry sync seam (opt-in, default OFF)" at `packages/core/src/telemetry/sync-seam.ts`.

Two pre-existing constraints frame the design space:

1. **Existing OTEL pipeline** (research 8.0.2 §S4 lines 116-121): orch already exports OTLP traces via `ORCH_OTEL_ENDPOINT` to local Jaeger/Prometheus. Spans `orch.session`, `orch.task`, `orch.worker.spawn` are stable. The new sync must not duplicate or replace this; it must coexist as an orthogonal opt-in upstream forward.

2. **Privacy and ethics** (research 8.0.2 §S4 line 23 reject pattern: "Telemetry opt-out default — for community OSS, opt-in is the only ethical default"): the wire format must:
   - Default OFF.
   - Opt-in via single env var or single config setting.
   - Transmit zero PII (no project names, no file paths, no source code, no prompt text).
   - Hash all session-id-style identifiers.
   - Be auditable — user can `dry-run` to see exactly what would be sent.

Master plan §10 D-E (line 271-272) pre-bound the wire format: "JSONL over HTTPS POST; endpoint = stub URL in v2.3 (real endpoint = v2.4)". This decision formalizes the schema, sink interface, sampling policy, and OTEL coexistence rules.

Research output 8.0.2 §S4 (lines 108-136) surveyed Claude Code's own telemetry approach (opt-in via `CLAUDE_CODE_ENABLE_TELEMETRY=1`; OTLP) and proposed orch reuse OTLP/JSON. Master plan diverges from 8.0.2's OTLP/JSON proposal in favor of NDJSON (newline-delimited JSON) for simpler hand-rollable sinks. This decision documents the divergence.

## Options considered

### Option A — Reuse OTLP/JSON pipeline; add upstream-sink target (research 8.0.2 §S6 R-5)

Pros:
- Zero new wire-format code; OTLP exporter already exists.
- Strong schema enforcement (OTLP protobuf + JSON binding).
- Compatible with industry OTEL collectors → free third-party tooling.

Cons:
- OTLP/JSON requires the upstream endpoint to speak OTLP — limits upstream sink choice (no plain HTTP-collector with custom schema).
- OTLP semantics are span-centric; community-sync upstream may want non-span events (e.g., a "task-completion summary" rolled up over 1 hour). Forcing those into spans is awkward.
- Project-id / file-path redaction requires custom OTLP processor; redaction rules diverge from local OTLP's needs (local Jaeger keeps file paths; upstream MUST strip them).
- OTLP-only forces the v2.4 real endpoint to commit to OTLP; pluggable-sink (master plan §10 D-E "pluggable" implied) becomes harder.

REJECTED. Coupling sync to OTLP narrows future endpoint choice.

### Option B — Hand-rolled NDJSON over HTTPS POST; orthogonal to OTEL; pluggable sink interface

Pros:
- NDJSON is the simplest possible wire format. One JSON event per line; HTTP POST batches multiple lines as the body. Trivially parseable by any collector.
- Pluggable `ITelemetrySink` interface (master plan §10 D-E "pluggable") → community can swap in custom sinks (PostHog, Mixpanel, ClickHouse, file-write for testing) without touching orch core.
- Schema can carry both span-shaped events (for trace replay) and aggregate events (rollup summaries) in one stream. Full flexibility.
- Coexists with OTEL — the OTLP local pipeline keeps full file-path detail; the upstream NDJSON sink is the redacted opt-in mirror.
- Auditable dry-run: print the NDJSON to stdout instead of POSTing. Simple.
- Aligns with master plan §10 D-E pre-bound default ("JSONL over HTTPS POST").

Cons:
- Slight wire-format authoring cost (~100 LOC for the sink + schema + tests in 8.7.3).
- Two pipelines to reason about (OTEL local + NDJSON upstream). Mitigated by clear architectural seam: OTEL = always-on local; NDJSON = opt-in upstream-only.

ACCEPTED. Master plan §10 D-E default; pluggable; OTEL-coexistent.

### Option C — Telemetry sync via project's existing OTEL collector (no separate orch sink)

Pros:
- Zero orch code; user configures their own OTEL collector to forward.

Cons:
- Forces every user to run an OTEL collector before opting in. High friction; fails the "low-friction opt-in" goal.
- No anonymization layer in orch; user is responsible for redaction. PII leak risk.
- Not pluggable to non-OTEL backends.

REJECTED. Friction too high; PII risk unacceptable.

## Choice

**Option B — NDJSON over HTTPS POST; pluggable sink; opt-in default OFF; orthogonal to OTEL.**

### Default state

- **OFF by default**. Opt-in only.
- Two opt-in paths (either suffices):
  - Env var: `ORCH_TELEMETRY_SYNC=true`
  - User-scope config file: `~/.orch/telemetry.json` with `{"enabled": true}` (per Decision 029, telemetry config is user-scope only — never project-scope; prevents accidental commits exposing other users).
- Project-scope config (`<project>/.orch/profile.yaml`) MUST NOT carry `telemetry.enabled` — schema rejects it. This is per Decision 029 §"Cross-tenant isolation" cross-reference.

### Wire format

**NDJSON** (newline-delimited JSON) over HTTPS POST. Body example:

```ndjson
{"ts":"2026-04-27T10:00:00.000Z","project_id_hash":"a3f5...","event_type":"orch.task.completed","payload":{"task_type":"FOCUSED_IMPL","tokens_in":12345,"tokens_out":6789,"retry_count":0,"phase":"8","substage":"8.0.3"}}
{"ts":"2026-04-27T10:01:00.000Z","project_id_hash":"a3f5...","event_type":"orch.session.windown","payload":{"trigger":"real_transcript_200K","model":"opus"}}
```

Each line is one event. Server consumes line-by-line. Atomic per-line; partial-batch failure does not corrupt others.

### Endpoint

- Stub URL in v2.3: `https://telemetry.orch.local/v1/events` (does not resolve; placeholder).
- Override via env var: `ORCH_TELEMETRY_ENDPOINT=https://my-collector/path`.
- Real upstream endpoint = v2.4 deliverable (master plan §10 D-E "real endpoint = v2.4").
- Default behavior with no override: log "telemetry sync OFF — no endpoint configured" and proceed (do not crash).

### Event schema (v1 envelope)

```typescript
interface TelemetryEvent {
  ts: string;                 // ISO8601 UTC timestamp
  project_id_hash: string;    // SHA-256 of project absolute path; never the path itself
  event_type: string;         // dotted: orch.session.start | orch.task.completed | etc.
  payload: Record<string, unknown>;  // event-specific; MUST NOT contain PII (see redaction rules)
  // Optional:
  schema_version?: number;    // default 1
  user_id_hash?: string;      // SHA-256 of ORCH_USER_ID (opt-in additionally; default omitted for max privacy)
}
```

Redaction rules (enforced by `sanitize(event)` before sink call):
- NO file paths (absolute or relative).
- NO project names (use `project_id_hash` only).
- NO source code or diff content.
- NO prompt text.
- NO model output text.
- NO token-string content (just counts).
- NO user-name or email (use optional `user_id_hash` if both env vars set).
- IDs (session_id, task_id, trace_id) must be hashed (SHA-256 truncated to 16 hex chars).

### Pluggable sink interface

```typescript
export interface ITelemetrySink {
  send(events: TelemetryEvent[]): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
```

Built-in implementations (in `packages/core/src/telemetry/sinks/`):
- `HttpsNdjsonSink` — default; POSTs NDJSON to `ORCH_TELEMETRY_ENDPOINT`.
- `StdoutDryRunSink` — writes NDJSON to stdout for audit (`ORCH_TELEMETRY_DRY_RUN=true`).
- `NullSink` — discards events; default when sync OFF.

Community sinks register via `packages/core/src/telemetry/registry.ts`; configured by `~/.orch/telemetry.json` `sink: "https-ndjson" | "stdout-dry-run" | "<custom-name>"`.

### Sampling / batching policy

- Max 100 events / minute per project_id_hash. Excess silently dropped; counter logged locally.
- Max 5 MB per HTTP POST body. Split into multiple POSTs if exceeded.
- Batch interval: 30 seconds (events accumulate in memory; POST every 30s OR on `close()`).
- Exponential backoff on 5xx: 1s, 2s, 4s, 8s, 16s; max 5 retries; then drop the batch with local log.
- 4xx response: drop batch immediately, log error (4xx = our request was wrong; retrying won't help).
- 200/202/204 response: success.

### Privacy guarantee

The opt-in user can verify exactly what is sent via:
- `orch telemetry preview --since=1h` — outputs the NDJSON that WOULD be sent (uses `StdoutDryRunSink`).
- `orch telemetry log` — shows recent send activity (timestamp, event count, response code).
- `~/.orch/telemetry.json` carries an explicit `redact_check: true` flag enforced at startup; if any sanitize() call would emit PII, the call throws and is logged locally.

No data leaves the local machine without:
1. `ORCH_TELEMETRY_SYNC=true` OR `~/.orch/telemetry.json` `enabled: true`, AND
2. A reachable endpoint (no silent failure mode that secretly buffers data for later).

### OTEL coexistence

| Pipeline | Trigger | Endpoint | Schema | Always-on? |
|---|---|---|---|---|
| Local OTEL | always | `ORCH_OTEL_ENDPOINT` (default local Jaeger) | OTLP/protobuf | YES; private |
| Upstream sync | opt-in | `ORCH_TELEMETRY_ENDPOINT` | NDJSON | NO; default OFF |

The two pipelines are **orthogonal**. Local OTEL keeps full detail (file paths, prompt summaries, span-tree); upstream sync transmits only redacted aggregated events. Implementation: a `TelemetrySyncBridge` reads from the local OTEL processor's output, applies `sanitize()`, and forwards to the configured `ITelemetrySink`. The bridge is itself opt-in; if disabled, the local OTEL pipeline is unaffected.

This satisfies SC-46 "telemetry sync seam" (master plan §1 line 32) without rewriting the OTEL pipeline.

## Why (Charter rules + Karpathy + Master plan §10)

- **Charter §"Observability from day one"** (Principle 7, line 65): "Every session is a trace ... cost attribution is a first-class concern". Local OTEL satisfies this. Upstream sync is the optional community-aggregation layer ON TOP, not a replacement.
- **Charter §"Stakeholders"** (line 124-128): "Future team / consumers of the npm packages" — opt-in upstream sync lets community contribute aggregate-level signal (e.g., "task X fails 30% of the time across 50 users") without exposing individual users' work.
- **Charter §"Reusable without forking"** (Principle 8, line 67): pluggable `ITelemetrySink` lets community swap sinks without forking.
- **Charter line 116** ("Not a multi-tenant system"): user-scope-only opt-in matches Decision 029's user-scope rule. Project-scope telemetry-enable is rejected.
- **Karpathy P2 (Simplicity First)**: NDJSON is the simplest possible wire format. One event per line; one HTTP POST; pluggable sink. No protobuf; no streaming-grpc; no schema-registry.
- **Karpathy P3 (Surgical Changes)**: orthogonal-to-OTEL design touches no existing OTEL code; new code lives in `packages/core/src/telemetry/sync-seam.ts` + `sinks/`.
- **Master plan §10 D-E** (line 271-272): pre-bound default = "JSONL over HTTPS POST; endpoint = stub URL in v2.3". This decision concretizes the schema, sampling, sink interface.
- **Research output 8.0.2 §S4 line 110-114**: "Claude Code official ... opt-in via CLAUDE_CODE_ENABLE_TELEMETRY=1; wire format internal Anthropic sink" — orch follows the env-var-opt-in pattern but uses public NDJSON instead of internal-only sink.
- **Research output 8.0.2 §S4 line 23 (reject)**: "Telemetry opt-out default — for community OSS, opt-in is the only ethical default" — binding; we adopt opt-in.
- **Research output 8.0.2 §S4 line 122-131** (proposed orch design): "upstream_sync: true in ~/.orch/settings.yaml; HTTPS POST to orch-telemetry endpoint; redact: project names, file names, prompt text; hash: session IDs" — adopted with detail extension (NDJSON wire format chosen over OTLP/JSON, divergence documented).
- **Research output 8.0.2 §S6 R-10 line 222-224**: "Workflow events only, no content. Upstream schema: { task_type, outcome, tokens_input, tokens_output, retry_count, phase, substage }" — adopted as v1 payload schema.

### Divergence from research recommendation R-5 (8.0.2 line 192-194)

R-5 proposed reusing the existing OTEL pipeline as the sync wire (OTLP/JSON over HTTPS). This decision adopts NDJSON instead because:
1. Pluggability (master plan §10 D-E "pluggable") requires sink swap without OTLP-protocol coupling.
2. Aggregate events (rollup summaries) are awkward to model as OTEL spans.
3. Endpoint flexibility — v2.4 real endpoint may not be OTLP-compliant.
4. Master plan §10 D-E pre-bound JSONL over HTTPS POST as the wire format; this decision honors that pre-binding.

The local-OTEL pipeline remains unchanged; only the upstream sync uses NDJSON.

## Consequences (binding)

1. **Default state OFF**. Daemon startup logs `telemetry sync: disabled (set ORCH_TELEMETRY_SYNC=true to enable)` if neither opt-in path is set.
2. **`ORCH_TELEMETRY_SYNC=true` and `~/.orch/telemetry.json` `enabled: true`** are the only opt-in paths. Project-scope opt-in REJECTED at config-parse time.
3. **NDJSON wire format**; one event per line; HTTPS POST. Endpoint stub `https://telemetry.orch.local/v1/events`; override via `ORCH_TELEMETRY_ENDPOINT`.
4. **`ITelemetrySink` interface in `packages/core/src/telemetry/sync-seam.ts`** (master plan §1 line 32; substage 8.7.3 line 152). Built-in sinks: HttpsNdjsonSink, StdoutDryRunSink, NullSink. Community-pluggable.
5. **Schema v1**: `{ts, project_id_hash, event_type, payload}`. `payload` carries workflow event fields per 8.0.2 R-10. Schema versioning via optional `schema_version` field.
6. **Redaction enforced by `sanitize()`**: throws on PII detection; tested in 8.7.3 unit tests with 5+ adversarial PII payloads.
7. **Sampling**: 100 events/min/project; 5 MB/POST max; 30s batch; exponential backoff 5xx; drop on 4xx.
8. **Privacy commands**: `orch telemetry preview` and `orch telemetry log` shipped in v2.3. User can audit before opt-in.
9. **Project_id_hash = SHA-256 of project abs path** (16 hex chars). User_id_hash = SHA-256 of `ORCH_USER_ID` (16 hex chars), opt-in via `~/.orch/telemetry.json` `include_user_hash: true`; default omitted for max privacy.
10. **OTEL pipeline unchanged**. Local OTEL keeps full detail; upstream sync is orthogonal redacted bridge. `TelemetrySyncBridge` reads OTEL processor output, applies sanitize(), forwards to sink.
11. **Real upstream endpoint = v2.4 deliverable**. v2.3 stub URL does not resolve; user-overridable. Local-only sinks (StdoutDryRunSink) usable in v2.3 for community testing.
12. **Decision 029 cross-binding**: telemetry config is user-scope only; project-scope opt-in is a config-parse error. Aligns with tenancy isolation.
13. **8.7.3 implementation budget**: ~150-200 LOC seam + 2 built-in sinks + sanitize() + 8 unit tests (master plan §11 effort matrix line 309 = sonnet/medium).
14. **No data leaves machine without explicit opt-in** — NullSink is the default; sync requires both env-var/config opt-in AND a configured endpoint.

## Cross-references

- Master plan §10 D-E (line 271-272)
- Master plan §1 SC-46 (line 32), §3 substage 8.7 (lines 146-156), §11 effort matrix (line 309)
- Research output `agent-workspace/research/phase-8-oss-config-patterns.md` §S4 (lines 108-136), §S6 R-5 (lines 192-194), R-10 (lines 222-224), §S2 reject pattern (line 23)
- Decision 027 (Phase 8 strategic redirect — DIM 7 mandate; Consequence 8 telemetry seam landing in v2.3)
- Decision 028 (config-style normative format — `~/.orch/telemetry.json` follows the schema)
- Decision 029 (tenancy file-level — user-scope only binding; cross-binds this decision's scope-rule)
- Decision 030 (LICENSE MIT — community-fork-friendliness motivates pluggable sink)
- Charter Principle 7 (Observability from day one, line 65)
- Charter Principle 8 (Reusable without forking, line 67)
- Charter §"Stakeholders" (lines 124-128)
- Karpathy P2/P3 (CLAUDE.md Core Principles)

**END Decision 031.**
