# Phase 3 — Intelligence Layer (Stub)

> **Status**: STUB — awaiting master-planner decomposition
> **Pre-requisite**: Phase 2 COMPLETE (2026-04-25). Monorepo 1,092 tests. Daemon boots port 4141. I-1 through I-15 satisfied.
> **Reference decomposition**: `session-plans/pending/phase-3-intelligence.md` (existing high-level task breakdown)

---

## Phase Goal

Make the orchestrator smart about sessions: detect context-full, build handoff context, enforce budgets, schedule cron dispatches, polish trace-links, toggle backends.

**Success criteria** (abbreviated; master-planner will refine):
- Context-full detection: OTEL token accumulation → `session.contextNearLimit` / `session.forceHandoff` events
- Graceful session end: `/session-end` slash command + SIGTERM/SIGKILL fallback; CONTEXT_FULL state
- Handoff context builder: L0 (file diffs) + L1 (session log) → deterministic next-session prompt; no LLM calls (I-1)
- Context-budget enforcer: per-session cap, daily cap, per-project cap; pause queue + notify on hit; matches Charter F4
- Cron scheduler: timed plan dispatch (profile `cron:` field → plan enqueue)
- Session-detail trace-link polish: Langfuse / SigNoz deep-link from `SessionDetailPage` span timeline
- Langfuse alt-backend toggle: env-driven `ORCH_TRACE_BACKEND=langfuse|otlp|none`
- F6 token/cost chart on `SessionDetailPage` (Charter O3; co-implementable with context-full detector)
- All Phase 2 carryover minor fixes addressed (see Phase 3 Carryover below)
- I-1 through I-15 still satisfied; no LLM in daemon state machine

---

## Phase 3 Carryover (from Phase 2 Task 2.12 verifier)

Minor, non-blocking. Address as cleanup subtasks early in Phase 3:

1. `DomainError.toJSON` cause-chain non-recursive (`packages/core/src/domain/errors.ts:110-122`)
2. Tracing span leaks raw `sessionKey` (`packages/core/src/modules/sessions/session-manager.ts:460`)
3. `handlePrismaError` literal `'P2002'` only (`packages/core/src/domain/prisma-error-helper.ts:19`)
4. N5 latency E2E timing harness absent (no wall-clock SSE delivery assertion ≤ 2s)
5. F6 token/cost chart on `SessionDetailPage` (Charter O3)

---

## Scope Reference (from Phase 1 plan "Deferred to Phase 3")

- Handoff context builder (L0 = file diffs; L1 = session log; surface stockforge's `/session-end` pattern)
- Context-budget enforcer (graceful end at 230K; matches Charter F4)
- Cron scheduler (timed plan dispatch)
- Session-detail trace-link polish (Langfuse / SigNoz deep links)
- Langfuse alt-backend toggle (env-driven)

---

## Next Action

Dispatch **master-planner** (opus) to read this stub + `session-plans/pending/phase-3-intelligence.md` and produce a concrete Phase 3 session plan with:
- Full task list with budgets, subagent assignments, dependencies
- Parallelizable tracks identified
- Phase 3 carryover integrated into appropriate tasks

Do NOT start implementation before master-planner produces the session plan.
