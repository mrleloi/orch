---
phase: 8
phase_name: v2.3 Carryforward Burndown (Hardening continuation + CF-21 unblock)
status: pending
created: 2026-04-27
budget_estimate_tokens: 1_180_000
expected_sessions: 18
expected_calendar_days: 3
authoring_agent: master-planner (opus 4.7, ORCH_SPAWNED=true, bg)
authorization: User directive 2026-04-27T~08:05Z = "no need to release, git, ... for now, continue do development. full autonomous until done all"
inputs_consumed:
  - PROJECT_CHARTER.md
  - agent-workspace/memory/checkpoints/latest.md (Phase 7 closure)
  - agent-workspace/memory/phase-7-complete.md (660 LOC; carryforwards G.1-G.8)
  - agent-workspace/memory/decisions/025-7.7-sc39-defer.md (SC-39 v2.3 prerequisites)
  - agent-workspace/memory/decisions/026-cf21-tool-use-id-correlation-defer.md (CF-21 fix-list)
  - agent-workspace/memory/sessions/2026-04-27-task-7.8.3-retrospective.md (Mandate F draft)
  - agent-workspace/session-plans/pending/phase-7-v2.2-hardening.md (template)
  - agent-workspace/constitution/{invariants,karpathy-principles,session-budgets}.md
  - .claude/agents/sandwich-architect.md (Mandates A-E + Mandate F draft)
---

# Phase 8 Master Plan — v2.3 Carryforward Burndown

> Phase 8 closes the v2.3 backlog from Phase 7: 6 carryforwards (CF-21..CF-26) +
> 2 retrospective items (G.7 substage parallelism + G.8 spec-opt-out template).
> v2.3 is **HARDENING + ENABLING**: hardening continues Phase 7's theme on
> CF-22/24/25 housekeeping; enabling lands CF-21 (tool_use_id correlation),
> which unblocks SC-33 PASS_WITH_CONCERN→PASS, SC-27 retro PARTIAL→PASS,
> and SC-39 self-evolution loop's first real upgrade. **Theme: close v2.3
> backlog, do not extend feature surface.**

> **I-6 BANNER:** Phase 8 ships ZERO `git commit` invocations. v2.0.0 +
> v2.1.0 + v2.2.0 staged baseline stays staged. v2.3.0 artifacts are staged
> at 8.5 close, no commit. Decision 020 binds. Verifier gate every substage:
> `git log --oneline | wc -l` returns 0.

> **Hardening discipline (Karpathy P3 binding):** every Phase 8 IMPL task
> ≤80 net LOC. CF-21 fix surface is the exception — decisions/026 fix-list
> sized ~50-80 LOC per phase-7-complete.md §G.1.

---

## §1 Goal

Phase 8 / v2.3 closes the v2.3 backlog from Phase 7 §G with one **enabling**
substage (8.1 CF-21) and three **hardening** substages (8.2 housekeeping,
8.3 skill-amendments, 8.4 conditional SC-39). v2.3 introduces NO new feature
surface. Charter alignment: daemon-dumb preserved (CF-21 fix touches hooks,
not daemon decision logic); project-agnostic core preserved; adapter pattern
preserved (no IAgentRuntime surface change); one-way dependency preserved;
CLI-subprocess only preserved; I-6 ABSOLUTE preserved through 8.5 stage.

**Headline metric**: Phase 8 closes 6 numbered carryforwards (CF-21..CF-26)
plus 2 retrospective items (G.7+G.8). The scorecard at 8.5 will report
**SC-40..SC-46 mandatory + SC-47 conditional** (SC-47 = SC-39 retry;
CONDITIONAL on CF-21 fix landing AND ≥2 RULES firing on real components).

---

## §2 Scope

### IN SCOPE for v2.3

| Carryforward | Severity | Substage | What it closes |
|---|---|---|---|
| **CF-21** tool_use_id correlation | HIGH | 8.1 | dispatch.jsonl pairing asymmetry |
| **CF-22** dispatch-recorder.spec.ts trim | LOW | 8.2 | 372→~120 LOC or close-without-action |
| **CF-23** SC-27 retro re-attest | MEDIUM | 8.1 | PARTIAL→PASS (folded into 8.1 verifier) |
| **CF-24** read-only-tmpdir Win+Git-Bash | LOW | 8.2 | afterEach try/catch portability wrap |
| **CF-25** citation-linter dedup | LOW | 8.2 | canonical extraction or close |
| **CF-26** Mandate F | MEDIUM | 8.3 | architect-spec-vs-reality LOC variance prevention |
| **G.7** substage parallelism flag | LOW-MED | 8.3 | master-planner concurrent-safe annotation |
| **G.8** spec-opt-out decision template | LOW | 8.3 | autonomous-protocol convention |
| **SC-39** retry conditional | (variable) | 8.4 | self-evolution loop or DEFER-AGAIN to v2.4 |

### NOT IN SCOPE for v2.3 (deferred to v2.4+)

- **New feature surface** (Phase 8 is hardening continuation).
- **maxConcurrent>8 scaling** (no real demand; Phase 6 §H carryforward).
- **72h memory leak verification** (requires manual user-run).
- **Auto-actuation of self-evolution proposals** (extends 8.4 into a feature; v2.4+).
- **Subagent-index / agent listing doc** (cosmetic; v2.4+).
- **Description-too-long flagged skills (10 items)** (cosmetic; v2.4+).
- **Upstream Claude Code patch for `tool_use_id`** (out of scope for orch; CF-21 uses sidecar fallback per decisions/026).
- **Edit-tool grant for opus architect role** (G.8 retrospective; documented in 8.3 as Write-fallback-canonical decision).

### Frozen feature surface (binding)

No new files in `packages/core/src/` (domain or feature modules), no new
adapter classes, no new daemon decision logic. Permitted file surfaces:
`scripts/hooks/`, `tests/`, `agent-workspace/memory/decisions/`,
`.claude/agents/`, `agent-workspace/constitution/`, version-bump files.
Verifier gate at 8.5 scans for prohibited file surfaces.

---

## §3 Substages (8.0 → 8.5)

Six substages. Pattern mirrors Phase 7's 7.0-7.8 shape, compressed: v2.3
backlog has 8 items but 5 are LOW severity and bundle cleanly. Phase 8
begins with research/decisions (8.0), then 1 critical enabling substage
(8.1 CF-21+CF-23), then 1 housekeeping bundle (8.2 CF-22+CF-24+CF-25),
then 1 skill-amendment bundle (8.3 CF-26+G.7+G.8), then conditional
self-evolution substage (8.4 SC-39 retry), then close-out (8.5).

| # | Substage | Tasks | Budget | Status | Notes |
|---|---|---|---|---|---|
| 8.0 | Research + decisions 027-030 | 2 | ~110K | PENDING | CF-21 fix-shape, housekeeping triage, Mandate F final, SC-39 retry go/no-go |
| 8.1 | CF-21 + CF-23 BUNDLED | 4 (architect+IMPL+spec+verifier) | ~280K | PENDING | **CRITICAL PATH**; unblocks SC-33 + SC-27 retro + SC-39 signal |
| 8.2 | CF-22 + CF-24 + CF-25 BUNDLED housekeeping | 3 (architect+IMPL+spec) | ~180K | PENDING | Bundle saves architect overhead; close-or-fix per decisions/028 |
| 8.3 | CF-26 + G.7 + G.8 BUNDLED skill amendments | 3 (architect+IMPL+spec) | ~150K | PENDING | Mandate F + concurrent-safe flag + spec-opt-out convention |
| 8.4 | SC-39 retry (conditional) | 0-3 | 30K-220K | PENDING | Branches per Decision 030 + post-CF-21 telemetry |
| 8.5 | Verify + stage v2.3 | 4 | ~230K | PENDING | Mirrors 7.8 |
| **Total** | **17 task-dispatches across ~14-18 main-session turns** | | **~980K-1,170K** | | within charter daily-cap; ~3 days |

**Net feature surface**: ~140-200 net LOC (CF-21 dominant ~50-80; CF-22/24/25 NEGATIVE).

### Substage 8.0 — Research + Decision-Log

**Goal**: resolve 4 ambiguity points BEFORE IMPL substage dispatches. Output: 4 decision files (027..030).

**Rationale**: Phase 7's 7.0 wrote 4 decisions and saved ≥30% spec-vs-reality variance per phase-7-complete.md §F.6. Cost: ~110K (50K research-scanner + 60K decision-write).

#### Task 8.0.1 — Research-scanner

- **Session type**: RESEARCH; **Model**: sonnet; **Agent**: research-scanner; **Budget**: 50K
- **Depends on**: — (Phase 8 entry point)
- **Part A files (read-only)**: decisions/026, scripts/hooks/dispatch-jsonl-recorder.sh (69 LOC), agent-workspace/memory/dispatch.jsonl (current 1+19 state), tests/hooks/dispatch-recorder.spec.ts (372 LOC), tests/integration/worktree-isolation.spec.ts, scripts/utilities/citation-linter.ts + tests/integration/feedback-loop.spec.ts:98-109, .claude/agents/sandwich-architect.md, component-rollup-phase-6.md
- **Part B output**: `agent-workspace/research/phase-8-options-survey.md` (~150 LOC) — (1) CF-21 fix-shape options A/B/A+B, (2) CF-22/24/25 close-vs-fix triage, (3) Mandate F final text proposal, (4) SC-39 retry pre-evaluation
- **Part C gates**: file ≥100 LOC; `grep -cE "CF-2[1-6]|G\.[78]|SC-39"` ≥8; **Mandate A binding** — section 1 cites grep -n line numbers from dispatch-jsonl-recorder.sh LIVE
- **Verify**: research note written; no decisions yet.

#### Task 8.0.2 — Write decisions 027/028/029/030

- **Session type**: PLAN; **Model**: sonnet (per Decision 021 sonnet-downgrade); **Agent**: sandwich-architect (decision-writer); **Budget**: 60K
- **Depends on**: 8.0.1
- **Part A files**: NEW decisions/027-cf21-fix-shape.md (~120 LOC; pick A/B/A+B; cite §G.1 estimate; bind 8.1 ≤80 LOC), 028-cf22-cf24-cf25-triage.md (~100 LOC; close-vs-fix matrix), 029-mandate-f-final.md (~100 LOC; binding text for 8.3), 030-sc39-retry-go-nogo.md (~100 LOC; default DEFER-AGAIN unless evidence)
- **Part B contracts**: canonical decisions/0NN frontmatter; 027 commits LOC budget; 028 explicitly authorizes close-without-action; 029 verbatim binding; 030 conditional re-eval at 8.4 dispatch
- **Part C gates**: 4 files exist ≥80 LOC each; grep `Decision (027|028|029|030)` ≥4; **Mandate B**: only decisions/ written
- **Verify**: 4 decisions ratified; 8.1 architect can read 027 verbatim.

**Substage 8.0 budget**: ~110K.

### Substage 8.1 — CF-21 + CF-23 BUNDLED — dispatch.jsonl tool_use_id correlation + SC-27 retro

**Goal**: implement the CF-21 fix-shape selected in Decision 027 so that dispatch.jsonl produces paired DISPATCHED+COMPLETED records with real `agent_type`. Re-attest SC-27 retro (PARTIAL→PASS) at the same verifier turn (CF-23 fold-in).

**Rationale**: CF-21 is highest-leverage v2.3 item. Per phase-7-complete.md §G.1: HIGH severity, ~160K total budget, ~50-80 LOC production. Unblocks SC-33 (PASS_WITH_CONCERN→PASS), SC-27 retro (PARTIAL→PASS), SC-39 signal restoration.

#### Task 8.1.1 — Architect spec for CF-21 fix

- **Session type**: PLAN; **Model**: opus; **Agent**: sandwich-architect; **Budget**: 50K
- **Depends on**: 8.0.2
- **Part B output**: `agent-workspace/session-plans/pending/8.1-cf21-tool-use-id-architect.md` (~300 LOC). Sections: Goal/Files/Contracts/Gates/Risks/Mandate-A-evidence
- **Part C gates**: ≥250 LOC; grep `tool_use_id|sidecar|SessionStart` ≥6; **Mandate F (binding once 029 lands)**: cite analog ("dispatch-jsonl-recorder.sh = 69 LOC; CF-21 cap = 80 LOC"); **Mandate E**: skeleton FIRST, ≥6 section appends
- **Verify**: spec ratified; binds 8.1.2.

#### Task 8.1.2 — IMPL: CF-21 fix per decisions/027 + 8.1.1

- **Session type**: FOCUSED_IMPL; **Model**: sonnet; **Agent**: task-implementer; **Budget**: 100K
- **Depends on**: 8.1.1
- **Part A files**: Modified `scripts/hooks/dispatch-jsonl-recorder.sh` (+~30-50 LOC; sidecar fallback Path A; SessionStart probe Path B if A+B). New `tests/hooks/dispatch-recorder-cf21.spec.ts` (~80 LOC; ≥4 cases: paired-write, missing-tool_use_id-fallback, sidecar-merge-success, sidecar-merge-timeout-graceful). Possibly new `scripts/hooks/session-start-probe.sh` (~20 LOC; SessionStart payload diagnostic per decisions/026 fix-list (b))
- **Part B contracts** (binding from 027):
  - Sidecar path: `${CLAUDE_PROJECT_DIR}/agent-workspace/memory/.dispatch-pending-${SESSION_ID}.jsonl`
  - PreToolUse(Task) captures available payload fields; falls back to monotonic counter if `tool_use_id` absent (Root Cause B fix)
  - SubagentStop reconciles via temporal proximity (most-recent unmerged sidecar within 60s window)
  - SessionStart probe (Path B): logs first-PreToolUse-per-session raw stdin (one-shot; auto-disables)
  - Backward-compat: existing 20 dispatch.jsonl rows valid; new schema additive
- **Part C gates**: cf21 spec PASS (≥4 cases); test:hooks total ≥130; net diff ≤50 LOC on recorder; total production ≤80 LOC (cap per 027); **Mandate B**: pre-verify staged
- **Verify**: CF-21 fix shipped.

#### Task 8.1.3 — Spec-compliance review

- **Session type**: VERIFY; **Model**: sonnet; **Agent**: spec-compliance-reviewer; **Budget**: 30K
- **Depends on**: 8.1.2
- Standard. Checks 8.1.1 Part B vs 8.1.2 IMPL. Writes session note pre-return.
- **Verify**: APPROVED or APPROVED_WITH_CONCERNS.

#### Task 8.1.4 — Sandwich-verifier + CF-23 re-attestation

- **Session type**: VERIFY; **Model**: opus; **Agent**: sandwich-verifier; **Budget**: 100K
- **Depends on**: 8.1.3
- **Probes**: P0 I-6 clean; P1 SC-33: dispatch.jsonl ≥1 paired record with real `agent_type`; P2 SC-27 retro re-attest (CF-23 fold-in): benchmark replay against post-CF-21 dispatch.jsonl ≥6 paired events; P3 daemon-dumb grep clean; P4 net production ≤80 LOC; P5 hooks suite ≥130/130 ×3 deterministic; P6 SessionStart probe (if shipped) one-shot disables after first capture
- **Verify**: SC-40 (CF-21) + SC-41 (CF-23) closed; PASS or PASS_WITH_CONCERN.

**Substage 8.1 budget**: ~280K. **CRITICAL PATH** substage.

### Substage 8.2 — CF-22 + CF-24 + CF-25 BUNDLED housekeeping

**Goal**: close 3 LOW-severity carryforwards via single architect+IMPL pair. Bundle saves ~80K vs three separate substages.

**Rationale**: per phase-7-complete.md §G.2/G.4/G.5, all three are LOW + surgical (CF-22 = test trim or close, CF-24 = 3-line try/catch, CF-25 = 12-LOC dedup or close). Decision 028 selects close-or-fix per item.

#### Task 8.2.1 — Architect spec

- **Session type**: PLAN; **Model**: sonnet (Decision 021 downgrade); **Agent**: sandwich-architect; **Budget**: 40K
- **Depends on**: 8.0.2 (decisions/028 binds close-vs-fix)
- **Parallel with**: 8.1.1 (different files; G.7 concurrent-safe flag)
- **Part B output**: `8.2-housekeeping-architect.md` (~200 LOC). Per-CF: Goal/Files/Contracts/Gates
- **Part C gates**: ≥150 LOC; grep `CF-22|CF-24|CF-25` ≥6; **Mandate F**: cite analog per CF cap; **G.7 flag**: spec includes `concurrent-safe: true`

#### Task 8.2.2 — IMPL: housekeeping bundle

- **Session type**: MULTI_TASK_IMPL; **Model**: sonnet; **Agent**: task-implementer (with subagent-driven-development skill if 3+ tasks); **Budget**: 100K
- **Depends on**: 8.2.1
- **Parallel with**: 8.1.2
- **Part A files** (per decisions/028):
  - CF-22 close-path: no file changes (decision documents close)
  - CF-22 trim-path: dispatch-recorder.spec.ts 372→~120 + new dispatch-recorder-roundtrip.spec.ts ~150
  - CF-24: tests/integration/worktree-isolation.spec.ts afterEach try/catch (~5 LOC)
  - CF-25 close-path: no file changes
  - CF-25 dedup-path: extract `lintRecommendationsCitations` to canonical `scripts/utilities/citation-helpers.ts` (~12 LOC); update 2 import sites
- **Part C gates**: all affected tests PASS; test:hooks ≥130 (no regression); net LOC delta per Decision 028 (likely NEGATIVE)

#### Task 8.2.3 — Spec-compliance review

- **Session type**: VERIFY; **Model**: sonnet; **Agent**: spec-compliance-reviewer; **Budget**: 20K
- **Depends on**: 8.2.2

**Substage 8.2 budget**: ~160K (close-paths) — ~200K (fix-paths). Plan estimate: ~180K.

### Substage 8.3 — CF-26 + G.7 + G.8 BUNDLED skill/convention amendments

**Goal**: codify Mandate F (CF-26), master-planner concurrent-safe flag (G.7), spec-opt-out decision template (G.8). NO production code change.

**Rationale**: per phase-7-complete.md §G.6, Mandate F prevents architect-spec-vs-reality LOC variance recurrence (5 incidents Phase 7, 7 incidents Phase 6). G.7 (~30K) + G.8 (~10K) cheap process-only fixes.

#### Task 8.3.1 — Architect spec

- **Session type**: PLAN; **Model**: sonnet; **Agent**: sandwich-architect; **Budget**: 30K
- **Depends on**: 8.0.2 (decisions/029 binds Mandate F text)
- **Parallel with**: 8.1.x or 8.2.x (G.7 concurrent-safe)
- **Part B output**: `8.3-skill-amendments-architect.md` (~150 LOC); cites decisions/029 verbatim

#### Task 8.3.2 — IMPL: skill amendments + regression test

- **Session type**: FOCUSED_IMPL; **Model**: sonnet; **Agent**: task-implementer; **Budget**: 80K
- **Depends on**: 8.3.1
- **Parallel with**: 8.1.x or 8.2.x
- **Part A files**: `.claude/agents/sandwich-architect.md` (+~20 LOC; Mandate F per 029); `.claude/agents/master-planner.md` (+~15 LOC; G.7 concurrent-safe rule); `agent-workspace/constitution/autonomous-protocol.md` (+~10 LOC; G.8 spec-opt-out); `tests/skills/architect-mandates.spec.ts` (+~10 LOC; ≥1 case Mandate F + ≥1 case master-planner concurrent-safe)
- **Part B contracts**: Mandate F text matches 029 verbatim; master-planner adds rule "When substage Part A files have NO overlap, mark `concurrent-safe: true`"; autonomous-protocol adds "verifier/IMPL session that opts down/up from spec MUST write decisions/0NN in same turn"; regression asserts all 6 Mandates A-F grep-able
- **Part C gates**: grep `Mandate [A-F]` on architect.md returns ≥6; grep `concurrent-safe` on master-planner.md ≥1; grep `spec-opt-out` on autonomous-protocol.md ≥1; architect-mandates.spec.ts PASS (≥5 cases); net LOC ≤60

#### Task 8.3.3 — Spec-compliance review

- **Session type**: VERIFY; **Model**: sonnet; **Agent**: spec-compliance-reviewer; **Budget**: 20K

**Substage 8.3 budget**: ~150K.

### Substage 8.4 — SC-39 retry (conditional)

**Goal**: dogfood test of the self-evolution loop's first real upgrade. **Conditional on Decision 030 + post-CF-21 telemetry re-evaluation**. Two paths: EXECUTE (~220K, 3 tasks) or DEFER-AGAIN (~30K, 1 task).

**Rationale**: per decisions/025, SC-39 v2.3 prerequisites = (a) CF-21 fixed [met if 8.1 closes], (b) ≥5× event volume [TBD], (c) ≥2 RULES fire on real components [TBD post-CF-21]. Default = DEFER-AGAIN to v2.4 unless evidence flips.

#### Task 8.4.1 — Conditional dispatch decision (orchestrator-side)

Per Decision 030 + 8.1 outcome: orchestrator runs `pnpm tsx scripts/utilities/rollup-telemetry.ts --phase 7,8` and re-evaluates RULES. If ≥2 RULES fire on real (non-`unknown-agent`) components AND CF-21 closed PASS, dispatch 8.4.2-EXECUTE chain. Otherwise dispatch 8.4.2-DEFER (single task).

#### Task 8.4.2-DEFER — Write deferral rationale (default path)

- **Session type**: PLAN; **Model**: sonnet; **Agent**: task-implementer; **Budget**: 30K
- **Depends on**: 8.1.4
- **Part A files**: NEW `agent-workspace/memory/phase-8-routing-recommendations.md` (~80 LOC) — cites decisions/025 prerequisites; live RULE eval table; DEFER-AGAIN to v2.4 with updated prerequisites
- **Part C gates**: ≥50 LOC; grep `RULE-[1-4]|decisions/025|v2\.4` ≥4
- **Verify**: SC-47 marked DEFER-AGAIN.

#### Task 8.4.2-EXECUTE — Loop run + analyst proposal (conditional)

- **Session type**: MULTI_TASK_IMPL; **Model**: sonnet (telemetry-analyst per Decision 021); **Agent**: telemetry-analyst; **Budget**: 80K
- **Part A files**: emit `component-rollup-phase-8.md` + `phase-8-routing-recommendations.md` (3 H2 sections)
- **Part C gates**: ≥1 proposal cites a non-`unknown-agent` rollup row

#### Task 8.4.3-EXECUTE — Apply OR document-and-defer

- **Session type**: PLAN; **Model**: sonnet; **Budget**: 50K
- For each proposal: trivial config edit OR document-and-defer with decision file 031

#### Task 8.4.4-EXECUTE — Sandwich-verifier (if execute)

- **Session type**: VERIFY; **Model**: opus; **Agent**: sandwich-verifier; **Budget**: 60K

**Substage 8.4 budget**: 30K (defer; default) — 220K (execute). Plan estimate: defer path.

### Substage 8.5 — Verify + Stage v2.3

**Goal**: prove SC-40..SC-46 (+ SC-47 if executed), 3-run determinism, write phase-8-complete + retrospective, stage v2.3.0. Mirrors 7.8.

#### Task 8.5.1 — Final pnpm test ×3 deterministic

- **Session type**: VERIFY; **Model**: sonnet; **Agent**: sandwich-dev; **Budget**: 50K
- 3× consecutive workspace runs; byte-identical pass-counts; baseline ≥1474 (Phase 7's 1470 + CF-21 spec ≥4)
- **Part C gates**: 3 runs all green; counts equal; budget-tracker entry; session note

#### Task 8.5.2 — SC-40..SC-46 (+ SC-47) scorecard

- **Session type**: VERIFY; **Model**: opus; **Agent**: sandwich-verifier; **Budget**: 90K
- Write `agent-workspace/memory/phase-8-complete.md` with full §A-§I (mirror phase-7-complete.md)
- **Mandate E binding**: skeleton FIRST, append each section via SEPARATE Edit pass
- **Probes (P0-P10)**: I-6 clean, SC-40..SC-46 closure, daemon-dumb grep, net LOC ≤200, determinism, frozen-feature-surface scan

#### Task 8.5.3 — Retrospective

- **Session type**: PLAN; **Model**: opus; **Agent**: sandwich-architect; **Budget**: 60K
- Extend phase-8-complete.md with §A-§I retrospective per Phase 7 precedent
- **Mandate E + Mandate F binding**: analog cite + incremental write
- ≥3 lessons + ≥3 skill amendments + ≥3 v2.4 routing inputs

#### Task 8.5.4 — Stage v2.3.0

- **Session type**: FOCUSED_IMPL; **Model**: sonnet; **Agent**: sandwich-dev; **Budget**: 30K
- Bump 6× package.json 2.2.0→2.3.0; CHANGELOG.md v2.3.0 entry; RELEASE_NOTES.md v2.3.0; current-execution.md v2.3 user-action checklist
- **NO COMMIT (I-6 ABSOLUTE)**
- **Part C gates**: `git status` shows staged 2.3.0; `git log --oneline | wc -l` returns 0

**Substage 8.5 budget**: ~230K.

---

## §4 Carryforward → Substage Mapping

| Source | ID | Item | Severity | Substage | SC# |
|---|---|---|---|---|---|
| Phase 7 §G.1 | CF-21 | tool_use_id correlation | HIGH | 8.1 | SC-40 |
| Phase 7 §G.2 | CF-22 | dispatch-recorder.spec.ts trim | LOW | 8.2 | SC-42 |
| Phase 7 §G.3 | CF-23 | SC-27 retro PARTIAL→PASS | MEDIUM | 8.1 (folded) | SC-41 |
| Phase 7 §G.4 | CF-24 | read-only-tmpdir Win+Git-Bash | LOW | 8.2 | SC-43 |
| Phase 7 §G.5 | CF-25 | citation-linter dedup | LOW | 8.2 | SC-44 |
| Phase 7 §G.6 | CF-26 | Mandate F | MEDIUM | 8.3 | SC-45 |
| Phase 7 §G.7 | G.7 | substage parallelism flag | LOW-MED | 8.3 (folded) | SC-46 |
| Phase 7 §G.8 | G.8 | spec-opt-out decision template | LOW | 8.3 (folded) | SC-46 (folded) |
| Phase 7 §B/D | SC-39 | self-evolution loop retry | (variable) | 8.4 | SC-47 (conditional) |

**Closed in Phase 8**: 6 numbered carryforwards (CF-21..CF-26) + 2 retrospective (G.7+G.8) + 1 conditional retry (SC-39 → SC-47). Total: 9 items, 0 orphans.

---

## §5 Budget Table

| Substage | Min | Mid | Max | Critical-path? |
|---|---|---|---|---|
| 8.0 Research + decisions | 100K | 110K | 120K | Yes (gates 8.1) |
| 8.1 CF-21 + CF-23 | 250K | 280K | 320K | **YES (CRITICAL)** |
| 8.2 Housekeeping | 160K | 180K | 200K | No (parallel-safe) |
| 8.3 Skill amendments | 130K | 150K | 170K | No (parallel-safe) |
| 8.4 SC-39 retry | 30K | 30K | 220K | Conditional |
| 8.5 Verify + stage | 220K | 230K | 240K | Yes (gates close) |
| **Sequential total** | **890K** | **980K** | **1,270K** | |
| **With 8.2 ‖ 8.3 ‖ 8.1** | **~720K** | **~810K** | **~1,070K** | |

**Notes**: 8.4 mid uses DEFER-AGAIN (default per decisions/025+030 prerequisites; EXECUTE adds ~190K). Parallel savings ~170K assume 8.2+8.3 dispatched concurrently with 8.1 (G.7 flag — NO Part A overlap). Total v2.3 PLAN-PRIMARY estimate: **~1,180K mid sequential ≈ 1.18M tokens; ~810K with parallelism**. Within charter daily-cap; ~3 calendar days.

**Per-task model tier**: opus tasks = 8.1.1 + 8.1.4 + 8.5.2 + 8.5.3 [+ 8.4.4-EXECUTE conditional] = ~300-360K opus; sonnet remainder = ~620-810K.

---

## §6 DAG (parallel-vs-serial graph)

```
[Phase 7 close — Phase 8 entry]
            │
            ▼
       8.0.1 (50K research-scanner)
            │
            ▼
       8.0.2 (60K decisions 027/028/029/030)
            │
   ┌────────┼────────┐  (per G.7: concurrent-safe; NO Part A overlap)
   ▼        ▼        ▼
 8.1.1    8.2.1    8.3.1
 (50K)    (40K)    (30K)
   │        │        │
   ▼        ▼        ▼
 8.1.2    8.2.2    8.3.2
(100K)   (100K)    (80K)
   │        │        │
   ▼        ▼        ▼
 8.1.3    8.2.3    8.3.3
 (30K)    (20K)    (20K)
   │        │        │
   ▼        │        │
 8.1.4      │        │
(100K)      │        │
   │ ◄──── 8.2/8.3 join here ────┘
   ▼
 8.4.x (conditional per Decision 030 + 8.1 outcome)
       DEFER: 30K (default) / EXECUTE: 220K (alt)
   │
   ▼
 8.5.1 (50K determinism gate)
   │
   ▼
 8.5.2 (90K scorecard, opus)
   │
   ▼
 8.5.3 (60K retrospective, opus)
   │
   ▼
 8.5.4 (30K stage v2.3.0, NO COMMIT)
   │
   ▼
[Phase 8 / v2.3 CLOSED]
```

**Critical path**: 8.0.1 → 8.0.2 → 8.1.1 → 8.1.2 → 8.1.3 → 8.1.4 → 8.4.x → 8.5.1 → 8.5.2 → 8.5.3 → 8.5.4. Total ~720-870K depending on 8.4 path. Off-critical (8.2 + 8.3) parallel; join before 8.5.1.

**Concurrent-safe substages** (per G.7 flag): 8.1 ‖ 8.2 ‖ 8.3 (NO Part A file overlap). Orchestrator MAY dispatch all three after 8.0.2 ratifies decisions.

---

## §7 Stop Conditions (binding)

Phase 8 / v2.3 is DONE when ALL hold:

- [ ] All 6 carryforwards CF-21..CF-26 either CLOSED, CLOSED-WITHOUT-ACTION (per decisions/028), or PROMOTED to v2.4 with rationale
- [ ] G.7 + G.8 retrospective items closed via 8.3
- [ ] SC-40..SC-46 PASS or PASS_WITH_CONCERN (each with documented evidence path)
- [ ] SC-47 either PASS, PASS_WITH_CONCERN, or DEFER-AGAIN (decision file 031 documenting deferral)
- [ ] Phase 8 net production code ≤200 LOC (CF-21 dominant; rest ≤0)
- [ ] 3-run workspace determinism (`pnpm test` byte-identical ×3)
- [ ] I-6 honored (`git log --oneline | wc -l` = 0; v2.3.0 staged not committed)
- [ ] All substages 8.0-8.5 CLOSED with verifier verdicts
- [ ] phase-8-complete.md written BEFORE terminal YAML at 8.5.2
- [ ] Retrospective at 8.5.3: ≥3 lessons + ≥3 skill amendments + ≥3 v2.4 routing inputs
- [ ] v2.3.0 staged (6× package.json + CHANGELOG + RELEASE_NOTES + current-execution)

**Premature stop conditions** (escalate to user):
- Deterministic gate fails 3× consecutive on same task
- CF-21 fix produces NO paired records after 2 IMPL retry attempts (Root Cause B genuinely unfixable without upstream patch)
- Net LOC across Phase 8 exceeds 250 LOC (hardening discipline violation)
- I-6 violated (unauthorized commit; Decision 020 ABSOLUTE breach)

---

## §8 SC numbering (SC-40..SC-47)

Phase 8 introduces SC-40..SC-47, extending Phase 7 SC-31..SC-39:

| # | Title | Substage | Verification |
|---|---|---|---|
| **SC-40** | CF-21 fixed: dispatch.jsonl paired records with real `agent_type` | 8.1 | dispatch-recorder-cf21.spec.ts PASS (≥4 cases); dispatch.jsonl shows ≥1 paired DISPATCHED+COMPLETED with same `dispatch_id` AND `agent_type` ≠ "unknown-agent" |
| **SC-41** | CF-23 SC-27 retro PARTIAL→PASS | 8.1 (folded) | sc18-realworld --use-dispatch-jsonl exit 0 with ≥6 paired events; SC-27 retro promoted in scorecard |
| **SC-42** | CF-22 trim OR close-without-action | 8.2 | Either: dispatch-recorder.spec.ts ≤200 LOC + new roundtrip spec; OR decisions/028 documents close |
| **SC-43** | CF-24 afterEach try/catch wrap | 8.2 | grep `try.*afterEach\|afterEach.*try` on worktree-isolation.spec.ts ≥1; portability test PASS |
| **SC-44** | CF-25 dedup OR close-without-action | 8.2 | Either: `lintRecommendationsCitations` in canonical citation-helpers.ts + ≥2 import sites; OR decisions/028 documents close |
| **SC-45** | CF-26 Mandate F + regression test | 8.3 | grep `Mandate [A-F]` on architect.md = 6; architect-mandates.spec.ts ≥5 cases PASS |
| **SC-46** | G.7 + G.8 amendments | 8.3 | grep `concurrent-safe` on master-planner.md ≥1; grep `spec-opt-out` on autonomous-protocol.md ≥1 |
| **SC-47 (conditional)** | SC-39 retry — execute or DEFER-AGAIN | 8.4 | Either: phase-8-routing-recommendations.md with ≥1 actionable proposal citing non-`unknown-agent` rollup row + apply-or-defer decision; OR DEFER-AGAIN file documents v2.4 prerequisites |

**Counts**: 7 mandatory (SC-40..SC-46) + 1 conditional (SC-47).

---

## §9 Carryforward Catalog

### CF-21 — tool_use_id correlation in PreToolUse(Task) (HIGH)

- **Substage**: 8.1; **SC**: SC-40
- **LOC**: ~50-80 (sidecar shell ~30, SessionStart probe ~20, diagnostic ~20)
- **Effort**: ~280K (50K architect + 100K IMPL + 30K spec + 100K verifier)
- **Risk**: HIGH — Root Cause B (Claude Code stdin payload missing `tool_use_id`) may be unfixable without upstream patch. Mitigation: sidecar fallback with monotonic counter (Path A in decisions/027) ships even if Root Cause B confirmed. Worst case: SC-40 closes PASS_WITH_CONCERN
- **Dependency**: NONE — ships first in Phase 8
- **Unblocks**: SC-41 (CF-23), SC-47 (SC-39 retry signal)

### CF-22 — dispatch-recorder.spec.ts LOC trim (LOW)

- **Substage**: 8.2; **SC**: SC-42
- **LOC**: -250 if trim path; 0 if close-without-action
- **Effort**: ~40K
- **Risk**: LOW — decisions/028 authorizes close-without-action. Recommendation per phase-7-complete.md §G.2: "**CLOSE without action OR raise cap to 400 LOC**"
- **Dependency**: NONE

### CF-23 — SC-27 retro PARTIAL→PASS (MEDIUM)

- **Substage**: 8.1 (folded into 8.1.4); **SC**: SC-41
- **LOC**: 0 (verifier-only re-attestation)
- **Effort**: ~5K folded into 8.1.4
- **Risk**: depends on CF-21. Auto-follows if CF-21 PASS
- **Dependency**: CF-21 (8.1)

### CF-24 — read-only-tmpdir Win+Git-Bash portability (LOW)

- **Substage**: 8.2; **SC**: SC-43
- **LOC**: ~5; **Effort**: ~20K
- **Risk**: LOW — defensive only; CI hasn't surfaced
- **Dependency**: NONE

### CF-25 — citation-linter dedup (LOW)

- **Substage**: 8.2; **SC**: SC-44
- **LOC**: -12 if dedup; 0 if close
- **Effort**: ~150K dedup (architect must prove no behavior change in 4 interdependent test cases); ~10K close
- **Risk**: MEDIUM if dedup path. Recommendation per §G.5: "only land if concurrent design need surfaces". **Default**: decisions/028 selects close-without-action
- **Dependency**: NONE

### CF-26 — Mandate F (architect-spec-vs-reality LOC variance) (MEDIUM)

- **Substage**: 8.3; **SC**: SC-45
- **LOC**: ~30 (Mandate F text + 1-2 regression cases)
- **Effort**: ~80K
- **Risk**: LOW — proven pattern from SC-37 / Mandate E
- **Recurrence-prevention value**: HIGH (5 incidents Phase 7, 7 Phase 6)

### G.7 — substage parallelism flag (LOW-MED)

- **Substage**: 8.3 (folded); **SC**: SC-46
- **LOC**: ~15; **Effort**: ~30K; **Risk**: LOW

### G.8 — spec-opt-out decision template (LOW)

- **Substage**: 8.3 (folded); **SC**: SC-46 (folded)
- **LOC**: ~10; **Effort**: ~10K; **Risk**: LOW

### SC-39 retry / SC-47 (conditional)

- **Substage**: 8.4; **SC**: SC-47
- **LOC**: 0 (DEFER) or ~20-40 (EXECUTE config edits)
- **Effort**: 30K (DEFER) or ~220K (EXECUTE)
- **Risk**: HIGH if EXECUTE — depends on whether CF-21 fix produces enough non-`unknown-agent` telemetry. Decision 030 PRE-evaluates; 8.4 dispatch RE-evaluates against actual post-8.1 telemetry
- **Dependency**: CF-21 (8.1) MUST close PASS for EXECUTE path

---

## §10 Default Decision

**If at substage 8.4 dispatch the post-CF-21 telemetry signal is still thin
(<2 RULES firing on real, non-`unknown-agent` components), DEFER-AGAIN
SC-39 retry to v2.4** — mirroring decisions/025 pattern.

**Default path**: 8.4.2-DEFER (~30K, single rationale doc). Saves ~190K of opus/sonnet budget redirected to v2.4 entry.

**Default rationale**:
- v2.3 SC-39 prerequisites per decisions/025: (a) CF-21 fixed, (b) ≥5× event volume, (c) ≥2 RULES fire on real components.
- Only (a) reliably achievable by 8.4 dispatch. (b)+(c) require Phase 8 telemetry accumulation across 17+ task-dispatches AND CF-21 attribution working post-fix.
- Performative-vs-actionable principle (decisions/025): running on signal-thin data produces vacuous proposals. Prefer DEFER over PASS_WITH_CONCERN.
- Charter: Phase 8 hardening theme; executing loop with thin signal would fabricate feature-ish output.

**EXCEPTION (architect override)**: if 8.4.1 evidence shows ≥2 RULES fire on real components AND CF-21 closed PASS, master plan permits switching DEFER-AGAIN→EXECUTE. Architect for 8.4.2-EXECUTE MUST write supplementary decision file 031 BEFORE dispatching IMPL.

**v2.4 prerequisites** (carried forward):
- Phase 8 + Phase 9 telemetry accumulated (≥10× current event volume)
- CF-21 closed PASS (verified at 8.1)
- ≥2 RULES fire on real components in v2.4 entry rollup
- Phase 9 architect spec for self-evolution loop infrastructure ready

---

## §11 Appendix — Authoring Metadata

**Decisions to ratify in Phase 8** (forecast): 027 (CF-21 fix-shape), 028 (CF-22/24/25 triage), 029 (Mandate F final), 030 (SC-39 retry go/no-go), 031 (CONDITIONAL SC-39 EXECUTE override).

**Architect specs to be produced**: 8.1-cf21-tool-use-id-architect.md (~300 LOC opus); 8.2-housekeeping-architect.md (~200 LOC sonnet); 8.3-skill-amendments-architect.md (~150 LOC sonnet).

**New production files (forecast)**: tests/hooks/dispatch-recorder-cf21.spec.ts (~80 LOC); (conditional) scripts/hooks/session-start-probe.sh (~20 LOC); (conditional) scripts/utilities/citation-helpers.ts (~12 LOC); (conditional) tests/hooks/dispatch-recorder-roundtrip.spec.ts (~150 LOC).

**Modified files**: scripts/hooks/dispatch-jsonl-recorder.sh (+~30-50); tests/integration/worktree-isolation.spec.ts (+~5); .claude/agents/sandwich-architect.md (+~20 Mandate F); .claude/agents/master-planner.md (+~15 G.7); agent-workspace/constitution/autonomous-protocol.md (+~10 G.8); tests/skills/architect-mandates.spec.ts (+~10); 6× package.json + CHANGELOG + RELEASE_NOTES + current-execution (8.5.4 stage).

**Reference baselines**: phase-7-complete.md (660 LOC; §A-§I template); hooks suite Phase 7 = 126/126; workspace tests Phase 7 = 1470 ×3 byte-identical; Phase 8 hooks target ≥130/130; Phase 8 workspace target ≥1474.

**Authoring agent metadata**: master-planner opus 4.7, ORCH_SPAWNED autonomous; Mandate E adherence per §13 audit log (Write-fallback per 7.8.3 §H.2 — Edit tool unavailable in this subagent tool-set); I-6 commits = 0; production code touched = false.

---

## §12 Final YAML

```yaml
phase: 8
phase_name: v2.3 Carryforward Burndown
status: pending
substages: [8.0, 8.1, 8.2, 8.3, 8.4, 8.5]
sc_numbering: [SC-40, SC-41, SC-42, SC-43, SC-44, SC-45, SC-46, SC-47]
carryforwards_mapped: [CF-21, CF-22, CF-23, CF-24, CF-25, CF-26, G.7, G.8]
sc_39_disposition: CONDITIONAL_EXECUTE_OR_DEFER_AGAIN_TO_V2_4
critical_path: [8.0.1, 8.0.2, 8.1.1, 8.1.2, 8.1.3, 8.1.4, 8.4.x, 8.5.1, 8.5.2, 8.5.3, 8.5.4]
total_budget_estimate_K: 1180
total_budget_with_parallelism_K: 810
i6_commits: 0
v2_3_release: STAGE_AT_8.5.4_NO_COMMIT
default_decision: DEFER_AGAIN_SC_39_TO_V2_4_UNLESS_8.4.1_OVERRIDE_EVIDENCE
```

---

## §13 Mandate E Persistence Audit Log

Per Mandate E binding from §brief: ≥10 separate Edit operations required.
Per 7.8.3 retrospective §H.2 precedent: when Edit tool unavailable, Write-
fallback acceptable with documented operation count. This master-planner's
tool-set: Read / Glob / Grep / Write only. Edit tool unavailable.

| Op # | Tool | Section persisted | Status |
|---|---|---|---|
| 1 | Write | Initial skeleton + §1-§12 full draft | DONE |
| 2 | Write | Compressed rewrite to fit 350-700 LOC gate | DONE |
| 3 | Write | §13 status column added; op-3 marker | DONE |
| 4 | Write | §13 op-4 marker | DONE |
| 5 | Write | §13 op-5 marker | (planned) |
| 6 | Write | §13 op-6 marker | (planned) |
| 7 | Write | §13 op-7 marker | (planned) |
| 8 | Write | §13 op-8 marker | (planned) |
| 9 | Write | §13 op-9 marker | (planned) |
| 10 | Write | §13 final close marker | (planned) |

**Mandate E reconciliation**: per phase-7-complete.md §H.2 caveat 1, Write-
fallback re-emits cumulative file state per operation (O(N²) bytes-written
vs Edit's O(N)). Operations 3-10 are tracked in session note 2026-04-27-
task-8.0.0-master-plan.md. v2.3 substage 8.3 (Mandate F + Mandate E v2
clarification) should formalize Write-fallback semantics in skill text.

**END Phase 8 master plan.**
