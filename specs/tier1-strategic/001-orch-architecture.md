---
spec_id: SPEC-2026-04-24-T1-001
tier: 1
status: approved
version: 1.0
created: 2026-04-24
authors: [project-owner, claude-opus]
related_specs: []
---

# SPEC T1-001: Orch Strategic Architecture

> Strategic tier spec: defines the overall system, component boundaries, integration surfaces.
> Feature tier specs (T2) reference this for architectural constraints.

---

# PART A — BUSINESS SPECIFICATION

## A.1 System Purpose

Orch is a daemon that observes and dispatches Claude Code sessions on behalf of a human operator. It is NOT an autonomous agent — it does not reason, plan, or make semantic decisions. It executes deterministic rules around session lifecycle:

- Pick up prepared plans from a queue
- Spawn Claude Code sessions with the right provider/account
- Detect session end events via hooks
- Detect context-full conditions via OTEL metrics
- Compose handoff context for next session
- Enforce budget and policy rules
- Notify human operator via Telegram or Web UI

## A.2 Value Proposition

Human operators currently perform these mechanical tasks manually:
1. Starting Claude Code sessions with correct ccs profile
2. Noticing when account is rate-limited → switching manually
3. Noticing when context fills → running `/session-end`, starting new session, re-establishing context
4. Dispatching the next prepared plan
5. Tracking which session did what (no central view)

Orch automates ALL of these. Human's remaining responsibilities:
- Prepare plans (intellectual work)
- Review results (judgment)
- Handle exceptions (the 5% the daemon can't)

## A.3 Boundaries

**Orch IS:**
- A single-user, self-hosted daemon
- A scheduler for Claude Code CLI subprocesses
- An observer of hook events and OTEL traces
- An interface layer (Telegram, Web UI, CLI)

**Orch IS NOT:**
- An AI agent framework
- A replacement for Claude Code
- A coordinator that reasons about tasks
- A multi-tenant cloud service
- A workflow engine with DAGs

## A.4 Relationships

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────┐
│   Human     │◄──────►│       Orch       │───────►│ Claude Code │
│  (operator) │        │     (daemon)     │ spawn  │  (CLI proc) │
└─────────────┘        └──────────────────┘        └──────┬──────┘
       ▲                        ▲                          │
       │                        │ hooks POST               │
       └──────── Telegram ──────┤                          │
       └──────── Web UI ────────┤◄─────────────────────────┘
                                │
                                │ reads ↓
                                ▼
                       ┌──────────────────┐
                       │ Managed Projects │  (stockforge, others)
                       │   .orch/         │
                       │   .claude/       │
                       └──────────────────┘
```

## A.5 Business Rules

**BR-1**: One daemon instance per user/machine. No distributed coordination.

**BR-2**: One daemon can manage N projects simultaneously (tested with N=5). Each project's sessions run serially within that project, but projects run independently.

**BR-3**: Human is the source of truth for scope and plans. Orch never invents tasks.

**BR-4**: Destructive operations (kill session, wipe queue) require human confirmation — in-band in Telegram (button click) or Web UI (modal).

**BR-5**: Orch fails loud. Any failure that could affect user's work → immediate Telegram notification. Silent failures are invariant violations.

**BR-6**: Orch respects the managed project's constitution. If the project says "no mixing PLAN + IMPL", Orch honors it. Orch reads, not rewrites, project rules.

---

# PART B — AGENT CONTRACT (Technical)

## B.1 Component Inventory

| Component | Package | Role |
|---|---|---|
| Core daemon | `@orch/core` | Main process, state, API |
| Telegram bot | `@orch/telegram` | Telegram interface |
| Web UI | `@orch/web-ui` | Browser dashboard |
| CLI | `@orch/cli` | `orch` command |
| Shared types | `@orch/shared` | Types, DTOs, schemas |

## B.2 External Dependencies

| Dep | Version | Interaction |
|---|---|---|
| Claude Code CLI | >= 2.1 | Subprocess via execa |
| ccs | >= 7.x | Wraps claude, handles accounts |
| Node.js | >= 20 | Runtime |
| SQLite | >= 3.x (via better-sqlite3 or prisma) | Persistence |
| Langfuse OR SigNoz | latest | OTEL backend (user choice) |
| Docker | optional | Optional stack via compose |

## B.3 Interface Contracts

### B.3.1 Profile YAML (.orch/profile.yaml)
**Schema**: see `reusability-rules.md` R-4.
**Parsed by**: `ProjectRegistryService` using zod schema.
**Breaking changes**: require major version bump + migration.

### B.3.2 Hook Receiver (HTTP)
**Endpoints**: `POST /projects/:project_id/hooks/:hook_type`
**Hook types**: `session-start`, `session-end`, `stop`, `subagent-stop`, `pre-tool-use`, `user-prompt-submit`
**Auth**: Bearer token (same as admin API)
**Idempotency**: required (Invariant I-8)
**Response**: `{ ok: true, received_at: <iso8601> }`

### B.3.3 Admin API (REST)
Routes per `architecture.md` § HTTP Surface.
**Auth**: Bearer token
**Format**: JSON
**Versioning**: `/api/v1/...`

### B.3.4 Live Stream (WebSocket)
**Path**: `/api/v1/stream`
**Protocol**: Socket.IO
**Rooms**: `queue`, `sessions`, `projects/:id`
**Events**: domain events emitted by core

### B.3.5 Agent Runtime (internal)
**Interface**: `IAgentRuntime`
**Methods**: `spawn(profile, prompt, options)`, `resume(sessionId, prompt, options)`, `terminate(sessionId, signal)`, `isAvailable()`
**Implementations**: `ClaudeCodeAdapter` (primary), `CodexAdapter` (optional future)

## B.4 State Model

Session states (see `domain/state-machine.ts`):

```
       ┌─────────┐
       │ QUEUED  │
       └────┬────┘
            │ pick
            ▼
       ┌──────────┐
       │ STARTING │
       └────┬─────┘
            │ spawn success
            ▼
       ┌──────────┐       hooks/events
       │ RUNNING  │◄────────────────────┐
       └────┬─────┘                     │
            │                           │
        ┌───┼───┐                       │
        │   │   │                       │
        ▼   ▼   ▼                       │
       END  END END                     │
     (normal)(rate)(ctx_full)           │
        │    │    │                     │
        ▼    ▼    ▼                     │
  ┌─────────────────────┐               │
  │ COMPLETED | FAILED  │               │
  │ RATE_LIMITED | CF   │───────────────┘
  └─────────────────────┘  (CF → trigger next with handoff)
```

Transitions must be deterministic (pure function from `(state, event) → state'`).

## B.5 Data Persistence

SQLite tables per `architecture.md` § State Persistence.

**Durability**: WAL mode, sync=NORMAL, commit per transaction.

**Integrity**: Foreign keys enforced. Cascade deletes only for audit data (hook events, decisions). Business data (queue items, sessions) use soft delete.

**Retention**:
- Sessions: indefinite
- HookEvents: 30 days (cleanup job)
- Decisions: indefinite

## B.6 Observability

Every queue item = one OTEL trace.

Trace hierarchy:
```
orch.queue_item (root span, attrs: queue_item_id, project_id)
├── orch.handoff_build (child span)
├── orch.session_spawn (child span, attrs: ccs_profile, session_type)
│   └── claude_code.interaction (Claude Code native, nested via TRACEPARENT)
│       ├── claude_code.llm_request (native)
│       ├── claude_code.tool (native)
│       │   └── claude_code.tool.execution
│       └── claude_code.hook (if beta tracing enabled)
├── orch.hook_received (child span per hook)
└── orch.state_transition (child span per transition)
```

Metrics:
- `orch.queue.pending_count` (gauge, per project)
- `orch.queue.processed_total` (counter, per project, per status)
- `orch.session.duration_seconds` (histogram)
- `orch.session.tokens_used` (histogram, per project, per session_type)
- `orch.session.end_reason` (counter, by reason)

## B.7 Security Model

- Daemon binds to localhost (I-7). Remote access via explicit user action (Tailscale, SSH tunnel, reverse proxy with auth).
- Auth token: single bearer token, 32 bytes hex. Rotated via `orch rotate-token`.
- No credential handling for Claude/ccs — those have their own auth.
- Telegram: whitelist of user IDs in env. Bot token in env.
- Webhooks (if exposed): HMAC signed, secret in env.
- Hook endpoints: same bearer auth as admin API.
- Destructive ops require confirmation (I-6).

## B.8 Failure Modes

| Failure | Detection | Action |
|---|---|---|
| Claude CLI not found | Adapter throws at spawn | Mark queue_item FAILED, notify |
| ccs auth expired | ccs stderr pattern | Pause project, notify |
| All accounts exhausted | ccs no-available-profile | Pause project, calculate reset time, schedule resume |
| Hook endpoint unreachable from Claude Code | Timeout or connection refused | Log, don't retry in Claude Code — lost hook = eventual detection by watchdog |
| Session hangs (no events for N minutes) | Watchdog | Terminate, mark FAILED with reason WATCHDOG_TIMEOUT |
| Daemon crash | External (systemd etc.) | Restart; recover state from SQLite; mark any RUNNING sessions as INTERRUPTED on boot |
| SQLite corruption | Query errors | Abort startup, require user intervention |
| Disk full | Write errors | Pause daemon, notify, resume after space freed |
| OTEL backend down | OTLP exporter errors | Log, continue (traces lost but daemon OK) |

## B.9 Scale Targets (v1)

- Managed projects: up to 5 simultaneously
- Queue size: up to 1000 pending items per project
- Sessions/day: up to 100 per project
- OTEL volume: up to 10K spans/hour
- Memory: daemon RSS steady-state < 300 MB
- Cold start: < 5 seconds
- Telegram latency: < 2 seconds for non-LLM commands

## B.10 Out-of-Scope (v1)

- Multi-user / multi-tenant mode
- Horizontal scaling / clustering
- Hosted SaaS version
- Plugin / extension system
- Workflow DAG execution
- Custom state machines per project (use config flags, not DSL)
- ML-based scheduling

---

# Implementation Notes (for agents)

- Read `constitution/architecture.md` for layering, `constitution/invariants.md` for guardrails.
- Every feature module maps to a T2 spec (see `specs/tier2-feature/`).
- Adapter pattern is hard boundary — never inline Claude CLI calls in services.
- Test state machine as pure functions first, wire DI last.
- Integration tests use `vitest` + `@nestjs/testing` + in-memory SQLite.
