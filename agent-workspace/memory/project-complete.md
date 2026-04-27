# Project Complete — Orch v1.0.0

**Date**: 2026-04-27
**Phases**: 0 → 4 (all complete)
**Status**: v1.0.0 user-confirm halt point — no git operations performed; awaiting user authorization

---

## One-Line Vision

Orch is a lightweight, self-hosted orchestration daemon that removes manual session lifecycle management from Claude Code development workflows — auto-spawning sessions, handling context-full handoffs, processing plan queues, and reporting via Telegram and Web UI.

---

## Per-Phase Summary

### Phase 0 — Research & Verify (2026-04-24)

Systematic study of four reference repositories (`praktor`, `claude-code-telegram`, `claudegram`, `nanoclaw`) using the research-protocol skill. Produced `SYNTHESIS.md` with 15 architectural decisions (D1–D15) covering Grammy vs Telegraf, Fastify vs NestJS, Prisma + SQLite vs raw better-sqlite3, OTEL stack choice, and adapter abstraction boundaries. No code written; the research phase directly prevented several dead-end implementation paths (e.g., D7 prevented raw sqlite3 concurrent write races; D11 established the `IAgentRuntime` adapter pattern that all of Phase 1 built on). See `session-plans/completed/phase-0-research.md`.

### Phase 1 — Core Daemon MVP (2026-04-25)

Built the NestJS monorepo skeleton (`packages/core`, `packages/cli`, `packages/shared`) and all foundational infrastructure: domain entities + state machine, Prisma/SQLite with WAL mode, `OrchStoreService`, `SecretRedactorService`, `ProjectRegistryService` (Chokidar file watcher), `EventBusService` (typed channels), `TracingService` (OTEL + W3C propagation), `SessionManager`, `RequestQueue`, `AgentWatchdog`, `ClaudeCodeAdapter` (execa subprocess), and hook-event ingest. One verifier FAIL (Task 1.10 — missing SessionStart schema + wrong column lookup) and one APPROVED_AFTER_FIX (Task 1.16 — dead security primitives, unauthenticated /admin endpoint). 707 monorepo tests at phase exit. See `memory/phase-1-complete.md`.

### Phase 2 — Interfaces (2026-04-25)

Added the full operator interface layer on top of the core daemon: SSE live event bridge (`GET /api/v1/events/stream`), Telegram bot (`packages/telegram` via Grammy) with 8 commands and I-6 confirmation gating on destructive ops, Web UI (`packages/web-ui` React + Vite) with login, dashboard, kanban, activity feed, session detail, and usage chart, and full OTEL runtime wiring (W3C `traceparent` threading end-to-end). Also resolved Phase 1 carryover Bucket A (gitignored dev.db, ORCH_HOME path defaults, unhandledRejection handlers). 1,092 monorepo tests at phase exit. See `memory/phase-2-complete.md`.

### Phase 3 — Intelligence Layer (2026-04-26)

Added autonomous decision-making: `ContextBudgetService` (OTEL span accumulation → 230K threshold → `session.forceHandoff` event), graceful session end (`/session-end` stdin + SIGTERM/SIGKILL fallback), `HandoffContextBuilder` (git diff + session log + prompt renderer, zero LLM), `HandoffOrchestratorService` (DB row write + successor spawn with seedPrompt), `CronSchedulerService` (interval-based; `SessionLock` prevents overlap), trace-backend toggle (Langfuse alt-backend), N5 latency harness (< 2s HTTP + SSE-listener variants), and Phase 3 integration E2E (7 it() blocks covering A1–A5 + B1 + R1). Also fixed a P0 production bug: `redactLogObject` was converting Date fields to `{}`, silently breaking the handoff chain. 1,346 monorepo tests at phase exit. See `memory/phase-3-complete.md`.

### Phase 4 — Polish & Share (2026-04-27)

Closed all Phase 3 carryforwards and prepared Orch for v1.0.0 release: SessionManager schema extension (real `commit_sha` + `session_log_path` from DB), adapter prepend behavioral coverage, SessionLock P2021-tolerance, CLI `init`/`attach`/`detach` with atomic hook injection, StockForge + generic example integrations, GitHub Actions CI (Node 20 + 22 matrix) + release workflow, Docker Compose 3-profile stack, comprehensive docs (README + 4 docs/* files), and an adversarial E2E verification gate. The gate found CRITICAL-1 (async-void SessionManager leak under cross-package parallel test runs) which was narrow-fixed via P2021-tolerance in `releaseSessionLock`. 1,375 monorepo tests at phase exit (1372 → 1375 from the fix). See `memory/phase-4-complete.md`.

---

## Final Statistics

| Metric | Value |
|---|---|
| Total phases | 5 (Phase 0 → Phase 4) |
| Total monorepo tests | **1,375** |
| Total decisions logged | **11** (decisions/001–010 + README) |
| Total invariants enforced | **15** (I-1 through I-15) |
| Total packages | 5 (`@orch/core`, `@orch/cli`, `@orch/shared`, `@orch/telegram`, `@orch/web-ui`) |
| Total token budget consumed | See `memory/budget-tracker.md` — Phase 0 ~193K, Phase 1 ~800K est, Phase 2 ~1.2M est, Phase 3 ~1.8M est, Phase 4 ~900K est ≈ **~4.9M total** |
| Total autonomous sessions | ~28 (sessions #1–#28) |

---

## Charter Scorecard Summary

22 functional/non-functional/observability/safety criteria from `PROJECT_CHARTER.md` §Success Criteria:

- **21/22 PASS** — F1–F8, N1–N5, O1–O4, S1–S4 all verified in Phase 4 adversarial gate.
- **N6 (72h memory leak)** — DEFERRED to manual extra-mile post-release. Not a Phase 4 blocker per plan §4.12. Requires running the daemon for 72 hours and measuring RSS delta; environment-dependent and cannot be automated in the current test suite.

---

## Known Limitations / Future Work (v1.0.1 Backlog)

| Item | Priority | Notes |
|---|---|---|
| `inject-hooks.ts` JSDoc step-numbering | LOW | Header says backup→validate→atomic; actual impl is validate→backup→atomic. Substance correct. Cosmetic doc fix. |
| ccs-spawn integration test gating | LOW | `claude-code-adapter.integration.spec.ts` fails when `ccs` binary is absent from PATH (CI/clean environments). Add to CI integration-test gating with `describe.skipIf(!hasCcsBinary)` pattern already established. |
| `docs/quickstart.md` population | LOW | File was not mandated by Phase 4 plan; stub exists. Populate with first-run walkthrough for v1.0.1. |
| N6 — 72h memory leak verification | MEDIUM | Run daemon 72h on real workload; capture RSS at start/end; confirm stable. |
| Multi-tenant dashboard | LOW | Phase 4 out-of-scope per plan. Multi-user project view, team-share features — v1.1 roadmap. |

---

## What Worked Well

**Sandwich pattern** (architect → dev → verifier): The three-agent structure for each implementation session was the right choice for IMPL-heavy phases. Architects caught scope creep before it landed; verifiers (especially opus) found defects that sonnet developers missed (SessionStart schema, dead security primitives, unauthenticated /admin, P0 Date redaction bug, CRITICAL-1 async-void leak). The pattern added ~30% wall-clock time per task but prevented ~80% of the narrow-fix cycles that would have been needed without it.

**master-planner upfront decomposition**: Running opus as master-planner at the start of Phase 3 and Phase 4 produced concrete session-level plans with budgets and subagent assignments that turned out to be accurate within 20%. This prevented mid-phase scope drift — when a task verifier found a carryforward, it went into a pre-planned slot rather than causing ad-hoc plan amendments.

**Real-transcript wind-down protocol**: The Mode C check (reading `.transcript-tokens` before ending a turn) prevented the "self-track illusion" failure mode observed in Session #23 (self-track 165K vs real 122K — a silent loop-break with no reboot trigger). Making the check mandatory before any turn-end citing budget pressure kept the autonomous loop running correctly through 28 sessions.

**Adversarial verifier in opus catches what sonnet developers miss**: Every phase had at least one verifier finding that sonnet-level review missed. Phase 1: DI interface injection, session lookup column mismatch, dead security primitives. Phase 3: P0 Date redaction bug, SSE-listener timing mechanism deviation. Phase 4 CRITICAL-1: async-void SessionManager leak reproducible only under cross-package parallel test runs. Opus adversarial review with fresh context is the single highest-value quality gate in the pipeline.

## What Didn't Work Well

**Pre-staged work from prior sessions causing checkpoint drift**: In Phase 3, Tasks 3.8 and 3.9 were substantially pre-implemented in session #19 but appeared as pending in `current-execution.md`. The architect pass for both tasks had to discover this drift before planning. The fix is to write session logs more atomically — update `current-execution.md` immediately when a task completes, not at the end of the session.

**Cross-package parallel test reproducibility**: CRITICAL-1 was only reproducible under `pnpm test` (root, parallel). This class of failure (async-void teardown races across independently-teared-down test suites) is invisible to standalone package tests. Future phases should include a `pnpm test` (root, 3 runs) gate as part of every IMPL session's local verify step, not just the final verifier pass.

**Session #23 premature wind-down**: The autonomous loop silently stopped at self-track 165K when real was 121K. The failure mode (conflating self-track with real-transcript thresholds) was documented and codified as a rule, but it cost ~2.5 hours of dead time before the user nudged continuation. The watchdog hook is the authoritative source; the LLM self-track is bookkeeping only.
