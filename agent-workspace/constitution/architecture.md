# Architecture

> Module structure, dependency rules, and layering for Orch.

---

## Monorepo Structure

```
orch/
├── packages/
│   ├── core/                    # @orch/core - NestJS daemon
│   │   ├── src/
│   │   │   ├── domain/          # Pure TS, zero framework
│   │   │   │   ├── queue-item.ts
│   │   │   │   ├── session.ts
│   │   │   │   ├── profile.ts
│   │   │   │   └── events.ts
│   │   │   ├── modules/         # NestJS feature modules
│   │   │   │   ├── project-registry/
│   │   │   │   ├── queue/
│   │   │   │   ├── session/
│   │   │   │   ├── hooks-receiver/
│   │   │   │   ├── tracing/
│   │   │   │   └── events/
│   │   │   ├── adapters/        # External system adapters
│   │   │   │   ├── claude-code.adapter.ts
│   │   │   │   ├── ccs.adapter.ts
│   │   │   │   └── codex.adapter.ts (optional)
│   │   │   ├── interfaces/      # IAgentRuntime, IProjectConfig, etc.
│   │   │   ├── main.ts
│   │   │   └── app.module.ts
│   │   ├── prisma/
│   │   └── package.json
│   ├── telegram/                # @orch/telegram - Grammy bot
│   ├── web-ui/                  # @orch/web-ui - React + Vite
│   ├── cli/                     # @orch/cli - `orch` command
│   └── shared/                  # @orch/shared - shared types
├── examples/
│   └── stockforge-integration/  # sample .orch/ profile
├── reference-repos/             # gitignored, cloned during Phase 0
├── docker/                      # docker-compose for full stack
└── docs/
```

---

## Layering

### Layer 1: Domain (`packages/core/src/domain/`)

**Pure TypeScript. Zero framework imports.** No NestJS, no Express, no Prisma, no Grammy.

Contains:
- Entities: `QueueItem`, `Session`, `Profile`, `HookEvent`
- Value objects: `TraceId`, `SessionType`, `BudgetLimit`
- Domain events: `SessionStarted`, `SessionEnded`, `RateLimitDetected`
- Pure functions: state machine transitions, budget calculations

Rule: A junior can read this folder with no framework knowledge and understand the business model.

### Layer 2: Modules (`packages/core/src/modules/`)

**NestJS feature modules.** Each module:
- Has a `<name>.module.ts`
- Exports a single `<Name>Service` as public API
- Keeps internal classes private (not exported from `index.ts`)
- Uses DI for all dependencies
- Has its own folder with tests colocated

Communication between modules:
- **Preferred**: EventEmitter2 events
- **Allowed**: Public service methods (DI-injected)
- **Forbidden**: Direct import of another module's internals

### Layer 3: Adapters (`packages/core/src/adapters/`)

**Thin wrappers around external systems.** Implement interfaces from `interfaces/`.

- `claude-code.adapter.ts` — spawn `claude` CLI via execa, parse stdout
- `ccs.adapter.ts` — invoke `ccs <profile>` commands, detect account switch
- `codex.adapter.ts` — analog for Codex CLI (future)

Rule: Adapters are the ONLY place that talks to external CLIs, filesystems outside our workspace, or network services.

### Adapter env-var propagation contract (Phase 5.3.6 / SC-11)

The `claude-code-adapter.ts` `spawn()` and `resume()` calls MUST propagate the
following parent-process env vars to the spawned subprocess. The single source
of truth is `packages/core/src/modules/sessions/env-propagation.ts`
(constants + `buildPropagatedEnv()`).

| Var | Reason |
|-----|--------|
| `CLAUDE_CODE_USE_BEDROCK` | Routes claude CLI via AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | Routes claude CLI via GCP Vertex AI |
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | Corp-network proxy passthrough |
| `CLAUDE_CODE_REMOTE` | Enables --rc Remote Control mode |
| `TRACEPARENT` | W3C trace context (preserves OTEL parent-span linkage) |
| `OTEL_EXPORTER_OTLP_*` (prefix glob) | All OTLP exporter config (endpoint, headers, protocol, ...) |

Adding a new var to this list = edit `PROPAGATED_ENV_VARS` (or
`PROPAGATED_ENV_PREFIXES`) in `env-propagation.ts` AND update this table.

### Worktree Isolation (v2.1, Decision 018)

When a profile sets `worktreeIsolation: true` (default `false`), each spawned
session receives its own linked git worktree, enabling same-project parallelism
without file-system contention. The branch to base each worktree on is
controlled by `baseBranch` (default `'main'`). This worktree-isolation mechanism
was deferred in Decision 014 and activated in Decision 018 (Phase 6.3) following
the Phase 5 retrospective §6.3 analysis showing that multi-session same-project
concurrency was the remaining SC-8 blocker.

**Lifecycle**:

- `spawn()` — after a lazy-once `probeWorktreeSupport()` gate confirms git ≥ 2.5,
  `ClaudeCodeAdapter` calls `execa('git', ['worktree', 'add', ...])` to create
  `.git/worktrees/orch-<sessionId>/` on an ephemeral branch named
  `<baseBranch>-orch-<sessionId>`. The subprocess `cwd` is overridden to that
  path. The resolved path is stored on `RuntimeHandle.worktreePath` and persisted
  to `Session.worktreePath` by `SessionManager` immediately after a successful
  spawn (see `packages/core/src/modules/sessions/session-manager.ts`).
- `terminate()` — adapter calls `git worktree remove --force <path>` then
  `git branch -D <branch>`, best-effort (errors logged, not thrown). `SessionManager`
  clears `Session.worktreePath` to NULL after the adapter prune completes.
- **SessionStart hook sweep** — `scripts/hooks/session-start-bootstrap.sh`
  enumerates all `.git/worktrees/orch-*` directories and prunes any whose
  `sessionId` is absent from the DB with `ACTIVE` state. This prevents orphan
  worktrees left by daemon crashes.

**Layer assignment**:

- Layer 1 (domain): `SpawnConfig.worktreePath?`, `RuntimeHandle.worktreePath?`,
  `WorktreeCreateError extends RuntimeSpawnError` — pure TS, zero framework imports.
- Layer 2 (modules): `SessionManager` wires profile fields → `SpawnConfig` and
  persists `Session.worktreePath` to the DB; never shells out to git directly.
- Layer 3 (adapters): `ClaudeCodeAdapter` owns the full worktree lifecycle —
  create on `spawn()`, prune on `terminate()`. The daemon is the caller; it never
  invokes `git` itself (I-1, I-3 satisfied: no SDK calls, only `execa('git',...)` CLI).
- Hook layer: orphan sweep runs at session start, isolated from adapter logic.

**Invariant coverage**: satisfies I-1 (daemon never calls LLM SDK, only CLI),
I-3 (subprocess via `execa('git', ...)` — CLI path only), and I-12 (adapter
failure isolation: `WorktreeCreateError` is caught at the adapter boundary and
never propagates as an unhandled daemon crash).

### Layer 4: Interfaces (`packages/core/src/interfaces/`)

TypeScript interfaces that define contracts:
- `IAgentRuntime` — spawn, resume, terminate
- `IProjectConfig` — profile schema
- `IHookReceiver` — receive hook events

Core never imports a concrete adapter. It imports the interface and gets the adapter via DI.

---

## Dependency Rules

```
domain ← modules ← adapters ← main.ts
   ↑
interfaces (shared by all)
```

- **domain** depends on nothing (except standard library)
- **interfaces** depends on domain
- **modules** depend on domain, interfaces, and other modules' public services
- **adapters** depend on interfaces, domain, and external packages
- **main.ts** wires everything via NestJS

**Forbidden cycles:**
- Domain importing modules: NEVER
- Module A importing Module B internals: NEVER (only Module B's exported service)
- Adapter importing module: NEVER (adapter is a leaf node, injected into modules)

---

## Module Responsibilities

### `project-registry/`
- Load `.orch/profile.yaml` from each managed project
- Watch for profile changes (chokidar)
- Expose `ProjectRegistryService.getProject(name)` to other modules

### `queue/`
- Persistent task queue (Prisma + SQLite)
- File watcher for `session-plans/pending/` folders
- API: `enqueue`, `next`, `complete`, `fail`, `pause`, `resume`

### `session/`
- State machine for session lifecycle
- Spawns sessions via `IAgentRuntime` (DI-injected adapter)
- Listens to hook events via EventBus, updates state
- API: `startNextSession`, `getActiveSession`, `terminate`

### `hooks-receiver/`
- Fastify-style HTTP controller (NestJS platform-fastify)
- Endpoints: `POST /projects/:id/hooks/:type`
- Validates payload, emits domain event
- NO business logic. Just receive → validate → emit.

#### Hook Deny Semantics (log-only design)

When a hook returns `{decision: "deny"}` in a PreToolUse event, the daemon:

1. Emits a `ToolDenied` domain event on the `tool.denied` EventBus channel.
2. Records a structured log entry and an OTEL span event (I-11 — no silent transitions).
3. Does **not** invoke any `writeStdin` suppression or duplicate the CLI permission gate.

**Rationale**: The Claude CLI permission model is the upstream enforcement gate. The hook fires
_before_ the tool executes inside the CLI; when the hook returns `deny`, the CLI never runs the
tool regardless of what the daemon does. Adding a parallel `writeStdin`-suppression in the daemon
would duplicate that gate, risking behavioral drift if the CLI's enforcement semantics ever change.
The daemon's role here is **observe-and-record** — capturing the denial in telemetry and session
logs so operators can audit denied tool calls. It is not a policy-enforcement layer.

This design was confirmed by the 5.3.12 verifier (P4 probe) and is intentional.

### `tracing/`
- OTEL SDK bootstrap
- Creates root span per queue item
- Propagates `TRACEPARENT` to spawned subprocesses
- API: `withSpan(name, fn)` helper

### `events/`
- EventEmitter2 instance + typed wrappers
- Domain events: published here, consumed by any module
- Acts as the "nervous system" — no direct module-to-module calls

---

## Cross-Cutting Concerns

### Configuration
- `@nestjs/config` for env vars (LOG_LEVEL, DB_PATH, etc.)
- `profile.yaml` per project, loaded by ProjectRegistry
- No hardcoded paths anywhere. Use `process.env.ORCH_HOME` (default `~/.orch/`)

### Logging
- `pino` structured logging
- Correlate logs with OTEL trace ID via `trace_id` field
- Log level configurable per module

### Error Handling
- Domain errors: typed classes extending `DomainError`
- Adapter errors: caught, logged with trace, re-thrown as domain error
- NestJS global exception filter translates to HTTP response for hooks endpoints

### Validation
- `zod` for all external input (profile.yaml, hook payloads, Telegram commands)
- Never trust external data. Parse at boundary, use typed domain objects internally.

---

## Package Boundaries

### `@orch/core`
The daemon. Exports nothing to other packages. Runs as a standalone process.

### `@orch/telegram`
Grammy bot. Imports `@orch/shared` (types). Connects to `@orch/core` via its HTTP API (localhost:port).

### `@orch/web-ui`
React app. Communicates with `@orch/core` via REST + WebSocket (same HTTP server that hosts hooks endpoints).

### `@orch/cli`
Thin wrapper. `orch init`, `orch start`, `orch stop`. Exec spawns core. Not a long-running process.

### `@orch/shared`
Types only. DTOs, enums, schemas (zod). Used by core, telegram, web-ui, cli.

**Rule**: No business logic in `@orch/shared`. Just contracts.

---

## State Persistence

SQLite via Prisma, located at `~/.orch/data/orch.db` (configurable via env).

Schema (high-level):
```
Project(id, name, path, profile_yaml_snapshot)
QueueItem(id, project_id, plan_path, priority, status, claude_session_id, ccs_profile, tokens_used, started_at, ended_at, end_reason, notes)
Session(id, queue_item_id, state, started_at, ended_at, trace_id)
HookEvent(id, session_id, type, payload, received_at)
Decision(id, context, choice, rationale, created_at)  # autonomous mode decisions log
```

WAL mode for concurrency. Transactions for state transitions.

---

## HTTP Surface (for interfaces)

Mounted on `@orch/core` at `localhost:3737` (configurable):

```
POST /projects/:id/hooks/:type     # Receive Claude Code hooks
GET  /api/v1/projects              # List managed projects
GET  /api/v1/queue                 # Queue state
POST /api/v1/queue                 # Enqueue plan
GET  /api/v1/sessions/active       # Active session info
GET  /api/v1/sessions/:id/tail     # SSE stream of stdout
POST /api/v1/sessions/:id/stop     # Terminate session
WS   /api/v1/stream                # WebSocket for dashboard live updates
```

Authentication: Bearer token in env var, same for local and Telegram and Web UI. Default: random 32-byte hex generated on `orch init`.

---

## Anti-Patterns

- **LLM in state machine.** Never call Anthropic API from core. Only adapters spawn CLI subprocesses.
- **Shared mutable state.** All state in SQLite. In-memory state is per-module, not shared.
- **Tight coupling to Claude Code.** Always through `IAgentRuntime`. Codex/Gemini swap = new adapter, no core change.
- **Monolithic "shared" folder.** `@orch/shared` is types-only. No utilities folder with 50 random helpers.
- **Cross-feature knowledge.** Session module should not know what fields a Telegram command has. Communicate via events.

---

## Decomposition Cost Model

> Charter §3 (parallelization is first-class) + master plan §6 quantitative
> rule. Single source of truth for the master-planner subagent's
> horizontal-vs-vertical decomposition decisions.

### Multipliers

| Pattern | Token cost multiplier | When to choose |
|---------|----------------------|----------------|
| Single direct execution | **1×** | 1 task, fully understood, ≤30K tokens of work |
| Single + tools (research-first / validator scripts) | **4×** | 1 task, requires ≤2 tool round-trips |
| Multi-agent (subagent dispatch) | **15×** | ≥2 independent tasks AND isolation value > 11× cost overhead |

### The PARALLELIZE quantitative gate

```
PARALLELIZE = (
  num_independent_subtasks >= 2
  AND
  estimated_isolation_value_tokens >= 11 * single_task_baseline_tokens
  AND
  no_shared_file_writes
  AND
  no_shared_schema_migration
)
```

`estimated_isolation_value_tokens` = the tokens the main session would
otherwise consume to context-switch between the subtasks (typically 8-15K
per switch over 3+ subtasks). Below 2 subtasks the math never closes;
above 5 subtasks isolation almost always wins.

### Horizontal vs vertical

- **Horizontal** (parallel siblings, same level of abstraction): when the
  PARALLELIZE gate above passes.
- **Vertical** (sequential pipeline, each step transforms the previous
  output): when the gate fails OR when later steps depend on earlier outputs.

### Worked example — Phase 5 substage 5.4

Substage 5.4 has 6 disjoint IMPL tasks, no shared files, no schema
migration. PARALLELIZE gate evaluates:
- num_independent_subtasks = 6 (≥2)
- isolation_value ≈ 6 × 12K context switches = 72K (≥ 11 × 6K = 66K)
- no_shared_file_writes ✓
- no_shared_schema_migration ✓
→ Gate PASSES → horizontal (1 main-session turn, 6 parallel subagents).

### Worked example — Phase 5 substage 5.3

5.3.2 (Prisma migration) is a hard prerequisite for 5.3.3 / 5.3.4 / 5.3.8.
PARALLELIZE gate FAILS for that step (no_shared_schema_migration=false
because every downstream depends on the new column existing) → vertical
for the migration step, THEN horizontal for the 5.3.3 || 5.3.4 || 5.3.5
sibling triple.

### Anti-pattern guard

If a master-planner draft proposes multi-agent for a `num_independent_subtasks ==
1` task, the planner is over-decomposing. The 15× cost path is wrong by
construction in that case. Reviewer (sandwich-verifier) MUST flag this.
