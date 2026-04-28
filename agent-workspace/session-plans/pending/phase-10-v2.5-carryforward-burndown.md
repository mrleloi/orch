---
title: Phase 10 Master Plan — v2.5 Carryforward Burndown + SC-39 Structural Unblock
phase: 10
version: v2.5
status: DRAFT_FOR_RATIFICATION
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, session #45)
authoring_date: 2026-04-28
prior_phase: 9 (v2.4 closed; phase-9-complete.md authored 2026-04-28; staged-but-not-committed pending harness permission cache)
authority:
  - Decision 027 §"Consequences" 8 (scaffold-now-execute-later remains binding)
  - Decision 034 BINDING (SC-39 DEFER-V2.5; 6 explicit re-attempt prerequisites)
  - PROJECT_CHARTER.md (immutable invariants; especially Principle 8 reusable-without-forking)
  - phase-9-complete.md §4 OPEN-V2.5 (11 items)
inputs_consumed:
  - agent-workspace/memory/phase-9-complete.md (§4 OPEN-V2.5 enumeration)
  - agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md (BINDING DEFER-V2.5 verdict)
  - agent-workspace/memory/phase-9-routing-brief.md §4 (pre-authorized v2.5 deferrals)
  - agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md (8-dimension framing)
  - agent-workspace/constitution/task-partition-matrix.md §7 (backlog rows; post-9.4 + 9.7)
  - agent-workspace/memory/budget-tracker.md (Phase 9 actuals: ~750K vs 790K estimate)
  - PROJECT_CHARTER.md (immutable invariants)
i6_compliance: zero git commits across all substages; v2.5 stages at 10.7 close
budget_estimate_tokens: 870000
budget_ceiling_tokens: 900000
expected_sessions: 10
expected_calendar_days: 4
parallel_opportunities: [10.1 || 10.2 || 10.3]
critical_path: 10.0 -> {10.1,10.2,10.3} -> 10.4 -> 10.5 -> 10.6 -> 10.7
---

# Phase 10 Master Plan — v2.5 Carryforward Burndown + SC-39 Structural Unblock

> Phase 10 is a **structural-unblock + closure** phase. It drains the 11
> OPEN-V2.5 items from `phase-9-complete.md §4`, attempts the SC-39 structural
> seam fix that Decision 034 made a hard prerequisite for any future SC-39
> retry, then stages v2.5. NO new feature work; new features land in v2.6+.
> I-6 ABSOLUTE preserved (Decision 020). v2.0 / v2.1 / v2.2 / v2.3 / v2.4
> staged baseline persists; v2.5 stages at 10.7 close, no commit.

---

## §1 Executive Summary — v2.5 Strategic Theme

**Theme**: *"Close the v2.4 residue and unblock SC-39 by fixing the dispatch-recorder structural seam."*

Phase 9 closed v2.4 with 11 carryforwards punted to v2.5 (`phase-9-complete.md §4`). Of these, **one structural item dominates the agenda**: SC-39 cannot be retried until CF-21 (tool_use_id correlation) is closed, named-agent self-reporting is wired into the dispatch recorder, and both metrics stabilize over a phase cycle. Decision 034 §"Re-attempt prerequisites" lists 6 items (paraphrased): CF-21 seam fix, named-agent self-reporting, phase-cycle stability, CF-25 hygiene, fresh dry-run, Decision 035+ author-ack.

The other 10 carryforwards are surgical fixes (script bugs, regex augmentation, exit-code propagation, two cosmetic dogfood findings, citation-linter dedup, missing decision backfills). They burn down cleanly in three parallel substages (10.1 / 10.2 / 10.3) plus one sequential SC-39 prereq batch (10.5).

**Is the 11-CF burndown the entire theme?** Mostly yes. Decision 027's 8-dimension framing (drift-audit / verify automation / self-application / multi-user / community / effort routing) is **structurally satisfied as of Phase 9 close** — every dimension has at least scaffold-level landing. v2.5 does NOT advance new dimensions; it cleans up residue and unblocks SC-39. Phase 11 (v2.6+) is the appropriate horizon for community-launch / multi-user-rollout / OSS-publish-pull-trigger.

**Two non-residue items earn substage allocation**:

1. **Decision-doc backfill** (decisions 032 and 033 are referenced by Decision 034 + Phase 9 routing brief but never authored). This is a charter-coherence hygiene fix — leaving phantom citations in a binding decision degrades the audit trail. Goes into 10.6 (close).
2. **SC-39 retry re-evaluation under Decision 035**. After 10.5 produces fresh artifacts, the binding question is "do the 6 prerequisites now read MET?" This is an opus/medium decision authoring task; goes into 10.5 stage 2.

**Ratification budget**: 870K mid-estimate; 900K ceiling; 10 sessions; 4 calendar days. Critical path: 10.0 → {10.1∥10.2∥10.3} → 10.4 → 10.5 → 10.6 → 10.7.

---

## §2 Substage Decomposition

### 10.0 — Phase 10 routing brief

- **substage_id**: 10.0
- **scope_summary**: Read this master plan, partition the 11 carryforwards by family (script-fix / cosmetic / SC-39-prereq / decision-backfill / structural-seam), ratify per-substage routing using the phase-9-routing-brief.md schema, run effort-routing skill consultations against each substage, list v2.6 deferral candidates explicitly.
- **primary_carryforwards**: [routing meta-task; no direct CF closure]
- **input_files** (read): [`agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md` (this file), `agent-workspace/memory/phase-9-complete.md`, `agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md`, `agent-workspace/memory/phase-9-routing-brief.md`, `agent-workspace/memory/budget-tracker.md` (Phase 9 actuals)]
- **output_files** (write): [`agent-workspace/memory/phase-10-routing-brief.md`]
- **recommended_dispatch_count**: 1 (task-implementer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: routing-doc authoring; mechanical synthesis over phase-9-complete §4 + this master plan; no judgment-density justifying opus; pattern matches 9.0 substage (planned 60K, actual ~30-50K per Phase 9 actuals).
- **reviewer_pairs**: none — routing brief is doc-only; sandwich-architect ratification optional and budget-permitting (skip by default).
- **blockers**: none — first substage.
- **parallel_safe_with**: [] — gates all downstream substages.
- **estimated_budget_K**: 60
- **acceptance_gate**: `phase-10-routing-brief.md` exists; ≥5 substage families enumerated with the §1-§7 schema from `phase-9-routing-brief.md`; budget sums verified ≤900K; ≥1 v2.6 deferral candidate named; effort-routing consultations logged.

---

### 10.1 — Script-bug fix batch (parallel-safe with 10.2 / 10.3)

- **substage_id**: 10.1
- **scope_summary**: Fix three small script-level bugs surfaced by Phase 9 verification: (a) substage-parallelism-flag.sh G.7 multi-line parse bug (parse loop reads line-by-line; SUBSTAGE_A and PARALLEL_LIST never on same line; PAIRS_CHECKED=0 → no-op exit 0); (b) charter-coherence-spot-check.sh false-positive on Red-Flags `→ NO, ...` denial blocks (regex must skip lines containing `→ NO` / `→ NEVER` markers); (c) post-phase.sh wrapper exit-code propagation (currently prints "RED — phase advance BLOCKED" but returns shell exit 0; CI integrators misinterpret as PASS).
- **primary_carryforwards**: [CF-V2.5-9.7-PARALLELISM-FLAG, CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE, CF-V2.5-9.x-POSTPHASE-EXIT-CODE]
- **input_files** (read): [`scripts/audit/substage-parallelism-flag.sh`, `scripts/audit/charter-coherence-spot-check.sh`, `scripts/verify/post-phase.sh`, `agent-workspace/memory/phase-9-routing-brief.md` (sample routing brief format for parallelism-flag fixture)]
- **output_files** (write): [`scripts/audit/substage-parallelism-flag.sh`, `scripts/audit/charter-coherence-spot-check.sh`, `scripts/verify/post-phase.sh`]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: 3 small script edits; substage-parallelism rewrite is the largest (multi-line state machine or awk block-parser, ~40 LOC delta); charter-coherence is a regex augmentation (~5 LOC); post-phase exit-code is an accumulator pattern (~10 LOC). Pattern matches Phase 9 9.4 (sonnet/medium, planned 100K, actual ~100K). No D2 needed.
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 10.0 (routing brief).
- **parallel_safe_with**: [10.2, 10.3] — disjoint file-edit set.
- **estimated_budget_K**: 90
- **acceptance_gate**: substage-parallelism-flag.sh detects a planted G.7 collision in synthetic routing-brief fixture (PAIRS_CHECKED ≥ 1; exit 1 on collision); charter-coherence-spot-check.sh does NOT flag Red-Flags `→ NO` denial lines (verified via planted negative case); post-phase.sh exits non-zero when any sub-check fails (synthetic forced-fail test); pnpm typecheck && pnpm lint exit 0.

---

### 10.2 — Cosmetic dogfood findings + citation-linter dedup

- **substage_id**: 10.2
- **scope_summary**: Close (or formally re-defer) two minor cosmetic adversarial findings from 8.5.4 (CF-DOGFOOD-5 and CF-DOGFOOD-7) — recover their concrete descriptions from `agent-workspace/memory/sessions/2026-04-27-task-8.5.4-*.md` (per phase-9-routing-brief §7 open question 2), produce a 1-page disposition note that either lands the cosmetic fixes inline (≤20 LOC each) OR documents a v2.6 re-defer with explicit rationale; AND deliver the CF-25 citation-linter `BUILTIN_HOOK_EVENTS` dedup (add WebFetch + TaskList to the built-in list so rollup-mode linter no longer fails spuriously on those tool names — gates SC-39 prereq #4).
- **primary_carryforwards**: [CF-25, CF-DOGFOOD-5, CF-DOGFOOD-7]
- **input_files** (read): [`scripts/utilities/citation-linter.ts`, `agent-workspace/memory/sessions/2026-04-27-task-8.5.4-*.md` (recover CF-DOGFOOD-5/7 descriptions), `agent-workspace/memory/phase-8-complete.md §4` (carryforward register original entries)]
- **output_files** (write): [`scripts/utilities/citation-linter.ts`, `agent-workspace/memory/observations/task-10.2-dogfood-cosmetic-disposition.md`, OPTIONAL inline cosmetic fix targets if dogfood-5/7 turn out to require <20 LOC]
- **recommended_dispatch_count**: 2 (sandwich-architect minimal signature + task-implementer + code-quality-reviewer); the architect dispatch is CF-25-specific because the dedup logic was a deferred-design item from 8.4.6 per phase-9 master plan §3 9.6.
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: small sandwich (~80K total per Phase 9 9.6 CF-25 estimate); cosmetic dogfood disposition is doc-only or ≤20-LOC fixes; pattern matches Phase 9 9.6 sub-task. No D2 needed (the architectural choice — dedup-via-set vs dedup-via-config — is bounded by existing citation-linter shape).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 10.0.
- **parallel_safe_with**: [10.1, 10.3] — disjoint file-edit set.
- **estimated_budget_K**: 80
- **acceptance_gate**: citation-linter rollup-mode PASSES on a fixture containing WebFetch + TaskList citations (exit 0); CF-DOGFOOD-5 and CF-DOGFOOD-7 each have an explicit disposition note (CLOSED-INLINE or DEFER-V2.6 with rationale); pnpm test exit 0; no test-count regression.

---

### 10.3 — CF-DOGFOOD-2 architectural assessment (deferred-design)

- **substage_id**: 10.3
- **scope_summary**: CF-DOGFOOD-2 is flagged in Decision 033 §"Deliberation E" as a *structural* dogfood gap with no clean fix within v2.4 budget. Phase 10 produces an architectural assessment — does it need a real fix in v2.5, can it be cleanly deferred to v2.6, or is it a "won't-fix because charter-coherent as-is" item? This substage authors a sandwich-architect spec that decomposes the gap, surveys the cost of each option, and either lands the fix (if ≤150 LOC and ≤80K) OR formally defers via a v2.6 carryforward + decision-doc.
- **primary_carryforwards**: [CF-DOGFOOD-2]
- **input_files** (read): [`agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md` (the §"Deliberation E" reference is in the chain decision 033 → 034), `agent-workspace/memory/sessions/2026-04-27-task-8.5.4-*.md` (original CF-DOGFOOD-2 description), `scripts/dogfood/run-self-task.ts` (the dogfood harness that exhibited the gap)]
- **output_files** (write): [`agent-workspace/session-plans/pending/cf-dogfood-2-architectural-assessment.md` (architect spec, 200-400 LOC), OPTIONAL `agent-workspace/memory/decisions/03X-cf-dogfood-2-disposition.md` if defer-decision authored]
- **recommended_dispatch_count**: 2 (sandwich-architect for assessment + task-implementer if fix path chosen)
- **recommended_(model, effort)**: (opus, medium) for sandwich-architect assessment; (sonnet, medium) for task-implementer if fix path chosen.
  - **rationale**: architectural-judgment task with structural-gap framing; opus/medium needed for tradeoff analysis matching the Decision 033 deliberation-class. NOT max because the alternatives are pre-defined (FIX_INLINE / DEFER_V2.6 / WONT_FIX) and the gap is bounded by the existing dogfood harness shape. Pattern matches Phase 9 9.5 Decision 034 authoring (opus/medium, ~130K actual).
  - **D2 justification** (per Decision 032 effort routing): "structural dogfood-gap assessment binds future v2.6+ self-application work; cross-references SC-44 (dogfood entrypoint) and Decision 027 §"Consequences" 6 (self-application baseline). NOT max because alternatives are pre-defined (FIX_INLINE / DEFER_V2.6 / WONT_FIX)."
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}] — only if fix path is chosen.
- **blockers**: depends on 10.0.
- **parallel_safe_with**: [10.1, 10.2] — assessment is read-mostly + new spec file; no edit collision with 10.1 / 10.2 file sets.
- **estimated_budget_K**: 100 (60K for assessment alone; +40K if fix path chosen)
- **acceptance_gate**: `cf-dogfood-2-architectural-assessment.md` exists with ≥3 options surveyed (FIX_INLINE / DEFER_V2.6 / WONT_FIX equivalent); explicit disposition recorded (one of the three); IF fix chosen: code lands + tests PASS; IF defer chosen: decision-doc authored citing v2.6 trigger conditions.

---

### 10.4 — Verify gate after parallel batch close

- **substage_id**: 10.4
- **scope_summary**: After 10.1 ∥ 10.2 ∥ 10.3 close, run a mid-phase verify checkpoint: post-phase.sh dry-run on Phase 10 (with the now-fixed exit-code propagation from 10.1), oss-readiness.sh re-run, full pnpm test, drift-check.sh + invariant grep sweep. Confirms the 3-substage parallel batch did not introduce regressions before SC-39 prereq work begins in 10.5.
- **primary_carryforwards**: [verify checkpoint; no direct CF closure]
- **input_files** (read): [`scripts/verify/post-phase.sh`, `scripts/audit/oss-readiness.sh`, `scripts/verify/drift-check.sh`]
- **output_files** (write): [`agent-workspace/memory/audits/phase-10-mid-verify.md`]
- **recommended_dispatch_count**: 1 (task-implementer; or skip dispatch if main session can run gates inline)
- **recommended_(model, effort)**: (sonnet, low) — gate runner only; no synthesis judgment.
  - **rationale**: deterministic-only work — bash exit codes and test counts. No code edits expected. If a gate fails, surface the failure and route to a 10.x-fix sub-task.
- **reviewer_pairs**: none.
- **blockers**: depends on 10.1 + 10.2 + 10.3 all CLOSED.
- **parallel_safe_with**: [] — strictly mid-phase serial gate.
- **estimated_budget_K**: 30
- **acceptance_gate**: all gates exit 0; mid-verify.md records test counts + drift-check status; if any gate RED, surface as new CF and add to 10.4-fix sub-task before unblocking 10.5.

---

### 10.5 — SC-39 structural unblock (CF-21 seam fix + named-agent self-reporting + retry verdict)

This is the **load-bearing substage of v2.5**. It implements 4 of the 6 Decision 034 re-attempt prerequisites. Two are pre-existing (CF-25 closes in 10.2; phase-cycle-stability is automatically advanced by virtue of Phase 10 itself producing telemetry over a full cycle).

#### Stage 1 (10.5.1) — Architectural design

- **scope_summary**: sandwich-architect designs (a) the CF-21 dispatch-recorder seam fix per Decision 026 fix-list — DISPATCHED + COMPLETED events must share a single tool_use_id space such that direct matching yields pairing_rate ≥ 0.40 on ≥50 real pairs; (b) named-agent self-reporting — spawned agents must self-report a canonical `component_name` through the telemetry seam such that `unknown_agent_fraction` drops below 0.30. Spec must include Part-C deterministic gates pre-verified.
- **input_files** (read): [`agent-workspace/memory/decisions/026-cf21-tool-use-id-correlation-defer.md`, `agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md`, `packages/core/src/dispatch/` (any current recorder code), `scripts/hooks/dispatch-jsonl-recorder.sh`, `scripts/hooks/component-telemetry.sh`]
- **output_files** (write): [`agent-workspace/session-plans/pending/10.5-sc39-structural-unblock-architect.md`]
- **recommended_dispatch_count**: 1 (sandwich-architect)
- **recommended_(model, effort)**: (opus, medium)
  - **rationale**: structural seam design; touches multiple modules (dispatch recorder + hook seam + spawn envelope); judgment-density high. Pattern matches Phase 9 9.6 SC-28 design (opus/medium, ~110K actual for the substage including IMPL).
  - **D2 justification**: "CF-21 + named-agent seam binds future SC-39 retries; cross-references Decision 026 fix-list; affects telemetry consumers (rollup-telemetry, citation-linter, 6-artifact gate); NOT max because the structural shape is constrained by the existing OTEL emit pattern (component-telemetry.sh) and Decision 026 already pre-bounded the fix space."
- **estimated_budget_K**: 80

#### Stage 2 (10.5.2) — IMPL (parallel-safe sub-tasks)

- **scope_summary**: Implement the architect spec from 10.5.1. Likely 2-3 parallel-safe sub-tasks: (a) CF-21 tool_use_id field emit in dispatch recorder + hook seam; (b) named-agent self-reporting wired into spawn envelope; (c) test fixtures + integration tests covering both seams.
- **input_files** (read): architect spec from 10.5.1.
- **output_files** (write): packages/core/src/dispatch/* + scripts/hooks/* + tests/dispatch/* + tests/hooks/*
- **recommended_dispatch_count**: 3 (task-implementer ×2-3 parallel; spec-compliance-reviewer; code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium) for each task-implementer + reviewers.
  - **rationale**: per-task IMPL ≤100 LOC each; spec is signed off by 10.5.1 architect; pattern matches Phase 9 9.1 (sonnet/medium, planned 90K, actual ~90K with fix cycle).
- **reviewer_pairs**: [{post: spec-compliance, sonnet/medium}, {post: code-quality, sonnet/medium}]
- **estimated_budget_K**: 120

#### Stage 3 (10.5.3) — Fresh artifacts + Decision 035 author-ack

- **scope_summary**: Produce fresh artifacts equivalent to Decision 034 §"Artifact Summary Table" (1-6) against the post-10.5.2 dispatch recorder seam: (1) Phase 9 RULE re-eval against new telemetry; (2) unknown-agent bucket prevalence audit (target <0.30); (3) real-dispatch correlation re-sample (target ≥0.40 direct pairing rate on ≥50 real pairs); (4) event volume target (≥10,000 events; Phase 10 dogfooding plus the new seam should naturally cross threshold); (5) verify CF-33 dead-code state unchanged (still absent post-10.5.2); (6) fresh loop dry-run + reviewer ACK. Then author Decision 035 with binding verdict ENABLE_RETRY (if all 6 prerequisites MET) OR DEFER-V2.6 (if any prerequisite still FAIL).
- **input_files** (read): post-10.5.2 telemetry; Decision 034 §"Re-attempt prerequisites".
- **output_files** (write): [`agent-workspace/memory/audits/phase-10-rule-eval.md` (new), `agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.5.json` (new), `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.5.json` (new), `agent-workspace/memory/audits/sc39-prereq-volume-v2.5.md` (new), `agent-workspace/memory/sc39-dry-run-output-v2.5.md` (new), `agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md` (new)]
- **recommended_dispatch_count**: 2 (task-implementer for artifacts 1-5 + opus/medium for Decision 035 authoring + sandwich-verifier)
- **recommended_(model, effort)**: (sonnet, medium) for artifacts 1-5; (opus, medium) for Decision 035 authoring.
  - **rationale**: mirrors Phase 9 9.5 (planned 130K, actual ~130K). Decision 035 is the binding verdict per Decision 034 prerequisite #6.
  - **D2 justification (Decision 035 only)**: "supersedes Decision 034 DEFER-V2.5; verdict binds future SC-39 attempts; explicit author-ack of all 5 prior prerequisites (CF-21, named-agent, phase-cycle, CF-25, dry-run) as MET (or partial-MET with explicit reasoning). NOT max because alternatives are pre-defined (ENABLE_RETRY / DEFER-V2.6)."
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **estimated_budget_K**: 130

**Stage totals for 10.5**: 80 + 120 + 130 = 330K — the largest substage; pre-allocated checkpointing across stages because 330K is above any single-session wind-down budget. Stages 10.5.1, 10.5.2, 10.5.3 are explicitly serialized; checkpoint between each.

- **blockers**: depends on 10.4 (mid-verify must be GREEN before structural seam work begins).
- **parallel_safe_with**: [] — strictly serialized; structural seam work cannot run alongside any other substage that touches dispatch / hooks / telemetry.
- **acceptance_gate**: 10.5.1 architect spec exists + ratified; 10.5.2 IMPL lands with all gates PASS + ≥4 new test cases pinning the seam; 10.5.3 produces 6 fresh artifacts + Decision 035 with binding verdict; if verdict = ENABLE_RETRY, all 5 quantitative prerequisites cited as MET; if DEFER-V2.6, explicit residual prerequisite identified.

---

### 10.6 — Decision-doc backfill + F-2 self-evolution gating

- **substage_id**: 10.6
- **scope_summary**: Backfill phantom decision references: Decisions 032 and 033 are referenced by Decision 034 + Phase 9 routing brief but never actually authored as files in `agent-workspace/memory/decisions/`. Audit the Phase 8/9 transcripts and either (a) authorize backfill of the original content as historically-elided documents OR (b) document them as "elided-by-design" in `decisions/README.md` with rationale. Plus: gate F-2 self-evolution signal-extension on the SC-39 verdict from 10.5.3 — if 10.5.3 = ENABLE_RETRY, scaffold F-2 (rollup-telemetry.ts schema extension); if 10.5.3 = DEFER-V2.6, defer F-2 to the same horizon.
- **primary_carryforwards**: [decision-doc-backfill (032 + 033), F-2 self-evolution signal-extension]
- **input_files** (read): [`agent-workspace/memory/decisions/README.md`, `agent-workspace/memory/phase-9-routing-brief.md` (cites 032 + 033), `agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md` (cites 032 + 033), `agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md` (10.5.3 output — gates F-2)]
- **output_files** (write): [
    OPTIONAL `agent-workspace/memory/decisions/032-effort-routing.md` (backfill IF chosen),
    OPTIONAL `agent-workspace/memory/decisions/033-sc39-narrow-gate-supersession.md` (backfill IF chosen),
    `agent-workspace/memory/decisions/README.md` (index update),
    OPTIONAL `agent-workspace/session-plans/pending/f2-signal-extension-spec.md` (if F-2 enabled by 10.5.3 verdict)
  ]
- **recommended_dispatch_count**: 1 (task-implementer; opus/medium IF backfill is non-trivial reconstruction)
- **recommended_(model, effort)**: (sonnet, medium) by default; escalate to (opus, medium) only if backfill reconstruction requires significant judgment over Phase 8/9 transcripts.
  - **rationale**: doc-edit work; small footprint; pattern matches Phase 9 9.0 routing-brief (sonnet/medium, ~30-50K actual).
- **reviewer_pairs**: none.
- **blockers**: depends on 10.5.3 (Decision 035 must exist before F-2 gating can fire).
- **parallel_safe_with**: [] — runs after 10.5.
- **estimated_budget_K**: 60
- **acceptance_gate**: decisions/README.md no longer contains phantom citations OR explicit "elided-by-design" entries for 032 + 033 with rationale; F-2 disposition recorded (scaffolded OR DEFER-V2.6 attestation).

---

### 10.7 — Phase-close: post-phase verify + v2.5 staging

- **substage_id**: 10.7
- **scope_summary**: Mirror 9.8 closure pattern. Run post-phase.sh 10 (with the now-fixed exit-code propagation from 10.1 + the augmented charter-coherence-spot-check from 10.1); produce phase-10-complete.md attestation; stage v2.5 (no commit per I-6 ABSOLUTE).
- **primary_carryforwards**: [closure attestation]
- **input_files** (read): [`scripts/verify/post-phase.sh`, `scripts/audit/oss-readiness.sh`, `agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md` (if authored), `agent-workspace/memory/phase-9-complete.md` (template)]
- **output_files** (write): [`agent-workspace/memory/phase-10-complete.md`]
- **recommended_dispatch_count**: 2 (task-implementer + sandwich-verifier for full-phase adversarial)
- **recommended_(model, effort)**: (sonnet, high) for attestation authoring; (opus, medium) for sandwich-verifier.
  - **rationale**: post-phase verify + attestation; mirrors Phase 9 9.8 (sonnet/high, planned 80K, actual ~20K — but high effort needed for thoroughness of the rollup section).
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 10.1, 10.2, 10.3, 10.5, 10.6 (all substages CLOSED).
- **parallel_safe_with**: [] — strictly final gate.
- **estimated_budget_K**: 80
- **acceptance_gate**: post-phase.sh 10 exit 0; oss-readiness.sh exit 0; phase-10-complete.md exists; `git log --oneline | wc -l` = 1; v2.5 fully staged-but-uncommitted; sandwich-verifier verdict = APPROVED OR APPROVED_AFTER_FIX (if AFTER_FIX, narrow fix cycle ≤40K before phase advance to v2.6).

---

## §3 Critical Path + Parallelism Feasibility Matrix

```
10.0 (sonnet/medium, blocking, 60K)
   │
   ├──────────────────┬──────────────────┐
   │                  │                  │
 10.1 (sonnet/med)  10.2 (sonnet/med)  10.3 (opus/medium)
 [3 script bugs]    [cosmetic + CF-25]  [CF-DOGFOOD-2 arch]
 90K               80K                 100K
   │                  │                  │
   └─────── 10.4 mid-verify (sonnet/low, 30K) ────┘
                          │
                       10.5 SC-39 structural unblock
                       (10.5.1 opus/medium 80K)
                       (10.5.2 sonnet/medium 120K)
                       (10.5.3 sonnet+opus 130K)
                          │
                       10.6 (sonnet/medium, 60K)
                       [decision backfill + F-2 gate]
                          │
                       10.7 (sonnet/high + opus/medium, 80K)
                       [phase close + v2.5 staging]
```

**Critical path length** (sequential time, ignoring parallelism): 60 + max(90,80,100) + 30 + 330 + 60 + 80 = **660K critical-path tokens**.

**With parallelism savings** (10.1 ∥ 10.2 ∥ 10.3 saves ~170K of wall-time vs sequential): total wall-clock is ~660K (the critical path is unchanged because 10.4 gates on the slowest of the three parallel substages = 10.3 at 100K).

**Total token spend** (sum of all substages): 60+90+80+100+30+330+60+80 = **830K**. With reviewer overhead (~5% per substage) and routing brief, **mid-estimate = 870K** (within the 900K ceiling).

### File-edit collision matrix (for 10.1 ∥ 10.2 ∥ 10.3 parallel safety)

| File | 10.1 | 10.2 | 10.3 |
|---|---|---|---|
| scripts/audit/substage-parallelism-flag.sh | WRITE | — | — |
| scripts/audit/charter-coherence-spot-check.sh | WRITE | — | — |
| scripts/verify/post-phase.sh | WRITE | — | — |
| scripts/utilities/citation-linter.ts | — | WRITE | — |
| agent-workspace/memory/observations/task-10.2-*.md | — | WRITE | — |
| agent-workspace/session-plans/pending/cf-dogfood-2-architectural-assessment.md | — | — | WRITE |
| (agent-workspace/memory/decisions/03X-cf-dogfood-2-disposition.md) | — | — | OPTIONAL_WRITE |

**Result: ZERO file-edit collisions across 10.1 ∥ 10.2 ∥ 10.3**. Decision 032 D4 concurrency cap respected: 2 sonnet/medium + 1 opus/medium = 3 concurrent; 0 opus/max in flight; 1 opus/* in flight (within ≤2 cap). Safe to dispatch in parallel after 10.0 closes.

**Forbidden parallelism**: 10.5 substages (10.5.1 → 10.5.2 → 10.5.3) MUST be serialized. The dispatch recorder seam touches multiple files in a single edit; running 10.5.2 in parallel with itself or with another substage that touches dispatch/hooks/telemetry creates merge-collision risk and breaks the deterministic test gate that 10.5.3 depends on (artifacts 1-6 must be measured against a stable post-IMPL telemetry baseline).

---

## §4 v2.6 Deferral Candidates (pre-authorized)

Per Decision 027 §"Consequences" 8 (scaffold-now-execute-later) and Phase 9 routing brief §4 pattern, these v2.5 items may defer to v2.6 without re-asking:

1. **decision-doc-lag.sh** (low-priority planned-8.4.7 utility script). Phase 9 routing brief §4 already pre-authorized this for v2.5; if 10.6 budget is tight, push to v2.6. Justification: speculative utility; no production gate depends on it.

2. **CF-DOGFOOD-2** if 10.3 architectural assessment selects DEFER_V2.6 disposition. Pre-authorized by Decision 033 §"Deliberation E" structural-defer pattern.

3. **F-2 self-evolution signal-extension** if 10.5.3 verdict = DEFER-V2.6. Mechanically gated by SC-39 enablement.

4. **CF-DOGFOOD-5 / CF-DOGFOOD-7** if 10.2 disposition note records DEFER_V2.6 (cosmetic findings whose original 8.5.4 description can no longer be recovered from session logs). Justification: cosmetic-only, no charter clause violated.

5. **Mid-phase 10.5.2 IMPL split** to v2.6 if Stage 1 (10.5.1) architect surfaces a structural design change too large to land within 120K Stage 2 budget. In that case, Stage 1 produces the design, v2.5 stages the design only, IMPL deferral is recorded in 10.7 attestation, and Decision 035 verdict = DEFER-V2.6 (no IMPL → no fresh artifacts → cannot ENABLE).

6. **Community OSS launch trigger** (NPM publish, GitHub repo public-flip, README community section). Phase 11 / v2.6 work; explicitly out-of-scope for v2.5.

7. **Multi-user adoption rollout**. Phase 11 / v2.6 work; out-of-scope.

---

## §5 Carryforward Coverage Assertion

Every OPEN-V2.5 item from `phase-9-complete.md §4` is mapped:

| CF-ID | Target Substage | Notes |
|---|---|---|
| CF-25 | 10.2 | citation-linter BUILTIN_HOOK_EVENTS dedup (WebFetch + TaskList) |
| CF-DOGFOOD-2 | 10.3 | architectural assessment; FIX_INLINE / DEFER_V2.6 / WONT_FIX |
| CF-DOGFOOD-5 | 10.2 | cosmetic disposition note; CLOSED-INLINE or DEFER-V2.6 |
| CF-DOGFOOD-7 | 10.2 | cosmetic disposition note; CLOSED-INLINE or DEFER-V2.6 |
| CF-V2.5-9.7-PARALLELISM-FLAG | 10.1 | substage-parallelism-flag.sh multi-line parse fix |
| CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE | 10.1 | regex augmentation to skip Red-Flags `→ NO` lines |
| CF-V2.5-9.x-POSTPHASE-EXIT-CODE | 10.1 | exit-code propagation in post-phase.sh wrapper |
| SC-39 (Decision 034 DEFER-V2.5) | 10.5 | structural unblock (CF-21 + named-agent) + Decision 035 verdict |
| F-2 self-evolution signal-extension | 10.6 | gated on 10.5.3 verdict; defer-V2.6 if SC-39 stays deferred |
| decision-doc-lag.sh | §4 deferral | pre-authorized v2.6 deferral |
| Decisions 032 + 033 phantom citations | 10.6 | backfill OR document as elided-by-design |

**Coverage**: 11/11 OPEN-V2.5 items mapped. 9 to active substages; 1 to v2.6 deferral (decision-doc-lag.sh); 1 split (decision-doc backfill is a single substage covering both 032 + 033). Zero items unaccounted-for.

---

## §6 Total Estimated Budget

| Substage | Stage | Model | Effort | Estimated K |
|---|---|---|---|---|
| 10.0 | routing brief | sonnet | medium | 60 |
| 10.1 | 3 script-bug fixes | sonnet | medium | 90 |
| 10.2 | cosmetic + CF-25 dedup | sonnet | medium | 80 |
| 10.3 | CF-DOGFOOD-2 architectural assessment | opus | medium | 100 |
| 10.4 | mid-verify gate | sonnet | low | 30 |
| 10.5.1 | SC-39 architect | opus | medium | 80 |
| 10.5.2 | SC-39 IMPL | sonnet | medium | 120 |
| 10.5.3 | SC-39 fresh artifacts + Decision 035 | sonnet + opus | medium | 130 |
| 10.6 | decision-doc backfill + F-2 gate | sonnet | medium | 60 |
| 10.7 | phase close + v2.5 staging | sonnet/high + opus/medium | high | 80 |
| reviewer overhead (~5% × 7 substage groups) | — | sonnet | medium | 40 |
| **Total mid-estimate** | | | | **870** |
| **Ceiling** | | | | **900** |

**Sum**: 870K ≤ 900K ceiling. Within plan per session-budgets.md ceiling rule. Phase 9 actuals (~750K vs 790K planned) confirm calibration is reasonable; v2.5 is slightly larger because 10.5 (SC-39 structural unblock) is a 330K substage that exceeds any single Phase 9 substage envelope.

**Wind-down semantics**: per session-budgets.md, 200K real-transcript tokens triggers wind-down. 10.5 stages MUST checkpoint between each (10.5.1 → checkpoint → 10.5.2 → checkpoint → 10.5.3) to avoid hitting wind-down mid-stage.

---

## §7 Open Questions / Risks

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 10.5.2 IMPL surfaces a deeper architectural issue not anticipated by 10.5.1 (e.g., spawn envelope can't carry component_name without harness changes) | MED | HIGH | Halt 10.5.2; route to systematic-debugger (4-phase + 4.5); if root cause = harness-level, file CF-V2.6-NEW and defer-V2.6 the named-agent leg of SC-39 prerequisites; Decision 035 verdict = DEFER-V2.6 with partial-MET attestation. |
| R2 | 10.5.3 fresh artifacts STILL show pairing_rate < 0.40 OR unknown_agent_fraction ≥ 0.30 even after 10.5.2 IMPL lands (i.e., the seam fix doesn't move the metrics) | MED-HIGH | MED | Decision 035 = DEFER-V2.6 with explicit "seam fix landed but metrics did not move; deeper structural issue identified". This is a charter-coherent outcome (Decision 034 §"Deliberation" pattern). |
| R3 | 10.3 sandwich-architect cannot recover concrete CF-DOGFOOD-2 description from session logs | MED | LOW | Document the gap in 10.3 disposition note; default to DEFER-V2.6 with rationale "original description unrecoverable from 2026-04-27 session logs". |
| R4 | 10.1 charter-coherence regex augmentation introduces a new false-negative (i.e., a real Drift-C goes undetected because the `→ NO` skip is too aggressive) | LOW-MED | MED | 10.1 acceptance gate requires both a planted negative case (Red-Flags denial line — must not flag) AND a planted positive case (real scope-creep — must flag). Both gates must PASS. |
| R5 | Wind-down hits mid-10.5 (the 330K substage spans multiple sessions naturally) | HIGH | LOW | EXPLICITLY PLAN FOR THIS. Checkpoint cleanly between 10.5.1, 10.5.2, 10.5.3. Each stage is independently resumable from the next session via SessionStart hook + checkpoints/latest.md. The plan is structured so each stage is its own dispatch unit. |
| R6 | Phase 9 still uncommitted at v2.5 phase-close time → v2.5 also uncommitted → stack of 6 staged-but-uncommitted phases | MED | LOW | This is the design (I-6 ABSOLUTE). Operator commits when ready. Document staged-but-uncommitted state in 10.7 phase-close attestation. |
| R7 | Effort-routing skill cold-start has cleared post-Phase-9, but new substage shapes (10.3 architectural assessment, 10.5 structural unblock) may not match any historical row | MED | LOW | Default to master-plan routing recommendation when skill returns cold-start; document deviation. Pattern proven to work in Phase 9. |
| R8 | Decisions 032 + 033 backfill (10.6) cannot reconstruct original content without speculation | LOW-MED | LOW | Default to "document as elided-by-design with rationale" rather than fabricate content. Charter-coherent path per autonomous-protocol Decision Rule 7 (Document-and-Move). |
| R9 | 10.5.3 author of Decision 035 must self-attest all 5 prior prerequisites — risk of confirmation bias | LOW | MED | Use opus/medium with sandwich-verifier follow-up to adversarially probe each prerequisite citation (mirrors Phase 9 9.5 sandwich-verifier pattern). |
| R10 | Phase 10 budget (870K) exceeds Phase 9 actual (~750K) by ~16% | LOW | LOW | Within ceiling (900K). Margin is justified by 10.5's structural-unblock scope being larger than any Phase 9 substage. If 10.5 over-runs, defer 10.5.3 (or its IMPL leg) to v2.6 per §4 Risk 5 mitigation. |

### Open questions surfaced (require 10.0 routing brief to resolve)

- **Q1**: 10.3 budget (100K) assumes the architectural assessment lands without IMPL. If FIX_INLINE is chosen and IMPL is non-trivial, 10.3 may stretch to 150K. Acceptable upper bound? **Default decision**: 130K hard ceiling on 10.3; if FIX_INLINE requires more, defer to v2.6.
- **Q2**: 10.5.1 architect dispatch model — opus/medium or opus/high? **Default decision**: opus/medium per D2 justification (alternatives bounded). Re-evaluate at 10.0 routing brief if effort-routing skill returns cold-start with alert.
- **Q3**: Should the routing brief substage 10.0 itself be skipped (work absorbed into this master plan)? **Default decision**: NO, keep as separate substage. The routing brief carries effort-routing skill consultation logs and per-substage dispatch envelopes that should not pollute the master plan. Pattern matches Phase 9 9.0 substage; honored here.

---

## §8 Decisions to Author During Phase 10

| Decision # | Title | Substage | Status target |
|---|---|---|---|
| 035 | SC-39 Retry Verdict v2.5 — ENABLE_RETRY OR DEFER-V2.6 | 10.5.3 | BINDING |
| 036 (OPTIONAL) | CF-DOGFOOD-2 Disposition (FIX_INLINE / DEFER_V2.6 / WONT_FIX) | 10.3 | BINDING (only if disposition deviates from default) |
| 037 (OPTIONAL) | F-2 self-evolution signal-extension scaffolding (if 10.5.3 = ENABLE_RETRY) | 10.6 | active |
| 038 (OPTIONAL) | Decisions 032 + 033 backfill OR elision rationale | 10.6 | active |

The OPTIONAL decisions fire only if the disposition deviates from the master-plan default. Under default flow, only Decision 035 is mandatory. This pattern matches Phase 9 (only Decision 034 was mandatory; all others were optional).

**Strategic theme decision (NOT authored — encoded in this master plan)**: v2.5 is a closure phase with one structural unblock; no Decision-027-style strategic redirect is needed. If mid-Phase-10 the operator surfaces a new strategic dimension (e.g., OSS launch trigger), a new Decision 03X-strategic-redirect would supersede this master plan, mirroring the Phase 8 redirect pattern (Decision 027).

---

## §9 Authoring Discipline + Charter Cross-References

- **Charter Principle 1 (Daemon dumb, workers smart)**: 10.5 structural unblock is *deterministic seam* code (dispatch recorder), not LLM logic. Aligns.
- **Charter Principle 2 (Tight scope)**: Phase 10 explicitly REJECTS new feature work; only closes v2.4 residue + structural unblock. Aligns.
- **Charter Principle 3 (Project-agnostic core)**: 10.5 IMPL must not introduce hardcoded paths; component_name must be config-driven. Architect spec to bind this in 10.5.1.
- **Charter Principle 6 (Adapter abstraction)**: 10.5 named-agent self-reporting must flow through `IAgentRuntime` seam, not introduce a new direct-call path. 10.5.1 architect to verify.
- **Karpathy P1 (Think Before Coding)**: 10.3 architectural assessment + 10.5.1 architect spec are P1-binding pre-IMPL discipline.
- **Karpathy P2 (Simplicity First)**: prefer regex augmentation (10.1 charter-coherence) over a multi-pass parser; prefer accumulator pattern (10.1 post-phase exit-code) over re-architecting the wrapper.
- **Karpathy P3 (Surgical Changes)**: 10.1 + 10.2 are explicitly surgical (≤20 LOC per fix); 10.5.2 IMPL is bounded by 10.5.1 architect spec.
- **Karpathy P4 (Goal-Driven Execution)**: every substage has deterministic boolean acceptance gate.

**I-6 ABSOLUTE**: zero git commits across all substages. v2.5 stages at 10.7 close, no commit. Decision 020 binding throughout.

---

## §10 Final YAML Completion Block

```yaml
phase: 10
version: v2.5
status: DRAFT_FOR_RATIFICATION
substages: [10.0, 10.1, 10.2, 10.3, 10.4, 10.5.1, 10.5.2, 10.5.3, 10.6, 10.7]
sc_numbering_introduced: [SC-53_carryforward_closure_rate, SC-54_sc39_structural_unblock_evidence, SC-55_decision_doc_backfill]
total_budget_estimate_K: 870
budget_ceiling_K: 900
i6_commits: 0
v2_5_release: STAGE_AT_10.7_NO_COMMIT
carryforwards_addressed: [CF-25, CF-DOGFOOD-2, CF-DOGFOOD-5, CF-DOGFOOD-7, CF-V2.5-9.7-PARALLELISM-FLAG, CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE, CF-V2.5-9.x-POSTPHASE-EXIT-CODE, SC-39-structural-unblock, F-2-gating, decision-032-033-backfill]
sc39_path: structural_seam_fix_per_decision_034_re_attempt_prerequisites
parallel_opportunities: [10.1 || 10.2 || 10.3]
critical_path: [10.0 -> {10.1, 10.2, 10.3} -> 10.4 -> 10.5.1 -> 10.5.2 -> 10.5.3 -> 10.6 -> 10.7]
expected_sessions: 10
expected_calendar_days: 4
opus_medium_dispatches: 4   # 10.3 architect + 10.5.1 architect + 10.5.3 Decision 035 + 10.7 sandwich-verifier
opus_max_dispatches: 0
v2_6_deferral_candidates: [decision-doc-lag.sh, CF-DOGFOOD-2 (if defer chosen), F-2-signal-extension (if SC-39 stays deferred), CF-DOGFOOD-5/7 (if defer chosen), 10.5.2 IMPL (if 10.5.1 design over-scope), community-OSS-launch-trigger, multi-user-adoption-rollout]
charter_coherence_verified: true
new_features_added: 0_closure_phase
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, session #45)
authoring_date: 2026-04-28
ratification_required_before_dispatch: true
next_action_for_orchestrator: dispatch_10.0_routing_brief
```

**END Phase 10 Master Plan v2.5 Carryforward Burndown + SC-39 Structural Unblock.**
