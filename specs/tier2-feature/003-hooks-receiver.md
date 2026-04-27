---
spec_id: SPEC-2026-04-24-T2-003
tier: 2
status: approved
version: 1.0
created: 2026-04-24
related_specs: [SPEC-2026-04-24-T1-001, SPEC-2026-04-24-T2-001]
---

# SPEC T2-003: Hooks Receiver

# PART A — BUSINESS SPECIFICATION

## A.1 Context

Claude Code emits hook events at key lifecycle points. Orch receives these via HTTP callbacks. Hooks are how Orch knows "session started", "session ended", "tool called", etc. without polling.

## A.2 Hook Types Orch Cares About

| Hook | When | Orch Action |
|---|---|---|
| `SessionStart` | Session begins (startup or resume) | Record start, set RUNNING state |
| `SessionEnd` | Session ends normally | Record end, set ENDING → COMPLETED |
| `Stop` | Claude stops generating (turn complete) | Update last-activity timestamp (reset watchdog) |
| `SubagentStop` | Subagent completes | Same as Stop |
| `PreToolUse` | Before tool invocation | Optional: enforce deny-rules at runtime |
| `UserPromptSubmit` | User sends a prompt | Optional: drift check integration |
| `PreCompact` | Claude about to compact context | Signal: we're near context limit |
| `Notification` | Claude UI notification | Logged only |

v1 MUST support: SessionStart, SessionEnd, Stop, SubagentStop.
v1 OPTIONAL: PreToolUse, UserPromptSubmit, PreCompact.
v1 LOGS ONLY: Notification.

## A.3 Hook Command in Project's settings.json

Injected by `orch attach`:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://localhost:3737/projects/<id>/hooks/session-start \
          -H 'Authorization: Bearer <token>' \
          -H 'Content-Type: application/json' \
          -d '{\"session_id\":\"'$CLAUDE_SESSION_ID'\",\"cwd\":\"'$PWD'\",\"ts\":\"'$(date -Iseconds)'\"}' &"
      }]
    }],
    ...
  }
}
```

Notes:
- `&` detaches curl so hook doesn't block Claude Code (for async-safe hooks)
- `-s` silent
- Bearer token stored in env or project-specific file, not in plain JSON
- Payload JSON is minimal — we don't want to parse bash-quoted shell output too cleverly

---

# PART B — AGENT CONTRACT

## B.1 HTTP Endpoints

```
POST /projects/:project_id/hooks/:hook_type
Authorization: Bearer <token>
Content-Type: application/json

Body: HookPayload (varies by type)

Response (success):
  200 OK
  { "ok": true, "received_at": "<iso8601>", "event_id": "<uuid>" }

Response (errors):
  401 — Missing/invalid token
  403 — Unknown project_id
  404 — Unknown hook_type
  400 — Payload validation failed
  429 — Rate limit (abuse protection)
  500 — Internal (logged, safe to retry idempotently)
```

## B.2 Payload Schemas (zod)

```typescript
const basePayload = z.object({
  session_id: z.string(),
  ts: z.string().datetime().optional(),
});

const sessionStartPayload = basePayload.extend({
  cwd: z.string().optional(),
  resumed: z.boolean().optional(),
});

const sessionEndPayload = basePayload.extend({
  reason: z.string().optional(), // "user_exit" | "completed" | "error"
  exit_code: z.number().optional(),
});

const stopPayload = basePayload.extend({
  tool_name: z.string().optional(), // last tool invoked
});

const subagentStopPayload = basePayload.extend({
  subagent_name: z.string().optional(),
  parent_session_id: z.string().optional(),
});

const preToolUsePayload = basePayload.extend({
  tool_name: z.string(),
  tool_input: z.unknown().optional(),
});

const userPromptSubmitPayload = basePayload.extend({
  prompt_preview: z.string().optional(), // first N chars, for drift check
});

const preCompactPayload = basePayload.extend({
  current_tokens: z.number().optional(),
});
```

## B.3 Processing Flow

```
Request in
  ↓
Authenticate (bearer token)
  ↓
Resolve project (404 if unknown)
  ↓
Validate payload (400 if invalid)
  ↓
Dedup check (session_id + hook_type + ts in last 60s)
  ↓
If dup: return 200 ok (idempotent)
  ↓
Else:
  - Persist HookEvent row (atomic)
  - Emit EventBus event
  - Return 200 ok immediately (do NOT wait for downstream)
  ↓
(async) Subscribers handle event
```

Processing MUST be fast (< 500ms) because Claude Code waits for response. Slow processing = broken user experience.

## B.4 Security

- Bearer token required on ALL hook endpoints
- Rate limit: 60 requests/minute per project_id (token bucket)
- Payload size limit: 64 KB (reject 413 if exceeded)
- CORS: disabled (these are not browser calls)
- Binds to 127.0.0.1 by default (I-7)

## B.5 Deduplication Implementation

```typescript
class DedupService {
  // Tombstone map with TTL
  private seen = new Map<string, number>();

  isDup(key: string): boolean {
    const now = Date.now();
    this.cleanup(now);
    if (this.seen.has(key)) return true;
    this.seen.set(key, now);
    return false;
  }

  private cleanup(now: number) {
    for (const [k, t] of this.seen) {
      if (now - t > 60_000) this.seen.delete(k);
    }
  }
}

// Key: `${sessionId}|${hookType}|${Math.floor(ts/1000)}`
```

In-memory is fine for single-process. If future multi-process, switch to Redis or DB-based.

## B.6 Hook Event Persistence

Stored in `HookEvent` table:
```
id (uuid), session_id, hook_type, payload (json), received_at, dedup_key
```

Indexed: `(session_id, received_at DESC)`, `(hook_type)`, UNIQUE `dedup_key`.

Retention: 30 days, nightly cleanup job.

## B.7 Observability

Each hook event → OTEL span:
- Name: `orch.hook_received`
- Attributes: `project.id`, `session.id`, `hook.type`, `hook.dedup`
- Parent: root queue item span if correlatable via session_id lookup, else standalone

## B.8 Error Handling

- Auth failure: log at warn level, do not expose "why" (prevents enumeration)
- Unknown project: log at warn, return 403
- Validation failure: log at info with truncated payload, return 400 with details
- DB write failure: log at error, return 500, do NOT retry from this side (Claude Code won't retry)
- Rate limit: log at warn, return 429

## B.9 Tests

- Unit: zod schemas accept/reject payloads
- Unit: dedup service
- Unit: auth middleware (valid, invalid, missing)
- Integration: real HTTP POST to each endpoint
- Integration: dedup behavior (send same twice, assert single DB row)
- Integration: rate limit (send 61 requests, assert 61st is 429)
- Integration: downstream event emission (mock subscriber)

## B.10 Configuration

Env vars:
- `ORCH_PORT` (default 3737)
- `ORCH_BIND` (default 127.0.0.1)
- `ORCH_AUTH_TOKEN` (required in prod, auto-generated on init)
- `ORCH_HOOKS_RATE_LIMIT_PER_MINUTE` (default 60)
- `ORCH_HOOKS_PAYLOAD_MAX_KB` (default 64)
