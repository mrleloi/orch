# Architecture

> User-facing architecture overview for Orch.
> For internal team detail (dependency rules, anti-patterns, layering law), see
> [`agent-workspace/constitution/architecture.md`](../agent-workspace/constitution/architecture.md).

---

## Overview

Orch is a NestJS daemon that sits beside your Claude Code workflow. It watches
directories for session-plan files, maintains a persistent SQLite queue, spawns
`claude` CLI subprocesses through `ccs` (the Claude Code account-switcher), listens
for hook events that those subprocesses emit, drives a state machine to track each
session, and notifies you via Telegram or the web dashboard when something
completes, fails, or needs attention. All orchestration decisions are deterministic
code — the daemon never calls the Anthropic API directly. LLM intelligence lives
exclusively inside the Claude Code workers it spawns (Charter principle 1).

---

## Monorepo Layout

```
orch/
├── packages/
│   ├── core/          # @orch/core — NestJS daemon (this document's focus)
│   ├── cli/           # @orch/cli  — `orch` command (init, start, stop)
│   ├── telegram/      # @orch/telegram — Grammy bot
│   ├── web-ui/        # @orch/web-ui   — React + Vite dashboard
│   └── shared/        # @orch/shared   — DTOs, enums, zod schemas
├── examples/
│   └── stockforge-integration/  # sample .orch/profile.yaml (fixture only)
├── docker/            # docker-compose for full stack
└── docs/              # this directory
```

**Package rules** (enforced at code level):
- `@orch/shared` — types and zod schemas only; no business logic.
- `@orch/telegram` and `@orch/web-ui` connect to `@orch/core` via its HTTP/WS API.
  They do not import `@orch/core` source.
- `@orch/cli` spawns `@orch/core` as a child process; it does not import daemon internals.

---

## Module Map

All NestJS feature modules live under `packages/core/src/modules/`.

```
                      ┌─────────────────────────────────────────────────────┐
                      │                 @orch/core (NestJS)                 │
                      │                                                     │
  plan files ────────►│  project-registry ──► queue ──► scheduler          │
                      │                          │                          │
  hook POST ─────────►│  hooks ──► events ◄──────┤                          │
                      │              │           │                          │
                      │              ▼           ▼                          │
                      │           sessions ◄─── context-budget              │
                      │              │                                      │
                      │              ├──► handoff                           │
                      │              ├──► tracing                           │
                      │              └──► notifier ──► Telegram / SSE       │
                      │                                                     │
                      │  api ─── security ─── health ─── audit             │
                      │  db  (Prisma + SQLite)                              │
                      └─────────────────────────────────────────────────────┘
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `project-registry` | Load and watch `~/.orch/projects/*.yaml` profiles; expose `getProject(name)` |
| `queue` | Persistent task queue (SQLite via Prisma); file-watcher for plan drops |
| `scheduler` | Cron-driven tick: calls queue for next item, triggers session spawn |
| `sessions` | State machine; spawns workers via `IAgentRuntime`; drives handoff/end |
| `hooks` | HTTP controller for `POST /projects/:id/hooks/:type`; validates + emits |
| `events` | EventEmitter2 typed bus — the shared nervous system between modules |
| `context-budget` | OTEL span processor tracking token usage; emits `ContextFullEvent` |
| `handoff` | Builds continuity context for successor sessions from git diff + memory |
| `tracing` | OTEL SDK bootstrap; `withSpan` helper; `TRACEPARENT` propagation |
| `notifier` | Fan-out to Telegram bot and SSE stream on session state changes |
| `api` | REST + WebSocket surface for dashboard and CLI |
| `security` | Bearer token auth, hook secret validation |
| `health` | `/health` liveness check |
| `audit` | Decision-log writes to SQLite `Decision` table |
| `db` | Prisma client provider; WAL mode setup |

---

## Data Flow: Queue Item Lifecycle

The numbered steps trace one plan file from drop to completion.

```
 Operator               Orch daemon                  Claude Code subprocess
    │                       │                                   │
    │  drop plan file       │                                   │
    │──────────────────────►│                                   │
    │                       │ 1. queue.ingest(planPath)         │
    │                       │ 2. scheduler tick (cron/poll)     │
    │                       │ 3. queue.next() → QueueItem       │
    │                       │ 4. sessions.startSession()        │
    │                       │    IAgentRuntime.spawn(config)    │
    │                       │──────────────────────────────────►│
    │                       │                                   │ 5. claude CLI runs
    │                       │                                   │    hooks fire via
    │                       │◄──────────────────────────────────│    POST /hooks/:type
    │                       │ 6. hooks.receive() → events.emit  │
    │                       │ 7. state machine transition        │
    │                       │    (idle→running→context_full/    │
    │                       │     rate_limited/done)            │
    │                       │                                   │
    │                       │ 8a. done   → queue.complete()     │
    │                       │             notifier.send()       │
    │                       │                                   │
    │                       │ 8b. context_full                  │
    │                       │     → handoff.buildContext()      │
    │                       │     → queue.requeue(nextPlan)     │
    │                       │     → sessions.startSession()     │ (new item)
    │                       │                                   │
    │◄──────────────────────│ 9. Telegram / SSE notification    │
    │                       │                                   │
```

Key invariant: the daemon only observes Claude Code through hook events and process
exit codes. It never parses agent reasoning; it only tracks state transitions.

---

## Adapter Pattern

Core principle (Charter rule 6, invariant I-1): the daemon never imports the
Anthropic SDK. All runtime interactions go through the `IAgentRuntime` interface.

```typescript
// packages/core/src/domain/types/runtime.ts
interface IAgentRuntime {
  spawn(config: SpawnConfig): Promise<RuntimeHandle>;
  resume(sessionId: string, prompt: string): Promise<RuntimeHandle>;
  terminate(handle: RuntimeHandle, reason: TerminationReason): Promise<void>;
  awaitAndClassify(handle: RuntimeHandle): Promise<void>;
  writeStdin(handle: RuntimeHandle, text: string): Promise<void>;
}
```

`ClaudeCodeAdapter` is the production implementation. It wraps the `ccs` CLI via
`execa`:

```
ccs <profile> -p <prompt> --output-format stream-json
```

A `CodexAdapter` (or any other runtime) would implement the same interface. The
`sessions` module receives whichever adapter is wired in `app.module.ts` via
NestJS dependency injection — it never references `ClaudeCodeAdapter` by name.

This means swapping from Claude Code to another agent runtime is a one-file change
in `app.module.ts`, with no changes to any business logic module.

---

## Hook Event Flow

Claude Code subprocesses emit lifecycle hooks that the daemon intercepts to drive
its state machine. The flow is:

```
Claude Code subprocess
  │
  │  (hook script runs — injected into .claude/settings.json)
  │
  ▼
POST /projects/:id/hooks/:type
  │  X-Orch-Hook-Secret header validated (security module)
  │
  ▼
hooks module — validates payload (zod)
  │
  ▼
events.emit('hook.received', { type, payload, sessionId })
  │
  ▼
sessions module — state machine transition
  │
  ├── running → context_full  (ContextFullEvent from context-budget)
  ├── running → rate_limited  (stderr pattern match in adapter)
  └── running → completed     (stop hook + exit code 0)
```

Hooks are the daemon's eyes and ears. Without hook injection, the daemon can still
spawn sessions but cannot observe their internal state (only process exit).

Hook injection runs automatically during `orch init`. For projects already using
Claude Code, injection adds an Orch stanza to `.claude/settings.json` without
removing existing hooks (append, not replace).

See [`docs/configuration.md`](configuration.md) for hook payload schemas and the
`ORCH_HOOK_SECRET` requirement.

---

## Project-Agnostic Design

Invariant I-2: `packages/core/` contains zero project-specific knowledge.

The per-project boundary is `.orch/profile.yaml`, loaded at runtime by the
`project-registry` module. One daemon instance manages N projects simultaneously.

```
~/.orch/projects/
  my-project.yaml        # -> .orch/profile.yaml schema
  another-project.yaml
```

Each profile declares: `name`, `path`, `sessionTypes`, `cron`, `ccsProfile`,
`commands`, and `hooks`. The daemon reads this at startup and on
`POST /admin/reload`. Project-specific wiring (which queue folder to watch, which
ccs profile to prefer, which Telegram chat to notify) comes entirely from the
profile — not from code.

`examples/stockforge-integration/` is fixture data only. It demonstrates a real
`.orch/` directory layout and is not imported or executed by the daemon.

---

## Extensibility Points

### Custom `IAgentRuntime` adapters

To add a new agent runtime (e.g., Codex, Cursor, Gemini CLI):

1. Create `packages/core/src/modules/sessions/<name>-adapter.ts`.
2. Implement `IAgentRuntime` from `domain/types/runtime.ts`.
3. Provide it in `app.module.ts`:
   ```typescript
   { provide: AGENT_RUNTIME_TOKEN, useClass: CodexAdapter }
   ```
4. No other files change. All session-lifecycle logic already operates against
   the interface.

### Custom Telegram commands

The Telegram bot lives in `packages/telegram/`. Commands are registered in
`TelegramController`. To add a command:

1. Add a handler method decorated with Grammy's `@Command('mycommand')`.
2. Call the relevant `@orch/core` REST endpoint from the handler (HTTP client to
   `localhost:ORCH_HTTP_PORT`).
3. No daemon changes required.

### Custom cron entries via profile.yaml

The `cron` block in `.orch/profile.yaml` accepts standard cron expressions. The
`scheduler` module iterates active profiles and schedules ticks accordingly. Adding
a new schedule requires only a profile change — no code change.

```yaml
# .orch/profile.yaml
cron:
  pollInterval: "*/30 * * * * *"   # poll queue every 30 seconds
```

---

## HTTP Surface

The daemon's HTTP server binds to `127.0.0.1:4141` by default (configurable via
`ORCH_HTTP_PORT` and `ORCH_HTTP_HOST`). All endpoints require authentication — see
[`docs/configuration.md`](configuration.md) for `ORCH_API_BEARER_TOKEN` and
`ORCH_HOOK_SECRET`.

```
POST /projects/:id/hooks/:type     # Claude Code hook ingestion
GET  /api/v1/projects              # List managed projects
GET  /api/v1/queue                 # Queue state
POST /api/v1/queue                 # Enqueue plan
GET  /api/v1/sessions/active       # Active session info
GET  /api/v1/sessions/:id/tail     # SSE stream of stdout
POST /api/v1/sessions/:id/stop     # Terminate session
WS   /api/v1/stream                # WebSocket for dashboard live updates
POST /admin/reload                 # Reload project profiles
GET  /health                       # Liveness check
```

---

## State Persistence

SQLite via Prisma, at `~/.orch/orch.db` (configurable via `ORCH_HOME`). WAL mode
enabled for concurrent reads. Transactions wrap all state-machine transitions.

High-level schema:

```
Project     (id, name, path, profile_yaml_snapshot)
QueueItem   (id, project_id, plan_path, priority, status, ccs_profile,
             tokens_used, started_at, ended_at, end_reason)
Session     (id, queue_item_id, state, started_at, ended_at, trace_id)
HookEvent   (id, session_id, type, payload, received_at)
Decision    (id, context, choice, rationale, created_at)
```

---

## Cross-References

- **Configuration** (env vars, profile schema, hook payloads): [`docs/configuration.md`](configuration.md)
- **Troubleshooting** (common operator failures): [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- **Release process**: [`docs/release.md`](release.md)
- **Internal architecture spec** (dependency rules, layering, anti-patterns):
  [`agent-workspace/constitution/architecture.md`](../agent-workspace/constitution/architecture.md)
- **Charter** (immutable principles): [`PROJECT_CHARTER.md`](../PROJECT_CHARTER.md)
