# Phase 3 Master Plan — Intelligence Layer

> **Status**: APPROVED — produced by master-planner subagent on 2026-04-25
> **Pre-requisite**: Phase 2 COMPLETE (1,092 monorepo tests, all I-1..I-15 PASS, verifier PASS_WITH_CONCERNS with 5 minor carryovers).
> **Supersedes**: `phase-3-handoff-and-budget.md` stub + `phase-3-intelligence.md` reference (kept for citation only).

---

## A. Phase Goal Statement

Make Orch **autonomous across the session lifecycle boundary**: the daemon must deterministically detect when a managed Claude Code session is approaching its 250K context cliff (charter F4), gracefully end it, build a deterministic handoff prompt from file diffs + session log (charter O1, O2 — no LLM in daemon, I-1), and spawn the next session seeded with that prompt — all without operator intervention. Phase 3 also closes the observability loop (charter O3) by surfacing per-session token/cost in Web UI and adding the cron scheduler that turns Orch from a reactive dispatcher into a 24/7 plan executor.

Charter alignment: **F4** (graceful end at 230K → spawn next with handoff context), **O1** (one OTEL trace root per queue item), **O2** (Claude Code spans nest under Orch root), **O3** (cost queryable per project/day/session-type), **N5** (Telegram latency < 2s, finally bench-asserted).

---

## B. Task Sequence

| # | Title | Type | Subagent | Model | Budget | Deps |
|---|---|---|---|---|---|---|
| 3.0 | Phase 2 Carryover Cleanup Pass | FOCUSED_IMPL | sandwich-dev | sonnet | ~80K | — |
| 3.1 | Context-Full Detector (architect) | PLAN | sandwich-architect | opus | ~50K | 3.0 |
| 3.2 | Context-Full Detector (impl) | FOCUSED_IMPL | sandwich-dev | sonnet | ~120K | 3.1 |
| 3.3 | Graceful Session End | FOCUSED_IMPL | sandwich-dev | sonnet | ~120K | 3.2 |
| 3.4 | Handoff Context Builder (architect) | PLAN | sandwich-architect | opus | ~60K | 3.3 |
| 3.5 | Handoff Context Builder (impl, MULTI_TASK) | MULTI_TASK_IMPL | task-implementer × N + reviewers | sonnet | ~200K | 3.4 |
| 3.6 | Handoff Wire-Up + Spawn Next | FOCUSED_IMPL | sandwich-dev | sonnet | ~110K | 3.5 |
| 3.7 | Cron Scheduler | FOCUSED_IMPL | sandwich-dev | sonnet | ~100K | 3.0 (parallel-eligible with 3.1+) |
| 3.8 | F6 Token/Cost Chart + Trace-Link Polish | FOCUSED_IMPL | sandwich-dev | sonnet | ~110K | 3.2 |
| 3.9 | Langfuse Backend Toggle | FOCUSED_IMPL | sandwich-dev | sonnet | ~80K | 3.8 |
| 3.10 | N5 Latency E2E Timing Harness | FOCUSED_IMPL | sandwich-dev | sonnet | ~70K | 3.0 |
| 3.11 | Phase 3 Integration E2E | FOCUSED_IMPL | sandwich-dev | sonnet | ~120K | 3.6, 3.7 |
| 3.12 | Phase 3 Adversarial Verification | VERIFY | sandwich-verifier | opus | ~80K | 3.11, 3.8, 3.9, 3.10 |
| 3.13 | Phase 3 Close (housekeeping) | FOCUSED_IMPL | sandwich-dev | sonnet | ~30K | 3.12 PASS |

**Total estimated budget**: ~1,330K tokens across **~13 fresh sessions** (one per task; 3.5 may consume 1–2 sessions internally via subagent dispatch).

---

## C. Task Detail

### Task 3.0 — Phase 2 Carryover Cleanup Pass
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~80K · **Deps**: none

Close the 5 minor verifier carryovers from Task 2.12 in one focused session. Doing this *first* keeps Phase 3 from inheriting Phase 2 debt and gives a clean baseline for the new modules.

**Scope**:
1. **Carryover #1** — `DomainError.toJSON` cause-chain recursion. `packages/core/src/domain/errors.ts:110-122`. If `cause instanceof DomainError`, call `cause.toJSON()` recursively; else fall back to existing `{name, message}` shape. Add 2 spec tests: nested DomainError chain serializes fully; non-DomainError cause stays minimal.
2. **Carryover #2** — Tracing span PII leak. `packages/core/src/modules/sessions/session-manager.ts:460`. Replace `span.setAttribute('session.key', sessionKey)` with `span.setAttribute('session.key', redactSessionKey(sessionKey))`. Use the existing `redactSecrets` helper or add a small `redactSessionKey` wrapper. 1 spec test asserting redacted form on span attribute.
3. **Carryover #3** — `handlePrismaError` literal `'P2002'`. `packages/core/src/domain/prisma-error-helper.ts:19`. Document the constraint in JSDoc; no code change required (acceptable per verifier note since Prisma is sole DB driver). Add a code comment with TODO marker for future raw-SQL drivers.

Carryovers #4 (N5 latency E2E) and #5 (F6 token/cost chart) are *deliberately* split into Tasks 3.10 and 3.8 respectively because they require dedicated session budgets (chart UI work + timing harness build-out are not 5-minute fixes).

**Acceptance criteria**:
- All 1,092 existing tests still pass.
- +3 new tests in `packages/core` (cause-chain × 2, span PII × 1). Monorepo target ≥ 1,095.
- `eslint`, `tsc --noEmit`, `vitest run` all green across affected packages.
- I-1..I-15 grep checks unchanged.
- No commits without explicit user request (I-6 / standing rule).

**Risks**: Low. Surgical fixes to known files.

---

### Task 3.1 — Context-Full Detector (Architect)
**Session type**: PLAN · **Subagent**: sandwich-architect · **Model**: opus · **Budget**: ~50K · **Deps**: 3.0

Produce a Part-A/Part-B sandwich plan for the `ContextBudgetService`:
- **Part A (signatures)**: how the service subscribes to OTEL spans (in-process `SpanProcessor` hook vs. tail-from-exporter); per-session token accumulator key; threshold config from `profile.yaml`; emitted events (`session.contextNearLimit`, `session.forceHandoff`).
- **Part B (test contracts)**: mock span ingestion → assertions on emitted events, threshold edge cases, multi-session isolation.

**Critical I-1 guardrail**: detector is pure deterministic code. NO LLM calls. Reads `gen_ai.usage.input_tokens` from OTEL span attributes (already wired in I-15). Only state is a `Map<sessionKey, runningTokenTotal>`.

**Cite**: SYNTHESIS D6 (OTEL stack), I-1, I-15. Charter F4 thresholds (warn @ 200K, force @ 230K).

**Acceptance criteria**:
- Plan file at `agent-workspace/session-plans/pending/3.2-context-full-detector.md` with full Part A signatures and Part B test contracts.
- Decision document if architect chooses SpanProcessor hook vs. polling: `decisions/0NN-context-full-ingestion-mode.md`.
- No production code written.

**Risks**: OTEL `SpanProcessor` API surface — architect must confirm we can register a custom processor without breaking the existing OTLP exporter pipeline. Mitigation: research notes in `agent-workspace/research/otel.md` already cover SpanProcessor chaining; architect re-reads.

---

### Task 3.2 — Context-Full Detector (Implementation)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~120K · **Deps**: 3.1

Implement the plan from 3.1. Likely shape:
- `packages/core/src/modules/context-budget/context-budget.service.ts` — service holding the per-session accumulator and threshold logic.
- `packages/core/src/modules/context-budget/context-budget.module.ts` — Nest module registration.
- Custom `SpanProcessor` (or polling timer) wired in `tracing.module.ts` at bootstrap.
- Emits `session.contextNearLimit` and `session.forceHandoff` via existing `EventBus`. Both events must propagate through SSE (already fan-out via `SseSubscription`) — add to `SseEnvelopeSchema` in `@orch/shared` if missing.
- Profile schema gains `context_budget: { warn_at_tokens: 200000, force_handoff_at_tokens: 230000 }` block (defaults applied if absent).

**Acceptance criteria**:
- ≥ 12 unit tests (threshold crossings, multi-session isolation, missing-attribute resilience, multi-fire suppression — only emit `forceHandoff` once per session).
- Integration test: real `NodeTracerProvider` + `InMemorySpanExporter`, fire synthetic spans, assert events on `EventBus`.
- `SseEnvelopeSchema` extended; consumers (Telegram subscriber, Web UI `useSseEvents`) handle new event types without crashing — at minimum unknown-type fallback path tested.
- `tsc --noEmit` green; eslint green; I-10 zod validation on profile schema additions.
- Monorepo test count: target ≥ 1,107 (1,092 + 3 from 3.0 + 12).

**Risks**: SpanProcessor ordering (must run AFTER OTLP exporter has the span; before-export inspection is fine but careful with sampling). Risk flag: **MEDIUM**. If detector misses spans, F4 fails silently. Mitigation: integration test uses `InMemorySpanExporter` to verify every emitted span is observed.

---

### Task 3.3 — Graceful Session End
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~120K · **Deps**: 3.2

Wire the `session.forceHandoff` event into `SessionManager` to perform a graceful end:
1. On `forceHandoff` event for active session → set state machine to `ENDING` (per I-11).
2. If profile declares `commands.session_end` (e.g., `/session-end`), write the slash command to the child process's stdin via the existing `ClaudeCodeAdapter.write()` path.
3. Wait up to `graceful_end_timeout_ms` (profile-configurable, default 30s) for `SessionEnd` hook to fire.
4. If hook fires → state `COMPLETED` with `reason: 'CONTEXT_FULL'`.
5. If timeout → SIGTERM, wait 5s, SIGKILL → state `COMPLETED` with `reason: 'CONTEXT_FULL_FORCED'`.
6. Emit `session.ended` SSE event with `reason` field present.

**I-6 guardrail**: this is a "destructive" operation in spirit (kills a running session), but the autonomous trigger is *pre-authorized* by the profile's `auto_handoff: true` flag. If `auto_handoff: false` (default), Orch only emits a notification and pauses; operator clicks confirm in Telegram/Web UI. The confirmation gate is preserved per I-6 Rationalization Counter.

**Acceptance criteria**:
- ≥ 8 unit tests (graceful path, timeout path, no-command-configured path, SIGTERM-then-SIGKILL escalation, auto_handoff=false notification path).
- 1 integration test using a fake child process that responds to stdin and exits cleanly.
- State machine transitions emit log + OTEL span event (I-11 grep-checked).
- New session-end reasons documented; SSE wire envelope still validates.
- `EndedReason` enum updated in `@orch/shared`.
- Monorepo test count: target ≥ 1,116 (+9).

**Risks**: stdin write into a Claude Code subprocess that has buffered input may not deliver the slash command instantly. Mitigation: timeout fallback to SIGTERM is the safety net; the test for the timeout path is mandatory.

---

### Task 3.4 — Handoff Context Builder (Architect)
**Session type**: PLAN · **Subagent**: sandwich-architect · **Model**: opus · **Budget**: ~60K · **Deps**: 3.3

Most architecturally nuanced piece in Phase 3. Must be **deterministic, no LLM** (I-1, charter principle 1).

Produce Part-A/Part-B plan covering two builder layers per SYNTHESIS D8:
- **L0 (file diffs)**: `git diff --stat` from session-start commit to session-end HEAD. Pure shell call via execa from adapter; output parsed into structured records.
- **L1 (session log parser)**: regex/markdown parser for `agent-workspace/memory/sessions/YYYY-MM-DD-session-N.md` files. Extracts: completed tasks, pending tasks, decisions, "Next Session Pickup" block. Must be robust to log-format drift (logs are human-authored markdown with stockforge template + ad-hoc additions).

Output: structured `HandoffContext` DTO + a renderer that produces a plain-text prompt suitable as the initial user message for the next session. Hard cap: 5000 tokens (~20K chars) on the rendered prompt to prevent compound bloat across N handoffs.

**Cite**: SYNTHESIS D8 (L0 regex + L1 deterministic parsing), Karpathy P2 (simplicity first — no LLM "smart" summary). Charter Principle 1 (daemon-dumb) and Principle 10 (no feature creep into agent intelligence).

**Acceptance criteria**:
- Plan file `agent-workspace/session-plans/pending/3.5-handoff-builder.md` with full Part A (interfaces, parser regex shapes, renderer template) and Part B (golden-file test fixture inventory: at least 5 real stockforge session logs as fixtures, paths cited).
- Decision document `decisions/0NN-handoff-no-llm.md` explicitly declining LLM summary in daemon (forecloses the temptation).
- Decomposition into ≥ 5 sub-tasks suitable for `task-implementer` MULTI_TASK_IMPL execution.

**Risks**: log-format drift. Mitigation: golden-file tests; parser tolerates missing sections (returns empty arrays, not throws).

---

### Task 3.5 — Handoff Context Builder (Implementation, MULTI_TASK)
**Session type**: MULTI_TASK_IMPL · **Subagent**: task-implementer × N (fresh-context per sub-task) + spec-compliance-reviewer + code-quality-reviewer · **Model**: sonnet · **Budget**: ~200K · **Deps**: 3.4

Execute 3.4's plan via subagent-driven-development skill (mandatory for 3+ sub-tasks). Expected sub-tasks:
- 3.5.a: `HandoffContextBuilder` service skeleton + types
- 3.5.b: L0 git-diff collector (execa wrapper + parser)
- 3.5.c: L1 session-log markdown parser
- 3.5.d: Renderer (DTO → plain-text prompt with hard cap)
- 3.5.e: Persistence — `HandoffContext` Prisma table + repository

Each sub-task: implementer → spec-compliance-reviewer → code-quality-reviewer → next.

**Acceptance criteria**:
- ≥ 25 new unit tests across the 5 sub-tasks (parsers stress-tested with real fixtures; renderer cap enforced; git-diff integration mocked at execa boundary).
- 5 golden-fixture tests using real `agent-workspace/memory/sessions/*.md` files.
- Prisma migration adds `HandoffContext` table.
- I-1 grep: zero `anthropic|openai|sdk` imports introduced. I-2 grep: zero `stockforge` strings (fixture file names allowed in tests but not in core code).
- Each sub-task review gate PASS before next dispatched.
- Monorepo test count: target ≥ 1,141 (+25).

**Risks**: budget creep within MULTI_TASK_IMPL session. Mitigation: budget watchdog at 200K → wind-down; if any reviewer gate triggers re-work, split into a continuation session per session-budgets R-2.

---

### Task 3.6 — Handoff Wire-Up + Spawn Next
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~110K · **Deps**: 3.5

Connect `HandoffContextBuilder` to the lifecycle:
1. On session ending with `reason: CONTEXT_FULL` → invoke builder before final state commit.
2. Persist `HandoffContext` row linked to outgoing session.
3. Queue dispatcher reads pending plan AND the handoff context for the same project, prepends rendered prompt to the next session's initial message.
4. Adapter `spawn()` accepts an optional `seedPrompt: string` — if present, it is the first stdin write (or `claude -p "<seed>"` argument, depending on adapter mode).
5. Emit `session.handoffPrepared` and `session.handoffApplied` events.

**I-6**: handoff-driven auto-spawn is gated by the same `auto_handoff: true` profile flag from 3.3. With it false, Orch enqueues the handoff prompt and pauses, awaiting operator confirmation.

**Acceptance criteria**:
- ≥ 6 unit tests (handoff persisted, seedPrompt threaded through adapter, paused-without-flag path).
- 1 integration test: end-to-end fake session ends with `CONTEXT_FULL` → next session spawned with seedPrompt observable in adapter call.
- Monorepo test count: target ≥ 1,148.

**Risks**: ordering hazard between session-end commit and handoff persistence. Mitigation: same `prisma.$transaction` block wraps both; failure rolls back to `FAILED` reason rather than half-state.

---

### Task 3.7 — Cron Scheduler
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~100K · **Deps**: 3.0 (parallel-eligible with 3.1–3.6 lane)

`SchedulerModule` using `node-cron`:
- Reads each project's `profile.yaml` for `cron:` entries (e.g., `daily_signals: "0 9 * * *"` → enqueues plan `daily-signals.md`).
- On tick → posts to internal `QueueService.enqueue()` (HTTP-free, in-process).
- Emits `scheduler.tickFired` event with cron name + next-run timestamp.
- Idempotent on daemon restart (cron schedules are recomputed; no missed-tick replay — deliberate, per Karpathy P2).

**Acceptance criteria**:
- ≥ 8 unit tests using fake timers (vitest).
- Profile schema extended with `cron: Record<string, string>` (zod-validated, I-10).
- 1 integration test: daemon boot loads profile with cron, fake timer advance triggers enqueue.
- I-2 check: no project-specific cron names hardcoded.
- Monorepo test count: target ≥ 1,156.

**Risks**: cron expression parser errors crash module on bad profile. Mitigation: zod schema rejects malformed expressions at load; bad expression → log + skip + `scheduler.cronInvalid` event.

---

### Task 3.8 — F6 Token/Cost Chart + Trace-Link Polish
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~110K · **Deps**: 3.2 (needs context-budget event stream + I-15 token attributes flowing)

**Closes Phase 2 carryover #5 (F6) and the trace-link polish task from existing decomposition.**

Scope:
1. New REST endpoint `GET /api/v1/sessions/:id/usage` returning `{ input_tokens, output_tokens, cache_read_tokens, model, cost_usd, ts }[]` aggregated from OTEL span store (charter O3).
2. `SessionDetailPage` (`packages/web-ui`): adds a Recharts (or simple SVG) line chart of cumulative tokens over time + cost summary card.
3. Trace-link polish: existing `trace_id` link on `SessionDetailPage` becomes a real deep link — `${ORCH_TRACE_BACKEND_UI_URL}/trace/${trace_id}` with backend-aware URL formatting (Grafana Tempo path vs. Langfuse path; default Grafana LGTM `/explore?...`).
4. Backend URL config flows from a new env var `ORCH_TRACE_BACKEND_UI_URL` exposed via `/api/v1/config` (or already-exposed health endpoint).

**Acceptance criteria**:
- ≥ 6 web-ui tests (chart renders given mock data, empty state, trace link href matches backend pattern).
- ≥ 3 core tests (endpoint returns aggregated usage, auth-gated, zod-validated query params).
- Manual smoke (in test): chart visible on `SessionDetailPage` with seeded session data.
- Monorepo test count: target ≥ 1,165.

**Risks**: Recharts adds bundle weight. Mitigation: reuse any existing chart library already in `packages/web-ui`; if none, hand-rolled SVG line chart is acceptable (Karpathy P2 — simplest thing that works).

---

### Task 3.9 — Langfuse Backend Toggle
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~80K · **Deps**: 3.8

Env-driven backend selector: `ORCH_TRACE_BACKEND=otlp|langfuse|none` (default `otlp`).

- `otlp`: existing OTLP HTTP exporter to `OTEL_EXPORTER_OTLP_ENDPOINT` (Grafana LGTM default).
- `langfuse`: replace exporter with Langfuse OTLP endpoint (just a different URL + bearer auth header).
- `none`: no exporter wired; spans still produced for in-process listeners (context-budget detector continues to work).
- Trace-link UI URL also branches per backend (consumed by 3.8 logic).

**Acceptance criteria**:
- ≥ 6 unit tests covering all three branches (mock exporter factory).
- Configuration documented in `agent-workspace/memory/agent-notes.md` or a brief `decisions/0NN-trace-backend-toggle.md`.
- Daemon boots cleanly with each value of `ORCH_TRACE_BACKEND`.
- I-1 unaffected; no LLM in any branch.
- Monorepo test count: target ≥ 1,171.

**Risks**: Low. Configuration surface change with limited blast radius.

---

### Task 3.10 — N5 Latency E2E Timing Harness
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~70K · **Deps**: 3.0

**Closes Phase 2 carryover #4.**

Add a wall-clock-asserting test to `packages/core/src/__e2e__/round-trip.spec.ts` (or a sibling `latency.spec.ts`):
- `POST /api/v1/queue` → SSE subscriber observes corresponding event.
- Record `t0` before POST, `t1` on SSE event arrival.
- Assert `t1 - t0 < 2000ms` (charter N5).
- Run 5 iterations; assert P95 also < 2s.
- Test must be deterministic on Windows + Linux CI (skip CI runner only if proven-flaky after 50 runs; not at first sign).

**Acceptance criteria**:
- New test green with ≥ 100ms safety margin observed locally.
- No setTimeout-based polling — use SSE event listener with promise.
- Monorepo test count: target ≥ 1,172.

**Risks**: Cold-start latency on Windows test runner could push P95 close to 2s. Mitigation: warm-up POST before timing iterations.

---

### Task 3.11 — Phase 3 Integration E2E
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~120K · **Deps**: 3.6, 3.7

End-to-end scenario test (in `packages/core/src/__e2e__/`):
1. Start daemon with low thresholds (`force_handoff_at_tokens: 1000`).
2. Spawn fake session via `IAgentRuntime` test double; emit synthetic spans totalling 1500 tokens.
3. Assert: `session.contextNearLimit` then `session.forceHandoff` events fire.
4. Assert: graceful-end stdin write attempted (mock adapter records the write).
5. Assert: `HandoffContext` row created.
6. Assert: next session spawned with seedPrompt containing rendered handoff.
7. Assert: cron path — register a fake-time cron, advance, observe enqueue.

**Acceptance criteria**:
- ≥ 5 E2E test cases all green.
- Test isolation: in-memory tracer + Prisma SQLite in tmpdir.
- Monorepo test count: target ≥ 1,177.

**Risks**: test complexity. Mitigation: each scenario is a separate `it()` block with focused assertions; shared bootstrap fixture.

---

### Task 3.12 — Phase 3 Adversarial Verification
**Session type**: VERIFY · **Subagent**: sandwich-verifier · **Model**: opus · **Budget**: ~80K · **Deps**: 3.11, 3.8, 3.9, 3.10

Fresh-context adversarial review of Phase 3 deliverables. Mandatory checks:
- I-1 grep: zero `anthropic|openai|@anthropic-ai/sdk|claude-agent-sdk|ClaudeSDKClient` in `packages/core/src/` (excluding test mocks).
- I-2 grep: zero `stockforge|StockForge` in `packages/core/src/`.
- I-11: every Phase 3 state transition (especially CONTEXT_FULL, CONTEXT_FULL_FORCED) emits log + OTEL span event.
- I-15: token attributes still flow on every claude_code interaction span.
- Charter F4 evidence: integration test demonstrates 230K threshold path.
- Charter O3 evidence: `/sessions/:id/usage` endpoint + chart renders.
- Charter N5 evidence: latency harness asserts < 2s.
- All 5 Phase 2 carryovers verified closed (or explicitly deferred with documented reason).

**Acceptance criteria**:
- Verifier produces a written verdict: `PASS` | `PASS_WITH_CONCERNS` | `FAIL`.
- For `PASS_WITH_CONCERNS`: severity classification (critical/major/minor) for each concern; minor concerns may carry to Phase 4.
- For `FAIL`: specific blocking issues listed; main session loops back into RECOVERY.

**Risks**: verifier finds a critical I-1 violation (e.g., handoff builder accidentally calls an LLM). Mitigation: 3.4 architect explicitly forecloses LLM in `decisions/0NN-handoff-no-llm.md`.

---

### Task 3.13 — Phase 3 Close (Housekeeping)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~30K · **Deps**: 3.12 PASS

- Move `phase-3-intelligence-plan.md` and `phase-3-handoff-and-budget.md` from `pending/` to `completed/phase-3-intelligence.md`.
- Write `agent-workspace/memory/phase-3-complete.md` retrospective.
- Update `agent-workspace/memory/current-execution.md` with Phase 4 entry.
- If verifier left minor concerns → list as Phase 4 carryover.
- Append session log.
- **Do NOT git commit** (I-6 / standing rule).

**Acceptance criteria**:
- Files moved; retrospective written; current-execution.md points at Phase 4.

**Risks**: None.

---

## D. Phase 2 Carryover Absorption Map

| # | Carryover | Absorbed by | Why this placement |
|---|---|---|---|
| 1 | `DomainError.toJSON` cause-chain non-recursive | **Task 3.0** | Surgical, fits cleanup pass |
| 2 | Tracing span leaks raw `sessionKey` | **Task 3.0** | Surgical, same file family as 1 |
| 3 | `handlePrismaError` literal `'P2002'` only | **Task 3.0** (doc-only) | Verifier said "acceptable today"; document and move on |
| 4 | N5 latency E2E timing harness absent | **Task 3.10** | Dedicated session — timing harness needs care to be non-flaky cross-platform |
| 5 | F6 token/cost chart on `SessionDetailPage` | **Task 3.8** | Co-implemented with trace-link polish; depends on context-budget event stream from 3.2 |

---

## E. Sequencing Diagram

```
                            ┌─────────────┐
                            │ Task 3.0    │  Carryover cleanup (no deps)
                            │ Cleanup     │
                            └──────┬──────┘
                                   │
                ┌──────────────────┼──────────────────────┐
                │                  │                       │
                ▼                  ▼                       ▼
         ┌────────────┐     ┌────────────┐         ┌────────────┐
         │ Task 3.1   │     │ Task 3.7   │         │ Task 3.10  │
         │ CFD plan   │     │ Cron       │         │ N5 latency │
         │ (opus)     │     │ scheduler  │         │ harness    │
         └─────┬──────┘     └──────┬─────┘         └─────┬──────┘
               │                   │                     │
               ▼                   │                     │
         ┌────────────┐            │                     │
         │ Task 3.2   │            │                     │
         │ CFD impl   │            │                     │
         └─────┬──────┘            │                     │
               │                   │                     │
               ├──────────────┐    │                     │
               ▼              ▼    │                     │
         ┌────────────┐  ┌──────────────┐                │
         │ Task 3.3   │  │ Task 3.8     │                │
         │ Graceful   │  │ Token/cost   │                │
         │ end        │  │ chart        │                │
         └─────┬──────┘  └──────┬───────┘                │
               │                │                        │
               ▼                ▼                        │
         ┌────────────┐  ┌──────────────┐                │
         │ Task 3.4   │  │ Task 3.9     │                │
         │ Handoff    │  │ Langfuse     │                │
         │ plan(opus) │  │ toggle       │                │
         └─────┬──────┘  └──────┬───────┘                │
               │                │                        │
               ▼                │                        │
         ┌────────────┐         │                        │
         │ Task 3.5   │         │                        │
         │ Handoff    │         │                        │
         │ MULTI_TASK │         │                        │
         └─────┬──────┘         │                        │
               │                │                        │
               ▼                │                        │
         ┌────────────┐         │                        │
         │ Task 3.6   │         │                        │
         │ Wire-up +  │         │                        │
         │ spawn next │         │                        │
         └─────┬──────┘         │                        │
               │                │                        │
               └────────┬───────┘                        │
                        ▼                                │
                  ┌────────────┐                         │
                  │ Task 3.11  │ ◄───────────────────────┘
                  │ Phase 3 E2E│  (depends on 3.6 + 3.7; 3.8/3.9/3.10 verified separately by 3.12)
                  └─────┬──────┘
                        │
                        ▼
                  ┌────────────┐
                  │ Task 3.12  │  Sandwich-verifier (opus)
                  │ VERIFY     │
                  └─────┬──────┘
                        │ PASS
                        ▼
                  ┌────────────┐
                  │ Task 3.13  │  Housekeeping
                  │ Close      │
                  └────────────┘
```

**Critical path**: 3.0 → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.11 → 3.12 → 3.13 (10 tasks).

**Parallelizable lanes** (in human-driven mode; in autonomous single-session-at-a-time mode, run sequentially after 3.0):
- Lane A: 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 (handoff lifecycle, the spine)
- Lane B: 3.7 (cron scheduler — independent of context-full path)
- Lane C: 3.8 → 3.9 (observability UI + backend toggle, depends only on 3.2 for events)
- Lane D: 3.10 (latency harness, fully independent of new modules)

In autonomous mode, recommended order: **3.0 → 3.1 → 3.2 → 3.10 → 3.8 → 3.9 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.11 → 3.12 → 3.13**. This frontloads independent / lower-risk tasks while ramping into the deeper handoff-builder work.

---

## F. Phase 3 Exit Criteria

1. **Charter satisfaction**:
   - F4: graceful end at 230K demonstrated by integration test in 3.11.
   - O1, O2: trace propagation already passing from Phase 2; no regression in 3.12.
   - O3: `/sessions/:id/usage` + chart on Web UI shipped.
   - N5: latency E2E asserts P50 + P95 under 2s.

2. **Test count target**: monorepo **≥ 1,177 tests** (Phase 2 entry 1,092 + ~85 new); all green; integration-gated tests still gated correctly; no new flakes.

3. **Invariant gates**:
   - I-1: no LLM in `packages/core/src/` — grep clean.
   - I-2: no `stockforge` references — grep clean.
   - I-3, I-5, I-14: unchanged from Phase 2 baseline.
   - I-9, I-10, I-11, I-15: every new state transition + every new external input meets its constraint.
   - I-6: no auto-destruction; auto_handoff flag preserves the gate.

4. **Verification subagent verdict**: Task 3.12 produces `PASS` or `PASS_WITH_CONCERNS` (with concerns ≤ 5 minor, 0 critical, 0 major). Anything else loops the main session into RECOVERY before Phase 4.

5. **Phase 2 carryovers**: all 5 closed (3 in 3.0; 1 in 3.10; 1 in 3.8) and verified by 3.12.

6. **Documentation**: `phase-3-complete.md` retrospective written; current-execution.md updated; decisions logged.

---

## G. Estimated Total Phase 3 Budget

| Slice | Tasks | Token estimate |
|---|---|---|
| Carryover cleanup | 3.0 | ~80K |
| Architect/PLAN sessions | 3.1, 3.4 | ~110K |
| Implementation lane (handoff spine) | 3.2, 3.3, 3.5, 3.6 | ~550K |
| Independent-lane impl | 3.7, 3.8, 3.9, 3.10 | ~360K |
| E2E + Verify + Close | 3.11, 3.12, 3.13 | ~230K |
| **Total** | **13 tasks** | **~1,330K tokens** |

**Fresh sessions expected**: **13** (one per task; Task 3.5 may consume internal subagent budgets but stays within a single main session given dispatch model). Budget watchdog applies per-session: 200K wind-down, 230K cliff. No single task exceeds 200K planned budget; all fit within the 250K cap (R-1).

---

## H. Risks (consolidated)

| Risk | Severity | Task | Mitigation |
|---|---|---|---|
| OTEL SpanProcessor hook breaks OTLP exporter pipeline | MEDIUM | 3.2 | Architect verifies via research/otel.md; integration test with InMemorySpanExporter |
| stdin slash-command delivery to claude subprocess unreliable | MEDIUM | 3.3 | SIGTERM/SIGKILL fallback path is the safety net; mandatory timeout test |
| Handoff builder grows an LLM call ("just to summarize") | HIGH (charter-breaking) | 3.4, 3.5 | `decisions/0NN-handoff-no-llm.md` forecloses; 3.12 verifier I-1 grep is the gate |
| Handoff prompt bloat across N handoffs | MEDIUM | 3.5 | 5000-token hard cap in renderer; aggressive truncation of ancient history |
| Recharts bundle weight on Web UI | LOW | 3.8 | Hand-rolled SVG fallback acceptable per Karpathy P2 |
| N5 latency test flaky on Windows runner | LOW-MEDIUM | 3.10 | Warm-up POST + P95 assertion + skip-after-50-runs proven-flaky policy |
| MULTI_TASK_IMPL session 3.5 exceeds 200K wind-down | MEDIUM | 3.5 | Subagent-driven-development skill + per-sub-task budget watchdog; split to continuation session if needed |
| Verifier finds critical I-1 violation in 3.12 | HIGH (recovery cost) | 3.12 | Phase 3 architects (3.1, 3.4) explicitly cite I-1; sandwich-architect plan is the prevention layer |

---

## I. Out of Scope for Phase 3

- LLM-based handoff summary (deferred to v2; charter Principle 1 forbids in daemon).
- Cross-account rate-limit detection beyond ccs auto-failover (was Task 3.6 in old decomposition; descoped — ccs handles failover; Orch only needs to detect "all exhausted" which is a Phase 4 concern).
- Session-type enforcer (was Task 3.5 in old decomposition; descoped — premature optimization for v1; revisit when 2nd managed project exists).
- Decision audit trail UI page (was Task 3.7 in old decomposition; descoped — events already SSE-streamed and persistable; no dedicated UI needed for v1).
- Project-specific slash-command awareness as a separate task (was Task 3.8 in old decomposition; **absorbed** into Task 3.3 via `commands.session_end` profile field).
- Tasks page in Web UI (cron status visualization) — descoped to Phase 4.
- Profile.yaml hot-reload (Phase 0 open question #6) — explicit `/reload` endpoint deferred.

---

## J. Charter Alignment Summary

| Charter goal | Task(s) closing it |
|---|---|
| F4 graceful end at 230K + handoff | 3.2, 3.3, 3.5, 3.6, 3.11 |
| F6 token/cost chart in Web UI | 3.8 |
| O1, O2 trace nesting | (Phase 2 — no regression in 3.12) |
| O3 cost queryable per project/day/session-type | 3.8 |
| N5 Telegram latency < 2s | 3.10 |
| Principle 1 daemon-dumb (no LLM in core) | 3.4 decision + 3.12 verify |
| Principle 3 project-agnostic | 3.7 (cron) + 3.12 verify (I-2 grep) |

---

## Next Action

Dispatch **Task 3.0** (Carryover Cleanup Pass) — sandwich-dev (sonnet, FOCUSED_IMPL, ~80K, run_in_background=true, tool-call-first ordering). This is the unblock for everything else.

```
plan_path: C:\htdocs\orch-starter\agent-workspace\session-plans\pending\phase-3-intelligence-plan.md
total_budget_estimated: ~1330K tokens
session_count: 13
risks:
  - OTEL SpanProcessor hook ordering (MEDIUM, mitigated by integration test)
  - stdin slash-command delivery unreliable (MEDIUM, SIGTERM fallback)
  - Handoff builder LLM-temptation (HIGH charter-breaking, foreclosed by decision doc + verifier grep)
  - Handoff prompt bloat (MEDIUM, 5K-token hard cap)
  - MULTI_TASK_IMPL 3.5 budget creep (MEDIUM, subagent skill + watchdog)
  - Verifier finds critical I-1 in 3.12 (HIGH recovery, prevented by 3.1/3.4 architecture)
decisions_made:
  - To be created during Phase 3:
    - decisions/0NN-context-full-ingestion-mode.md (in 3.1)
    - decisions/0NN-handoff-no-llm.md (in 3.4)
    - decisions/0NN-trace-backend-toggle.md (in 3.9)
next_action: Dispatch Task 3.0 (sandwich-dev, sonnet, FOCUSED_IMPL, ~80K, bg=true)
```
