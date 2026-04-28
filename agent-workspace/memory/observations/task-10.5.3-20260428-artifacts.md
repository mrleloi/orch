# Task 10.5.3 — SC-39 Prerequisite Artifacts (Phase 10 Fresh Measurement)

## Status
DONE_WITH_CONCERNS

## Files Changed
- agent-workspace/memory/audits/phase-10-rule-eval.md (created)
- agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.5.json (created)
- agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.5.json (created)
- agent-workspace/memory/audits/sc39-prereq-volume-v2.5.md (created)
- agent-workspace/memory/audits/cf33-state-v2.5.md (created)
- agent-workspace/memory/sessions/2026-04-28-task-10.5.3-artifacts.md (created)
- agent-workspace/memory/observations/task-10.5.3-20260428-artifacts.md (this file)

## Tests Added
- None (measurement/doc artifacts only; no source code changes)

## Gates
- typecheck: N/A (no source code modified)
- lint: N/A (no source code modified)
- test: N/A (no source code modified)
- JSON parse validation: PASS (both JSON artifacts parse cleanly via node -e 'JSON.parse(...)')
- CF-33 grep invariant: PASS (zero importers for packages/core/src/dispatch/)
- artifact completeness: PASS (all 5 files exist and have explicit verdicts)

## Deviations from Plan
None. All 5 artifacts produced per spec. Artifact 5 written as standalone file
(cf33-state-v2.5.md) rather than appended to an existing artifact — cleaner and
consistent with v2.5 naming convention.

## Concerns (DONE_WITH_CONCERNS)

1. **C-seam fix coverage gap**: Post-10.5.2 named-agent recovery via sidecar only addresses
   the synthetic T-NA2 fixture path, not the production telemetry stream. Production
   component-telemetry.jsonl still shows unknown_agent_fraction=1.000 (200/200 agent rows
   are unknown-agent). If Decision 035 is authored on the assumption that prereq 2 is met
   by the 10.5.2 C-seam fix, that would be a factual error. Decision 035 author (opus/medium,
   separate dispatch) must read artifact 2 and understand the production-vs-test gap.

2. **Pairing rate structural mismatch persists**: DISPATCHED events now use toolu_* IDs,
   COMPLETED events use hex IDs — zero pairs matchable. 12 DISPATCHED rows is INSUFFICIENT_VOLUME
   for the 50-pair gate, but even at sufficient volume the rate would be 0.000. The CF-21
   structural seam fix remains the only path to resolving prereq 1.

3. **Volume shortfall is minor (1,969 events, 19.7% gap)**: One additional active session of
   dogfooding will likely cross 10,000. Volume is the least-blocking of the three failing gates.

## Assumptions Made
1. Phase 9 baseline for component-telemetry.jsonl is the 6,652-line figure from
   component-rollup-phase-9.md (rollup-telemetry.ts authoritative). The sc39-prereq-volume.md
   Phase 9 artifact cited 6,561 as rollup-authoritative; both are consistent (small variance
   from concurrent writes). Delta calculations use 6,652 (rollup-phase-9.md) as baseline.
2. "Phase 10 accumulated telemetry" = all events currently in component-telemetry.jsonl
   (8,031 lines, generated 2026-04-26 through 2026-04-28). No filtering by phase boundary
   was possible since JSONL lacks a phase field.
3. The dispatch.jsonl pairing analysis uses dispatch_id as the join key, per the existing
   cf21-real-dispatch-sample.json methodology.
4. Artifact 3 gate_verdict=INSUFFICIENT_VOLUME (not FAIL) because min(12,136)=12 < 50 target.
   This is the conservative reading of the spec: "if min(N,M) < 50, verdict = INSUFFICIENT_VOLUME."
   The underlying pairing_rate=0.000 would also independently produce FAIL if volume were met.
