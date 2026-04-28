# Decision 033: SC-39 Narrow Gate — 6-Artifact Prerequisite Gate for v2.4 Retry

**Date**: 2026-04-27
**Session**: Phase 8 close / Phase 9 entry (post-Phase-8-complete master-planner)
**Status**: superseded-by-034
**Backfilled at**: 10.6 (2026-04-28). Decision 033 was authored in practice as the
binding gate that Phase 9 substage 9.5 was built to satisfy, but was never
persisted as a standalone file. This backfill reconstructs the content from
consistent citations across 10+ downstream plan files, audit files, and
Decision 034 (which quotes Decision 033 §§ extensively). Content marked
"RECONSTRUCTED" below.

---

## Context

RECONSTRUCTED. Decision 025 (v2.3 SC-39 DEFER) deferred SC-39 (self-evolution
loop) to v2.3 on grounds of insufficient telemetry signal. Phase 8 closed v2.3
and generated significant dogfood telemetry from substages 8.5.x (self-application
dogfood run). Substage 8.8.1 was tasked with evaluating whether the Phase 8
telemetry was sufficient to enable SC-39 retry. That evaluation required a
formal artifact gate to prevent premature re-authorization.

Decision 033 establishes that gate: a 6-artifact prerequisite set that must all
PASS before any v2.4 ENABLE_RETRY verdict (Decision 034) may be authored.

Note on original slot: Phase 8 plan §8.8.1 originally named the output of that
substage as `decisions/032-sc39-retry-or-defer.md`. That slot was repurposed
for Decision 032 (effort routing), which became the higher-priority cross-cutting
policy. The SC-39 gating function migrated to slot 033 during Phase 9 planning.

---

## Deliberation A: Artifact 1 — Phase 8 RULE re-evaluation

RECONSTRUCTED from Decision 034 §artifact-1 + `phase-8-rule-eval.md`.

The self-evolution loop uses RULE-1..RULE-4 heuristics to detect citation-lag
signals. Before retrying SC-39, the Phase 8 telemetry must be re-evaluated
against those rules to confirm no new rule fires or threshold drift since
Phase 6.2.7 calibration.

**Threshold**: no new rules surface AND existing thresholds unchanged.
**Artifact**: `agent-workspace/memory/phase-8-rule-eval.md`.

---

## Deliberation B: Artifact 5 — CF-33 dead-code cleanup

RECONSTRUCTED from Decision 034 §artifact-5 + phase-9 plan §3 9.5 Part B.

`packages/core/src/dispatch/recorder.ts` (Approach A) is dead code relative to
the hook-based dispatch recorder (Approach B, Decision 023). CF-33 requires
deletion of this file and its test (`tests/dispatch/recorder.spec.ts`) before
SC-39 retry can proceed, to avoid confusion between two dispatch-recording
approaches.

**Pre-flight check**: grep for production import paths before deletion; if any
call site exists outside the spec, escalate. Phase 9 plan §3 9.5 Part B
confirms no production imports were found.

**Artifact**: deletion confirmed by grep (no file, no importers).

---

## Deliberation C: Artifact 3 — Real-dispatch correlation re-sample (CF-21)

RECONSTRUCTED from Decision 034 §artifact-3 + `cf21-real-dispatch-sample.json`.

The CF-21 structural gap (Decision 026) — `tool_use_id` correlation missing
between DISPATCHED and COMPLETED events — must be re-measured on Phase 8/9
dogfood data. The threshold is `pairing_rate ≥ 0.40` on a real (non-synthetic)
sample of ≥ 50 dispatch pairs.

**Artifact**: `agent-workspace/memory/audits/cf21-real-dispatch-sample.json`.

---

## Deliberation D: Artifacts 2 + 4 — Signal quality thresholds

RECONSTRUCTED from Decision 034 §artifact-2, §artifact-4 + audit files.

Two quantitative signal-quality thresholds must be met simultaneously:

- **Artifact 2** (unknown-agent bucket prevalence): `unknown_agent_fraction < 0.30`
  measured over the Phase 8/9 telemetry corpus. Threshold: < 0.30 means the
  majority of agent events carry a recognizable `component_name` field.
  Artifact: `agent-workspace/memory/audits/unknown-agent-bucket-prevalence.json`.

- **Artifact 4** (event volume): `total_events ≥ 10,000` in
  `agent-workspace/memory/component-telemetry.jsonl`. The loop needs sufficient
  signal volume for proposals to be grounded rather than noise-driven.
  Per `sc39-prereq-volume.md`: "currently 7,425 events" (at Phase 8 close;
  6,561 measured at Phase 9 evaluation). Volume threshold: ≥ 10,000.
  Artifact: `agent-workspace/memory/audits/sc39-prereq-volume.md`.

---

## Deliberation E: Terminal verdict + Artifact 6 + Structural defer authorization

RECONSTRUCTED from Decision 034 §context + multiple plan citations.

After collecting artifacts 1–5, the verdict substage (9.5 stage 2, opus/medium)
must author Decision 034 with one of three terminal verdicts:

1. **ENABLE_RETRY**: all 6 artifacts PASS; loop execution authorized.
2. **DEFER_AGAIN**: some artifacts FAIL due to insufficient telemetry accumulation,
   but no structural gaps identified; re-test at end of v2.4 after more telemetry
   accumulates.
3. **DEFER-V2.5**: one or more artifacts FAIL due to structural gaps (not temporal
   gaps) — i.e., the signal cannot improve within v2.4's scheduled substages.

**Critical constraint**: Decision 033 explicitly forbids re-litigating SC-39 by
authorizing ENABLE_RETRY against failing artifact numbers. If artifacts 2 or 3
fail (unknown_agent_fraction ≥ 0.30 OR pairing_rate < 0.40), ENABLE_RETRY is
foreclosed regardless of the other artifacts.

**Artifact 6** (loop dry-run + reviewer ACK): Before any ENABLE_RETRY verdict,
a dry-mode run of the self-evolution loop must confirm mechanical runnability
end-to-end. Artifact: `agent-workspace/memory/sc39-dry-run-output.md`.

**Structural defer pre-authorization**: Decision 033 explicitly authorizes
DEFER-V2.5 or DEFER_AGAIN as acceptable outcomes. The phrase "structurally
deferred" was inserted into Phase 9 §9 deferral candidates list precisely
because Decision 033 anticipated that pairing-rate and unknown-agent fraction
failures would not be fixable inside v2.4's scope (those gaps require CF-21
closure and named-agent self-reporting — neither scheduled for v2.4).

**CF-DOGFOOD-2 structural defer**: Decision 033 §"Deliberation E" also notes
that CF-DOGFOOD-2 (structural dogfood gap identified in 8.5.4) may be
structurally deferred under the same structural-defer pattern — no clean fix
exists within v2.4 budget without an architectural redesign of the dogfood
harness. Phase 9 plan §9 and phase-9-routing-brief §4 both cite this clause.

---

## Decision

RECONSTRUCTED. The 6-artifact gate described in Deliberations A–E is binding
for any v2.4 SC-39 retry attempt. No ENABLE_RETRY verdict may be authored
without all 6 artifacts produced AND all quantitative thresholds met.

The narrow gate supersedes the broader "≥80% match rate" from Decision 025
(v2.3 SC-39 DEFER) by adding the unknown-agent fraction threshold (artifact 2)
and the event volume gate (artifact 4) alongside the existing pairing-rate
metric.

This decision is subsequently superseded by Decision 034 (which absorbs these
prerequisites into its verdict framework) and Decision 035 (which further
supersedes Decision 034 with the v2.6 framework).

---

## Charter Reference

P1 (Think Before Coding): require evidence-based gating before reactivating
a loop that directly modifies the project's own skills. P2 (Simplicity First):
do not run the loop if its proposals would be ungrounded (100% unknown-agent;
0% paired dispatch).

---

## Consequences

1. Phase 9 substage 9.5 is built to produce all 6 artifacts against this gate.
2. Decision 034 uses this gate's artifact list verbatim as its evaluation
   framework.
3. CF-DOGFOOD-2 structural defer is pre-authorized under this decision's
   structural-defer pattern; phase-9-routing-brief §4 and phase-9-complete.md
   §4 both cite this authorization.
4. The "Deliberation E" label on this decision is cited across 10+ downstream
   files as a shorthand for the structural-defer authorization pattern.

---

## Reversibility

This decision is already superseded by Decision 034 (DEFER-V2.5) and
Decision 035 (DEFER-V2.6). Reversal is not meaningful — the gate has been
exercised twice (Phase 9 and Phase 10) with FAIL verdicts both times.

---

## Cross-References

- Decision 025 (SC-39 v2.3 DEFER originator; established the retry preconditions
  this decision formalizes)
- Decision 026 (CF-21 tool_use_id correlation; Artifact 3's structural blocker)
- Decision 032 (effort routing; opus/medium D2 justification for verdict authoring)
- Decision 034 (DEFER-V2.5 verdict; absorbs and supersedes this decision's gate)
- Decision 035 (DEFER-V2.6 verdict; further supersedes Decision 034)
- `agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md` §3 9.5, §6, §9
- `agent-workspace/memory/phase-9-routing-brief.md` §1 (9.5 entry), §4 (deferral list)
- `agent-workspace/memory/phase-9-complete.md` §2, §4
- `agent-workspace/constitution/cf-dogfood-2-assessment.md` §1.1 (cites this decision)
- `agent-workspace/memory/audits/sc39-prereq-volume.md` (cites "Decision 033 threshold")
