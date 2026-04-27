# Configuration Reference

Complete configuration reference for the Orch daemon.

Orch is configured through three surfaces: environment variables (daemon process),
`~/.orch/config.yaml` (daemon home), and `.orch/profile.yaml` (per-managed-project).
All inputs are validated with zod at startup — the daemon refuses to boot on invalid config.

---

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Daemon Home: `~/.orch/config.yaml`](#daemon-home-orchconfigyaml)
3. [Profile Schema: `.orch/profile.yaml`](#profile-schema-orchprofileyaml)
4. [Hook Event Payload Schemas](#hook-event-payload-schemas)
5. [REST API Reference](#rest-api-reference)
6. [SSE Event Reference](#sse-event-reference)
7. [Why `ApiController` doesn't inject `ConfigService`](#why-apicontroller-doesnt-inject-configservice)
8. [Cross-References](#cross-references)

---

## Environment Variables

All `ORCH_*` variables are validated at daemon startup via `validateEnv` in
`packages/core/src/config/env.schema.ts`. The daemon throws on startup if a
required variable is missing or fails its type check.

### Daemon Core

| Variable | Default | Type | Description |
|---|---|---|---|
| `ORCH_HOOK_SECRET` | _(required)_ | `string` (min 1 char) | Shared secret for `/hooks/*` authentication. Sent by Claude Code as `X-Orch-Hook-Secret` header. Must match on every hook POST or the request is rejected 401. |
| `ORCH_API_BEARER_TOKEN` | _(required)_ | `string` (min 1 char) | Bearer token for `/api/v1/*` authentication. Clients send `Authorization: Bearer <token>`. |
| `ORCH_HTTP_PORT` | `4141` | `number` (positive int) | TCP port the HTTP server listens on. |
| `ORCH_HTTP_HOST` | `127.0.0.1` | `string` | Bind address. Default is loopback-only (I-7). Change to `0.0.0.0` only in trusted private networks. |
| `ORCH_HOME` | `~/.orch` | `string` | Daemon home directory. Contains `config.yaml`, `projects/`, and SQLite database. |
| `ORCH_LOG_LEVEL` | `info` | `enum` | Pino log level. One of: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |

### Tracing / OTEL

| Variable | Default | Type | Description |
|---|---|---|---|
| `ORCH_TRACE_BACKEND` | `otlp` | `enum` | Active trace exporter. `otlp` sends spans to `OTEL_EXPORTER_OTLP_ENDPOINT` (Grafana LGTM). `langfuse` sends to Langfuse via OTLP with Basic auth. `none` disables export (in-process processors such as `ContextBudgetSpanProcessor` still run). |
| `ORCH_TRACE_BACKEND_UI_URL` | `""` | `string` | URL of the trace backend UI (e.g. `http://localhost:3000`). Exposed via `GET /api/v1/config` so the Web UI can build trace deep-links. Empty string disables trace links. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(none)_ | `string` (URL) | OTLP HTTP collector endpoint. Required when `ORCH_TRACE_BACKEND=otlp`. Default for most Grafana LGTM stacks: `http://127.0.0.1:4318`. Connect failures are warn-only — they do not crash the daemon. |
| `OTEL_SERVICE_NAME` | `orch` | `string` | OpenTelemetry service name written to all spans. Override when running multiple Orch instances. |
| `OTEL_METRICS_EXPORTER` | _(auto-set)_ | `string` | Metrics exporter selector. At bootstrap, Orch forces this to `none` if it is unset or set to `otlp` — the OTEL metrics exporter is disabled to prevent a hang on the OTLP endpoint before the tracing SDK starts. Pre-set to a non-`otlp` value (e.g. `console`) to override. Source: `tracing-bootstrap.ts`. |

### Langfuse (conditional)

The following three variables are **required as a group** when `ORCH_TRACE_BACKEND=langfuse`.
The constraint is enforced by a zod `superRefine` in `env.schema.ts` — no separate runtime
guard is needed.

| Variable | Default | Type | Description |
|---|---|---|---|
| `LANGFUSE_OTLP_ENDPOINT` | _(none)_ | `string` (URL) | Langfuse OTLP ingest URL. Required when `ORCH_TRACE_BACKEND=langfuse`. |
| `LANGFUSE_PUBLIC_KEY` | _(none)_ | `string` | Langfuse project public key. Required when `ORCH_TRACE_BACKEND=langfuse`. |
| `LANGFUSE_SECRET_KEY` | _(none)_ | `string` | Langfuse project secret key. Required when `ORCH_TRACE_BACKEND=langfuse`. |

### Development / Test Only

These variables are **not validated by `envSchema`** and have no effect in production.

| Variable | Default | Description |
|---|---|---|
| `ORCH_DEBUG_SESSION_KEYS` | _(unset)_ | Set to `1` to bypass session-key redaction. Never set in production. Source: `session-key-redactor.ts`. |
| `ORCH_SKIP_INTEGRATION` | _(unset)_ | Set to `1` to skip integration tests that require a live `ccs` binary. Set automatically in CI. |
| `ORCH_TEST_PROFILE` | `default` | ccs profile name used by integration test suite when `ORCH_SKIP_INTEGRATION` is not set. |

---

## Daemon Home: `~/.orch/config.yaml`

The daemon home directory (`ORCH_HOME`, default `~/.orch`) contains:

```
~/.orch/
  config.yaml          # optional global daemon config (future use)
  projects/            # one YAML file per managed project
    my-project.yaml    # -> .orch/profile.yaml schema (see next section)
  orch.db              # SQLite database (Prisma-managed)
```

`config.yaml` at the top level is reserved for future global daemon settings.
As of v1.0, all configuration is done via environment variables and per-project
profile files. The daemon does not read `~/.orch/config.yaml` at boot — this
file path is documented for forward compatibility.

Per-project profiles are loaded from `~/.orch/projects/*.yaml`. Each file is
parsed against the `ProfileSchema` (see below). The daemon re-scans this directory
on `POST /admin/reload`.

---

## Profile Schema: `.orch/profile.yaml`

Schema source: `packages/core/src/domain/profile.ts` (`ProfileSchema`).
All fields are zod-validated when the profile is loaded. Parse failures surface
as `ProfileValidationError` and prevent the project from being registered.

### Identity

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectId` | `string` | yes | — | Unique project identifier within Orch. Must match `/^[a-z0-9-]+$/` (lowercase alphanumeric with hyphens). Used as the first segment of session keys and in all log/trace attributes. |
| `rootPath` | `string` | yes | — | Absolute path to the managed project root. Orch resolves plan file paths relative to this directory. |
| `ccsProfile` | `string` | yes | — | Name of the `ccs` profile to use when spawning sessions. Maps to a Claude Code account configured in `ccs`. |

### Session Types

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `sessionTypes` | `SessionType[]` | yes (min 1) | — | One or more session type definitions. Each type maps to a class of work items (e.g. `impl`, `review`, `debug`). |

Each `SessionType` object:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | `string` | yes | — | Unique name within this project. Used in session keys. |
| `promptTemplate` | `string` | yes | — | Prompt passed to `claude -p`. May contain `{{plan}}` placeholder which is replaced with the plan file content at dispatch time. |
| `model` | `string` | no | _(ccs default)_ | Optional model override (e.g. `claude-opus-4-5`). If omitted, the ccs account default is used. |
| `maxConcurrent` | `number` (int ≥ 1) | no | `1` | Maximum concurrent sessions of this type. |

### Queue Sources

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `queueSources` | `QueueSource[]` | no | `[]` | Directories to watch for incoming plan files. If empty, Orch watches `{rootPath}/session-plans/pending` by default. |

Each `QueueSource` object:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | `string` | yes | — | Absolute or `~`-prefixed path to the directory to watch. |
| `glob` | `string` | no | `*.md` | Glob pattern for plan files within the directory. |

### Hook Targets

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `hookTargets` | `HookTarget[]` | no | `[]` | Hook targets to register in the managed project's `.claude/settings.json`. If empty, Orch does not receive real-time hook events (pull-mode only). |

Each `HookTarget` object:

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `event` | `string` | yes | — | Claude Code hook event name (e.g. `SessionStart`, `Stop`, `SubagentStop`). |
| `url` | `string` (URL) | yes | — | Full URL for the hook POST. Typically `http://127.0.0.1:4141/hooks/{event}`. |

### Concurrency and Flags

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxConcurrentSessions` | `number` (int ≥ 1) | no | `1` | Maximum concurrent active sessions across all session types for this project. Per-type limit is `sessionTypes[*].maxConcurrent`. |
| `langfuseEnabled` | `boolean` | no | `false` | Enable Langfuse as the OTEL backend for this project. Requires `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` env vars to be set. |
| `disableSecretRedaction` | `boolean` | no | `false` | Disable secret redaction on outbound text. DANGER: only disable in fully-trusted, air-gapped environments. |

### Context Budget

Controls when Orch signals a session to hand off due to token exhaustion (charter F4).

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `contextBudget.warnAtTokens` | `number` (int > 0) | no | `200000` | Token count at which Orch emits `session.context_near_limit`. Must be strictly less than `forceHandoffAtTokens`. |
| `contextBudget.forceHandoffAtTokens` | `number` (int > 0) | no | `230000` | Token count at which Orch emits `session.force_handoff` and begins graceful session termination. |

### Graceful Session End

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `autoHandoff` | `boolean` | no | `false` | When `true`, Orch immediately initiates graceful session termination on `session.forceHandoff` without operator confirmation. When `false`, Orch emits `session.handoff_pending` and waits for operator confirmation via Telegram or Web UI. Setting `true` is pre-authorization via profile config (I-6 satisfied at profile-load time). |
| `gracefulEndTimeoutMs` | `number` (int ≥ 1000) | no | `30000` | Milliseconds to wait for the `SessionEnd` hook after writing the graceful-end slash-command. If the hook does not fire in time, Orch escalates to SIGTERM (5 s wait) then SIGKILL. |
| `commands.sessionEnd` | `string` | no | _(none)_ | Slash-command written to the Claude Code subprocess stdin on `session.forceHandoff`. Example: `/session-end`. If absent, Orch skips the stdin write and waits for the hook or timeout directly. |

### Cron Scheduler

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `cron` | `Record<string, string>` | no | `{}` | Cron-driven plan enqueue map. Keys are unique cron names (lowercase URL-safe, regex `/^[a-z0-9][a-z0-9-]*$/`). Values are five-field cron expressions (node-cron format: `m h dom mon dow`). The cron name is also the plan filename stem — cron name `daily-signals` enqueues `{rootPath}/session-plans/pending/daily-signals.md`. Malformed expressions are rejected at parse time. |

### Complete Profile Example

```yaml
# .orch/profile.yaml (or ~/.orch/projects/my-project.yaml)

projectId: my-project
rootPath: /home/user/projects/my-project
ccsProfile: default

sessionTypes:
  - name: impl
    promptTemplate: |
      Execute the session plan at {{plan}}.
      Follow all instructions in CLAUDE.md.
    model: claude-sonnet-4-5
    maxConcurrent: 1
  - name: review
    promptTemplate: |
      Review the changes described in {{plan}}.
    maxConcurrent: 2

queueSources:
  - path: /home/user/projects/my-project/session-plans/pending
    glob: "*.md"

hookTargets:
  - event: SessionStart
    url: http://127.0.0.1:4141/hooks/SessionStart
  - event: Stop
    url: http://127.0.0.1:4141/hooks/Stop
  - event: SubagentStop
    url: http://127.0.0.1:4141/hooks/SubagentStop
  - event: PostToolUse
    url: http://127.0.0.1:4141/hooks/PostToolUse

maxConcurrentSessions: 1

contextBudget:
  warnAtTokens: 200000
  forceHandoffAtTokens: 230000

autoHandoff: false
gracefulEndTimeoutMs: 30000

commands:
  sessionEnd: /session-end

cron:
  daily-signals: "0 9 * * *"
  hourly-watch: "0 * * * *"
```

---

## Hook Event Payload Schemas

Orch receives hook events from Claude Code via `POST /hooks/:event`. Each event
type has its own zod schema. Schema source:
`packages/core/src/modules/hooks/schemas/hook-event.schema.ts`.

All payloads share a common base:

```json
{
  "session_id": "string (min 1)",
  "timestamp": "string (ISO-8601, optional)"
}
```

Unknown fields are stripped (zod strip mode). Auth: `X-Orch-Hook-Secret` header
must match `ORCH_HOOK_SECRET`.

### SessionStart

Fires when Claude Code starts or resumes a session.

```json
{
  "session_id": "abc-123",
  "timestamp": "2026-04-25T09:00:00Z",
  "claude_session_id": "string (optional)",
  "model": "string (optional)",
  "source": "startup | resume | clear | compact (optional)"
}
```

### PreToolUse

Fires before Claude Code executes a tool call.

```json
{
  "session_id": "abc-123",
  "tool_name": "Bash",
  "tool_input": { "key": "value" },
  "is_agent": false
}
```

### PostToolUse

Fires after Claude Code executes a tool call. The `tool_output` field contains
the raw tool result — OTEL span attributes extracted here drive the
`ContextBudgetService` token accumulator.

```json
{
  "session_id": "abc-123",
  "tool_name": "Bash",
  "tool_output": "...",
  "is_agent": false
}
```

### UserPromptSubmit

Fires when the user submits a prompt to Claude Code.

```json
{
  "session_id": "abc-123",
  "prompt": "string (the submitted prompt text)"
}
```

### Notification

Fires for daemon-level notifications from Claude Code.

```json
{
  "session_id": "abc-123",
  "message": "string",
  "metadata": { "key": "value" }
}
```

### Stop

Fires when Claude Code stops (normal or error).

```json
{
  "session_id": "abc-123",
  "is_error": false,
  "stop_reason": "string (optional)"
}
```

### SessionEnd

Fires when the Claude Code session ends. Orch uses this to transition the session
to a terminal state and trigger any pending handoff.

```json
{
  "session_id": "abc-123",
  "end_reason": "string (optional)"
}
```

### SubagentStop

Fires when a subagent (spawned task) stops within a Claude Code session.

```json
{
  "session_id": "abc-123",
  "subagent_id": "string (min 1)",
  "is_error": false
}
```

### PreCompact

Fires before Claude Code compacts the conversation context.

```json
{
  "session_id": "abc-123",
  "compact_uuid": "string (UUID for dedup)",
  "summary": "string (optional)"
}
```

### PostCompact

Fires after Claude Code completes context compaction.

```json
{
  "session_id": "abc-123",
  "compact_uuid": "string (matches paired PreCompact)"
}
```

### ApiError

Fires when Claude Code encounters an API error.

```json
{
  "session_id": "abc-123",
  "error_type": "string",
  "error_message": "string",
  "retry_after_secs": 60
}
```

---

## REST API Reference

Base path: `/api/v1`. Auth: `Authorization: Bearer <ORCH_API_BEARER_TOKEN>` on all
routes except `/healthz`. Source: `packages/core/src/modules/api/api.controller.ts`.

Optional header on mutating requests: `X-Orch-Actor: <actor-name>` — written to the
operator action log for audit. Defaults to `"unknown"` if absent.

All request bodies are validated via zod (I-10). Invalid bodies return `400` with
an `issues` array detailing each validation failure.

### Health

#### `GET /healthz`

Liveness probe. No auth required.

**Response `200`**:
```json
{ "status": "ok", "uptime": 42.3 }
```

`uptime` is `process.uptime()` in seconds. Source:
`packages/core/src/modules/health/health.controller.ts`.

---

### Configuration

#### `GET /api/v1/config`

Returns runtime configuration consumed by Web UI clients.

**Response `200`**:
```json
{
  "traceBackendUiUrl": "http://localhost:3000",
  "traceBackend": "otlp"
}
```

`traceBackend` is one of `otlp | langfuse | none`. An empty `traceBackendUiUrl`
means trace deep-links are disabled in the Web UI.

---

### Projects

#### `GET /api/v1/projects`

List all registered projects from the in-memory project registry cache.

**Response `200`**:
```json
{
  "projects": [
    {
      "projectId": "my-project",
      "rootPath": "/home/user/projects/my-project",
      "ccsProfile": "default",
      "maxConcurrentSessions": 1,
      "sessionTypes": [...],
      "hookTargets": [...],
      "cron": {},
      "contextBudget": { "warnAtTokens": 200000, "forceHandoffAtTokens": 230000 }
    }
  ]
}
```

Returns the full `Profile` object for each project (all fields from the profile schema).

#### `POST /admin/reload`

Re-scans `~/.orch/projects/*.yaml`, diffs against cache, and returns a reload summary.
Safe to call multiple times — idempotent for unchanged files. Auth: Bearer token.
Source: `packages/core/src/modules/project-registry/admin.controller.ts`.

**Response `200`**:
```json
{
  "added": ["my-new-project"],
  "updated": [],
  "removed": [],
  "errors": []
}
```

---

### Queue

#### `GET /api/v1/queue`

List queue items with optional filters.

**Query params**:
- `status?` — filter by state: `pending | running | completed | failed | cancelled`
- `projectId?` — filter by project ID

**Response `200`**:
```json
{
  "items": [
    {
      "id": "uuid",
      "projectId": "my-project",
      "planPath": "/path/to/plan.md",
      "priority": 50,
      "state": "pending",
      "sessionId": null,
      "enqueuedAt": "2026-04-25T09:00:00.000Z",
      "startedAt": null,
      "endedAt": null
    }
  ]
}
```

#### `POST /api/v1/queue`

Enqueue a plan file for processing. Idempotent: repeated calls with the same
`projectId` + `planPath` resolve to the same `dedupKey` (I-8).

**Request body**:
```json
{
  "projectId": "my-project",
  "planPath": "/path/to/plan.md",
  "priority": 50
}
```

`priority` is optional (0–100, default 50). Higher values are dispatched first.

**Response `200`**: `{ "item": QueueItem }`

#### `POST /api/v1/queue/pause`

Pause queue processing globally. Writes an operator action log row.

**Response `200`**: `{ "ok": true, "paused": true }`

#### `POST /api/v1/queue/resume`

Resume queue processing globally. Writes an operator action log row.

**Response `200`**: `{ "ok": true, "paused": false }`

---

### Sessions

#### `GET /api/v1/sessions/active`

Return a snapshot of all currently active (non-terminal) sessions.

**Response `200`**:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "projectId": "my-project",
      "planPath": "/path/to/plan.md",
      "state": "active",
      "claudeSessionId": "claude-uuid",
      "startedAt": "2026-04-25T09:00:00.000Z",
      "endedAt": null,
      "inputTokens": 12000,
      "outputTokens": 3000,
      "costUsd": 0.042,
      "traceId": "abc123...",
      "createdAt": "2026-04-25T09:00:00.000Z",
      "updatedAt": "2026-04-25T09:05:00.000Z"
    }
  ]
}
```

#### `GET /api/v1/sessions/:id/tail`

Tail the last N lines of stdout from an active session.

**Query params**:
- `lines?` — number of lines (default: 20, max: 100)

**Response `200`**: `{ "lines": ["line1", "line2"], "truncated": false }`

Returns `404` if no active session with the given id.

#### `GET /api/v1/sessions/:id/logs`

Full stdout ring-buffer content as plain text. `Content-Type: text/plain`.

Returns `404` if no active session with the given id.

#### `GET /api/v1/sessions/:id/usage`

Per-session token and cost usage, aggregated from in-process OTEL span data.
If no spans have been observed (session exists but has made no LLM calls), returns
empty samples with all-zero totals — not a 404.

**Query params**:
- `since?` — ISO-8601; exclude samples before this time
- `until?` — ISO-8601; exclude samples after this time

**Response `200`**:
```json
{
  "samples": [
    {
      "ts": "2026-04-25T09:01:00.000Z",
      "inputTokens": 1000,
      "outputTokens": 200,
      "cacheReadTokens": 500,
      "costUsd": 0.003
    }
  ],
  "totals": {
    "inputTokens": 1000,
    "outputTokens": 200,
    "cacheReadTokens": 500,
    "costUsd": 0.003
  }
}
```

Source: `ContextBudgetService` in-memory accumulator (charter O3, F6).

#### `POST /api/v1/sessions/:id/stop`

Terminate an active session. Writes an operator action log row.

**I-6 gate**: requires `?confirm=1` query param. Without it, returns `400`.

**Response `200`**: `{ "ok": true, "sessionId": "uuid" }`

Idempotent: if the session is not found, still returns `200`.

---

### Hooks Receiver

#### `POST /hooks/:event`

Receive a Claude Code hook event. Auth: `X-Orch-Hook-Secret` header.

Valid `:event` values: `SessionStart`, `PreToolUse`, `PostToolUse`,
`UserPromptSubmit`, `Notification`, `Stop`, `SessionEnd`, `SubagentStop`,
`PreCompact`, `PostCompact`, `ApiError`.

**Response `200`**: `{ "ok": true }` or `{ "ok": true, "deduped": true }` on duplicate.

Returns `400` on body validation failure. Returns `401` on missing/wrong secret.

Source: `packages/core/src/modules/hooks/hooks.controller.ts`.

---

## SSE Event Reference

The daemon emits Server-Sent Events to connected clients (Web UI, Telegram bridge).
Each event is wrapped in a `SseEnvelope`. Schema source:
`packages/shared/src/events/sse-envelope.ts`.

### Envelope Schema

```json
{
  "type": "session.started",
  "payload": { ... },
  "trace_id": "32-hex-char string (optional)",
  "span_id": "16-hex-char string (optional)",
  "ts": "2026-04-25T09:00:00.000Z"
}
```

`type` is constrained to `ALL_EVENT_TYPES` from
`packages/shared/src/events/event-types.ts`. Consumers validate every incoming
envelope via `SseEnvelopeSchema` — malformed envelopes are logged and dropped.

### Event Channels

#### Session Lifecycle

| Event | Payload (sketch) | Description |
|---|---|---|
| `session.started` | `{ sessionId, projectId, planPath }` | Session transitioned to active state. |
| `session.state_changed` | `{ sessionId, from, to }` | Session state machine transition. |
| `session.ended` | `{ sessionId, reason }` | Session reached a terminal state. `reason` is one of `EndedReason` values: `process_exit`, `user_cancel`, `watchdog_kill`, `daemon_shutdown`, `CONTEXT_FULL`, `CONTEXT_FULL_FORCED`. |
| `session.rate_limited` | `{ sessionId, retryAfterSecs }` | Claude Code API rate limit hit; Orch will retry. |
| `session.context_full` | `{ sessionId }` | Session entered `context_full` state. |

#### Context Budget (charter F4)

| Event | Payload (sketch) | Description |
|---|---|---|
| `session.context_near_limit` | `{ sessionId, inputTokens, threshold }` | Token count crossed `warnAtTokens`. Operator should prepare for handoff. |
| `session.force_handoff` | `{ sessionId, inputTokens, threshold }` | Token count crossed `forceHandoffAtTokens`. Graceful session end initiated. |

#### Graceful Session End

| Event | Payload (sketch) | Description |
|---|---|---|
| `session.handoff_pending` | `{ sessionId }` | `autoHandoff=false`: Orch is waiting for operator confirmation before terminating. |
| `session.handoff_prepared` | `{ sessionId, handoffContextId }` | Handoff context (git diff + session log + rendered prompt) built and persisted to DB. |
| `session.handoff_applied` | `{ sessionId, successorSessionId }` | Successor session spawned with `seedPrompt` from handoff context. |

#### Queue

| Event | Payload (sketch) | Description |
|---|---|---|
| `queue.enqueued` | `{ item }` | A plan was enqueued (via API or file-watch). |
| `queue.state_changed` | `{ itemId, from, to }` | Queue item state machine transition. |

#### Hooks

| Event | Payload (sketch) | Description |
|---|---|---|
| `hook.received` | `{ eventType, sessionId, deduped }` | A Claude Code hook event was received and processed (or deduped). |

#### Operator Actions

| Event | Payload (sketch) | Description |
|---|---|---|
| `operator.action` | `{ actor, action, target }` | An operator action was logged (e.g. `queue.pause`, `session.stop`). |

#### Project Registry

| Event | Payload (sketch) | Description |
|---|---|---|
| `project.registered` | `{ projectId }` | A project was added to or updated in the registry. |

---

## Why `ApiController` doesn't inject `ConfigService`

The Orch REST API controllers read configuration from `process.env` directly rather
than via NestJS's `ConfigService`. This is intentional. Invariant I-10 (validate
external input at boundaries) is satisfied by the boot-time `validateEnv` call,
which throws if any required `ORCH_*` env var is missing or malformed. Adding a
`ConfigService` injection layer for one controller would be premature abstraction.
The threshold rule: refactor to `ConfigService` when >= 3 controllers each need
typed config access. Until then, direct env reads are the simpler path.

This absorbs Phase 3 carryforward #4 ("ApiController ConfigService injection
deferred"). Origin: `agent-workspace/memory/phase-3-complete.md` carryforward table.

---

## Cross-References

- **Quick-start**: [`docs/quickstart.md`](quickstart.md) — environment setup, first run, hook injection
- **Architecture**: [`docs/architecture.md`](architecture.md) — module map, data flow diagrams, adapter pattern
- **Troubleshooting**: [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — daemon won't start, hooks not firing, OTEL missing traces
- **Root README**: [`README.md`](../README.md) — project overview and installation
