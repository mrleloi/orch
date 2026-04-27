# Session 24 — 2026-04-26 — Phase 3 Close-Out Polish

## Goal

Close 10 of 13 Phase 3 carryforward items in a single FOCUSED_IMPL pass. Items #4, #9, #10 were pre-triaged as SCOPE-DISCARD or SPLIT by the architect plan.

## Session Type

FOCUSED_IMPL

## Approach

Executed plan `3.x-phase3-close-out-polish.md` Part E task list in order. Applied VBW (verify before write) protocol: read each target file before editing. Pre-staging drift check: found item #1 (FIFO) not yet in place; item #5 (makeConfig) not yet widened; item #6 (ccs skipIf) not yet added; all others also absent. All 10 items were implemented fresh.

## Accomplished

- Item #1 (FIFO eviction): `context-budget.service.ts` lines 129-151 replaced with FIFO ring-buffer (`shift()` at cap, then `push()`). +1 FIFO eviction unit test in `context-budget.service.spec.ts`.
- Item #2 (MAX_USAGE_SAMPLES reconciliation): JSDoc comment added at `context-budget.constants.ts` line 61; `3.8-f6-usage-chart.md` plan annotation corrected to 1000 + cache_read attr name.
- Item #3 (cache-read attr decision doc): Created `decisions/009-cache-read-attr-name.md` (~80 lines).
- Item #5 (makeConfig fixture widening): `session-usage.spec.tsx:80` signature extended to `makeConfig(traceBackendUiUrl, traceBackend = 'otlp')`. All 4 call-sites remain valid via default args.
- Item #6 (ccs skipIf guard): `claude-code-adapter.integration.spec.ts` - added `detectCcsBinary()` helper + updated `SKIP` to also skip when `!hasCcsBinary`. Guard is correct; however in the current dev environment `ccs` IS on PATH (see Drift Discovery below).
- Item #7 (handoff.module.spec.ts block-comment regex): Added `replace(/\/\*[\s\S]*?\*\//g, '')` step before line-comment strip. Comment updated.
- Item #8 (decisions/007 doc fix): Rewrote bullet 2 of §Test coverage to accurately describe `T-ORCH-7-ROLLBACK` as span error attrs (not log call).
- Item #11 (6-field cron schema test): Added `it('accepts 6-field (per-second) cron expression', ...)` to `profile.spec.ts` describe block.
- Item #12 (SSE-listener latency variant): Added `(N5 SSE wire-path variant)` `it()` block to `latency.spec.ts`. Also added `EventBusService` + `EVENT_CHANNELS` imports. Updated comment block lines 71-79 to cite decisions/010.
- Item #13 (decision doc 010): Created `decisions/010-task-3.10-http-vs-sse-timing.md` (~120 lines).

## Drift Discovery

- Item #6 integration skipIf: `ccs` IS on PATH in the current dev environment (`C:\nvm4w\nodejs\ccs`). The `hasCcsBinary` guard correctly does NOT skip in this environment. The integration test still fails (1 known-fail) because `ccs` runs but `claude` cannot authenticate. This is expected for a dev machine without an active claude session. The fix is correct for its intended purpose (CI environments without ccs). The 15-pass threshold is maintained.
- Items #4 (ApiController ConfigService injection) and #9 (T-SEED-2 behavioral coverage) and #10 (SessionManager schema extension): Not touched per SCOPE-DISCARD/SPLIT triage in §F of the plan.

## Gates Status

- Typecheck: PASS (core + web-ui)
- Lint: PASS (0 errors; 4 pre-existing warnings in web-ui, unchanged)
- Core Jest: PASS (969/969; was 966; +3: FIFO eviction test, 6-field cron test, SSE-listener latency)
- Web-UI Vitest: PASS (163/163; no delta, only fixture type widening)
- Shared Vitest: PASS (40/40; unchanged)
- Integration Jest: 15 passing + 1 failed + 1 skipped (same as before; ccs present on PATH, skipIf guard works correctly for absent-ccs case)
- I-1 (no SDK imports): PASS
- I-2 (no stockforge): PASS
- I-15 (cache_read_tokens): PASS

## Files Modified

- `packages/core/src/modules/context-budget/context-budget.service.ts` (FIFO eviction)
- `packages/core/src/modules/context-budget/context-budget.constants.ts` (MAX_USAGE_SAMPLES JSDoc)
- `packages/core/src/modules/context-budget/context-budget.service.spec.ts` (FIFO test + import)
- `packages/web-ui/src/pages/session-usage.spec.tsx` (makeConfig fixture widening)
- `packages/core/src/modules/sessions/claude-code-adapter.integration.spec.ts` (ccs skipIf)
- `packages/core/src/modules/handoff/handoff.module.spec.ts` (block-comment regex)
- `packages/core/src/domain/profile.spec.ts` (6-field cron test)
- `packages/core/src/__e2e__/latency.spec.ts` (SSE-listener variant + comment update + imports)
- `agent-workspace/memory/decisions/007-handoff-tx-ordering.md` (doc fix)
- `agent-workspace/session-plans/pending/3.8-f6-usage-chart.md` (plan annotation reconciliation)

## Files Created

- `agent-workspace/memory/decisions/009-cache-read-attr-name.md`
- `agent-workspace/memory/decisions/010-task-3.10-http-vs-sse-timing.md`
- `agent-workspace/memory/decisions/README.md` (updated index, not created)

## Decisions Made

- decisions/009-cache-read-attr-name.md: Pin `gen_ai.usage.cache_read_tokens` as Orch-authoritative name; plan annotation was stale.
- decisions/010-task-3.10-http-vs-sse-timing.md: Keep both HTTP-round-trip (L1/L2 deterministic guard) and SSE-listener (N5 direct) variants going forward.

## Test Count Delta

- @orch/core jest: 966 → 969 (+3: FIFO eviction + 6-field cron + SSE-listener latency)
- web-ui vitest: 163 → 163 (no delta; only fixture widening)
- integration: 15+1fail+1skip → 15+1fail+1skip (guard works for absent-ccs; ccs present on this dev machine)
- Monorepo total: 1316 → 1319 (+3)

## Items Deferred (per plan §F)

- #4 SCOPE-DISCARD: ApiController ConfigService injection (I-10 already satisfied at boot; P3)
- #9 SPLIT: T-SEED-2 behavioral coverage (>10 LOC + production code; schedule as 3.x-extra)
- #10 SCOPE-DISCARD: SessionManager schema extension (schema migration + behaviour change; ~150K separate task)

## Concerns

1. Integration 1-fail persists: `ccs` is on PATH but fails with exitCode=1 (no valid claude session). This is expected dev-box behavior, not a regression. The skipIf guard correctly handles absent-ccs environments (CI). Recommend: add `ORCH_SKIP_INTEGRATION=1` to CI env if not already set.
2. Test count is 969 vs plan's 968: extra test from FIFO eviction (+1) per plan's own §E.3 note ("adjusts target to 969 if added"). No discrepancy.

## Next Session Pickup

Phase 3 close-out polish: 10/10 INCLUDE items closed. Remaining: #4, #9, #10 deferred per §F.

Recommended next steps (per plan §Handoff):
- Path A: dispatch sandwich-architect for Task 3.11 Phase 3 Integration E2E.
- Path B: schedule SessionManager schema-extension task before 3.11 for real handoff content.
- Path C: Task 3.x-extra T-SEED-2 (~30K) before 3.11.
- After 3.11: Task 3.12 whole-Phase-3 adversarial verifier (opus, 80K) → Task 3.13 housekeeping.
