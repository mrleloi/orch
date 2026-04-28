---
title: Phase 11 Master Plan — v2.6 Carryforward Burndown + SC-39 ENABLE_RETRY Window
phase: 11
version: v2.6
status: DRAFT_FOR_RATIFICATION
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, session post-v2.5-tag)
authoring_date: 2026-04-28
prior_phase: 10 (v2.5 closed; phase-10-complete.md authored 2026-04-28; commit 92f50ec + tag v2.5 LIVE on disk)
authority:
  - PROJECT_CHARTER.md (immutable invariants; especially Principle 8 reusable-without-forking)
  - Decision 027 §"Consequences" 8 (scaffold-now-execute-later remains binding)
  - Decision 032 (D1-D6 effort routing; D2 justifications mandatory for opus/medium+)
  - Decision 035 BINDING (SC-39 DEFER-V2.6; R-1/R-2/R-3/R-4 prereq framework gates any v2.6 ENABLE_RETRY)
  - Decision 036 BINDING (bundled commit pattern; v2.6 likely = single commit too)
  - phase-10-complete.md §7 (18 OPEN-V2.6 carryforwards inventoried)
inputs_consumed:
  - agent-workspace/memory/phase-10-complete.md (definitive carryforward inventory; §7)
  - agent-workspace/memory/carryforwards-v2.6.md (115-line working list)
  - agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md (R-1/R-2/R-3/R-4 framework)
  - agent-workspace/memory/decisions/032-effort-routing.md (D1-D6 dispatch policy)
  - agent-workspace/memory/decisions/033-sc39-narrow-gate-supersession.md (Deliberation E inheritance)
  - agent-workspace/memory/decisions/036-v2.4-v2.5-bundled-commit.md (bundled-commit precedent)
  - agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md (structural template)
  - agent-workspace/constitution/cf-dogfood-2-assessment.md (10.3 deferred-decision input for 11.3)
  - agent-workspace/memory/audits/f2-self-evolution-disposition-v2.5.md (F-2 gating context)
  - agent-workspace/constitution/architecture.md §"Decomposition Cost Model" (PARALLELIZE gate)
  - agent-workspace/constitution/session-budgets.md (250K hard cap; wind-down at 200K real)
  - PROJECT_CHARTER.md (immutable invariants)
i6_compliance: zero git commits across 11.0–11.7; v2.6 stages at final-substage close (11.7) with bundled commit per Decision 036 precedent
budget_estimate_tokens: 870000
budget_ceiling_tokens: 920000
expected_sessions: 9
expected_calendar_days: 4
parallel_opportunities: [11.1 || 11.2 || 11.3]
critical_path: 11.0 -> {11.1, 11.2, 11.3} -> 11.4 -> 11.5.1 -> 11.5.2 -> 11.5.3 -> 11.6 -> 11.7
---

# Phase 11 Master Plan — v2.6 Carryforward Burndown + SC-39 ENABLE_RETRY Window

> Phase 11 is the v2.6 carryforward burndown phase. Its theme mirrors Phase 10 in
> shape (closure phase, no new features) but inverts in payoff: where Phase 10
> closed the v2.4 residue and *prepared* the SC-39 structural seam, Phase 11
> consumes the post-v2.5 measurement window opened by R-1 (next-session-boot
> activation of the 10.5.2.B/C settings.json hook chain) and *attempts* the
> ENABLE_RETRY decision the R-1/R-2/R-3/R-4 framework was authored to gate.
> I-6 ABSOLUTE preserved (Decision 020). v2.0–v2.5 commit baseline persists;
> v2.6 stages at 11.7 close, single bundled commit per Decision 036 precedent.

---

## §1 Executive Summary — v2.6 Strategic Theme

**Theme**: *"Open the SC-39 measurement window post-restart; close the 10.5.x review
nitpicks; bundle a single v2.6 commit at phase close."*

Phase 10 closed v2.5 with 18 carryforwards routed forward (`phase-10-complete.md §7`).
Of these, **one decision dominates the agenda**: SC-39 cannot retry until R-1
(session restart activated the 10.5.2.B-fix's PostToolUse hook for `Agent`), R-2
(natural ≥50 dispatches + ≥1,969 events on top of Phase-10 baseline), R-3
(re-measurement of 3 artifacts post-restart), and R-4 (Decision 037 author-ack)
all PASS. Phase 11 is the natural measurement-window phase — its very dispatching
activity *produces* the R-2 volume needed to evaluate the seam fix.

The other 17 carryforwards are surgical fixes (11 code-review nitpicks across two
hygiene batches; 1 audit-trail discipline standardization; 1 architectural-defer
decision-binding for CF-DOGFOOD-2; 3 SC-39-adjacent infra needs from Decision 035 §6;
1 F-2 gated-scaffolding decision). They burn down cleanly in three parallel
substages (11.1 / 11.2 / 11.3) plus the load-bearing sequential SC-39 substage 11.5.

**Is the 18-CF burndown the entire theme?** Yes. Decision 027's 8-dimension framing
(drift-audit / verify automation / self-application / multi-user / community /
effort routing) remains structurally satisfied as of Phase 10 close — every
dimension has at least scaffold-level landing, and v2.5 added Decision 032 (D1-D6
effort routing as a binding artifact). v2.6 does NOT advance new dimensions; it
cleans up residue, opens the SC-39 measurement window, and may scaffold F-2
*if and only if* SC-39 enables.

**Two non-residue items earn substage allocation**:

1. **CF-DOGFOOD-2 disposition** (substage 11.3). Phase 10 §10.3 *assessed* the gap
   (`constitution/cf-dogfood-2-assessment.md` filed) but explicitly deferred the
   *disposition* (FIX_INLINE / DEFER_V2.7 / WONT_FIX) to v2.6. This is a
   binding-decision substage: Phase 11 must either land the harness step-9 fix
   (run-self-task.ts:387 stub → real `IAgentRuntime.spawn()` invocation) OR
   author Decision 037-or-later with explicit DEFER-V2.7 / WONT_FIX rationale
   citing the assessment doc.

2. **F-2 self-evolution signal-extension scaffolding** (substage 11.6, GATED).
   `audits/f2-self-evolution-disposition-v2.5.md` defers F-2 to "the same horizon
   as SC-39 enabling." If 11.5.3 verdict = ENABLE_RETRY, scaffold F-2 schema
   extension; if 11.5.3 = DEFER-V2.7, re-defer F-2 to v2.7 with explicit gate.

**Ratification budget**: 870K mid-estimate; 920K ceiling; 9 sessions; 4 calendar
days. Critical path: 11.0 → {11.1∥11.2∥11.3} → 11.4 → 11.5.1 → 11.5.2 → 11.5.3 →
11.6 → 11.7. **Forbidden parallelism**: 11.5 substages are strictly serialized
(R-1 verification gates R-2 measurement gates R-3 artifact production gates R-4
decision authoring) — same shape as Phase 10's 10.5 sequential constraint.

**v2.6 stages at final-substage close (I-6 ABSOLUTE)**: zero git commits across
11.0–11.6; the v2.6 commit fires only at 11.7 close, gated on sandwich-verifier
APPROVED verdict. Bundled-commit pattern per Decision 036 precedent (single
commit covers all 11.x substages + carryforward closures).

---

## §2 Substage Decomposition

### 11.0 — Phase 11 routing brief

- **substage_id**: 11.0
- **scope_summary**: Read this master plan; partition the 18 carryforwards by
  family (hygiene-nitpick / audit-trail-discipline / structural-disposition /
  SC-39-prereq-and-measurement / F-2-gated-scaffold / closure); ratify per-substage
  routing using the phase-10-routing-brief.md schema (§1 dispatch envelopes,
  §2 effort-routing skill consultations, §3 D4 concurrency-cap check, §4
  pre-authorized v2.7 deferrals, §5 open questions); list all v2.7 deferral
  candidates explicitly.
- **primary_carryforwards**: [routing meta-task; no direct CF closure]
- **input_files** (read): [`agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md`
  (this file), `agent-workspace/memory/phase-10-complete.md`,
  `agent-workspace/memory/carryforwards-v2.6.md`,
  `agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md`,
  `agent-workspace/memory/phase-10-routing-brief.md` (template),
  `agent-workspace/memory/budget-tracker.md` (Phase 10 actuals: ~690K vs 870K
  estimate)]
- **output_files** (write): [`agent-workspace/memory/phase-11-routing-brief.md`]
- **recommended_dispatch_count**: 1 (task-implementer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: routing-doc authoring; mechanical synthesis over
    phase-10-complete §7 + this master plan; no judgment-density justifying opus;
    pattern matches 10.0 substage (estimated 60K, actual ~60K per phase-10 actuals
    table).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per
    Decision 032).
- **reviewer_pairs**: none — routing brief is doc-only; sandwich-architect
  ratification optional and budget-permitting (skip by default per Phase 10
  precedent).
- **blockers**: none — first substage.
- **parallel_safe_with**: [] — gates all downstream substages.
- **estimated_budget_K**: 60
- **acceptance_gate**: `phase-11-routing-brief.md` exists; ≥6 substage families
  enumerated with the §1-§7 schema from `phase-10-routing-brief.md`; budget sums
  verified ≤920K; ≥1 v2.7 deferral candidate named; effort-routing skill
  consultations logged for ≥3 substages (D5 compliance per Decision 032);
  D4 concurrency-cap check passes (no plan moment exceeds 4 concurrent or 2
  opus/* in-flight).

---

### 11.1 — Code-review nitpick hygiene batch (Phase 9 + Phase 10 reviews)

- **substage_id**: 11.1
- **scope_summary**: Bundled hygiene fix-pass for 11 small CFs surfaced by 10.1 +
  10.2 + 10.5.2.B + 10.5.2.C code-quality reviews + the 4 still-open Phase 9
  hygiene items routed forward. Per Phase 9 §9.1 carryforward-batch precedent.
  Sub-tasks are small (≤30 LOC each), surgical, disjoint-file. Single
  task-implementer can land them serially in one dispatch envelope; reviewer
  pair runs once at batch close.
- **primary_carryforwards**:
  - From 10.1 CQ:
    - `CF-V2.6-10.1-FAIL-COUNT-DEAD` (collapse `FAIL_COUNT` → `GATE_FAIL_COUNT`
      in `scripts/verify/post-phase.sh`)
    - `CF-V2.6-10.1-DUPLICATE-A4-PASS` (dedup duplicate `[PASS] A.4` print path
      at lines 233 + 283)
    - `CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP` (`scripts/audit/substage-parallelism-flag.sh:105`
      bash string-compare → version-sort or split-on-dot integer compare; add
      regression fixture with substage IDs 9.10 vs 9.2)
  - From 10.2 CQ:
    - `CF-V2.6-10.2-R9-PRECONDITION` (assert `WebFetch`/`TaskList` appear in
      tested phase-9 rollup file before exitCode check)
    - `CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING` (group `BUILTIN_HOOK_EVENTS` with
      `// tool names` vs `// lifecycle event names` sub-comments)
  - From 10.5.2.B CQ:
    - `CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS` (one-line comment near
      `dispatch-jsonl-recorder.sh:29` documenting the format-stability
      assumption; OPTIONAL stderr warning when `RESULT_AGENT_ID` is empty for
      `event=COMPLETED` of tool=Agent)
    - `CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE` (in-code comment at
      `dispatch-jsonl-recorder.sh:55,74` referencing Decision 023 + IMP-1
      deferral)
    - `CF-V2.6-10.5-TUI-JSON-NAMING` (rename `TUI_JSON` → `TOOL_USE_ID_JSON` for
      self-documentation)
    - `CF-V2.6-10.5-H8-FIXTURE-NAME` (rename `subagent_type: 'test-impl'` →
      `'task-implementer'` in `tests/hooks/dispatch-recorder.spec.ts:403`)
  - From 10.5.2.C CQ:
    - `CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD` (OPTIONAL — author
      `decisions/038-10.5-agent-type-field-naming.md` referencing Decision 023 +
      IMP-1 deferral; OR add inline references and document elision)
    - `CF-V2.6-10.5-T-NA2-DEDUP-COMMENT` (one-line comment at
      `tests/hooks/component-telemetry.spec.ts:413-454` linking 5ms `Atomics.wait`
      to subshell startup cost)
- **input_files** (read): [`scripts/verify/post-phase.sh`,
  `scripts/audit/substage-parallelism-flag.sh`,
  `scripts/utilities/citation-linter.ts`,
  `tests/scripts/citation-linter-rollup.spec.ts`,
  `scripts/hooks/dispatch-jsonl-recorder.sh`,
  `tests/hooks/dispatch-recorder.spec.ts`,
  `scripts/hooks/component-telemetry.sh`,
  `tests/hooks/component-telemetry.spec.ts`,
  `agent-workspace/memory/decisions/023-*` (canonical agent_type field name)]
- **output_files** (write): [all files in input list (in-place edits);
  OPTIONAL `agent-workspace/memory/decisions/038-10.5-agent-type-field-naming.md`]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: 11 small surgical edits (≤30 LOC each, ≤200 LOC aggregate);
    no judgment-density warranting opus; pattern matches Phase 9 §9.1
    carryforward-batch (sonnet/medium, planned 100K, actual ~80K).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per
    Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 11.0 (routing brief).
- **parallel_safe_with**: [11.2, 11.3] — disjoint file-edit set (11.2 edits
  subagent contracts under `.claude/agents/`; 11.3 edits dogfood harness under
  `scripts/dogfood/`).
- **estimated_budget_K**: 120 (11 fixes × ~8K each + reviewer overhead +
  regression-fixture authoring for the X.10 dedup bug)
- **acceptance_gate**: 11/11 nitpick CFs CLOSED with concrete diff;
  `pnpm test` PASS (no test-count regression); `pnpm typecheck && pnpm lint`
  exit 0; planted regression fixture for X.10 lexicographic dedup PASSes;
  reviewer code-quality verdict APPROVED or APPROVED_WITH_CONCERNS (no critical).

---

### 11.2 — Audit-trail inline-return discipline (subagent contract update)

- **substage_id**: 11.2
- **scope_summary**: Standardize the audit-trail inline-return pattern surfaced
  by 10.5 sandwich-verifier (`CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN`).
  Multiple reviewer subagents in v2.5 (10.5.2.B-spec, 10.5.2.B-fix-spec) returned
  findings inline-only without writing the canonical
  `observations/<task>-<date>-<role>.md` file. carryforwards-v2.6.md §source-10.5
  enumerates 3 fix paths: (1) subagent contract bake the `Write` tool invocation
  into the spec-compliance-reviewer + code-quality-reviewer + sandwich-verifier
  templates; (2) hook-side PostToolUse detection of missing observation file
  with auto-write; (3) orchestrator-side reactive write (already practiced
  ad-hoc by main session; could be promoted to a discipline skill). Phase 11
  selects ONE path (default: combination of #1 contract bake + #3 promoted skill;
  hook-side #2 is too invasive for v2.6 budget).
- **primary_carryforwards**: [`CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN`]
- **input_files** (read): [`.claude/agents/spec-compliance-reviewer.md`,
  `.claude/agents/code-quality-reviewer.md`,
  `.claude/agents/sandwich-verifier.md`,
  `agent-workspace/memory/observations/task-10.5-20260428-sandwich-verifier.md`
  (the source finding), `agent-workspace/memory/carryforwards-v2.6.md`
  (the 3-path enumeration)]
- **output_files** (write): [
    `.claude/agents/spec-compliance-reviewer.md` (append "MUST Write final
      verdict to `agent-workspace/memory/observations/<task>-<YYYYMMDD>-spec-compliance.md`
      before turn end" clause),
    `.claude/agents/code-quality-reviewer.md` (analogous append for
      `code-quality.md`),
    `.claude/agents/sandwich-verifier.md` (analogous append for
      `sandwich-verifier.md`),
    OPTIONAL `.claude/skills/observation-file-write-on-return/SKILL.md`
      (orchestrator-side promotion of path #3)
  ]
- **recommended_dispatch_count**: 1 (task-implementer; reviewer pair OPTIONAL —
  this is a doc-only contract update with no production code surface)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: doc-edit work bounded by existing subagent template shape;
    pattern matches Phase 9 §9.0 routing-brief authoring (sonnet/medium,
    ~30-50K actual). No D2 needed.
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per
    Decision 032).
- **reviewer_pairs**: [] — doc-only; reviewer pair OPTIONAL and budget-permitting.
- **blockers**: depends on 11.0.
- **parallel_safe_with**: [11.1, 11.3] — disjoint file-edit set (`.claude/agents/`
  + `.claude/skills/` are not touched by 11.1 or 11.3).
- **estimated_budget_K**: 50
- **acceptance_gate**: each of the 3 reviewer-subagent template files contains
  the new "MUST Write final verdict to observations/" clause OR an explicit
  rejection-with-rationale (path #2 chosen instead, etc.); IF skill authored,
  `.claude/skills/observation-file-write-on-return/SKILL.md` exists with
  explicit trigger-on-return semantics; charter-coherence-spot-check.sh PASS
  (no new Drift-C indicators introduced).

---

### 11.3 — CF-DOGFOOD-2 architectural disposition (binding decision)

- **substage_id**: 11.3
- **scope_summary**: Phase 10 §10.3 produced the CF-DOGFOOD-2 architectural
  *assessment* (`constitution/cf-dogfood-2-assessment.md`) but explicitly deferred
  *disposition* to v2.6. Phase 11 substage 11.3 binds the disposition: either
  (a) FIX_INLINE — replace `scripts/dogfood/run-self-task.ts:387` step-9 stub
  (`dispatch_deferred_to: '8.5.3'`) with a real `IAgentRuntime.spawn()` invocation
  guarded behind a profile flag; OR (b) DEFER-V2.7 with binding decision-doc
  citing v2.7 trigger conditions; OR (c) WONT_FIX with charter-coherence
  rationale (e.g., dogfood harness as currently scoped is sufficient for
  C1 smoke fixture — full-loop self-application is a separate roadmap horizon).
  This is a *decision* substage; if FIX_INLINE chosen, IMPL leg follows but is
  budget-bounded to ≤80K total (≤150 LOC delta).
- **primary_carryforwards**: [`CF-DOGFOOD-2`]
- **input_files** (read): [`agent-workspace/constitution/cf-dogfood-2-assessment.md`
  (the §1.2 triangulation establishes step-9 stub at run-self-task.ts:387),
  `scripts/dogfood/run-self-task.ts` (490 LOC),
  `tests/dogfood/run-self-task.spec.ts`,
  `packages/core/src/dogfood/envelope-schema.ts`,
  `packages/core/src/interfaces/IAgentRuntime.ts` (or equivalent),
  `agent-workspace/queue/self-tasks/_smoke-fixture.yaml`,
  `agent-workspace/memory/decisions/033-sc39-narrow-gate-supersession.md`
  (Deliberation E inheritance for structural-defer rationale)]
- **output_files** (write):
  - IF FIX_INLINE: [`scripts/dogfood/run-self-task.ts` (line 387 unblocked),
    `tests/dogfood/run-self-task.spec.ts` (T9 expanded to cover real-spawn
    path; gated behind a profile flag so existing T9-stub tests still pass),
    `agent-workspace/memory/decisions/039-cf-dogfood-2-fix-inline-v2.6.md`
    (binding decision)]
  - IF DEFER-V2.7: [`agent-workspace/memory/decisions/039-cf-dogfood-2-defer-v2.7.md`
    (binding decision citing v2.7 trigger conditions)]
  - IF WONT_FIX: [`agent-workspace/memory/decisions/039-cf-dogfood-2-wont-fix.md`
    (binding decision citing charter coherence)]
- **recommended_dispatch_count**: 2 (sandwich-architect for disposition decision
  + task-implementer if FIX_INLINE; spec-compliance-reviewer ONLY if FIX_INLINE)
- **recommended_(model, effort)**: (opus, medium) for disposition decision;
  (sonnet, medium) for task-implementer if FIX_INLINE.
  - **rationale**: structural decision-binding task; touches dogfood harness +
    IAgentRuntime seam; judgment-density high (3 alternatives, each charter-coherent
    in different ways). Pattern matches Phase 10 §10.3 (opus/medium, planned
    100K, actual ~80K assessment-only; FIX_INLINE adds ~40K IMPL).
  - **D2 justification (per Decision 032 effort routing)**: "Disposition decision
    binds future v2.7+ self-application work; cross-references SC-44 (dogfood
    entrypoint), Decision 027 §C-8 (self-application baseline), and Decision 033
    Deliberation E (structural-defer pattern). Three alternatives are
    pre-defined (FIX_INLINE / DEFER-V2.7 / WONT_FIX) and the cf-dogfood-2-assessment
    architectural map is already on disk. NOT max because alternatives are
    pre-bounded and the assessment doc shrinks the design space dramatically."
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet,
  effort: medium}] — only if FIX_INLINE chosen.
- **blockers**: depends on 11.0.
- **parallel_safe_with**: [11.1, 11.2] — assessment-doc read + decision-doc
  write + (optional) dogfood-harness edit; disjoint with 11.1's `scripts/verify/`
  + `scripts/audit/` + `scripts/utilities/` + hook scripts and 11.2's
  `.claude/agents/` + `.claude/skills/` paths.
- **estimated_budget_K**: 100 (60K disposition decision + 40K FIX_INLINE IMPL
  if chosen; budget bounds the design space — if FIX_INLINE requires more,
  defer to v2.7)
- **acceptance_gate**: Decision 039 authored with explicit verdict (FIX_INLINE /
  DEFER-V2.7 / WONT_FIX); IF FIX_INLINE: code lands + `pnpm test` PASS + new
  T9-real-spawn test exercises real `IAgentRuntime.spawn()` path; IF DEFER-V2.7:
  decision-doc cites v2.7 trigger conditions; IF WONT_FIX: decision-doc cites
  charter coherence; sandwich-architect verdict APPROVED.

---

### 11.4 — Mid-verify gate after parallel batch close

- **substage_id**: 11.4
- **scope_summary**: After 11.1 ∥ 11.2 ∥ 11.3 close, run a mid-phase verify
  checkpoint mirroring 10.4 pattern: post-phase.sh dry-run on Phase 11 (with the
  v2.5-fixed exit-code propagation), oss-readiness.sh re-run, full pnpm test,
  drift-check.sh + invariant grep sweep. Confirms the 3-substage parallel batch
  did not introduce regressions before SC-39 R-1 verification begins in 11.5.1.
- **primary_carryforwards**: [verify checkpoint; no direct CF closure]
- **input_files** (read): [`scripts/verify/post-phase.sh`,
  `scripts/audit/oss-readiness.sh`, `scripts/verify/drift-check.sh`]
- **output_files** (write): [`agent-workspace/memory/audits/phase-11-mid-verify.md`]
- **recommended_dispatch_count**: 1 (task-implementer; or skip dispatch if main
  session can run gates inline — 10.4 precedent allowed inline)
- **recommended_(model, effort)**: (sonnet, low) — gate runner only; no synthesis
  judgment.
  - **rationale**: deterministic-only work — bash exit codes and test counts.
    No code edits expected. If a gate fails, surface and route to a 11.4-fix
    sub-task. Pattern matches Phase 10 10.4 (sonnet/low, planned 30K, actual
    ~30K).
  - **D2 justification**: NOT REQUIRED (sonnet/low is below the D2 threshold).
- **reviewer_pairs**: none.
- **blockers**: depends on 11.1 + 11.2 + 11.3 all CLOSED.
- **parallel_safe_with**: [] — strictly mid-phase serial gate.
- **estimated_budget_K**: 30
- **acceptance_gate**: all 8 CLASS-A gates exit 0; oss-readiness PASS;
  mid-verify.md records test counts + drift-check status + dispatch-pairing-rate
  status; if any gate RED, surface as new CF and add to 11.4-fix sub-task before
  unblocking 11.5.1.

---

### 11.5 — SC-39 ENABLE_RETRY window (R-1 / R-2 / R-3 / R-4 framework execution)

This is the **load-bearing substage of v2.6**. It executes the full Decision 035
§5 R-1/R-2/R-3/R-4 framework. R-1 (session restart) is **automatically PASS by
construction** (Phase 11 begins in a fresh session post-tag-v2.5 commit; the
10.5.2.B-fix's `.claude/settings.json` change has been on-disk since v2.5
commit `92f50ec`); 11.5.1 verifies. R-2 (natural volume) accumulates passively
across 11.5.1 + 11.5.2 + parallel substages; 11.5.2 measures. R-3 (re-measurement)
is 11.5.2's primary deliverable. R-4 (Decision 037 author-ack with all R-1/R-2/R-3
PASS evidence) is 11.5.3.

#### Stage 1 (11.5.1) — R-1 verification + production-vs-fixture-gap test infra

- **scope_summary**: sandwich-architect designs (a) the R-1 verification probe
  per Decision 035 §5 R-1 verification options (a/b/c — pick (c) empirical:
  dispatch one Agent call in the Phase 11 fresh session, read `dispatch.jsonl`,
  confirm COMPLETED row's hex agent_id has been re-keyed onto the toolu_*
  dispatch_id space); (b) the
  `tests/integration/sc39-production-pairing-rate.spec.ts` integration test
  per Decision 035 §6 `CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP` action items
  (spawn child `claude` process with the post-fix settings.json, inject a real
  Agent dispatch, read resulting dispatch.jsonl, assert pairing_rate ≥ 0.40 on
  spawned session output). Spec must include Part-C deterministic gates
  pre-verified.
- **primary_carryforwards**: [SC-39 R-1 verification, R-1 implementation,
  `CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE` (action items: settings-version-check
  probe + spawned-session-mode SKILL.md update),
  `CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP` (the integration test)]
- **input_files** (read): [`agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md`
  (R-1/R-2/R-3 specs + §6 action items), `scripts/hooks/dispatch-jsonl-recorder.sh`,
  `scripts/hooks/component-telemetry.sh`,
  `agent-workspace/memory/observations/task-10.5.2.A-20260427-200616.md`
  (probe template), `.claude/settings.json` (post-fix), `.claude/skills/spawned-session-mode/SKILL.md`
  (target update path)]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/11.5-sc39-r1-r3-architect.md`
      (architect spec, 200-400 LOC),
    `tests/integration/sc39-production-pairing-rate.spec.ts` (NEW — child-process
      spawn test per Decision 035 §6),
    `scripts/audit/settings-version-check.sh` (NEW — Decision 035 §6 action item;
      compares in-memory settings hash to on-disk hash, warns at session start),
    `.claude/skills/spawned-session-mode/SKILL.md` (UPDATE — call out
      "settings.json edits don't take effect until next session boot" per
      Decision 035 §6)
  ]
- **recommended_dispatch_count**: 2 (sandwich-architect + task-implementer)
- **recommended_(model, effort)**: (opus, medium) for sandwich-architect spec;
  (sonnet, medium) for task-implementer impl of the spec.
  - **rationale**: structural test infra; touches multiple modules (integration
    test + audit script + skill doc); judgment-density high for the architect
    leg; impl leg is bounded by spec. Pattern matches Phase 10 10.5.1
    (opus/medium architect, planned 80K, actual ~80K).
  - **D2 justification (per Decision 032 effort routing)**: "R-1 + production-vs-fixture
    test infra binds future SC-N retries that depend on settings.json wiring;
    cross-references Decision 035 §6 three CF action items; affects test harness
    layout (integration test introduces child-process spawn pattern). NOT max
    because Decision 035 §6 already pre-bounded the test shape (spawn child claude,
    inject dispatch, assert pairing_rate)."
- **reviewer_pairs**: [{post_dispatch_role: spec-compliance, model: sonnet,
  effort: medium}, {post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **estimated_budget_K**: 130 (80K architect + 50K impl with reviewer overhead)

#### Stage 2 (11.5.2) — R-2 natural-volume audit + R-3 re-measurement

- **scope_summary**: Verify R-2 prerequisites met (≥50 real Agent-tool DISPATCHED
  events across Phase 11 substages; ≥1,969 component-telemetry events on top of
  Phase 10 baseline of 8,031 → total ≥10,000); produce R-3 fresh artifacts
  equivalent to Decision 035 §2 artifacts 1, 2, 3 against post-restart, post-volume
  telemetry: (1) `cf21-real-dispatch-sample-v2.6.json` with threshold
  `pairing_rate ≥ 0.40` on `sample_size ≥ 50`; (2) `unknown-agent-bucket-prevalence-v2.6.json`
  with threshold `fraction < 0.30`; (3) `sc39-prereq-volume-v2.6.md` with
  threshold `total_events ≥ 10,000`. All three artifacts MUST report
  `gate_verdict=PASS`. Includes re-eval of artifacts 4 (CF-25 hygiene
  citation-linter rollup-mode), 5 (CF-33 dead-code state), 6 (RULE re-eval) as
  must-stay-PASS confirmation.
- **input_files** (read): [post-Phase-10 + post-Phase-11.5.1 telemetry on disk
  (dispatch.jsonl + component-telemetry.jsonl); Decision 035 §5 R-2 + R-3 specs;
  Decision 035 §2 artifact templates (artifacts 1, 2, 3 from v2.5 measurement);
  `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.5.json` (template);
  `agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.5.json`
  (template); `agent-workspace/memory/audits/sc39-prereq-volume-v2.5.md`
  (template)]
- **output_files** (write): [
    `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.6.json` (NEW,
      R-3 deliverable),
    `agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.6.json`
      (NEW, R-3 deliverable),
    `agent-workspace/memory/audits/sc39-prereq-volume-v2.6.md` (NEW, R-3
      deliverable),
    `agent-workspace/memory/audits/phase-11-rule-eval.md` (NEW, must-stay-PASS
      confirmation for prereq 6),
    `agent-workspace/memory/audits/cf33-state-v2.6.md` (NEW, must-stay-PASS
      confirmation for prereq 5),
    `agent-workspace/memory/observations/task-11.5.2-20260428-artifacts.md`
      (the implementer report)
  ]
- **recommended_dispatch_count**: 1 (task-implementer; sandwich-verifier follows
  in 11.5.3 against the full set)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: artifact-collection task; mirrors Phase 10 10.5.3 stage 1
    (sonnet/medium, ~60K actual). The decision authorship moves to 11.5.3
    (per Phase 10 split between artifact production and decision authorship).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per
    Decision 032).
- **reviewer_pairs**: [] — sandwich-verifier follows in 11.5.3 with full-substage
  adversarial review.
- **estimated_budget_K**: 100
- **acceptance_gate**: 5 artifact files exist + report `gate_verdict=PASS`
  for artifacts 1, 2, 3; artifacts 5, 6 confirm must-stay-PASS; R-2 evidence
  cited (DISPATCHED count ≥ 50; total events ≥ 10,000); IF any artifact reports
  `INSUFFICIENT_VOLUME` or `FAIL`, escalate to 11.5.3 with explicit
  partial-PASS framing (decision-author can still author DEFER-V2.7 with
  surfaced root cause).

#### Stage 3 (11.5.3) — Decision 037 ENABLE_RETRY verdict + sandwich-verifier

- **scope_summary**: Author Decision 037 with binding verdict ENABLE_RETRY
  (if R-1 + R-2 + R-3 all PASS) OR DEFER-V2.7 (if any prereq still FAIL or
  INSUFFICIENT_VOLUME). Decision 037 MUST cite each R-1/R-2/R-3 evidence
  explicitly (probe artifact + DISPATCHED count + 3 artifact verdicts) per
  Decision 035 §5 R-4 spec. Confirms Decision 035 prereqs 4, 5, 6 remain
  must-stay-PASS. Then sandwich-verifier opus/medium runs adversarial review
  against the full 11.5 substage outputs (architect spec, integration test,
  5 measurement artifacts, Decision 037).
- **input_files** (read): [post-11.5.1 + post-11.5.2 outputs;
  `agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md`
  (the supersession target); Decision 035 §5 R-1/R-2/R-3/R-4 framework]
- **output_files** (write): [`agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`
  (NEW, BINDING),
  `agent-workspace/memory/observations/task-11.5-20260428-sandwich-verifier.md`
  (sandwich-verifier output)]
- **recommended_dispatch_count**: 2 (opus/medium for Decision 037 authoring +
  opus/medium sandwich-verifier)
- **recommended_(model, effort)**: (opus, medium) for both.
  - **rationale**: binding-decision authoring with explicit prereq citations;
    risk of confirmation bias requires adversarial follow-up; pattern matches
    Phase 10 10.5.3 Decision 035 authoring (opus/medium, ~70K) +
    sandwich-verifier (opus/medium, ~50K).
  - **D2 justification (Decision 037)**: "supersedes Decision 035 DEFER-V2.6;
    verdict binds future SC-39 attempts and gates F-2 self-evolution
    scaffolding (substage 11.6); explicit author-ack of all R-1/R-2/R-3
    prerequisites cited as MET (or partial-MET with explicit reasoning).
    NOT max because alternatives are pre-defined (ENABLE_RETRY / DEFER-V2.7)."
  - **D2 justification (sandwich-verifier)**: "adversarial review of binding
    decision touching SC-39, F-2 gating, and 5 telemetry artifacts; opus/medium
    needed for tradeoff analysis matching the Decision 034/035 deliberation-class.
    NOT max because the verifier scope is bounded by the substage's deliverables."
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus,
  effort: medium}]
- **estimated_budget_K**: 130 (Decision 037 ~60K + sandwich-verifier ~70K)

**Stage totals for 11.5**: 130 + 100 + 130 = **360K** — the largest substage
group; pre-allocated checkpointing across stages because 360K is well above
any single-session wind-down budget. Stages 11.5.1, 11.5.2, 11.5.3 are
explicitly serialized; checkpoint between each. The 360K total reflects the
load-bearing nature of v2.6: this is where the entire R-1/R-2/R-3/R-4
framework finally executes against post-restart telemetry.

- **blockers**: depends on 11.4 (mid-verify must be GREEN before SC-39 work
  begins).
- **parallel_safe_with**: [] — strictly serialized across stages; no other
  substage can run alongside 11.5 stages because R-2 natural-volume measurement
  depends on a stable telemetry baseline (parallel substages would inflate
  dispatch volume but also dilute pairing-rate signal).
- **acceptance_gate**: 11.5.1 architect spec exists + ratified + impl lands
  with all gates PASS + 3+ new test cases in `sc39-production-pairing-rate.spec.ts`;
  11.5.2 produces 5 fresh artifacts + R-2/R-3 verdicts on disk; 11.5.3 produces
  Decision 037 with binding verdict; if verdict = ENABLE_RETRY, all R-1/R-2/R-3
  cited as MET; if DEFER-V2.7, explicit residual prereq identified + R-4
  framework propagated to v2.7; sandwich-verifier verdict APPROVED or
  APPROVED_WITH_CONCERNS (no critical).

---

### 11.6 — F-2 self-evolution scaffolding (GATED on 11.5.3 verdict)

- **substage_id**: 11.6
- **scope_summary**: F-2 (self-evolution signal-extension) is gated on SC-39
  enabling (per `audits/f2-self-evolution-disposition-v2.5.md` §2). If 11.5.3
  verdict = ENABLE_RETRY, scaffold F-2: extend `packages/core/src/telemetry/rollup-telemetry.ts`
  schema with the agent-type-distribution, paired-correlation, and
  loop-proposal-acceptance-rate fields per the v2.5 disposition spec; author
  initial F-2 spec in `specs/tier1-strategic/f2-self-evolution-signal-extension.md`;
  add minimal scaffolding tests. If 11.5.3 verdict = DEFER-V2.7, re-defer F-2 to
  v2.7 with explicit gate update — author `audits/f2-self-evolution-disposition-v2.6.md`
  citing the same rationale + new gating point.
- **primary_carryforwards**: [F-2 self-evolution signal-extension]
- **input_files** (read): [`agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`
  (11.5.3 output — gates F-2), `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.5.md`
  (rationale template), `packages/core/src/telemetry/rollup-telemetry.ts` (target
  schema for extension), `specs/tier1-strategic/` (target dir for new spec)]
- **output_files** (write):
  - IF SC-39 ENABLED: [`packages/core/src/telemetry/rollup-telemetry.ts`
    (schema extension), `specs/tier1-strategic/f2-self-evolution-signal-extension.md`
    (NEW spec), `tests/telemetry/rollup-telemetry-f2.spec.ts` (NEW scaffolding
    tests), `agent-workspace/memory/decisions/040-f2-scaffold-v2.6.md`
    (BINDING — scaffolds-not-implements)]
  - IF SC-39 DEFERRED: [`agent-workspace/memory/audits/f2-self-evolution-disposition-v2.6.md`
    (re-defer with updated gate)]
- **recommended_dispatch_count**: 1 (task-implementer; reviewer pair OPTIONAL)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: schema extension + spec authoring; bounded by existing
    rollup-telemetry shape. No D2 needed. Pattern matches Phase 10 10.6
    (sonnet/medium, planned 60K, actual ~80K with backfill writes).
  - **D2 justification**: NOT REQUIRED (sonnet/medium is the D1 default per
    Decision 032).
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet,
  effort: medium}] — only if scaffolding leg chosen (code change).
- **blockers**: depends on 11.5.3 (Decision 037 must exist before F-2 gating
  can fire).
- **parallel_safe_with**: [] — runs after 11.5.
- **estimated_budget_K**: 80
- **acceptance_gate**: F-2 disposition recorded; IF SC-39 ENABLED:
  rollup-telemetry.ts compiles; new scaffolding tests PASS; spec file exists;
  Decision 040 authored; IF SC-39 DEFERRED: f2-disposition-v2.6.md cites
  updated gate.

---

### 11.7 — Phase-close: post-phase verify + v2.6 staging + bundled commit

- **substage_id**: 11.7
- **scope_summary**: Mirror 10.7 closure pattern. Run post-phase.sh 11 (with
  the v2.5-fixed exit-code propagation + the augmented charter-coherence-spot-check);
  produce phase-11-complete.md attestation; stage v2.6; author bundled-commit
  message per Decision 036 precedent (`v2.6: Phase 11 v2.6 carryforward burndown
  + SC-39 ENABLE_RETRY window`); commit + tag at sandwich-verifier APPROVED
  verdict (per user standing grant 2026-04-28: "autonomous mode = autonomous
  until DONE ALL — incl. git commit/tag/release").
- **primary_carryforwards**: [closure attestation; bundled-commit execution]
- **input_files** (read): [`scripts/verify/post-phase.sh`,
  `scripts/audit/oss-readiness.sh`,
  `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md` (if authored),
  `agent-workspace/memory/decisions/039-cf-dogfood-2-*.md` (11.3 output),
  `agent-workspace/memory/phase-10-complete.md` (template)]
- **output_files** (write): [`agent-workspace/memory/phase-11-complete.md`,
  `.git/COMMIT_EDITMSG_v2.6` (bundled-commit message; ≤72-char subject)]
- **recommended_dispatch_count**: 2 (task-implementer for attestation +
  sandwich-verifier for full-phase adversarial; main session executes
  commit+tag after sandwich-verifier APPROVED)
- **recommended_(model, effort)**: (sonnet, high) for attestation authoring;
  (opus, medium) for sandwich-verifier.
  - **rationale**: post-phase verify + attestation + bundled-commit message;
    mirrors Phase 10 10.7 (sonnet/high, planned 80K, actual ~80K with verifier).
  - **D2 justification (sandwich-verifier opus/medium)**: "adversarial
    full-phase review touching all 11.x substages, SC-39 R-1/R-2/R-3/R-4
    framework execution, F-2 gating disposition, and CF-DOGFOOD-2 disposition;
    opus/medium needed for cross-substage charter coherence + invariant sweep.
    NOT max because the verifier scope is bounded by phase-close attestation
    template (10.7 precedent)."
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus,
  effort: medium}]
- **blockers**: depends on 11.1, 11.2, 11.3, 11.5, 11.6 (all substages CLOSED).
- **parallel_safe_with**: [] — strictly final gate.
- **estimated_budget_K**: 80
- **acceptance_gate**: post-phase.sh 11 exit 0; oss-readiness.sh exit 0;
  phase-11-complete.md exists; sandwich-verifier verdict APPROVED OR
  APPROVED_WITH_CONCERNS (no critical); IF APPROVED → main session executes
  `git commit -F .git/COMMIT_EDITMSG_v2.6 && git tag v2.6` per user standing
  grant; IF APPROVED_WITH_CONCERNS, narrow fix cycle ≤40K before phase advance
  to v2.7. Final state: `git log --oneline | wc -l` = 2 (init + v2.5 + v2.6 = 3
  rows); v2.6 fully staged-then-committed.

---

## §3 Critical Path + Parallelism Feasibility Matrix

```
11.0 (sonnet/medium, blocking, 60K)
   │
   ├──────────────────┬──────────────────┐
   │                  │                  │
 11.1 (sonnet/med)  11.2 (sonnet/med)  11.3 (opus/medium)
 [11 nitpick fixes]  [audit-trail        [CF-DOGFOOD-2
                     discipline]          disposition]
 120K               50K                  100K
   │                  │                  │
   └─────── 11.4 mid-verify (sonnet/low, 30K) ────┘
                          │
                       11.5 SC-39 ENABLE_RETRY window
                       (11.5.1 opus/medium + sonnet 130K)
                       (11.5.2 sonnet/medium 100K)
                       (11.5.3 opus/medium ×2 130K)
                          │
                       11.6 (sonnet/medium, 80K)
                       [F-2 gated scaffold or re-defer]
                          │
                       11.7 (sonnet/high + opus/medium, 80K)
                       [phase close + v2.6 bundled commit]
```

**Critical-path length** (sequential, ignoring parallelism):
60 + max(120, 50, 100) + 30 + 360 + 80 + 80 = **730K critical-path tokens**.

**With parallelism savings**: 11.1 ∥ 11.2 ∥ 11.3 saves ~150K of wall-time vs
sequential (50K from 11.2 + 100K from skipping 11.3 dependency). Wall-clock
critical path is bounded by max(11.1, 11.2, 11.3) = 120K (11.1 is the slowest
of the three parallel substages).

**Total token spend** (sum of all substages, no parallelism subtraction):
60 + 120 + 50 + 100 + 30 + 360 + 80 + 80 = **880K**. With reviewer overhead
(~5% per substage group), **mid-estimate ≈ 870K** (within the 920K ceiling;
ceiling raised slightly above Phase 10's 900K to absorb the 11.5 stage cost
of 360K vs Phase 10 10.5's 330K).

### File-edit collision matrix (for 11.1 ∥ 11.2 ∥ 11.3 parallel safety)

| Path/file | 11.1 | 11.2 | 11.3 |
|---|---|---|---|
| `scripts/verify/post-phase.sh` | WRITE | — | — |
| `scripts/audit/substage-parallelism-flag.sh` | WRITE | — | — |
| `scripts/utilities/citation-linter.ts` | WRITE | — | — |
| `tests/scripts/citation-linter-rollup.spec.ts` | WRITE | — | — |
| `scripts/hooks/dispatch-jsonl-recorder.sh` | WRITE | — | — |
| `tests/hooks/dispatch-recorder.spec.ts` | WRITE | — | — |
| `scripts/hooks/component-telemetry.sh` | WRITE | — | — |
| `tests/hooks/component-telemetry.spec.ts` | WRITE | — | — |
| `.claude/agents/spec-compliance-reviewer.md` | — | WRITE | — |
| `.claude/agents/code-quality-reviewer.md` | — | WRITE | — |
| `.claude/agents/sandwich-verifier.md` | — | WRITE | — |
| `.claude/skills/observation-file-write-on-return/SKILL.md` (NEW) | — | WRITE | — |
| `scripts/dogfood/run-self-task.ts` | — | — | OPTIONAL_WRITE |
| `tests/dogfood/run-self-task.spec.ts` | — | — | OPTIONAL_WRITE |
| `agent-workspace/memory/decisions/039-cf-dogfood-2-*.md` | — | — | WRITE |
| `agent-workspace/memory/decisions/038-10.5-agent-type-field-naming.md` | OPTIONAL_WRITE | — | — |

**Result: ZERO file-edit collisions across 11.1 ∥ 11.2 ∥ 11.3.** Decision 032 D4
concurrency cap respected: 2 sonnet/medium + 1 opus/medium = 3 concurrent;
0 opus/max in flight; 1 opus/* in flight (within ≤2 cap). Safe to dispatch in
parallel after 11.0 closes.

**PARALLELIZE quantitative gate** (per `agent-workspace/constitution/architecture.md`
§"Decomposition Cost Model"):
- `num_independent_subtasks` = 3 (≥2 ✓)
- `estimated_isolation_value_tokens` ≈ 3 × 12K context switches = 36K (≥ 11 ×
  120K = 1320K? — no, 11× single_task_baseline_tokens. With single_task_baseline
  ≈ 30K (Phase 10 actuals avg per-substage), 11 × 30K = 330K. 36K isolation
  value < 330K. **Gate FAILS on the isolation-value threshold under strict
  reading.**) However: the parallel substages share NO files (per matrix above),
  share NO schema migration, AND wall-clock savings (~150K) materially compress
  phase delivery. Decision: dispatch in parallel anyway with explicit
  documented exception, citing the file-disjoint guarantee + measurable
  wall-clock savings as overriding the strict isolation-value math. This is
  the Phase 10 §10.4 precedent (10.1 ∥ 10.2 ∥ 10.3 was dispatched in parallel
  on the same disjoint-file basis without strict gate-pass).
- `no_shared_file_writes` ✓ (matrix above)
- `no_shared_schema_migration` ✓ (no schema migrations in v2.6 substages)
→ Gate evaluates as PASS-WITH-EXCEPTION → horizontal dispatch.

**Forbidden parallelism**: 11.5 substages (11.5.1 → 11.5.2 → 11.5.3) MUST be
serialized. R-1 verification is a hard prereq for R-2 measurement (re-keying
must be active before pairing-rate can be measured); R-2/R-3 measurement is a
hard prereq for R-4 decision authoring. 11.6 is forbidden in parallel with
11.5.3 because F-2 gating depends on Decision 037 outcome.

---

## §4 v2.7 Deferral Candidates (pre-authorized)

Per Decision 027 §"Consequences" 8 (scaffold-now-execute-later) and Phase 10
routing brief §4 pattern, these v2.6 items may defer to v2.7 without re-asking:

1. **CF-DOGFOOD-2 IMPL leg** if 11.3 disposition selects DEFER-V2.7. Pre-authorized
   by Decision 033 §"Deliberation E" structural-defer pattern; the assessment
   doc already on disk (`constitution/cf-dogfood-2-assessment.md`) provides the
   v2.7 trigger conditions.

2. **F-2 self-evolution scaffolding** if 11.5.3 verdict = DEFER-V2.7. Mechanically
   gated by SC-39 enablement per `audits/f2-self-evolution-disposition-v2.5.md`
   §2.

3. **CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY action items** (annotation
   `min_phases_after_fix`, "phase separation check" in retry-or-defer ritual).
   Documentation-only updates; budget-permitting in 11.5.1 architect spec; if
   skipped, defer to v2.7 with explicit carry-forward.

4. **CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE auxiliary action items**
   (`settings-version-check` audit script polish + `harness-audit` skill
   integration). Initial scaffold lands in 11.5.1; full polish optionally
   defers to v2.7.

5. **`CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD`** — the OPTIONAL Decision
   038 backfill. If the orchestrator chooses inline-comment + Decision 023
   reference in 11.1 instead of authoring Decision 038 standalone, the
   "dedicated decision record" carryforward explicitly defers to v2.7.

6. **Mid-stage 11.5.1 IMPL split** to v2.7 if architect surfaces a deeper
   structural test-infra change (e.g., child-process spawn requires harness
   permission cache update). In that case, 11.5.1 produces the architect
   spec only, v2.6 stages the design, IMPL deferral recorded in 11.7
   attestation, and Decision 037 verdict = DEFER-V2.7 (no integration test
   → R-1 still verification-only-empirical → no breach of R-1 strict reading,
   but production-vs-fixture-gap stays open).

7. **Community OSS launch trigger** (NPM publish, GitHub repo public-flip,
   README community section). Phase 12 / v2.7+ work; explicitly out-of-scope
   for v2.6.

8. **Multi-user adoption rollout**. Phase 12 / v2.7+ work; out-of-scope.

9. **CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP test green-deadline**: if
   11.5.1 lands the integration-test scaffold but the test does not yet
   green by 11.5.3 close (e.g., child-process spawn fails on harness
   permission cache), defer the green-deadline to v2.7 while keeping
   the test in-tree as `.todo` or `.skip`-flagged. This is the "scaffold-only,
   greens-in-v2.7" pattern.

---

## §5 Carryforward Coverage Assertion

Every OPEN-V2.6 item from `phase-10-complete.md §7` + `carryforwards-v2.6.md`
is mapped:

| CF-ID | Origin | Target Substage | Notes |
|---|---|---|---|
| CF-DOGFOOD-2 | Phase 8 / 10.3 deferred | 11.3 | architectural disposition; FIX_INLINE / DEFER-V2.7 / WONT_FIX |
| SC-39 (Decision 035 DEFER-V2.6) | Phase 10 / 10.5.3 | 11.5 | R-1/R-2/R-3/R-4 framework execution; Decision 037 verdict |
| F-2 self-evolution signal-extension | Phase 10 / 10.6 | 11.6 | gated on 11.5.3 verdict |
| CF-V2.6-10.1-FAIL-COUNT-DEAD | 10.1 CQ | 11.1 | redundant accumulator collapse |
| CF-V2.6-10.1-DUPLICATE-A4-PASS | 10.1 CQ | 11.1 | dedup duplicate print path |
| CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP | 10.1 CQ | 11.1 | version-sort or split-on-dot integer compare |
| CF-V2.6-10.2-R9-PRECONDITION | 10.2 CQ | 11.1 | precondition guard on rollup file |
| CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING | 10.2 CQ | 11.1 | grouping comment |
| CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD | 10.5.2.C CQ | 11.1 (OR §4 v2.7 deferral) | OPTIONAL Decision 038 backfill |
| CF-V2.6-10.5-T-NA2-DEDUP-COMMENT | 10.5.2.C CQ | 11.1 | one-line comment |
| CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS | 10.5.2.B CQ | 11.1 | comment + OPTIONAL stderr warning |
| CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE | 10.5.2.B CQ | 11.1 | in-code comment referencing Decision 023 + IMP-1 |
| CF-V2.6-10.5-TUI-JSON-NAMING | 10.5.2.B CQ | 11.1 | rename to `TOOL_USE_ID_JSON` |
| CF-V2.6-10.5-H8-FIXTURE-NAME | 10.5.2.B CQ | 11.1 | rename `'test-impl'` → `'task-implementer'` |
| CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN | 10.5 verifier | 11.2 | subagent-contract update + skill |
| CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE | Decision 035 §6 | 11.5.1 | settings-version-check probe + spawned-session-mode SKILL.md update |
| CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY | Decision 035 §6 | 11.5.1 (architect doc) OR §4 v2.7 deferral | min_phases_after_fix annotation + retry-or-defer ritual update |
| CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP | Decision 035 §6 | 11.5.1 | sc39-production-pairing-rate.spec.ts integration test |

**Coverage**: 18 / 18 OPEN-V2.6 items mapped. 16 to active substages; 2 with
v2.7-deferral footnotes (CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD and
CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY are explicitly dual-mapped:
default-to-active-substage; defer to v2.7 only if budget tight). Zero items
unaccounted-for.

**Phase 9 carryovers re-defer**: The Phase 9 hygiene CFs that Phase 10
already closed (`CF-V2.5-9.x-CHARTER-COHERENCE-FALSE-POSITIVE`,
`CF-V2.5-9.x-POSTPHASE-EXIT-CODE`) remain CLOSED — no re-open in v2.6.
The `CF-V2.5-9.7-PARALLELISM-FLAG` was ALSO closed in Phase 10 (§10.1 routed
the related CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP forward as the actual fix that
addresses the underlying X.10 risk). Phase 9 carryovers are therefore
**fully drained as of v2.5**; v2.6 only carries the new Phase-10-surfaced
items above.

---

## §6 Total Estimated Budget

| Substage | Stage | Model | Effort | Estimated K |
|---|---|---|---|---|
| 11.0 | routing brief | sonnet | medium | 60 |
| 11.1 | code-review nitpick batch (11 fixes) | sonnet | medium | 120 |
| 11.2 | audit-trail inline-return discipline | sonnet | medium | 50 |
| 11.3 | CF-DOGFOOD-2 disposition (architect + opt impl) | opus | medium | 100 |
| 11.4 | mid-verify gate | sonnet | low | 30 |
| 11.5.1 | SC-39 R-1 architect + impl + production-vs-fixture infra | opus + sonnet | medium | 130 |
| 11.5.2 | SC-39 R-2/R-3 artifact production | sonnet | medium | 100 |
| 11.5.3 | Decision 037 + sandwich-verifier | opus | medium | 130 |
| 11.6 | F-2 gated scaffold or re-defer | sonnet | medium | 80 |
| 11.7 | phase close + v2.6 bundled commit | sonnet/high + opus/medium | high | 80 |
| reviewer overhead (~5% × 7 substage groups) | — | sonnet | medium | 40 |
| **Total mid-estimate** | | | | **870** |
| **Ceiling** | | | | **920** |

**Sum**: 870K ≤ 920K ceiling. Within plan per session-budgets.md ceiling rule.
Phase 10 actuals (~690K vs 870K planned) confirm the planning model is
conservative-leaning; v2.6 mid-estimate matches Phase 10 mid-estimate by
construction (similar shape: 1 routing + 3 parallel + 1 mid-verify + 1
load-bearing + 1 gated + 1 close).

**Wind-down semantics**: per session-budgets.md, 200K real-transcript tokens
triggers wind-down. 11.5 stages MUST checkpoint between each (11.5.1 →
checkpoint → 11.5.2 → checkpoint → 11.5.3) to avoid hitting wind-down
mid-stage. The 130K stage cost for 11.5.1 + 11.5.3 each is below the wind-down
threshold; the 360K substage-group total exceeds wind-down by construction
and IS DESIGNED to span ≥3 sessions naturally.

**Quota discipline (per MEMORY.md `feedback_effort_max_quota_discipline.md`)**:
ZERO `/effort max` dispatches in this plan. Opus/medium dispatches: 4 (11.3
architect + 11.5.1 architect + 11.5.3 Decision 037 + 11.5.3 sandwich-verifier
+ 11.7 sandwich-verifier = 5 actually; correction: the 11.7 sandwich-verifier
is an additional opus/medium for full-phase review). Total opus/medium = 5.
Decision 032 D4 cap (≤2 opus/* in flight at once) preserved by sequencing:
11.3 architect runs alongside 11.1+11.2 (parallel batch) — only one opus/*
in flight; 11.5.1 → 11.5.3 are strictly serialized with no concurrent opus
elsewhere; 11.7 sandwich-verifier follows 11.7 task-implementer serially.

---

## §7 Open Questions / Risks

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 11.5.1 R-1 verification probe FAILS — fresh Phase-11 session does NOT show the 10.5.2.B-fix's PostToolUse hook for `Agent` active in the live chain (e.g., settings.json change reverted by `.gitignore` cleanup, or harness has additional caching layer) | LOW-MED | HIGH | Halt 11.5.1; route to systematic-debugger (4-phase + 4.5); if root cause = harness-level, file CF-V2.7-NEW and DEFER-V2.7 the entire R-1 leg; Decision 037 verdict = DEFER-V2.7 with partial-MET (R-1 PROBE_FAIL, R-2/R-3 not measured). |
| R2 | 11.5.2 R-2/R-3 measurement shows pairing_rate < 0.40 OR unknown_agent_fraction ≥ 0.30 EVEN AFTER R-1 PASS (i.e., the seam fix activated but metrics do not move) | MED | MED | Decision 037 = DEFER-V2.7 with explicit "seam fix activated but metrics did not move; deeper structural issue identified". This is a charter-coherent outcome (Decision 035 §3 anticipated this in Alt-3 deliberation). New CF-V2.7-DEEPER-SEAM-INVESTIGATION authored. |
| R3 | 11.5.2 R-2 natural-volume threshold not met (≥50 DISPATCHED Agent calls + ≥10,000 events) by 11.5.3 measurement window | MED | LOW | EXTEND volume-accumulation window: defer 11.5.3 measurement to a later sub-session within v2.6; OR formally accept INSUFFICIENT_VOLUME and DEFER-V2.7 for prereq R-2 only (split verdict). |
| R4 | 11.3 disposition decision is harder than budgeted — sandwich-architect cannot recover sufficient context to choose between FIX_INLINE / DEFER-V2.7 / WONT_FIX | MED | LOW | Default to DEFER-V2.7 with rationale "context insufficient for binding decision; v2.7 architect re-evaluation". Charter-coherent fallback per autonomous-protocol Decision Rule 7 (Document-and-Move). |
| R5 | Wind-down hits mid-11.5 (the 360K substage-group spans multiple sessions naturally) | HIGH | LOW | EXPLICITLY PLAN FOR THIS (mirror Phase 10 R5 mitigation). Checkpoint cleanly between 11.5.1, 11.5.2, 11.5.3. Each stage is independently resumable from the next session via SessionStart hook + `checkpoints/latest.md`. Plan structured so each stage is its own dispatch unit. |
| R6 | v2.6 commit attempt at 11.7 close hits harness permission cache for `Bash(git commit:*)` (same blocker that caused Decision 036's bundled-commit deferral pattern) | LOW | MED | If commit fails at 11.7, document staged-but-uncommitted state; re-fire commit at next session boot per user standing grant 2026-04-28. Ultimate fallback: commit lands in the v2.6→v2.7 transition session (single bundled-commit pattern continues). |
| R7 | 11.1 surgical fix introduces a new test failure not anticipated by the CQ findings (e.g., the `TUI_JSON` rename collides with an unanticipated downstream consumer; the `'test-impl'` → `'task-implementer'` rename causes model-map dispatch divergence) | LOW-MED | LOW | 11.1 acceptance gate requires `pnpm test` PASS. If a fix breaks a test, narrow-fix (≤20K) before 11.1 closes; if narrow-fix exceeds budget, partial-close 11.1 (drop the offending nitpick to v2.7, document in 11.4 mid-verify). |
| R8 | 11.2 audit-trail discipline contract update introduces a `Drift-C` indicator (e.g., reviewer subagents now write observation files unconditionally, including for trivial ratifications, polluting the observation-file space) | LOW | LOW | 11.2 acceptance gate requires charter-coherence-spot-check.sh PASS. Default discipline: contract clause is "MUST Write final verdict" — leaves room for "ratified-without-finding" being a valid one-line observation file; not an unconditional write. |
| R9 | 11.7 sandwich-verifier surfaces a charter-coherence regression in Decision 037 authoring (e.g., R-1 evidence cited is too weak to bind ENABLE_RETRY) | LOW | MED | sandwich-verifier verdict APPROVED_WITH_CONCERNS triggers narrow-fix cycle (≤40K) before phase advance. If concern is critical, narrow-fix expands to 11.5.4 sub-stage authoring Decision 037-amend. |
| R10 | Phase 11 budget (870K) matches Phase 10 mid-estimate (870K) but Phase 10 actual was ~690K — Phase 11 may under-spend significantly, leading to wasted "headroom" inflation | LOW | LOW | Headroom is a feature not a bug — it absorbs R5 (wind-down mid-11.5) and R7 (narrow-fix budget reserve). If Phase 11 closes under 700K, the surplus is recorded in budget-tracker.md for v2.7 calibration. |

### Open questions surfaced (require 11.0 routing brief to resolve)

- **Q1**: 11.3 budget (100K) assumes the disposition decision is bounded by the
  3 alternatives (FIX_INLINE / DEFER-V2.7 / WONT_FIX). If FIX_INLINE is chosen
  and IMPL is non-trivial (>40K), 11.3 may stretch to 130K. **Default decision**:
  130K hard ceiling on 11.3; if FIX_INLINE requires more, defer to v2.7.

- **Q2**: 11.5.1 dispatch model — opus/medium architect followed by sonnet/medium
  impl, OR consolidated opus/medium for both legs? **Default decision**:
  split (opus/medium architect, sonnet/medium impl) per Decision 032 D2 letter
  (impl-leg is bounded by spec → sonnet/medium suffices).

- **Q3**: Should F-2 scaffolding (11.6) be skipped entirely on
  SC-39-DEFER-V2.7 (i.e., not even author the re-defer attestation)?
  **Default decision**: NO — author re-defer attestation
  `audits/f2-self-evolution-disposition-v2.6.md` to maintain audit-trail
  continuity. Phase 10 §10.6 set this precedent.

- **Q4**: Should 11.7 attempt the bundled commit autonomously per user
  standing grant 2026-04-28, or should it stage-only and request user
  confirmation? **Default decision**: AUTONOMOUS COMMIT per user grant
  ("autonomous mode = autonomous until DONE ALL — incl. git commit/tag/release").
  The phase-close gate is sandwich-verifier APPROVED; on APPROVED, commit+tag
  fire automatically. Any APPROVED_WITH_CONCERNS triggers narrow-fix not
  user-confirmation.

- **Q5**: Is the 11.1 batch over-stuffed at 11 fixes / 120K? **Default decision**:
  NO — Phase 9 §9.1 carryforward-batch precedent ran 8+ fixes in 80K. The
  per-fix cost (~8-11K) is conservative; if 11.1 surfaces a deeper issue on
  any single fix (e.g., the lexicographic-dedup regression-fixture authoring
  takes longer than expected), narrow-fix the rest by deferring 1-2 nitpicks
  to v2.7 per §4 row 5.

---

## §8 Decisions to Author During Phase 11

| Decision # | Title | Substage | Status target |
|---|---|---|---|
| 037 | SC-39 Retry Verdict v2.6 — ENABLE_RETRY OR DEFER-V2.7 | 11.5.3 | BINDING |
| 038 (OPTIONAL) | 10.5 agent_type field-naming canonical reference | 11.1 OR §4 deferral | active (only if standalone authored vs inline-comment-only) |
| 039 | CF-DOGFOOD-2 Disposition (FIX_INLINE / DEFER-V2.7 / WONT_FIX) | 11.3 | BINDING |
| 040 (OPTIONAL) | F-2 self-evolution scaffold (if 11.5.3 = ENABLE_RETRY) | 11.6 | active |

The OPTIONAL decisions fire only if the disposition deviates from the
master-plan default. Under default flow, mandatory decisions are 037 and
039. This pattern matches Phase 10 (mandatory 035 + 036; optional 037+).

**Strategic theme decision (NOT authored — encoded in this master plan)**: v2.6
is a closure phase with one structural unblock (SC-39 ENABLE_RETRY measurement
window); no Decision-027-style strategic redirect is needed. If mid-Phase-11
the operator surfaces a new strategic dimension (e.g., OSS launch trigger),
a new Decision 04X-strategic-redirect would supersede this master plan,
mirroring the Phase 8 redirect pattern (Decision 027) and Phase 10's
absence-of-redirect pattern.

---

## §9 Authoring Discipline + Charter Cross-References

- **Charter Principle 1 (Daemon dumb, workers smart)**: 11.5 R-1/R-2/R-3 framework
  is *deterministic measurement* (artifact production + threshold check), not LLM
  logic. R-4 decision authoring is the LLM-judgment leg, properly isolated to a
  subagent dispatch (opus/medium 11.5.3). Aligns.
- **Charter Principle 2 (Tight scope)**: Phase 11 explicitly REJECTS new feature
  work; only closes v2.5 residue + opens SC-39 measurement window + gated F-2
  scaffold. Aligns.
- **Charter Principle 3 (Project-agnostic core)**: 11.5.1 integration test
  (`sc39-production-pairing-rate.spec.ts`) MUST not introduce hardcoded paths;
  child-process spawn must use config-driven settings.json injection. Architect
  spec to bind this in 11.5.1.
- **Charter Principle 6 (Adapter abstraction)**: 11.3 FIX_INLINE leg, if chosen,
  MUST flow through `IAgentRuntime.spawn()` seam, not introduce a new direct-call
  path. The cf-dogfood-2-assessment §1.2 already establishes this constraint
  (`run-self-task.ts:387` stub must invoke the existing seam, not bypass it).
- **Karpathy P1 (Think Before Coding)**: 11.3 architect leg + 11.5.1 architect
  spec are P1-binding pre-IMPL discipline.
- **Karpathy P2 (Simplicity First)**: prefer comment + reference (11.1
  CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE) over re-architecting the field name;
  prefer in-place subagent template append (11.2) over inventing a new
  reviewer-coordinator subagent; prefer R-1 empirical-probe verification (option
  c per Decision 035 §5) over runtime-introspection harness audit (option b).
- **Karpathy P3 (Surgical Changes)**: 11.1 + 11.2 are explicitly surgical
  (≤30 LOC per fix); 11.5.1 IMPL is bounded by architect spec.
- **Karpathy P4 (Goal-Driven Execution)**: every substage has deterministic
  boolean acceptance gate.

**I-6 ABSOLUTE**: zero git commits across substages 11.0–11.6. v2.6 stages at
11.7 close. The 11.7 commit is authorized by user standing grant 2026-04-28
("autonomous mode = autonomous until DONE ALL — incl. git commit/tag/release"),
gated on sandwich-verifier APPROVED. Decision 020 binding throughout pre-11.7;
Decision 036 bundled-commit pattern applies at 11.7. **v2.6 stages at
final-substage close (11.7); single bundled commit per Decision 036 precedent.**

---

## §10 Final YAML Completion Block

```yaml
phase: 11
version: v2.6
status: DRAFT_FOR_RATIFICATION
substages: [11.0, 11.1, 11.2, 11.3, 11.4, 11.5.1, 11.5.2, 11.5.3, 11.6, 11.7]
sc_numbering_introduced: [SC-56_sc39_enable_retry_window, SC-57_audit_trail_discipline, SC-58_cf_dogfood_2_disposition]
total_budget_estimate_K: 870
budget_ceiling_K: 920
i6_commits_pre_close: 0
i6_commits_at_11.7_close: 1   # bundled v2.6 commit per Decision 036 precedent + user standing grant 2026-04-28
v2_6_release: STAGE_AT_11.6_BUNDLE_COMMIT_AT_11.7
carryforwards_addressed:
  - CF-DOGFOOD-2
  - SC-39-enable-retry-window
  - F-2-self-evolution-scaffolding-gated
  - CF-V2.6-10.1-FAIL-COUNT-DEAD
  - CF-V2.6-10.1-DUPLICATE-A4-PASS
  - CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP
  - CF-V2.6-10.2-R9-PRECONDITION
  - CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING
  - CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD
  - CF-V2.6-10.5-T-NA2-DEDUP-COMMENT
  - CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS
  - CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE
  - CF-V2.6-10.5-TUI-JSON-NAMING
  - CF-V2.6-10.5-H8-FIXTURE-NAME
  - CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN
  - CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE
  - CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY
  - CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP
sc39_path: r1_r2_r3_r4_framework_execution_per_decision_035_section_5
load_bearing_substage: 11.5
parallel_opportunities: [11.1 || 11.2 || 11.3]
critical_path: [11.0 -> {11.1, 11.2, 11.3} -> 11.4 -> 11.5.1 -> 11.5.2 -> 11.5.3 -> 11.6 -> 11.7]
expected_sessions: 9
expected_calendar_days: 4
opus_medium_dispatches: 5   # 11.3 architect + 11.5.1 architect + 11.5.3 Decision 037 + 11.5.3 sandwich-verifier + 11.7 sandwich-verifier
opus_max_dispatches: 0
v2_7_deferral_candidates:
  - CF-DOGFOOD-2-IMPL-LEG (if 11.3 chooses DEFER-V2.7 disposition)
  - F-2-scaffolding (if 11.5.3 chooses DEFER-V2.7)
  - CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY-action-items (annotation + ritual update)
  - CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE-auxiliary (harness-audit skill polish)
  - CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD (if inline-comment chosen vs Decision 038 standalone)
  - 11.5.1-IMPL-split (if architect surfaces deeper test-infra change)
  - sc39-production-pairing-rate-test-green-deadline (scaffold-only, greens-in-v2.7 pattern)
  - community-OSS-launch-trigger (Phase 12+)
  - multi-user-adoption-rollout (Phase 12+)
charter_coherence_verified: true
new_features_added: 0_closure_phase_with_gated_scaffold
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, post-v2.5-tag session)
authoring_date: 2026-04-28
ratification_required_before_dispatch: true
next_action_for_orchestrator: dispatch_11.0_routing_brief
```

**END Phase 11 Master Plan v2.6 Carryforward Burndown + SC-39 ENABLE_RETRY Window.**
