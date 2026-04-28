---
title: Phase 10 Routing Brief
phase: 10
authored_by: task-implementer (sonnet/medium, ORCH_SPAWNED, 2026-04-28, task 10.0)
authored_date: 2026-04-28
parent_plan: agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md
status: ACTIVE
---

# Phase 10 Routing Brief

## §1 Per-substage routing entries (10.0..10.7)

### 10.0 — Phase 10 routing brief

- **substage_id**: 10.0
- **scope_summary**: Read master plan, partition 11 CFs by family, ratify per-substage routing via phase-9-routing-brief.md schema, run effort-routing consultations, list v2.6 deferral candidates.
- **primary_carryforwards**: [routing meta-task; no direct CF closure]
- **input_files** (read): [master plan, phase-9-complete.md, decisions/034-sc39-retry-or-defer-v2.4.md, phase-9-routing-brief.md, budget-tracker.md]
- **output_files** (write): [agent-workspace/memory/phase-10-routing-brief.md]
- **recommended_dispatch_count**: 1 (task-implementer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: routing-doc authoring; mechanical synthesis; no judgment-density requiring opus; matches 9.0 pattern (~30-50K actual).
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: []
- **blockers**: none — first substage
- **parallel_safe_with**: []
- **estimated_budget_K**: 60
- **acceptance_gate**: phase-10-routing-brief.md exists; §1-§7 schema populated; budget sum ≤900K; ≥1 v2.6 deferral named; ≥3 effort-routing consultations logged
- **status**: DONE

---

### 10.1 — Script-bug fix batch

- **substage_id**: 10.1
- **scope_summary**: Fix 3 script bugs: (a) substage-parallelism-flag.sh G.7 multi-line parse no-op (CF-V2.5-9.7-PARALLELISM-FLAG); (b) charter-coherence-spot-check.sh false-positive on Red-Flags `→ NO` denial lines (CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE); (c) post-phase.sh exit-code propagation returns 0 on failure (CF-V2.5-9.x-POSTPHASE-EXIT-CODE).
- **primary_carryforwards**: [CF-V2.5-9.7-PARALLELISM-FLAG, CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE, CF-V2.5-9.x-POSTPHASE-EXIT-CODE]
- **input_files** (read): [scripts/audit/substage-parallelism-flag.sh, scripts/audit/charter-coherence-spot-check.sh, scripts/verify/post-phase.sh, agent-workspace/memory/phase-9-routing-brief.md (fixture reference)]
- **output_files** (write): [scripts/audit/substage-parallelism-flag.sh, scripts/audit/charter-coherence-spot-check.sh, scripts/verify/post-phase.sh]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: 3 small script edits (≤40 LOC delta each); matches Phase 9 9.4 pattern (sonnet/medium, ~100K actual).
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 10.0 (this routing brief)
- **parallel_safe_with**: [10.2, 10.3]
- **estimated_budget_K**: 90
- **acceptance_gate**: substage-parallelism-flag.sh detects G.7 collision in synthetic fixture (PAIRS_CHECKED ≥ 1; exit 1); charter-coherence-spot-check.sh does NOT flag `→ NO` denial lines (planted negative PASS); post-phase.sh exits non-zero when sub-check fails; pnpm typecheck && pnpm lint exit 0

---

### 10.2 — Cosmetic dogfood findings + citation-linter dedup

- **substage_id**: 10.2
- **scope_summary**: Disposition CF-DOGFOOD-5 and CF-DOGFOOD-7 (recover descriptions from 8.5.4 session logs; produce 1-page note CLOSED-INLINE or DEFER-V2.6); deliver CF-25 citation-linter BUILTIN_HOOK_EVENTS dedup (add WebFetch + TaskList; unblocks SC-39 prereq #4).
- **primary_carryforwards**: [CF-25, CF-DOGFOOD-5, CF-DOGFOOD-7]
- **input_files** (read): [scripts/utilities/citation-linter.ts, agent-workspace/memory/sessions/2026-04-27-task-8.5.4-*.md, agent-workspace/memory/phase-8-complete.md §4]
- **output_files** (write): [scripts/utilities/citation-linter.ts, agent-workspace/memory/observations/task-10.2-dogfood-cosmetic-disposition.md, OPTIONAL inline cosmetic fix targets ≤20 LOC each]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: small sandwich (~80K total per Phase 9 9.6 CF-25 estimate); cosmetic disposition is doc-only or ≤20-LOC fixes; no D2 needed (architectural shape bounded by existing citation-linter).
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 10.0
- **parallel_safe_with**: [10.1, 10.3]
- **estimated_budget_K**: 80
- **acceptance_gate**: citation-linter rollup-mode PASSES on fixture containing WebFetch + TaskList citations (exit 0); CF-DOGFOOD-5 and CF-DOGFOOD-7 each have explicit disposition note (CLOSED-INLINE or DEFER-V2.6); pnpm test exit 0; no test-count regression

---

### 10.3 — CF-DOGFOOD-2 architectural assessment

- **substage_id**: 10.3
- **scope_summary**: Produce architectural assessment of CF-DOGFOOD-2 structural dogfood gap. Survey ≥3 options (FIX_INLINE / DEFER_V2.6 / WONT_FIX). Either land fix (≤150 LOC, ≤80K) OR formally defer via CF-V2.6 + optional decision-doc.
- **primary_carryforwards**: [CF-DOGFOOD-2]
- **input_files** (read): [agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md, agent-workspace/memory/sessions/2026-04-27-task-8.5.4-*.md, scripts/dogfood/run-self-task.ts]
- **output_files** (write): [agent-workspace/session-plans/pending/cf-dogfood-2-architectural-assessment.md, OPTIONAL agent-workspace/memory/decisions/03X-cf-dogfood-2-disposition.md]
- **recommended_dispatch_count**: 2 (sandwich-architect for assessment + task-implementer if fix path chosen)
- **recommended_(model, effort)**: (opus, medium) for sandwich-architect; (sonnet, medium) for task-implementer if fix chosen
  - **rationale**: structural-gap assessment with architectural judgment; alternatives pre-defined (FIX_INLINE / DEFER_V2.6 / WONT_FIX); matches Phase 9 9.5 Decision 034 authoring class (opus/medium, ~130K actual). NOT max because alternatives bounded by existing dogfood harness shape.
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}] — only if fix path chosen
- **blockers**: depends on 10.0
- **parallel_safe_with**: [10.1, 10.2]
- **estimated_budget_K**: 100
- **acceptance_gate**: cf-dogfood-2-architectural-assessment.md exists with ≥3 options surveyed; explicit disposition recorded; IF fix chosen: code lands + tests PASS; IF defer: decision-doc authored citing v2.6 trigger conditions

---

### 10.4 — Mid-verify gate

- **substage_id**: 10.4
- **scope_summary**: Run mid-phase verify after 10.1∥10.2∥10.3 parallel batch: post-phase.sh dry-run on Phase 10 (with fixed exit-code from 10.1), oss-readiness.sh, full pnpm test, drift-check.sh + invariant grep sweep. Confirms no regressions before SC-39 prereq work.
- **primary_carryforwards**: [verify checkpoint; no direct CF closure]
- **input_files** (read): [scripts/verify/post-phase.sh, scripts/audit/oss-readiness.sh, scripts/verify/drift-check.sh]
- **output_files** (write): [agent-workspace/memory/audits/phase-10-mid-verify.md]
- **recommended_dispatch_count**: 1 (task-implementer; or inline if main session can run gates)
- **recommended_(model, effort)**: (sonnet, low)
  - **rationale**: deterministic gate-runner only; no code edits expected; no synthesis judgment needed.
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: []
- **blockers**: depends on 10.1 + 10.2 + 10.3 all CLOSED
- **parallel_safe_with**: []
- **estimated_budget_K**: 30
- **acceptance_gate**: all gates exit 0; phase-10-mid-verify.md records test counts + drift-check status; any RED gate → surfaces as new CF and routes to 10.4-fix sub-task before unblocking 10.5

---

### 10.5.1 — SC-39 architectural design

- **substage_id**: 10.5.1
- **scope_summary**: sandwich-architect designs: (a) CF-21 dispatch-recorder seam fix — DISPATCHED + COMPLETED events share single tool_use_id space, direct matching yields pairing_rate ≥ 0.40 on ≥50 real pairs; (b) named-agent self-reporting — spawned agents self-report canonical component_name through telemetry seam, unknown_agent_fraction < 0.30. Spec must include Part-C deterministic gates pre-verified.
- **primary_carryforwards**: [SC-39 prereq #1 CF-21, SC-39 prereq #2 named-agent]
- **input_files** (read): [agent-workspace/memory/decisions/026-cf21-tool-use-id-correlation-defer.md, decisions/034-sc39-retry-or-defer-v2.4.md, packages/core/src/dispatch/, scripts/hooks/dispatch-jsonl-recorder.sh, scripts/hooks/component-telemetry.sh]
- **output_files** (write): [agent-workspace/session-plans/pending/10.5-sc39-structural-unblock-architect.md]
- **recommended_dispatch_count**: 1 (sandwich-architect)
- **recommended_(model, effort)**: (opus, medium)
  - **rationale**: structural seam design touching dispatch recorder + hook seam + spawn envelope; judgment-density high. NOT max because structural shape constrained by existing OTEL emit pattern and Decision 026 pre-bounded fix space. D2 justification: "CF-21 + named-agent seam binds future SC-39 retries; NOT max because alternatives constrained by existing component-telemetry.sh seam shape."
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: []
- **blockers**: depends on 10.4 (mid-verify GREEN)
- **parallel_safe_with**: []
- **estimated_budget_K**: 80

---

### 10.5.2 — SC-39 IMPL

- **substage_id**: 10.5.2
- **scope_summary**: Implement 10.5.1 architect spec: (a) CF-21 tool_use_id field emit in dispatch recorder + hook seam; (b) named-agent self-reporting wired into spawn envelope; (c) test fixtures + integration tests covering both seams.
- **primary_carryforwards**: [SC-39 prereq #1 CF-21 IMPL, SC-39 prereq #2 named-agent IMPL]
- **input_files** (read): [10.5.1 architect spec]
- **output_files** (write): [packages/core/src/dispatch/*, scripts/hooks/*, tests/dispatch/*, tests/hooks/*]
- **recommended_dispatch_count**: 3 (task-implementer ×2-3 parallel + spec-compliance-reviewer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium) for each task-implementer + reviewers
  - **rationale**: per-task IMPL ≤100 LOC each; spec signed off by 10.5.1; matches Phase 9 9.1 pattern (sonnet/medium, ~90K actual with fix cycle).
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post: spec-compliance, model: sonnet, effort: medium}, {post: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 10.5.1
- **parallel_safe_with**: []
- **estimated_budget_K**: 120

---

### 10.5.3 — SC-39 fresh artifacts + Decision 035

- **substage_id**: 10.5.3
- **scope_summary**: Produce 6 fresh artifacts against post-10.5.2 seam: (1) Phase 9 RULE re-eval; (2) unknown-agent bucket prevalence (target <0.30); (3) real-dispatch correlation re-sample (target ≥0.40 on ≥50 pairs); (4) event volume (≥10,000); (5) CF-33 dead-code state unchanged; (6) fresh dry-run + reviewer ACK. Author Decision 035 with binding verdict ENABLE_RETRY or DEFER-V2.6.
- **primary_carryforwards**: [SC-39 prereq #3 phase-cycle-stability, SC-39 prereq #5 dry-run, SC-39 prereq #6 Decision 035]
- **input_files** (read): [post-10.5.2 telemetry, decisions/034-sc39-retry-or-defer-v2.4.md §"Re-attempt prerequisites"]
- **output_files** (write): [audits/phase-10-rule-eval.md, audits/unknown-agent-bucket-prevalence-v2.5.json, audits/cf21-real-dispatch-sample-v2.5.json, audits/sc39-prereq-volume-v2.5.md, memory/sc39-dry-run-output-v2.5.md, decisions/035-sc39-retry-verdict-v2.5.md]
- **recommended_dispatch_count**: 2 (task-implementer for artifacts 1-5 + opus/medium for Decision 035 + sandwich-verifier)
- **recommended_(model, effort)**: (sonnet, medium) for artifacts 1-5; (opus, medium) for Decision 035
  - **rationale**: mirrors Phase 9 9.5 (planned 130K, actual ~130K). D2 for Decision 035: "supersedes Decision 034 DEFER-V2.5; verdict binds future SC-39 attempts; author-ack of all 5 prerequisites; NOT max because alternatives pre-defined (ENABLE_RETRY / DEFER-V2.6)."
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 10.5.2
- **parallel_safe_with**: []
- **estimated_budget_K**: 130

---

### 10.6 — Decision-doc backfill + F-2 self-evolution gating

- **substage_id**: 10.6
- **scope_summary**: Backfill phantom Decision 032 and 033 (referenced by Decision 034 + phase-9-routing-brief but not authored as files): either produce historically-accurate documents OR record as "elided-by-design" in decisions/README.md. Gate F-2 self-evolution signal-extension on Decision 035 verdict: if ENABLE_RETRY → scaffold f2-signal-extension-spec.md; if DEFER-V2.6 → defer F-2 with attestation.
- **primary_carryforwards**: [Decisions 032 + 033 phantom citations, F-2 self-evolution signal-extension]
- **input_files** (read): [agent-workspace/memory/decisions/README.md, phase-9-routing-brief.md, decisions/034-sc39-retry-or-defer-v2.4.md, decisions/035-sc39-retry-verdict-v2.5.md]
- **output_files** (write): [OPTIONAL decisions/032-effort-routing.md, OPTIONAL decisions/033-sc39-narrow-gate-supersession.md, decisions/README.md (update), OPTIONAL session-plans/pending/f2-signal-extension-spec.md]
- **recommended_dispatch_count**: 1 (task-implementer; escalate to opus/medium if backfill reconstruction requires significant judgment)
- **recommended_(model, effort)**: (sonnet, medium) default; (opus, medium) only if backfill is non-trivial reconstruction
  - **rationale**: doc-edit; small footprint; matches Phase 9 9.0 routing-brief pattern (~30-50K actual). Opus escalation reserved for transcript-reconstruction judgment work.
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: []
- **blockers**: depends on 10.5.3 (Decision 035 must exist before F-2 gate fires)
- **parallel_safe_with**: []
- **estimated_budget_K**: 60
- **acceptance_gate**: decisions/README.md no phantom citations OR explicit "elided-by-design" entries for 032 + 033; F-2 disposition recorded (scaffolded OR DEFER-V2.6 attestation)

---

### 10.7 — Phase-close: post-phase verify + v2.5 staging

- **substage_id**: 10.7
- **scope_summary**: Mirror 9.8 closure. Run post-phase.sh 10 (with fixed exit-code from 10.1 + augmented charter-coherence-spot-check from 10.1); produce phase-10-complete.md attestation; stage v2.5 (no commit per I-6 ABSOLUTE).
- **primary_carryforwards**: [closure attestation]
- **input_files** (read): [scripts/verify/post-phase.sh, scripts/audit/oss-readiness.sh, decisions/035-sc39-retry-verdict-v2.5.md, agent-workspace/memory/phase-9-complete.md (template)]
- **output_files** (write): [agent-workspace/memory/phase-10-complete.md]
- **recommended_dispatch_count**: 2 (task-implementer + sandwich-verifier for full-phase adversarial)
- **recommended_(model, effort)**: (sonnet, high) for attestation; (opus, medium) for sandwich-verifier
  - **rationale**: post-phase verify + attestation; mirrors Phase 9 9.8 (sonnet/high, planned 80K, actual ~20K — but high effort needed for thoroughness of rollup section).
  - **deviation_from_master_plan**: NONE
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 10.1, 10.2, 10.3, 10.5.3, 10.6 all CLOSED
- **parallel_safe_with**: []
- **estimated_budget_K**: 80
- **acceptance_gate**: post-phase.sh 10 exit 0; oss-readiness.sh exit 0; phase-10-complete.md exists; git log --oneline | wc -l = 1; v2.5 fully staged-but-uncommitted; sandwich-verifier verdict = APPROVED or APPROVED_AFTER_FIX

---

## §2 Effort-routing skill consultation log

`scripts/effort-routing/recommend.ts` does not exist (directory `scripts/effort-routing/` is absent as of Phase 10 start). This mirrors the cold-start behavior documented in phase-9-routing-brief.md §2 where all consultations returned cold-start. Per phase-9 precedent, master-plan defaults are used when the skill is unavailable.

**Consultation 1 — 10.1 (sonnet/medium baseline, script-bug fix batch)**
- Command attempted: `npx tsx scripts/effort-routing/recommend.ts` — file not found; skill not yet scaffolded
- Input envelope: `{"substage":"10.1","model_default":"sonnet","effort_default":"medium","complexity_envelope":{"loc_target":90,"test_count_target":4,"file_count":3,"judgment_weight":"low"}}`
- Output: COLD-START (skill absent; no historical rows for 10.x cell; sample_size=0)
- Historical anchor: Phase 9 9.4 (sonnet/medium, planned 100K, actual ~100K for 5 scripts; 10.1 is 3 scripts so 90K is appropriate downscale)
- Recommended: (sonnet, medium) per master plan — confirmed; no downshift triggered
- alert: none

**Consultation 2 — 10.5.2 (IMPL probably sonnet/medium; cross-check opus/medium)**
- Command attempted: `npx tsx scripts/effort-routing/recommend.ts` — file not found; cold-start
- Input envelope: `{"substage":"10.5.2","model_default":"sonnet","effort_default":"medium","complexity_envelope":{"loc_target":200,"test_count_target":6,"file_count":6,"judgment_weight":"high"}}`
- Output: COLD-START (skill absent; using master-plan default)
- Historical anchor: Phase 9 9.1 (sonnet/medium, ~90K actual for 3-file IMPL with reviewer cycle); 10.5.2 is larger (multi-file seam) so 120K planned is appropriate; staying sonnet/medium not opus/medium because spec is signed-off by 10.5.1 architect, per master-plan §2 rationale
- Recommended: (sonnet, medium) per master plan — confirmed
- alert: none; D2 justification confirmed inapplicable for IMPL substage (architect handles judgment)

**Consultation 3 — 10.6 (decision-backfill, sonnet/medium default; check if opus needed)**
- Command attempted: `npx tsx scripts/effort-routing/recommend.ts` — file not found; cold-start
- Input envelope: `{"substage":"10.6","model_default":"sonnet","effort_default":"medium","complexity_envelope":{"loc_target":60,"test_count_target":0,"file_count":3,"judgment_weight":"medium"}}`
- Output: COLD-START (skill absent; using master-plan default)
- Historical anchor: Phase 9 9.0 routing-brief (sonnet/medium, ~30-50K actual); 10.6 is slightly larger (backfill reconstruction + F-2 gate) but well within 60K; sonnet/medium appropriate unless backfill requires transcript reconstruction (see master-plan §2 escalation clause)
- Phase 9 actual_K-driven check: 9.0 actual ~50K; 10.6 budget=60K, delta +10K for backfill complexity — no downshift triggered; budget is generous
- Recommended: (sonnet, medium) default confirmed; conditional opus escalation pre-authorized by master plan if reconstruction requires significant judgment
- alert: none

**Cold-start conclusion**: All 3 required consultations returned cold-start (skill absent). Per phase-9-routing-brief.md §2 precedent and master plan §7 R7, master-plan routing defaults apply. Phase 9 actual_K rows are available in budget-tracker.md for manual calibration; they confirm no downshifts required across 10.1, 10.5.2, 10.6. Skill will accumulate real Phase 10 actuals after 10.0 returns; post-10.3, re-run if skill becomes available before 10.5 dispatch.

---

## §3 Parallelism feasibility matrix

### File-edit collision matrix for 10.1 ∥ 10.2 ∥ 10.3

| File | 10.1 | 10.2 | 10.3 |
|---|---|---|---|
| scripts/audit/substage-parallelism-flag.sh | WRITE | — | — |
| scripts/audit/charter-coherence-spot-check.sh | WRITE | — | — |
| scripts/verify/post-phase.sh | WRITE | — | — |
| scripts/utilities/citation-linter.ts | — | WRITE | — |
| memory/observations/task-10.2-dogfood-cosmetic-disposition.md | — | WRITE | — |
| session-plans/pending/cf-dogfood-2-architectural-assessment.md | — | — | WRITE |
| memory/decisions/03X-cf-dogfood-2-disposition.md | — | — | OPTIONAL_WRITE |

**Result: ZERO file-edit collisions across 10.1 ∥ 10.2 ∥ 10.3.** Safe to dispatch in parallel after 10.0 closes.

Concurrency cap check (Decision 032 D4): 2 sonnet/medium (10.1, 10.2) + 1 opus/medium (10.3) = 3 concurrent; 1 opus/* in flight (≤2 cap); 0 opus/max. SAFE.

**Mutual consistency verification**:
- 10.1 `parallel_safe_with`: [10.2, 10.3] ✓
- 10.2 `parallel_safe_with`: [10.1, 10.3] ✓
- 10.3 `parallel_safe_with`: [10.1, 10.2] ✓

**Forbidden parallelism**: 10.5 substages (10.5.1 → 10.5.2 → 10.5.3) MUST be serialized — dispatch recorder seam changes across multiple files; 10.5.3 artifacts depend on stable post-10.5.2 telemetry baseline. No substage outside 10.1/10.2/10.3 may run in parallel.

---

## §4 v2.6 deferral candidates (final list)

Pre-authorized per Decision 027 §"Consequences" 8 and phase-10 master plan §4:

1. **decision-doc-lag.sh** — low-priority planned-8.4.7 utility script; no production gate depends on it; DEFER-V2.6. (Also pre-authorized in phase-9-routing-brief.md §4 for v2.5; now carried to v2.6.)
2. **CF-DOGFOOD-2** — if 10.3 assessment selects DEFER_V2.6 or WONT_FIX disposition. Pre-authorized by Decision 033 §"Deliberation E".
3. **F-2 self-evolution signal-extension** — if Decision 035 = DEFER-V2.6; mechanically gated on SC-39 enablement.
4. **CF-DOGFOOD-5 / CF-DOGFOOD-7** — if 10.2 disposition records DEFER-V2.6 (cosmetic; original description may be unrecoverable from session logs). Justification: cosmetic-only, no charter clause violated.
5. **10.5.2 IMPL split** — if 10.5.1 architect surfaces a structural design change too large for 120K Stage 2 budget; IMPL defers, design only stages in v2.5; Decision 035 verdict = DEFER-V2.6.
6. **Community OSS launch trigger** (NPM publish, GitHub public-flip, README community section) — Phase 11 / v2.6; explicitly out-of-scope for v2.5.
7. **Multi-user adoption rollout** — Phase 11 / v2.6; out-of-scope.

---

## §5 Carryforward coverage assertion

Every OPEN-V2.5 item from phase-9-complete.md §4 maps to exactly one substage OR §4 deferral:

| CF-ID | Target | Notes |
|---|---|---|
| CF-25 | 10.2 | citation-linter BUILTIN_HOOK_EVENTS dedup (WebFetch + TaskList) |
| CF-DOGFOOD-2 | 10.3 | architectural assessment; FIX_INLINE / DEFER_V2.6 / WONT_FIX |
| CF-DOGFOOD-5 | 10.2 | cosmetic disposition note; CLOSED-INLINE or DEFER-V2.6 |
| CF-DOGFOOD-7 | 10.2 | cosmetic disposition note; CLOSED-INLINE or DEFER-V2.6 |
| CF-V2.5-9.7-PARALLELISM-FLAG | 10.1 | substage-parallelism-flag.sh multi-line parse fix |
| CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE | 10.1 | charter-coherence-spot-check.sh regex augmentation |
| CF-V2.5-9.x-POSTPHASE-EXIT-CODE | 10.1 | post-phase.sh exit-code accumulator pattern |
| SC-39 (Decision 034 DEFER-V2.5) | 10.5 (all 3 stages) | CF-21 seam fix + named-agent self-reporting + Decision 035 verdict |
| F-2 self-evolution signal-extension | 10.6 | gated on Decision 035; defer-V2.6 if SC-39 stays deferred |
| decision-doc-lag.sh | §4 deferral | pre-authorized v2.6 deferral |
| Decisions 032 + 033 phantom citations | 10.6 | backfill OR elided-by-design entry in decisions/README.md |

**Coverage: 11/11 OPEN-V2.5 items mapped. 10 to active substages; 1 to §4 v2.6 deferral (decision-doc-lag.sh). Zero items unaccounted-for.**

---

## §6 Budget sum verification

| Substage | Stage | Model | Effort | Estimated K |
|---|---|---|---|---|
| 10.0 | routing brief | sonnet | medium | 60 |
| 10.1 | script-bug fixes | sonnet | medium | 90 |
| 10.2 | cosmetic + CF-25 | sonnet | medium | 80 |
| 10.3 | CF-DOGFOOD-2 arch | opus | medium | 100 |
| 10.4 | mid-verify gate | sonnet | low | 30 |
| 10.5.1 | SC-39 architect | opus | medium | 80 |
| 10.5.2 | SC-39 IMPL | sonnet | medium | 120 |
| 10.5.3 | SC-39 artifacts + Decision 035 | sonnet + opus | medium | 130 |
| 10.6 | decision backfill + F-2 gate | sonnet | medium | 60 |
| 10.7 | phase close + v2.5 staging | sonnet/high + opus/medium | high | 80 |
| reviewer overhead (~5% × 7 substage groups) | — | sonnet | medium | 40 |
| **Total mid-estimate** | | | | **870** |
| **Ceiling** | | | | **900** |

**870K ≤ 900K ceiling.** Phase 9 actuals (~750K vs 790K planned) confirm calibration reasonable. v2.5 is slightly larger because 10.5 (330K structural unblock) exceeds any Phase 9 single substage. Margin available: 30K.

Wind-down note: 10.5 stages MUST checkpoint between each (10.5.1 → checkpoint → 10.5.2 → checkpoint → 10.5.3) to avoid hitting the 200K real-transcript wind-down threshold mid-stage.

---

## §7 Open questions surfaced by routing

1. **Effort-routing skill cold-start will persist through Phase 10 unless scaffolded.** `scripts/effort-routing/recommend.ts` does not exist. Re-run after skill is scaffolded (see phase-9-routing-brief.md §7 Q1 — same gap). No CF needed; log as orchestrator check post-10.3.

2. **CF-DOGFOOD-5 and CF-DOGFOOD-7 descriptions may still be unrecoverable.** Phase 9 routing brief §7 Q2 flagged this; if `sessions/2026-04-27-task-8.5.4-*.md` doesn't contain concrete descriptions, 10.2 defaults to DEFER-V2.6 with rationale "original description unrecoverable". Low impact: cosmetic-only items.

3. **Decision 035 confirmation-bias risk (R9).** After 10.5.2 IMPL, the same agent that authored 10.5.3 artifacts will be the one asserting prerequisites are MET. Mitigated by opus/medium + sandwich-verifier follow-up (mirrors Phase 9 9.5 pattern). No structural change needed.

4. **10.3 budget ceiling question (R1).** If FIX_INLINE is chosen and IMPL is non-trivial, 10.3 may stretch beyond 100K. Hard ceiling: 130K. If FIX_INLINE requires more than 130K total, defer to v2.6 (pre-authorized in §4 item 2). Orchestrator to flag if 10.3 dispatch approaches 100K before IMPL is complete.

5. **Blockers DAG is acyclic.** Inspection: 10.0 → {10.1, 10.2, 10.3} → 10.4 → 10.5.1 → 10.5.2 → 10.5.3 → 10.6 → 10.7. No cycles. 10.7 blockers list includes 10.5.3 (not 10.5 as a unit) per §1 entry — consistent with 3-stage decomposition.
