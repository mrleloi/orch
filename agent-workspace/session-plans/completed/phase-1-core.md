# Phase 1 — Core Daemon MVP

> **Session type**: Mix of PLAN, FOCUSED_IMPL, MULTI_TASK_IMPL, VERIFY
> **Goal**: NestJS daemon with project registry, queue, split session modules, hooks receiver + state machine, OTEL stack — end-to-end working for one managed project.
> **Estimated duration**: 4-6 autonomous days
> **Pre-requisite**: Phase 0 complete. See `agent-workspace/research/SYNTHESIS.md` (all decisions D1-D15 informed by Phase 0).

---

## First 3 Tasks to Execute (pickup order)

1. **Task 1.0** — pnpm bootstrap + workspace scaffold (FOCUSED_IMPL, 70K, sandwich-dev)
2. **Task 1.1** — OrchContext domain primitive + `getOrchContext` helper (FOCUSED_IMPL, 50K, sandwich-dev) — **blocks every feature module**
3. **Task 1.2** — OTEL stack vendoring from ColeMurray + docker-compose smoke test (FOCUSED_IMPL, 60K, sandwich-dev)

Everything downstream depends on 1.0 (tooling) + 1.1 (DI primitive) + 1.2 (observability plumbing).

---

## Phase Goal (Success Criteria)

Phase 1 is COMPLETE when ALL of these hold:

- [ ] `pnpm install` from clean checkout succeeds (pnpm 9+ installed globally first — see Task 1.0)
- [ ] `pnpm run dev` starts the daemon on localhost
- [ ] Daemon logs startup, ready state, version
- [ ] `.orch/profile.yaml` in example project is loaded
- [ ] Dropping a `.md` plan file into `session-plans/pending/` triggers an enqueue event (verified in logs)
- [ ] Hooks receiver endpoints respond 200 OK to test POST (per-event + X-Orch-Hook-Secret header — D2)
- [ ] Session controller can spawn a `claude -p` subprocess via `ClaudeCodeAdapter` (CLI via execa, NOT Agent SDK — I-3, D1)
- [ ] State machine transitions logged and persisted in SQLite (WAL mode — D2)
- [ ] OTEL traces emitted for daemon operations and visible in Grafana LGTM UI
- [ ] `TRACEPARENT` propagated to spawned Claude Code (verified via backend — D7)
- [ ] Secret redactor strips common credential patterns from any outbound text (D12)
- [ ] `pnpm run test` passes with >70% coverage on core
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes
- [ ] Invariant `grep` checks all pass: I-1, I-2, I-3, I-4, I-5, I-14
  - `grep -rn "anthropic\|openai\|@anthropic-ai/sdk\|@anthropic-ai/claude-agent-sdk" packages/core/src/` → empty (I-1, I-3)
  - `grep -rn "stockforge\|StockForge" packages/core/src/` → empty (I-2)
  - `grep -rn "\.ccs/\|\.claude/" packages/core/src/` → empty (I-5)

---

## Assumptions from Phase 0 (populated from SYNTHESIS.md)

| Area | Decision (source) |
|---|---|
| Reference skeleton | `claudegram` structure, adapted for CLI subprocess (SYNTHESIS §1). Monorepo re-org: `packages/core`, `packages/telegram` (Phase 2), `packages/web-ui` (Phase 2). |
| Runtime dispatch | `IAgentRuntime` adapter spawning `execa('ccs', [profile, '-p', prompt], { env: { ...TRACEPARENT, ...} })`. Never Agent SDK. (D1, I-3) |
| DI pattern | Hybrid: NestJS feature modules + `globalThis.OrchContext` populated at bootstrap. Domain code uses `getOrchContext()` helper — zero NestJS import in `packages/core/src/domain/`. (D4) |
| Concurrency | Two-layer: in-process `Map<sessionKey, Promise<void>>` (verbatim from Claude-to-IM) + DB-backed TTL lock as fallback. Wake-dedup promise map from nanoclaw. (D3) |
| Watchdog | Pure function `decideAction(...) -> 'ok' | 'soft-warn' | 'hard-kill'` + setInterval(30s) monitor. (D13, nanoclaw + claudegram) |
| Hook model | Hooks-first active signal (POST /hooks/:event). Transcript tailing is secondary (restart backfill only). (D5) |
| State machine | Transaction-wrapped in `prisma.$transaction(async tx => {...})`. `SessionEnd` (not `Stop`) terminates a session. Dedup deterministic IDs for compaction; content-hash for API errors. (D2) |
| OTEL backend | **Grafana LGTM single-container default** (replaces previous Langfuse-default assumption). Langfuse remains opt-in via profile toggle. Copy `collector-config.yaml` + `docker-compose-lgtm.yml` + `claude-code-dashboard.json` from ColeMurray. (D6, ADR-005 updated) |
| TRACEPARENT | Standard W3C via `@opentelemetry/api.propagation.inject(ctx, carrier)` → merged into execa env. No custom code. (D7) |
| Queue persistence | SQLite + Prisma with `journal_mode=WAL` (single-process, not DELETE — D2, rejected from nanoclaw in §5) |
| Hook receiver | NestJS + Fastify platform, `POST /hooks/:event`, validated with zod, `X-Orch-Hook-Secret` header + localhost-bound. (D2, D12) |
| Secret redaction | Port `_redact_secrets` regex set from `claude-code-telegram/src/claude/orchestrator.py` lines 52-80. Shared utility; used by any outbound text channel. (D12 — moved UP from Phase 2) |
| Handoff builder | **Phase 3, NOT Phase 1.** L0 regex sync + L1 LLM-in-spawned-subprocess async. Preserves I-1. (D8) |
| Telegram/Web UI | Phase 2. Lean 6-command bot + 4-page UI. (D10, D11) |
| Routing | Phase 2 surface; Tier 1+2 prefix routing (`@swarm`, `@agent`), AI routing rejected (I-1). (D15) |

Open questions carried into Phase 1 tasks (from SYNTHESIS §6): CLIProxy JSON output, mid-session rate-limit exit code, Windows `claude -p`, hook retry on 5xx — all scheduled for resolution during Task 1.9 (Adapter integration test) and Task 1.10 (Hooks integration).

---

## Task Breakdown

### Task 1.0: pnpm bootstrap + Workspace Scaffold
**Session type**: FOCUSED_IMPL
**Budget**: 70K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- Verify / install pnpm 9: `npm i -g pnpm@9` (pnpm NOT pre-installed on this environment — SYNTHESIS §7 adjustment #1)
- `pnpm-workspace.yaml` listing `packages/*`
- `packages/core` scaffolded with `pnpm dlx @nestjs/cli new core --skip-install --package-manager pnpm`
- `packages/shared` skeleton (`package.json` + `tsconfig.json`)
- `packages/cli` skeleton
- `packages/telegram` skeleton (stub only — Phase 2)
- `packages/web-ui` skeleton (Vite React template — Phase 2 fill-in)
- Root `package.json` with scripts: `lint`, `test`, `typecheck`, `dev` delegating to `pnpm -r run ...`
- `husky` + `lint-staged` wired
- `.nvmrc` pinning Node 20 LTS
**Research**: `research/claudegram.md §1-2` (layout), SYNTHESIS §1 skeleton diagram
**Verification**:
- `pnpm -v` returns 9+
- `pnpm install` succeeds cleanly
- `pnpm -r run typecheck` passes on empty scaffold

---

### Task 1.1: Domain OrchContext + getOrchContext Helper
**Session type**: FOCUSED_IMPL
**Budget**: 50K
**Subagent**: sandwich-dev (sonnet)
**Blocks**: every later task that touches domain layer (critical path)
**Deliverables**:
- `packages/core/src/domain/context.ts` — `OrchContext` interface (`store`, `runtime`, `notifier`, `tracer`), `initOrchContext(ctx)`, `getOrchContext()` helper
- `packages/core/src/domain/session-key.ts` — `sessionKey(projectId, sessionType, threadId): string`
- `packages/core/src/domain/types/store.ts` — `IOrchStore` interface (CRUD + transaction)
- `packages/core/src/domain/types/runtime.ts` — `IAgentRuntime` interface (`spawn`, `resume`, `terminate`)
- `packages/core/src/domain/types/channel-adapter.ts` — `IChannelAdapter` interface (Phase 2 surface, declared now)
- Zero NestJS imports in any of these files (I-14 + D4)
- Unit tests: context init/get, session-key determinism
**Research**: `research/Claude-to-IM.md §3` (`initBridgeContext` / `getBridgeContext` — verbatim pattern source), SYNTHESIS §D4
**Verification**:
- `grep -rn "@nestjs" packages/core/src/domain/` → empty
- `pnpm run test -- domain/context` passes

---

### Task 1.2: OTEL Stack Vendoring (moved UP from Phase 3)
**Session type**: FOCUSED_IMPL
**Budget**: 60K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `docker/otel-stack/docker-compose-lgtm.yml` — copied from ColeMurray repo with path adjustments
- `docker/otel-stack/collector-config.yaml` — copied verbatim (OTLP → LGTM routing)
- `docker/otel-stack/dashboards/claude-code-dashboard.json` — ColeMurray pre-built panel set
- `docker/otel-stack/README.md` — 3 commands (`docker compose up -d`, open Grafana at `:3000`, shutdown)
- `scripts/dev/otel-up.sh` + `.ps1` wrappers
- Smoke test: bring stack up, curl OTLP endpoint on `:4318`, tear down
**Research**: `research/claude-code-otel.md §4-6` (ColeMurray file inventory), SYNTHESIS §D6, ADR-005 (updated)
**Verification**:
- `docker compose -f docker/otel-stack/docker-compose-lgtm.yml up -d` succeeds
- Grafana reachable on `http://127.0.0.1:3000`
- Collector responds to OTLP http/protobuf on `:4318`

---

### Task 1.3: Domain Entities + Pure State Machine
**Session type**: FOCUSED_IMPL
**Budget**: 80K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `packages/core/src/domain/queue-item.ts` — `QueueItem` entity + state enum
- `packages/core/src/domain/session.ts` — `Session` entity
- `packages/core/src/domain/profile.ts` — `Profile` entity + zod schema (I-10)
- `packages/core/src/domain/events.ts` — discriminated-union domain event types
- `packages/core/src/domain/errors.ts` — `DomainError` base + typed subclasses (I-12 alignment)
- `packages/core/src/domain/state-machine.ts` — pure transition function (`transition(state, event) → state`). `SessionEnd` (not `Stop`) terminates. (D2)
- `packages/core/src/domain/budget.ts` — token budget calcs (used by Phase 3 budget enforcer; stub the functions now)
- Vitest coverage >90% on all pure functions
**Research**: `research/Claude-Code-Agent-Monitor.md §3-4` (state machine insight: Stop ≠ SessionEnd)
**Verification**:
- `grep -rn "@nestjs\|prisma" packages/core/src/domain/` → empty
- Test suite green

---

### Task 1.4: Prisma Schema + DB Module
**Session type**: FOCUSED_IMPL
**Budget**: 60K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `packages/core/prisma/schema.prisma` per ADR-004 (tables: `Project`, `Session`, `QueueItem`, `HookEvent`, `HandoffContext` stub)
- Migration generated + committed
- `packages/core/src/modules/db/prisma.service.ts` with `journal_mode=WAL` pragma at connection time (D2)
- In-memory SQLite for unit tests (I-13)
- `IOrchStore` implementation backed by Prisma — thin wrapper, transaction support via `prisma.$transaction`
**Research**: SYNTHESIS §D2 (WAL justification, NOT DELETE), `research/nanoclaw.md §6` (DELETE rejected rationale)
**Verification**:
- `pnpm --filter @orch/core run prisma:migrate` succeeds
- Integration test: open DB, inspect `PRAGMA journal_mode` → `wal`
- `pnpm run test -- db/` passes

---

### Task 1.5: Secret Redactor (moved UP from Phase 2)
**Session type**: FOCUSED_IMPL
**Budget**: 40K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `packages/core/src/modules/security/secret-redactor.ts` — port regex patterns from `claude-code-telegram/src/claude/orchestrator.py` lines 52-80
- Exported function: `redactSecrets(input: string): string`
- Test fixtures: API keys (sk-, anthropic-, openai-), bearer tokens, `.env`-style lines, AWS keys, generic 32+ char hex
**Research**: SYNTHESIS §D12, `research/claude-code-telegram.md §7`
**Verification**:
- `pnpm run test -- security/secret-redactor` passes with ≥12 positive fixtures + 3 negative controls

---

### Task 1.6: ProjectRegistry Module
**Session type**: FOCUSED_IMPL
**Budget**: 80K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `packages/core/src/modules/project-registry/profile.schema.ts` — zod schema (I-10)
- `ProjectRegistryService` — load profiles from `~/.orch/projects/*.yaml`, chokidar watcher
- Events: `project.registered`, `project.updated`, `project.removed`
- Explicit `POST /admin/reload` endpoint (SYNTHESIS §6 open question 6 — chose explicit over fsevents)
- Tests: valid/invalid profiles, reload flow
**Research**: `research/claude-code-telegram.md §project-registry`, SYNTHESIS §6.6
**Verification**:
- Test coverage ≥80% on the service
- Load-invalid-profile test asserts zod error surfaced as `DomainError`

---

### Task 1.7: Events + Tracing Modules
**Session type**: MULTI_TASK_IMPL (2 tightly-coupled tasks)
**Budget**: 130K
**Subagent**: task-implementer per task (sonnet) + spec-compliance-reviewer + code-quality-reviewer + sandwich-verifier (opus) at close
**Deliverables**:
- **1.7a — Events module**: `EventEmitter2` wrapper with typed channel constants, DI-injectable `EventBusService`
- **1.7b — Tracing module**: `@opentelemetry/sdk-node` bootstrap, OTLP exporter via env var, `TracingService` with `withSpan`, `getActiveTraceparent`, pino-OTEL correlation (I-9)
- In-memory span exporter for tests
- TRACEPARENT propagation utility: `injectTraceparentIntoEnv(env): env` (consumed later by ClaudeCodeAdapter) — D7
**Research**: `research/headless-trace.md` (entire), SYNTHESIS §D7
**Verification**:
- Test: spawn child span under parent, assert both emitted with correct parent-child link
- `grep` every log call path: trace_id present when span active (I-9)

---

### Task 1.8: Queue Module
**Session type**: MULTI_TASK_IMPL
**Budget**: 180K
**Subagent**: task-implementer (sonnet) per subtask + both reviewers + sandwich-verifier (opus) at close
**Deliverables**:
- `QueueRepository` (Prisma wrapper over `QueueItem`)
- `QueueService` — `enqueue`, `next`, `complete`, `fail`, `pause`, `resume` (atomic next via transaction)
- File watcher for `session-plans/pending/*.md` per registered project (chokidar)
- Dedup key: file path + mtime
- Priority from YAML frontmatter (`priority: <int>`)
- Events emitted on every state change (I-11)
**Research**: `research/claudegram.md §5` (request-queue pattern)
**Verification**:
- Concurrent enqueue test: 10 parallel calls, exactly 10 items in DB, no duplicates
- Atomic next test: 2 workers call `next()` simultaneously, exactly one gets the item
- Priority ordering test
- Pause/resume test

---

### Task 1.9: Sessions Module — SPLIT into four (SYNTHESIS §7 adjustment #2)
**Session type**: MULTI_TASK_IMPL (4 subtasks, one session)
**Budget**: 230K (near cap — watch at 200K)
**Subagent**: task-implementer (sonnet) per subtask + spec-compliance-reviewer + code-quality-reviewer after each + sandwich-verifier (opus) at close
**Deliverables**:

**1.9a — `claude-code-adapter.ts`** (NEW; replaces claudegram's SDK-based `agent.ts`):
- `IAgentRuntime` impl using `execa('ccs', [profile, '-p', prompt, '--output-format', 'stream-json'], { env: { ...traceparent, ... } })`
- Resume path: `ccs <profile> --resume <sessionId>`
- Parse streaming JSON from stdout; extract session ID
- Rate-limit detection: stderr pattern matcher + exit-code taxonomy from `research/ccs.md §6`
- Error wrapping into `DomainError` (I-12)
- **Integration test on Windows Git Bash** (SYNTHESIS §6.3 open question): `claude -p "echo ok"` end-to-end
- **Invariant check**: `grep -rn "claude-agent-sdk\|@anthropic-ai/sdk" packages/core/src/modules/sessions/` → empty (I-3)
- **Research**: `research/ccs.md §3-6`, SYNTHESIS §D1

**1.9b — `request-queue.ts`** (near-verbatim from claudegram):
- Per-session FIFO with `processing: boolean` flag
- Soft-cancel: drain on `/cancel` (Phase 2 surface, interface now)
- **Research**: `research/claudegram.md §5`

**1.9c — `agent-watchdog.ts`**:
- `decideAction({ session, now, heartbeatAgeMs, absCeiling, perClaimTolerance }): 'ok' | 'soft-warn' | 'hard-kill'` — pure function (nanoclaw pattern)
- `setInterval(30_000)` loop invoking it per active session (claudegram pattern)
- Heartbeat source: latest hook-event timestamp OR `execa.ChildProcess.exitCode === null`
- **Research**: `research/nanoclaw.md §7` (decideStuckAction), `research/claudegram.md §6`, SYNTHESIS §D13

**1.9d — `session-manager.ts`** (orchestrator, claudegram parity):
- Composes the three pieces above
- Two-layer lock: in-process `Map<sessionKey, Promise<void>>` (D3)
- Wake-dedup map (nanoclaw pattern — SYNTHESIS §D3)
- Public API: `runSession(projectId, plan)`, `cancelSession(sessionKey)`, `getActiveSessions()`
- **Research**: `research/Claude-to-IM.md §4` (processWithSessionLock — 13 lines verbatim), SYNTHESIS §D3

**Verification (all four together)**:
- Full lifecycle integration test: enqueue → dispatch → spawn (mocked execa) → stream events → complete
- Rate-limit mid-session test (forced stderr fixture)
- Watchdog hard-kill test (simulated dead child)
- Invariant grep (I-1, I-3) empty

---

### Task 1.10: Hooks Receiver + State Machine (renamed per SYNTHESIS §7 adjustment #3)
**Session type**: FOCUSED_IMPL
**Budget**: 120K
**Subagent**: sandwich-dev (sonnet) + sandwich-verifier (opus) at close
**Deliverables**:
- Fastify platform enabled in Nest (`NestFactory.create(AppModule, new FastifyAdapter())`)
- `HooksController.POST /hooks/:event` — thin, responds 200 fast, offloads to service
- `HooksService.processEvent()` wrapped in `prisma.$transaction(async tx => {...})` — state machine runs atomically with persistence (D2)
- Zod schemas per Claude Code hook event type (I-10)
- `X-Orch-Hook-Secret` header middleware (env-stored secret) — D12
- Localhost-bind default (I-7)
- Dedup: deterministic ID for `PreCompact` (`{sessionId}-compact-{uuid}`), content-hash for API error events, 60s sliding window for generic (I-8)
- Session state transitions emit log + OTEL span event (I-11)
- **SYNTHESIS §6.7 open question**: drop a fixture test that returns 500 on the receiver during an active session and observe — document whether Claude Code buffers/drops hooks. Record finding in `research/verification/hook-retry.md`.
**Research**: `research/Claude-Code-Agent-Monitor.md §3-5` (state machine + dedup), SYNTHESIS §D2
**Verification**:
- 200 OK on valid POST + secret
- 401 on missing/wrong secret
- Duplicate POST → single DB row
- State transition test: `Stop` does NOT end session; `SessionEnd` does
- Transaction rollback test: inject DB error mid-transition, assert no partial state

---

### Task 1.11: REST API Module
**Session type**: FOCUSED_IMPL
**Budget**: 80K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `GET /api/v1/projects`
- `GET /api/v1/queue`
- `POST /api/v1/queue`
- `GET /api/v1/sessions/active`
- `POST /api/v1/sessions/:id/stop` — gated by I-6 (requires `?confirm=1` flag; interactive gate deferred to Telegram Phase 2)
- Bearer auth middleware
- Zod validation on every body (I-10)
- Tests per endpoint
**Research**: `architecture.md §HTTP Surface`
**Verification**:
- Integration test per endpoint passes
- I-6 test: stop without `--confirm` → 400

---

### Task 1.12: CLI Package
**Session type**: FOCUSED_IMPL
**Budget**: 70K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `orch init` — create `~/.orch/` + default config
- `orch attach <path>` — register project (prompts for ccs profile name)
- `orch start` — spawn daemon (inherit stdio for now; detach in Phase 2)
- `orch stop` — graceful shutdown via HTTP admin endpoint
- `orch status` — HTTP GET to daemon, pretty-print
- Uses `commander` or `yargs`
**Verification**: scripted E2E on temp `ORCH_HOME`

---

### Task 1.13: App Wiring + Bootstrap
**Session type**: FOCUSED_IMPL
**Budget**: 60K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- `app.module.ts` — imports all feature modules (db, project-registry, events, tracing, queue, sessions, hooks, security, api)
- `main.ts` — bootstraps with Fastify adapter, Pino logger, graceful shutdown (SIGINT/SIGTERM)
- `onModuleInit` in AppModule → `initOrchContext({ store, runtime, notifier, tracer })` (D4)
- Config module (env vars via `@nestjs/config`)
- Startup validation: home dir exists, DB migration applied, OTEL exporter reachable (warn not fail)
- `pnpm run dev` brings daemon up end-to-end
**Research**: SYNTHESIS §D4 (OrchContext init ordering — §6.5 mitigation noted: domain APIs also accept context as arg)
**Verification**:
- `pnpm run dev` logs `ready` line
- `curl http://127.0.0.1:<port>/healthz` returns 200

---

### Task 1.14: Integration Test (end-to-end)
**Session type**: VERIFY
**Budget**: 60K
**Subagent**: sandwich-verifier (opus)
**Scenario**:
1. Use temp dir as `ORCH_HOME`
2. Create fake managed project with `.orch/profile.yaml`
3. Programmatic `orch init` → `orch attach` → `orch start`
4. Drop a plan file into `session-plans/pending/`
5. Mock `ClaudeCodeAdapter.spawn` to return fake session ID + immediate completion
6. POST hook events to `/hooks/:event` with valid secret
7. **Assert**: queue item reaches `completed`, state persisted, events emitted, OTEL spans exported to test in-memory exporter
**Verification**: all assertions pass; session log shows full state chain per I-11

---

### Task 1.15: Example — StockForge Profile (outside core)
**Session type**: FOCUSED_IMPL
**Budget**: 30K
**Subagent**: sandwich-dev (sonnet)
**Deliverables (ALL under `examples/stockforge-integration/`, NEVER in `packages/core/` — I-2)**:
- `profile.yaml` matching StockForge session types
- `hooks-snippet.json` to paste into StockForge's `.claude/settings.json`
- `README.md` with 3-step integration
**Verification**: `grep -rn "stockforge\|StockForge" packages/core/src/` → empty (I-2)

---

### Task 1.16: Verification Gate (adversarial)
**Session type**: VERIFY
**Budget**: 60K
**Subagent**: sandwich-verifier (opus) — MANDATORY fresh context, adversarial review
**Inputs**:
- All code written in Phase 1
- Test output + coverage report
- Invariant grep results (I-1, I-2, I-3, I-4, I-5, I-14)
- `architecture.md` + `invariants.md`
**Output**: report with PASS / PASS WITH CONCERNS / FAIL + specific findings
**Gate**: advance to Phase 2 only on PASS or PASS WITH CONCERNS (minor)

---

### Task 1.17: Phase 1 Close (housekeeping)
**Session type**: FOCUSED_IMPL
**Budget**: 15K
**Subagent**: sandwich-dev (sonnet)
**Deliverables**:
- Write `phase-1-complete.md` under `agent-workspace/memory/`
- Update `current-execution.md` → active phase = Phase 2
- Move this plan file from `pending/` to `completed/`
- Open Phase 2 plan stub

---

## Dependencies (critical path)

```
1.0 ──┬─► 1.1 ──┬─► 1.3 ──┬─► 1.4 ──┬─► 1.6 ──┬─► 1.7 ──┬─► 1.8 ──► 1.9 ──► 1.10 ──► 1.11 ──► 1.13 ──► 1.14 ──► 1.16 ──► 1.17
      │         │         │         │         │         │
      └─► 1.2   │         │         │         │         │
(OTEL stack)    │         │         │         │         │
                └─ 1.5 (secret-redactor; independent after 1.1)
```

Blocking relationships:
- **1.0 blocks everything** (no pnpm → nothing compiles)
- **1.1 blocks every module** (domain primitive)
- **1.2 blocks 1.7** (OTEL stack up so tracing tests are meaningful)
- **1.3 blocks 1.4, 1.8, 1.9, 1.10** (domain entities + state machine are referenced)
- **1.4 blocks 1.8, 1.9, 1.10** (Prisma store)
- **1.5 blocks 1.11, 1.12** (API + CLI use redactor for outbound)
- **1.6 blocks 1.8** (queue needs registered projects)
- **1.7 blocks 1.9, 1.10** (tracing + events infra)
- **1.8 blocks 1.9, 1.13** (sessions consume queue)
- **1.9 blocks 1.10, 1.13** (state machine is hook-driven but hooks also need sessions)
- **1.10, 1.11, 1.12 block 1.13** (wiring needs all modules)
- **1.13 blocks 1.14** (no app, no E2E)
- **1.14 blocks 1.16** (verifier reads E2E output)

Parallelizable (future multi-session): 1.2 with 1.1; 1.5 with 1.6; 1.11 with 1.12 (both use 1.5).

---

## Budget Roll-up

| # | Task | Type | Budget |
|---|---|---|---|
| 1.0 | pnpm bootstrap + scaffold | FOCUSED_IMPL | 70K |
| 1.1 | OrchContext + getOrchContext | FOCUSED_IMPL | 50K |
| 1.2 | OTEL stack vendoring | FOCUSED_IMPL | 60K |
| 1.3 | Domain entities + state machine | FOCUSED_IMPL | 80K |
| 1.4 | Prisma schema + DB module | FOCUSED_IMPL | 60K |
| 1.5 | Secret redactor | FOCUSED_IMPL | 40K |
| 1.6 | ProjectRegistry module | FOCUSED_IMPL | 80K |
| 1.7 | Events + Tracing modules | MULTI_TASK_IMPL | 130K |
| 1.8 | Queue module | MULTI_TASK_IMPL | 180K |
| 1.9 | Sessions split (adapter + queue + watchdog + manager) | MULTI_TASK_IMPL | 230K |
| 1.10 | Hooks receiver + state machine | FOCUSED_IMPL | 120K |
| 1.11 | REST API module | FOCUSED_IMPL | 80K |
| 1.12 | CLI package | FOCUSED_IMPL | 70K |
| 1.13 | App wiring + bootstrap | FOCUSED_IMPL | 60K |
| 1.14 | Integration test | VERIFY | 60K |
| 1.15 | StockForge example | FOCUSED_IMPL | 30K |
| 1.16 | Verification gate | VERIFY | 60K |
| 1.17 | Phase close | FOCUSED_IMPL | 15K |
| **Total** | | | **~1,475K across ~17 sessions** |

No single session exceeds the 250K cap (Task 1.9 closest at 230K — monitor at 200K threshold per session-budgets.md).

---

## Invariants Enforced (per task)

| Invariant | Enforced by task |
|---|---|
| I-1 (daemon-dumb) | 1.9a grep check; 1.16 adversarial |
| I-2 (project-agnostic) | 1.15 grep check; 1.16 adversarial |
| I-3 (CLI subprocess, no SDK) | 1.9a grep check |
| I-4 (one-way dep) | 1.15 example package has NO `@orch/*` dep in its package.json |
| I-5 (no ~/.ccs/, ~/.claude/) | 1.16 grep |
| I-6 (destructive confirm) | 1.11 `?confirm=1` test |
| I-7 (localhost default) | 1.10 + 1.13 Fastify bind test |
| I-8 (idempotent hooks) | 1.10 dedup test |
| I-9 (structured log + trace id) | 1.7 + 1.16 audit |
| I-10 (zod on external input) | 1.6, 1.10, 1.11 |
| I-11 (no silent transitions) | 1.10 test; 1.16 audit |
| I-12 (adapter failure isolation) | 1.9a DomainError wrapping test |
| I-13 (test isolation) | 1.4 in-memory SQLite, mocked execa throughout |
| I-14 (no singleton state outside DI) | 1.16 grep `^let \|^var ` |
| I-15 (token budget in spans) | Phase 3 (not Phase 1 — no LLM in daemon to instrument yet) |

---

## Risks & Mitigations (augmented)

- **Risk**: Prisma + SQLite concurrency issues in tests → use `vitest-pool-workers` or isolate by file. (carried)
- **Risk**: execa behavior differs across OS, especially Windows Git Bash → Task 1.9a runs the integration test on THIS environment first. (SYNTHESIS §6.3)
- **Risk**: Hook payload from Claude Code changes → pin Claude Code version in `.orch/profile.yaml` during Phase 1; re-verify in Phase 3. (carried)
- **Risk**: Session ID format from ccs output varies → robust parser with multiple regex fallbacks + fallback to `ccs auth list --json` + `ccs doctor`. (SYNTHESIS §6.1)
- **Risk**: Mid-session rate-limit isn't exit-code 6 → stderr pattern matcher in 1.9a; collect real fixtures during first long-running integration session. (SYNTHESIS §6.2)
- **Risk**: Hook retry on 5xx unknown → Task 1.10 includes fixture test to document behavior. (SYNTHESIS §6.7)
- **Risk**: OrchContext init race (domain call before AppModule.onModuleInit) → domain APIs accept context-as-arg (enforced by lint rule); singleton is convenience fallback. (SYNTHESIS §6.5)
- **Risk**: Task 1.9 at 230K near budget cap → enforce 200K monitoring threshold; pre-authorized split at 1.9a/1.9b boundary if it overruns.
- **Risk**: OTEL stack Docker dependency on developer machine → document Docker Desktop as prereq; no fallback for Phase 1 (stack is small, deferable only to Phase 2 in worst case).

---

## Out of Scope for Phase 1

(Deferred or explicitly rejected — see SYNTHESIS §3 MUST/SHOULD/NICE and §5 rejections)

**Deferred to Phase 2:**
- Telegram bot with 6 commands
- Web UI with 4 pages
- TranscriptCache (Agent-Monitor port)
- Channel-adapter registry bootstrapping (interface declared Phase 1, wiring Phase 2)

**Deferred to Phase 3:**
- Handoff context builder (L0 sync + L1 in-spawned-subprocess)
- Context-budget enforcer (soft@200K, hard@230K trigger)
- Langfuse alternative backend toggle (profile flag)
- Cron scheduler + EventBus decouple
- Session Detail page with trace link

**Rejected (v1 scope):**
- Agent SDK `query()` iterator (I-3)
- Docker-per-agent (charter lightweight)
- NATS pub/sub (EventEmitter suffices)
- AI routing Tier 3 (I-1)
- Swarm graph + DAG
- Vault / encrypted secrets
- Two-DB split (nanoclaw's cross-mount workaround; orch doesn't have that problem)
- Bun runtime (Node 20 LTS)
- Multi-platform Markdown rendering
- Classic-mode Telegram commands (`/cd`, `/ls`, `/git`)
- Multi-project concurrent sessions (Phase 3+)
- Git worktree spawning (Phase 4+)

---

## References

- `agent-workspace/research/SYNTHESIS.md` — source of truth for all Phase 1 decisions
- `agent-workspace/research/claudegram.md` — skeleton source
- `agent-workspace/research/Claude-to-IM.md` — OrchContext + session lock patterns
- `agent-workspace/research/Claude-Code-Agent-Monitor.md` — state machine insights
- `agent-workspace/research/nanoclaw.md` — watchdog pure function + wake-dedup
- `agent-workspace/research/claude-sessions.md` — handoff (Phase 3)
- `agent-workspace/research/claude-code-otel.md` — ColeMurray stack
- `agent-workspace/research/claude-code-telegram.md` — secret-redactor regex source
- `agent-workspace/research/ccs.md` — CLI surface + exit code taxonomy
- `agent-workspace/research/headless-trace.md` — TRACEPARENT propagation
- `PROJECT_CHARTER.md` — immutable vision
- `agent-workspace/constitution/invariants.md` — I-1 through I-15
- `agent-workspace/constitution/session-budgets.md` — 250K cap
- `agent-workspace/constitution/model-routing.md` — subagent × model selection
