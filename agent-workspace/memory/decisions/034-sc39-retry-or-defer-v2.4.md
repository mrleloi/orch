# Decision 034: SC-39 Retry Verdict v2.4 — DEFER-V2.5

**Status**: BINDING
**Supersedes**: Decision 033 (narrow 6-artifact retry gate)
**Author**: opus 4.7 main session #44 (autonomous Decision 034 dispatch, ORCH_SPAWNED)
**Date**: 2026-04-27

---

## Context

Decision 033 conditioned any v2.4 SC-39 retry on a 6-artifact prerequisite gate
(see Decision 033 §"Deliberation E"). Substage 9.5 stage 1 (task-implementer
`aaac573265c1149a7`, observation file
`agent-workspace/memory/observations/task-9.5-20260427-sc39-artifacts.md`)
produced all 6 artifacts on 2026-04-27 against post-Phase-8
`component-telemetry.jsonl` (~6,561 valid events).

This Decision 034 is the binding verdict that the 6-artifact synthesis
mandates. It supersedes Decision 033's narrow gate by absorbing it: the
prerequisites stand, the data has been collected, and the verdict is now
authored.

Decision 033 §"Deliberation E" pre-authorized three terminal verdicts:
**ENABLE_RETRY**, **DEFER_AGAIN** (re-test inside v2.4 after 9.6/9.7/9.8
generate more telemetry), or **DEFER-V2.5** (no v2.4 retry; structural
prerequisites required first). Decision 033 §"Deliberation E" further forbids
authorizing ENABLE_RETRY against failing artifact numbers — that path is
foreclosed.

---

## Artifact Summary Table

| # | Artifact | Source File | Key Metric | Threshold | Pass/Fail |
|---|----------|-------------|------------|-----------|-----------|
| 1 | Phase 8 RULE re-eval (CF-34) | `agent-workspace/memory/phase-8-rule-eval.md` | R1=FIRES, R2/R3/R4=NO-FIRE (stable from Phase 6.2.7) | New rules surface or threshold-tuning required | **PASS** (no new fires; calibration unchanged) |
| 2 | Unknown-agent bucket prevalence | `agent-workspace/memory/audits/unknown-agent-bucket-prevalence.json` | unknown_agent_fraction = **1.00** (162/162 agent events) | < 0.30 | **FAIL** |
| 3 | Real-dispatch correlation re-sample | `agent-workspace/memory/audits/cf21-real-dispatch-sample.json` | pairing_rate = **0.00** (0/99 paired); pairs_available = 0 | ≥ 0.40 direct OR ≥ 0.85 fallback; ≥ 50 pairs | **FAIL** (all three sub-thresholds) |
| 4 | Event volume target | `agent-workspace/memory/audits/sc39-prereq-volume.md` | total_events ≈ **6,561** | ≥ 10,000 | **FAIL** (34.4% short) |
| 5 | CF-33 dead-code cleanup | observation §CF-33 | `packages/core/src/dispatch/recorder.ts` does not exist; zero importers | file absent OR safely deleted | **PASS** (no-op; auto-satisfied) |
| 6 | Loop dry-run + reviewer ACK | `agent-workspace/memory/sc39-dry-run-output.md` | rollup-telemetry exit 0; 1 RULE-1 proposal generated; citation-linter `--input` PASS; rollup-mode FAIL on WebFetch/TaskList (CF-25 / pre-existing scope) | Loop mechanically runnable end-to-end | **PASS-WITH-CAVEAT** (loop runnable; 2 BUILTIN_HOOK_EVENTS gaps are CF-25 scope, not Decision 034 scope) |

**Aggregate**: 3 PASS, 3 FAIL. Three quantitative gates fail; the three that
pass are mechanical/dead-code/dry-run gates that do not validate the
underlying telemetry signal quality.

---

## Verdict: DEFER-V2.5

The verdict is **DEFER-V2.5**, not DEFER_AGAIN. Reasoning:

1. **Two of the three failing gates are structural, not temporal.**
   `unknown_agent_fraction = 1.00` and `pairing_rate = 0.00` are not symptoms
   of insufficient event volume — they are symptoms of a missing seam. The
   hook-based dispatch recorder emits `agent_type = unknown-agent` as a
   fallback because spawned agents do not self-report a canonical
   `component_name` through the telemetry seam, and DISPATCHED events use a
   different ID space (`toolu_*`) than COMPLETED events (hex IDs). This is
   the CF-21 / Decision 026 structural gap. Even if `total_events` crossed
   10,000, the loop would still receive 100% unknown-agent buckets and 0%
   paired dispatches — the additional volume would not change the signal.

2. **DEFER_AGAIN within v2.4 cannot succeed.** The remaining v2.4 substages
   (9.6 Phase-7 PARTIAL closure, 9.7 medium-priority scripts, 9.8 phase-close)
   do not modify the dispatch-recorder seam or address the tool_use_id
   correlation (those changes are Decision 026 scope, currently DEFER-V2.5).
   Re-testing the gate at end-of-v2.4 would therefore measure the same
   structural failure with marginally more events. That outcome is
   foreseeable; spending another retry cycle to confirm it is wasteful.

3. **Decision 033 §"Deliberation E" anticipates this path.** The phrase
   "structurally deferred" appears in the master-plan §9 deferral list
   exactly because authors anticipated that pairing-rate / unknown-agent
   fraction failures would not be fixable inside v2.4's scope. DEFER-V2.5 is
   the charter-coherent landing.

4. **Charter alignment.** P2 (Simplicity First) and the daemon-dumb /
   workers-smart invariant both argue against compounding signal-thin loop
   execution on top of a known-broken seam. Fix the seam first; then run
   the loop.

The verdict is **DEFER-V2.5** with explicit re-attempt prerequisites listed
below. Decision 034 itself attests the deferral; no separate
`sc39-defer-attestation-v2.4.md` file is required (per task instructions:
"If verdict is DEFER-V2.5, no separate attestation needed — Decision 034
itself attests").

---

## Re-attempt Prerequisites (binding for any future SC-39 retry)

Before SC-39 may be re-considered (in v2.5 or later), ALL of the following
MUST be true and evidenced:

1. **CF-21 tool_use_id correlation closure (Decision 026 scope).** The
   dispatch recorder seam must emit DISPATCHED and COMPLETED events sharing
   a single ID space such that direct matching yields a pairing_rate ≥ 0.40
   on a real (non-synthetic) sample of ≥ 50 dispatch pairs. This is a
   structural seam fix, not a configuration tweak.

2. **Named-agent self-reporting.** Spawned agents must self-report a
   canonical `component_name` (e.g., `task-implementer`, `master-planner`,
   `sandwich-architect`) through the telemetry seam such that
   `unknown_agent_fraction` drops below 0.30 measured over a stable phase
   cycle (no spike-then-decay artifacts).

3. **Phase-cycle stability for both metrics.** unknown_agent_fraction < 0.30
   and pairing_rate ≥ 0.40 must hold over ≥ 1 full phase cycle (one
   complete v2.5 phase or later) — not just a single sample window. The
   prereq-volume artifact (artifact 4) must be re-collected at the close of
   that phase and show ≥ 10,000 events.

4. **Citation-linter rollup-mode hygiene.** `BUILTIN_HOOK_EVENTS` in
   `scripts/utilities/citation-linter.ts` must include all built-in tool
   names emitted in current telemetry (currently missing: `WebFetch`,
   `TaskList`; CF-25 scope). Without this, rollup-mode citation-linter will
   continue to FAIL spuriously on the proposal review step.

5. **Loop dry-run regression.** A fresh dry-run (artifact 6 equivalent)
   must produce ≥ 1 mechanically meaningful proposal AND pass citation-
   linter in BOTH `--input` and rollup mode.

6. **Decision 035+ author-ack.** A future binding decision (Decision 035 or
   later) must explicitly cite all five prerequisites above as MET before
   any v2.5+ ENABLE_RETRY verdict is authored. The narrow gate is now
   foreclosed; only the broadened structural gate is acceptable.

---

## Consequences

1. **SC-39 stays DEFERRED in `phase-9-complete.md` SC scorecard.** The row
   that previously cited Decision 025 (v2.3 defer) and Decision 033 (v2.4
   narrow gate) now adds a citation to **Decision 034 (DEFER-V2.5)**.
   Substage 9.5 closes with verdict "Decision 034 authored; SC-39 retry
   defers to v2.5+ pending CF-21 closure".

2. **No `sc39-defer-attestation-v2.4.md` file is created.** Decision 034
   itself is the attestation. `phase-9-complete.md §3` must reference
   Decision 034 directly; `§7 Decisions Ratified` must list Decision 034.

3. **CF-21 (Decision 026) priority elevates.** Future v2.5 planning should
   treat CF-21 closure as a precondition for SC-39 — they are now coupled.
   The `sandwich-architect` for the v2.5 entry-substage should read this
   Decision and include CF-21 closure in the v2.5 master plan.

4. **F-2 self-evolution signal-extension also defers.** Per master plan §9,
   F-2 is most useful when the loop is enabled; deferring SC-39 to v2.5+
   automatically defers F-2 to the same horizon.

5. **No source code modified.** Decision 034 is a doc-only artifact.
   Substage 9.5 stage 1 already verified all gates PASS (typecheck, lint,
   1138/1138 tests). I-6 binding (zero commits) maintained.

6. **9.5 substage closure unblocked.** With Decision 034 authored, 9.5 may
   close pending sandwich-verifier review. The next downstream dispatch
   (per master plan §11) is sandwich-verifier opus/medium against this
   substage's artifacts.

---

## Alternatives Considered + Rejected

### Alt 1: ENABLE_RETRY

**Rejected.** Decision 033 §"Deliberation E" explicitly forbids authorizing
ENABLE_RETRY against failing artifact numbers. The data shows three quantitative
gates failing (unknown_agent_fraction=1.00 vs <0.30; pairing_rate=0.00 vs ≥0.40;
total_events=6,561 vs ≥10,000). Authorizing ENABLE in the face of these numbers
would (a) contradict Decision 033's narrow-gate constraint, (b) burn a v2.4
retry cycle on a known-failing signal, and (c) produce a mechanically-runnable
loop whose proposals are guaranteed to be ungrounded (100% unknown-agent
bucket; 0% paired data). Charter P1 (Think Before Coding) and the daemon-dumb
invariant both reject this path.

### Alt 2: DEFER_AGAIN (re-test at end of v2.4)

**Rejected.** DEFER_AGAIN would re-collect the 6 artifacts after substages
9.6/9.7/9.8 produce more telemetry, then re-author the verdict. The expected
outcome of that re-test is foreseeable: event volume might cross 10,000 (if
9.6/9.7/9.8 are dispatch-heavy), but unknown_agent_fraction and pairing_rate
will not change because no scheduled v2.4 substage modifies the dispatch
recorder seam or the tool_use_id correlation path (those are Decision 026 /
CF-21 scope, currently DEFER-V2.5). Spending another retry cycle to confirm
that two structural failures persist is not a productive use of v2.4 budget.
Charter P3 (Surgical Changes) argues against speculative retry without a
seam-level fix in flight.

### Alt 3 (chosen): DEFER-V2.5

**Selected** for the reasons in the Verdict section above. The structural
nature of the unknown_agent / pairing failures, the CF-21 dependency, and
Decision 033's explicit anticipation of this path all converge on DEFER-V2.5
as the charter-coherent landing. Re-attempt prerequisites are explicit
(see above) and tie SC-39 to CF-21 closure as a hard precondition.

---

## Cross-References

- Decision 025 (v2.3 SC-39 DEFER originator)
- Decision 026 (CF-21 tool_use_id correlation defer; the structural blocker)
- Decision 027 (Phase 8 strategic redirect; scaffold-now-execute-later)
- Decision 032 (effort routing; Decision 034 authored at opus/medium per D2 justification)
- Decision 033 (the narrow 6-artifact gate this Decision supersedes)
- 6 artifacts produced by 9.5 stage 1 (see artifact summary table above)
- Implementer report: `agent-workspace/memory/observations/task-9.5-20260427-sc39-artifacts.md`
- Master plan: `agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md` §3 (9.5), §6 (risk row), §11 (D2 justification)
