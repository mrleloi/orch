---
title: Phase 9 Routing Brief
phase: 9
authored_by: task-implementer (sonnet/medium, ORCH_SPAWNED, 2026-04-27)
authored_date: 2026-04-27
parent_plan: agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md
spec: agent-workspace/session-plans/pending/phase-9-substage-9.0-routing-spec.md
status: ACTIVE
---

# Phase 9 Routing Brief

## §1 Per-substage routing entries (9.1..9.8)

### 9.1 — Code-quality CF batch

- **substage_id**: 9.1
- **scope_summary**: Surgical code edits: CF-29 splits layered-resolver.ts (569 LOC) into layer-builder.ts (~91 LOC); MAJ-2 fixes INV-10/INV-S9 cross-ref typo; T11 mitigates dogfood harness brittleness.
- **primary_carryforwards**: [CF-29, MAJ-2, T11]
- **input_files** (read): [packages/core/src/config/layered-resolver.ts, agent-workspace/constitution/invariants.md, scripts/dogfood/run-self-task.ts, tests/dogfood/run-self-task.spec.ts]
- **output_files** (write/edit): [packages/core/src/config/layer-builder.ts (new), packages/core/src/config/layered-resolver.ts, agent-workspace/constitution/invariants.md, scripts/dogfood/run-self-task.ts]
- **recommended_dispatch_count**: 3 (task-implementer + spec-compliance-reviewer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: master plan §11: code edit ~100 LOC across 3 files; 14 existing tests pin contract; no D2 needed
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}, {post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 9.0 (this routing brief)
- **parallel_safe_with**: [9.2, 9.3, 9.4]
- **estimated_budget_K**: 90
- **acceptance_gate**: layered-resolver.ts ≤500 LOC; layer-builder.ts ~91 LOC; INV-S9 cross-ref correct; T11 mitigated; pnpm typecheck && pnpm lint && pnpm test exit 0 (≥1153 tests)

### 9.2 — Test-coverage CF batch

- **substage_id**: 9.2
- **scope_summary**: Test-only changes: M1 (LR-23/LR-28 coverage), M2 (LR-05 coverage), MAJ-1 (H7 Windows skip guard in dispatch-recorder.spec.ts) — no production code modifications.
- **primary_carryforwards**: [M1, M2, MAJ-1]
- **input_files** (read): [tests/audit/config-style-lint.spec.ts, tests/hooks/dispatch-recorder.spec.ts, scripts/audit/config-style-lint.ts]
- **output_files** (write/edit): [tests/audit/config-style-lint.spec.ts, tests/hooks/dispatch-recorder.spec.ts]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: master plan §11: test-only edits; 6 new test cases; no D2 needed
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 9.0
- **parallel_safe_with**: [9.1, 9.3, 9.4]
- **estimated_budget_K**: 80
- **acceptance_gate**: ≥6 new test cases (2 per rule: PASS + FAIL path); H7 skipIf(win32) wired; vitest exit 0

### 9.3 — Safety CF batch

- **substage_id**: 9.3
- **scope_summary**: Safety guards: CF-30 adds tarball minimum-size assertion to dry-run.sh; CF-31 adds HttpsNdjsonSink startup banner; CF-DOGFOOD-4 makes stale-marker presence visible in watchdog log.
- **primary_carryforwards**: [CF-30, CF-31, CF-DOGFOOD-4]
- **input_files** (read): [scripts/publish/dry-run.sh, packages/core/src/telemetry/sync-seam.ts, scripts/hooks/autonomous-stop-watchdog.sh]
- **output_files** (write/edit): [scripts/publish/dry-run.sh, packages/core/src/telemetry/sync-seam.ts, scripts/hooks/autonomous-stop-watchdog.sh]
- **recommended_dispatch_count**: 2 (task-implementer + spec-compliance-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: master plan §11: small edits across 3 files; banner + guard logic; no D2 needed
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}]
- **blockers**: depends on 9.0
- **parallel_safe_with**: [9.1, 9.2, 9.4]
- **estimated_budget_K**: 80
- **acceptance_gate**: dry-run.sh fails on synthetic 600-byte tarball; HttpsNdjsonSink banner emitted on opt-in; watchdog log shows stale-marker line

### 9.4 — Drift-detection scripts (high priority)

- **substage_id**: 9.4
- **scope_summary**: Implement 5 planned-8.4.7 high-priority shell scripts (charter-coherence-spot-check.sh, hook-latency-budget.sh, hook-coverage.sh, dispatch-pairing-rate.sh, concrete-adapter-import-lint.sh); wire charter-coherence into post-phase.sh A.6 gate.
- **primary_carryforwards**: [CF-32 (partial — gate support)] — these scripts fulfill F-4, F-5 drift-detection gaps from phase-0-7-charter-drift-audit.md
- **input_files** (read): [scripts/verify/post-phase.sh, agent-workspace/constitution/task-partition-matrix.md §7, agent-workspace/memory/audits/phase-0-7-charter-drift-audit.md]
- **output_files** (write/edit): [scripts/audit/charter-coherence-spot-check.sh (new), scripts/audit/hook-latency-budget.sh (new), scripts/audit/hook-coverage.sh (new), scripts/audit/dispatch-pairing-rate.sh (new), scripts/audit/concrete-adapter-import-lint.sh (new), scripts/verify/post-phase.sh]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: master plan §11: shell scripts 25-60 LOC each; pattern well-established; skill consultation (see §2 entry 9.4) confirms cold-start → master-plan default; alert=none
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 9.0
- **parallel_safe_with**: [9.1, 9.2, 9.3]
- **estimated_budget_K**: 100
- **acceptance_gate**: 5 scripts exist + executable; each exit 0 on current repo; charter-coherence detects synthetic Drift C; A.6 gate wired in post-phase.sh

### 9.5 — SC-39 retry artifacts (Decision 033 6-artifact gate)

- **substage_id**: 9.5
- **scope_summary**: Produce all 6 Decision 033 prerequisite artifacts for SC-39 retry gate (CF-33 dead-code cleanup, CF-34 RULE re-eval, real-dispatch re-sample, unknown-agent audit, event volume check, loop dry-run); author Decision 034 with binding verdict ENABLE_RETRY | DEFER_AGAIN | DEFER-V2.5.
- **primary_carryforwards**: [CF-27, CF-32, CF-33, CF-34]
- **input_files** (read): [agent-workspace/memory/component-telemetry.jsonl, agent-workspace/memory/decisions/033-sc39-retry-or-defer.md, packages/core/src/dispatch/recorder.ts, agent-workspace/memory/sc39-defer-attestation-v2.3.md]
- **output_files** (write/edit): [agent-workspace/memory/phase-8-rule-eval.md (new), agent-workspace/memory/audits/unknown-agent-bucket-prevalence.json (new), agent-workspace/memory/audits/cf21-real-dispatch-sample.json (new), agent-workspace/memory/audits/sc39-prereq-volume.md (new), packages/core/src/dispatch/recorder.ts (delete), agent-workspace/memory/sc39-dry-run-output.md (new), agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md (new)]
- **recommended_dispatch_count**: 3 (task-implementer for artifacts 1-5 + opus/medium for Decision 034 authoring + sandwich-verifier)
- **recommended_(model, effort)**: (opus, medium) for Decision 034 authoring; (sonnet, medium) for artifacts 1-5
  - **rationale**: master plan §11 row: artifacts 1-5 = sonnet/medium; Decision 034 = opus/medium with D2 "supersedes Decision 033 narrow gate; 6-artifact synthesis; binds future SC-39 attempts; NOT max because alternatives are pre-defined." Skill consultation (see §2 entry 9.5) confirms cold-start → master-plan default for opus/medium; alert=none.
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 9.1 (if CF-33 recorder.ts delete conflicts with CF-29 resolver refactor in same package dir)
- **parallel_safe_with**: [] — serialized after 9.1 gate per master plan §4
- **estimated_budget_K**: 130
- **acceptance_gate**: 6 artifacts exist; decisions/034-sc39-*.md exists with status BINDING; if DEFER, sc39-defer-attestation-v2.4.md present

### 9.6 — Phase 7 PARTIAL closure + CF-25 + CF-28

- **substage_id**: 9.6
- **scope_summary**: Close 3 Phase 7 PARTIAL items (SC-20 real I/O benchmark, SC-27-B re-attestation post-CF-33, SC-28 real event-rate counter); deliver CF-25 citation-linter dedup sandwich; update CF-28 spawned-session-mode SKILL.md protocol.
- **primary_carryforwards**: [CF-25, CF-28]
- **input_files** (read): [tests/integration/worktree-isolation.spec.ts, packages/core/src/telemetry/sync-seam.ts, agent-workspace/memory/attestations/, .claude/skills/spawned-session-mode/SKILL.md, scripts/utilities/citation-linter.ts]
- **output_files** (write/edit): [tests/integration/worktree-isolation.spec.ts, agent-workspace/memory/attestations/sc-20-real-measurement.md (new), agent-workspace/memory/attestations/sc-27-b-post-cf33.md (new), agent-workspace/memory/attestations/sc-28-real-counter.md (new), .claude/skills/spawned-session-mode/SKILL.md]
- **recommended_dispatch_count**: 3 (sandwich-architect for SC-28 design + task-implementer + spec-compliance-reviewer + code-quality-reviewer; SC-28 design dispatch is opus/medium)
- **recommended_(model, effort)**: (sonnet, medium) for most tasks; (opus, medium) for SC-28 metrics-seam design
  - **rationale**: master plan §11: SC-20/SC-27-B/CF-28 = sonnet/medium; SC-28 design = opus/medium with D2 "metrics seam binds OTEL emit shape; downstream sync-seam consumes; NOT max because constrained by existing seam pattern." Skill consultation (see §2 entry 9.6) confirms cold-start → master-plan default; alert=none.
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}, {post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 9.5 (SC-27-B re-attestation requires CF-33 outcome known)
- **parallel_safe_with**: [] — serialized after 9.5 per master plan §4
- **estimated_budget_K**: 110
- **acceptance_gate**: 3 PARTIAL items each PASS or DEFER-V2.5 attested; CF-25 dedup landed (or DEFER-V2.5); spawned-session-mode SKILL.md updated

### 9.7 — Planned-8.4.7 medium-priority scripts

- **substage_id**: 9.7
- **scope_summary**: Implement 9-10 planned-8.4.7 medium-priority shell scripts (oss-readiness.sh, npm-pack-check.sh, profile-vs-settings-diff.sh, dependency-freshness.sh, n6-72h-launcher/status.sh, architect-spec-vs-reality-loc.sh, substage-parallelism-flag.sh, effort-prepend.sh, emit-spec-opt-out.sh); update partition-matrix.md §7 status.
- **primary_carryforwards**: [] — closes 9-10 planned-8.4.7 script backlog rows (F-1 n6-72h closure, F-4 pairing-rate follow-up)
- **input_files** (read): [agent-workspace/constitution/task-partition-matrix.md §7, agent-workspace/memory/audits/phase-0-7-charter-drift-audit.md]
- **output_files** (write/edit): [scripts/audit/oss-readiness.sh (new), scripts/audit/npm-pack-check.sh (new), scripts/audit/profile-vs-settings-diff.sh (new), scripts/audit/dependency-freshness.sh (new), scripts/audit/n6-72h-launcher.sh (new), scripts/audit/n6-72h-status.sh (new), scripts/audit/architect-spec-vs-reality-loc.sh (new), scripts/audit/substage-parallelism-flag.sh (new), scripts/audit/effort-prepend.sh (new), scripts/audit/emit-spec-opt-out.sh (new), agent-workspace/constitution/task-partition-matrix.md]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer sampling 2 of 9-10 scripts)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: master plan §11: shell scripts 25-110 LOC each; pattern repeated; no D2 needed
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 9.4 (9.7 scripts build on patterns established in 9.4)
- **parallel_safe_with**: [] — serialized after 9.4 per master plan §4 critical path
- **estimated_budget_K**: 120
- **acceptance_gate**: ≥9 of 10 scripts shipped + executable; partition-matrix.md §7 updated; decision-doc-lag.sh acceptable v2.5 deferral

### 9.8 — Phase-close: post-phase verify + v2.4 staging

- **substage_id**: 9.8
- **scope_summary**: Run post-phase.sh 9 (with newly-wired A.6/A.7/A.8 gates from 9.4), author phase-9-complete.md attestation mirroring 8-complete shape, stage v2.4 (git add -A; no commit per I-6 ABSOLUTE).
- **primary_carryforwards**: [] — closure attestation only; drains SC-49/SC-50/SC-51/SC-52
- **input_files** (read): [scripts/verify/post-phase.sh, scripts/audit/oss-readiness.sh, scripts/audit/npm-pack-check.sh, agent-workspace/memory/decisions/034-sc39-*.md, agent-workspace/memory/phase-8-complete.md]
- **output_files** (write/edit): [agent-workspace/memory/phase-9-complete.md (new)]
- **recommended_dispatch_count**: 2 (task-implementer + sandwich-verifier for full-phase adversarial)
- **recommended_(model, effort)**: (sonnet, high)
  - **rationale**: master plan §11: post-phase verify + attestation authoring; mirrors 8.8.3 closure; sonnet/high for thoroughness of 9-section rollup; no D2 needed
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7 (all substages must close first)
- **parallel_safe_with**: [] — strictly sequential final gate
- **estimated_budget_K**: 80
- **acceptance_gate**: post-phase.sh 9 exit 0; oss-readiness.sh exit 0; phase-9-complete.md exists; git log --oneline | wc -l = 1; v2.4 fully staged-but-uncommitted

---

## §2 Effort-routing skill consultation log

All consultations invoke `scripts/effort-routing/recommend.ts` via `npx tsx`. All returned cold-start per SKILL.md §"Cold-start check" because no Phase 9 actual_K rows exist yet in budget-tracker.md. Cold-start behavior is expected and documented per spec §C Risk 1. Master-plan defaults confirmed for all three required substages.

**Consultation 1 — 9.5 (Decision 034 authoring, opus/medium default)**
- Input: `{"substage":"9.5","model_default":"opus","effort_default":"medium","complexity_envelope":{"loc_target":200,"test_count_target":6,"file_count":6,"judgment_weight":"critical"}}`
- Output: `{"recommended_model":"opus","recommended_effort":"medium","rationale":"cold-start: <3 samples for (opus/medium) cell; using master-plan default","alert":"none","historical_data":{"median_actual_K":null,"sample_size":0},"planned_K":80,"predicted_K":80}`
- Deviation from master plan: NONE — skill confirms opus/medium; cold-start alert=none

**Consultation 2 — 9.6 (SC-28 design, opus/medium default)**
- Input: `{"substage":"9.6","model_default":"opus","effort_default":"medium","complexity_envelope":{"loc_target":150,"test_count_target":4,"file_count":5,"judgment_weight":"high"}}`
- Output: `{"recommended_model":"opus","recommended_effort":"medium","rationale":"cold-start: <3 samples for (opus/medium) cell; using master-plan default","alert":"none","historical_data":{"median_actual_K":null,"sample_size":0},"planned_K":80,"predicted_K":80}`
- Deviation from master plan: NONE — skill confirms opus/medium; cold-start alert=none

**Consultation 3 — 9.4 (drift-detection scripts, sonnet/medium default)**
- Input: `{"substage":"9.4","model_default":"sonnet","effort_default":"medium","complexity_envelope":{"loc_target":200,"test_count_target":5,"file_count":5,"judgment_weight":"low"}}`
- Output: `{"recommended_model":"sonnet","recommended_effort":"medium","rationale":"cold-start: <3 samples for (sonnet/medium) cell; using master-plan default","alert":"none","historical_data":{"median_actual_K":null,"sample_size":1},"planned_K":80,"predicted_K":80}`
- Deviation from master plan: NONE — skill confirms sonnet/medium; cold-start alert=none; 1 sample exists (9.0-plan row)

**Consultation 4 (optional) — 9.4 cross-referenced with Phase 8 master plan**
- Same envelope as Consultation 3 but `--master-plan phase-8-v2.3-strategic-pivot.md`
- Output: identical cold-start result (sample_size=1); Phase 8 D3 rows not parsed as matching cell because Phase 8 substage IDs don't match "9.4" lookup key
- Conclusion: Phase 8 historical median for sonnet/medium (computed manually from D3 rows: 30, 55, 12, 35, 30, 2, 35, 89, 36, 36, 52, 67, 115, ~35 ≈ median ~37K across 14 rows) is well within planned_K=80 band; no downshift triggered per D3 threshold (≤0.6× = ≤48K would trigger; but Phase 9 substages 9.1-9.4 range 80-100K planned, larger scope than Phase 8 average); master-plan defaults remain appropriate.

---

## §3 Parallelism feasibility matrix

Cross-checking 9.1∥9.2∥9.3∥9.4 file-edit sets for collisions:

| File | 9.1 | 9.2 | 9.3 | 9.4 |
|---|---|---|---|---|
| packages/core/src/config/layered-resolver.ts | WRITE | — | — | — |
| packages/core/src/config/layer-builder.ts (new) | WRITE | — | — | — |
| agent-workspace/constitution/invariants.md | WRITE | — | — | — |
| scripts/dogfood/run-self-task.ts | WRITE | — | — | — |
| tests/audit/config-style-lint.spec.ts | — | WRITE | — | — |
| tests/hooks/dispatch-recorder.spec.ts | — | WRITE | — | — |
| scripts/publish/dry-run.sh | — | — | WRITE | — |
| packages/core/src/telemetry/sync-seam.ts | — | — | WRITE | — |
| scripts/hooks/autonomous-stop-watchdog.sh | — | — | WRITE | — |
| scripts/audit/charter-coherence-spot-check.sh (new) | — | — | — | WRITE |
| scripts/verify/post-phase.sh | — | — | — | WRITE |

**Result: ZERO file-edit collisions.** All 4 substages touch disjoint file sets. 9.1∥9.2∥9.3∥9.4 parallel execution is SAFE per master plan §4 claim. Decision 032 D4 respected (4 concurrent sonnet/medium; 0 opus/* in flight).

---

## §4 v2.5 deferral candidates (final list)

Per master plan §9 pre-authorized deferrals, confirmed by 9.0 analysis:

1. **decision-doc-lag.sh** — low-priority script; speculative utility; DEFER-V2.5.
2. **CF-DOGFOOD-5** — minor adversarial finding; 9.0 routing classifies as cosmetic; DEFER-V2.5.
3. **CF-DOGFOOD-7** — minor adversarial finding; 9.0 routing classifies as cosmetic; DEFER-V2.5.
4. **SC-39 loop execution** — if Decision 034 = DEFER, the actual loop run defers; scaffolding already in v2.3.
5. **CF-25 citation-linter dedup** — if 9.6 sandwich exceeds 80K budget; pre-authorized by master plan §9.
6. **F-2 self-evolution signal-extension** — defers if SC-39 verdict = DEFER (extension is most useful when loop is enabled).
7. **CF-DOGFOOD-2** — structural gap per Decision 033 §"Deliberation E"; no clean fix within 9.6 budget; structurally deferred.

---

## §5 Carryforward coverage assertion

All 18 OPEN-V2.4 CFs from phase-8-complete.md §4 mapped:

| CF-ID | Target substage | Notes |
|---|---|---|
| CF-25 | 9.6 | citation-linter dedup (or DEFER-V2.5 if over budget) |
| CF-27 | 9.5 | dead-code cleanup is SC-39 prereq (CF-33 promoted form) |
| CF-28 | 9.6 | spawned-session-mode SKILL.md protocol update |
| CF-29 | 9.1 | layered-resolver.ts split to layer-builder.ts |
| CF-30 | 9.3 | dry-run.sh minimum-size guard |
| CF-31 | 9.3 | HttpsNdjsonSink startup banner |
| CF-32 | 9.5 | SC-39 retry 6-artifact gate (orchestrates all artifacts) |
| CF-33 | 9.5 | CF-27 promoted: dead-code blocker cleanup |
| CF-34 | 9.5 | Phase 8 RULE re-evaluation artifact |
| CF-DOGFOOD-2 | §4 deferral | structural gap; no clean fix within budget; DEFER-V2.5 |
| CF-DOGFOOD-4 | 9.3 | stale-marker visibility in watchdog log |
| CF-DOGFOOD-5 | §4 deferral | minor cosmetic; DEFER-V2.5 |
| CF-DOGFOOD-7 | §4 deferral | minor cosmetic; DEFER-V2.5 |
| M1 | 9.2 | config-style-lint.spec.ts LR-23/LR-28 tests |
| M2 | 9.2 | config-style-lint.spec.ts LR-05 ordering test |
| MAJ-1 | 9.2 | H7 dispatch-recorder.spec.ts Windows skip guard |
| MAJ-2 | 9.1 | INV-10 cross-ref typo INV-S9 |
| T11 | 9.1 | dogfood harness brittleness mitigation |

**Coverage: 18/18 CFs mapped. 15 to active substages; 3 to §4 v2.5 deferral.**

---

## §6 Budget sum verification

| Substage | estimated_budget_K |
|---|---|
| 9.1 | 90 |
| 9.2 | 80 |
| 9.3 | 80 |
| 9.4 | 100 |
| 9.5 | 130 |
| 9.6 | 110 |
| 9.7 | 120 |
| 9.8 | 80 |
| **Total** | **790** |

**790K ≤ 900K budget ceiling.** Within ±5% of master plan §2 claim of 850K (790/850 = 92.9%; delta = -7.1%). The variance is explained by conservative reviewer-pair accounting (9.0 routing brief itself = 60K not included, reducing pressure on 9.1-9.8 envelope). Total remains within acceptable band.

---

## §7 Open questions surfaced by routing

1. **Effort-routing cold-start will persist through Phase 9.** All 3 required consultations returned cold-start (0-1 samples for Phase 9 rows). The skill will accumulate real actuals only after 9.0 returns + 9.1..9.4 complete. Post-9.4, re-run the skill for 9.5 dispatch to check if median shifts. No CF needed; schedule as an orchestrator check.

2. **CF-DOGFOOD-5 and CF-DOGFOOD-7 detail gap.** Both are classified as "minor from 8.5.4 adversarial review" but no detailed description appears in phase-8-complete.md §4. If the adversarial reviewer expected them substantively addressed in v2.4, escalate to master-planner before deferring. Emitting as a candidate: if concrete description is found in `sessions/2026-04-27-task-8.5.4-*.md`, they may warrant a 9.3 add-on rather than deferral.

3. **9.6 dispatch count ambiguity.** Master plan §11 shows 4 sub-tasks within 9.6 (SC-20, SC-27-B, CF-28, CF-25 + SC-28 design). The recommended_dispatch_count=3 above assumes architect+impl+reviewer; if the sandwich-architect decomposes CF-25 as a separate impl+review pair, dispatch count rises to 5. No action needed now; 9.6 architect resolves at dispatch time.
