---
title: Phase 12 Master Plan — v2.7 SC-39 ENABLE_RETRY (W-1 Discovery + Fix + Re-Measure) + 7-CF Burndown
phase: 12
version: v2.7
status: DRAFT_FOR_RATIFICATION
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, post-v2.6-tag session)
authoring_date: 2026-04-28
prior_phase: 11 (v2.6 closed; commit 230929e + tag v2.6 LIVE on disk; 4 git commits = init / v2.5 / signoff / v2.6)
authority:
  - PROJECT_CHARTER.md (immutable invariants; especially Principle 8 reusable-without-forking)
  - Decision 027 §"Consequences" 8 (scaffold-now-execute-later remains binding)
  - Decision 032 (D1-D6 effort routing; D2 justifications mandatory for opus/medium+; D5 logging)
  - Decision 033 §"Deliberation E" (multi-cycle structural-defer pattern; CF-DOGFOOD-2 + F-2 inheritance)
  - Decision 036 BINDING (bundled-commit pattern; v2.7 = single commit at phase close)
  - Decision 037 BINDING (SC-39 DEFER-V2.7; W-1/W-2/W-3/W-4 framework gates v2.7 ENABLE_RETRY)
  - Decision 039 BINDING (CF-DOGFOOD-2 DEFER-V2.7; R-039.1..R-039.5 framework)
  - audits/f2-self-evolution-disposition-v2.6.md (F-2-R1..F-2-R3 framework; gated mechanically on SC-39)
inputs_consumed:
  - PROJECT_CHARTER.md (immutable invariants)
  - agent-workspace/memory/phase-11-complete.md (definitive v2.6 close attestation; §3 carryforward closure)
  - agent-workspace/memory/carryforwards-v2.7.md (working list; 7 CFs + housekeeping nitpicks)
  - agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md (W-1/W-2/W-3 framework + §6 W-1-A..W-1-D candidates)
  - agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md (R-039.1..R-039.5 gate)
  - agent-workspace/memory/audits/f2-self-evolution-disposition-v2.6.md (F-2-R1..F-2-R3 gate)
  - agent-workspace/memory/decisions/036-v2.4-v2.5-bundled-commit.md (bundled-commit precedent)
  - agent-workspace/memory/decisions/032-effort-routing.md (D1-D6 dispatch policy)
  - agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md (R-1 FAIL evidence)
  - agent-workspace/memory/observations/task-11.5.2-20260428-impl.md (Δ1-Δ4 deliverables status)
  - agent-workspace/memory/observations/task-11.5.2-20260428-spec-compliance.md (PASS_WITH_CONCERNS 14/14)
  - agent-workspace/memory/observations/task-11.5.2-20260428-code-quality.md (APPROVED_WITH_CONCERNS 6 CFs; 3 routed v2.7)
  - agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md (structural template; 1042 LOC)
  - agent-workspace/constitution/architecture.md §"Decomposition Cost Model" (PARALLELIZE gate)
  - agent-workspace/constitution/session-budgets.md (250K hard cap; wind-down at 200K real)
  - scripts/hooks/dispatch-jsonl-recorder.sh (W-1 fix target; lines 33 + 29 (regex sites))
  - tests/integration/sc39-production-pairing-rate.spec.ts (W-1 verification regression surface; Case 1 currently expected-FAIL)
  - scripts/audit/settings-version-check.sh (CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES target)
  - agent-workspace/memory/dispatch.jsonl (W-2 baseline = 23 DISPATCHED rows / 170 total rows captured 2026-04-28 at Phase 12 entry)
  - (no phase-11-routing-recommendations.md present at v2.7 plan-authoring time — Phase 0.5 telemetry-rollup-aware step skipped silently)
i6_compliance: zero git commits across 12.0–12.7; v2.7 stages at final-substage close (12.8) with bundled commit per Decision 036 precedent + user standing grant 2026-04-28 ("autonomous mode = autonomous until DONE ALL — incl. git commit/tag/release")
budget_estimate_tokens: 850000
budget_ceiling_tokens: 920000
expected_sessions: 9
expected_calendar_days: 4
parallel_opportunities: [12.7a || 12.7b || 12.7c (housekeeping nitpicks; disjoint-file)]
critical_path: 12.0 -> 12.1 -> 12.2 -> 12.3 -> 12.4 -> 12.5 -> 12.6 -> 12.7 -> 12.8
---

# Phase 12 Master Plan — v2.7 SC-39 ENABLE_RETRY (W-1 Discovery + Fix + Re-Measure) + 7-CF Burndown

> Phase 12 is the v2.7 SC-39 enablement attempt. Its theme is **empirical
> discovery before fix**: the W-1 prerequisite (Decision 037 §5) requires
> capturing the *actual* `tool_response.content[0]` shape from a real Claude
> Code Agent dispatch — knowable only from a live session, not from the
> codebase. v2.7 leads with a one-shot capture probe at substage 12.1 entry,
> then selects a W-1 candidate (W-1-A through W-1-D per Decision 037 §6),
> implements the fix at 12.2, accumulates W-2 natural volume across
> intervening substages, re-measures W-3 at 12.4, authors Decision 040
> (ENABLE_RETRY OR DEFER-V2.8) at 12.5, gates F-2 scaffold at 12.6,
> housekeeps the 4 quality CFs in parallel-safe 12.7, and closes with
> bundled v2.7 commit at 12.8. I-6 ABSOLUTE preserved (Decision 020).

---

## §0 Phase Identity + Scope + Success Criteria

### §0.1 Strategic Theme

*"Discover the real Agent tool result format; fix W-1; re-measure; bind
ENABLE_RETRY (or DEFER-V2.8 with surfaced upstream blocker); housekeep
4 quality CFs; bundle a single v2.7 commit at phase close."*

The v2.7 cycle is the third attempt to enable SC-39 (the unknown_agent
fraction + pairing-rate self-evolution loop) following Decisions 034
(DEFER-V2.5) → 035 (DEFER-V2.6) → 037 (DEFER-V2.7). Decision 037 fully
diagnosed the v2.6 failure: `dispatch-jsonl-recorder.sh:33` regex
`/agentId:\s*([a-f0-9]{10,20})/i` does not match real Claude Code Agent
tool result text. v2.7's job is to discover the *real* format and fix
the extraction mechanism, then verify (V1a/V1b), accumulate volume,
re-measure, and adjudicate.

### §0.2 In-Scope (7 CFs + 3 Cosmetic)

**Multi-cycle structural-defer (renewed v2.6 → v2.7)**:
1. **CF-DOGFOOD-2** — Decision 039 R-039.1..R-039.5 gate; *re-evaluated at
   12.0 entry against v2.7 master plan*.
2. **SC-39 W-framework** — Decision 037 W-1/W-2/W-3 gate; **the load-bearing
   v2.7 work** (substages 12.1 → 12.5).
3. **F-2 self-evolution signal-extension** — F-2-R1..F-2-R3 gate; mechanically
   gated on SC-39 verdict (substage 12.6).

**Surfaced from Decision 037 + 11.5.2 review**:
4. **CF-V2.7-SC39-W1-AGENTID-EXTRACTION** — empirical format discovery + fix
   (substages 12.1 + 12.2).
5. **CF-V2.7-SC39-W2-NATURAL-VOLUME** — passive accumulation gate (substage
   12.3 measurement; ≥50 dispatches + ≥10K events).
6. **CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES** — 3 quality fixes in
   `scripts/audit/settings-version-check.sh` (HASH-CRLF + BASH-STRICT-MODE +
   HASH-UNAVAILABLE) (substage 12.7).
7. **CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE** — `poll_lines()` 15s timeout
   nitpick (substage 12.7).

**Cosmetic minor from 11.7 verifier (3 items routed v2.7 housekeeping)**:
- (cosm-1) `phase-11-complete.md §6` cites `oss-readiness.sh` without
  `scripts/audit/` path prefix.
- (cosm-2) Staged file count drift (48 vs 49) at 11.7 close.
- (cosm-3) `CF-V2.6-10.1-FAIL-COUNT-DEAD` CF naming clarity.

### §0.3 Out of Scope (explicit)

- Community OSS launch (NPM publish + GitHub public-flip + README community
  section). Phase 13/v2.8+ work; deferred per Decision 027 §C.
- Multi-user adoption rollout. Phase 13/v2.8+ work; gated on tenancy-model
  hardening per Phase 8.6 deferred items.
- New strategic dimensions (Decision 027's 8-dimension framing remains
  structurally satisfied; v2.7 does NOT advance new dimensions, only
  closes residue and attempts SC-39).
- F-2 scaffold IF SC-39 verdict = DEFER-V2.8 (per F-2-R1 gate; substage
  12.6 gate-logic inversion below).
- IMP-1 deferred items from Phase 6.3 (still gated on Decision 023 supersession
  schedule; not on v2.7 critical path).

### §0.4 Success Criteria (Phase 12 close)

- [ ] **SC-1**: All 7 v2.7 carryforwards CLOSED OR explicitly DEFER-V2.8
      with binding decision + re-attempt-prereq framework.
- [ ] **SC-2**: W-1 verification — at least one of (V1a) `dispatch.jsonl`
      COMPLETED row with `toolu_*` `dispatch_id` AND matching `tool_use_id`,
      OR (V1b) PostToolUse-Agent stderr/audit log showing non-empty
      `RESULT_AGENT_ID`. **OR** Decision 040 = DEFER-V2.8 with cited upstream
      blocker.
- [ ] **SC-3**: W-2 measurement — `dispatch.jsonl` DISPATCHED rows ≥
      baseline + 50 (i.e., ≥ **73 total rows**, baseline=23 captured
      2026-04-28); total events (component-telemetry.jsonl + dispatch.jsonl)
      ≥ baseline + 10000.
- [ ] **SC-4**: W-3 re-measure artifacts produced with v2.7-suffix names
      (`unknown-agent-bucket-prevalence-v2.7.json`,
      `cf21-real-dispatch-sample-v2.7.json`, `sc39-prereq-volume-v2.7.md`).
      Each reports `gate_verdict=PASS` (under ENABLE_RETRY path) or explicit
      FAIL/INSUFFICIENT_VOLUME (under DEFER-V2.8 path).
- [ ] **SC-5**: Decision 040 BINDING authored (v2.7 SC-39 verdict =
      ENABLE_RETRY OR DEFER-V2.8) with explicit W-1/W-2/W-3 evidence
      citations per Decision 037 §5 W-4.
- [ ] **SC-6**: F-2 disposition recorded — IF Decision 040 = ENABLE_RETRY:
      `decisions/041-f2-scaffold-v2.7.md` BINDING + initial schema
      extension landed; IF DEFER-V2.8: `audits/f2-self-evolution-disposition-v2.7.md`
      with F-2-R1..F-2-R3 re-defer rationale.
- [ ] **SC-7**: 4 settings-version-check / poll-lines housekeeping fixes
      LANDED with reviewer code-quality APPROVED.
- [ ] **SC-8**: 3 cosmetic minor items (cosm-1 / cosm-2 / cosm-3) addressed
      OR explicitly defer-with-rationale documented.
- [ ] **SC-9**: Post-phase 8/8 CLASS-A gates GREEN; oss-readiness.sh exit 0;
      `pnpm test` PASS (test count ≥ baseline 1512); `pnpm typecheck` exit 0;
      `pnpm lint` exit 0.
- [ ] **SC-10**: I-6 ABSOLUTE — `git log --oneline | wc -l` = 4 (baseline)
      across substages 12.0–12.7; bundled v2.7 commit at 12.8 advances to 5.
- [ ] **SC-11**: Whole-phase sandwich-verifier APPROVED OR
      APPROVED_WITH_CONCERNS (no critical) at 12.8.

---

## §1 Substage Decomposition (12.0 → 12.8)

### 12.0 — Phase 12 routing brief + R-039 gate re-evaluation

- **substage_id**: 12.0
- **scope_summary**: Read this master plan; partition the 7 v2.7 CFs +
  3 cosmetic items by substage; ratify per-substage routing; explicitly
  re-evaluate Decision 039 R-039.1..R-039.5 against the v2.7 master plan
  and record disposition (CF-DOGFOOD-2 → DEFER-V2.8 default OR FIX_INLINE
  if any R-039 fires); explicitly re-evaluate F-2-R1..F-2-R3 (default
  GATED on Decision 040 outcome, see §1 12.6); list v2.8 deferral
  candidates explicitly. Mirrors `phase-11-routing-brief.md` schema.
- **primary_carryforwards**: [routing meta-task; surfaces CF-DOGFOOD-2
  + F-2 disposition holding-pattern]
- **input_files** (read): [`agent-workspace/session-plans/pending/phase-12-v2.7-sc39-enable-retry.md`
  (this file), `agent-workspace/memory/phase-11-complete.md`,
  `agent-workspace/memory/carryforwards-v2.7.md`,
  `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`,
  `agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md`,
  `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.6.md`,
  `agent-workspace/memory/phase-11-routing-brief.md` (template),
  `agent-workspace/memory/budget-tracker.md` (Phase 11 actuals: ~775K
  vs 880K estimate)]
- **output_files** (write): [`agent-workspace/memory/phase-12-routing-brief.md`]
- **recommended_dispatch_count**: 1 (task-implementer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: routing-doc authoring; mechanical synthesis over
    phase-11-complete §3 + this master plan + 3 prerequisite framework
    docs (037 / 039 / f2-disposition-v2.6); no judgment-density justifying
    opus. Pattern matches 11.0 substage (estimated 60K, actual ~60K).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per
    Decision 032).
- **reviewer_pairs**: none — routing brief is doc-only; sandwich-architect
  ratification optional and skipped by default per Phase 11 precedent.
- **blockers**: none — first substage.
- **parallel_safe_with**: [] — gates all downstream substages.
- **estimated_budget_K**: 60
- **acceptance_gate**: `phase-12-routing-brief.md` exists; ≥6 substage
  families enumerated; budget sums verified ≤920K; ≥1 v2.8 deferral
  candidate named; effort-routing skill consultations logged for ≥3
  substages (D5 compliance per Decision 032); D4 concurrency-cap check
  passes (no plan moment exceeds 4 concurrent or 2 opus/* in-flight);
  R-039.1..R-039.5 re-evaluated with explicit verdict line per row;
  F-2-R1..F-2-R3 re-evaluated with default-DEFER framing.

---

### 12.1 — W-1 EMPIRICAL FORMAT DISCOVERY (Day-0 capture probe)

> **CRITICAL DESIGN NOTE**: This substage MUST run BEFORE any other v2.7
> work. The W-1 fix candidate (W-1-A / W-1-B / W-1-C / W-1-D per Decision
> 037 §6) cannot be selected without empirical knowledge of what Claude
> Code actually emits in `tool_response.content[0].text` and the full
> `tool_response.content[0]` object. Capture-from-codebase is structurally
> impossible per Decision 037 §3.1 Level 2 root cause analysis.

- **substage_id**: 12.1
- **scope_summary**: Add a one-shot capture probe to
  `scripts/hooks/dispatch-jsonl-recorder.sh` PostToolUse-Agent branch (or
  a sidecar capture script) that, on a single real Agent tool dispatch,
  writes the full `tool_response.content[0]` object AND the bare
  `.text` value to `agent-workspace/research/agent-tool-result-format.md`
  with timestamps + Claude Code version metadata. Dispatch a real Agent
  tool call (e.g., a trivial `research-scanner` query) to trigger the
  probe; remove the probe immediately after capture (revert the
  one-shot instrumentation). Author a short discovery note in
  `research/agent-tool-result-format.md` (≥80 LOC) summarizing: (a) the
  raw text shape; (b) the structured object shape; (c) which Decision
  037 §6 candidate (W-1-A / W-1-B / W-1-C) is feasible; (d) explicit
  statement if NONE are feasible (escalation: Decision 040 = DEFER-V2.8
  with cited upstream blocker; option B fallback gate fires at 12.5).
- **primary_carryforwards**: [`CF-V2.7-SC39-W1-AGENTID-EXTRACTION` discovery leg]
- **input_files** (read): [`agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`
  §6 (W-1-A..W-1-D candidates), `scripts/hooks/dispatch-jsonl-recorder.sh`
  (lines 29-36 + lines 64-87 — the PostToolUse-Agent branch),
  `agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md`
  (the R-1 FAIL evidence shape — guides what to capture)]
- **output_files** (write): [`agent-workspace/research/agent-tool-result-format.md`
  (NEW; capture artifact + discovery note ≥ 80 LOC),
  `scripts/hooks/dispatch-jsonl-recorder.sh` (one-shot probe added then
  reverted in same substage — net diff ≈ 0 LOC),
  `agent-workspace/memory/observations/task-12.1-20260428-w1-discovery.md`
  (implementer report)]
- **recommended_dispatch_count**: 1 (task-implementer; no reviewer pair
  — research/discovery substage; review folds into 12.2 architect spec)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: discovery work; mechanical hook instrumentation +
    structured capture-and-report. Judgment-density LOW (the candidates
    W-1-A..W-1-D are pre-bounded by Decision 037 §6); the discovery is
    *empirical*, not deliberative. Pattern matches 11.5.1 R-1 probe
    (sonnet/medium, ~30K probe + report).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default
    per Decision 032).
- **reviewer_pairs**: [] — discovery substage; review at 12.2 architect spec.
- **blockers**: depends on 12.0 (routing brief).
- **parallel_safe_with**: [] — gates 12.2 (W-1 fix needs discovery output).
- **estimated_budget_K**: 60
- **acceptance_gate**: `agent-workspace/research/agent-tool-result-format.md`
  exists ≥ 80 LOC with: (a) raw `.text` value verbatim; (b) full
  `content[0]` object structured dump; (c) explicit statement of which
  Decision 037 §6 candidate is feasible (W-1-A regex update / W-1-B
  SubagentStop pivot / W-1-C structured-field parse); OR explicit
  statement that NONE are feasible (triggers 12.5 Option B fallback).
  `dispatch-jsonl-recorder.sh` diff at substage close = 0 LOC (probe
  reverted; capture artifact preserved). `pnpm test` PASS (no
  regression from probe-add-and-revert cycle). `git diff --stat scripts/hooks/`
  → only test-fixture edits if any (no production-code changes net).

---

### 12.2 — W-1 FIX LANDING (architect + IMPL + reviewer pairs)

- **substage_id**: 12.2
- **scope_summary**: Based on 12.1 discovery, select and implement ONE
  Decision 037 §6 candidate. Two-leg dispatch: (leg A) sandwich-architect
  authors a fix spec ≥ 200 LOC at
  `agent-workspace/session-plans/pending/12.2-w1-fix-architect.md` —
  selects candidate, defines acceptance gate, lists touched files +
  expected LOC delta; (leg B) task-implementer lands the fix per spec
  (single `dispatch-jsonl-recorder.sh` edit; ≤ 80 LOC delta) AND updates
  the `tests/integration/sc39-production-pairing-rate.spec.ts` JSDoc
  `@note` block (lines 25-28) from "expected to FAIL" to "expected to
  PASS" once V1a/V1b verified inline. Includes ad-hoc verification probe
  during IMPL: dispatch a real Agent call, read dispatch.jsonl tail,
  confirm a COMPLETED row with `toolu_*` `dispatch_id` + matching
  `tool_use_id`. Reviewer pairs: spec-compliance + code-quality.
- **primary_carryforwards**: [`CF-V2.7-SC39-W1-AGENTID-EXTRACTION` fix leg]
- **input_files** (read): [`agent-workspace/research/agent-tool-result-format.md`
  (12.1 discovery output — defines candidate selection),
  `scripts/hooks/dispatch-jsonl-recorder.sh` (current state),
  `tests/integration/sc39-production-pairing-rate.spec.ts` (regression surface),
  `tests/hooks/dispatch-recorder.spec.ts` (unit-test surface),
  `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md` §6 (candidates)]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/12.2-w1-fix-architect.md`
      (NEW architect spec, ≥ 200 LOC),
    `scripts/hooks/dispatch-jsonl-recorder.sh` (W-1 fix; ≤ 80 LOC delta),
    `tests/hooks/dispatch-recorder.spec.ts` (test fixtures updated to
      match real format from 12.1),
    `tests/integration/sc39-production-pairing-rate.spec.ts` (JSDoc
      @note flip; possibly Case 1 fixture realignment),
    `agent-workspace/memory/observations/task-12.2-20260428-w1-fix-impl.md`,
    `agent-workspace/memory/observations/task-12.2-20260428-spec-compliance.md`,
    `agent-workspace/memory/observations/task-12.2-20260428-code-quality.md`
  ]
- **recommended_dispatch_count**: 4 (sandwich-architect + task-implementer
  + spec-compliance-reviewer + code-quality-reviewer)
- **recommended_(model, effort)**:
  - sandwich-architect: (opus, medium)
  - task-implementer: (sonnet, medium)
  - spec-compliance-reviewer: (sonnet, medium)
  - code-quality-reviewer: (sonnet, medium)
  - **rationale**: structural fix to load-bearing hook script; touches
    correlation mechanism gating SC-39. Architect leg is judgment-dense
    (selecting between 4 pre-bounded candidates given 12.1 empirical
    output). IMPL leg is bounded by spec (≤80 LOC). Pattern matches 11.5.1
    architect (opus/medium, planned 80K, actual ~80K) + 11.5.2 IMPL
    (sonnet/medium, ~100K).
  - **D2 justification (architect opus/medium)**: "W-1 fix candidate
    selection binds future SC-39 ENABLE_RETRY measurement; cross-references
    Decision 037 §6 four candidates; affects the production-vs-fixture
    test surface (`sc39-production-pairing-rate.spec.ts` Case 1 inverts
    expectation). NOT max because Decision 037 §6 already pre-bounded
    the candidate space + 12.1 empirical discovery shrinks it further."
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet,
  effort: medium}, {post_dispatch_role: code-quality, model: sonnet,
  effort: medium}] — both fire serially after IMPL.
- **blockers**: depends on 12.1 (discovery output gates candidate selection).
- **parallel_safe_with**: [] — strictly serialized; W-1 verification
  (V1a/V1b inline at IMPL close) gates W-2/W-3 measurement.
- **estimated_budget_K**: 160 (80K architect + 60K IMPL + 20K reviewers)
- **acceptance_gate**: architect spec exists ≥ 200 LOC + ratifies one
  Decision 037 §6 candidate; `dispatch-jsonl-recorder.sh` diff is ≤ 80
  LOC; `pnpm test` PASS (no test-count regression; dispatch-recorder
  unit tests pass with realigned fixtures); `pnpm typecheck && pnpm lint`
  exit 0; **(V1a) verified inline**: dispatch.jsonl tail shows ≥ 1
  COMPLETED row with `dispatch_id` matching `^toolu_` AND `tool_use_id`
  same value; OR **(V1b) verified**: PostToolUse-Agent stderr capture
  shows non-empty `RESULT_AGENT_ID` for a real Agent dispatch;
  spec-compliance verdict PASS or PASS_WITH_CONCERNS (no critical);
  code-quality verdict APPROVED or APPROVED_WITH_CONCERNS (no critical);
  `tests/integration/sc39-production-pairing-rate.spec.ts` Case 1
  expectation flipped to PASS-on-PASS path with JSDoc note updated.

---

### 12.3 — W-2 NATURAL VOLUME GATE (passive accumulation + measurement)

- **substage_id**: 12.3
- **scope_summary**: Passive volume accumulation across all v2.7 substages
  + active measurement at 12.3 close. W-2 thresholds (Decision 037 §5
  W-2): ≥ 50 real Agent-tool DISPATCHED events AND total events ≥ 10,000.
  Baseline at Phase 12 entry (captured 2026-04-28): **23 DISPATCHED rows
  in dispatch.jsonl** + total events not yet enumerated for this measure.
  W-2 acceptance: dispatch.jsonl rows ≥ baseline + 50 = **≥ 73 DISPATCHED
  rows**; total events ≥ baseline + 10000. If baseline-pace insufficient,
  12.3 substage explicitly extends accumulation window via additional
  dispatch-heavy substages (e.g., dispatch a research-scanner sweep, or
  additional code-quality-reviewer batches). 12.3 produces measurement
  artifact only — no engineering action beyond accumulation control.
- **primary_carryforwards**: [`CF-V2.7-SC39-W2-NATURAL-VOLUME`]
- **input_files** (read): [`agent-workspace/memory/dispatch.jsonl`
  (rolling — read at 12.3 measurement time),
  `agent-workspace/memory/component-telemetry.jsonl` (rolling),
  `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md` §5 W-2,
  `agent-workspace/memory/audits/sc39-prereq-volume-v2.5.md` (template),
  `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.5.json` (template)]
- **output_files** (write): [`agent-workspace/memory/audits/sc39-prereq-volume-v2.7.md`
  (W-3 deliverable #3 produced here; threshold gate evaluated),
  `agent-workspace/memory/observations/task-12.3-20260428-w2-volume-measure.md`]
- **recommended_dispatch_count**: 1 (task-implementer; sandwich-verifier
  not needed for measurement-only artifact)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: measurement-only; bash + jq counting tasks; no
    judgment density. Pattern matches 11.5.2 (sonnet/medium, ~100K with
    artifact production overhead).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default
    per Decision 032).
- **reviewer_pairs**: [] — sandwich-verifier consolidates at 12.5.
- **blockers**: depends on 12.2 W-1 PASS (V1a/V1b verified). If W-1 FAIL
  at 12.2 close, skip 12.3 entirely and proceed to 12.5 Option B fallback
  (Decision 040 = DEFER-V2.8).
- **parallel_safe_with**: [] — sequential measurement.
- **estimated_budget_K**: 60
- **acceptance_gate**: `sc39-prereq-volume-v2.7.md` exists with
  fields `dispatched_count_total`, `dispatched_count_post_baseline`,
  `events_total`, `events_post_baseline`, `gate_verdict` (PASS /
  INSUFFICIENT_VOLUME / FAIL). PASS requires: dispatched_count_total
  ≥ 73 (baseline 23 + 50 floor); events_total ≥ baseline + 10000.
  If INSUFFICIENT_VOLUME: 12.3 explicitly extends accumulation via
  +30K dispatch-heavy follow-on (e.g., trigger 12.7 housekeeping
  earlier than its planned slot to drive volume); re-measure;
  if still INSUFFICIENT_VOLUME after extension, route to 12.5 with
  partial-MET framing (Decision 040 = DEFER-V2.8 for W-2 INSUFFICIENT_VOLUME
  even if W-1 PASS).

---

### 12.4 — W-3 RE-MEASURE (artifact production at v2.7-suffix names)

- **substage_id**: 12.4
- **scope_summary**: Produce W-3 measurement artifacts per Decision 037
  §5 W-3: (1) `unknown-agent-bucket-prevalence-v2.7.json` — threshold
  `fraction < 0.30`; (2) `cf21-real-dispatch-sample-v2.7.json` — threshold
  `pairing_rate ≥ 0.40` on `sample_size ≥ 50`; (3) `sc39-prereq-volume-v2.7.md`
  — threshold `total_events ≥ 10000` (already produced at 12.3 — read &
  reference; do not re-author). Plus must-stay-PASS confirmation for
  Decision 034 inherited prereqs 4–6 (`phase-12-rule-eval.md`,
  `cf33-state-v2.7.md`). All artifacts MUST report `gate_verdict=PASS`
  for ENABLE_RETRY path.
- **primary_carryforwards**: [SC-39 W-3 leg]
- **input_files** (read): [post-W-1-fix telemetry on disk (dispatch.jsonl
  + component-telemetry.jsonl); `agent-workspace/memory/audits/sc39-prereq-volume-v2.7.md`
  (12.3 output); v2.5/v2.6 template artifacts;
  `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md` §5 W-3]
- **output_files** (write): [
    `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.7.json` (NEW),
    `agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.7.json` (NEW),
    `agent-workspace/memory/audits/phase-12-rule-eval.md` (must-stay-PASS for prereq 6),
    `agent-workspace/memory/audits/cf33-state-v2.7.md` (must-stay-PASS for prereq 5),
    `agent-workspace/memory/observations/task-12.4-20260428-w3-artifacts.md`
  ]
- **recommended_dispatch_count**: 1 (task-implementer; sandwich-verifier
  consolidates at 12.5)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: artifact-collection task; mirrors 11.5.2 stage
    (sonnet/medium, ~100K). Decision authorship moves to 12.5 (per Phase 11
    split between artifact production and decision authorship).
  - **D2 justification**: NOT REQUIRED (sonnet/medium D1 default).
- **reviewer_pairs**: [] — sandwich-verifier at 12.5.
- **blockers**: depends on 12.3 (W-2 PASS or INSUFFICIENT_VOLUME measured).
- **parallel_safe_with**: [] — sequential measurement.
- **estimated_budget_K**: 80
- **acceptance_gate**: 4 artifact files exist + report `gate_verdict`
  per spec; under PASS path: `cf21-real-dispatch-sample-v2.7.json`
  pairing_rate ≥ 0.40 on sample_size ≥ 50;
  `unknown-agent-bucket-prevalence-v2.7.json` fraction < 0.30;
  prereqs 5/6 must-stay-PASS. Under FAIL path: explicit FAIL recorded
  + root cause cited (e.g., "W-1 fix landed but pairing_rate=0.32 below
  0.40 threshold; metric moved but didn't clear gate"; Decision 040
  authoring at 12.5 cites this).

---

### 12.5 — DECISION 040: SC-39 v2.7 VERDICT (ENABLE_RETRY OR DEFER-V2.8) + sandwich-verifier

> **OPTION B FALLBACK GATE**: If 12.1 discovery surfaced NO feasible
> Decision 037 §6 candidate (e.g., Claude Code emits no correlation
> field in any form), 12.2 fails the architect-spec acceptance gate and
> 12.3/12.4 are skipped. 12.5 fires immediately with Decision 040 =
> DEFER-V2.8 + cited upstream blocker (e.g., "Claude Code Agent tool
> result format requires upstream change to expose correlation field;
> filed upstream issue X; SC-39 ENABLE_RETRY blocked on Y"). This is the
> Option B fallback specifically required by the Phase 12 entry brief.

- **substage_id**: 12.5
- **scope_summary**: Author Decision 040 with binding verdict
  ENABLE_RETRY (if W-1 + W-2 + W-3 all PASS per Decision 037 §5 W-4)
  OR DEFER-V2.8 (if any of W-1/W-2/W-3 = FAIL or INSUFFICIENT_VOLUME).
  Decision 040 MUST cite each W-prereq evidence explicitly (V1a/V1b
  artifact + DISPATCHED count + 3 measurement artifact verdicts) per
  Decision 037 §5 W-4 spec. Confirm Decision 034 inherited prereqs 4–6
  must-stay-PASS. Then sandwich-verifier opus/medium runs adversarial
  review against the full 12.1–12.4 substage outputs (12.1 discovery
  artifact, 12.2 W-1 fix, 12.3 volume artifact, 12.4 W-3 artifacts,
  Decision 040). DEFER-V2.8 path: author decision + W-1' / W-2' / W-3'
  framework for v2.8 (mirrors Decision 037 §5 supersession shape).
- **primary_carryforwards**: [SC-39 W-4 verdict; Decision 040 BINDING]
- **input_files** (read): [post-12.1 + post-12.2 + post-12.3 + post-12.4
  outputs; `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`
  (the supersession target); Decision 037 §5 W-1/W-2/W-3/W-4 framework]
- **output_files** (write): [`agent-workspace/memory/decisions/040-sc39-retry-verdict-v2.7.md`
  (NEW, BINDING; ENABLE_RETRY OR DEFER-V2.8),
  `agent-workspace/memory/observations/task-12.5-20260428-sandwich-verifier.md`]
- **recommended_dispatch_count**: 2 (opus/medium for Decision 040 +
  opus/medium sandwich-verifier)
- **recommended_(model, effort)**: (opus, medium) for both.
  - **rationale**: binding-decision authoring with explicit prereq
    citations; risk of confirmation bias requires adversarial follow-up;
    pattern matches 11.5.3 Decision 037 + sandwich-verifier (opus/medium ×2,
    actual ~130K).
  - **D2 justification (Decision 040)**: "supersedes Decision 037
    DEFER-V2.7; verdict binds future SC-39 attempts and gates F-2
    self-evolution scaffolding (substage 12.6); explicit author-ack of
    all W-1/W-2/W-3 prerequisites cited as MET (or partial-MET with
    explicit reasoning + W-1'/W-2'/W-3' v2.8 framework). NOT max because
    alternatives are pre-defined (ENABLE_RETRY / DEFER-V2.8) and the
    Decision 037 §5 framework template is on disk."
  - **D2 justification (sandwich-verifier)**: "adversarial review of
    binding decision touching SC-39, F-2 gating (substage 12.6), and 4+
    telemetry artifacts; opus/medium needed for tradeoff analysis matching
    the Decision 037 deliberation-class. NOT max because verifier scope is
    bounded by the substage's deliverables."
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus,
  effort: medium}]
- **blockers**: depends on 12.4 (W-3 artifacts produced) OR 12.1 Option B
  fallback (no feasible candidate).
- **parallel_safe_with**: [] — strictly serialized; gates 12.6 F-2.
- **estimated_budget_K**: 130 (Decision 040 ~60K + sandwich-verifier ~70K)
- **acceptance_gate**: Decision 040 BINDING authored with explicit verdict
  (ENABLE_RETRY / DEFER-V2.8); if ENABLE_RETRY: cites V1a/V1b + DISPATCHED
  count + 3 W-3 artifact verdicts each = PASS; if DEFER-V2.8: cites
  residual prereq + W-1'/W-2'/W-3' v2.8 framework with mirror-shape
  template; sandwich-verifier verdict APPROVED or APPROVED_WITH_CONCERNS
  (no critical); supersession statement vs Decision 037 explicit.

---

### 12.6 — F-2 GATED-SCAFFOLD (SC-39-conditioned; gate logic INVERTED vs Phase 11)

> **GATE LOGIC INVERSION (vs Phase 11 §11.6)**: Phase 11 master plan §11.6
> said: "scaffold-IF-ENABLE / re-defer-IF-DEFER". Phase 12 inverts to:
> **scaffold-IF-ENABLE / DEFER-V2.8-IF-DEFER**. Rationale: F-2 has
> already-deferred 3+ cycles (Phase 8 → v2.5 → v2.6 → v2.7); under another
> DEFER, the natural roll is V2.8 not back to V2.7. This matches Decision
> 033 §"Deliberation E" multi-cycle structural-defer pattern.

- **substage_id**: 12.6
- **scope_summary**: F-2 (self-evolution signal-extension) is gated on
  SC-39 enabling per `audits/f2-self-evolution-disposition-v2.6.md`
  F-2-R1..F-2-R3.
  - **IF Decision 040 verdict = ENABLE_RETRY** AND F-2-R2 (≥ 5 real
    proposals across ≥ 1 phase with proposal acceptance/rejection metadata
    in component-telemetry) MET AND F-2-R3 (rollup spec authored) MET:
    scaffold F-2: extend `packages/core/src/telemetry/rollup-telemetry.ts`
    schema with the agent-type-distribution, paired-correlation, and
    loop-proposal-acceptance-rate fields per the v2.6 disposition spec;
    author initial F-2 spec in
    `specs/tier1-strategic/f2-self-evolution-signal-extension.md`;
    add minimal scaffolding tests; author `decisions/041-f2-scaffold-v2.7.md`
    BINDING.
  - **IF Decision 040 verdict = DEFER-V2.8** OR F-2-R2/F-2-R3 not yet MET:
    re-defer F-2 to v2.8 — author `audits/f2-self-evolution-disposition-v2.7.md`
    citing F-2-R1' / F-2-R2' / F-2-R3' framework for v2.8 (mirror the
    v2.6 disposition shape).
- **primary_carryforwards**: [F-2 self-evolution signal-extension]
- **input_files** (read): [`agent-workspace/memory/decisions/040-sc39-retry-verdict-v2.7.md`
  (12.5 output; gates F-2),
  `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.6.md`
  (rationale template + F-2-R1..F-2-R3 framework),
  `packages/core/src/telemetry/rollup-telemetry.ts` (target schema),
  `specs/tier1-strategic/` (target dir)]
- **output_files** (write):
  - **IF SC-39 ENABLED**: [`packages/core/src/telemetry/rollup-telemetry.ts`
    (schema extension), `specs/tier1-strategic/f2-self-evolution-signal-extension.md`
    (NEW spec), `tests/telemetry/rollup-telemetry-f2.spec.ts` (NEW
    scaffolding tests),
    `agent-workspace/memory/decisions/041-f2-scaffold-v2.7.md` (BINDING
    — scaffolds-not-implements)]
  - **IF SC-39 DEFERRED-V2.8**: [`agent-workspace/memory/audits/f2-self-evolution-disposition-v2.7.md`
    (re-defer with F-2-R1'/R-2'/R-3' framework for v2.8)]
- **recommended_dispatch_count**: 1 (task-implementer; reviewer pair
  OPTIONAL — code-quality only if scaffolding leg fires)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: schema extension + spec authoring (scaffold path) OR
    short re-defer note (defer path; orchestrator-absorbed possible per
    Phase 11 §11.6 actual ~5K). No D2 needed.
  - **D2 justification**: NOT REQUIRED (sonnet/medium D1 default).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet,
  effort: medium}] — only if scaffolding leg fires (code change to
  rollup-telemetry.ts).
- **blockers**: depends on 12.5 (Decision 040 must exist before F-2 gating
  can fire).
- **parallel_safe_with**: [] — runs after 12.5.
- **estimated_budget_K**: 70 (scaffold path) OR 5 (re-defer path,
  orchestrator-absorbed per Phase 11 §11.6 precedent)
- **acceptance_gate**: F-2 disposition recorded; IF SC-39 ENABLED:
  rollup-telemetry.ts compiles; new scaffolding tests PASS; spec file
  exists; Decision 041 authored; IF SC-39 DEFERRED-V2.8:
  f2-disposition-v2.7.md cites updated F-2-R1'/R-2'/R-3' gate.

---

### 12.7 — HOUSEKEEPING (settings-version-check fixes + cosmetic minor) [PARALLEL-SAFE BATCH]

- **substage_id**: 12.7
- **scope_summary**: Bundled fix-pass for the 4 housekeeping CFs +
  3 cosmetic minor items. Per Phase 11 §11.1 hygiene-batch precedent.
  Sub-tasks are small (≤ 30 LOC each), surgical, disjoint-file. Single
  task-implementer can land them in one dispatch envelope; reviewer pair
  fires once at batch close. Three internal sub-batches are
  parallel-safe with each other if dispatched separately, but default
  is single-implementer serial-batch (Phase 11 §11.1 precedent showed
  serial single-implementer is cheaper than parallel batches for this
  scale).
- **sub-batches**:
  - **12.7a (settings-version-check hash fixes)**:
    - `CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES`:
      - HASH-CRLF-UNSTABLE: add `tr -d '\r'` in `sha256_of_file()` and
        hash retrieval (sh:29-36, 53, 66).
      - BASH-STRICT-MODE-INCOMPLETE: change `set -uo pipefail` → `set -euo pipefail`;
        re-run G8/G9 divergence smoke tests (sh:18).
      - HASH-UNAVAILABLE-FALSE-PASS: change unavailable-hash path to
        `exit 2` with `[SKIP]` message (sh:34-36).
  - **12.7b (poll-lines timeout)**:
    - `CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE`: raise `poll_lines()`
      timeout 15s → 30s OR replace with retry-with-backoff loop in
      `tests/integration/sc39-production-pairing-rate.spec.ts:111` and
      `scripts/audit/settings-version-check.sh poll_lines`.
  - **12.7c (cosmetic minor from 11.7 verifier)**:
    - cosm-1: `phase-11-complete.md §6` add `scripts/audit/` prefix to
      `oss-readiness.sh` references.
    - cosm-2: staged file count drift (48 vs 49) — reconcile in
      `phase-11-complete.md §6` text or note as known-discrepancy.
    - cosm-3: rename `CF-V2.6-10.1-FAIL-COUNT-DEAD` → clearer name
      (e.g., `CF-V2.6-10.1-FAIL-COUNT-REDUNDANT-ACCUMULATOR`) in
      `phase-11-complete.md` + `carryforwards-v2.6.md` historical
      register.
- **primary_carryforwards**: [`CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES`,
  `CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE`, cosm-1/cosm-2/cosm-3]
- **input_files** (read): [`scripts/audit/settings-version-check.sh`,
  `tests/integration/sc39-production-pairing-rate.spec.ts`,
  `agent-workspace/memory/phase-11-complete.md`,
  `agent-workspace/memory/carryforwards-v2.6.md`]
- **output_files** (write): [`scripts/audit/settings-version-check.sh`
  (4 fix-points), `tests/integration/sc39-production-pairing-rate.spec.ts`
  (poll-timeout raise), `agent-workspace/memory/phase-11-complete.md`
  (cosm-1, cosm-2, cosm-3 corrections),
  `agent-workspace/memory/carryforwards-v2.6.md` (cosm-3 rename),
  `agent-workspace/memory/observations/task-12.7-20260428-housekeeping-batch.md`]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: bundled small surgical edits (~5–10 LOC each, ≤ 50
    LOC aggregate); no judgment-density warranting opus; pattern matches
    Phase 11 §11.1 hygiene batch (sonnet/medium, ~120K actual for 11
    fixes; v2.7 batch is smaller at 7 items).
  - **D2 justification**: NOT REQUIRED (sonnet/medium D1 default).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet,
  effort: medium}]
- **blockers**: depends on 12.0 (routing brief). 12.7 may dispatch
  EARLY (alongside 12.3 measurement-extension if 12.3 needs volume
  acceleration) per the §3 12.3 acceptance-gate "INSUFFICIENT_VOLUME
  fallback".
- **parallel_safe_with**: [12.3 measurement-extension only] — disjoint-file
  with all 12.x SC-39 substages (12.7 touches `scripts/audit/`,
  `tests/integration/`, `agent-workspace/memory/`; 12.x SC-39 substages
  touch `scripts/hooks/`, `agent-workspace/research/`,
  `agent-workspace/memory/audits/`, `agent-workspace/memory/decisions/`).
- **estimated_budget_K**: 80 (50K IMPL + 30K reviewer + sub-batch overhead)
- **acceptance_gate**: 4 housekeeping fixes LANDED with concrete diff;
  3 cosmetic minor items addressed OR explicit deferral note; `pnpm test`
  PASS (no test-count regression); `pnpm typecheck && pnpm lint` exit 0;
  G7/G8/G9 acceptance gates re-run on `settings-version-check.sh` after
  fixes; reviewer code-quality verdict APPROVED or APPROVED_WITH_CONCERNS
  (no critical).

---

### 12.8 — PHASE-CLOSE: post-phase verify + v2.7 staging + bundled commit

- **substage_id**: 12.8
- **scope_summary**: Mirror 11.7 closure pattern. Run post-phase.sh 12;
  produce `phase-12-complete.md` attestation; stage v2.7; author
  bundled-commit message per Decision 036 precedent
  (`v2.7: Phase 12 v2.7 SC-39 ENABLE_RETRY + 7-CF burndown`); commit +
  tag at sandwich-verifier APPROVED verdict per user standing grant
  2026-04-28.
- **primary_carryforwards**: [closure attestation; bundled-commit execution]
- **input_files** (read): [`scripts/verify/post-phase.sh`,
  `scripts/audit/oss-readiness.sh`,
  `agent-workspace/memory/decisions/040-sc39-retry-verdict-v2.7.md`,
  `agent-workspace/memory/decisions/041-f2-scaffold-v2.7.md` (if authored
  at 12.6),
  `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.7.md`
  (if 12.6 defer path),
  `agent-workspace/memory/phase-11-complete.md` (template)]
- **output_files** (write): [`agent-workspace/memory/phase-12-complete.md`,
  `.git/COMMIT_EDITMSG_v2.7` (bundled-commit message; ≤72-char subject)]
- **recommended_dispatch_count**: 2 (task-implementer for attestation +
  sandwich-verifier for full-phase adversarial; main session executes
  commit+tag after sandwich-verifier APPROVED)
- **recommended_(model, effort)**: (sonnet, high) for attestation
  authoring; (opus, medium) for sandwich-verifier.
  - **rationale**: post-phase verify + attestation + bundled-commit
    message; mirrors Phase 11 11.7 (sonnet/high planned + opus/medium
    sandwich-verifier; actual ~30K + ~80K).
  - **D2 justification (sandwich-verifier opus/medium)**: "adversarial
    full-phase review touching all 12.x substages, SC-39 W-1/W-2/W-3/W-4
    framework execution, F-2 gating disposition, and 4 housekeeping CFs;
    opus/medium needed for cross-substage charter coherence + invariant
    sweep. NOT max because verifier scope bounded by phase-close
    attestation template (11.7 precedent)."
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus,
  effort: medium}]
- **blockers**: depends on 12.5, 12.6, 12.7 (all CLOSED).
- **parallel_safe_with**: [] — strictly final gate.
- **estimated_budget_K**: 80
- **acceptance_gate**: post-phase.sh 12 exit 0; oss-readiness.sh exit 0;
  `phase-12-complete.md` exists; sandwich-verifier verdict APPROVED OR
  APPROVED_WITH_CONCERNS (no critical); IF APPROVED → main session
  executes `git commit -F .git/COMMIT_EDITMSG_v2.7 && git tag v2.7` per
  user standing grant; IF APPROVED_WITH_CONCERNS, narrow fix cycle ≤ 40K
  before phase advance to v2.8. Final state: `git log --oneline | wc -l`
  = 5 (init / v2.5 / signoff / v2.6 / v2.7); v2.7 fully staged-then-committed.

---

## §2 Critical Path + Parallelism Feasibility Matrix

```
12.0 (sonnet/medium, blocking, 60K)
   │
12.1 (sonnet/medium, 60K) — W-1 EMPIRICAL DISCOVERY (Day-0 capture probe)
   │
12.2 (opus/medium architect + sonnet/medium IMPL + 2 reviewers, 160K) — W-1 FIX
   │
12.3 (sonnet/medium, 60K) — W-2 NATURAL VOLUME GATE
   │
12.4 (sonnet/medium, 80K) — W-3 RE-MEASURE
   │
12.5 (opus/medium ×2, 130K) — Decision 040 + sandwich-verifier
   │
   ├─── 12.6 (sonnet/medium, 70K|5K) — F-2 SCAFFOLD-OR-RE-DEFER
   │
   └─── 12.7 (sonnet/medium, 80K) — HOUSEKEEPING (parallel-safe with 12.3-extension only)
   │
12.8 (sonnet/high + opus/medium, 80K) — PHASE-CLOSE + bundled v2.7 commit
```

**Critical-path length** (sequential, no parallelism):
60 + 60 + 160 + 60 + 80 + 130 + 70 + 80 + 80 = **780K critical-path tokens**.

**With reviewer overhead** (~5% × 7 substage groups): ≈ **820K**.

**Parallel-safe opportunity**: 12.7 housekeeping CAN dispatch alongside
12.3 IF 12.3 is in INSUFFICIENT_VOLUME-extension state (12.7 dispatches
contribute to dispatch-count accumulation). This is the only meaningful
parallel slot. All other substages strictly serialize (W-1 fix gates W-2
measure gates W-3 re-measure gates Decision 040 gates F-2 gates phase
close).

**Total token spend** (sum, no parallelism subtraction):
60 + 60 + 160 + 60 + 80 + 130 + 70 + 80 + 80 = **780K** + reviewer
overhead 5% = **820K**. With 30K contingency for INSUFFICIENT_VOLUME
extension or ≤ 40K narrow-fix cycle = **mid-estimate 850K** (within
920K ceiling per session-budgets.md).

**Wind-down semantics**: per session-budgets.md, 200K real-transcript
tokens triggers wind-down. 12.2 + 12.5 are both ≥ 130K stages — each
must own a clean checkpoint BEFORE start (not just after). The 780K
critical-path IS DESIGNED to span ≥ 4 sessions naturally.

**Forbidden parallelism**: 12.1 → 12.2 → 12.3 → 12.4 → 12.5 are
strictly serialized (W-1/W-2/W-3/W-4 framework dependency chain).
12.6 cannot run in parallel with 12.5 because F-2 gate depends on
Decision 040. 12.8 strictly final.

---

## §3 File-Edit Collision Matrix (12.7 vs 12.x SC-39 substages)

| Path/file | 12.1 | 12.2 | 12.3 | 12.4 | 12.5 | 12.6 | 12.7 |
|---|---|---|---|---|---|---|---|
| `scripts/hooks/dispatch-jsonl-recorder.sh` | TEMP_PROBE_REVERT | WRITE | — | — | — | — | — |
| `tests/hooks/dispatch-recorder.spec.ts` | — | WRITE | — | — | — | — | — |
| `tests/integration/sc39-production-pairing-rate.spec.ts` | — | WRITE | — | — | — | — | OPTIONAL_WRITE (poll-timeout) |
| `scripts/audit/settings-version-check.sh` | — | — | — | — | — | — | WRITE |
| `agent-workspace/research/agent-tool-result-format.md` | WRITE (NEW) | — | — | — | — | — | — |
| `agent-workspace/memory/audits/sc39-prereq-volume-v2.7.md` | — | — | WRITE (NEW) | READ | READ | — | — |
| `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.7.json` | — | — | — | WRITE (NEW) | READ | — | — |
| `agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.7.json` | — | — | — | WRITE (NEW) | READ | — | — |
| `agent-workspace/memory/audits/phase-12-rule-eval.md` | — | — | — | WRITE (NEW) | — | — | — |
| `agent-workspace/memory/audits/cf33-state-v2.7.md` | — | — | — | WRITE (NEW) | — | — | — |
| `agent-workspace/memory/decisions/040-sc39-retry-verdict-v2.7.md` | — | — | — | — | WRITE (NEW) | READ | — |
| `agent-workspace/memory/decisions/041-f2-scaffold-v2.7.md` | — | — | — | — | — | OPTIONAL_WRITE | — |
| `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.7.md` | — | — | — | — | — | OPTIONAL_WRITE | — |
| `packages/core/src/telemetry/rollup-telemetry.ts` | — | — | — | — | — | OPTIONAL_WRITE | — |
| `specs/tier1-strategic/f2-self-evolution-signal-extension.md` | — | — | — | — | — | OPTIONAL_WRITE | — |
| `tests/telemetry/rollup-telemetry-f2.spec.ts` | — | — | — | — | — | OPTIONAL_WRITE | — |
| `agent-workspace/memory/phase-11-complete.md` | — | — | — | — | — | — | WRITE (cosm-1/2/3) |
| `agent-workspace/memory/carryforwards-v2.6.md` | — | — | — | — | — | — | WRITE (cosm-3) |

**Result**:
- 12.1 ↔ 12.2: ZERO collision (12.1 reverts to net-zero on
  `dispatch-jsonl-recorder.sh`).
- 12.7 ↔ {12.1, 12.2, 12.3, 12.4, 12.5, 12.6}: ZERO collision EXCEPT
  `tests/integration/sc39-production-pairing-rate.spec.ts` (12.2 writes
  JSDoc + Case 1 fixture; 12.7 writes poll-timeout helper). MITIGATION:
  12.7 dispatches AFTER 12.2 close (default sequencing) OR 12.7
  poll-timeout fix is applied as a follow-on edit by the same
  task-implementer that ran 12.2 (single-author serial sequence).
- All other edits are file-disjoint.

**Decision 032 D4 concurrency cap**: under default serial sequencing,
max-concurrent-in-flight is 1 (or 2 during 12.2 architect+IMPL parallel
sub-burst). 0 opus/max in flight ever. ≤ 2 opus/* in flight ever
(12.2 architect opus/medium completes BEFORE 12.5 opus/medium dispatches).
Cap respected.

**PARALLELIZE quantitative gate** (per `agent-workspace/constitution/architecture.md`
§"Decomposition Cost Model"):
- The only candidate parallel sub-batch is 12.7a/b/c — three internal
  housekeeping splits. Evaluating per architecture.md gate:
  - `num_independent_subtasks` = 3 (≥ 2 ✓)
  - `no_shared_file_writes` ✓ (12.7a touches `settings-version-check.sh`;
    12.7b touches `sc39-production-pairing-rate.spec.ts`; 12.7c touches
    `phase-11-complete.md` + `carryforwards-v2.6.md`)
  - `no_shared_schema_migration` ✓
  - `estimated_isolation_value_tokens` ≈ 3 × 12K context switches = 36K
    vs `single_task_baseline` ≈ 50K aggregate → gate FAILS strict
    isolation-value math (Phase 11 11.1 §10.4 precedent: parallel-batch
    only for ≥ 5 independent tasks).
  - **Decision**: serial-batch single-implementer (Phase 11 §11.1
    precedent). The internal 12.7a/b/c labels are organizational, not
    dispatch-parallel.
- No other parallel decomposition candidates.

---

## §4 Decision-Doc Plan

| Decision # | Title | Substage | Status target | Authoring effort | Notes |
|---|---|---|---|---|---|
| 040 | SC-39 Retry Verdict v2.7 — ENABLE_RETRY OR DEFER-V2.8 | 12.5 | BINDING | opus/medium | supersedes Decision 037; cites W-1/W-2/W-3 evidence per §5 W-4; if DEFER-V2.8 authors W-1'/W-2'/W-3' framework |
| 041 (CONDITIONAL) | F-2 Scaffold v2.7 (scaffolds-not-implements) | 12.6 | BINDING | sonnet/medium | only if 12.5 = ENABLE_RETRY AND F-2-R2/R-3 MET |

**Backfills** (re-attempted from prior phases): NONE. v2.6 closed cleanly
with Decisions 037/038/039 BINDING. No outstanding backfill obligations.

**Strategic theme decision (NOT authored — encoded in this master plan)**:
v2.7 is a closure phase with one structural enablement attempt (SC-39
ENABLE_RETRY via W-1 discovery+fix); no Decision-027-style strategic
redirect needed. If mid-Phase-12 the operator surfaces a new strategic
dimension (e.g., upstream Claude Code blocker requires escalation), a
new Decision 04X-strategic-redirect would supersede this master plan,
mirroring the Phase 8 redirect pattern (Decision 027).

**Decision 037 §11 obligation**: Decision 040 MUST satisfy the
"future binding decision" obligation in Decision 037 §5 W-4, citing
W-1 evidence (V1a or V1b artifact reference), W-2 evidence (DISPATCHED
count + total events), W-3 evidence (3 artifact verdicts), and Decision
034 inherited prereqs 4–6 must-stay-PASS confirmation.

---

## §5 Reviewer Routing

Substages requiring reviewer pairs:

| Substage | spec-compliance | code-quality | sandwich-verifier |
|---|---|---|---|
| 12.0 | — | — | — |
| 12.1 | — | — | — (research/discovery substage) |
| 12.2 | ✓ (sonnet/medium) | ✓ (sonnet/medium) | — (consolidated at 12.5) |
| 12.3 | — | — | — (consolidated at 12.5) |
| 12.4 | — | — | — (consolidated at 12.5) |
| 12.5 | — | — | ✓ (opus/medium; full 12.1–12.4 substage adversarial) |
| 12.6 | — | ✓ (sonnet/medium; only IF scaffold path fires) | — |
| 12.7 | — | ✓ (sonnet/medium) | — |
| 12.8 | — | — | ✓ (opus/medium; whole-phase adversarial) |

**Total reviewer dispatches**: 5–6 (depending on 12.6 path):
- spec-compliance: 1 (12.2)
- code-quality: 2 (12.2, 12.7) + optional 1 (12.6 scaffold)
- sandwich-verifier: 2 (12.5, 12.8)

**Total opus/medium dispatches**: 4
(12.2 architect + 12.5 Decision 040 + 12.5 sandwich-verifier + 12.8
sandwich-verifier).

**Total opus/max dispatches**: 0 (per MEMORY.md
`feedback_effort_max_quota_discipline.md`).

---

## §6 Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 12.1 W-1 discovery surfaces NO feasible Decision 037 §6 candidate (Claude Code emits no correlation field in any text or structured form) — i.e., ALL 4 candidates W-1-A/B/C/D are empirically infeasible | LOW-MED | HIGH | Trigger Option B fallback gate (per Phase 12 entry brief): skip 12.2/12.3/12.4 entirely; proceed directly to 12.5; Decision 040 = DEFER-V2.8 with cited upstream blocker (e.g., "Claude Code Agent tool result format requires upstream change to expose correlation field; filed upstream issue X; SC-39 ENABLE_RETRY blocked on Y"). Substage budget for 12.5 fold-forward absorbs the saved 300K from skipped substages. |
| R2 | 12.2 W-1 fix lands but fails (V1a/V1b) verification — i.e., the new regex/extraction also produces empty `RESULT_AGENT_ID` on real traffic | MED | HIGH | 12.2 acceptance gate is V1a OR V1b verified inline at IMPL close; if FAIL, re-route to alternate Decision 037 §6 candidate (e.g., W-1-A failed → try W-1-C; W-1-C failed → try W-1-B); if all 3 candidates fail in single substage budget, narrow-fix retry +40K then escalate to Option B fallback at 12.5. |
| R3 | 12.3 W-2 INSUFFICIENT_VOLUME at first measurement (e.g., baseline pace ≈ 2 dispatches/substage = 14 dispatches across 12.0–12.5; far below 50-floor) | MED | LOW | 12.3 acceptance-gate provides explicit accumulation-extension path: dispatch 12.7 housekeeping batch EARLY (parallel with 12.3 measurement re-run); each housekeeping reviewer dispatches +1–2 DISPATCHED rows; re-measure after 12.7 close. If still INSUFFICIENT, accept INSUFFICIENT_VOLUME at 12.5 and route to Decision 040 = DEFER-V2.8 with W-2-only-residual partial-MET verdict (W-1 PASS, W-3 cannot evaluate without W-2 floor). |
| R4 | 12.4 W-3 measurement shows pairing_rate < 0.40 OR unknown_agent_fraction ≥ 0.30 even after W-1 PASS (i.e., the seam fix activated but metrics did not move enough) | MED | MED | Decision 040 = DEFER-V2.8 with explicit "W-1 PASS but W-3 metrics did not clear thresholds — deeper structural issue identified" — surface new CF-V2.8-DEEPER-SEAM-INVESTIGATION; this is charter-coherent (Decision 037 §3.3 anticipated this branch). |
| R5 | 12.5 Decision 040 authoring is harder than budgeted — opus/medium dispatch hits quota or surfaces ambiguity in W-1/W-2/W-3 evidence chain | LOW | MED | Decision 040 mirrors Decision 037 structural shape (template available); ambiguity → default to DEFER-V2.8 per autonomous-protocol Decision Rule 7 (Document-and-Move). 130K substage budget includes 60K for Decision 040 + 70K for sandwich-verifier — narrow-fix +30K reserve absorbs ambiguity. |
| R6 | Wind-down hits mid-12.2 or mid-12.5 (each is ≥ 130K substage; both can naturally span 2 sessions) | HIGH | LOW | Mirror Phase 11 R5 mitigation. Checkpoint cleanly between 12.1 → 12.2 → 12.3 → 12.4 → 12.5 → 12.6 → 12.7 → 12.8. Each substage independently resumable from next session via SessionStart hook + `checkpoints/latest.md`. The 130K stages are MEANT to span sessions. |
| R7 | v2.7 commit attempt at 12.8 close hits harness permission cache for `Bash(git commit:*)` (same blocker that caused Decision 036 bundled-commit deferral pattern at v2.4 close) | LOW | MED | If commit fails at 12.8, document staged-but-uncommitted state; re-fire commit at next session boot per user standing grant 2026-04-28. Bundled-commit pattern (Decision 036) explicitly contemplates this. |
| R8 | 12.2 W-1 fix introduces regression in dispatch-recorder unit tests (e.g., new regex matches fixture but breaks existing tests that relied on old format) | MED | LOW | 12.2 acceptance gate requires `pnpm test` PASS. If a fix breaks a test, narrow-fix (≤ 20K) before 12.2 closes; test fixture realignment is in-scope (the fixture format will change to match real Claude Code emission per 12.1 discovery). |
| R9 | 12.7 housekeeping batch surfaces a deeper script issue (e.g., `set -euo pipefail` change exposes a previously-masked failure in `settings-version-check.sh`) | LOW-MED | LOW | 12.7 acceptance gate requires G7/G8/G9 acceptance gates re-run after fixes; if a previously-masked failure surfaces, narrow-fix it within 12.7 budget OR partial-close 12.7 with explicit deferral of the offending sub-fix to v2.8. |
| R10 | 12.8 sandwich-verifier surfaces a charter-coherence regression in Decision 040 authoring (e.g., W-3 evidence cited is too weak to bind ENABLE_RETRY) | LOW | MED | sandwich-verifier verdict APPROVED_WITH_CONCERNS triggers narrow-fix cycle (≤ 40K) before phase advance. If concern is critical, narrow-fix expands to 12.5.4 sub-stage authoring Decision 040-amend. Mirrors Phase 11 R9. |
| R11 | F-2-R2 (proposal-volume threshold ≥ 5 real proposals across ≥ 1 phase) is unmet at 12.6 even if SC-39 = ENABLE_RETRY (no real proposals have flowed through the loop yet because the loop just enabled at 12.5) | HIGH | LOW | This is the EXPECTED state under fresh-enable. Decision 037 §5 W-4 does not require proposal volume for ENABLE_RETRY; F-2 scaffold-IF-ENABLE path is a *separate* gate per F-2-R2. If F-2-R2 unmet, default to F-2 re-defer to v2.8 EVEN UNDER SC-39 ENABLE_RETRY — author `audits/f2-self-evolution-disposition-v2.7.md` with explicit "SC-39 enabled at v2.7 close; F-2-R2 proposal volume will accumulate naturally; re-evaluate at v2.8 entry". |
| R12 | 12.1 capture probe accidentally pollutes production telemetry (e.g., probe writes capture artifact concurrent with normal hook flow, distorting dispatch.jsonl row shape) | LOW | MED | 12.1 acceptance gate explicitly requires probe-add-and-revert in same substage (net 0 LOC delta on `dispatch-jsonl-recorder.sh`); capture artifact lives at `agent-workspace/research/agent-tool-result-format.md` not in production telemetry; probe writes to a sidecar file (e.g., `agent-workspace/research/agent-tool-result-capture.jsonl`) cleared at substage close. |

---

## §7 Carryforward Burndown Matrix (v2.7 → substage/disposition/acceptance gate)

Every v2.7 carryforward from `carryforwards-v2.7.md` is mapped to a
substage with explicit disposition and acceptance gate.

| CF-ID | Origin | Target Substage | Disposition | Acceptance Gate |
|---|---|---|---|---|
| CF-DOGFOOD-2 | Phase 8 / Decision 039 | 12.0 (re-eval) → 12.6 (gated) | DEFER-V2.8 (default; R-039.1..R-039.5 NOT MET at v2.7 entry) UNLESS R-039.1 fires (Decision 040 = ENABLE_RETRY) | 12.0 acceptance: R-039.1..R-039.5 explicitly re-evaluated with verdict line; if all NOT MET, self-extend to DEFER-V2.8 per Decision 039 §4.3 fallback shape |
| SC-39 (Decision 037 DEFER-V2.7) | Decision 037 BINDING | 12.1 → 12.5 (load-bearing) | ENABLE_RETRY OR DEFER-V2.8 (Decision 040) | 12.5 acceptance: Decision 040 cites W-1/W-2/W-3 evidence per Decision 037 §5 W-4; sandwich-verifier APPROVED |
| F-2 self-evolution signal-extension | Phase 8 / f2-disposition-v2.6 | 12.6 (GATED on 12.5) | scaffold-IF-ENABLE / DEFER-V2.8-IF-DEFER (gate inversion vs Phase 11 §11.6) | 12.6 acceptance: F-2 disposition recorded; IF SC-39 ENABLED: rollup-telemetry.ts schema extension landed + Decision 041 BINDING; IF DEFERRED: f2-disposition-v2.7.md cites F-2-R1'/R-2'/R-3' v2.8 framework |
| CF-V2.7-SC39-W1-AGENTID-EXTRACTION | Decision 037 §2.1 | 12.1 (discovery) + 12.2 (fix) | FIX_INLINE (default; or DEFER-V2.8 if Option B fallback fires) | 12.2 acceptance: V1a OR V1b verified inline; spec-compliance + code-quality both PASS/APPROVED no critical |
| CF-V2.7-SC39-W2-NATURAL-VOLUME | Decision 037 §2.2 | 12.3 (passive accumulation + measurement) | FIX_INLINE | 12.3 acceptance: dispatch.jsonl rows ≥ baseline + 50 (= 73 total); events ≥ baseline + 10000; gate_verdict = PASS in `sc39-prereq-volume-v2.7.md` |
| CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES | Decision 037 §7 | 12.7a (housekeeping batch) | FIX_INLINE | 12.7 acceptance: 3 fix-points (HASH-CRLF + BASH-STRICT-MODE + HASH-UNAVAILABLE) landed; G7/G8/G9 re-run PASS |
| CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE | Decision 037 §7.6 | 12.7b (housekeeping batch) | FIX_INLINE | 12.7 acceptance: poll_lines() timeout raised 15s → 30s OR retry-with-backoff replacement |
| (cosm-1) `phase-11-complete.md §6` `oss-readiness.sh` path-prefix | 11.7 verifier minor | 12.7c (housekeeping batch) | FIX_INLINE | 12.7 acceptance: prefix added |
| (cosm-2) staged file count drift (48 vs 49) | 11.7 verifier minor | 12.7c (housekeeping batch) | FIX_INLINE OR DOCUMENT_AS_KNOWN | 12.7 acceptance: corrected text OR explicit known-discrepancy note |
| (cosm-3) CF-V2.6-10.1-FAIL-COUNT-DEAD naming clarity | 11.7 verifier minor | 12.7c (housekeeping batch) | FIX_INLINE | 12.7 acceptance: rename to clearer label in `phase-11-complete.md` + `carryforwards-v2.6.md` historical register |

**Coverage**: 7 v2.7 CFs + 3 cosmetic items = 10 / 10 mapped. 9 to active
substages; 1 (CF-DOGFOOD-2) with v2.8-default-deferral footnote (re-evaluated
at 12.0; only fires earlier if R-039.1 holds via Decision 040 = ENABLE_RETRY).
Zero items unaccounted-for.

**Phase 11 carryovers re-defer**: Phase 11 closed 16 v2.6 CFs CLOSED + 4
new v2.7 surfaced + 3 multi-cycle structural-defer renewed. The 16 CLOSED
items remain CLOSED. The 3 multi-cycle items (CF-DOGFOOD-2 + SC-39 + F-2)
flow into v2.7 substages above.

---

## §8 v2.7 Commit + Tag Plan (single bundled commit at phase-close)

Per Decision 036 precedent + user standing grant 2026-04-28
("autonomous mode = autonomous until DONE ALL — incl. git commit/tag/release"):

- **Pre-12.8 state**: `git log --oneline | wc -l` = 4 (init / v2.5 /
  signoff / v2.6); zero commits across 12.0–12.7.
- **12.8 commit message**: `.git/COMMIT_EDITMSG_v2.7` ≤ 72-char subject:
  ```
  v2.7: Phase 12 v2.7 SC-39 ENABLE_RETRY + 7-CF burndown
  ```
  Body summary: Phase 12 burndown closes 7 v2.7 carryforwards (W-1
  agentId-extraction discovery+fix [12.1+12.2] + W-2 natural volume
  [12.3] + W-3 re-measure [12.4] + 4 housekeeping fixes [12.7]).
  Two binding decisions authored: 040 (SC-39 v2.7 verdict =
  ENABLE_RETRY OR DEFER-V2.8), 041 (CONDITIONAL F-2 scaffold v2.7).
  CF-DOGFOOD-2 disposition: re-deferred to v2.8 (R-039.1..R-039.5
  re-evaluated; default-NOT-MET shape inherited from Decision 039).
  F-2 disposition: scaffold-or-defer per Decision 040 outcome. Single
  bundled commit per Decision 036 precedent.
- **12.8 commit-tag sequence** (autonomous per user grant):
  - Wait for sandwich-verifier APPROVED at 12.8.
  - Execute: `git commit -F .git/COMMIT_EDITMSG_v2.7` then `git tag v2.7`.
  - Final state: `git log --oneline | wc -l` = 5; `git tag | sort` shows
    `v2.5 v2.6 v2.7`.
- **Failure mode**: harness permission-cache blocker for `Bash(git commit:*)`
  (R7 in §6) — document staged-but-uncommitted state; re-fire at next
  session boot. The bundled-commit pattern (Decision 036) explicitly
  contemplates multi-session commit deferral.
- **Decision 020 I-6 ABSOLUTE attestation**: zero git commits across
  12.0–12.7; gate at 12.8 = sandwich-verifier APPROVED.

---

## §9 Effort Routing Matrix (per substage; default sonnet/medium; opus/* requires per-substage justification per Decision 032 D2)

| Substage | Dispatched agents | Effort routing | D2 justification needed? |
|---|---|---|---|
| 12.0 | task-implementer | sonnet/medium | NO (D1 default) |
| 12.1 | task-implementer | sonnet/medium | NO (D1 default; discovery is mechanical) |
| 12.2 | sandwich-architect + task-implementer + spec-compliance + code-quality | opus/medium (architect) + sonnet/medium (others) | YES for architect — see §1 12.2 |
| 12.3 | task-implementer | sonnet/medium | NO (D1 default; measurement-only) |
| 12.4 | task-implementer | sonnet/medium | NO (D1 default; artifact-collection) |
| 12.5 | task-implementer (decision-author) + sandwich-verifier | opus/medium ×2 | YES for both — see §1 12.5 |
| 12.6 | task-implementer | sonnet/medium | NO (D1 default; bounded scaffold OR re-defer note) |
| 12.7 | task-implementer + code-quality | sonnet/medium | NO (D1 default; bundled hygiene batch) |
| 12.8 | task-implementer + sandwich-verifier | sonnet/high (attestation) + opus/medium (sandwich-verifier) | YES for sandwich-verifier — see §1 12.8 |

**Total opus/medium dispatches**: 4 (12.2 architect, 12.5 Decision 040
authoring, 12.5 sandwich-verifier, 12.8 sandwich-verifier).
**Total opus/max dispatches**: 0 (per MEMORY.md
`feedback_effort_max_quota_discipline.md` — sustained discipline since
Session #41 quota hit).
**Total sonnet/medium dispatches**: ~10–12 across all substages.
**Total sonnet/high dispatches**: 1 (12.8 attestation).
**Total sonnet/low dispatches**: 0.

**Decision 032 D4 concurrency cap respected**: max in-flight = 1 (default
serial sequencing) or 2 (12.2 architect+IMPL parallel sub-burst, then
sequential reviewers); 0 opus/max in flight ever; ≤ 2 opus/* in flight ever.

---

## §10 Open Questions Resolved (Phase 0.5 telemetry-rollup-aware)

`agent-workspace/memory/phase-11-routing-recommendations.md` does NOT
exist at Phase 12 plan-authoring time (only `phase-7-routing-recommendations.md`
present in repo). Therefore no Phase-11 telemetry-rollup-driven proposals
exist to ACCEPT or REJECT. Per master-planner subagent SKILL Phase 0.5
protocol, this section is silently skipped — there are no proposals to
adjudicate, and consequently no plan adjustments derived from rollup
recommendations.

This is NOT a "all proposals rejected for confidence reasons" scenario;
it is a "no recommendations file authored at v2.6 close" scenario. Future
phases should consider whether to author phase-N-routing-recommendations.md
at phase close as a standard practice (this is an OPEN QUESTION for Phase
13/v2.8 master planning to consider — out-of-scope for v2.7).

---

## §11 Charter Cross-References + Authoring Discipline

- **Charter Principle 1 (Daemon dumb, workers smart)**: 12.1–12.4 W-1/W-2/W-3
  framework is *deterministic measurement* (artifact production +
  threshold check), not LLM logic. 12.5 Decision 040 is the LLM-judgment
  leg, properly isolated to a subagent dispatch (opus/medium). Aligns.
- **Charter Principle 2 (Tight scope)**: Phase 12 explicitly REJECTS new
  feature work; only closes 7 v2.7 CFs + 3 cosmetic items + opens SC-39
  ENABLE_RETRY attempt + gated F-2 scaffold. Aligns.
- **Charter Principle 3 (Project-agnostic core)**: 12.2 W-1 fix MUST not
  introduce hardcoded paths or project-specific assumptions; the
  `dispatch-jsonl-recorder.sh` regex/extraction must work across all
  Claude Code dispatches regardless of agent_type. Architect spec to
  bind this.
- **Charter Principle 6 (Adapter abstraction)**: 12.6 F-2 scaffold leg
  (if fires) MUST flow through existing rollup-telemetry seam, not
  introduce a new direct schema-extension path. The
  `f2-self-evolution-disposition-v2.6.md` already establishes this
  constraint.
- **Charter Principle 8 (Reusable without forking)**: 12.7 settings-version-check
  hash fixes MUST work cross-platform (Windows Git Bash with CRLF + Linux
  with LF). HASH-CRLF-UNSTABLE fix is exactly this discipline.
- **Karpathy P1 (Think Before Coding)**: 12.1 discovery + 12.2 architect
  spec are P1-binding pre-IMPL discipline (W-1 fix is the canonical
  "discover-first" pattern).
- **Karpathy P2 (Simplicity First)**: prefer single regex-update (W-1-A)
  over architectural pivot (W-1-B/C/D) IF empirical discovery shows it
  feasible; prefer in-place housekeeping batch (12.7) over per-fix
  substage; prefer F-2 re-defer note (orchestrator-absorbed) over full
  subagent dispatch IF defer path fires.
- **Karpathy P3 (Surgical Changes)**: 12.2 W-1 fix ≤ 80 LOC delta;
  12.7 housekeeping ≤ 50 LOC aggregate; 12.6 F-2 scaffold leg bounded
  by spec.
- **Karpathy P4 (Goal-Driven Execution)**: every substage has
  deterministic boolean acceptance gate (§1 acceptance_gate fields).
- **PARALLELIZE quantitative gate** (per
  `agent-workspace/constitution/architecture.md` §"Decomposition Cost
  Model"): evaluated in §3; default serial sequencing per gate-FAIL on
  isolation-value math; one parallel-safe slot at 12.7 internal sub-batches
  declined per Phase 11 §11.1 precedent.

**I-6 ABSOLUTE**: zero git commits across substages 12.0–12.7. v2.7
stages at 12.8 close. The 12.8 commit is authorized by user standing
grant 2026-04-28, gated on sandwich-verifier APPROVED. Decision 020
binding throughout pre-12.8; Decision 036 bundled-commit pattern applies
at 12.8.

---

## §12 Final YAML Completion Block

```yaml
phase: 12
version: v2.7
status: DRAFT_FOR_RATIFICATION
substages: [12.0, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8]
sc_numbering_introduced: [SC-59_sc39_enable_retry_v2.7_attempt, SC-60_w1_empirical_discovery, SC-61_v2.7_housekeeping]
total_budget_estimate_K: 850
budget_ceiling_K: 920
i6_commits_pre_close: 0
i6_commits_at_12.8_close: 1   # bundled v2.7 commit per Decision 036 precedent + user standing grant 2026-04-28
v2_7_release: STAGE_AT_12.7_BUNDLE_COMMIT_AT_12.8
carryforwards_addressed:
  - CF-DOGFOOD-2-multi-cycle-defer (re-eval at 12.0; default DEFER-V2.8)
  - SC-39-W-framework (12.1 → 12.5; load-bearing)
  - F-2-self-evolution-scaffolding-gated (12.6)
  - CF-V2.7-SC39-W1-AGENTID-EXTRACTION (12.1 + 12.2)
  - CF-V2.7-SC39-W2-NATURAL-VOLUME (12.3)
  - CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES (12.7a)
  - CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE (12.7b)
  - cosmetic-minor-3-items (12.7c)
sc39_path: w1_empirical_discovery_then_fix_then_w2_w3_then_decision_040
load_bearing_substage: 12.2 (W-1 fix landing) + 12.5 (Decision 040)
parallel_opportunities: [12.7 || 12.3-extension-only]
critical_path: [12.0 -> 12.1 -> 12.2 -> 12.3 -> 12.4 -> 12.5 -> 12.6 -> 12.7 -> 12.8]
expected_sessions: 9
expected_calendar_days: 4
opus_medium_dispatches: 4   # 12.2 architect + 12.5 Decision 040 + 12.5 sandwich-verifier + 12.8 sandwich-verifier
opus_max_dispatches: 0
v2_8_deferral_candidates:
  - CF-DOGFOOD-2 (default; R-039.1..R-039.5 re-evaluated at 12.0)
  - SC-39-W-framework (if Decision 040 = DEFER-V2.8)
  - F-2-scaffolding (if Decision 040 = DEFER-V2.8 OR F-2-R2/R-3 unmet)
  - W-1' / W-2' / W-3' v2.8 framework (if Decision 040 = DEFER-V2.8)
  - phase-N-routing-recommendations.md authorship (open question)
  - community-OSS-launch-trigger (Phase 13+)
  - multi-user-adoption-rollout (Phase 13+)
  - IMP-1 deferred items (Phase 6.3 lineage; awaits Decision 023 supersession schedule)
charter_coherence_verified: true
new_features_added: 0_closure_phase_with_gated_scaffold
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, post-v2.6-tag session)
authoring_date: 2026-04-28
ratification_required_before_dispatch: true
next_action_for_orchestrator: dispatch_12.0_routing_brief
baseline_evidence_captured_2026_04_28:
  agentId_regex_sites: 2  # scripts/hooks/dispatch-jsonl-recorder.sh
  tool_response_content_zero_parse_sites: 1  # scripts/hooks/dispatch-jsonl-recorder.sh
  dispatch_jsonl_total_rows: 170
  dispatch_jsonl_DISPATCHED_count: 23
  git_log_commit_count: 4  # init / v2.5 / signoff / v2.6
w2_acceptance_gate_explicit_threshold:
  dispatch_jsonl_DISPATCHED_required: 73   # baseline 23 + 50 floor
  total_events_required_post_baseline: "+10000"
```

**END Phase 12 Master Plan v2.7 SC-39 ENABLE_RETRY (W-1 Discovery + Fix + Re-Measure) + 7-CF Burndown.**
