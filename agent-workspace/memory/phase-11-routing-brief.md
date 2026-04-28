---
title: Phase 11 Routing Brief
phase: 11
authored_by: task-implementer (sonnet/medium, ORCH_SPAWNED, 2026-04-28, task 11.0)
authored_date: 2026-04-28
parent_plan: agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md
status: ACTIVE
---

# Phase 11 Routing Brief

## §1 Per-substage routing entries (11.0..11.7)

### 11.0 — Phase 11 routing brief

- **substage_id**: 11.0
- **scope_summary**: Read master plan; partition 18 v2.6 CFs by family (hygiene-nitpick / audit-trail-discipline / structural-disposition / SC-39-measurement / F-2-gated-scaffold / closure); ratify per-substage routing using phase-10-routing-brief.md schema; list all v2.7 deferral candidates.
- **primary_carryforwards**: [routing meta-task; no direct CF closure]
- **input_files** (read): [phase-11 master plan, phase-10-complete.md, carryforwards-v2.6.md, decisions/035-sc39-retry-verdict-v2.5.md, phase-10-routing-brief.md, budget-tracker.md]
- **output_files** (write): [agent-workspace/memory/phase-11-routing-brief.md]
- **recommended_dispatch_count**: 1 (task-implementer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: routing-doc authoring; mechanical synthesis; no judgment-density justifying opus; matches 10.0 pattern (estimated 60K, actual ~60K).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per Decision 032).
- **reviewer_pairs**: []
- **blockers**: none — first substage.
- **parallel_safe_with**: [] — gates all downstream substages.
- **estimated_budget_K**: 60
- **acceptance_gate**: phase-11-routing-brief.md exists with §1-§5 schema populated; every substage 11.0-11.7 listed; D4 cap verified; ≥1 v2.7 deferral named; ≥3 effort-routing consultations logged.
- **status**: DONE

---

### 11.1 — Code-review nitpick hygiene batch (11 CFs)

- **substage_id**: 11.1
- **scope_summary**: Bundled hygiene fix-pass for 11 small CFs from 10.1/10.2/10.5.2.B/10.5.2.C code-quality reviews. All edits ≤30 LOC each; ≤200 LOC aggregate; disjoint from 11.2 and 11.3 file sets.
- **primary_carryforwards**: [CF-V2.6-10.1-FAIL-COUNT-DEAD, CF-V2.6-10.1-DUPLICATE-A4-PASS, CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP, CF-V2.6-10.2-R9-PRECONDITION, CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING, CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS, CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE, CF-V2.6-10.5-TUI-JSON-NAMING, CF-V2.6-10.5-H8-FIXTURE-NAME, CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD (OPTIONAL), CF-V2.6-10.5-T-NA2-DEDUP-COMMENT]
- **input_files** (read): [scripts/verify/post-phase.sh, scripts/audit/substage-parallelism-flag.sh, scripts/utilities/citation-linter.ts, tests/scripts/citation-linter-rollup.spec.ts, scripts/hooks/dispatch-jsonl-recorder.sh, tests/hooks/dispatch-recorder.spec.ts, scripts/hooks/component-telemetry.sh, tests/hooks/component-telemetry.spec.ts, agent-workspace/memory/decisions/023-*]
- **output_files** (write): [all input files (in-place edits); OPTIONAL decisions/038-10.5-agent-type-field-naming.md]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: 11 small surgical edits; no judgment-density; pattern matches Phase 9 §9.1 carryforward-batch (sonnet/medium, planned 100K, actual ~80K).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 11.0.
- **parallel_safe_with**: [11.2, 11.3] — disjoint file-edit sets (zero collisions per master plan §3 matrix).
- **estimated_budget_K**: 120
- **acceptance_gate**: 11/11 nitpick CFs CLOSED with concrete diff; pnpm test PASS; pnpm typecheck && pnpm lint exit 0; planted regression fixture for X.10 lexicographic dedup PASS; code-quality reviewer APPROVED or APPROVED_WITH_CONCERNS (no critical).

---

### 11.2 — Audit-trail inline-return discipline (subagent contract update)

- **substage_id**: 11.2
- **scope_summary**: Standardize CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN. Bake "MUST Write final verdict to observations/" clause into spec-compliance-reviewer, code-quality-reviewer, and sandwich-verifier template files; optionally promote path #3 orchestrator-reactive-write to a discipline skill.
- **primary_carryforwards**: [CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN]
- **input_files** (read): [.claude/agents/spec-compliance-reviewer.md, .claude/agents/code-quality-reviewer.md, .claude/agents/sandwich-verifier.md, agent-workspace/memory/observations/task-10.5-20260428-sandwich-verifier.md, agent-workspace/memory/carryforwards-v2.6.md]
- **output_files** (write): [.claude/agents/spec-compliance-reviewer.md, .claude/agents/code-quality-reviewer.md, .claude/agents/sandwich-verifier.md, OPTIONAL .claude/skills/observation-file-write-on-return/SKILL.md]
- **recommended_dispatch_count**: 1 (task-implementer; no reviewer pair needed — doc-only)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: doc-edit work bounded by existing subagent template shape; pattern matches Phase 9 §9.0 routing-brief authoring (sonnet/medium, ~30-50K actual). No D2 needed.
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per Decision 032).
- **reviewer_pairs**: []
- **blockers**: depends on 11.0.
- **parallel_safe_with**: [11.1, 11.3] — .claude/agents/ and .claude/skills/ are untouched by 11.1 or 11.3.
- **estimated_budget_K**: 50
- **acceptance_gate**: each of the 3 reviewer-template files contains the "MUST Write final verdict to observations/" clause; IF skill authored, SKILL.md exists with explicit trigger-on-return semantics; charter-coherence-spot-check.sh PASS.

---

### 11.3 — CF-DOGFOOD-2 architectural disposition (binding decision)

- **substage_id**: 11.3
- **scope_summary**: Bind the CF-DOGFOOD-2 disposition deferred by Phase 10 §10.3. Sandwich-architect chooses: (a) FIX_INLINE — replace run-self-task.ts:387 step-9 stub with real IAgentRuntime.spawn() guarded behind a profile flag; (b) DEFER-V2.7 — binding decision-doc citing v2.7 trigger conditions; (c) WONT_FIX — charter-coherence rationale. IMPL follows only if FIX_INLINE chosen and budget ≤80K.
- **primary_carryforwards**: [CF-DOGFOOD-2]
- **input_files** (read): [agent-workspace/constitution/cf-dogfood-2-assessment.md, scripts/dogfood/run-self-task.ts, tests/dogfood/run-self-task.spec.ts, packages/core/src/interfaces/IAgentRuntime.ts, agent-workspace/memory/decisions/033-sc39-narrow-gate-supersession.md]
- **output_files** (write): [Decision 039 (path-conditional); OPTIONAL dogfood harness edits if FIX_INLINE]
- **recommended_dispatch_count**: 2 (sandwich-architect for disposition + task-implementer if FIX_INLINE; spec-compliance-reviewer ONLY if FIX_INLINE)
- **recommended_(model, effort)**: (opus, medium) for disposition decision; (sonnet, medium) for IMPL if chosen
  - **rationale**: structural decision-binding task; 3 pre-bounded alternatives; judgment-density high. Pattern matches Phase 10 §10.3 (opus/medium, planned 100K, actual ~80K assessment-only). NOT max because alternatives bounded and assessment doc on disk.
  - **D2 justification**: "Disposition decision binds future v2.7+ self-application work; cross-references SC-44, Decision 027 §C-8, Decision 033 Deliberation E. Three alternatives pre-defined. NOT max because assessment doc shrinks design space dramatically." (per Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}] — only if FIX_INLINE.
- **blockers**: depends on 11.0.
- **parallel_safe_with**: [11.1, 11.2] — scripts/dogfood/ + decisions/039 are disjoint from 11.1's scripts/ and 11.2's .claude/agents/ paths.
- **estimated_budget_K**: 100
- **acceptance_gate**: Decision 039 authored with explicit verdict; IF FIX_INLINE: code lands + pnpm test PASS + T9-real-spawn test exercises real IAgentRuntime.spawn() path; IF DEFER-V2.7: decision-doc cites v2.7 trigger conditions; sandwich-architect verdict APPROVED.

---

### 11.4 — Mid-verify gate after parallel batch close

- **substage_id**: 11.4
- **scope_summary**: Run mid-phase verify after 11.1 ∥ 11.2 ∥ 11.3 close: post-phase.sh dry-run, oss-readiness.sh, full pnpm test, drift-check.sh + invariant grep sweep. Confirms no regressions before SC-39 R-1 verification work begins in 11.5.1.
- **primary_carryforwards**: [verify checkpoint; no direct CF closure]
- **input_files** (read): [scripts/verify/post-phase.sh, scripts/audit/oss-readiness.sh, scripts/verify/drift-check.sh]
- **output_files** (write): [agent-workspace/memory/audits/phase-11-mid-verify.md]
- **recommended_dispatch_count**: 1 (task-implementer; or inline if main session can run gates)
- **recommended_(model, effort)**: (sonnet, low)
  - **rationale**: deterministic gate-runner only; no code edits expected; pattern matches Phase 10 10.4 (sonnet/low, planned 30K, actual ~30K).
  - **D2 justification**: NOT REQUIRED (sonnet/low is below the D2 threshold per Decision 032).
- **reviewer_pairs**: []
- **blockers**: depends on 11.1 + 11.2 + 11.3 all CLOSED.
- **parallel_safe_with**: [] — strictly mid-phase serial gate.
- **estimated_budget_K**: 30
- **acceptance_gate**: all CLASS-A gates exit 0; oss-readiness PASS; phase-11-mid-verify.md records test counts + drift-check status; RED gate → surface as new CF and route to 11.4-fix sub-task before unblocking 11.5.1.

---

### 11.5.1 — SC-39 R-1 verification + production-vs-fixture test infra

- **substage_id**: 11.5.1
- **scope_summary**: Sandwich-architect designs R-1 verification probe (Decision 035 §5 option (c) — empirical: dispatch Agent call in fresh Phase-11 session, read dispatch.jsonl, confirm COMPLETED row agent_id re-keyed onto toolu_* dispatch_id space); designs sc39-production-pairing-rate.spec.ts integration test; impl leg lands: test, settings-version-check.sh, spawned-session-mode SKILL.md update.
- **primary_carryforwards**: [SC-39 R-1 verification, CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE, CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP]
- **input_files** (read): [decisions/035-sc39-retry-verdict-v2.5.md, scripts/hooks/dispatch-jsonl-recorder.sh, scripts/hooks/component-telemetry.sh, .claude/settings.json, .claude/skills/spawned-session-mode/SKILL.md]
- **output_files** (write): [session-plans/pending/11.5-sc39-r1-r3-architect.md, tests/integration/sc39-production-pairing-rate.spec.ts (NEW), scripts/audit/settings-version-check.sh (NEW), .claude/skills/spawned-session-mode/SKILL.md (UPDATE)]
- **recommended_dispatch_count**: 2 (sandwich-architect + task-implementer)
- **recommended_(model, effort)**: (opus, medium) for architect; (sonnet, medium) for impl
  - **rationale**: structural test infra; judgment-density high for architect leg; impl bounded by spec. Pattern matches Phase 10 10.5.1 (opus/medium architect, planned 80K, actual ~80K).
  - **D2 justification**: "R-1 + production-vs-fixture test infra binds future SC-N retries; cross-references Decision 035 §6 three CF action items; affects test harness layout. NOT max because Decision 035 §6 pre-bounded the test shape." (per Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet, effort: medium}, {post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 11.4 (mid-verify GREEN).
- **parallel_safe_with**: [] — strictly serialized within 11.5; no other substage during 11.5 stages.
- **estimated_budget_K**: 130

---

### 11.5.2 — SC-39 R-2 natural-volume audit + R-3 re-measurement

- **substage_id**: 11.5.2
- **scope_summary**: Verify R-2 prerequisites (≥50 Agent-tool DISPATCHED events in Phase 11; ≥10,000 total component-telemetry events). Produce 3 fresh R-3 artifacts (cf21-real-dispatch-sample-v2.6.json with pairing_rate ≥ 0.40; unknown-agent-bucket-prevalence-v2.6.json with fraction < 0.30; sc39-prereq-volume-v2.6.md with total ≥ 10,000). Confirm must-stay-PASS on artifacts 4/5/6.
- **primary_carryforwards**: [SC-39 R-2 natural-volume, SC-39 R-3 re-measurement artifacts]
- **input_files** (read): [dispatch.jsonl, component-telemetry.jsonl (post-Phase-10 + post-11.5.1 baseline), decisions/035-sc39-retry-verdict-v2.5.md §5 R-2/R-3, v2.5 artifact templates]
- **output_files** (write): [audits/cf21-real-dispatch-sample-v2.6.json, audits/unknown-agent-bucket-prevalence-v2.6.json, audits/sc39-prereq-volume-v2.6.md, audits/phase-11-rule-eval.md, audits/cf33-state-v2.6.md, observations/task-11.5.2-20260428-artifacts.md]
- **recommended_dispatch_count**: 1 (task-implementer; sandwich-verifier follows in 11.5.3)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: artifact-collection task; mirrors Phase 10 10.5.3 stage 1 (sonnet/medium, ~60K actual). Decision authorship moves to 11.5.3.
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per Decision 032).
- **reviewer_pairs**: [] — sandwich-verifier follows in 11.5.3.
- **blockers**: depends on 11.5.1.
- **parallel_safe_with**: [] — strictly serialized within 11.5.
- **estimated_budget_K**: 100

---

### 11.5.3 — Decision 037 ENABLE_RETRY verdict + sandwich-verifier

- **substage_id**: 11.5.3
- **scope_summary**: Author Decision 037 with binding verdict ENABLE_RETRY (if R-1+R-2+R-3 all PASS) OR DEFER-V2.7 (if any prereq fails). Decision 037 must cite each R-1/R-2/R-3 evidence explicitly per Decision 035 §5 R-4 spec. Sandwich-verifier opus/medium runs adversarial review against all 11.5 outputs.
- **primary_carryforwards**: [SC-39 R-4 Decision 037 author-ack]
- **input_files** (read): [11.5.1 + 11.5.2 outputs; decisions/035-sc39-retry-verdict-v2.5.md §5 R-1/R-2/R-3/R-4]
- **output_files** (write): [decisions/037-sc39-retry-verdict-v2.6.md (BINDING), observations/task-11.5-20260428-sandwich-verifier.md]
- **recommended_dispatch_count**: 2 (opus/medium Decision 037 authoring + opus/medium sandwich-verifier)
- **recommended_(model, effort)**: (opus, medium) for both
  - **rationale**: binding-decision authoring; risk of confirmation bias requires adversarial follow-up. Pattern matches Phase 10 10.5.3 Decision 035 (opus/medium, ~70K) + sandwich-verifier (~50K).
  - **D2 justification (Decision 037)**: "supersedes Decision 035 DEFER-V2.6; verdict binds future SC-39 attempts and gates F-2 self-evolution scaffolding (11.6). NOT max because alternatives pre-defined." (per Decision 032).
  - **D2 justification (sandwich-verifier)**: "adversarial review of binding decision touching SC-39, F-2 gating, and 5 telemetry artifacts; opus/medium needed for cross-substage tradeoff analysis. NOT max because verifier scope bounded by substage deliverables." (per Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 11.5.2.
- **parallel_safe_with**: [] — strictly serialized within 11.5.
- **estimated_budget_K**: 130

---

### 11.6 — F-2 self-evolution scaffolding (GATED on 11.5.3 verdict)

- **substage_id**: 11.6
- **scope_summary**: Gate on Decision 037. If ENABLE_RETRY: extend rollup-telemetry.ts schema with agent-type-distribution + paired-correlation + loop-proposal-acceptance-rate fields; author specs/tier1-strategic/f2-self-evolution-signal-extension.md; add scaffolding tests; author Decision 040 BINDING (scaffolds-not-implements). If DEFER-V2.7: author audits/f2-self-evolution-disposition-v2.6.md re-deferral attestation.
- **primary_carryforwards**: [F-2 self-evolution signal-extension]
- **input_files** (read): [decisions/037-sc39-retry-verdict-v2.6.md, audits/f2-self-evolution-disposition-v2.5.md, packages/core/src/telemetry/rollup-telemetry.ts, specs/tier1-strategic/]
- **output_files** (write): [path-conditional per verdict; see master plan §11.6]
- **recommended_dispatch_count**: 1 (task-implementer; code-quality-reviewer OPTIONAL if scaffolding leg chosen)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: schema extension + spec authoring; bounded by existing rollup-telemetry shape. No D2 needed. Pattern matches Phase 10 10.6 (sonnet/medium, planned 60K, actual ~80K with backfill writes).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}] — only if scaffolding leg chosen.
- **blockers**: depends on 11.5.3 (Decision 037 must exist).
- **parallel_safe_with**: [] — runs after 11.5.
- **estimated_budget_K**: 80
- **acceptance_gate**: F-2 disposition recorded; IF SC-39 ENABLED: rollup-telemetry.ts compiles; new scaffolding tests PASS; spec file exists; Decision 040 authored; IF SC-39 DEFERRED: f2-disposition-v2.6.md cites updated gate.

---

### 11.7 — Phase-close: post-phase verify + v2.6 staging + bundled commit

- **substage_id**: 11.7
- **scope_summary**: Mirror 10.7 closure pattern. Run post-phase.sh 11; produce phase-11-complete.md attestation; stage v2.6; author bundled-commit message per Decision 036 precedent; commit + tag at sandwich-verifier APPROVED (per user standing grant 2026-04-28: autonomous mode = autonomous until DONE ALL — incl. git commit/tag/release).
- **primary_carryforwards**: [closure attestation; bundled-commit execution]
- **input_files** (read): [scripts/verify/post-phase.sh, scripts/audit/oss-readiness.sh, decisions/037-sc39-retry-verdict-v2.6.md, decisions/039-cf-dogfood-2-*.md, phase-10-complete.md (template)]
- **output_files** (write): [agent-workspace/memory/phase-11-complete.md, .git/COMMIT_EDITMSG_v2.6]
- **recommended_dispatch_count**: 2 (task-implementer for attestation + sandwich-verifier for full-phase adversarial; main session executes commit+tag after APPROVED)
- **recommended_(model, effort)**: (sonnet, high) for attestation; (opus, medium) for sandwich-verifier
  - **rationale**: post-phase verify + attestation + bundled-commit message; mirrors Phase 10 10.7 (sonnet/high, planned 80K, actual ~80K with verifier).
  - **D2 justification (sandwich-verifier opus/medium)**: "adversarial full-phase review touching all 11.x substages, SC-39 R-1/R-2/R-3/R-4 execution, F-2 gating, and CF-DOGFOOD-2 disposition; opus/medium needed for cross-substage charter coherence sweep. NOT max because scope bounded by phase-close attestation template." (per Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 11.1, 11.2, 11.3, 11.5, 11.6 all CLOSED.
- **parallel_safe_with**: [] — strictly final gate.
- **estimated_budget_K**: 80
- **acceptance_gate**: post-phase.sh 11 exit 0; oss-readiness.sh exit 0; phase-11-complete.md exists; sandwich-verifier verdict APPROVED or APPROVED_WITH_CONCERNS (no critical); IF APPROVED → main session executes git commit + git tag v2.6 per user standing grant.

---

## §2 Effort-routing skill consultation log

`scripts/effort-routing/recommend.ts` does not exist (cold-start state identical to Phase 10 §2 entry). Per phase-10-routing-brief.md §2 precedent and master plan §7 R7, master-plan defaults apply when the skill is unavailable.

**Consultation 1 — 11.1 (sonnet/medium baseline; 11 small surgical edits)**
- Command attempted: `npx tsx scripts/effort-routing/recommend.ts` — file not found; cold-start
- Input envelope: `{"substage":"11.1","model_default":"sonnet","effort_default":"medium","complexity_envelope":{"loc_target":200,"test_count_target":3,"file_count":8,"judgment_weight":"low"}}`
- Output: COLD-START (skill absent; no historical rows for 11.x cell; sample_size=0)
- Historical anchor: Phase 9 §9.1 (sonnet/medium, planned 100K, actual ~80K for 8+ small fixes); Phase 10 10.1 (sonnet/medium, planned 90K, actual ~90K for 3 script fixes). 11.1 is larger (11 fixes vs 3) so 120K is appropriate scale-up.
- Recommended: (sonnet, medium) per master plan — confirmed; no downshift triggered.
- alert: none

**Consultation 2 — 11.3 (opus/medium for disposition; cross-check necessity)**
- Command attempted: `npx tsx scripts/effort-routing/recommend.ts` — file not found; cold-start
- Input envelope: `{"substage":"11.3","model_default":"opus","effort_default":"medium","complexity_envelope":{"loc_target":100,"test_count_target":2,"file_count":3,"judgment_weight":"high"}}`
- Output: COLD-START (skill absent; using master-plan default)
- Historical anchor: Phase 10 10.3 (opus/medium architect, planned 100K, actual ~80K for assessment-only; FIX_INLINE would add ~40K IMPL). D2 justification pre-authored by master plan §11.3.
- Recommended: (opus, medium) per master plan — confirmed; D2 is required and documented.
- alert: none

**Consultation 3 — 11.5.3 (opus/medium for Decision 037; adversarial verifier required)**
- Command attempted: `npx tsx scripts/effort-routing/recommend.ts` — file not found; cold-start
- Input envelope: `{"substage":"11.5.3","model_default":"opus","effort_default":"medium","complexity_envelope":{"loc_target":80,"test_count_target":0,"file_count":2,"judgment_weight":"high"}}`
- Output: COLD-START (skill absent; using master-plan default)
- Historical anchor: Phase 10 10.5.3 Decision 035 (opus/medium, ~70K) + sandwich-verifier (~50K) = 120K actual. 11.5.3 budget=130K (+10K buffer for larger R-4 evidence body). D2 justification pre-authored by master plan §11.5.3.
- Recommended: (opus, medium) per master plan — confirmed.
- alert: none

**Cold-start conclusion**: All 3 required consultations returned cold-start (skill absent). Per phase-10-routing-brief.md §2 precedent, master-plan routing defaults apply. Phase 10 actual_K rows (10.1 ~90K, 10.3 ~80K, 10.5.3 ~120K) confirm no downshifts required across 11.1, 11.3, 11.5.3. Skill will accumulate real Phase 11 actuals after 11.0 returns.

---

## §3 D4 concurrency-cap check (Decision 032 D4: ≤2 concurrent opus/* in flight)

**Critical-path DAG (from master plan §3):**
```
11.0 → {11.1 ∥ 11.2 ∥ 11.3} → 11.4 → 11.5.1 → 11.5.2 → 11.5.3 → 11.6 → 11.7
```

**Concurrent dispatch analysis at each parallel moment:**

| Dispatch moment | Substages in flight | Opus/* in flight | sonnet/* in flight | D4 PASS? |
|---|---|---|---|---|
| After 11.0 closes | 11.1 (sonnet) ∥ 11.2 (sonnet) ∥ 11.3 (opus) | 1 (11.3 architect) | 2 (11.1, 11.2) | YES (1 ≤ 2) |
| 11.5.1 in flight | 11.5.1 only (opus architect + sonnet impl) | 1 (architect) | 1 (impl) | YES (1 ≤ 2) |
| 11.5.3 in flight | 11.5.3 Decision 037 + sandwich-verifier (serialized) | 1 at a time | 0 | YES (1 ≤ 2) |
| 11.7 in flight | 11.7 task-implementer (sonnet) then sandwich-verifier (opus) | 1 (serially) | 1 | YES (1 ≤ 2) |

**File-edit collision matrix for 11.1 ∥ 11.2 ∥ 11.3 (from master plan §3):**

| File/path | 11.1 | 11.2 | 11.3 |
|---|---|---|---|
| scripts/verify/post-phase.sh | WRITE | — | — |
| scripts/audit/substage-parallelism-flag.sh | WRITE | — | — |
| scripts/utilities/citation-linter.ts | WRITE | — | — |
| tests/hooks/dispatch-recorder.spec.ts | WRITE | — | — |
| scripts/hooks/dispatch-jsonl-recorder.sh | WRITE | — | — |
| .claude/agents/spec-compliance-reviewer.md | — | WRITE | — |
| .claude/agents/code-quality-reviewer.md | — | WRITE | — |
| .claude/agents/sandwich-verifier.md | — | WRITE | — |
| scripts/dogfood/run-self-task.ts | — | — | OPTIONAL_WRITE |
| decisions/039-cf-dogfood-2-*.md | — | — | WRITE |

**Result: ZERO file-edit collisions across 11.1 ∥ 11.2 ∥ 11.3.** D4 cap PASS at every dispatch moment. Zero opus/max dispatches (MEMORY.md quota discipline preserved).

**Forbidden parallelism confirmed**: 11.5 substages (11.5.1 → 11.5.2 → 11.5.3) strictly serialized. 11.6 forbidden in parallel with 11.5.3 because F-2 gating depends on Decision 037 outcome.

---

## §4 Pre-authorized v2.7 deferrals

Per Decision 027 §"Consequences" 8 (scaffold-now-execute-later) and phase-10-routing-brief.md §4 pattern, these v2.6 items may defer to v2.7 without re-asking:

1. **CF-DOGFOOD-2 IMPL leg** — if 11.3 disposition selects DEFER-V2.7. Pre-authorized by Decision 033 §"Deliberation E" structural-defer pattern; cf-dogfood-2-assessment.md on disk provides v2.7 trigger conditions.

2. **F-2 self-evolution scaffolding** — if 11.5.3 verdict = DEFER-V2.7. Mechanically gated by SC-39 enablement per audits/f2-self-evolution-disposition-v2.5.md §2. Re-defer attestation f2-self-evolution-disposition-v2.6.md still authored (Phase 10 10.6 precedent).

3. **CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY action items** (min_phases_after_fix annotation; retry-or-defer ritual update). Documentation-only; budget-permitting in 11.5.1 architect spec. If skipped, defer to v2.7 with explicit carry-forward.

4. **CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE auxiliary polish** (settings-version-check audit script deeper integration + harness-audit skill). Initial scaffold lands in 11.5.1; full polish optionally defers to v2.7.

5. **CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD** — the OPTIONAL Decision 038 backfill. If 11.1 resolves via inline-comment + Decision 023 reference, the "dedicated standalone decision record" carryforward explicitly defers to v2.7.

6. **Mid-stage 11.5.1 IMPL split** — if architect surfaces a deeper structural test-infra change (e.g., child-process spawn requires harness permission cache update). 11.5.1 produces architect spec only; IMPL defers; Decision 037 verdict = DEFER-V2.7.

7. **CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP test green-deadline** — if integration test scaffold lands but does not green by 11.5.3 close (child-process spawn harness issue), defer green-deadline to v2.7 while keeping test in-tree as .todo or .skip-flagged.

8. **Community OSS launch trigger** (NPM publish, GitHub public-flip, README community section). Phase 12 / v2.7+ work; explicitly out-of-scope for v2.6.

9. **Multi-user adoption rollout**. Phase 12 / v2.7+ work; out-of-scope for v2.6.

---

## §5 Open questions requiring runtime judgment

1. **11.3 IMPL-vs-DEFER runtime judgment.** If sandwich-architect chooses FIX_INLINE but implementation reveals the run-self-task.ts:387 stub requires >80K to fix correctly (e.g., IAgentRuntime.spawn() interface has diverged from what the stub assumed), the orchestrator must flip to DEFER-V2.7 mid-substage without re-asking. Budget ceiling: 130K total for 11.3 (soft) → DEFER-V2.7 if exceeded.

2. **11.5.3 verdict gating F-2 (11.6).** If Decision 037 = DEFER-V2.7 on partial-PASS grounds (e.g., R-1 PASS but R-2 INSUFFICIENT_VOLUME), 11.6 still authors f2-self-evolution-disposition-v2.6.md re-deferral (not skip). If Decision 037 = ENABLE_RETRY, 11.6 scaffolds the schema extension. The orchestrator fires the correct branch without user confirmation (Q3 resolved by master plan §7).

3. **11.5.2 INSUFFICIENT_VOLUME escalation path.** If R-2 natural-volume threshold (≥50 DISPATCHED Agent calls) is not met by the time 11.5.2 executes, the orchestrator must decide: (a) EXTEND — allow additional substages to accumulate volume before 11.5.2 measures; (b) ACCEPT partial-PASS and route to Decision 037 with explicit "INSUFFICIENT_VOLUME" flag for R-2. Default: (b) per master plan §7 R3 — Decision 037 can still be authored as DEFER-V2.7 with surfaced root cause.

4. **11.7 commit harness permission check.** Per master plan §7 R6, the bundled commit at 11.7 may fail if harness permission cache lacks Bash(git commit:*). If it fails, the orchestrator stages-but-defers-commit to the v2.6→v2.7 transition session per Decision 036 bundled-commit pattern — no user confirmation needed (user standing grant 2026-04-28 covers autonomous commit + tag).

5. **Effort-routing skill cold-start will persist through Phase 11 unless scaffolded.** Re-run npx tsx scripts/effort-routing/recommend.ts after skill is scaffolded (same gap as phase-9-routing-brief.md §7 Q1 and phase-10-routing-brief.md §7 Q1). No CF needed; log as orchestrator check post-11.3.
