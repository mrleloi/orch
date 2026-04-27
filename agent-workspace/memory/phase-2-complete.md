# Phase 2 — Interfaces (Telegram + Web UI + Live Event Bridge + Full OTEL)

**Completed**: 2026-04-25
**Duration**: ~1 autonomous day (sessions #8–#18 on 2026-04-25, continuing from Phase 1)
**Baseline**: Phase 1 complete; 707 tests (685 core + 22 CLI) on entry; daemon boots port 4141

---

## Tasks Completed

### Task 2.0 — Phase 2 Kickoff Scaffolding
**Outcome**: `@orch/shared` package created with DTOs, SSE event types, `SseEnvelopeSchema` (zod). `@orch/telegram` and `@orch/web-ui` workspace packages scaffolded. Phase 1 carryover Bucket A landed: `dev.db` gitignored, `$ORCH_HOME/orch.db` default, cheap `SELECT 1` startup DB check, `unhandledRejection`/`uncaughtException` handlers in `main.ts`.
**Test delta**: +34 (707 → 741)

### Task 2.1 — SSE Live Event Bridge
**Outcome**: `GET /api/v1/events/stream` SSE endpoint on core daemon. Bearer-auth gated (`?token=` fallback for EventSource). `EventBus → SseSubscription` fan-out with typed `WireEnvelope { type, payload, trace_id, ts }`. Heartbeat comment every 15s. Per-subscriber bounded buffer (200 events; drops oldest non-critical on overflow). `SseModule` registered in `AppModule`.
**Test delta**: +17 (741 → 758)

### Task 2.2 — Telegram Bot Scaffold + /status
**Outcome**: `packages/telegram` standalone Grammy process. `ORCH_TG_ALLOWED_CHAT_IDS` whitelist auth middleware. `/status` command returns daemon health JSON. `OrchApiClient` HTTP wrapper. Grammy flood-control wrapper swallows 429s. `SIGTERM` handler — clean exit.
**Test delta**: +32 (758 → 790 across core + telegram)

### Task 2.3 — Telegram Read-Only Commands
**Outcome**: `/queue`, `/sessions`, `/projects` commands implemented. Formatted message builders with secret redaction via `redactSecrets()`. Paginated output for long queues.
**Test delta**: +39 (790 → 829)

### Task 2.4 — Telegram Control Commands + I-6
**Outcome**: `/start <project>`, `/stop <session>`, `/cancel <session>`, `/pause`, `/resume` commands. `/stop` and `/cancel` require inline-keyboard confirmation per I-6. `?confirm=1` forwarded to core REST. Rate-limiting guard on destructive ops.
**Test delta**: +43 (829 → 872)

### Task 2.5 — Telegram SSE Subscriber + Notifications
**Outcome**: SSE subscriber in `packages/telegram`. Connects to `/api/v1/events/stream`, parses via `SseEnvelopeSchema` (I-10). Handles `session.started`, `session.ended`, `rate_limit.detected`, `hook.received` — posts formatted messages to primary chat. Auto-reconnect with exponential backoff (max 30s). Outbound text passes through `redactSecrets()`.
**Test delta**: +27 (872 → 899)

### Task 2.6 — Web UI Scaffold + Auth + ApiClient
**Outcome**: `packages/web-ui` Vite + React + TS scaffold at `http://127.0.0.1:4142`. Bearer token login screen; token stored in `localStorage`; attached to every fetch. `ApiClient` wrapper with base URL from `VITE_ORCH_API_URL`. TanStack Query wired. Localhost-bind enforced (Vite preview server).
**Test delta**: +30 (899 → 929; web-ui tests start)

### Task 2.7 — Web UI Dashboard + Kanban (5 subtasks)
**Outcome**: Dashboard page (active sessions count, queue depth, project list). Kanban view of queue items (columns: queued, active, completed, error). Live updates via `useSseEvents` hook subscribed to SSE stream. `MockEventSource` test harness established. TanStack Query cache invalidation on SSE events.
**Test delta**: +54 (web-ui 33 → 87; cumulative 929 → 983)

### Task 2.8 — Activity Feed + Session Detail (4 subtasks + PRE-WORK)
**Outcome**: PRE-WORK: `BearerAuthGuard` `?token=` fallback for SSE (EventSource cannot set headers). `ActivityFeedPage` with Agent-Monitor pattern (max 200 in-memory events, all types). `SessionDetailPage` with log tail panel, span timeline (trace_id link), session metadata. `useSseEvents` URL helper appends `?token=` for SSE connection.
**Test delta**: +9 core, +51 web-ui (web-ui 87 → 138; core 767 → 776 — later partially reversed in 2.11 dedup cleanup)

### Task 2.9 — Full OTEL Runtime Wiring + HTTP trace_id
**Outcome**: `@opentelemetry/instrumentation-fastify` + `@opentelemetry/instrumentation-http` auto-instrumentations. `bootstrapTracing()` called in `main.ts` BEFORE `NestFactory.create()`. `trace_id`/`span_id` appear in pino request-scoped log lines for every `/api/v1/*` HTTP request. OTLP HTTP exporter to `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:4318`). `traceparent` propagation honored from incoming headers. `docker-compose.yml` Grafana LGTM stack confirmed. Phase 1 OTEL deferrals fully resolved. Narrow-fix cycle post-verifier: warn-and-continue → throw in production path.
**Test delta**: +16 (14 default + 2 integration-gated; 742 → 757 default + 1 win32-skip)

### Task 2.10 — Phase 1 Backlog Cleanup Bucket B (12 items)
**Outcome**: All 12 backlog items from Tasks 1.9 and 1.10 closed across two sessions (#14 + #15):
- 2.10.a: `DomainError.toJSON()` serializes structured fields (`code`, `retryable`, `details`)
- 2.10.b: SIGKILL-timeout branch integration test added
- 2.10.c: `cancel()` return type → `Promise<void>`
- 2.10.d: `toBeInstanceOf` assertions strengthened to concrete subclasses
- 2.10.e: Re-entrant watchdog tick guard added
- 2.10.f: `DEFAULT_*` constants centralized to `sessions/constants.ts`
- 2.10.g: `sessionKey` PII (plan-filename) redacted in logs via `redactSecrets()`
- 2.10.h: `stderrChunks` → `BoundedStderrBuffer` (256 KiB ring; already landed Task 1.16 fix cycle — confirmed clean)
- 2.10.i: P2002 unique-constraint catch in `handlePrismaError`
- 2.10.j: Generic 60s dedup bucket documented; boundary behavior clarified in test comment
- 2.10.k: Unused `OrchStoreService` injection removed from `HooksService`
- 2.10.l: `hook.received` event emitted POST-transaction (swap order)
**Test delta**: +15 default + 1 integration win32-skipped (757 → 772 default)

### Task 2.11 — Round-Trip E2E Smoke
**Outcome**: `packages/core/src/__e2e__/round-trip.spec.ts` (10 tests, 5 describe groups). Exercises: `POST /api/v1/queue` → EventBus event + SSE WireEnvelope; `QueueService.complete` → session.ended SSE; I-6 gate (400 without confirm=1, 200 with) + OperatorActionLog audit row; real W3C `traceparent` from `TracingService.withSpan`; `WireEnvelope.trace_id` populated; notification seam (`ConsoleNotifierService`). Used in-memory `NodeTracerProvider` (no OTLP) to avoid ECONNREFUSED during teardown.
**Test delta**: +10 (757 → 767 default; cumulative monorepo 1,092)

### Task 2.12 — Phase 2 Adversarial Verification
**Outcome**: Fresh sandwich-verifier (opus, fresh context) ran full Phase 2 adversarial review. Verdict: **PASS_WITH_CONCERNS** — 0 critical, 0 major, 5 minor carryovers (all NON-BLOCKING). Cleared to advance to Phase 3.

Verifier findings (all minor, deferred to Phase 3):
1. `DomainError.toJSON` cause-chain non-recursive (`errors.ts:110-122`)
2. Tracing span attribute leaks raw `sessionKey` (`session-manager.ts:460`)
3. `handlePrismaError` matches literal `'P2002'` only (`prisma-error-helper.ts:19`)
4. N5 latency E2E timing harness absent (no wall-clock assertion on SSE delivery ≤ 2s)
5. F6 token/cost chart on `SessionDetailPage` not yet implemented (Charter O3)

---

## Final Test Counts

| Suite | Count | Status |
|---|---|---|
| `@orch/core` (default) | 767/767 | PASS |
| `@orch/core` (integration-gated) | 3 (1 win32-skip) | PASS |
| `@orch/cli` | 22/22 | PASS |
| `@orch/shared` | 40/40 | PASS |
| `@orch/telegram` | 125/125 | PASS |
| `@orch/web-ui` | 138/138 | PASS |
| **Monorepo total** | **1,092** | **ALL GREEN** |

tests-baseline.json note: Phase 2 predates the tests-baseline.json baseline script (introduced in Phase 5 backlog task 5.2.4). Phase 2 exit count was 1,092 (767 core + 22 CLI + 40 shared + 125 telegram + 138 web-ui). No tests-baseline.json entry for phase_id="2" — see `agent-workspace/memory/tests-baseline.json` for recorded phases.

Phase 2 entry was 707 tests (685 core + 22 CLI). Net addition: **+385 tests**.

---

## Daemon State (Phase 2 Exit)

- **Bind**: `127.0.0.1:4141` (localhost-only; LAN-IP refusal confirmed — I-7)
- **Health**: `GET /healthz` → 200 OK
- **Auth**: All `/api/v1/*` and SSE endpoints require `Authorization: Bearer <token>` (timing-safe compare); SSE also accepts `?token=<urlencoded>` fallback for EventSource clients
- **I-6 gate**: `POST /sessions/:id/stop` requires `?confirm=1`; Telegram `/stop` and `/cancel` require inline-keyboard confirmation
- **SSE**: `GET /api/v1/events/stream` live; 15s heartbeat; 200-event bounded buffer per subscriber; `{ type, payload, trace_id, ts }` wire format
- **OTEL**: HTTP auto-instrumentation active; `trace_id`/`span_id` in every pino request-scoped log line; OTLP HTTP exporter to `$OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://127.0.0.1:4318`); `traceparent` propagation honored
- **Telegram**: `packages/telegram` standalone Grammy process; all 8 commands operational; SSE subscriber live; outbound text redacted
- **Web UI**: `packages/web-ui` Vite+React at `http://127.0.0.1:4142`; Dashboard, Activity Feed, Kanban, Session Detail pages; live SSE updates; Bearer auth; confirm modals on destructive ops

---

## Invariants Satisfied (I-1 through I-15)

| Invariant | Status | Evidence |
|---|---|---|
| I-1 (no LLM in daemon) | PASS | `grep -rn "@anthropic-ai/sdk" packages/core/src/` → 0 hits |
| I-2 (no hardcoded project names) | PASS | `grep -rn "stockforge" packages/core/src/` → 0 hits |
| I-3 (CLI subprocess only) | PASS | `ClaudeCodeAdapter` uses `execa`; no Agent SDK import anywhere |
| I-4 (project-agnostic core) | PASS | `grep -rn "@orch/core" packages/telegram/src packages/web-ui/src` → 0 hits; both call HTTP API only |
| I-5 (no credential reads) | PASS | `grep -rn "\.ccs/\|\.claude/" packages/core/src/` → 0 hits |
| I-6 (destructive op confirmation) | PASS | `?confirm=1` gate on REST + inline-keyboard on Telegram; round-trip.spec.ts asserts 400/200 |
| I-7 (localhost-bind default) | PASS | Core: `127.0.0.1:4141`; Web UI: `127.0.0.1:4142`; LAN-IP refusal confirmed |
| I-8 (dedup keys + migration) | PASS | Unique constraints + migration baseline in `prisma/`; P2002 catch added (Task 2.10.i) |
| I-9 (trace_id in logs) | PASS | HTTP auto-instrumentation wired; integration test captures pino output with `trace_id` during real HTTP call |
| I-10 (zod on external inputs) | PASS | `SseEnvelopeSchema` (zod) in `@orch/shared`; both consumers parse all incoming events through it |
| I-11 (log + OTEL per transition) | PASS | `TracingService.withSpan` wraps state transitions; EventBus emits typed domain events; SSE wire includes `trace_id` |
| I-12 (DomainError wrapping) | PASS | `DomainError` wraps across all modules; `toJSON()` now serializes structured fields (`code`, `retryable`, `details`) per 2.10.a |
| I-13 (no flakes) | PASS | 1,092 deterministic tests; no `setTimeout`-based assertions |
| I-14 (domain zero framework deps) | PASS | `grep -rn "@nestjs" packages/core/src/domain/` → 0 hits |
| I-15 (token budget in spans) | PASS | OTEL span attributes wired; `gen_ai.usage.*` ready for Phase 3 context-full detector |

---

## Key Architectural Decisions Landed

Phase 0 decisions D1–D15 in `agent-workspace/research/SYNTHESIS.md` — all honored.

Phase 2 additional decisions (D16–D21 from master-planner, embedded in `session-plans/completed/phase-2-interfaces.md`):

| Decision | Summary |
|---|---|
| D16 | Telegram bot = standalone process (not in-proc NestJS module). Crashed bot cannot take down scheduler. |
| D17 | Web UI auth = Bearer token in localStorage (Phase 2). Session cookies + CSRF deferred (localhost-only is sufficient). |
| D18 | Event stream = SSE (not WebSocket). One-way server→client matches 100% of need. Native `EventSource` reconnect. No subprotocol complexity. |
| D19 | OTEL HTTP-request propagation via `@opentelemetry/instrumentation-fastify` + `instrumentation-http`. Bootstrap BEFORE `NestFactory.create()` — ordering is the single most error-prone constraint. |
| D20 | `SseEnvelopeSchema` (zod) in `@orch/shared`; both consumers validate every incoming event — I-10 compliance at consumer edge. |
| D21 | `@orch/telegram` + `@orch/web-ui` are workspace members with dev-dep on `@orch/shared` only; never import `@orch/core` at runtime. |

Task 2.10/2.11 narrowings (no separate decision files; pre-authorized via risk flags):
- R1: `round-trip.spec.ts` uses Jest (not Vitest) — per existing monorepo test harness
- R2: E2E spec placed in `packages/core/src/__e2e__/` not top-level `tests/e2e/`
- R3: No Grammy mock in E2E; asserted at `ConsoleNotifierService` seam
- Trace_id seam: `NodeTracerProvider` + `InMemorySpanExporter` (no OTLP) in E2E to avoid ECONNREFUSED teardown noise

---

## Deferred Items Carried Into Phase 3 Backlog

### From Task 2.12 verifier (minor, non-blocking)

1. **DomainError.toJSON cause-chain non-recursive** (`packages/core/src/domain/errors.ts:110-122`). When `cause instanceof DomainError`, only `{name, message, code}` serialized; nested `details`/`retryable`/inner `cause` dropped. Suggested fix: if `cause instanceof DomainError`, call `cause.toJSON()` recursively.
2. **Tracing span leaks raw sessionKey** (`packages/core/src/modules/sessions/session-manager.ts:460`). OTEL span attribute `'session.key'` writes raw key while logger writes redacted form. Inconsistent PII boundary vs logs. Phase 3 telemetry hardening.
3. **handlePrismaError literal `'P2002'` only** (`packages/core/src/domain/prisma-error-helper.ts:19`). Raw SQLSTATE `'23505'` would fall through. Acceptable today (all DB via Prisma); document if raw drivers introduced.
4. **N5 latency E2E timing harness absent**. No wall-clock assertion proving SSE delivery ≤ 2s from `POST /api/v1/queue`. Nominal path verified functionally but not with time bound.
5. **F6 token/cost chart on SessionDetailPage** (Charter O3). `SessionDetailPage` has trace_id link but no token/cost visualization. Co-implementable with Phase 3 context-full detector (I-15 spans available).

### From Phase 1 backlog (still outstanding)

All Task 1.9 and Task 1.10 carryover items were addressed in Task 2.10. The remaining items carried forward to Phase 3 are the 5 verifier findings above only.

---

## Phase 2 → Phase 3 Handoff

Phase 3 scope: Intelligence Layer — handoff context builder (L0+L1), context-budget enforcer (graceful end at 230K per Charter F4), cron scheduler, session-detail trace-link polish, Langfuse alt-backend toggle.

Next actions:
1. **master-planner** dispatch to decompose Phase 3 into concrete session-level tasks using `session-plans/pending/phase-3-handoff-and-budget.md` stub as input
2. First Phase 3 task candidates: Task 3.1 Context-Full Detector OR Task 3.2 Graceful Session End (see `session-plans/pending/phase-3-intelligence.md` for existing decomposition)
3. Phase 3 carryover fixes (3 minor from verifier) can be addressed as cleanup subtasks within relevant Phase 3 sessions
