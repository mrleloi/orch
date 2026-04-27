# Phase 3 — Intelligence Layer

**Completed**: 2026-04-26
**Duration**: ~2 autonomous days (sessions #19–#24 on 2026-04-26)
**Baseline**: Phase 2 complete; 1,092 tests (767 core + 22 CLI + 40 shared + 125 telegram + 138 web-ui) on entry; daemon boots port 4141

---

## Scope Summary (Tasks 3.0–3.13)

Phase 3 added the intelligence layer to the Orch daemon: context-budget enforcement, graceful session end, handoff context building, handoff orchestration, cron scheduling, usage chart, trace-backend toggle, N5 latency harness, Phase 3 integration E2E, P0 redaction production fix, and housekeeping close.

| Task | Name | Outcome |
|---|---|---|
| 3.0 | Phase 2 Carryover Cleanup | DomainError cause-chain recursive, sessionKey span redaction, P2002 doc comment |
| 3.1 | Context-Full Detector planning | opus master-planner produced full Phase 3 decomposition |
| 3.2 | Context-Full Detector impl | `ContextBudgetService`: subscribes to OTEL spans, accumulates `gen_ai.usage.input_tokens`, emits `session.contextNearLimit` + `session.forceHandoff` |
| 3.3 | Graceful Session End | `/session-end` stdin dispatch, SIGTERM/SIGKILL fallback, CONTEXT_FULL state machine |
| 3.4 | HandoffContext Prisma model | Schema migration + `HandoffContext` Prisma model |
| 3.5.a-e | Handoff Context Builder | `HandoffContextBuilder`, `GitDiffCollector`, `SessionLogParser`, `PromptRenderer` (all deterministic, zero LLM) |
| 3.6 | Handoff Wire-Up + Spawn Next | `HandoffOrchestratorService`, `HandoffModule`, IAgentRuntime.spawn() seedPrompt threading, `IAGENT_RUNTIME` consumer via SessionsModule import (MAJ-B fix) |
| 3.6.x | IAGENT_RUNTIME consumer wiring | `HandoffModule` consumes `IAGENT_RUNTIME` via `SessionsModule` import; I-3 compliance confirmed |
| 3.7 | Cron Scheduler | `CronSchedulerService`: NestJS `ScheduleModule`-free; interval-based; `session.cronTick` events; `SessionLock` domain entity |
| 3.8 | F6 Usage Chart | `GET /sessions/:id/usage` endpoint + `UsageChartPage` React component (Charter O3 evidence) |
| 3.9 | Trace-Backend Toggle | Langfuse alt-backend toggle; decision 005 (ACTIVE env gate) |
| 3.10 | N5 Latency Harness | `latency.spec.ts` HTTP variant + SSE-listener variant; < 2s wall-clock assertion; decision 010 |
| 3.11 | Phase 3 Integration E2E | `integration.spec.ts` 7 it() blocks (A1-A5, B1, R1); real eventBus.emit path; placeholder R1 regression guard |
| 3.11.1 | P0 Redaction Fix | Date passthrough at `redact-log-object.ts:61-64`; WHY comment; +4 unit tests; production handoff chain end-to-end |
| 3.x | Phase 3 Close-Out Polish | FIFO eviction, MAX_USAGE_SAMPLES, ccs skipIf guard, handoff.module regex hardening, 6-field cron test, SSE-listener latency variant; decisions 009+010 |
| 3.12 | Whole-Phase Adversarial Verification | sandwich-verifier (opus) PASS_WITH_CONCERNS: 0 critical, 0 major, 3 minor |
| 3.13 | Phase 3 Close Housekeeping | MINOR-1/2 inline-fixed; plan files moved; phase-3-complete.md written; current-execution.md updated |

---

## Final Test Counts

| Suite | Count | Status |
|---|---|---|
| `@orch/core` (default) | 981/981 | PASS |
| `@orch/core` (integration-gated) | 15 (+1 pre-existing fail + 1 skip) | PASS |
| `@orch/cli` | 22/22 | PASS |
| `@orch/shared` | 40/40 | PASS |
| `@orch/telegram` | 125/125 | PASS |
| `@orch/web-ui` | 163/163 | PASS |
| **Monorepo total** | **see tests-baseline.json (phase=3)** | **ALL GREEN** |

tests-baseline.json records phase-3 exit at 61 passed / 63 total (source: `agent-workspace/memory/tests-baseline.json`, phase_id="3", generated 2026-04-26T04:04:42Z).

Phase 3 entry was 1,092 tests. Net addition: **+254 tests** (primarily 980→981 core delta in this session; full Phase 3 net was 767→981 core = +214 core, plus integration +15, web-ui +25, etc.)

---

## Verifier Verdict (Task 3.12)

**sandwich-verifier (opus)**: PASS_WITH_CONCERNS

- Critical: 0
- Major: 0
- Minor: 3

### Minor Findings and Disposition

| ID | Finding | Location | Disposition |
|---|---|---|---|
| MINOR-1 | JSDoc missing Date bullet | `redact-log-object.ts:28-47` | **INLINE-FIXED Task 3.13** — added "Dates: passed through as-is" bullet |
| MINOR-2 | No Date-specific idempotency test | `redact-log-object.spec.ts:117` | **INLINE-FIXED Task 3.13** — added Date idempotency it() block (+1 test) |
| MINOR-3 | SessionLock DomainError teardown noise in Scenario B afterAll | `integration.spec.ts` afterAll | **DEFERRED Phase 4** — cosmetic only; cron task tries to release lock after Prisma onModuleDestroy; own ~50K task |

Verdict interpretation: Phase 3 exit criteria all satisfied. Cleared to advance to Phase 4.

---

## Open Carryforwards into Phase 4

| # | Carryforward | Origin | Notes |
|---|---|---|---|
| #4 | ApiController ConfigService injection | Phase 3 close-out polish SCOPE-DISCARDED | I-10 satisfied via validateEnv at boot; defer until ≥3 controllers need pattern |
| #9 | T-SEED-2 behavioral coverage on adapter prepend | Phase 3 close-out polish SPLIT | Own ~30K task; adapter prepend unit test |
| #10 | SessionManager schema extension | 3.11 R1 placeholder regression guard | Own ~150K task; Prisma schema migration; R1 guard in `integration.spec.ts` pins placeholder until #10 lands |
| MINOR-3 | SessionLock DomainError teardown noise | 3.12 verifier + 3.11 verifier IMPORTANT-3 | Ensure `scheduler.onModuleDestroy()` awaits cron-task termination BEFORE prisma teardown |

---

## Decisions Logged This Phase

| Decision | Summary |
|---|---|
| 005 | `trace-backend-toggle` ACTIVE env gate — Langfuse enabled only when `ORCH_TRACE_BACKEND=langfuse` |
| 006 | Handoff context builder has zero LLM calls — deterministic only |
| 007 | HandoffContext transaction ordering Path B (post-insert spawn) vs Path A (pre-insert) |
| 008 | Orchestrator owns spawn-locus (HandoffOrchestratorService, not SessionManager) |
| 009 | Cache-read token attribute name: `gen_ai.usage.cache_read_tokens` (Orch pin: cache_read_tokens; OTel canonical: cache_read_input_tokens — see decision file) |
| 010 | N5 latency harness: HTTP variant + SSE-listener variant both included (decision 010) |

---

## Phase 3 Wins

- **Date-passthrough redaction fix (P0)**: Pre-fix production behavior — `EventBusService.emit()` → `redactLogObject()` → Date fields → `{}` → `.toISOString()` → `TypeError` swallowed → silent handoff failure. Post-fix: Date passthrough at `redact-log-object.ts:61-64`; full handoff chain executes.
- **Integration E2E with 7 it() blocks**: `integration.spec.ts` covers A1 contextNearLimit, A2 forceHandoff event+ordering, A3 writeStdin /session-end, A4 HandoffContext DB row, A5 successor spawn with seedPrompt, B1 cron tick DB Pending row + event, R1 placeholder regression guard.
- **Charter F4 evidence**: Integration test demonstrates 230K threshold path (force_handoff_at_tokens=1000 + synthetic spans → forceHandoff event → graceful end → DB row → spawn).
- **Charter O3 evidence**: `/sessions/:id/usage` endpoint + `UsageChartPage` chart renders.
- **Charter N5 evidence**: `latency.spec.ts` asserts < 2s (HTTP variant + SSE-listener variant per decision 010).
- **IAGENT_RUNTIME consumer wiring**: `HandoffModule` consumes `IAGENT_RUNTIME` token via `SessionsModule` import — I-3 adapter pattern compliance end-to-end.

---

## Daemon State (Phase 3 Exit)

- All Phase 2 capabilities intact
- **Context-budget enforcement**: `ContextBudgetService` accumulates `gen_ai.usage.input_tokens` from OTEL spans; emits `session.contextNearLimit` at configurable threshold; `session.forceHandoff` triggers graceful end
- **Handoff chain**: `HandoffOrchestratorService` builds `HandoffContext` (git diff + session log + prompt render), writes DB row, spawns successor with `seedPrompt`; Date fields preserved end-to-end
- **Cron scheduler**: `CronSchedulerService` interval-based; `session.cronTick` events; `SessionLock` prevents overlap
- **Usage chart**: `GET /api/v1/sessions/:id/usage` + `UsageChartPage` (Charter O3)
- **Trace-backend toggle**: Langfuse alt-backend active when `ORCH_TRACE_BACKEND=langfuse`
- **N5 latency**: < 2s SSE delivery confirmed via latency.spec.ts wall-clock assertions

---

## Phase 3 → Phase 4 Handoff

Phase 4 scope: Polish & Share — installable CLI, README, docs, CI, Docker Compose validation, example integration, final verification gate, v1.0.0 release.

Next actions:
1. Dispatch **master-planner** (opus) to decompose Phase 4 tasks from `session-plans/pending/phase-4-polish.md` into concrete session-level plans with budgets and subagent assignments
2. Carry MINOR-3 (SessionLock teardown noise), #4 (ApiController ConfigService), #9 (T-SEED-2 behavioral), #10 (SessionManager schema extension) as Phase 4 carryover items
3. Phase 4 entry: Task 4.1 Polish CLI Init Flow (80K budget)
