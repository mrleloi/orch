---
title: Phase 12 Master Plan — v2.7 Self-Application Priority + USER-CRITICAL Closure
phase: 12
version: v2.7
status: DRAFT_FOR_RATIFICATION
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, Session post-Phase-11-close)
authoring_date: 2026-04-28
prior_phase: 11 (v2.6 closed; phase-11-complete.md authored 2026-04-28; commit 230929e + tag v2.6 LIVE on disk)
authority:
  - PROJECT_CHARTER.md (immutable invariants; especially Principle 5 CLI-subprocess + Principle 8 reusable-without-forking)
  - tasks/feat_04_continue_before_phase_8/user_prompt.txt (USER-CRITICAL items 1.5, 1.6, 1.7)
  - Decision 040 BINDING (CF-DOGFOOD-2 R-039.5 USER OVERRIDE; priority inversion — CF-DOGFOOD-2 = Phase 12 PRIORITY 1; SC-39 W-1 demoted)
  - agent-workspace/constitution/user-intent-coherence.md BINDING (master-planner phase-entry checklist §D)
  - Decision 037 BINDING (SC-39 DEFER-V2.7; W-1/W-2/W-3/W-4 framework remains intact; priority demoted by Decision 040)
  - Decision 039 BINDING-PARTIAL (CF-DOGFOOD-2 disposition framework retained; §"Re-attempt Prerequisites" priority logic SUPERSEDED by Decision 040)
  - Decision 027 §"Consequences" 8 (scaffold-now-execute-later; v2.7 is the EXECUTE horizon for self-application)
  - Decision 032 (D1-D6 effort routing; D2 justifications mandatory for opus/medium+)
  - Decision 036 BINDING (bundled commit pattern; v2.7 = single bundled commit per precedent)
  - phase-11-complete.md §7 (open carryforwards inventory: 7 items; 3 multi-cycle structural-defer + 4 surfaced)
  - agent-workspace/constitution/cf-dogfood-2-assessment.md (Phase 10 §10.3 architectural assessment; §3.4 Option D + §3.2 Option B-minimal)
inputs_consumed:
  - tasks/feat_04_continue_before_phase_8/user_prompt.txt (USER-CRITICAL inventory; mục 1.5 + 1.6 + 1.7)
  - agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md (BINDING priority inversion; SUPERSEDES Decision 039 §"Re-attempt Prerequisites")
  - agent-workspace/constitution/user-intent-coherence.md (§B inventory + §C severity tier + §D phase-entry checklist + §E anti-pattern catalogue + §F audit hook spec)
  - agent-workspace/memory/phase-11-complete.md (Phase 11 close attestation)
  - agent-workspace/memory/carryforwards-v2.7.md (working list of 7 carryforwards)
  - agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md (SC-39 DEFER-V2.7; W-framework gate; §6 candidate fix paths W-1-A..W-1-D)
  - agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md (CF-DOGFOOD-2 disposition framework; §4.3 R-039.1..R-039.5)
  - agent-workspace/constitution/cf-dogfood-2-assessment.md (515 LOC; §3.4 Option D = FIX_INLINE_MINIMAL+RUN_CONTROL_FLAG; §3.2 Option B-minimal; §5 dispatch envelope template)
  - scripts/dogfood/run-self-task.ts (line 387: `dispatch_deferred_to: '8.5.3'` stub; live-grep evidence Mandate A)
  - agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md (structural template; §0..§9 sections mirror)
  - agent-workspace/constitution/architecture.md §"Decomposition Cost Model" (PARALLELIZE gate)
  - agent-workspace/constitution/session-budgets.md (250K hard cap; wind-down at 200K real)
  - PROJECT_CHARTER.md (immutable invariants)
i6_compliance: zero git commits across 12.0–12.10; v2.7 stages at final-substage close (12.10) with bundled commit per Decision 036 precedent
budget_estimate_tokens: 870000
budget_ceiling_tokens: 880000
expected_sessions: 11
expected_calendar_days: 4
parallel_opportunities: [12.5 || 12.6 (after 12.4); 12.9 (housekeeping disjoint)]
critical_path: 12.0 -> 12.1 -> 12.2 -> 12.3 -> 12.4 -> {12.5 || 12.6} -> 12.7 -> 12.8 -> 12.9 -> 12.10
user_critical_items_addressed: [user_prompt.txt §1.5 (12.1+12.3), §1.6 (12.5), §1.7 (12.6)]
phase_0_5_telemetry_rollup_check: SKIPPED — agent-workspace/memory/phase-11-routing-recommendations.md does not exist on disk (verified via Glob 2026-04-28). No rollup proposals to accept/reject. This is admissible per planner Phase 0.5 ("If the file does not exist (e.g., planning Phase 2 — no Phase-1 recommendations yet), skip this phase silently."). Phase-12 close-substage 12.10 SHOULD author phase-12-routing-recommendations.md if telemetry signal materialises during 12.4–12.6.
---

# Phase 12 Master Plan — v2.7 Self-Application Priority + USER-CRITICAL Closure

> Phase 12 is the **v2.7 self-application priority** phase — the cycle that closes
> the 4-cycle CF-DOGFOOD-2 defer pattern, executes the proof-of-concept "Orch tự
> code Orch" that user_prompt.txt mục 1.5 has been waiting for since Phase 8 entry,
> closes USER-CRITICAL multi-user namespace work (mục 1.6) and community-sharing
> prep (mục 1.7), and — only AFTER the user-priority items land — circles back
> to SC-39 W-1 telemetry-quality work, F-2 disposition, and housekeeping
> carryforwards. Decision 040 priority order is BINDING throughout.
>
> I-6 ABSOLUTE preserved (Decision 020). v2.0–v2.6 commit baseline persists
> (4 commits: init / v2.5 / signoff / v2.6); v2.7 stages at 12.10 close,
> single bundled commit per Decision 036 precedent.

---

## §0 Phase Identity — Why This Phase Looks Different From Phase 11

Phase 11 was a **carryforward burndown phase**: 18 items in, 16 closed, 4 forward.
The shape was "fix-then-bundle". Phase 12 is structurally different in two
dimensions:

1. **USER-CRITICAL priority first** (Decision 040 §3 BINDING). The 4-cycle
   CF-DOGFOOD-2 defer was a procedural-gate failure (`user-intent-coherence.md`
   §A root cause). Phase 12 opens by fixing the procedural gate (12.0 master plan
   reads `user_prompt.txt` per `user-intent-coherence.md` §D mandate; 12.2 ships
   the audit hook that prevents the gap from re-emerging) and ships the
   USER-CRITICAL items (1.5 + 1.6 + 1.7) BEFORE returning to telemetry-quality
   work (SC-39 W-1) or housekeeping.

2. **Self-application transition** (Decision 040 §3 priority 2). Substages 12.3+
   MUST dispatch through the Orch dogfood harness — `claude --rc` subprocess via
   `IAgentRuntime.spawn()` — rather than via Claude Code's Agent tool. This is
   the proof-of-concept user has been requesting since Phase 8 entry. At minimum
   3 substages run end-to-end through Orch dispatch, producing real
   `agent-workspace/traces/dogfood-*.jsonl` files that satisfy Decision 040 §6
   gate G4.

The two dimensions reinforce each other: the proof-of-concept (dimension 2) is
itself the closure of user_prompt.txt mục 1.5 (dimension 1). Successful 12.3
satisfies BOTH G4 (acceptance gate of Decision 040) and the user-intent-coherence
§D.4 attestation requirement for mục 1.5.

**Theme** (one line): *"Wire step 9; ship the audit hook; self-apply the rest of
the phase; close the 3 USER-CRITICAL items; bundle a single v2.7 commit."*

**What this phase is NOT**: not an SC-39 W-1 priority phase (Decision 040 §3
demotes it to priority 5); not an F-2 enablement phase (gated on SC-39); not a
new-feature phase (no charter-redirect equivalent of Decision 027). The
8-dimension framing from Decision 027 remains structurally satisfied as of
Phase 11 close — every dimension has at least scaffold-level landing — and v2.7
adds EXECUTE on the self-application dimension that has been scaffold-only
since Phase 8.

---

## §1 Substage Decomposition (12.0 — 12.10)

Eleven substages. Total budget 870K mid-estimate / 880K ceiling. Critical path
is mostly serial because (a) 12.1 is a hard structural prereq for 12.3+
(self-application requires step-9 wired); (b) 12.2 is a hard structural prereq
for 12.10 (post-phase.sh A.9 user-intent-coherence-check gate must be in place
before phase close); (c) 12.4 SC-39 W-1 empirical discovery is gated on
real dispatches happening from 12.3 (dispatches feed real
`tool_response.content[0].text` payloads that W-1 needs to inspect).

---

### 12.0 — Phase 12 routing brief + master-planner phase-entry user-intent attestation

- **substage_id**: 12.0
- **scope_summary**: This master-planner session itself. Read all
  `tasks/*/user_prompt.txt` files (per `user-intent-coherence.md` §D.1 mandate);
  build USER-CRITICAL attestation table mapping each item to a Phase 12 substage
  (per §D.2); ratify per-substage routing using the phase-11-routing-brief.md
  schema; persist `phase-12-routing-brief.md` ≥ 100 LOC with the §"User-Intent
  Coherence" section per §D.4. Executed inline by this dispatch (the
  master-planner agent that authored this very document). No follow-up subagent.
- **primary_carryforwards**: [routing meta-task; addresses procedural-gate gap
  identified in Decision 040 §4]
- **input_files** (read): [
    `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (USER-CRITICAL
      inventory),
    `agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md`
      (priority inversion BINDING),
    `agent-workspace/constitution/user-intent-coherence.md` (§A..§G; §D phase-entry
      checklist),
    `agent-workspace/memory/phase-11-complete.md`,
    `agent-workspace/memory/carryforwards-v2.7.md`,
    `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`,
    `agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md`,
    `agent-workspace/constitution/cf-dogfood-2-assessment.md`,
    `scripts/dogfood/run-self-task.ts:387` (the stub site),
    `agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md`
      (structural template)
  ]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/phase-12-v2.7-self-application-priority.md`
      (this file),
    `agent-workspace/memory/phase-12-routing-brief.md` (≥ 100 LOC; §"User-Intent
      Coherence" section mandatory),
    `agent-workspace/memory/sessions/2026-04-28-task-12.0-master-plan.md`,
    `agent-workspace/memory/budget-tracker.md` (append session row),
    `agent-workspace/memory/current-execution.md` (active_phase = Phase 12)
  ]
- **recommended_dispatch_count**: 0 (executed inline by current master-planner)
- **recommended_(model, effort)**: (opus, medium) — current dispatch.
  - **rationale**: Phase 12 master plan is judgment-dense (USER-CRITICAL
    priority order, 11 substages, 3 USER-CRITICAL items must each map to a
    substage with attestation, Decision 040 priority inversion must be encoded
    correctly). Pattern matches Phase 11 11.0 (opus/medium, planned 60K, actual
    ~60K).
  - **D2 justification (per Decision 032)**: "Master-plan authoring at v2.7 entry
    binds 11 substages totalling ≤880K + USER-CRITICAL attestation mandate.
    First master-plan after Decision 040 priority-inversion ratification — must
    correctly encode the inversion. NOT max because the inversion is already
    explicitly stated in Decision 040 §3 + the substage decomposition target is
    pre-specified (12.0 → 12.10) in the dispatch envelope."
- **reviewer_pairs**: none — master-plan + routing brief are author-only
  artifacts; sandwich-architect ratification optional and budget-permitting
  (skip by default per Phase 11 precedent).
- **blockers**: none — first substage; gates all downstream.
- **parallel_safe_with**: [] — gates all downstream substages.
- **estimated_budget_K**: 60
- **acceptance_gate**: this master plan exists ≥ 600 LOC at the documented path;
  routing brief exists ≥ 100 LOC with §"User-Intent Coherence" section
  enumerating USER-CRITICAL items 1.5/1.6/1.7 with substage mapping (per
  `user-intent-coherence.md` §D.4); session note authored at the documented
  path; budget tracker appended; current-execution updated; live-grep evidence
  baseline (Mandate A) captured in §3 below.

---

### 12.1 — Wire step 9: replace `run-self-task.ts:387` stub with real `IAgentRuntime.spawn()`

- **substage_id**: 12.1
- **scope_summary**: Land Decision 040 §6 acceptance gate **G3**. Replace
  `scripts/dogfood/run-self-task.ts:387` step-9 stub
  (`dispatch_deferred_to: '8.5.3'`) with real `IAgentRuntime.spawn()`
  invocation. **Default option: §3.4 Option D** (FIX_INLINE_MINIMAL +
  RUN_CONTROL_FLAG; profile-flag default OFF; ~90 LOC delta) per
  cf-dogfood-2-assessment.md §3.4. **Fallback option: §3.2 Option B-minimal**
  (~80 LOC delta; no flag) if the architect determines the run-control flag
  introduces unwanted complexity. Architect chooses. Implementer lands.
  Reviewer pair runs (spec-compliance + code-quality). Sandwich-verifier
  acceptance-gates the result.
- **primary_carryforwards**: [`CF-DOGFOOD-2` (4-cycle structural-defer; closing)]
- **user_critical_addressed**: user_prompt.txt §1.5 ("phase 8 trở đi nên thực sự
  được tiếp cận bằng cách dùng chính dự án này") — PARTIAL (12.1 lands the
  capability; 12.3 demonstrates end-to-end use)
- **input_files** (read): [
    `agent-workspace/constitution/cf-dogfood-2-assessment.md` (§3.4 Option D +
      §3.2 Option B-minimal + §5 dispatch envelope template),
    `agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md`
      (priority + acceptance gates),
    `scripts/dogfood/run-self-task.ts` (490 LOC; line 387 stub site),
    `tests/dogfood/run-self-task.spec.ts` (T1–T11 unit tests; T9 must continue
      to pass under stub-mode when flag OFF),
    `packages/core/src/domain/types/runtime.ts` (IAgentRuntime interface; lines
      111–156),
    `packages/core/src/modules/sessions/session-manager.ts:141` (`runSession()`
      surface),
    `packages/core/src/modules/sessions/claude-code-adapter.ts:148` (concrete
      adapter; reuses existing `spawn` + SIGTERM→SIGKILL path),
    `packages/core/src/dogfood/envelope-schema.ts` (envelope shape — read-only),
    `agent-workspace/queue/self-tasks/_smoke-fixture.yaml` (existing C1 envelope
      to verify wired path against)
  ]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/12.1-cf-dogfood-2-wire-step9-architect.md`
      (architect spec; 200–300 LOC; selects Option D vs Option B-minimal,
      pre-verifies Part-C deterministic gates, names tests to extend),
    `scripts/dogfood/run-self-task.ts` (line ~387 unblocked; ~90 LOC delta if
      Option D, ~80 LOC if Option B-minimal),
    `tests/dogfood/run-self-task.spec.ts` (extended; +2-3 tests covering
      real-spawn path with mocked SessionManager; T9-stub variants retained
      under flag-OFF default),
    `agent-workspace/memory/observations/task-12.1-20260428-impl.md`,
    `agent-workspace/memory/observations/task-12.1-20260428-spec-compliance.md`,
    `agent-workspace/memory/observations/task-12.1-20260428-code-quality.md`,
    `agent-workspace/memory/observations/task-12.1-20260428-sandwich-verifier.md`
  ]
- **recommended_dispatch_count**: 4 (sandwich-architect → task-implementer →
  spec-compliance-reviewer → code-quality-reviewer; sandwich-verifier as
  acceptance gate AFTER reviewers PASS)
- **recommended_(model, effort)**:
  - sandwich-architect: (opus, medium) — D2 justification: "selects between
    Option D and Option B-minimal at the seam between IAgentRuntime and dogfood
    harness; small-but-binding decision that affects every subsequent
    self-applied substage"
  - task-implementer: (sonnet, medium) — D1 default; matches Phase 10 §10.5.2
    pattern (sonnet/medium, ~100K)
  - spec-compliance-reviewer: (sonnet, medium) — D1 default
  - code-quality-reviewer: (sonnet, medium) — D1 default
  - sandwich-verifier: (opus, medium) — D2 justification: "first
    self-application gate; if 12.1 ships broken, every downstream self-applied
    substage fails. Adversarial review by opus is warranted to catch shape-of-
    spawn errors not visible to sonnet reviewers"
- **reviewer_pairs**: [
    {post_dispatch_role: spec-compliance, model: sonnet, effort: medium},
    {post_dispatch_role: code-quality, model: sonnet, effort: medium},
    {post_dispatch_role: sandwich-verifier, model: opus, effort: medium}
  ]
- **blockers**: depends on 12.0 (this master plan + routing brief).
- **parallel_safe_with**: [] — load-bearing for 12.3+.
- **estimated_budget_K**: 130 (architect 50K + implementer 40K + spec-compliance
  20K + code-quality 20K — sandwich-verifier folded into 12.7 mid-verify if
  pre-12.3 acceptance is satisfied by reviewer PASS). If standalone
  sandwich-verifier dispatched: +30K → 160K total.
- **acceptance_gate** (Decision 040 §6 G3 closure):
  - `pnpm typecheck` exit 0
  - `pnpm lint` exit 0
  - `pnpm test` exit 0; test count ≥ prior + 2; new tests PASS
  - `grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts` → 0 matches
  - new test verifies `IAgentRuntime.spawn()` is called with correct config when
    profile flag ON (Option D) or unconditionally (Option B-minimal)
  - reviewer-pair APPROVED or APPROVED_WITH_CONCERNS (no critical)
  - sandwich-verifier APPROVED
  - I-6 clean (no commits)

---

### 12.2 — Author `user-intent-coherence-check.sh` + wire to `post-phase.sh`

- **substage_id**: 12.2
- **scope_summary**: Land Decision 040 §6 acceptance gates **G1 + G2**. G1 is
  already satisfied by `agent-workspace/constitution/user-intent-coherence.md`
  on disk (≥ 200 LOC; verified inline by this master plan). G2 mandates
  `scripts/audit/user-intent-coherence-check.sh` authored + wired into
  `scripts/verify/post-phase.sh` as CLASS-A check **A.9 user-intent-coherence**.
  Logic per `user-intent-coherence.md` §F: read all `tasks/*/user_prompt.txt`
  files, extract USER-CRITICAL items by heuristic, locate closure attestation
  / user-override decision / phase-routing-brief substage for each, FAIL if any
  USER-CRITICAL item lacks all three, WARN if any has been carried > 2 cycles.
  Add unit tests under `tests/scripts/`.
- **primary_carryforwards**: [Decision 040 §6 G1+G2; structural fix preventing
  the 4-cycle defer pattern from recurring]
- **user_critical_addressed**: structural defense (gates ALL future USER-CRITICAL
  items, not a single-item closure)
- **input_files** (read): [
    `agent-workspace/constitution/user-intent-coherence.md` (§F audit hook
      logic spec),
    `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (test fixture),
    `scripts/verify/post-phase.sh` (existing CLASS-A gate framework; A.1..A.8),
    `agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md`
      (test fixture for "user-override decision satisfies (b)" path),
    `scripts/audit/oss-readiness.sh` (structural template for new audit script;
      bash + post-phase wiring pattern)
  ]
- **output_files** (write): [
    `scripts/audit/user-intent-coherence-check.sh` (NEW; ~100 LOC bash; FAIL on
      uncovered USER-CRITICAL; WARN on >2-cycle carry),
    `scripts/verify/post-phase.sh` (UPDATE; add A.9 invocation + exit-code
      aggregation),
    `tests/scripts/user-intent-coherence-check.spec.ts` (NEW; ≥ 4 tests:
      (1) USER-CRITICAL closed via attestation → PASS,
      (2) USER-CRITICAL closed via user-override decision → PASS,
      (3) USER-CRITICAL surfaced in current routing brief → PASS,
      (4) USER-CRITICAL absent from all three → FAIL),
    `agent-workspace/memory/observations/task-12.2-20260428-impl.md`,
    `agent-workspace/memory/observations/task-12.2-20260428-code-quality.md`
  ]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: bash audit script + post-phase wiring + unit tests; pattern
    matches Phase 9 §9.4 audit-script work (sonnet/medium). No D2 needed.
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 12.0 (master plan).
- **parallel_safe_with**: [12.1] — disjoint file-edit set (12.1 edits
  `scripts/dogfood/` + `tests/dogfood/`; 12.2 edits `scripts/audit/` +
  `scripts/verify/` + `tests/scripts/`). May be dispatched in parallel with 12.1
  if D4 concurrency cap permits.
- **estimated_budget_K**: 60 (50K implementer + 10K reviewer)
- **acceptance_gate** (Decision 040 §6 G2):
  - `scripts/audit/user-intent-coherence-check.sh` exists + executable
  - `post-phase.sh` invokes A.9 with proper exit-code aggregation
  - All 4 unit tests PASS
  - `pnpm test` exit 0
  - Run `scripts/verify/post-phase.sh --phase 12 --dry-run` once at substage
    close to confirm A.9 fires (output should include `A.9 user-intent-coherence`
    line)
  - code-quality-reviewer APPROVED or APPROVED_WITH_CONCERNS (no critical)

---

### 12.3 — First self-applied substage (proof-of-concept; Decision 040 §6 G4 closure)

- **substage_id**: 12.3
- **scope_summary**: Land Decision 040 §6 acceptance gate **G4**. Pick a small,
  bounded, low-risk task and execute it via Orch dogfood harness rather than via
  Claude Code's Agent tool. **Default candidate task**: one of the housekeeping
  items from 12.9 (e.g., `CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE` — single-helper
  ~5 LOC bash fix; budget cap ~30K). Author the YAML envelope in
  `agent-workspace/queue/self-tasks/`, invoke `pnpm dogfood:run-self-task` (or
  `node scripts/dogfood/run-self-task.ts`) with the envelope path + flag ON,
  capture the resulting `agent-workspace/traces/dogfood-*.jsonl` file as
  evidence. Verify checkpoints C2 + C3 from `self-application-bootstrap.md` §6
  fire correctly (real subprocess spawn observable via process-tree; trace file
  contains non-stub `dogfood.subprocess_spawn` span with real spawn parameters,
  no `dispatch_deferred_to` field).
- **primary_carryforwards**: [Decision 040 §6 G4; CF-DOGFOOD-2 final closure
  attestation; user_prompt.txt §1.5 closure]
- **user_critical_addressed**: user_prompt.txt §1.5 ("phase 8 trở đi nên thực sự
  được tiếp cận bằng cách dùng chính dự án này") — FULL CLOSURE attestation
- **input_files** (read): [
    `agent-workspace/constitution/self-application-bootstrap.md` (§6 checkpoint
      C2+C3 spec; §4.2 algorithm step 9),
    `scripts/dogfood/run-self-task.ts` (post-12.1 wired version),
    `agent-workspace/queue/self-tasks/_smoke-fixture.yaml` (template for new
      envelope shape),
    `agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md`
      (acceptance gate G4 spec),
    chosen housekeeping task spec (one of 12.9 items; default
      CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE in
      `agent-workspace/memory/carryforwards-v2.7.md`)
  ]
- **output_files** (write): [
    `agent-workspace/queue/self-tasks/phase-12-12.3-housekeeping.yaml` (NEW;
      ~30-50 LOC YAML; envelope_id, subagent_type, prompt, budget_cap_tokens,
      tenancy.project, etc.),
    `agent-workspace/traces/dogfood-phase-12-12.3-*.jsonl` (NEW; ≥ 1 file
      produced by the real subprocess spawn; contains non-stub spans),
    `scripts/audit/settings-version-check.sh` (modified by the dogfood-spawned
      subagent — the housekeeping fix itself; ~5 LOC bash delta if
      POLL-LINES-TIMEOUT chosen),
    `agent-workspace/memory/observations/task-12.3-20260428-self-applied.md`
      (orchestrator-side attestation: invocation command, exit code, trace
      file path, C2+C3 verification),
    `agent-workspace/memory/decisions/041-cf-dogfood-2-closure-attestation.md`
      (BINDING; cites G3+G4 evidence; closes CF-DOGFOOD-2 multi-cycle defer)
  ]
- **recommended_dispatch_count**: 2 (orchestrator-driven — main session invokes
  the dogfood harness inline via Bash tool — counts as 1 invocation; second is
  task-implementer wrapping the trace-verification + Decision 041 authoring).
  **NOTE: the dogfood-spawned subagent inside `claude --rc` is NOT counted as
  a master-session subagent dispatch — it is a CHILD subprocess of the orch
  harness. The Agent-tool dispatch budget for 12.3 covers ONLY the trace-
  verification + Decision 041 author legs.**
- **recommended_(model, effort)**:
  - orchestrator-side dogfood-harness invocation: N/A (Bash tool)
  - task-implementer (trace verification + Decision 041): (sonnet, medium) —
    D2 justification: "Decision 041 binds CF-DOGFOOD-2 final closure across
    Phase 8→11 history; cites G3+G4 evidence; should be authored by an agent
    with read-access to all 4 prior decisions (037, 039, 040, plus this Decision
    041 frame). NOT max because the Decision 040 §6 acceptance gates G3+G4 are
    pre-specified — Decision 041 only needs to attest closure, not re-litigate."
- **reviewer_pairs**: [] — Decision 041 is doc-only attestation; reviewer pair
  not needed. Sandwich-verifier folded into 12.7.
- **blockers**: depends on 12.1 (step-9 wired) AND 12.2 (audit hook in place;
  optional but ordering-clean). Phase 0.5 self-track: if 12.1 reviewer-pair
  closes BEFORE 12.2 reviewer-pair closes, 12.3 may proceed gated only on 12.1.
- **parallel_safe_with**: [] — strictly serial after 12.1.
- **estimated_budget_K**: 80 (housekeeping task budget cap 30K + Decision 041
  authoring 30K + trace-verification overhead 20K). The dogfood-spawned
  subagent's tokens are accounted for INSIDE the harness execution; from the
  orchestrator's view this is opaque (Principle 1 daemon-dumb).
- **acceptance_gate** (Decision 040 §6 G4 closure):
  - `agent-workspace/traces/` contains ≥ 1 file matching `dogfood-phase-12-*.jsonl`
  - The trace file's spans include `dogfood.subprocess_spawn` with REAL
    `subagent_type` + `model` + `effort` + `budget_cap_tokens` attributes (no
    `dispatch_deferred_to` field anywhere)
  - The trace file's spans include `dogfood.dispatch_substage` with
    `status: ended` (per run-self-task.ts:405-410)
  - Decision 041 authored ≥ 200 LOC; cites G3 (12.1 evidence) + G4 (this
    substage's trace file) explicitly
  - Housekeeping task chosen for 12.3 is closed with concrete diff evidence in
    target file
  - I-6 clean

---

### 12.4 — SC-39 W-1 empirical discovery + fix (now feasible since real dispatches happen)

- **substage_id**: 12.4
- **scope_summary**: Decision 037 §6 candidate fix paths W-1-A through W-1-D
  require empirical discovery of what Claude Code actually emits in
  `tool_response.content[0].text` for an Agent dispatch — knowledge unavailable
  from the codebase alone. **Pre-12.3, this discovery was hard** (no real
  subprocess dispatches happening in the orchestrator's own session window).
  **Post-12.3, this is straightforward**: the dogfood harness invocation has
  produced ≥ 1 real `claude --rc` subprocess that itself dispatches Agent calls;
  the produced `dispatch.jsonl` rows for that child session contain real Agent
  tool result text payloads, captured via 12.4 architect's adversarial probe.
  **Substage shape**: (a) architect reads the captured payloads and selects
  W-1-A vs W-1-B vs W-1-C (W-1-D = last-resort, requires explicit rejection of
  A/B/C); (b) implementer lands the regex/extraction fix at
  `dispatch-jsonl-recorder.sh:33`; (c) reviewer pair runs; (d)
  `tests/integration/sc39-production-pairing-rate.spec.ts` Case 1 JSDoc updated
  from "expected to FAIL" to "expected to PASS" once V1a verified; (e)
  Decision 042 authored binding W-1 ENABLE_RETRY-status update OR W-2/W-3
  re-defer to v2.8.
- **primary_carryforwards**: [`CF-V2.7-SC39-W1-AGENTID-EXTRACTION` (Decision 037
  §2.1 root cause; structural blocker for ENABLE_RETRY)]
- **user_critical_addressed**: NONE — telemetry-quality work; Decision 040 §3
  priority 5 (important, not USER-CRITICAL)
- **input_files** (read): [
    `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md` (§5 W-1
      framework + §6 candidate fix paths),
    `agent-workspace/traces/dogfood-phase-12-12.3-*.jsonl` (real dispatch
      payloads from 12.3),
    `agent-workspace/memory/dispatch.jsonl` (rows from 12.3 child session;
      empirical agentId surface),
    `scripts/hooks/dispatch-jsonl-recorder.sh` (line 33 regex; lines 64-87
      PostToolUse-Agent branch),
    `tests/integration/sc39-production-pairing-rate.spec.ts` (Case 1 regression
      surface; lines 25-28 JSDoc),
    `tests/hooks/dispatch-recorder.spec.ts` (existing fixture for verification)
  ]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/12.4-sc39-w1-architect.md` (architect
      spec; ≥ 200 LOC; selects W-1-A/B/C/D with empirical-payload rationale),
    `scripts/hooks/dispatch-jsonl-recorder.sh` (line 33 fix per chosen
      candidate),
    `tests/hooks/dispatch-recorder.spec.ts` (extended; new fixture matches real
      payload format),
    `tests/integration/sc39-production-pairing-rate.spec.ts` (JSDoc lines 25-28
      updated post-V1a),
    `agent-workspace/memory/observations/task-12.4-20260428-impl.md`,
    `agent-workspace/memory/observations/task-12.4-20260428-spec-compliance.md`,
    `agent-workspace/memory/observations/task-12.4-20260428-code-quality.md`,
    `agent-workspace/memory/decisions/042-sc39-w1-w2-w3-verdict-v2.7.md` (BINDING;
      ENABLE_RETRY iff W-1 PASS + W-2 PASS + W-3 PASS; else DEFER-V2.8)
  ]
- **recommended_dispatch_count**: 4 (sandwich-architect → task-implementer →
  spec-compliance-reviewer → code-quality-reviewer)
- **recommended_(model, effort)**:
  - sandwich-architect: (opus, medium) — D2 justification: "selects between 4
    candidate fix paths against an empirical payload that has never been seen
    in the codebase before; format-stability assumption is the load-bearing
    judgment"
  - task-implementer: (sonnet, medium) — D1 default after architect spec
  - reviewer pair: (sonnet, medium) — D1 default
- **reviewer_pairs**: [
    {post_dispatch_role: spec-compliance, model: sonnet, effort: medium},
    {post_dispatch_role: code-quality, model: sonnet, effort: medium}
  ]
- **blockers**: depends on 12.3 (real dispatch trace + dispatch.jsonl rows must
  exist).
- **parallel_safe_with**: [] — load-bearing for W-2/W-3 measurement which
  passive-accumulates across 12.5 + 12.6.
- **estimated_budget_K**: 130 (architect 50K + implementer 40K + reviewer pair
  40K)
- **acceptance_gate**:
  - W-1 verification per Decision 037 §5 V1a OR V1b: dispatch.jsonl COMPLETED
    row with toolu_* dispatch_id AND tool_use_id matching, OR PostToolUse stderr
    showing non-empty `RESULT_AGENT_ID`
  - `pnpm typecheck && pnpm lint && pnpm test` exit 0
  - Decision 042 authored citing W-1/W-2/W-3 evidence; verdict ENABLE_RETRY OR
    DEFER-V2.8 (no DEFER_AGAIN per Decision 035 §5 R-4 inheritance)
  - reviewer pair APPROVED or APPROVED_WITH_CONCERNS

---

### 12.5 — Multi-user / multi-project namespace (user_prompt.txt §1.6)

- **substage_id**: 12.5
- **scope_summary**: Close USER-CRITICAL gap: per-user `.orch/` separation,
  private vs shared profile split, sync stub interface. Phase 8.7.2
  `packages/core/src/config/layered-resolver.ts` is the foundation; build on it.
  Author session plan for what's missing: (a) per-user telemetry namespace
  (`.orch/users/<user>/telemetry/` writers + reader resolution per Decision 029
  tenancy model); (b) sync interface stub
  (`packages/core/src/sync/sync-aggregator.ts`; INTERFACE only — no actual
  aggregator implementation; that is post-v2.7); (c) per-user vs shared profile
  documentation in `agent-workspace/constitution/tenancy-model.md` (extend
  existing 387-LOC doc with Multi-User Adoption section). Architect-led
  substage; implementer lands the layered-resolver extension + sync interface
  stub; reviewer pair runs.
- **primary_carryforwards**: [user_prompt.txt §1.6 closure; v2.7 multi-user
  rollout prerequisite]
- **user_critical_addressed**: user_prompt.txt §1.6 ("khả năng tự nâng cấp độc
  lập ở mỗi dự án, và mỗi người sử dụng" + multi-user co-development use-case)
  — FULL CLOSURE attestation expected
- **input_files** (read): [
    `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (§1.6 spec — verbatim
      user wording),
    `agent-workspace/constitution/tenancy-model.md` (387 LOC; existing
      multi-user model; extension target),
    `packages/core/src/config/layered-resolver.ts` (Phase 8.7.2 foundation;
      ~500 LOC),
    `packages/core/src/tenancy/scope-resolver.ts` (existing scope resolution),
    `packages/core/src/dogfood/envelope-schema.ts` (envelope-driven tenancy.project
      field; reuse pattern),
    `agent-workspace/memory/decisions/029-tenancy-model.md` (file-level tenancy
      Decision)
  ]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/12.5-multi-user-namespace-architect.md`
      (architect spec; ≥ 250 LOC; per-user telemetry partitioning + sync
      interface contract),
    `agent-workspace/constitution/tenancy-model.md` (extended; new Multi-User
      Adoption section; ~80 LOC delta),
    `packages/core/src/sync/sync-aggregator.ts` (NEW; interface-only stub;
      ~50 LOC; documented `// IMPL deferred to post-v2.7` per
      scaffold-now-execute-later pattern),
    `packages/core/src/config/layered-resolver.ts` (extended; add per-user
      telemetry path resolution; ~30 LOC delta),
    `tests/config/layered-resolver.spec.ts` (extended; ≥ 3 new tests for
      multi-user namespace),
    `tests/sync/sync-aggregator.spec.ts` (NEW; interface contract tests;
      ≥ 2 tests),
    `agent-workspace/memory/observations/task-12.5-20260428-impl.md`,
    `agent-workspace/memory/observations/task-12.5-20260428-spec-compliance.md`,
    `agent-workspace/memory/observations/task-12.5-20260428-code-quality.md`
  ]
- **recommended_dispatch_count**: 4 (sandwich-architect → task-implementer →
  spec-compliance + code-quality reviewer pair)
- **recommended_(model, effort)**:
  - sandwich-architect: (opus, medium) — D2 justification: "extends 387-LOC
    tenancy-model.md with multi-user adoption design + sync interface contract;
    judgment-density warrants opus"
  - task-implementer: (sonnet, medium)
  - reviewer pair: (sonnet, medium)
- **reviewer_pairs**: [
    {post_dispatch_role: spec-compliance, model: sonnet, effort: medium},
    {post_dispatch_role: code-quality, model: sonnet, effort: medium}
  ]
- **blockers**: depends on 12.4 (or 12.3 minimum; W-1 fix is independent of
  multi-user namespace). May parallelize with 12.6 after 12.4 closes.
- **parallel_safe_with**: [12.6] — disjoint file-edit set (12.5 edits
  `packages/core/src/sync/` + `packages/core/src/config/` + `tenancy-model.md`;
  12.6 edits `docs/` + `agent-workspace/constitution/community-sharing-prep.md`
  + telemetry sync schema spec). Per architecture.md §"Decomposition Cost
  Model" PARALLELIZE gate: horizontal split (independent features); LOC budget
  ≤ 200 each; reviewer pair shared cost low. PARALLELIZE GATE: PASS.
- **estimated_budget_K**: 110 (architect 50K + implementer 40K + reviewer pair
  20K)
- **acceptance_gate**:
  - tenancy-model.md extended; new Multi-User Adoption section ≥ 80 LOC
  - `packages/core/src/sync/sync-aggregator.ts` exists; interface-only;
    documented as scaffold-now per Decision 027 §C-8
  - `packages/core/src/config/layered-resolver.ts` extended; per-user telemetry
    path resolution test PASS
  - `pnpm typecheck && pnpm lint && pnpm test` exit 0
  - reviewer pair APPROVED or APPROVED_WITH_CONCERNS
  - Decision 040 §3 priority 4 closure attested in 12.10

---

### 12.6 — Community sharing prep (user_prompt.txt §1.7)

- **substage_id**: 12.6
- **scope_summary**: Close USER-CRITICAL gap: telemetry sync schema spec,
  privacy/consent flow design, "domain workflow autonomous knowledge" framing
  in README + docs. Phase 8.7.4 OSS_READINESS.md is partial. User wording
  ("bắt buộc hoàn thành trước khi kết thúc dự án này") binds this to project
  completion. Substage delivers: (a) telemetry sync schema in
  `agent-workspace/constitution/telemetry-sync-schema.md` (build on Decision
  031 sync wire format); (b) privacy + consent flow in
  `agent-workspace/constitution/privacy-consent-flow.md` (default OPT-OUT;
  explicit user grant required for telemetry sync; per-data-class consent
  granularity); (c) "domain workflow autonomous knowledge" framing in
  `README.md` + `docs/oss-positioning.md` (positioning Orch as a tool-class,
  not a domain-expertise tool — per user_prompt.txt §1.7 "chuyên gia về domain
  workflow"). Architect-led; implementer lands docs; no code surface (this
  is a spec + docs substage).
- **primary_carryforwards**: [user_prompt.txt §1.7 closure; community OSS launch
  prerequisite per Decision 027 §C-8]
- **user_critical_addressed**: user_prompt.txt §1.7 ("khả năng sharing được cho
  community, để thu thập dữ liệu" + "bắt buộc hoàn thành trước khi kết thúc dự
  án này" + "domain workflow autonomous knowledge") — FULL CLOSURE attestation
  expected
- **input_files** (read): [
    `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (§1.7 verbatim user
      wording — multiple paragraphs),
    `agent-workspace/memory/decisions/031-telemetry-sync-wire-format.md`
      (existing wire format),
    `OSS_READINESS.md` (Phase 8.7.4 partial deliverable),
    `README.md` (current),
    `LICENSE` (MIT, Phase 8.7.4),
    `agent-workspace/constitution/cf-dogfood-2-assessment.md` §2.3 (Principle 8
      reusable-without-forking; reusable framing)
  ]
- **output_files** (write): [
    `agent-workspace/session-plans/pending/12.6-community-sharing-architect.md`
      (architect spec; ≥ 200 LOC; consent flow design + schema design + framing
      decisions),
    `agent-workspace/constitution/telemetry-sync-schema.md` (NEW; ≥ 200 LOC;
      detailed schema for sync payloads; data-class taxonomy; field-level
      privacy classifications),
    `agent-workspace/constitution/privacy-consent-flow.md` (NEW; ≥ 150 LOC;
      OPT-OUT default; explicit grant; revocation flow; data-class granular
      consent; GDPR/local-laws notes),
    `README.md` (UPDATE; add §"Domain Workflow Autonomous Knowledge" section
      + community-sharing positioning),
    `docs/oss-positioning.md` (NEW; ≥ 100 LOC; "chuyên gia về workflow trong
      domain" framing per user_prompt.txt §1.7 paragraph 7),
    `OSS_READINESS.md` (UPDATE; mark community-sharing prep CLOSED; cross-ref
      new files),
    `agent-workspace/memory/observations/task-12.6-20260428-impl.md`,
    `agent-workspace/memory/observations/task-12.6-20260428-spec-compliance.md`
  ]
- **recommended_dispatch_count**: 3 (sandwich-architect → task-implementer →
  spec-compliance-reviewer; code-quality-reviewer skipped — no production code
  surface)
- **recommended_(model, effort)**:
  - sandwich-architect: (opus, medium) — D2 justification: "telemetry sync
    schema + consent flow design + positioning are policy-dense decisions; the
    framing affects all future OSS users; user_prompt.txt §1.7 explicitly binds
    completion before project close"
  - task-implementer: (sonnet, medium)
  - spec-compliance-reviewer: (sonnet, medium)
- **reviewer_pairs**: [
    {post_dispatch_role: spec-compliance, model: sonnet, effort: medium}
  ]
- **blockers**: depends on 12.4 (or 12.3 minimum; community sharing is
  independent of W-1 fix). May parallelize with 12.5 after 12.4 closes.
- **parallel_safe_with**: [12.5] — see 12.5 PARALLELIZE GATE attestation.
- **estimated_budget_K**: 110 (architect 50K + implementer 40K + spec-compliance
  20K)
- **acceptance_gate**:
  - `telemetry-sync-schema.md` exists ≥ 200 LOC; data-class taxonomy specified;
    field-level privacy classifications present
  - `privacy-consent-flow.md` exists ≥ 150 LOC; OPT-OUT default explicit;
    revocation flow specified
  - `README.md` contains `## Domain Workflow Autonomous Knowledge` section (or
    equivalent heading)
  - `docs/oss-positioning.md` exists ≥ 100 LOC; "chuyên gia về workflow trong
    domain" framing present (Vietnamese OR English equivalent)
  - `OSS_READINESS.md` cross-refs the 4 new/updated files
  - `pnpm typecheck && pnpm lint && pnpm test` exit 0 (no test impact expected;
    sanity check only)
  - spec-compliance-reviewer APPROVED or APPROVED_WITH_CONCERNS

---

### 12.7 — Mid-verify gate + mid-phase sandwich-verifier

- **substage_id**: 12.7
- **scope_summary**: After 12.5 + 12.6 close, run mid-phase verify checkpoint
  (mirrors Phase 11 11.4 pattern): post-phase.sh dry-run on Phase 12 (with new
  A.9 user-intent-coherence-check now in place), oss-readiness.sh re-run, full
  pnpm test, drift-check.sh + invariant grep sweep. **Plus**: mid-phase
  sandwich-verifier reviews 12.1 + 12.3 + 12.4 + 12.5 + 12.6 outputs as a
  cluster (these are the load-bearing substages for v2.7 — adversarial review
  ensures no inter-substage drift). Confirms before SC-39 W-1 verdict locks in
  via Decision 042 closure.
- **primary_carryforwards**: [verify checkpoint; cross-substage drift detection]
- **user_critical_addressed**: structural verification of USER-CRITICAL closures
- **input_files** (read): [
    `scripts/verify/post-phase.sh` (post-12.2 with A.9 wired),
    `scripts/audit/oss-readiness.sh`,
    `scripts/verify/drift-check.sh`,
    all 12.1–12.6 output observation files
  ]
- **output_files** (write): [
    `agent-workspace/memory/audits/phase-12-mid-verify.md`,
    `agent-workspace/memory/observations/task-12.7-20260428-sandwich-verifier.md`
  ]
- **recommended_dispatch_count**: 1 sandwich-verifier (orchestrator runs gates
  inline)
- **recommended_(model, effort)**:
  - gate runner: orchestrator-inline (Bash); no dispatch
  - sandwich-verifier: (opus, medium) — D2 justification: "mid-phase adversarial
    review of 5 cross-coupled substages including the USER-CRITICAL closures;
    must catch any drift between 12.5 multi-user namespace and 12.6 community
    sharing schema design"
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 12.5 + 12.6 CLOSED.
- **parallel_safe_with**: [] — strictly mid-phase serial gate.
- **estimated_budget_K**: 80 (gate runner 20K orchestrator-inline +
  sandwich-verifier 60K)
- **acceptance_gate**:
  - all 9 CLASS-A gates exit 0 (A.1..A.8 + new A.9)
  - oss-readiness PASS
  - sandwich-verifier APPROVED (≤ 1 critical; 0 important per Phase 11 precedent)
  - mid-verify.md records test counts + drift status + per-substage attestation

---

### 12.8 — F-2 disposition (gated on Decision 042 / SC-39 W-1 verdict)

- **substage_id**: 12.8
- **scope_summary**: Decision 037 §11 (consequence 3) binds F-2
  self-evolution signal-extension to SC-39 enablement horizon. **Branching
  logic**:
  - **IF Decision 042 = ENABLE_RETRY** (W-1+W-2+W-3 all PASS): scaffold F-2
    schema extension per `audits/f2-self-evolution-disposition-v2.6.md` →
    F-2-R1..F-2-R3 prerequisites; ~50 LOC delta; ~30K budget.
  - **IF Decision 042 = DEFER-V2.8** (any of W-1/W-2/W-3 FAIL): re-defer F-2 to
    v2.8 with same gating; orchestrator-absorbed inline; ~50 LOC disposition
    note (no subagent); ~5K budget.
  Decision 043 authored in either branch; binding.
- **primary_carryforwards**: [`F-2 self-evolution signal-extension` (multi-cycle
  structural-defer; 4th cycle if DEFER-V2.8)]
- **user_critical_addressed**: NONE
- **input_files** (read): [
    `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.6.md`
      (gating spec),
    `agent-workspace/memory/decisions/042-sc39-w1-w2-w3-verdict-v2.7.md`
      (the gating verdict)
  ]
- **output_files** (write): [
    `agent-workspace/memory/decisions/043-f2-disposition-v2.7.md` (BINDING),
    IF ENABLE_RETRY branch: `agent-workspace/session-plans/pending/12.8-f2-scaffold-architect.md`
      (architect spec) + scaffold code stubs (location TBD by architect),
    IF DEFER branch: `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.7.md`
      (re-defer note)
  ]
- **recommended_dispatch_count**: 0 (DEFER branch; orchestrator-absorbed) OR
  3 (ENABLE_RETRY branch: architect + implementer + code-quality)
- **recommended_(model, effort)**:
  - DEFER branch: orchestrator-inline; (n/a)
  - ENABLE_RETRY branch: architect (opus, medium) D2 + implementer (sonnet,
    medium) D1 + code-quality (sonnet, medium) D1
- **reviewer_pairs** (ENABLE_RETRY branch only):
  [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 12.4 / Decision 042.
- **parallel_safe_with**: [] — must follow 12.4 verdict.
- **estimated_budget_K**: 5 (DEFER branch) OR 80 (ENABLE_RETRY branch)
- **acceptance_gate**:
  - Decision 043 authored, BINDING, cites Decision 042
  - IF ENABLE_RETRY: scaffold code lands; `pnpm test` exit 0
  - IF DEFER: re-defer note authored citing F-2-R1..F-2-R3 gates

---

### 12.9 — Housekeeping batch (settings-version-check fixes + cosmetic + POLL-LINES)

- **substage_id**: 12.9
- **scope_summary**: Bundled hygiene fix-pass for non-USER-CRITICAL housekeeping
  carryforwards. **NOTE**: One housekeeping item (default:
  `CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE`) is consumed by 12.3 as the
  proof-of-concept self-applied task. Remaining housekeeping items closed here:
  (a) `CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES` (3 fixes per Decision 037
  §7; ~30 LOC bash delta); (b) cosmetic minor from 11.7 verifier (oss-readiness
  path prefix; staged-file-count drift; CF-V2.6-10.1-FAIL-COUNT-DEAD naming
  clarity); (c) any minor surfaced during 12.5/12.6 reviews.
- **primary_carryforwards**: [
    `CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES`,
    11.7 verifier minor cosmetic items (3),
    any 12.5/12.6 reviewer-pair minor concerns
  ]
- **user_critical_addressed**: NONE — Decision 040 §3 priority 8
  (housekeeping/nitpick)
- **input_files** (read): [
    `scripts/audit/settings-version-check.sh`,
    Decision 037 §7 (3 quality CFs detail),
    11.7 verifier observation file (3 minor cosmetic),
    any 12.5/12.6 reviewer-pair observation files surfacing minor concerns
  ]
- **output_files** (write): [
    `scripts/audit/settings-version-check.sh` (3 fixes: CRLF normalization,
      `set -e` strict mode, HASH_UNAVAILABLE → exit 2 with [SKIP]; ~20-30 LOC),
    cosmetic-minor target files (3 small edits per 11.7 verifier),
    `agent-workspace/memory/observations/task-12.9-20260428-impl.md`,
    `agent-workspace/memory/observations/task-12.9-20260428-code-quality.md`
  ]
- **recommended_dispatch_count**: 2 (task-implementer + code-quality-reviewer)
- **recommended_(model, effort)**: (sonnet, medium)
  - **rationale**: small surgical edits; pattern matches Phase 11 11.1 hygiene
    batch (sonnet/medium, ~120K). No D2.
- **reviewer_pairs**: [{post_dispatch_role: code-quality, model: sonnet, effort: medium}]
- **blockers**: depends on 12.4 (or 12.3 minimum). May parallelize with 12.8.
- **parallel_safe_with**: [12.8] — disjoint file-edit set.
- **estimated_budget_K**: 60
- **acceptance_gate**:
  - 3 settings-version-check fixes verified by re-running G7-G9 gates
  - 3 cosmetic-minor items closed with concrete diff
  - `pnpm typecheck && pnpm lint && pnpm test` exit 0
  - reviewer code-quality APPROVED or APPROVED_WITH_CONCERNS

---

### 12.10 — Phase-close attestation + bundled v2.7 commit

- **substage_id**: 12.10
- **scope_summary**: Final substage. Author `phase-12-complete.md` ≥ 250 LOC
  attesting all Decision 040 §6 G1-G5 gates closed. Run final post-phase.sh
  (now with A.9 user-intent-coherence wired) to confirm GREEN. Run whole-phase
  sandwich-verifier (opus/medium) over the entire 12.0-12.9 output set;
  adversarial review for charter-coherence, USER-CRITICAL closure attestations,
  Decision 041/042/043 binding consistency, I-6 across whole phase. After
  sandwich-verifier APPROVED: stage v2.7 changes; author commit message at
  `.git/COMMIT_EDITMSG_v2.7`; **per autonomous standing grant 2026-04-28
  ("autonomous mode = autonomous until DONE ALL — incl. git commit/tag/release")
  the orchestrator MAY fire `git commit -F .git/COMMIT_EDITMSG_v2.7 && git tag
  v2.7`** without further user gate. Update `current-execution.md` to reflect
  Phase 12 close + Phase 13 / v2.8 entry posture (or project-completion posture
  if all USER-CRITICAL closed).
- **primary_carryforwards**: [Decision 040 §6 G5 closure; v2.7 phase-close
  attestation; bundled commit]
- **user_critical_addressed**: G5 attests user_prompt.txt §1.5 + §1.6 + §1.7
  closure citations
- **input_files** (read): all Phase 12 outputs
- **output_files** (write): [
    `agent-workspace/memory/phase-12-complete.md` (≥ 250 LOC; G1-G5 attestation;
      USER-CRITICAL closure citations per `user-intent-coherence.md` §C),
    `agent-workspace/memory/audits/phase-12-verify.md`,
    `agent-workspace/memory/observations/task-12.10-20260428-sandwich-verifier.md`,
    `.git/COMMIT_EDITMSG_v2.7` (commit message),
    `agent-workspace/memory/current-execution.md` (post-Phase-12 state),
    git commit fired (post-sandwich-verifier APPROVED) producing 5th commit;
    git tag v2.7
  ]
- **recommended_dispatch_count**: 1 sandwich-verifier (other work
  orchestrator-inline)
- **recommended_(model, effort)**:
  - sandwich-verifier: (opus, medium) — D2 justification: "whole-phase
    adversarial review at v2.7 close; cross-substage drift detection across 11
    substages including 3 USER-CRITICAL closures + 4 binding decisions
    (041/042/043 + any 040 update). Pattern matches Phase 11 11.7 (opus/medium,
    actual 12,719 bytes verifier output)"
- **reviewer_pairs**: [{post_dispatch_role: sandwich-verifier, model: opus, effort: medium}]
- **blockers**: depends on 12.7 (mid-verify GREEN) + 12.8 + 12.9 CLOSED.
- **parallel_safe_with**: [] — strictly final.
- **estimated_budget_K**: 90 (attestation authoring 30K orchestrator-inline +
  sandwich-verifier 60K)
- **acceptance_gate** (Decision 040 §6 G5):
  - `phase-12-complete.md` cites G1+G2 (Decision 040 closure: user-intent-
    coherence.md + audit script wired)
  - `phase-12-complete.md` cites G3 (12.1 outputs: stub removed; spawn wired)
  - `phase-12-complete.md` cites G4 (12.3 outputs: real dogfood trace file path)
  - `phase-12-complete.md` cites G5 (this attestation itself; tautological close)
  - `phase-12-complete.md` cites user_prompt.txt §1.5/§1.6/§1.7 with
    closure-substage mapping (per `user-intent-coherence.md` §C "closure
    attestation must explicitly cite user_prompt.txt clause")
  - 9 CLASS-A gates GREEN (A.1..A.8 + new A.9)
  - oss-readiness PASS
  - whole-phase sandwich-verifier APPROVED (0 critical, ≤ 1 important)
  - I-6 baseline: git log = 4 commits AT 12.10 entry; bundled commit fires AT
    sandwich-verifier APPROVED → git log = 5 commits at 12.10 close

---

## §2 Critical Path

```
12.0 (master plan + routing brief; this dispatch)
  │
  ├──> 12.1 (wire step-9; Decision 040 G3 closure) ──┐
  │                                                  │
  └──> 12.2 (audit hook + post-phase A.9; G2)        │
                  │                                  │
                  └──> 12.3 (first self-applied task; G4) ──┐
                                                            │
                                            ──> 12.4 (SC-39 W-1; Decision 042)
                                                            │
                                                            ├──> 12.5 (multi-user; §1.6)
                                                            ├──> 12.6 (community; §1.7)
                                                            │   (12.5 || 12.6 PARALLEL)
                                                            │
                                                            └──> 12.7 (mid-verify + sandwich-verifier)
                                                                        │
                                                                        ├──> 12.8 (F-2 disposition; Decision 043)
                                                                        ├──> 12.9 (housekeeping)
                                                                        │   (12.8 || 12.9 PARALLEL)
                                                                        │
                                                                        └──> 12.10 (phase-close + bundled commit; G5)
```

**Forbidden parallelism**: 12.0 → 12.1 → 12.3 → 12.4 are strictly serialized
(structural prereq chain: master plan → step-9 wire → first self-apply → W-1
discovery from real payloads). 12.10 is strictly final.

**Allowed parallelism** (with PARALLELIZE GATE per architecture.md):
- 12.1 || 12.2 (disjoint file-edit set — see 12.2 attestation)
- 12.5 || 12.6 (disjoint; see 12.5 attestation)
- 12.8 || 12.9 (disjoint)

D4 concurrency cap (Decision 032): max 4 in-flight subagents; max 2 opus/* at
once. No plan moment exceeds the cap (12.5 + 12.6 architects = 2 opus/medium
in-flight; reviewer pairs are sonnet so do not count against opus/* cap).

---

## §3 Mandate A — Live-Grep Evidence Baseline (captured 2026-04-28)

Captured during 12.0 master-plan authoring per dispatch envelope Mandate A:

| Probe | Command | Result | Bake into |
|---|---|---|---|
| Stub site count | `grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts` | **1** match (line 388: `dispatch_deferred_to: '8.5.3',`) | 12.1 acceptance gate (post-fix → 0 matches) |
| run-self-task.ts LOC | `wc -l scripts/dogfood/run-self-task.ts` | **490** LOC (per cf-dogfood-2-assessment.md §2.1; not re-run inline; trusted from authoritative doc) | 12.1 budget; expected post-fix LOC ≤ 580 (Option D +90) or ≤ 570 (Option B-minimal +80) |
| IAgentRuntime usage | `grep -rn "IAgentRuntime" packages/core/src/ \| head -20` | ≥ 20 sites; canonical interface at `packages/core/src/domain/types/runtime.ts:111`; concrete adapter `claude-code-adapter.ts:148` | 12.1 architect input (existing interface usage pattern; no new interface needed) |
| spawn() call sites | `grep -rn "spawn\(" packages/core/src/modules/sessions/` | ≥ 16 sites in `claude-code-adapter.spec.ts`; 1 site at `claude-code-adapter.ts:148` (implementation); `session-manager.ts:141` injects via IAGENT_RUNTIME token | 12.1 architect input (canonical spawn invocation pattern via SessionManager.runSession or direct adapter.spawn) |
| W-1 site count | `grep -rn "agentId:" scripts/hooks/` | (proxy: regex at `dispatch-jsonl-recorder.sh:33`; 1 line; per Decision 037 §2.1 verbatim) | 12.4 baseline (1 regex line to fix) |
| W-2 baseline | `wc -l agent-workspace/memory/dispatch.jsonl` | (proxy: per Decision 037 §2.2: 21 DISPATCHED rows + 149 COMPLETED rows; ~170 total rows at v2.6 close) | 12.4 baseline (gate at ≥ 50 DISPATCHED post-W-1; current 21 is moot under R-1 FAIL) |
| Commit baseline | `git log --oneline \| wc -l` | (per phase-11-complete.md §6: 4 commits — init / v2.5 / signoff / v2.6) | 12.10 I-6 baseline (must remain 4 across 12.0-12.9; bundled commit fires AT 12.10 close → 5) |
| USER-CRITICAL inventory | `find tasks/ -name "user_prompt.txt"` | (per `user-intent-coherence.md` §B: 1 file currently — `tasks/feat_04_continue_before_phase_8/user_prompt.txt` with mục 1.5/1.6/1.7 USER-CRITICAL) | 12.0 master-planner phase-entry attestation (per §D.1) |

**Attestation**: this baseline is referenced by 12.1, 12.4, 12.10 acceptance
gates. Re-capture before 12.10 phase-close to confirm 12.1 closed the stub site
(post-fix grep = 0).

---

## §4 File-Edit Collision Matrix

Disjointness verification for parallel-safe substages.

| Substage | Files modified | Files read-only |
|---|---|---|
| 12.1 | `scripts/dogfood/run-self-task.ts` (line 387 unblocked); `tests/dogfood/run-self-task.spec.ts` (extended) | `packages/core/src/domain/types/runtime.ts`; `packages/core/src/modules/sessions/session-manager.ts`; `packages/core/src/modules/sessions/claude-code-adapter.ts`; `packages/core/src/dogfood/envelope-schema.ts`; `agent-workspace/queue/self-tasks/_smoke-fixture.yaml` |
| 12.2 | `scripts/audit/user-intent-coherence-check.sh` (NEW); `scripts/verify/post-phase.sh` (UPDATE A.9 wire); `tests/scripts/user-intent-coherence-check.spec.ts` (NEW) | `agent-workspace/constitution/user-intent-coherence.md`; `tasks/*/user_prompt.txt` |
| 12.3 | `agent-workspace/queue/self-tasks/phase-12-12.3-housekeeping.yaml` (NEW); `agent-workspace/traces/dogfood-phase-12-12.3-*.jsonl` (NEW); `scripts/audit/settings-version-check.sh` (modified by spawned subagent — POLL-LINES fix); `agent-workspace/memory/decisions/041-cf-dogfood-2-closure-attestation.md` (NEW) | (orchestrator-side file collisions only; child subprocess file edits are governed by C2/C3 sandbox per spec §6) |
| 12.4 | `scripts/hooks/dispatch-jsonl-recorder.sh` (line 33 fix); `tests/hooks/dispatch-recorder.spec.ts` (extended); `tests/integration/sc39-production-pairing-rate.spec.ts` (JSDoc update); `agent-workspace/memory/decisions/042-sc39-w1-w2-w3-verdict-v2.7.md` (NEW) | dispatch.jsonl; trace files from 12.3 |
| 12.5 | `agent-workspace/constitution/tenancy-model.md` (extended); `packages/core/src/sync/sync-aggregator.ts` (NEW); `packages/core/src/config/layered-resolver.ts` (extended); `tests/config/layered-resolver.spec.ts` (extended); `tests/sync/sync-aggregator.spec.ts` (NEW) | scope-resolver.ts; envelope-schema.ts; Decision 029 |
| 12.6 | `agent-workspace/constitution/telemetry-sync-schema.md` (NEW); `agent-workspace/constitution/privacy-consent-flow.md` (NEW); `README.md` (UPDATE); `docs/oss-positioning.md` (NEW); `OSS_READINESS.md` (UPDATE) | Decision 031; LICENSE; cf-dogfood-2-assessment.md §2.3 |
| 12.7 | `agent-workspace/memory/audits/phase-12-mid-verify.md` (NEW); observation file (NEW) | all 12.x outputs |
| 12.8 | `agent-workspace/memory/decisions/043-f2-disposition-v2.7.md` (NEW); IF ENABLE_RETRY: scaffold code stubs | Decision 042 |
| 12.9 | `scripts/audit/settings-version-check.sh` (3 fixes — DIFFERENT FROM 12.3's POLL-LINES fix; possible coupling — see note below); cosmetic-minor target files | Decision 037 §7 |
| 12.10 | `agent-workspace/memory/phase-12-complete.md` (NEW); commit message; current-execution.md (UPDATE) | all 12.x outputs |

**Note on 12.3 ↔ 12.9 coupling on `scripts/audit/settings-version-check.sh`**:
12.3's default housekeeping task is `POLL-LINES-TIMEOUT-FLAKE` (5 LOC bash fix
in the **integration test** `tests/integration/sc39-production-pairing-rate.spec.ts`
per Decision 037 §7.6 — NOT in `settings-version-check.sh`). Therefore 12.3 and
12.9 edit DIFFERENT files; no collision.
**HOWEVER**: if the architect of 12.3 selects a different housekeeping task that
DOES touch `settings-version-check.sh`, 12.9 must be re-ordered AFTER 12.3 and
the parallelism with 12.8 is preserved. Architect must attest at 12.3 dispatch.

**Parallelism PARALLELIZE GATE** (per architecture.md §"Decomposition Cost
Model"): horizontal split for 12.5 || 12.6 (independent feature dimensions);
horizontal split for 12.8 || 12.9 (disjoint targets). Cost model:
- 12.5 || 12.6: each ~110K → max(110K, 110K) = 110K wall-clock vs 220K serial;
  reviewer pair shared cost low; PASS.
- 12.8 || 12.9: each ~5K-80K vs ~60K → max(80K, 60K) = 80K vs 140K serial;
  PASS.

---

## §5 Decision-Doc Inventory (Phase 12 Decisions to Author)

| Decision | Title (planned) | Substage | Status target | Authority |
|---|---|---|---|---|
| 040 | CF-DOGFOOD-2 R-039.5 user-override (priority inversion) | pre-12.0 | BINDING (already authored 2026-04-28) | EXISTS |
| 041 | CF-DOGFOOD-2 closure attestation (G3+G4 evidence) | 12.3 | BINDING | NEW |
| 042 | SC-39 W-1/W-2/W-3 verdict v2.7 (ENABLE_RETRY OR DEFER-V2.8) | 12.4 | BINDING | NEW |
| 043 | F-2 disposition v2.7 (gated on Decision 042) | 12.8 | BINDING | NEW |
| 044 (optional) | Multi-user namespace + sync interface architectural ratification | 12.5 if architect deems necessary | BINDING-OPTIONAL | NEW (skip if architect's 12.5 spec is self-binding) |
| 045 (optional) | Community sharing privacy/consent flow ratification | 12.6 if architect deems necessary | BINDING-OPTIONAL | NEW (skip if architect's 12.6 spec is self-binding) |

---

## §6 Reviewer Routing

Per Decision 032 D5 (effort-routing skill consultations logged for ≥3
substages):

| Substage | Reviewer pair | Sandwich-verifier | Effort skill consult |
|---|---|---|---|
| 12.0 | none | none | logged: master-planner judgment-density attestation in this §0 |
| 12.1 | spec-compliance + code-quality | inline (12.1 acceptance) OR folded to 12.7 | logged: 12.1 D2 architect |
| 12.2 | code-quality | none | (sonnet/medium D1) |
| 12.3 | none | folded to 12.7 | logged: 12.3 D2 task-implementer |
| 12.4 | spec-compliance + code-quality | folded to 12.7 | logged: 12.4 D2 architect |
| 12.5 | spec-compliance + code-quality | folded to 12.7 | logged: 12.5 D2 architect |
| 12.6 | spec-compliance | folded to 12.7 | logged: 12.6 D2 architect |
| 12.7 | n/a | sandwich-verifier opus/medium (mid-phase) | D2 |
| 12.8 (DEFER) | none | none | (n/a) |
| 12.8 (ENABLE) | code-quality | none | (sonnet/medium D1) |
| 12.9 | code-quality | none | (sonnet/medium D1) |
| 12.10 | n/a | sandwich-verifier opus/medium (whole-phase) | D2 |

D4 concurrency: max 4 concurrent; max 2 opus/* at once. The sandwich-verifier
in 12.7 + the sandwich-architects in 12.4/12.5/12.6 should NOT overlap (12.7
gate is post-12.6 close). If 12.5 || 12.6 architect dispatches both run in
parallel, that is 2 opus/medium in flight = AT CAP. Implementer dispatches for
12.5 + 12.6 are sonnet so do not contribute to opus/* cap; full reviewer-pair
parallelism within both substages is admissible.

---

## §7 Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **R-12.1.A**: 12.1 architect picks Option D (flag-gated) but 12.3 forgets to flip flag ON when invoking dogfood harness — produces stub trace, G4 fails | Medium | High | 12.1 architect spec MUST include explicit invocation example: `ORCH_DOGFOOD_EXECUTE=true pnpm dogfood:run-self-task --envelope <path>`. 12.3 acceptance gate verifies trace contains REAL spans (no `dispatch_deferred_to`). | 12.1 architect + 12.3 implementer |
| **R-12.1.B**: Real `claude --rc` subprocess spawn during 12.3 consumes user's API quota / requires interactive auth | Low-Medium | High | `claude --rc` reuses existing user auth (no new auth gate); subprocess inherits parent session's `~/.claude/` credentials. Budget cap on 12.3 envelope (`budget_cap_tokens: 30000`) bounds cost. | 12.1 architect (envelope schema review) |
| **R-12.3.A**: 12.3 chosen housekeeping task fails inside subprocess; orchestrator must distinguish "harness wiring works, task failed" from "harness wiring broken" | Medium | Medium | 12.3 acceptance gate explicitly checks for `dogfood.subprocess_spawn` span existence (= harness wiring works) BEFORE checking for task success. Even a FAILED task satisfies G4 (the spawn happened). | 12.3 implementer |
| **R-12.4.A**: Empirical W-1 discovery reveals Claude Code's Agent tool result text has NO correlation field at all — none of W-1-A/B/C work; W-1-D (FIFO) is fragile per parallel dispatches | Low | High | If discovery reveals this, 12.4 architect documents finding + escalates to a new decision (Decision 042-amendment) recommending W-1-D with explicit mispairing risk OR re-defers W-1 to v2.8 with new candidate path (e.g., Claude Code feature request). Decision 037 §6 already pre-authorizes W-1-D as last-resort. | 12.4 architect |
| **R-12.5.A**: Multi-user namespace work surfaces a coupling with 12.6 community-sharing schema design that wasn't visible at this master-plan time | Medium | Medium | 12.5 || 12.6 architects share an intermediate sync-point: each architect spec must include a §"Cross-Coupling with [other substage]" section explicitly enumerating shared abstractions (sync interface, telemetry data classes). 12.7 sandwich-verifier specifically probes this coupling. | 12.5 + 12.6 architects |
| **R-12.6.A**: User wording "bắt buộc hoàn thành trước khi kết thúc dự án này" (1.7) implies project completion gate; if 12.6 deliverables ship as stubs (interface-only), user may consider §1.7 NOT closed | Medium | High | 12.6 architect spec must distinguish "design + spec" (in scope) from "operational sync aggregator implementation" (post-v2.7; explicitly scaffold-now per Decision 027 §C-8). 12.6 acceptance gate verifies design+spec ARE landed; the post-v2.7 implementation is gated separately. 12.10 phase-complete cites this scope-bounding explicitly. | 12.6 architect |
| **R-12.10.A**: Bundled v2.7 commit fails verifier-gating (sandwich-verifier returns concerns) and orchestrator must hold the commit; this would extend Phase 12 calendar | Low | Low | Per Phase 11 11.7 precedent, sandwich-verifier APPROVED with ≤1 important is admissible (use minor concerns to fold into v2.8 housekeeping). I-6 ABSOLUTE preserves no-commit posture across hold; no rollback risk. | 12.10 orchestrator |
| **R-CONFAB**: Master-planner under-attested USER-CRITICAL coverage at 12.0 (this dispatch); a USER-CRITICAL clause is missed and only surfaces at 12.10 phase-close, breaking acceptance gate | Low (just executed §D mandate) | Critical | 12.10 phase-close MUST re-execute `user-intent-coherence.md` §D phase-entry checklist and verify each item ALSO has closure-attestation. If a USER-CRITICAL surfaces unaddressed, 12.10 must defer to v2.8 with same-phase user-override decision (which IS this very Decision 040 pattern); chain-forward forbidden. | 12.10 orchestrator |

---

## §8 Carryforward Burndown Matrix (v2.7 IN → v2.7 / v2.8 OUT)

Source: `agent-workspace/memory/carryforwards-v2.7.md` working list (7 items)
+ Decision 040 §3 priority order + this master plan substage allocation.

| CF-ID | Severity (per `user-intent-coherence.md` §C ladder) | Substage | Disposition target | Notes |
|---|---|---|---|---|
| CF-DOGFOOD-2 | **USER-CRITICAL** (user_prompt.txt §1.5) | 12.1 + 12.3 | **CLOSED** in v2.7 | Decision 040 §6 G3 (12.1) + G4 (12.3); Decision 041 binds final closure |
| user_prompt.txt §1.6 multi-user namespace | **USER-CRITICAL** | 12.5 | **CLOSED** in v2.7 | per-user telemetry + sync interface stub; tenancy-model.md extended |
| user_prompt.txt §1.7 community sharing | **USER-CRITICAL** | 12.6 | **CLOSED** in v2.7 | telemetry-sync-schema + privacy-consent-flow + domain-workflow framing |
| CF-V2.7-SC39-W1-AGENTID-EXTRACTION | important | 12.4 | **CLOSED** if Decision 042 = ENABLE_RETRY; **DEFER-V2.8** if Decision 042 = DEFER-V2.8 | empirical fix candidate W-1-A/B/C/D selection |
| CF-V2.7-SC39-W2-NATURAL-VOLUME | important | 12.4 (passive accumulation across 12.3-12.9) + 12.10 (measure) | gated on W-1 PASS; passive | ≥50 DISPATCHED + ≥10K events at 12.10 |
| F-2 self-evolution signal-extension | important (gated) | 12.8 | **CLOSED** if Decision 043 ENABLE; **DEFER-V2.8** if Decision 043 DEFER | branch on Decision 042 |
| CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES | nitpick (3 sub-issues) | 12.9 | **CLOSED** | CRLF + strict-mode + HASH_UNAVAILABLE |
| CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE | nitpick | 12.3 (consumed as proof-of-concept fix) | **CLOSED** | dual-purpose: closes nitpick + satisfies G4 |
| 11.7 verifier 3 cosmetic minor | nitpick | 12.9 | **CLOSED** | bundled with hash fixes |

**Total: 9 carryforward classes addressed**. 3 USER-CRITICAL closures expected
(if all branch-positive); 6 housekeeping/structural closures expected. Up to 2
re-defers to v2.8 possible (W-1 + F-2 if Decision 042 = DEFER).

---

## §9 v2.7 Commit Plan (per Decision 036 precedent)

**Per autonomous standing grant 2026-04-28**: commit + tag fires automatically
at 12.10 sandwich-verifier APPROVED (no user gate required). I-6 ABSOLUTE
maintained across 12.0-12.9 (zero commits); single bundled commit at 12.10.

**Commit message preview** (subject ≤72 chars):
```
v2.7: Phase 12 self-application priority + USER-CRITICAL closure
```

**Body summary** (drafted at 12.10):
```
Phase 12 v2.7 self-application priority closes 3 USER-CRITICAL items
(user_prompt.txt §1.5/§1.6/§1.7) and 6 housekeeping/structural CFs.

USER-CRITICAL closures:
- §1.5: CF-DOGFOOD-2 wired (run-self-task.ts:387 step-9 → real
  IAgentRuntime.spawn(); ~90 LOC delta) + first self-applied substage
  produces real dogfood trace (Decision 041 BINDING; closes 4-cycle
  multi-cycle defer)
- §1.6: Multi-user namespace + sync interface stub (tenancy-model.md
  extended; layered-resolver.ts per-user telemetry path; sync-aggregator
  interface scaffold)
- §1.7: Community-sharing prep (telemetry-sync-schema.md + privacy-
  consent-flow.md + domain-workflow framing in README + OSS_READINESS
  closed)

Structural closures:
- Decision 040 §6 G1+G2: user-intent-coherence.md constitution +
  user-intent-coherence-check.sh A.9 gate wired into post-phase.sh
- Decision 042 BINDING: SC-39 W-1/W-2/W-3 verdict (ENABLE_RETRY OR
  DEFER-V2.8) — see decision file for branch
- Decision 043 BINDING: F-2 disposition (gated on 042)

Housekeeping:
- settings-version-check.sh: 3 fixes (CRLF, strict-mode, HASH_UNAVAILABLE)
- POLL-LINES-TIMEOUT-FLAKE: integration-test timeout fix (consumed by 12.3
  as proof-of-concept self-applied task)
- 11.7 verifier 3 cosmetic minor

Single bundled commit per Decision 036 precedent. v2.6 → v2.7 increment.
9/9 CLASS-A gates GREEN (incl. new A.9). Whole-phase sandwich-verifier
APPROVED.
```

Tag: `v2.7`. Expected git log post-commit: 5 commits.

---

## §10 Effort Routing Matrix (Decision 032 D1-D6)

| Substage | Subagent | Model | Effort | Tier | D2 justification cited? |
|---|---|---|---|---|---|
| 12.0 | master-planner (this dispatch) | opus | medium | D2 | YES (this §0 + dispatch envelope) |
| 12.1 | sandwich-architect | opus | medium | D2 | YES (12.1 §recommended_(model, effort)) |
| 12.1 | task-implementer | sonnet | medium | D1 | NO (default) |
| 12.1 | spec-compliance-reviewer | sonnet | medium | D1 | NO (default) |
| 12.1 | code-quality-reviewer | sonnet | medium | D1 | NO (default) |
| 12.1 | sandwich-verifier (folded or standalone) | opus | medium | D2 | YES |
| 12.2 | task-implementer | sonnet | medium | D1 | NO |
| 12.2 | code-quality-reviewer | sonnet | medium | D1 | NO |
| 12.3 | task-implementer (Decision 041 + verification) | sonnet | medium | D2 | YES (12.3) |
| 12.4 | sandwich-architect | opus | medium | D2 | YES (12.4) |
| 12.4 | task-implementer | sonnet | medium | D1 | NO |
| 12.4 | reviewer pair | sonnet | medium | D1 | NO |
| 12.5 | sandwich-architect | opus | medium | D2 | YES (12.5) |
| 12.5 | task-implementer | sonnet | medium | D1 | NO |
| 12.5 | reviewer pair | sonnet | medium | D1 | NO |
| 12.6 | sandwich-architect | opus | medium | D2 | YES (12.6) |
| 12.6 | task-implementer | sonnet | medium | D1 | NO |
| 12.6 | spec-compliance-reviewer | sonnet | medium | D1 | NO |
| 12.7 | sandwich-verifier | opus | medium | D2 | YES |
| 12.8 (ENABLE) | sandwich-architect | opus | medium | D2 | YES (12.8) |
| 12.8 (ENABLE) | task-implementer + code-quality | sonnet | medium | D1 | NO |
| 12.9 | task-implementer + code-quality | sonnet | medium | D1 | NO |
| 12.10 | sandwich-verifier | opus | medium | D2 | YES |

**No /effort max dispatches in this phase plan**. Per memory note 2026-04-28
("/effort max burns quota fast — reserve for high-leverage; data-route the
rest"), all opus dispatches use medium effort. Total opus dispatches: 7-9
(7 if 12.1 sandwich-verifier folds into 12.7; 8 default; 9 if 12.5/12.6
architects both author optional Decision 044/045). Aligned with Phase 11
precedent (11.5.3 Decision 037 sandwich-verifier was opus/medium; 11.7
whole-phase verifier was opus/medium).

---

## §11 Open Questions Resolved (per spawned-session-mode SKILL.md)

This master plan is authored under `ORCH_SPAWNED=true`. Per the skill, all
ambiguity resolves to the simplest charter-coherent choice with documentation
in this section.

1. **Should 12.3's housekeeping task be POLL-LINES (default) or one of the 3
   settings-version-check fixes?** Resolved: POLL-LINES (default). Rationale:
   (a) POLL-LINES fix is in `tests/integration/sc39-production-pairing-rate.spec.ts`,
   not `settings-version-check.sh` — this avoids the 12.3 ↔ 12.9 file coupling
   risk; (b) ~5 LOC bash delta fits the budget cap 30K cleanly; (c) does not
   block any other substage. Architect of 12.3 may override with rationale in
   their dispatch but the master plan default stands.

2. **Should Decision 041 (12.3 closure attestation) be authored INLINE by
   orchestrator or via task-implementer dispatch?** Resolved: task-implementer
   dispatch. Rationale: Decision 041 cites G3+G4 evidence including a real
   trace file path; cross-references 4 prior decisions (037, 039, 040, plus
   self-link). Task-implementer with read-access to all 4 decisions produces
   higher-quality citation chain than orchestrator-inline; cost ~30K is
   acceptable.

3. **Should 12.5 || 12.6 parallelism trigger D4 concurrency-cap concerns
   (2 opus/medium architects in flight at once)?** Resolved: NO — D4 cap is
   max 2 opus/* in-flight concurrently, NOT 1. 2 architects = AT CAP, not
   over. PARALLELIZE GATE PASS per architecture.md.

4. **Should the 12.0 master plan invoke the master-planner subagent
   recursively?** Resolved: NO. This very dispatch IS the master-planner per
   the 12.0 substage definition. Recursive invocation would be a confab loop
   and burn budget unnecessarily.

5. **Telemetry-rollup-aware planning (Phase 0.5 of master-planner skill).**
   `agent-workspace/memory/phase-11-routing-recommendations.md` does not exist
   on disk (verified via Glob). Skipped silently per skill ("If the file does
   not exist, skip this phase silently"). 12.10 phase-close SHOULD author
   `phase-12-routing-recommendations.md` if telemetry signal materialises
   during 12.4–12.6 self-applied dispatches; this is a recommendation for the
   12.10 orchestrator, not a binding gate.

---

## §12 Charter-Coherence Attestation

| Principle / Invariant | This phase plan |
|---|---|
| P1 (Think Before Coding) | ✅ — this master plan is the "think"; 11 substages each have explicit acceptance gates |
| P2 (Simplicity First) | ✅ — Decision 040 priority order rejects the 4-cycle defer + collapses USER-CRITICAL into single phase |
| P3 (Surgical Changes) | ✅ — 12.1 ~90 LOC delta; 12.2 ~100 LOC; 12.4 1-line regex fix; multi-user/community substages are spec-heavy not code-heavy |
| P4 (Goal-Driven Execution) | ✅ — every substage has falsifiable acceptance gate; G1-G5 from Decision 040 explicitly mapped |
| Decision 020 (I-6 ABSOLUTE) | ✅ — zero commits 12.0-12.9; bundled commit at 12.10 sandwich-verifier APPROVED only |
| Decision 027 (scaffold-now-execute-later) | ✅ — v2.7 IS the EXECUTE horizon for self-application (12.1 + 12.3); sync-aggregator stays scaffold-only (12.5) |
| Decision 029 (tenancy model) | ✅ — 12.5 extends, does not redefine |
| Decision 031 (telemetry sync wire format) | ✅ — 12.6 telemetry-sync-schema builds on, does not replace |
| Decision 032 (effort routing) | ✅ — D1-D6 compliance per §10 matrix; no /effort max |
| Decision 037 (SC-39 DEFER-V2.7) | ✅ — 12.4 inherits W-framework intact; priority demoted but framework retained |
| Decision 039 (CF-DOGFOOD-2 DEFER-V2.7) | ✅ — §"Re-attempt Prerequisites" priority logic SUPERSEDED by Decision 040 §3; otherwise framework intact |
| Decision 040 (R-039.5 user override; priority inversion) | ✅ — this master plan IS the encoding of Decision 040 §9 mandate |
| `user-intent-coherence.md` §D phase-entry checklist | ✅ — §D.1 read user_prompts (yes); §D.2 attestation table (§7 / §8 / this §); §D.3 no defer of USER-CRITICAL absent same-phase override (none deferred); §D.4 routing brief mandate (12.0 deliverable) |

---

## §13 Phase Close → v2.8 Posture

If Phase 12 closes with all 3 USER-CRITICAL items genuinely closed AND
Decision 042 = ENABLE_RETRY AND Decision 043 = SCAFFOLD_F2 — the project is
DONE relative to user_prompt.txt. v2.8 becomes a maintenance / community-feedback
phase with no critical-path items.

If any USER-CRITICAL is partial OR Decision 042/043 = DEFER, v2.8 inherits
the carryforward(s) with explicit user-override decision documenting why the
partial closure was acceptable for v2.7 and what the v2.8 close gate looks
like. Per `user-intent-coherence.md` §C: USER-CRITICAL CFs cannot defer
without explicit user-override decision in same cycle — so 12.10 phase-close
MUST author such an override-decision (Decision 044+) for any USER-CRITICAL
not closed.

12.10 orchestrator updates `current-execution.md` with the appropriate
post-Phase-12 state (DONE / v2.8 entry / project-complete signaling).

---

_Phase 12 / v2.7 master plan. Authored by master-planner (opus 4.7,
/effort medium, ORCH_SPAWNED, 2026-04-28, post-Phase-11-close session #47
continuation). Read-only artifact per Decision 020 (I-6 ABSOLUTE). This
file does not trigger any commit. Per `user-intent-coherence.md` §D mandate,
USER-CRITICAL items are explicitly attested in §0/§7/§8/§12. Decision 040
priority order encoded throughout. Ratification authority: implicit at
12.0 dispatch (this very file)._
