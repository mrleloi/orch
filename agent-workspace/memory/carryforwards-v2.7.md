# Carryforwards — v2.7

> Working list of carryforwards surfacing during v2.6 (Phase 11) burndown.
> Authored at substage close-time as concerns are surfaced; consolidated into a
> final carryforwards-v2.7.md at Phase 11 close.

## Source: 11.3 CF-DOGFOOD-2 disposition (binding decision, 2026-04-28)

Decision: `agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md`
Verdict: **DEFER-V2.7** (structural-defer pattern; inherits Decision 033
Deliberation E shape)

### CF-DOGFOOD-2 (carried v2.3 → v2.4 → v2.5 → v2.6 → v2.7)

**Source**: `scripts/dogfood/run-self-task.ts:387` step-9 stub
(`appendTrace({...,dispatch_deferred_to:'8.5.3'})`). The 8.5.2 dogfood
harness ships steps 1–8 + step 11 of the spec §4.2 algorithm but the
real subprocess dispatch via `IAgentRuntime.spawn()` /
`SessionManager.runSession()` is not wired.

**Severity**: structural; non-load-bearing for v2.6 critical path.

**Why deferred again**: zero of the four Phase 10 §4.2 trigger conditions
were met at Phase 11 entry. Decision 035 verdict is DEFER-V2.6 (SC-39
remains gated; real dogfood telemetry not load-bearing). OSS launch
not scheduled before Phase 11 §11.5 close. No drift detected (no
unrelated substage has touched the harness). Multi-user rollout not
on Phase 11 critical path.

**Re-attempt prerequisites for v2.7 (Decision 039 §4.3)** — at Phase 12
entry, this CF re-opens to FIX_INLINE disposition only if AT LEAST ONE
of the following is MET:

- **R-039.1**: Decision 037 verdict (v2.6 SC-39 R-4 close) =
  ENABLE_RETRY OR a v2.7-equivalent verdict that requires real dogfood
  telemetry as a load-bearing input.
- **R-039.2**: Community OSS launch is scheduled in v2.7 master plan
  with `docs/dogfood-harness.md` (8.7.4 OSS docs deliverable) on the
  critical path.
- **R-039.3**: Drift detected — any v2.6 or v2.7 substage modifies
  `scripts/dogfood/run-self-task.ts` (auto-detected by
  `scripts/audit/charter-coherence-spot-check.sh` at v2.7 entry).
- **R-039.4**: Multi-user adoption rollout requires envelope schema
  (`packages/core/src/dogfood/envelope-schema.ts`) to evolve.
- **R-039.5**: Operator override — explicit user prompt requesting
  CF-DOGFOOD-2 closure at v2.7 entry.

**If NONE of R-039.1..R-039.5 holds at v2.7 entry**: this CF
self-extends to DEFER-V2.8 by the same rationale shape (Decision 033
Deliberation E pattern explicitly contemplates multi-cycle structural
defer).

**How to apply (when re-opened)**:
- Reference template in `cf-dogfood-2-assessment.md` §5 (Phase 10 §10.3
  output) provides the Option B (FIX_INLINE_MINIMAL) dispatch envelope
  verbatim.
- Recommended scope at v2.7 re-open: Option D from assessment §3.4
  (FIX_INLINE_MINIMAL + RUN_CONTROL_FLAG; profile-flag default OFF;
  ~90 LOC delta; ~45K budget).
- Acceptance gate: `pnpm typecheck` + `pnpm lint` + `pnpm test` PASS;
  `grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts` →
  0 matches (stub label removed); new test verifies
  `IAgentRuntime.spawn()` invoked with correct config when profile
  flag ON.

**Charter-coherence**: Decision 039 §4.4 cross-checks all charter
principles, invariants, and prior decisions. Deferral is design
(scaffold-now-execute-later per Decision 027 §C-8), not drift.

---

## Source: (additional v2.7 carryforwards will be appended here as Phase 11 substages close)
