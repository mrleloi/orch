# Phase 2 — Interfaces (Telegram + Web UI + Live Event Bridge + Full OTEL)

> **Session type**: Mix of FOCUSED_IMPL, MULTI_TASK_IMPL, VERIFY
> **Goal**: Telegram bot + Web UI dashboard operational, both consumers of core REST + SSE event stream. Full OTEL runtime wiring (HTTP-request trace_id in pino + OTLP exporter reachable). All Phase 1 carryover backlog landed.
> **Estimated duration**: 3-5 autonomous days
> **Pre-requisite**: Phase 1 COMPLETE (see `agent-workspace/memory/phase-1-complete.md`). 696/696 tests green on entry. Daemon bind 127.0.0.1:4141 confirmed. I-1 through I-14 satisfied.

---

## First 3 Tasks to Execute (pickup order)

1. **Task 2.0** — Phase 2 kickoff: packages layout, `@orch/shared` DTOs+SSE event types, env schema, Phase 1 carryover cleanup bucket A (dev.db gitignore, `$ORCH_HOME/orch.db` default, cheap `SELECT 1` startup check, `unhandledRejection` handler) (FOCUSED_IMPL, 70K, sandwich-dev)
2. **Task 2.1** — Live Event Bridge in core: `GET /api/v1/events/stream` SSE endpoint + typed event envelope + EventBus→SSE fan-out (FOCUSED_IMPL, 80K, sandwich-dev) — **blocks Telegram notifications AND Web UI live updates**
3. **Task 2.2** — Telegram bot scaffold: `packages/telegram` standalone process, Grammy init, auth middleware, /status command (FOCUSED_IMPL, 70K, sandwich-dev)

Rationale: 2.0 establishes shared contracts + clears Phase 1 backlog that affects every subsequent task. 2.1 is the spine both consumers subscribe to. 2.2 is the simplest real consumer — validates the SSE contract end-to-end before Web UI scaffold.

---

## Phase Goal (Success Criteria)

Phase 2 is COMPLETE when ALL of these hold:

**Telegram bot:**
- [ ] `packages/telegram` runs as a standalone process; `pnpm --filter @orch/telegram dev` boots, connects to Grammy, exits cleanly on SIGTERM
- [ ] Auth: `ORCH_TG_ALLOWED_CHAT_IDS` whitelist; unknown chat → polite refusal; whitelisted → allowed
- [ ] Commands implemented (D10 lean six): `/status`, `/queue`, `/pause`, `/resume`, `/tail`, `/cancel` — PLUS operator safety commands `/start <project>` (enqueue) and `/stop <session>` (I-6-gated)
- [ ] `/stop` and `/cancel` require inline-keyboard confirmation per I-6 (no bypass, per-operation gate)
- [ ] Bot subscribes to core SSE stream; receives `session.started`, `session.ended`, `rate_limit.detected`, `hook.received` (filtered) and posts formatted messages to the primary chat
- [ ] Outbound text passes through `redactSecrets()` (I-2-equivalent for PII; extended to redact plan-file paths that may contain PII per Phase 1 Task 1.9 carryover)
- [ ] Grammy flood-control wrapper swallows Telegram 429s without crashing the process

**Web UI:**
- [ ] `packages/web` (Vite + React + TS) serves at `http://127.0.0.1:4142` (distinct from core's 4141)
- [ ] Bearer auth: token entered on first visit, stored in `localStorage`, attached as `Authorization: Bearer <token>` header to every core fetch
- [ ] Pages (D11): Dashboard, Activity Feed, Kanban, Session Detail
- [ ] Live event stream: EventSource subscribes to `/api/v1/events/stream`, updates TanStack Query caches
- [ ] Auto-reconnect on SSE disconnect (exponential backoff, max 30s)
- [ ] Destructive actions (stop session, remove queue item) open confirm modal (I-6)
- [ ] Localhost-bind by default for the Vite preview/prod server (I-7 equivalent)

**Live event bridge:**
- [ ] `GET /api/v1/events/stream` endpoint on core daemon
- [ ] Bearer-auth gated (same token as REST)
- [ ] EventBus → SSE fan-out with typed envelope `{ type, payload, trace_id, ts }`
- [ ] Heartbeat comment line every 15s (SSE keep-alive, standard)
- [ ] Back-pressure safe: per-subscriber buffer bounded (drops oldest non-critical events if >200 pending)
- [ ] Round-trip smoke: `POST /api/v1/queue` → Telegram notification within 2s AND Web UI Dashboard card updates within 2s

**Full OTEL runtime wiring (Phase 1 deferral — evidence O1, O2):**
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:4318`) env variable read in `main.ts`; OTLP HTTP exporter registered
- [ ] `trace_id` + `span_id` appear in pino request-scoped log lines for every `/api/v1/*` HTTP request (not just `withSpan` blocks) — verified via integration test that captures pino output during a real HTTP call
- [ ] OTEL propagation from incoming `traceparent` header → NestJS request context → pino mixin → outgoing ClaudeCodeAdapter env
- [ ] Docker LGTM smoke script: `scripts/dev/otel-smoke.sh` boots stack + runs daemon + issues one HTTP request + asserts span visible at `:3000` (Grafana Tempo). Marked optional on CI (Docker not always available) but MANDATORY in the Phase 2 verifier's manual run.

**Phase 1 carryover landed (per `phase-1-complete.md` Deferred Items list):**
- [ ] Task 1.9 items: error classes structured fields; SIGKILL-timeout branch test; `cancel()` return type `Promise<void>`; concrete-subclass `toBeInstanceOf` assertions; re-entrant watchdog tick guard; `DEFAULT_*` constants centralized; `sessionKey` PII (plan filename) redaction; `stderrChunks` bounded ring buffer
- [ ] Task 1.10 items: P2002 unique-constraint catch; generic 60s bucket boundary clarification; remove unused `OrchStoreService` injection in `HooksService`; `hook.received` event emitted POST-transaction (not pre-tx)
- [ ] Task 1.14 item: OTEL `InMemorySpanExporter` E2E assertion re-narrowed once the real exporter channel is stable
- [ ] Task 1.16 items: `dev.db` gitignored; `DATABASE_URL` defaults to `file:${ORCH_HOME}/orch.db`; `unhandledRejection`/`uncaughtException` handlers in `main.ts`; startup `checkDbSchema` uses cheap `SELECT 1 FROM sqlite_master WHERE name='Session'`

**Gates:**
- [ ] `pnpm -r run typecheck` passes across all packages (core, cli, shared, telegram, web)
- [ ] `pnpm -r run lint` passes
- [ ] `pnpm -r run test` passes: target 696 → **~830-870** (+134 to +174 new tests across telegram handlers, web UI critical paths, SSE bridge, OTEL wiring, carryover fixes)
- [ ] All Phase 1 invariant greps still empty; NEW grep: `grep -rn "@orch/core" packages/telegram/src packages/web/src` → empty (I-4: telegram and web must not `require('@orch/core')` at runtime; they call HTTP API only)
- [ ] All three processes boot: `orch start` (core), `pnpm --filter @orch/telegram dev`, `pnpm --filter @orch/web dev`

---

## Architecture Decisions for Phase 2 (new — augments SYNTHESIS D1-D15)

### D16. Telegram bot = standalone process (not in-proc NestJS module)

- **Informed by**: Charter "project-agnostic core" + I-4 (one-way dep) + claudegram research (standalone pattern) + robustness (crashed bot must not take down the scheduler)
- **Decision**: `packages/telegram` is its own Node process. Boots independently. Connects to core via HTTP (`http://127.0.0.1:4141/api/v1/*`) + SSE (`GET /api/v1/events/stream`). Bearer token shared via `ORCH_API_BEARER_TOKEN` env. The bot never imports `@orch/core`; only imports `@orch/shared` for DTO types.
- **Consequence**: Bot can be restarted without touching core. Bot failure does NOT affect hook processing. Parallels the Web UI's network-client posture.

### D17. Web UI auth = Bearer token in localStorage (Phase 2); session cookies deferred

- **Informed by**: Charter S1/S3 + D12 (localhost bind) + simplicity principle
- **Decision**: First visit presents a token-input screen. Token stored in `localStorage` and attached to every request. No refresh tokens, no cookies, no CSRF dance — acceptable because the UI is localhost-only. When/if LAN binding is enabled later, upgrade to signed-cookie session + CSRF token (out of scope this phase; documented in `decisions/004-web-ui-auth-phase-2.md`).

### D18. Event stream = SSE (not WebSocket)

- **Informed by**: Phase 2 plan stub mentioning both; simplicity-first principle; D5 (hooks-first active signal)
- **Decision**: **SSE** (`text/event-stream`). Rationale: one-way server → client is 100% of our need; SSE is a single HTTP GET with auto-reconnect built into `EventSource`; no subprotocol negotiation, no ping/pong framing, no library dependency. If we need bidirectional in a future phase (e.g., terminal-in-browser), upgrade then. SSE works seamlessly with Fastify + Bearer auth + trace-propagation headers.
- **Consequence**: `packages/shared/src/events/sse-envelope.ts` defines the wire schema. Both consumers (`@orch/telegram`, `@orch/web`) parse via this schema; zod-validated per I-10.

### D19. OTEL HTTP-request propagation

- **Informed by**: Phase 1 Known Acceptable Deviation #2 (unit-test proof only; runtime channel deferred); I-9 (trace_id in logs); I-15 (token budget in spans — Phase 3 use, wiring now)
- **Decision**: Use `@opentelemetry/instrumentation-fastify` + `@opentelemetry/instrumentation-http` auto-instrumentations. They install Fastify hooks so every HTTP request runs inside a span; the existing `createPinoOtelMixin()` then injects `trace_id`/`span_id` into every request-scoped log automatically. OTLP HTTP exporter to `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:4318`).
- **Incoming `traceparent` header**: honored via `@opentelemetry/propagator-w3c-trace-context` (default). External callers (Web UI, Telegram bot, Claude Code via hook callbacks) can therefore propagate their own trace context in.
- **Consequence**: `main.ts` bootstraps SDK BEFORE Nest (autoinstrumentations must wrap `http`/`fastify` before first require). This ordering is the single most error-prone part of Phase 2 — Task 2.final-1 has a dedicated step verifying it.

### D20. Telegram subscriber + Web UI subscriber both use `@orch/shared` SSE envelope

- **Informed by**: I-10 (zod on all external input — SSE events ARE external to these consumers)
- **Decision**: `@orch/shared` exports `SseEnvelopeSchema` (zod). Both consumers parse every incoming event through it; bad events logged + dropped, not thrown. Guarantees bot and UI never choke on an envelope shape change.

### D21. Package manager discipline

- **Decision**: `packages/telegram` and `packages/web` are both pnpm workspace members with TypeScript strict, ESLint share, Vitest share (same root config). Web uses Vite+React+Tailwind+shadcn per Phase 2 plan stub; Telegram uses Grammy + pino (identical to core). Neither package has runtime dep on `@orch/core`; only dev dep on `@orch/shared`.

---

## Invariant Reaffirmation (which of I-1..I-15 Phase 2 newly exercises)

| Invariant | Phase 2 touch | New enforcement |
|---|---|---|
| I-1 (daemon-dumb) | Telegram/UI MUST NOT call LLMs directly | Grep `grep -rn "anthropic\|openai\|@anthropic-ai" packages/telegram/src packages/web/src` → empty (new) |
| I-3 (CLI subprocess only) | Telegram/UI never spawn claude | Same grep as I-1 catches it |
| I-4 (one-way dep) | **NEW focus**: Telegram + Web only call HTTP | `grep -rn "@orch/core" packages/telegram/src packages/web/src` → empty (NEW grep) |
| I-5 (credentials isolation) | Bot cannot read `~/.ccs/` | Grep across telegram/web src |
| I-6 (destructive confirmation) | Telegram inline-keyboard confirm; UI modal confirm; BOTH audited (audit log in core — Phase 1 carryover) | New test: bot `/stop` without confirm → replies with keyboard; never invokes API |
| I-7 (localhost bind) | Web UI dev + preview servers bind 127.0.0.1; SSE endpoint already localhost-bound | Startup log assertion |
| I-9 (trace_id in logs) | **NEW HTTP-request-level**: every `/api/v1/*` request log line has `trace_id` (Phase 1 had `withSpan` only) | Integration test: fire HTTP request + capture pino output + assert trace_id non-empty |
| I-10 (zod on external input) | SSE envelope on consumer side; Telegram command args; Web UI form input | Per-handler schema |
| I-11 (no silent transitions) | **NEW state machine events for bot/UI actions**: `operator.telegram.command_received`, `operator.web.action_requested`, `operator.stop_requested` | Each written to OTEL span + DomainEvent |
| I-14 (DI-held state) | Telegram bot service + Web UI have no module-level `let`/`var` (applies to bot server code) | Grep |

New: I-6 **audit log** — Phase 1 carryover not yet implemented. Phase 2 adds `OperatorActionLog` Prisma table rows for every Telegram-triggered and UI-triggered stop. Written atomically with the stop transition.

---

## Task Breakdown

### Task 2.0: Phase 2 Kickoff — Shared Contracts + Phase 1 Backlog Cleanup Bucket A
**Session type**: FOCUSED_IMPL
**Budget**: 70K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: None (Phase 1 exit)

**Part A — Contract (what it delivers)**:
- `packages/shared/src/events/sse-envelope.ts` — `SseEnvelope<T>` type + `SseEnvelopeSchema` (zod) with `type`, `payload`, `trace_id`, `span_id`, `ts` fields
- `packages/shared/src/events/event-types.ts` — string-literal union of ALL Phase 2 event types: `session.started`, `session.state_changed`, `session.ended`, `session.rate_limited`, `session.context_full`, `queue.enqueued`, `queue.state_changed`, `hook.received`, `operator.action`, `project.registered`
- `packages/shared/src/api/dto/*.ts` — DTOs already partially defined from Phase 1 REST (augment, don't duplicate); export typed `ApiClient` surface (types only — actual fetch client lives per-consumer)
- `packages/shared/src/env/schema.ts` — zod schema for every env var Phase 2 introduces: `ORCH_API_BEARER_TOKEN` (shared), `ORCH_TG_BOT_TOKEN`, `ORCH_TG_ALLOWED_CHAT_IDS` (comma-separated), `ORCH_WEB_PORT` (default 4142), `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:4318`)
- `packages/telegram/` and `packages/web/` package skeletons (`package.json`, `tsconfig.json`, `vitest.config.ts`, empty `src/index.ts`) — NO runtime code yet, just the scaffold
- **Phase 1 backlog bucket A landed in core**:
  - `.gitignore` adds `*.db`, `*.db-*`, `*.sqlite`
  - `main.ts` default `DATABASE_URL` → `file:${ORCH_HOME}/orch.db` (read via `@nestjs/config`; `ORCH_HOME` defaults to `~/.orch`)
  - `main.ts` `checkDbSchema` replaced with `SELECT 1 FROM sqlite_master WHERE name='Session'` (cheap, no Prisma heavy init)
  - `main.ts` adds `process.on('unhandledRejection')` + `process.on('uncaughtException')` handlers that log via pino + exit(1)

**Part B — Signatures + verification**:
```typescript
// packages/shared/src/events/sse-envelope.ts
export const SseEnvelopeSchema = z.object({
  type: z.enum(ALL_EVENT_TYPES),
  payload: z.unknown(),           // per-type refinement in event-types.ts
  trace_id: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  span_id: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  ts: z.string().datetime(),      // ISO-8601
});
export type SseEnvelope<T = unknown> = z.infer<typeof SseEnvelopeSchema> & { payload: T };
```
- Tests (~18): envelope schema valid/invalid; event-type enum exhaustive; env schema rejects missing required + defaults correctly
- Invariant grep (still empty): I-1/I-2/I-3/I-4/I-5/I-14 unchanged
- Integration test: daemon boots with `.gitignore` update + new default DATABASE_URL + `SELECT 1` startup check in <500ms cold (vs current heavy Prisma init path — Phase 1 observation)

---

### Task 2.1: Live Event Bridge — SSE Endpoint in Core
**Session type**: FOCUSED_IMPL
**Budget**: 80K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.0 (shared envelope)

**Part A — Contract**:
- `GET /api/v1/events/stream` endpoint on core daemon (Fastify SSE)
- Bearer-auth middleware (same as REST)
- Query param `?types=session.started,hook.received` for filtering (default: all)
- Heartbeat comment line (`: keepalive\n\n`) every 15s
- `EventBus` subscribes at endpoint entry; emits translated `SseEnvelope` to response stream
- Per-subscriber bounded queue: 200 events; if exceeded, drop oldest non-critical (`hook.received`) first, keep session lifecycle events always
- Disconnect cleanup: subscriber deregistered from EventBus on client close
- OTEL span per active subscription; span end on disconnect

**Part B — Signatures + verification**:
```typescript
// packages/core/src/modules/events/sse-controller.ts
@Controller('api/v1/events')
@UseGuards(BearerAuthGuard)
export class SseController {
  constructor(private eventBus: EventBusService, private tracing: TracingService) {}

  @Get('stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  async stream(
    @Query('types') types: string | undefined,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void>;
}

// packages/core/src/modules/events/sse-subscription.ts
export class SseSubscription {
  constructor(opts: { bus: EventBusService; filter?: Set<EventType>; maxBuffer: 200 });
  attach(res: FastifyReply): void;
  detach(): void;
  private dropOldestNonCritical(): void;
}
```
- Tests (~14):
  - Endpoint 401 without bearer
  - Subscribes to EventBus, receives emitted envelope
  - Filter query param applies correctly
  - Heartbeat line emitted at ~15s cadence (fake timers)
  - Buffer overflow drops oldest non-critical
  - Client disconnect deregisters (assert `listenerCount` drops)
  - OTEL span created + ended
  - Envelope matches `SseEnvelopeSchema`
- Invariant: I-9 (trace_id in envelope if active span); I-10 (no unvalidated payload shape — envelope typed); I-11 (subscription lifecycle emits events)
- **Carryover**: This task also addresses the Phase 1 Task 1.10 item "`hook.received` event emitted POST-transaction" by verifying that the SSE bridge never observes a `hook.received` envelope before the DB transaction commits. Add a race-condition test.

---

### Task 2.2: Telegram Bot Scaffold + Auth + `/status`
**Session type**: FOCUSED_IMPL
**Budget**: 70K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.0, 2.1

**Part A — Contract**:
- `packages/telegram/src/main.ts` — standalone boot; reads `ORCH_TG_BOT_TOKEN`, `ORCH_TG_ALLOWED_CHAT_IDS`, `ORCH_API_BEARER_TOKEN`, `ORCH_API_BASE_URL` (default `http://127.0.0.1:4141`) via zod-validated env
- `packages/telegram/src/auth/whitelist.middleware.ts` — Grammy middleware; rejects non-whitelisted chat IDs with polite refusal
- `packages/telegram/src/api/core-client.ts` — fetch-based client for `/api/v1/*` with bearer auth (copies the pattern from `packages/cli` — NO runtime dep on `@orch/core`)
- `packages/telegram/src/handlers/status.ts` — `/status` command; GETs `/api/v1/sessions/active` + `/api/v1/queue`; formats to single message; outbound text passes `redactSecrets()`
- Graceful shutdown on SIGTERM (drop Grammy long-poll, exit 0)
- Error wrapping: any `ctx.reply` failure logged, not thrown (addresses H-1 candidate rule)

**Part B — Signatures + verification**:
```typescript
// packages/telegram/src/auth/whitelist.middleware.ts
export function whitelistMiddleware(allowedIds: Set<number>): MiddlewareFn<Context>;

// packages/telegram/src/api/core-client.ts
export class CoreApiClient {
  constructor(opts: { baseUrl: string; bearerToken: string; logger: Logger });
  getActiveSession(): Promise<ActiveSessionDto | null>;
  getQueue(): Promise<QueueItemDto[]>;
  stopSession(id: string, confirm: true): Promise<void>;
  enqueue(projectId: string, planPath: string): Promise<QueueItemDto>;
}

// packages/telegram/src/handlers/status.ts
export function registerStatusHandler(bot: Bot, api: CoreApiClient, redactor: RedactorFn): void;
```
- Tests (~16):
  - Whitelist allows / denies / logs unknown
  - Handler formats active + queue correctly (snapshot test on 3 fixtures)
  - `ctx.reply` failure does not crash handler
  - Redactor applied to outbound text (plant a fake API key in a test payload)
  - Env schema rejects missing token
  - Graceful shutdown: spawn bot as child proc, send SIGTERM, assert exit 0 within 2s
- Invariant new grep: `grep -rn "@orch/core\|@anthropic-ai\|anthropic\|openai" packages/telegram/src` → empty
- **Carryover**: `DEFAULT_*` constants centralization (Phase 1 Task 1.9) — any `DEFAULT_*` Telegram needs (e.g., poll interval) declared in `packages/telegram/src/config/defaults.ts`.

---

### Task 2.3: Telegram Read-Only Commands — `/queue`, `/projects`, `/tail`, `/logs`
**Session type**: FOCUSED_IMPL
**Budget**: 80K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.2

**Part A — Contract**:
- `/queue` — list pending + in-flight queue items with position + project + plan-file name
- `/projects` — list registered projects + active session count each
- `/tail <N>` — last N lines of active session stdout (default 20; max 100). Uses core `GET /api/v1/sessions/:id/tail?lines=N`. If no active session, polite "no session running".
- `/logs <session-id>` — fetch full session transcript tail. Telegram 4096-char message limit → split into multi-message paged reply OR attach as a `.txt` file if >4096 chars.

**Part B — Signatures + verification**:
```typescript
// per-handler signature mirrors status.ts
export function registerQueueHandler(bot: Bot, api: CoreApiClient, redactor: RedactorFn): void;
export function registerProjectsHandler(...): void;
export function registerTailHandler(...): void;
export function registerLogsHandler(...): void;

// API additions in core (add to Task 2.1 or here — place here since consumer-driven)
// GET /api/v1/sessions/:id/tail?lines=N — returns { lines: string[], truncated: boolean }
```
- Tests (~20): per-handler happy + error + no-session + auth-refused paths
- `redactSecrets()` applied to every outbound message
- `/tail` honors `lines` max; clamps above 100
- `/logs` correctly switches to file-attachment at >4096 chars
- Invariant: same grep as 2.2

---

### Task 2.4: Telegram Control Commands — `/pause`, `/resume`, `/cancel`, `/stop`, `/start <project>`
**Session type**: FOCUSED_IMPL
**Budget**: 100K
**Subagent**: sandwich-dev (sonnet) **OR** task-implementer per subtask if >5 handlers (judgment: stay sandwich-dev, these are small handlers)
**Dependencies**: 2.3

**Part A — Contract**:
- `/pause` — POSTs `/api/v1/queue/pause`; replies "queue paused"
- `/resume` — POSTs `/api/v1/queue/resume`
- `/cancel` — cancels active session; requires inline-keyboard confirmation (I-6). 2-step: press command → bot replies with "Confirm cancel session X?" + Yes/No buttons → Yes invokes `/api/v1/sessions/:id/stop?confirm=1`
- `/stop <session-id>` — same pattern, explicit ID
- `/start <project> <plan-path>` — enqueue a plan. If `plan-path` relative, resolve under the project's plan dir via registry. Confirmation NOT required (enqueue is non-destructive)
- Grammy flood-control wrapper: wraps every `ctx.reply` in `withFloodControl(fn)` that catches Telegram 429 + backs off

**Part B — Signatures + verification**:
```typescript
// packages/telegram/src/middleware/flood-control.ts
export function withFloodControl<T>(fn: () => Promise<T>, logger: Logger): Promise<T | null>;

// packages/telegram/src/handlers/confirm-flow.ts
export async function requestConfirmation(
  ctx: Context,
  promptText: string,
  onConfirm: () => Promise<void>,
): Promise<void>;
// Internally: sends message with InlineKeyboard Yes/No; stores callback_data keyed by messageId; callback handler matches + executes or cancels.
```
- Tests (~24):
  - I-6: `/cancel` with no confirmation button pressed → NO API call fired
  - I-6: `/cancel` confirmed → one API call with `?confirm=1`
  - `/start` non-existent project → 404-equivalent polite message
  - Flood-control wrapper: simulate Telegram 429 → retries with backoff; max 3 retries then logs + drops
  - Auth: non-whitelisted chat → no destructive op ever fires
  - Reply redaction applied
- **I-6 audit log**: Phase 1 carryover — `OperatorActionLog` Prisma row written (via core API) when a confirmed destructive op executes. Added as part of core `POST /sessions/:id/stop`. Schema:
  ```prisma
  model OperatorActionLog {
    id         String   @id @default(cuid())
    actor      String   // "telegram:<chatId>" | "web:<tokenHash>" | "cli"
    action     String   // "session.stop" | "queue.pause" | ...
    target     String?  // session ID or queue item ID
    confirmed  Boolean
    createdAt  DateTime @default(now())
    traceId    String?
  }
  ```
- **Carryover bundle (Phase 1)**: Task 1.10 item "P2002 unique-constraint catch" — when the Phase 2 `OperatorActionLog` introduces a `@@unique([traceId, action])` OR any other new uniques, add the catch in a shared `handlePrismaError` helper; backfill into existing hooks dedup INSERT.

---

### Task 2.5: Telegram Event Subscriber — SSE client + notifications
**Session type**: FOCUSED_IMPL
**Budget**: 80K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.1, 2.4

**Part A — Contract**:
- `packages/telegram/src/events/sse-client.ts` — EventSource-like client built on `undici` (Node native `EventSource` stabilized in Node 20 but undici's fetch + async iteration is more robust). Auto-reconnects with exponential backoff (1s → 2s → 4s → max 30s).
- Envelope parsed through `SseEnvelopeSchema`; malformed → logged + dropped (never throws)
- `packages/telegram/src/notifications/dispatcher.ts` — per-event formatter + routing to primary chat ID. Rate-limited: max 10 notifications/min; overflow compressed into a single "N events suppressed" message
- Filter: `session.started`, `session.ended`, `session.rate_limited`, `session.context_full`, `queue.empty` (derived), `hook.received` (only for `UserPromptSubmit`, not noisy ones)
- Graceful reconnect: on SSE 401 (token rotated), exit 1 (process manager restarts with fresh env)

**Part B — Signatures + verification**:
```typescript
export interface SseClient {
  start(): Promise<void>;                           // begins connection loop
  stop(): Promise<void>;                            // cancels + closes
  onEvent(handler: (env: SseEnvelope) => void): void;
}
export function createSseClient(opts: {
  url: string; bearerToken: string; logger: Logger; reconnectBackoffMs?: number[];
}): SseClient;
```
- Tests (~20): reconnect on disconnect (mock fetch abort); envelope validation drops invalid; rate-limit formatter (feed 12 events in 30s → 10 sent + 1 suppression-summary); filter applied; 401 terminates cleanly
- Integration test: boot core daemon + telegram bot + fire a mock `session.started` via EventBus → bot receives within 500ms + posts formatted message (mock Grammy send)
- **Carryover**: Task 1.9 "`sessionKey` PII in plan-filename" — redactor extended to clip plan-filename to basename + hash; applied wherever session notifications quote the plan.

---

### Task 2.6: Web UI Scaffold + Auth + API Client
**Session type**: FOCUSED_IMPL
**Budget**: 70K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.0 (shared types)

**Part A — Contract**:
- `packages/web/` — Vite + React 18 + TypeScript + Tailwind + shadcn/ui (pinned versions per risk register)
- Router: React Router v6; routes `/`, `/activity`, `/kanban`, `/sessions/:id`, `/settings`
- Dev server: `127.0.0.1:4142`; preview server same; `vite.config.ts` explicit `server.host = '127.0.0.1'`
- Auth: token-gate component on first load. Token prompt → validated via `GET /api/v1/health` with bearer → stored in `localStorage`. Token invalid → clear storage + re-prompt.
- `packages/web/src/api/client.ts` — typed fetch wrapper imported from `@orch/shared` DTOs; attaches `Authorization: Bearer <token>` header; 401 → evict token + redirect to prompt
- TanStack Query v5 setup with reasonable defaults (`staleTime: 30s` for cold data)

**Part B — Signatures + verification**:
```typescript
// packages/web/src/api/client.ts
export class ApiClient {
  constructor(opts: { baseUrl: string; getToken: () => string | null; onUnauthorized: () => void });
  queue: { list(): Promise<QueueItemDto[]>; enqueue(...): Promise<QueueItemDto> };
  sessions: { active(): Promise<ActiveSessionDto | null>; stop(id: string, confirm: true): Promise<void> };
  projects: { list(): Promise<ProjectDto[]> };
}

// packages/web/src/auth/token-gate.tsx
export function TokenGate(props: { children: ReactNode }): JSX.Element;
```
- Tests (~16): token-gate renders prompt when no token; validates via /health; stores + proceeds on valid; 401 mid-session evicts token; all API client methods happy + error-wrapped
- Vitest + React Testing Library; jsdom env
- **Invariant grep**: `grep -rn "@orch/core\|@anthropic-ai\|anthropic\|openai" packages/web/src` → empty (I-4 + I-1)
- **Carryover**: Task 1.9 "error classes structured fields" — Web UI error boundary displays `DomainError.toJSON()` structured fields (code, detailsRedacted) rather than raw `err.message`. Requires the core-side structured-field work; land both in same subtask pair.

---

### Task 2.7: Web UI Dashboard + Kanban Pages
**Session type**: MULTI_TASK_IMPL (2 pages, shared pattern)
**Budget**: 140K
**Subagent**: task-implementer per page (sonnet) + spec-compliance-reviewer + code-quality-reviewer per page
**Dependencies**: 2.6, 2.1 (SSE bridge live)

**Part A — Contract**:
- **Dashboard (`/`)**: 4 stat cards (active session, queue depth, daily tokens, daily cost); recent-sessions list (last 10)
- **Kanban (`/kanban`)**: 4 columns (Pending, Running, Completed, Failed); cards show project + plan-file + started-at + stop-button (if running)
- Both pages subscribe to SSE; invalidate TanStack Query caches on relevant events
- Loading + error + empty states for every query
- Destructive stop: confirm modal (shadcn `<AlertDialog>`) — I-6 gate

**Part B — Signatures + verification**:
```typescript
// packages/web/src/hooks/use-sse-events.ts
export function useSseEvents(opts: {
  url: string; filter?: EventType[]; onEvent: (env: SseEnvelope) => void;
}): { connected: boolean; lastError: Error | null };

// packages/web/src/pages/dashboard.tsx
export function DashboardPage(): JSX.Element;

// packages/web/src/pages/kanban.tsx
export function KanbanPage(): JSX.Element;

// packages/web/src/components/stop-session-dialog.tsx
export function StopSessionDialog(props: { sessionId: string; onConfirm: () => void }): JSX.Element;
```
- Tests (~30): SSE hook reconnects; stat cards render + update on event; kanban column filter correct; stop-confirm dialog requires click-through; auth-401 evicts token
- Playwright smoke (single happy path, optional CI — see Task 2.final): drop fake plan via API → kanban pending column updates within 2s
- **Carryover**: Task 1.10 "`hook.received` POST-transaction emit" — the kanban's "Running" column must never see a card whose underlying session is mid-transaction. Add an integration-level assertion: fire DB error mid-transition; UI sees no flicker.

---

### Task 2.8: Web UI Activity Feed + Session Detail Pages
**Session type**: MULTI_TASK_IMPL (2 pages)
**Budget**: 130K
**Subagent**: task-implementer per page (sonnet) + reviewers
**Dependencies**: 2.7

**Part A — Contract**:
- **Activity Feed (`/activity`)**: live SSE tail; max 200 events in view (Agent-Monitor pattern); pause button freezes buffer; resume replays; filter bar by event type
- **Session Detail (`/sessions/:id`)**: transcript viewer (paginated, reads `/api/v1/sessions/:id/transcript?offset=&limit=`); token/cost chart (recharts); trace-link button (opens Grafana Tempo URL in new tab, URL built from `trace_id` + env-configured Tempo base URL)
- Both pages: loading + error + empty states; keyboard-navigable

**Part B — Signatures + verification**:
```typescript
// packages/web/src/pages/activity.tsx
export function ActivityPage(): JSX.Element;
// Internal: buffer ring of size 200; pause=true freezes updates

// packages/web/src/pages/session-detail.tsx
export function SessionDetailPage(): JSX.Element;
// Uses useParams() for :id; fetches metadata + paginated transcript + token series

// core API additions (add to Task 2.1 or carry — placed here to co-locate):
// GET /api/v1/sessions/:id/transcript?offset=N&limit=M — returns { lines: string[], hasMore: boolean }
// GET /api/v1/sessions/:id/metrics — returns { tokenSeries: [{ts, input, output}], costUsd: number, traceId: string }
```
- Tests (~28): pause/resume correctness; ring buffer enforces 200 cap; filter bar; trace-link URL builder; metrics chart renders + updates; transcript pagination stops at hasMore=false
- **Carryover**: Task 1.9 "`stderrChunks` bounded ring buffer" — tied to transcript pagination; assert an integration test that a 100MB-of-stderr session does not OOM the daemon; ring buffer capped at e.g. 50k lines.

---

### Task 2.9: Full OTEL Runtime Wiring + HTTP-Level trace_id
**Session type**: FOCUSED_IMPL
**Budget**: 90K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.0 (OTEL env in shared)

**Part A — Contract**:
- Install + register `@opentelemetry/auto-instrumentations-node` (pragmatic: one dep instead of per-lib wiring); OR targeted: `@opentelemetry/instrumentation-http` + `@opentelemetry/instrumentation-fastify` + `@opentelemetry/instrumentation-pino`
- `main.ts` initializes OTEL SDK BEFORE `NestFactory.create()`; uses `require('./tracing-bootstrap')` at the very top (or `--require` flag)
- OTLP HTTP exporter → `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:4318`); resource attributes `service.name=orch-core`, `service.version=<pkg.version>`
- Incoming `traceparent` header honored (W3C propagator default-registered)
- Outgoing ClaudeCodeAdapter env already passes `TRACEPARENT` (Phase 1); verify still works
- pino mixin (Phase 1 `createPinoOtelMixin()`) unchanged but now runs inside auto-instrumented HTTP spans → every request log line has `trace_id` + `span_id`
- `scripts/dev/otel-smoke.sh` — boots LGTM stack, daemon, curls `GET /healthz`, greps pino stdout for `"trace_id":"`, curls Tempo for the span, exits 0/1
- Telegram + Web UI SSE consumers propagate trace context: Telegram extracts from SSE envelope + creates child span per handled event; Web UI reads envelope `trace_id` for the trace-link button

**Part B — Signatures + verification**:
```typescript
// packages/core/src/tracing-bootstrap.ts   (loaded before AppModule)
export function bootstrapTracing(opts: { endpoint: string; serviceName: string }): NodeSDK;
```
- Tests (~14):
  - Unit: bootstrap registers HTTP + Fastify instrumentations without error
  - Integration: spin Fastify + mock exporter; fire GET /api/v1/health with `traceparent: 00-<parent-id>-<span-id>-01`; assert a child span is emitted with that parent
  - Integration: capture pino output during a real HTTP request; assert EVERY log line in the request scope has `trace_id` (this was the Phase 1 deviation — now resolved)
  - Integration: ClaudeCodeAdapter spawn still receives `TRACEPARENT` env with correct span ID
- **Carryover**: Task 1.14 "OTEL `InMemorySpanExporter` E2E assertion narrowed" — with runtime channel now stable, re-expand the Phase 1 E2E test to assert actual span exported + parent-child linkage
- Smoke manual: Phase 2 verifier runs `otel-smoke.sh` and visually confirms span at Grafana Tempo `http://127.0.0.1:3000`

---

### Task 2.10: Phase 1 Backlog Cleanup Bucket B (session-module + hooks-receiver residuals)
**Session type**: MULTI_TASK_IMPL (many small items)
**Budget**: 140K
**Subagent**: task-implementer per item (sonnet) + spec-compliance-reviewer + code-quality-reviewer
**Dependencies**: 2.9 (ensures OTEL stable before touching instrumentation-adjacent code)

**Part A — Contract (each an independent small task; pairs into ~12 implementer invocations)**:
- **2.10.a** — Error classes structured fields: `DomainError` gains `code: string`, `details: Record<string, unknown>` (redacted), `retryable: boolean`. Backfill across existing subclasses. Aligns with Web UI error boundary (Task 2.6)
- **2.10.b** — SIGKILL-timeout branch test: integration test where adapter's soft-kill ignored → hard-kill fires → DomainError thrown
- **2.10.c** — `cancel()` return type `void` → `Promise<void>` across `ClaudeCodeAdapter`, `SessionManager`, `RequestQueue`; callers awaited
- **2.10.d** — Tighten `toBeInstanceOf(Error)` → concrete subclass in 6 flagged specs
- **2.10.e** — Re-entrant watchdog tick guard: `AgentWatchdog.tick()` guarded by `this.ticking: boolean`
- **2.10.f** — `DEFAULT_*` constants consolidated to `packages/core/src/config/defaults.ts`
- **2.10.g** — `sessionKey` PII redaction: plan-filename basename-hashed before log; round-trippable for debug via optional env `ORCH_DEBUG_SESSION_KEYS=1` (dev only, never default)
- **2.10.h** — `stderrChunks` bounded ring buffer (max 50k lines, oldest dropped); coupled to Task 2.8 transcript pagination
- **2.10.i** — P2002 unique-constraint catch in a shared `handlePrismaError(err): DomainError` helper; applied in hooks dedup INSERT + `OperatorActionLog` INSERT
- **2.10.j** — Generic 60s bucket boundary clarified: comment + test pinning "boundary = arrival-second truncated to wall-clock second / 60"
- **2.10.k** — Remove unused `OrchStoreService` injection from `HooksService`
- **2.10.l** — `hook.received` emitted POST-transaction (moved out of `prisma.$transaction`)

**Part B — Signatures + verification**:
- Per-item acceptance test; subagent-driven-development skill mandatory for this task (>3 items)
- Invariant grep: I-1/I-2/I-3/I-4/I-5/I-14 all still empty
- Total test delta: ~+40
- Each item committed as a separate logical chunk to preserve diff narrative

---

### Task 2.11: Integration E2E — Round-Trip Smoke
**Session type**: FOCUSED_IMPL
**Budget**: 70K
**Subagent**: sandwich-dev (sonnet) — testing-only session (no production code)
**Dependencies**: 2.5, 2.8, 2.9, 2.10

**Part A — Contract**:
- `tests/e2e/round-trip.spec.ts` — Vitest (NOT Playwright; keep deps lean). Boots three processes in-harness:
  - Core daemon (supertest over Fastify instance; no real HTTP listen required for this variant)
  - Mock Telegram bot using in-memory Grammy mock
  - Web UI rendered via RTL (jsdom) mounted at `EventSource`-polyfilled endpoint
- Scenario: drop plan file → queue update event arrives at bot (verified) + kanban pending card appears (verified); mock session complete → bot sends "session ended" + kanban moves card to completed; stop-via-web-ui → confirm dialog → POST `/sessions/:id/stop?confirm=1` → `OperatorActionLog` row written + bot receives `session.ended`
- Assertion on pino output: every log line in the round-trip has a `trace_id`
- Asserts `OperatorActionLog` table has one row per destructive op

**Part B — Signatures + verification**:
- Tests: single round-trip spec (~8 logical assertions)
- Must pass in CI without Docker (all services in-proc); LGTM stack not required
- Budget-sensitive: do NOT balloon into full Playwright browser harness — deferred to Phase 4

---

### Task 2.12: Phase 2 Verification Gate (adversarial)
**Session type**: VERIFY
**Budget**: 60K
**Subagent**: sandwich-verifier (opus) — MANDATORY fresh context per autonomous-protocol.md + agent-notes.md rule
**Dependencies**: 2.0 through 2.11

**Inputs**:
- All code written in Phase 2
- Test output + coverage report (~830-870 tests expected)
- All Phase 1 invariant greps (I-1, I-2, I-3, I-4, I-5, I-14)
- NEW greps: `grep -rn "@orch/core" packages/telegram/src packages/web/src` empty; `grep -rn "anthropic\|openai" packages/telegram/src packages/web/src` empty
- Charter + invariants.md + architecture.md
- Phase 1 carryover checklist (must be 100% cleared)
- Manual smoke: boot all three processes; verify SSE round-trip; verify OTEL Grafana smoke script

**Output**: verdict PASS / PASS_WITH_CONCERNS / APPROVED_AFTER_FIX / FAIL + specific findings per Task 1.16 template

**Gate**: advance to Phase 3 only on PASS or PASS_WITH_CONCERNS (minor). `APPROVED_AFTER_FIX` → narrow-fix cycle budget of 40K (per agent-notes rule: "plan for a 40K narrow fix cycle after verification").

---

### Task 2.13: Phase 2 Close (housekeeping)
**Session type**: FOCUSED_IMPL
**Budget**: 15K
**Subagent**: sandwich-dev (sonnet)
**Dependencies**: 2.12 PASS

**Deliverables**:
- `agent-workspace/memory/phase-2-complete.md` written (mirror of `phase-1-complete.md` shape: tasks completed, test counts, daemon state, invariants satisfied, key decisions landed, deferred items → Phase 3)
- `agent-workspace/memory/current-execution.md` updated → active phase = Phase 3
- Move this plan from `pending/phase-2-interfaces.md` to `completed/phase-2-interfaces.md`
- Open `pending/phase-3-handoff-and-budget.md` stub (Phase 3 scope per Phase 1 plan "Deferred to Phase 3": handoff context builder L0+L1, context-budget enforcer, cron scheduler, session-detail trace-link polish, Langfuse alt-backend toggle)

---

## Dependencies (critical path)

```
2.0 ──► 2.1 ──┬──► 2.2 ──► 2.3 ──► 2.4 ──► 2.5 ──────────────┐
              │                                              │
              └──► 2.6 ──► 2.7 ──► 2.8 ─────────────────────┤
                                                             │
                       2.9 ────────────────────────────────► 2.10 ──► 2.11 ──► 2.12 ──► 2.13
```

Blocking relationships:
- **2.0 blocks everything** (shared types + backlog bucket A)
- **2.1 blocks 2.5, 2.7, 2.8** (SSE spine for both consumers' live features)
- **2.2 blocks 2.3, 2.4, 2.5** (Telegram sequential build)
- **2.6 blocks 2.7, 2.8** (Web UI scaffold before pages)
- **2.9 can run in parallel with Telegram + Web UI tracks** (touches core instrumentation only)
- **2.10 waits for 2.9** (OTEL stable before touching error-class fields instrumented via spans)
- **2.11 waits for 2.5 + 2.8 + 2.10** (E2E needs all three consumer paths + cleanup)
- **2.12 waits for everything** (adversarial verify)
- **2.13 waits for 2.12 PASS**

Parallelizable (future multi-session scheduler or human-driven): (2.2..2.5 Telegram track) concurrently with (2.6..2.8 Web UI track); 2.9 concurrently with both consumer tracks.

---

## Budget Roll-up

| # | Task | Type | Budget | Subagent |
|---|---|---|---|---|
| 2.0 | Kickoff: shared contracts + backlog bucket A | FOCUSED_IMPL | 70K | sandwich-dev |
| 2.1 | Live Event Bridge (SSE endpoint) | FOCUSED_IMPL | 80K | sandwich-dev |
| 2.2 | Telegram scaffold + auth + /status | FOCUSED_IMPL | 70K | sandwich-dev |
| 2.3 | Telegram read-only commands | FOCUSED_IMPL | 80K | sandwich-dev |
| 2.4 | Telegram control commands + I-6 confirm | FOCUSED_IMPL | 100K | sandwich-dev |
| 2.5 | Telegram SSE subscriber + notifications | FOCUSED_IMPL | 80K | sandwich-dev |
| 2.6 | Web UI scaffold + auth + API client | FOCUSED_IMPL | 70K | sandwich-dev |
| 2.7 | Web UI Dashboard + Kanban pages | MULTI_TASK_IMPL | 140K | task-implementer×2 + reviewers |
| 2.8 | Web UI Activity Feed + Session Detail | MULTI_TASK_IMPL | 130K | task-implementer×2 + reviewers |
| 2.9 | Full OTEL runtime wiring + HTTP trace_id | FOCUSED_IMPL | 90K | sandwich-dev |
| 2.10 | Phase 1 backlog bucket B (12 items) | MULTI_TASK_IMPL | 140K | task-implementer×~12 + reviewers |
| 2.11 | Integration E2E round-trip smoke | FOCUSED_IMPL | 70K | sandwich-dev |
| 2.12 | Phase 2 verification gate | VERIFY | 60K | sandwich-verifier (opus) |
| 2.13 | Phase 2 close (housekeeping) | FOCUSED_IMPL | 15K | sandwich-dev |
| **Total** | | | **~1,195K across 14 sessions** | |

No session exceeds the 250K cap (2.7 @ 140K + 2.8 @ 130K + 2.10 @ 140K all well below; watchdog at 200K threshold still applies).

Subagent roll-up (per model-routing.md):
- `sandwich-dev` (sonnet): **9 invocations** (2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 2.11, 2.13 = 10 — 2.13 is trivial housekeeping)
- `task-implementer` (sonnet): **~16 invocations** (2 in 2.7, 2 in 2.8, ~12 in 2.10)
- `spec-compliance-reviewer` + `code-quality-reviewer` (sonnet): paired per task-implementer invocation
- `sandwich-verifier` (opus): **1 invocation** (2.12)
- `master-planner` (opus): **0** (this is the plan itself)
- `sandwich-architect`: **0 planned** — escalate if mid-phase replan needed
- Estimated opus usage: 60K (verify) + ~30K (narrow-fix replan risk) = ~90K total opus envelope

---

## Invariants Enforced (per task)

| Invariant | Enforced by task |
|---|---|
| I-1 (daemon-dumb) | 2.2/2.6 new greps over telegram + web; 2.12 adversarial |
| I-2 (project-agnostic) | 2.12 re-run grep |
| I-3 (CLI subprocess, no SDK) | 2.12 re-run grep |
| **I-4 (one-way dep — NEW Phase 2 focus)** | 2.2/2.6 new grep `grep -rn "@orch/core" packages/{telegram,web}/src` empty |
| I-5 (no ~/.ccs/, ~/.claude/) | 2.12 grep over all new packages |
| **I-6 (destructive confirm + audit log — expanded)** | 2.4 inline-keyboard test; 2.7 AlertDialog test; 2.4 `OperatorActionLog` row written per confirmed op |
| I-7 (localhost default) | 2.6 Vite `server.host='127.0.0.1'` + 2.12 boot-time log assertion |
| I-8 (idempotent hooks) | unchanged from Phase 1; re-verified at 2.11 |
| **I-9 (trace_id in ALL HTTP request logs — NEW)** | 2.9 integration test asserts every line; 2.11 E2E asserts round-trip |
| I-10 (zod on external input) | 2.0 SSE envelope schema; 2.2 bot env schema; 2.6 web UI form schemas |
| **I-11 (no silent transitions — NEW events)** | 2.4 `operator.telegram.*` + 2.7 `operator.web.*` emit OTEL events |
| I-12 (adapter failure isolation) | 2.9 external OTLP exporter errors wrapped as warning not thrown |
| I-13 (test isolation) | 2.11 in-proc only; no Docker for CI path |
| I-14 (no singleton state outside DI) | 2.2/2.6 grep `^let \|^var ` across new packages |
| I-15 (token budget in spans) | still Phase 3 (LLM invocation lives inside workers, not Phase 2 scope) |

---

## Risks & Mitigations

- **Risk**: OTEL SDK bootstrap ordering wrong → auto-instrumentations miss HTTP server. **Mitigation**: Task 2.9 dedicated; `tracing-bootstrap.ts` loaded via Node `--require` flag in `pnpm dev` script; integration test asserts instrumentation registered before first request.
- **Risk**: Fastify + SSE + Nest's response handling not compatible → have to use `res.raw` ugly path. **Mitigation**: Task 2.1 includes a 15-min spike early to confirm Fastify SSE pattern (`@fastify/sse` OR raw response); document the decision.
- **Risk**: Grammy flood-control + sequentialize edge cases → bot misses commands. **Mitigation**: Research candidate rule H-1 promoted to Task 2.2 enforcement; every handler wrapped in `withFloodControl`; spec test simulates 429.
- **Risk**: SSE client in Node lacks native EventSource reconnection → subtle bugs. **Mitigation**: use undici streaming fetch + hand-rolled reconnect loop; covered by 2.5 tests including disconnect-mid-event.
- **Risk**: Web UI bundle size with shadcn grows fast → slow first paint. **Mitigation**: pin versions; React.lazy on `/sessions/:id` route; monitor at 2.12.
- **Risk**: `OperatorActionLog` schema addition causes migration drift with fresh Phase 1 DBs in the wild. **Mitigation**: new Prisma migration; `prisma migrate deploy` runs at startup (already wired Phase 1); `.gitignore dev.db` from 2.0 prevents committed-DB conflicts.
- **Risk**: Phase 1 carryover bucket B (2.10) balloons to >140K. **Mitigation**: pre-authorized split at 2.10.f/2.10.g boundary (domain-side vs. session-side); if overrun, spawn 2.10-part-2 fresh session with handoff.
- **Risk**: Token budget for 2.7 + 2.8 Web UI pages (140K + 130K) lures into single-session attempt → quality cliff. **Mitigation**: both marked MULTI_TASK_IMPL with task-implementer-per-page; reviewers after each page; never merged into one FOCUSED_IMPL.
- **Risk**: The "standalone Telegram process" means two processes to supervise locally. **Mitigation**: `orch start` (CLI, Phase 1) extended in Task 2.13 close to optionally spawn `orch-telegram` as a child with `detached: false`, logs merged; fully documented in the Phase 2 README update at 2.13.
- **Risk**: Verifier finds wiring-gap (Phase 1 lesson: 4 MAJOR findings were wiring gaps). **Mitigation**: every "wire at boundary" subtask (redactor in Telegram outbound, pino-OTEL mixin at HTTP level, SSE back-pressure cleanup on disconnect) has an explicit wiring-verification test AND is listed as a phase-exit criterion checkbox above.

---

## Out of Scope for Phase 2

(Deferred to Phase 3+ or explicitly rejected)

**Deferred to Phase 3:**
- Handoff context builder (L0 sync + L1 in-spawned-subprocess) — SYNTHESIS D8
- Context-budget enforcer (soft@200K, hard@230K trigger)
- Langfuse alternative backend toggle (Grafana LGTM default, Langfuse opt-in)
- Cron scheduler + EventBus decouple
- Web UI charts/metrics polish (tokens-over-time, cost-over-time advanced panels beyond the simple series in 2.8)
- Telegram classic-mode commands (`/cd`, `/ls`, `/git`, `/actions`)
- Mobile-responsive polish for Web UI (basic responsive in 2.6/2.7 via Tailwind; full polish Phase 3)
- Docker Compose assembly of all packages (deferred — Phase 2 ships pnpm-workspace-based dev flow only)

**Deferred to Phase 4:**
- Full Playwright browser-harness E2E
- Session-cookie auth (replaces localStorage Bearer) — when LAN binding enabled
- Multi-user Web UI / team mode
- Plugin system

**Rejected (v1 scope):**
- Discord/Slack adapters (channel-adapter abstraction remains interface-only until 2+ real consumers exist)
- Voice commands in Telegram
- LLM-generated `/summary` command (I-1: no LLM in daemon; belongs in Phase 3 worker-side feature)
- WebSocket (SSE chosen — D18)
- Drag-and-drop kanban (read-mostly v1)
- Settings editing in Web UI (view-only v1)

---

## Hard Rules Carried

- **I-6**: no destructive op without confirmation; EVERY Telegram + Web UI stop/cancel/destructive path gated by inline-keyboard or AlertDialog AND logged to `OperatorActionLog` (audit-log carryover)
- **I-3**: no Agent SDK anywhere — bot and UI never import `@anthropic-ai/*`; enforced by grep in 2.12
- **I-2**: no hardcoded "stockforge" in any new package; `packages/telegram/src` and `packages/web/src` grep empty
- **I-14**: domain layer (`packages/core/src/domain/`) remains framework-free; Phase 2 adds NO domain mutations (only module + adapter layer work)
- **Project rule (agent-notes 2026-04-24)**: every `Agent` dispatch MUST use `run_in_background: true` — applies to every task-implementer, reviewer, and verifier invocation in Phase 2
- **Project rule (agent-notes 2026-04-24)**: every new Claude Code session spawned during Phase 2 uses `claude --rc "orch-<slug>"` — applies when session-handoff is needed
- **Project rule (agent-notes 2026-04-25)**: NestJS interface-injection pattern forbidden — any new service in Telegram or Web UI that would be "inject IFoo" must use concrete class OR explicit InjectionToken + useClass provider
- **Project rule (agent-notes 2026-04-25)**: Fastify `formatters.log` depth guard — any new log formatter in Telegram/Web uses `MAX_DEPTH=10` (copy pattern from `redact-log-object.ts`)
- **Project rule (agent-notes 2026-04-25)**: security primitives done-check — `redactSecrets()` must be WIRED at every new outbound text boundary (Telegram reply, Web UI error display via DomainError, SSE envelope payload stringify), each with an integration test that plants a leaky secret and asserts it comes out redacted
- **Project rule (agent-notes 2026-04-25)**: Verifier (opus, fresh context) at every phase end is MANDATORY; Task 2.12 budgeted 60K + 40K narrow-fix buffer; "APPROVED_AFTER_FIX" is the expected norm
- **I-6 spawned-mode**: Phase 2 code paths used by autonomous operator (none yet — operator.action audit covers manual ops only) have no bypass path; pre-authorized-flag pattern reserved for Phase 3 autonomous scheduler
- **No `git commit`** unless user explicitly requests — stage only; applies to every task-implementer and sandwich-dev invocation

---

## References

- `PROJECT_CHARTER.md` — immutable vision; Phase 2 success = charter F5 (Telegram) + F6 (Web UI) + O1/O2 (OTEL observable)
- `agent-workspace/memory/phase-1-complete.md` — exit state + carryover inventory
- `agent-workspace/constitution/invariants.md` — I-1 through I-15 (I-4, I-6, I-7, I-9, I-11 newly exercised this phase)
- `agent-workspace/constitution/architecture.md` — module boundaries; telegram + web = leaf packages, never importers of core
- `agent-workspace/constitution/session-budgets.md` — 250K cap; per-session watchdog 200K
- `agent-workspace/constitution/model-routing.md` — opus for verify/planner only; sonnet for impl
- `agent-workspace/constitution/autonomous-protocol.md` — phase verification mandatory
- `agent-workspace/research/SYNTHESIS.md` — D9 (channel adapter), D10 (Telegram 6 commands), D11 (Web UI 4 pages), D12 (security), D14 (TranscriptCache)
- `agent-workspace/memory/agent-notes.md` — 12 learned rules; applied throughout (esp. DI gotcha, Fastify depth guard, wire-at-boundary, verifier mandatory)
- `agent-workspace/session-plans/completed/phase-1-core.md` — structural template for this plan
- `decisions/004-web-ui-auth-phase-2.md` — TO CREATE during 2.6 (Bearer+localStorage rationale)
- `decisions/005-sse-over-websocket.md` — TO CREATE during 2.1 (SSE rationale)
- `decisions/006-telegram-standalone-process.md` — TO CREATE during 2.2 (standalone vs. in-proc)
- `decisions/007-otel-bootstrap-ordering.md` — TO CREATE during 2.9 (pre-Nest bootstrap rationale)
