# SC-27-B Graceful-Degradation Re-attestation Post-CF-33

**Date**: 2026-04-27
**Authored by**: task-implementer (sonnet/medium, ORCH_SPAWNED, substage 9.6.3)
**Source SC**: SC-27-B (Phase 9 re-attestation gate; conditioned on CF-33 outcome)
**Status**: PASS_NO_CHANGE

---

## Original Gate

**SC-27** (Phase 6) was the real-world parallelism measurement criterion (≥35% wallclock
improvement on ≥2 of 3 substages). It was adjudicated `PARTIAL` at Phase 6 close via
**Decision 019** graceful-degradation policy (`agent-workspace/memory/decisions/019-6.4-real-world-sc18-method.md`):
the mtime-proxy methodology could not observe actual subagent execution overlap, yielding
`FAIL` headline numbers (6.1=8.0%, 6.2=0.9%, 6.3=0.4%) despite demonstrated parallelism
in Phase 5 (75% synthetic fixture) and Phase 6 dispatch graph (5 turns vs 8 forced-serial
≈ 37.5% saving). Decision 019 §Consequences explicitly permits this graceful-degradation
landing; SC-27 was marked PARTIAL, not FAIL-blocking.

**SC-27-B** is the Phase 9 re-attestation gate, conditioned on: "re-attest SC-27-B if
CF-21/CF-33 path-cleanup changes the graceful-degradation contract." The gate was
documented in `phase-9-routing-brief.md §1 entry 9.6` as blocked-until-CF-33-outcome-known.
CF-33 outcome is now known (substage 9.5 verifier P5); this document closes the gate.

---

## CF-33 Outcome

**CF-33** was the dead-code cleanup task targeting `packages/core/src/dispatch/recorder.ts`
(a file that was planned as the dispatch recorder, but was superseded by the hook-based
`scripts/hooks/dispatch-jsonl-recorder.sh` approach before it ever shipped to git).

**Verification command and result**:
```
test ! -f packages/core/src/dispatch/recorder.ts
```
Exit code: **0** (file absent — GATE PASS)

**Source of truth**: 9.5 verifier P5 observation in
`agent-workspace/memory/observations/task-9.5-20260427-sc39-artifacts.md` confirmed:
`packages/core/src/dispatch/recorder.ts` does not exist; zero importers. CF-33 is
`PASS (no-op; auto-satisfied)` — the file was already absent prior to substage 9.5;
no delete action was required or performed.

Per Decision 034 §Artifact Summary Table (Artifact 5, `CF-33 dead-code cleanup`):
> "file absent OR safely deleted — **PASS** (no-op; auto-satisfied)"

---

## SC-27-B Verdict: PASS_NO_CHANGE

The re-attestation gate resolves as **PASS_NO_CHANGE** for the following reasons:

1. **CF-33 was a NO-OP.** `packages/core/src/dispatch/recorder.ts` never existed in the
   working tree during any phase of v2.x development. No change to the dispatch-recorder
   code path was made; therefore the graceful-degradation contract established by Decision 019
   is unchanged by CF-33.

2. **Decision 034 DEFER-V2.5 removes contract-renegotiation pressure.** SC-39 (the
   self-evolution retry loop) has been deferred to v2.5+ by Decision 034 BINDING
   (`agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md`). SC-39 was the
   only in-v2.4 change that could have created demand to renegotiate the graceful-degradation
   contract (e.g., by requiring a higher-fidelity parallelism signal as an SC-39 prerequisite).
   With SC-39 deferred, that pressure is absent; the Decision 019 graceful-degradation
   verdict stands without amendment.

3. **No seam-level change in v2.4 scope.** The scheduled v2.4 substages (9.6/9.7/9.8)
   do not modify `dispatch-jsonl-recorder.sh`, the tool_use_id correlation path (CF-21
   scope, also DEFER-V2.5 per Decision 026), or `sc18-realworld.ts`. The SC-27 PARTIAL
   measurement methodology is unchanged. Nothing in v2.4 retroactively alters the Phase 6
   graceful-degradation verdict.

---

## Closure Citation

> **Decision 034 BINDING** (`agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md`)
> ⇒ SC-27-B gate resolved as **PASS_NO_CHANGE**.

Gate condition was: "CF-33 outcome known." CF-33 outcome is confirmed NO-OP. Gate is
therefore met. SC-27-B closes as `PASS_NO_CHANGE` — the graceful-degradation contract
from Phase 6 (Decision 019) remains in force, unmodified, through v2.4.

**SC-27-B does NOT promote SC-27 PARTIAL to PASS.** That promotion remains blocked by
CF-21 (tool_use_id correlation, Decision 026 DEFER-V2.5). This attestation only closes
the re-attestation gate, not the underlying partial verdict.

---

## References

| Source | Role |
|---|---|
| `agent-workspace/memory/decisions/019-6.4-real-world-sc18-method.md` | Original graceful-degradation policy; SC-27 PARTIAL rationale |
| `agent-workspace/memory/decisions/026-cf21-tool-use-id-correlation-defer.md` | CF-21 defer; blocks SC-27 PARTIAL → PASS promotion |
| `agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md` | BINDING DEFER-V2.5; Artifact 5 = CF-33 NO-OP; removes SC-39 pressure |
| `agent-workspace/memory/phase-6-complete.md` §B SC-27 row | SC-27 original PARTIAL verdict + graceful-degradation evidence |
| `agent-workspace/memory/phase-7-complete.md` SC-27 retro row | SC-27 retro PARTIAL (1 DISPATCHED + 19 COMPLETED; CF-21 asymmetric) |
| `agent-workspace/memory/phase-9-routing-brief.md §1 entry 9.6` | SC-27-B gate dependency on CF-33 outcome |
| `agent-workspace/session-plans/pending/9.6-phase-7-partial-closures-architect.md §B.2` | Task contract for this attestation |

---

## Pre-Verify Gate Evidence

```bash
# Run before authoring this attestation:
test ! -f packages/core/src/dispatch/recorder.ts
# Exit code: 0  ← PASS (file absent)
test -f agent-workspace/memory/attestations/sc-27-b-post-cf33.md
# Exit code: 0  ← PASS (this file exists)
```

Both gates satisfied. SC-27-B attestation is complete.
