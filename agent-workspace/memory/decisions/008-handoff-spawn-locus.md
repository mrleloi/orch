# Decision 008 — Handoff Spawn Locus: HandoffOrchestrator vs Queue Dispatcher

**Date**: 2026-04-26
**Status**: ACCEPTED
**Source**: Task 3.6 narrow-fix-cycle-2; sandwich-verifier 2nd-pass MAJ-A finding; addresses verifier's request for explicit override of plan §3.6 line 183.
**Overrides**: Plan §3.6 line 183 ("Queue dispatcher reads pending plan AND the handoff context for the same project, prepends rendered prompt to the next session's initial message.")

---

## Context

Plan §3.6 line 183 specifies that the **queue dispatcher** is the component that reads HandoffContext and prepends the rendered prompt to the next session's initial message.

The Task 3.6 implementation places this logic inside `HandoffOrchestratorService._spawnSuccessor()` (`packages/core/src/modules/handoff/handoff-orchestrator.service.ts:394-447`). The queue module (`packages/core/src/modules/queue/`) was not modified — `grep "seedPrompt|HandoffContext|handoffPrepared|handoffApplied"` returns zero matches.

This is an architectural divergence from plan-language. Per the "plan-as-truth" rule (`agent-notes.md` 2026-04-25 entry), divergence requires either implementing as written OR a decision-log override. This document is the override.

## Decision

The handoff spawn-locus is **HandoffOrchestratorService**, not the queue dispatcher. Plan §3.6 line 183's "Queue dispatcher reads…" language is reinterpreted as **the auto-spawn path inside HandoffOrchestratorService**, which is functionally equivalent but architecturally cleaner.

## Rationale

1. **Single owner of HandoffContext lifecycle.** The HandoffContext row's status state-machine (READY_FOR_AUTO_SPAWN → APPLIED, or AWAITING_CONFIRM → APPLIED via `confirmHandoff()`) is governed by HandoffOrchestratorService. Splitting consumption across queue dispatcher would require:
   - Queue dispatcher polling for `READY_FOR_AUTO_SPAWN` rows
   - Two services racing on the same status transition
   - Duplicate seedPrompt-rendering logic OR a re-entrant render call
   - Cross-module event dance to communicate "row consumed"

2. **Queue dispatcher is for queue items, not handoff rows.** The QueueWatcherService consumes pending plan files and queue table rows. HandoffContext is a separate persistence concept (linked to a finished session, not to an inbound plan). Forcing a single dispatcher to consume both creates needless coupling and obscures the distinct lifecycles.

3. **YAGNI on indirection.** No present requirement (Phase 3 spec, charter, or downstream task) needs the queue dispatcher to mediate handoff. Adding the indirection now would be speculative and would violate Karpathy P2 (Simplicity First).

4. **Symmetry with auto/manual paths.** The I-6 gate (auto_handoff true vs false) is naturally implemented in HandoffOrchestratorService. The auto path calls `_spawnSuccessor()` immediately; the manual path emits `handoffPending` and waits for `confirmHandoff()` which in turn calls `_spawnSuccessor()`. Centralizing the spawn-locus keeps both paths under one service.

5. **Future restart-recovery hook.** Decision 007 promised a future "restart sweep" that queries CONTEXT_FULL sessions without HandoffContext rows and replays. That sweep, when implemented, will live in HandoffOrchestratorService too. Co-locating with the auto/manual paths gives one service the entire handoff-spawn surface area.

## Consequences

- **HandoffModule provides its own `IAGENT_RUNTIME` binding.** This is necessary because HandoffOrchestratorService needs an adapter to call `spawn()`. (See MAJ-B carryforward in `agent-notes.md` for the related instance-isolation concern, tracked separately.)
- **Comment at `handoff-orchestrator.service.ts:348` ("queue dispatcher SKIPS AWAITING_CONFIRM rows") is aspirational.** The status filter is implicit in HandoffOrchestratorService's auto/manual branching, not enforced by an external dispatcher. This will be cleaned up when MAJ-B is addressed.
- **Plan §3.6 line 183 language stands as overridden.** Future agents reading the plan should read this decision concurrently to avoid re-implementing the queue-dispatcher path.

## Test Coverage

- **T-ORCH-4** (`handoff-orchestrator.service.spec.ts`) — auto path: `adapter.spawn()` invoked with `seedPrompt` matching rendered text.
- **T-I6-1, T-I6-2, T-I6-3** — auto vs manual gate behavioral assertions.
- **INT-HANDOFF-1** (integration) — end-to-end with fake adapter; `spawnCalls[0].seedPrompt` non-empty.
- **INT-HANDOFF-2** (integration) — manual confirm path; `spawnCalls.length === 0` before `confirmHandoff()`, `=== 1` after.

No queue-dispatcher integration test is required because there is no queue-dispatcher integration to verify. The auto-spawn path is the entire path.

## Acid Test

If a future feature requires queue dispatcher to mediate handoff (e.g., distributed orch with multiple daemon instances racing on a shared HandoffContext table), this decision must be revisited. Until then, the locus stays in HandoffOrchestratorService.
