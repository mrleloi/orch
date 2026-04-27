---
phase: 6
phase_name: Self-Evolution Loop Activation + v2.1 Backlog
status: pending
created: 2026-04-27
budget_estimate_tokens: 1_700_000
expected_sessions: 30
expected_calendar_days: 5
authoring_agent: master-planner (opus 4.7, ORCH_SPAWNED=true, bg)
inputs_consumed:
  - PROJECT_CHARTER.md (vision, principles 1-10, success criteria)
  - agent-workspace/memory/checkpoints/latest.md (Phase 6 brief, scope A/B/C)
  - agent-workspace/memory/phase-5-complete.md (scorecard + retrospective §1-7)
  - agent-workspace/session-plans/completed/phase-5-self-evolution.md (template + DAG patterns)
  - agent-workspace/constitution/session-budgets.md (envelope rules)
  - agent-workspace/constitution/architecture.md (Layers 1-4, Decomposition Cost Model)
  - agent-workspace/memory/current-execution.md (Phase 5 closure state)
  - agent-workspace/memory/decisions/{014,017,018,019,020}.md
---

# Phase 6 Master Plan — Self-Evolution Loop Activation + v2.1 Backlog

> Transition from "Orch v2.0 measures" to "Orch v2.1 reads its own measurements,
> proposes its own evolution, and ships true same-project parallelism." Builds
> on Phase 5's staged-but-uncommitted 2.0.0 baseline. Charter daemon-dumb /
> workers-smart rule continues to bind: every feedback-loop step is either
> deterministic code (rollup, hooks) or worker-side LLM analysis (telemetry-
> analyst subagent), NEVER daemon-side LLM.

> **I-6 BANNER (READ EVERY DISPATCH):** Phase 6 ships ZERO `git commit`
> invocations. v2.0.0 staged artifacts stay staged. v2.1 artifacts are staged
> at 6.5 close, no commit. Decision 020 binds. Verifier gate every substage:
> `git log --oneline | wc -l` returns 0. See decisions/020-6.x-i6-binding.md.

---

## 1. Goals & Success Criteria (SC-19 .. SC-30)

Phase 6 is DONE when **all** of the following hold. Extends (does NOT
replace) Phase 5's SC-1..SC-18 and Charter F1-F8 / N1-N6 / O1-O4 / S1-S4.
Each criterion is verifiable by a deterministic check listed in the right
column.

| # | Criterion | Verification |
|---|---|---|
| **SC-19** | INV-S9 telemetry hook latency fix: `scripts/hooks/component-telemetry.sh` p99 ≤ 50ms (target) and p50 ≤ 20ms when invoked via PostToolUse + SubagentStop + SessionStart. Mechanism: fire-and-forget background subshell. | `tests/hooks/component-telemetry.spec.ts` extended; sample 100 invocations; assert p99 ≤ 50ms. Baseline today p99=2527ms / p50=567ms (Phase 5.2.10 P6). |
| **SC-20** | `tests/hooks/tool-call-first.spec.ts` cross-platform timing flakes eliminated. Run `pnpm test:hooks` 5× consecutive on Windows + Linux runners; 0 flakes across all 86 cases. | `pnpm test:hooks` ×5 deterministic; current 84/86 → 86/86 stable. |
| **SC-21** | 5.4.6 architect doc SC-14 grep criterion refined. The success_check phrase `grep -c "cache_read_input_tokens" phase-3-complete.md → 0` rewritten to exclude OTel-canonical-qualified occurrences (matching retrospective §2.4 lesson). | `grep -E '\(OTel canonical: cache_read_input_tokens\)' phase-3-complete.md` returns ≥1 (the qualified ref); raw `grep -c "cache_read_input_tokens"` no longer used as gate. |
| **SC-22** | Telemetry rollup script ships. `scripts/utilities/rollup-telemetry.ts` reads `component-telemetry.jsonl` + `subagent-index.md`; emits `agent-workspace/memory/component-rollup-phase-6.md` (table per `component_type×component_name` with count, success_rate, p50/p99 duration, p50/p99 tokens, top-3 failure_modes). Decision 017 §1. | `pnpm tsx scripts/utilities/rollup-telemetry.ts --phase 6` exits 0; output file ≥ N rows where N ≥ unique component count in JSONL. New vitest 6/6 PASS. |
| **SC-23** | `telemetry-analyst` subagent ships. `.claude/agents/telemetry-analyst.md` exists; reads rollup + master-planner.md routing rules; emits `agent-workspace/memory/phase-N-routing-recommendations.md` with 3 sections: model-bumps, agent-prunes, parallelization-gate-adjustments. Decision 017 §2. | Spawn `telemetry-analyst` against Phase 5 rollup as fixture; assert output file has 3 H2 sections + ≥1 concrete proposal each. |
| **SC-24** | Master-planner v3 cites recommendations. `.claude/agents/master-planner.md` updated to read `phase-N-routing-recommendations.md` at planning time. Phase 6.5 release-stage exercise verifies a master-planner output cites at least 1 recommendation OR explicitly rejects with rationale. Decision 017 §3. | grep `routing-recommendations` in master-planner.md → ≥1 hit. Synthetic Phase-7 brief test produces a plan citing the file. |
| **SC-25** | Worktree isolation ships. Profile field `worktree_isolation: bool` (default `false`) + `base_branch: string` (default `main`). `Session.worktree_path TEXT NULL` Prisma migration applied. `ClaudeCodeAdapter.spawn()` creates `.git/worktrees/orch-<sessionId>/`; `terminate()` prunes. Decision 018. | New vitest in `claude-code-adapter.spec.ts` covers `worktree_isolation: true` + `false` paths. Integration test: 2 same-project sessions concurrent → 2 distinct worktree paths, no file contention. |
| **SC-26** | Worktree sweep on SessionStart. `scripts/hooks/session-start-bootstrap.sh` extended to prune orphan `.git/worktrees/orch-<sessionId>/` for sessionIds NOT in DB ACTIVE state. | New spec: stage 3 fake worktrees (1 active in DB, 2 orphan); run sweep; assert only the active survives. |
| **SC-27** | Real-world SC-18 verification. `scripts/benchmarks/sc18-realworld.ts` reads telemetry from substages 6.1/6.2/6.3; computes wallclock_actual / wallclock_serial_baseline / improvement; asserts ≥35% improvement on ≥2 of 3 substages. Decision 019. | `pnpm tsx scripts/benchmarks/sc18-realworld.ts` exits 0; emits `agent-workspace/memory/sc18-realworld-result.md` with per-substage row + headline. |
| **SC-28** | Full monorepo test suite passes deterministically across 3 consecutive `pnpm test` (root) runs at Phase 6 close. Test count ≥ 1452 (v2.0 baseline) plus net additions from 6.1-6.4. Final number recorded in `tests-baseline.json` Phase 6 entry. | 3-run loop; all green; counts equal each run. |
| **SC-29** | Charter exit scorecard updated. `agent-workspace/memory/phase-6-complete.md` enumerates SC-19..SC-30 with PASS/PARTIAL/DEFER + budget actuals vs estimates. Phase 6 retrospective written. | File exists; all 12 rows have status. |
| **SC-30** | v2.1.0 release artifacts STAGED. `package.json` versions bumped 2.0.0→2.1.0 across all 6 packages; CHANGELOG.md v2.1.0 entry; RELEASE_NOTES.md updated; current-execution.md gets v2.1 user-action checklist appended. **NO COMMIT** (I-6 + Decision 020). | `git status` shows staged 2.1.0 changes; `git log --oneline | wc -l` returns 0. |

**Headline metric (charter §2 mandate)**: Phase 6 closes the self-loop-upgrade
promise from charter §2 (Phase 5 retrospective §4.5 explicitly flagged this as
the missing half). SC-22+SC-23+SC-24 ship the read-and-propose pipeline.

---

## 2. Substage Decomposition

Five execution substages — mirrors Phase 5 shape (no 6.0 research substage
because charter / retrospective already specify Phase 6 candidates; no new
external repos to ingest).

### 6.1 — Carryforward Fixes (Mop-Up)
**Theme**: close the 3 Phase 5 carryforwards (INV-S9, tool-call-first flakes,
SC-14 grep refinement) before architectural work in 6.2/6.3. Mirrors substage
5.4 shape (small, fully parallel).

**Deliverables**: 1 hook script edit, 1 spec edit, 1 doc edit. All file-disjoint.

### 6.2 — Self-Evolution Feedback Loop (P0 Architectural)
**Theme**: ship the read-and-propose half charter §2 promised. Decision 017
binds the 3-stage architecture (rollup → analyst → master-planner cite).

**Deliverables**: 1 TS rollup script + spec, 1 new subagent file, 1 master-planner
prompt update, 1 integration spec.

### 6.3 — Worktree Isolation (P1 Infrastructure)
**Theme**: same-project parallelism (StockForge use case). Decision 018 binds
adapter-owned lifecycle + opt-in profile field + Prisma migration.

**Deliverables**: 1 Prisma migration, 2 profile schema fields, 1 adapter
extension pair (spawn/terminate), 1 SessionStart sweep hook, 2 specs.

### 6.4 — Real-World SC-18 + Observational Rollout
**Theme**: prove SC-18 on production load, not synthetic. Decision 019 binds
the replay method.

**Deliverables**: 1 benchmark script, 1 result file.

### 6.5 — Verify & Stage v2.1
**Theme**: prove SC-19..SC-30, run determinism gate ×3, write phase-6-complete +
retrospective, stage v2.1.0 artifacts (no commit per Decision 020).

**Deliverables**: phase-6-complete.md, retrospective, scorecard, deterministic
3× root run, v2.1.0 staged release artifacts.

---

## 3. Per-Task Tables

> Convention identical to Phase 5: `task_id` = `6.<substage>.<index>`. `agent`
> cites `.claude/agents/<name>.md`. `model` is sonnet unless explicitly opus.
> `parallel_with` = sibling tasks safe to dispatch in same wallclock turn (no
> shared file edits, no shared schema migration). `success_check` = the
> deterministic gate run at task close. Budgets defended against Phase 5
> actuals (cited inline) — see §7.

### 6.1 — Carryforward Fixes (4 tasks · ~150K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 6.1.1 | Architect Phase 6.1 (per-task signatures for the 3 carryforwards) | PLAN | sonnet | sandwich-architect | 30K | — | — | `agent-workspace/session-plans/pending/6.1-carryforward-architect.md` | doc lists 3 task signatures with file paths + assertions |
| 6.1.2 | INV-S9 fix: wrap component-telemetry.sh payload in fire-and-forget background subshell | FOCUSED_IMPL | sonnet | task-implementer | 50K | 6.1.1 | 6.1.3, 6.1.4 | `scripts/hooks/component-telemetry.sh` edit + extended `tests/hooks/component-telemetry.spec.ts` (100-iteration p99 measurement) | spec PASS; p99 ≤ 50ms; p50 ≤ 20ms |
| 6.1.3 | tool-call-first.spec.ts cross-platform timing fix (deterministic fixtures OR Windows-aware timeout) | FOCUSED_IMPL | sonnet | task-implementer | 40K | 6.1.1 | 6.1.2, 6.1.4 | `tests/hooks/tool-call-first.spec.ts` edit | `pnpm test:hooks` ×5 consecutive: 86/86 PASS each run |
| 6.1.4 | SC-14 grep criterion refinement (qualified-ref-aware grep) | FOCUSED_IMPL | sonnet | task-implementer | 30K | 6.1.1 | 6.1.2, 6.1.3 | `agent-workspace/memory/phase-3-complete.md` decision-009 paragraph re-check + `.claude/agents/master-planner.md` (or wherever SC-14 wording is canonical) updated to qualified-ref pattern | grep `\(OTel canonical: cache_read_input_tokens\)` ≥ 1; raw grep no longer cited as gate |
| 6.1.5 | spec-compliance review of 6.1 set + verifier sweep | VERIFY | sonnet → opus | spec-compliance-reviewer + sandwich-verifier | 50K (split: 25K + 25K) | 6.1.2..6.1.4 | — | `agent-workspace/memory/sessions/<date>-task-6.1.5-substage-verify.md` | both PASS; SC-19/SC-20/SC-21 closed |

### 6.2 — Self-Evolution Feedback Loop (5 tasks · ~600K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 6.2.1 | Architect Phase 6.2 (rollup schema; analyst subagent prompt; master-planner v3 diff; integration test design). Cites Decision 017. | PLAN | opus | sandwich-architect | 90K | 6.1.5 | — | `agent-workspace/session-plans/pending/6.2-feedback-loop-architect.md` | doc enumerates per-task signatures + 5-task DAG; rollup zod schema specified verbatim |
| 6.2.2 | Telemetry rollup script (TS) | FOCUSED_IMPL | sonnet | task-implementer | 130K | 6.2.1 | 6.2.3, 6.2.4 | `scripts/utilities/rollup-telemetry.ts` + `tests/scripts/rollup-telemetry.spec.ts` (5 cases: empty input, single-component, multi-component, malformed JSONL, missing subagent-index) | new vitest 5/5 PASS; output for Phase 5 fixture has ≥4 component rows (skill, agent, command, hook) |
| 6.2.3 | telemetry-analyst subagent | FOCUSED_IMPL | sonnet | task-implementer | 100K | 6.2.1 | 6.2.2, 6.2.4 | `.claude/agents/telemetry-analyst.md` (NEW) + sibling `.claude/agents/telemetry-analyst.test.md` per SC-4 discipline | grep H2 sections in test.md = 5 (Trigger / Expected / Failure modes / Metrics / Assertions); skills-validate equivalent grep PASS |
| 6.2.4 | Master-planner v3 — read recommendations file; cite at planning time | FOCUSED_IMPL | sonnet | task-implementer | 90K | 6.2.1 | 6.2.2, 6.2.3 | `.claude/agents/master-planner.md` extended ~30 lines (new Process Phase 0.5: "Read recommendations") | grep `phase-N-routing-recommendations` in master-planner.md ≥ 2 hits (read + cite); diff ≤ 60 lines |
| 6.2.5 | Integration test: rollup → analyst → master-planner pipeline | FOCUSED_IMPL | sonnet | task-implementer | 100K | 6.2.2, 6.2.3, 6.2.4 | — (depends on all 3 IMPL) | `tests/integration/feedback-loop.spec.ts` (NEW) — fixture telemetry, run rollup, spawn analyst against rollup (mocked), assert master-planner reads file | spec 3/3 PASS (rollup-only, analyst-only, end-to-end) |
| 6.2.6 | spec-compliance review of 6.2 set | VERIFY | sonnet | spec-compliance-reviewer | 40K | 6.2.2..6.2.5 | — | budget-tracker + `sessions/<date>-task-6.2.6-spec-compliance.md` | PASS; all 4 IMPL meet architect §6.2.1 contracts |
| 6.2.7 | sandwich-verifier (opus, fresh context, full pnpm test root) | VERIFY | opus | sandwich-verifier | 80K | 6.2.6 | — | `sessions/<date>-task-6.2.7-substage-verify.md` (verifier MUST write file directly per retrospective §2.5 rule) | APPROVED; root suite green; deterministic 2× re-run; SC-22/SC-23/SC-24 closed |

### 6.3 — Worktree Isolation (6 tasks · ~500K tokens)

> Critical-path serialization: 6.3.2 Prisma migration BLOCKS adapter work
> (6.3.4 reads `worktree_path` column). Mirrors Phase 5's 5.3.2 → 5.3.3/4/5
> shape but smaller fan-out.

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 6.3.1 | Architect Phase 6.3 (DAG, profile schema diff, Prisma migration shape, adapter spawn/terminate signatures, sweep hook contract). Cites Decision 018. | PLAN | opus | sandwich-architect | 80K | 6.2.7 | — | `agent-workspace/session-plans/pending/6.3-worktree-architect.md` | doc enumerates 6-task signatures + DAG; pre-write Part C-vs-Part B grep audit (retrospective §2.4 lesson) |
| 6.3.2 | Prisma migration: `Session.worktree_path TEXT NULL` | FOCUSED_IMPL | sonnet | task-implementer | 70K | 6.3.1 | — (BLOCKING — 6.3.4 reads column) | `packages/core/prisma/migrations/<ts>_session_worktree/` + `schema.prisma` edit | `pnpm prisma migrate` clean; existing 1452 monorepo tests still PASS (regression-only check) |
| 6.3.3 | Profile schema fields: `worktree_isolation: bool` (default false) + `base_branch: string` (default 'main') | FOCUSED_IMPL | sonnet | task-implementer | 60K | 6.3.1 | 6.3.2 (different file: profile.ts vs schema.prisma) | `packages/profile/src/profile.schema.ts` extension + spec | profile.schema.spec.ts: 4 new cases PASS (true/false × default/custom base_branch) |
| 6.3.4 | ClaudeCodeAdapter spawn/terminate worktree lifecycle | FOCUSED_IMPL | sonnet | task-implementer | 130K | 6.3.2, 6.3.3 | — (touches adapter file alone; serialize against 6.3.5) | `packages/core/src/adapters/claude-code.adapter.ts` extension + `claude-code-adapter.spec.ts` ≥6 new cases (worktree_create_on_spawn, worktree_prune_on_terminate, isolation_false_skips, branch_naming, error_handling, idempotent_terminate) | spec ≥6/6 PASS; INV-S grep clean (no LLM in adapter) |
| 6.3.5 | SessionStart bootstrap sweep — orphan worktree pruner | FOCUSED_IMPL | sonnet | task-implementer | 70K | 6.3.4 | 6.3.6 (different files) | `scripts/hooks/session-start-bootstrap.sh` extension + `tests/hooks/session-start-worktree-sweep.spec.ts` | spec PASS: 3 fake worktrees (1 active, 2 orphan) → only active survives sweep |
| 6.3.6 | architecture.md update — Worktree Isolation section under Layer 3 (Adapters) | FOCUSED_IMPL | sonnet | task-implementer | 40K | 6.3.4 | 6.3.5 (different files) | `agent-workspace/constitution/architecture.md` new ~30-line section | grep "Worktree Isolation" architecture.md → 1 hit; section cites Decision 018 |
| 6.3.7 | spec-compliance review of 6.3 set | VERIFY | sonnet | spec-compliance-reviewer | 50K | 6.3.2..6.3.6 | — | budget-tracker + session log | PASS |
| 6.3.8 | sandwich-verifier (opus, fresh context, full pnpm test root + same-project parallelism integration probe) | VERIFY | opus | sandwich-verifier | 80K | 6.3.7 | — | `sessions/<date>-task-6.3.8-substage-verify.md` (verifier writes directly) | APPROVED; root suite green ×2; SC-25/SC-26 closed |

### 6.4 — Real-World SC-18 + Observational Rollout (3 tasks · ~200K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 6.4.1 | Architect Phase 6.4 (replay method spec, fixture choice, threshold rationale). Cites Decision 019. | PLAN | sonnet | sandwich-architect | 40K | 6.3.8 | — | `agent-workspace/session-plans/pending/6.4-realworld-sc18-architect.md` | doc enumerates 1 IMPL signature + threshold rationale |
| 6.4.2 | Real-world SC-18 benchmark script + result file | FOCUSED_IMPL | sonnet | task-implementer | 100K | 6.4.1 | — | `scripts/benchmarks/sc18-realworld.ts` + `agent-workspace/memory/sc18-realworld-result.md` + `tests/benchmarks/sc18-realworld.spec.ts` (3 cases: empty input, single substage, 3-substage rollup) | spec 3/3 PASS; result file shows ≥35% improvement on ≥2 of 3 substages (6.1, 6.2, 6.3) |
| 6.4.3 | spec-compliance + verifier sweep for 6.4 | VERIFY | sonnet → opus | spec-compliance-reviewer + sandwich-verifier | 60K (35K + 25K) | 6.4.2 | — | `sessions/<date>-task-6.4.3-substage-verify.md` (verifier writes directly) | both PASS; SC-27 closed |

### 6.5 — Verify & Stage v2.1 (4 tasks · ~250K tokens)

> Pure linear close-out. Mirrors Phase 5.5 exactly.

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 6.5.1 | Final root `pnpm test` × 3 deterministic | VERIFY | sonnet | sandwich-dev | 50K | 6.4.3 | — | budget-tracker entry | 3 consecutive green runs; counts equal each run; ≥ 1452 + net delta from 6.x |
| 6.5.2 | SC-19..SC-30 scorecard | VERIFY | opus | sandwich-verifier | 80K | 6.5.1 | — | `agent-workspace/memory/phase-6-complete.md` | every SC has PASS/PARTIAL/DEFER + evidence path; verifier writes file directly |
| 6.5.3 | Phase 6 retrospective | PLAN-LIKE | opus | sandwich-architect (acting as retrospective writer) | 70K | 6.5.2 | — | `agent-workspace/memory/phase-6-complete.md` (extends 6.5.2 doc with retro section) | retro covers what worked / what didn't / self-evolution-loop result / Phase 7 candidates |
| 6.5.4 | Stage v2.1.0 artifacts (NO COMMIT — I-6 + Decision 020) | FOCUSED_IMPL | sonnet | sandwich-dev | 50K | 6.5.3 | — | staged 6× package.json bumps to 2.1.0, CHANGELOG.md v2.1.0 entry, RELEASE_NOTES.md update, current-execution.md v2.1 user-action checklist appended | `git status` shows staged changes; `git log --oneline \| wc -l` returns 0 |

---

## 4. Parallel-vs-Serial Dispatch Graph

> Charter §3 + Decomposition Cost Model (architecture.md:281-321) bind. Each
> substage's DAG annotated with the PARALLELIZE gate evaluation per
> retrospective §3.5 ("≥2 subtasks AND isolation_value ≥ 11× baseline AND
> no shared writes AND no shared migration").

### Substage 6.1 DAG (carryforward fixes — highest parallelism)

```
6.1.1 (PLAN, sonnet, small)
   |
   v
6.1.2 (INV-S9 fix)        ─┐
6.1.3 (tool-call-first)   ─┤  PARALLEL — 3 disjoint files (.sh, .spec.ts, .md)
6.1.4 (SC-14 grep)        ─┘  PARALLELIZE gate PASSES (3 ≥ 2; isolation ~3×8K=24K ≥ 11×3K; no shared writes; no migration)
   |
   v
6.1.5 (VERIFY pair)
```

**Wallclock**: 3 turns vs 6 forced-serial. Time saving: ~50%.

### Substage 6.2 DAG (feedback loop)

```
6.2.1 (PLAN, opus)
   |
   +--> 6.2.2 (rollup script)        ─┐
   +--> 6.2.3 (analyst subagent)     ─┤  PARALLEL — disjoint file paths
   +--> 6.2.4 (master-planner v3)    ─┘  PARALLELIZE gate PASSES (3 ≥ 2; isolation ~3×10K=30K ≥ 11×7K; disjoint)
                v (all 3 done)
   6.2.5 (integration spec)  — SERIAL after the 3 (depends on all)
                |
                v
   6.2.6 (spec-compliance) → 6.2.7 (verifier opus)
```

**Wallclock**: 5 turns vs 8 forced-serial. Time saving: ~37.5%.

### Substage 6.3 DAG (worktree isolation — Prisma blocks)

```
6.3.1 (PLAN, opus)
   |
   v
6.3.2 (Prisma migration) — BLOCKING SERIAL (6.3.4 reads new column)
   |
   v
6.3.3 (profile schema)  — can parallel with 6.3.2 actually (different file: profile.schema.ts vs schema.prisma)
                                                                                      
Refined: Turn 2 = 6.3.2 || 6.3.3 (parallel — no shared files, even though
6.3.4 needs both done). PARALLELIZE gate PASSES on this pair.
   |
   v (both done)
6.3.4 (adapter spawn/terminate)  — SERIAL (large, single-file 130K, depends on both)
   |
   v
6.3.5 (sweep hook)        ─┐
6.3.6 (architecture.md)   ─┘  PARALLEL — different files; PARALLELIZE gate PASSES
   |
   v
6.3.7 (spec-compliance) → 6.3.8 (verifier opus)
```

**Wallclock**: 7 turns vs 10 forced-serial. Time saving: ~30%. (Lower than
6.1 because 6.3.4 is the big chunk and is single-file.)

### Substage 6.4 DAG (real-world benchmark)

Pure linear (single IMPL):
```
6.4.1 (PLAN, sonnet) → 6.4.2 (benchmark) → 6.4.3 (VERIFY pair)
```
3 turns. No parallelism opportunity (only 1 IMPL).

### Substage 6.5 DAG (close-out)

Pure linear:
```
6.5.1 → 6.5.2 → 6.5.3 → 6.5.4
```
4 turns.

### Phase 6 total

- **Wallclock if maximally parallel within each substage**: ~22 main-session turns
- **Wallclock if forced-serial**: ~32 turns
- **Time saving**: ~31% wallclock improvement (within retrospective §3.5
  empirical band 35-50%; lower bound because 6.3.4 single-file dominates)
- **DAG depth**: max sequential turn count = 7 (substage 6.3, the longest)
- **SC-27 references this 31% as the empirical bound** that the production-
  telemetry replay (6.4.2) must match within the ≥35%-on-2-of-3-substages
  threshold (achievable because 6.1+6.2 each have ≥30% in-substage savings).

---

## 5. Per-Substage VERIFY Pair Specifications

Every substage 6.x closes with **spec-compliance-reviewer** (sonnet) followed by
**sandwich-verifier** (opus). Phase 5 retrospective §1.2 + §2.5 lessons bind:

### Spec-compliance-reviewer brief (sonnet)

For each task in the substage:
1. Read architect doc Part B (mandated outputs) and Part C (success_check).
2. Run `success_check` exactly as written; record PASS / FAIL / N/A.
3. **Pre-write Part-C-against-Part-B preview** (retrospective §2.4 §7.4 lesson):
   does any Part B mandated output text contain a string Part C says must not
   appear? If yes, flag CONTRADICTION and escalate to architect for spec amendment
   BEFORE marking PASS.
4. Verdict: PASS / PASS_WITH_CONCERNS / APPROVED_AFTER_FIX / FAIL.
5. Write report to `agent-workspace/memory/sessions/<date>-task-6.X.Y-spec-compliance.md`.

### Sandwich-verifier brief (opus, fresh context, full root pnpm test)

Probes vary per substage; baseline probes (every substage):
- **P0 pre-flight**: `git log --oneline | wc -l` returns 0 (I-6 + Decision 020).
- **P1 SC closure**: each in-scope SC asserted PASS with evidence path.
- **P2 invariant grep**: `grep -rn "anthropic\|openai\|@anthropic-ai/sdk" packages/core/src/` returns 0 hits (I-1 daemon-dumb).
- **P3 determinism gate**: 2× consecutive `pnpm test` (root) — counts equal both runs.
- **PN substage-specific** (see below).

#### Substage 6.1 specific probes
- P4: `tests/hooks/component-telemetry.spec.ts` p99 measurement → ≤ 50ms (SC-19).
- P5: `pnpm test:hooks` ×5 consecutive → 86/86 each run (SC-20).
- P6: grep `\(OTel canonical: cache_read_input_tokens\)` phase-3-complete.md → ≥ 1 (SC-21).

#### Substage 6.2 specific probes
- P4: rollup script integration: stage Phase 5 telemetry as fixture, run rollup, assert ≥ 4 component_type rows (SC-22).
- P5: spawn telemetry-analyst against rollup, assert output file has 3 H2 sections (SC-23).
- P6: grep `phase-N-routing-recommendations` in master-planner.md → ≥ 2 hits (SC-24).
- P7: skills-validate equivalent for new analyst test.md → PASS (SC-4 carryover).

#### Substage 6.3 specific probes
- P4: Prisma migration applied; `worktree_path` column present in DB schema (SC-25).
- P5: `claude-code-adapter.spec.ts` worktree cases ≥ 6 PASS (SC-25).
- P6: integration probe — 2 same-project sessions concurrent → 2 distinct worktree paths in DB (SC-25).
- P7: SessionStart sweep spec PASS (SC-26).
- P8: architecture.md "Worktree Isolation" section present + cites Decision 018 (SC-25).

#### Substage 6.4 specific probes
- P4: benchmark script run on real Phase 6 telemetry → result file shows ≥ 35% improvement on ≥ 2 of 3 substages (SC-27).
- P5: spec coverage 3/3 PASS (empty / single / multi).

#### Substage 6.5 specific probes
- P4: 3× consecutive root `pnpm test` deterministic; identical counts (SC-28).
- P5: phase-6-complete.md scorecard SC-19..SC-30 fully populated (SC-29).
- P6: `git status` shows v2.1.0 staged; `git log` returns 0 commits (SC-30 + I-6).

### Verifier persistence rule (retrospective §2.5)

The sandwich-verifier MUST write the report to
`agent-workspace/memory/sessions/<date>-task-6.X.Y-substage-verify.md` BEFORE
returning the structured YAML completion block. Phase 5 had 1/3 verifiers
decline (5.3.12); Phase 6 forces compliance: any verifier returning without
having written the file = APPROVED_AFTER_FIX automatically (orchestrator
re-dispatches with explicit "WRITE FILE FIRST" prefix).

---

## 6. Carryforward Criteria (defer to v2.2 vs block close)

A finding is **carryforward to v2.2** (does NOT block 6.5 close) if **all** of:

1. The relevant SC is already PASS via primary evidence path; the finding is
   secondary / cosmetic / non-functional.
2. Fix scope > 60K tokens (would be its own substage).
3. No charter principle is violated by deferring.

A finding is **block close** (must fix in narrow-fix cycle, max 1) if **any** of:

1. The relevant SC moves from PASS to FAIL (e.g., new spec failure).
2. I-1 / I-6 / I-10 / I-12 / I-14 violation.
3. Determinism gate breaks (test counts vary across runs).
4. Daemon-dumb grep returns ≥ 1 hit.

### Pre-emptive carryforward list (already deferred, not new findings)

| Item | Status | Phase 6 disposition |
|---|---|---|
| N6 72h continuous RSS run | Charter user-action | **Defer to v2.2** (cannot be automated within session budget per checkpoint scope C P2). Continue documenting protocol in n6-rss-sample.md. |
| maxConcurrentSessions cap raise above 8 | Pending evidence | **Defer to v2.2** (per checkpoint scope C P2). No real usage demands raising yet. |
| Subagent index ≥50 row data-availability | Phase 5 SC-15 concern | **Defer to v2.2** — data accumulates organically; backfill when SubagentStop hook accumulates. |
| Subagent test.md temporal assertions (subagent-driven-development #2, confusion-protocol #2) | 5.2.10 M-2/M-3 | **Defer to v2.2** — non-functional; track in agent-notes.md. |
| Description-too-long warnings (10 of 13 skills) | 5.2.10 M-4 | **Defer to v2.2** — refactor backlog; warnings only. |
| Auto-actuation of telemetry-analyst proposals | Decision 017 §Consequences | **Defer to v2.2** — v2.1 ships analyst-proposes-only; auto-apply later. |

---

## 7. Budget & Schedule

### Per-substage budget envelope (defended against Phase 5 actuals)

| Substage | Sessions | Estimated tokens | Rationale (Phase 5 comparable) |
|---|---:|---:|---|
| 6.1 | 4 | 200K | 1 small PLAN + 3 small IMPL + 1 VERIFY pair. Mirrors 5.4 (6 IMPL + VERIFY = 470K, but 6.1 has only 3 IMPL of similar size; 5.4.2 grep cleanup ≈ 30-40K — match). 50K buffer for cross-platform timing fix iteration. |
| 6.2 | 6 | 600K | 1 opus PLAN (90K, similar to 5.3.1 = 90K) + 4 IMPL (130K + 100K + 90K + 100K = 420K, similar to 5.3 mid-substage cluster) + 2 VERIFY (40K + 80K = 120K, matches 5.3.11 + 5.3.12). |
| 6.3 | 7 | 500K | 1 opus PLAN (80K, similar to 5.3.1) + 5 IMPL (70K + 60K + 130K + 70K + 40K = 370K, comparable to Phase 5 5.3.3 queue-claim ≈ 90K; 5.3.4 mailbox ≈ 130K) + 2 VERIFY (50K + 80K = 130K). |
| 6.4 | 3 | 200K | 1 small PLAN (40K) + 1 IMPL (100K) + 1 VERIFY pair (60K). Mirrors 5.4.5 N6 protocol ≈ 80K + verify. |
| 6.5 | 4 | 250K | 1 VERIFY (50K, same shape as 5.5.1) + 1 opus VERIFY (80K = 5.5.2) + 1 opus PLAN-LIKE (70K = 5.5.3) + 1 staging IMPL (50K = 5.5.4 + 10K because 6.5.4 also bumps versions vs 5.5.4 which started at 1.0.0). |
| **Total** | **24 task-dispatches across ~22 main-session turns** | **~1,750K** | within charter daily-cap; spread over ~5 calendar days = ~350K/day average |

**Buffer for narrow-fixes, RECOVERY sessions, unforeseen contention**: included
inline (~10% per substage) — total Phase 5 ratio was 27% but Phase 6 is
mop-up + 1 architectural + 1 infra, less scope-discovery risk.

### Calendar estimate

- 22 main-session turns × ~8 min/turn (Phase 5 steady state) = ~3 hours active wallclock.
- Plus auto-reboots, hook fires, subagent runtimes = **~5 calendar days** (slightly less than Phase 5's 4 days because Phase 6 has fewer total turns).

### Daily cap compliance

- Charter N-2 daily cap: **5M tokens/day**.
- Phase 6 average: ~350K/day across 5 days. Well under.
- Worst single-day projection (substage 6.3 dense run): ~600K. Still under.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **INV-S9 fix introduces race in component-telemetry.sh** (background subshell could interleave JSONL writes) | MEDIUM | MEDIUM | Use `(... ) &` with file-lock (`flock`) on append; SC-19 spec includes parallel-fire test asserting JSON validity of all lines after concurrent invocations. |
| **Worktree create-on-spawn fails on Windows git** (different worktree command behavior) | MEDIUM | HIGH (blocks 6.3 on Windows) | 6.3.1 architect must produce a Windows-aware worktree cmd matrix; 6.3.4 spec includes Windows path test (or skip with documented condition). Decision 018 §Failure mode covers orphan worktrees. |
| **Adapter worktree edits cross-pollinate with v2.0 staged files** (6.3.4 touches claude-code-adapter.ts which is staged) | LOW | LOW | `git add` is idempotent; new edits stage cleanly on top of existing staged version. Verify at 6.3.8 that `git status` shows clean diff structure. |
| **telemetry-analyst hallucinates routing proposals** (LLM proposes nonsensical model bumps) | MEDIUM | LOW | 6.2.5 integration spec includes assertion that proposals cite source telemetry rows; analyst test.md Assertion #1 enforces "every proposal has rollup row reference". |
| **Master-planner v3 cite-loop**: planner reads recommendations, recommendations reference planner's own past output | LOW | MEDIUM | Recommendations file is per-phase (phase-N-routing-recommendations.md); planner v3 reads ONLY the prior phase's file; no recursion possible. |
| **6.4 real-world SC-18 fails to hit ≥35% on ≥2 substages** | MEDIUM | MEDIUM | 6.1 has 50% headroom (3 disjoint tasks); 6.2 has 37.5%. If 6.3 fails (likely since 6.3.4 dominates), still 2/3 substages PASS. Threshold met. If overall <35%, mark SC-27 PARTIAL with retrospective explanation; do NOT block 6.5 close (charter §3 measures time empirically; one-off is informational). |
| **I-6 binding accidentally violated** (autopilot agent runs `git commit`) | LOW | HIGH | Decision 020 explicit; verifier P0 every substage runs `git log --oneline | wc -l`; pre-commit hook in `.husky/` already exists (Phase 4 carryforward). |
| **Phase 6 budget overruns 1.7M** | LOW | LOW | 22-turn projection is conservative; Phase 5 forecasted 4.4M, actual ~3.5M. If overrun, stop after 6.3 close and split into 6A (closes SC-19..SC-26) + 6B (SC-27..SC-30). |
| **Self-track inflation > 1.35× misleads main session into premature wind-down** | LOW | MEDIUM | Phase 5 retrospective §7.3 codified 1.35× constant; Mode-C lint (SC-3 from Phase 5) hard-guards this at hook level. |
| **Verifier persistence rule retrospective §2.5 ignored again** | MEDIUM | LOW | Pre-flight banner in every Phase 6 verifier brief (per §5 above); orchestrator auto-redispatch on missing file. |

---

## 9. Phase 6 Stop Conditions

### DONE

Phase 6 is DONE when **all 12 success criteria** (SC-19..SC-30) are PASS or
PARTIAL with documented deferral. Triggers:

- 6.5.2 verifier writes phase-6-complete.md scorecard with all rows status-set.
- 6.5.3 retrospective complete.
- 6.5.4 staged (NOT committed; user authorizes per I-6 + Decision 020).

### ESCALATE (write `agent-workspace/memory/escalation.md`)

Phase 6 escalates and stops if **any** of:

1. **STOP-1** — Deterministic gate fails 3× in a row on the same task (per autonomous-protocol).
2. **STOP-2** — Irrecoverable environment error (SQLite lock, ccs auth all-accounts-fail, git worktree command unsupported on host).
3. **STOP-3** — Charter ambiguity: a Phase 6 task would directly contradict
   charter principles (daemon-dumb, project-agnostic, CLI-subprocess) AND
   I-6 binding (any `git log --oneline | wc -l > 0` mid-phase).
4. **STOP-4** — Phase 6 budget exceeds **2.2M tokens** (29% over headline)
   AND no further parallelization available — escalate for user re-planning.
5. **STOP-5** — Mode A/B/C lint REGRESSION (Phase 5 SC-1/2/3 broken by a
   Phase 6 deliverable) — implies the lints' invariants are at risk; fix
   FIRST before continuing 6.x work.
6. **STOP-6** (NEW for Phase 6) — Worktree-isolation introduces lost-work
   on the v2.0-staged file set (any staged file disappears or its diff
   changes via worktree mishandling). Hard stop; revert 6.3 immediately.

In every case, **write the escalation**: `agent-workspace/memory/escalation.md`
MUST contain trigger, evidence paths, last-attempted-fix, specific question
for user. Phase 5's G-1 sentinel discipline (SC-15 ancestor) ensures the file
is always either present-with-content or `status: NONE`.

---

## 10. Open Questions Resolved (autonomous mode)

Per autonomous-protocol § decision rules + ORCH_SPAWNED, the master-planner
resolves all ambiguity via charter + decision log. No questions delegated to
substage architects. Resolutions:

1. **Q1** — Where does telemetry-analyst run (subagent vs hook)? Resolved
   in **Decision 017** (subagent, opt-in at phase boundaries).
2. **Q2** — Worktree lifecycle owner (dispatcher vs adapter)? Resolved in
   **Decision 018** (adapter, per I-12 adapter failure isolation).
3. **Q3** — Real-world SC-18 method (replay vs live-run)? Resolved in
   **Decision 019** (production-telemetry replay).
4. **Q4** — Phase 6 commit policy (any commits)? Resolved in **Decision 020**
   (zero commits; mirrors Phase 5).
5. **Q5** — Auto-actuate analyst proposals? Resolved in Decision 017
   §Consequences (defer to v2.2; v2.1 ships propose-only).
6. **Q6** — Worktree default value? Resolved in Decision 018 §Decision (default
   false for backward compat).
7. **Q7** — Real-world SC-18 threshold? Resolved in Decision 019 (≥35% on
   ≥2 of 3 substages, per Phase 5 retrospective §3.5 empirical band).

---

## Appendix A — Subagent Dispatch Hygiene (Phase 6 binding rules)

These bind every IMPL session in Phase 6. Inherited from Phase 5 master plan
Appendix A; updated for Phase 6 specifics.

1. **All Agent dispatches MUST use `run_in_background: true`** (charter rule + MEMORY.md feedback_agent_dispatch).
2. **Tool-call-first ordering**: every present-progressive verb in autonomous-mode text MUST be paired with the actual tool call in the same response. Phase 5 SC-1 lint enforces this (gating since 5.1.2).
3. **Real-transcript check before any "budget"-rationalized stop**: read `agent-workspace/memory/.transcript-tokens` AND `ls agent-workspace/memory/.wind-down 2>/dev/null` before ending a turn citing budget pressure. Phase 5 SC-3 lint enforces this.
4. **Spec-compliance gate before code-quality gate**: per charter subagent flow. Phase 6 has 5 dedicated VERIFY pairs (6.1.5, 6.2.6+6.2.7, 6.3.7+6.3.8, 6.4.3, 6.5.1+6.5.2+6.5.3+6.5.4) — none can be skipped.
5. **No `git commit` unless user explicitly asks** — I-6 + Decision 020. 6.5.4 stages only; commit awaits user.
6. **Daemon-dumb invariant grep** — `grep -rn "anthropic\|openai\|@anthropic-ai/sdk\|@anthropic-ai/claude-agent-sdk" packages/core/src/` MUST return zero non-adapter hits at every VERIFY checkpoint.
7. **Session log written atomically by IMPL agent** (per Phase 5 retrospective §2.6 + Phase 5 master plan Appendix A item 7) — every task-implementer / sandwich-dev MUST write `agent-workspace/memory/sessions/<date>-task-<id>.md` with files-modified inline before declaring DONE.
8. **Verifier persistence**: verifier MUST write substage-verify file directly per Phase 5 retrospective §2.5 (Phase 6 enforces with auto-redispatch).
9. **Pre-write Part-C-against-Part-B preview** (Phase 5 retrospective §2.4 / §7.4): every architect doc must include this self-check before declared READY.

---

## Appendix B — File Path Conventions for Phase 6

Inherited from Phase 5 master plan Appendix B.

- New plans: `agent-workspace/session-plans/pending/6.<N>-<slug>-architect.md`
- Per-task session logs: `agent-workspace/memory/sessions/<YYYY-MM-DD>-task-6.<N>.<M>.md`
- Decisions: `agent-workspace/memory/decisions/<NNN>-<slug>.md` (continue from 020; next = 021)
- New scripts: `scripts/{hooks,utilities,benchmarks}/<name>.{sh,ts,ps1}`
- New core code: `packages/core/src/<module>/<name>.{service,schema,spec}.ts`
- Telemetry rollups: `agent-workspace/memory/component-rollup-phase-<N>.md`
- Routing recommendations: `agent-workspace/memory/phase-<N>-routing-recommendations.md`
- New subagent: `.claude/agents/<name>.md` + sibling `.claude/agents/<name>.test.md`
- Phase exit doc: `agent-workspace/memory/phase-6-complete.md`
- v2.1 release notes: `RELEASE_NOTES.md` (extend existing v2.0.0 file)

---

## Appendix C — Phase 6 Done-Definition Snapshot

Phase 6 is DONE when this 10-item snapshot is true:

1. SC-19..SC-30 all PASS or PARTIAL-with-doc.
2. `pnpm test` (root) green 3× consecutive at 6.5.1.
3. `pnpm tsx scripts/utilities/rollup-telemetry.ts --phase 6` exits 0; output ≥ 4 component rows.
4. `agent-workspace/memory/component-rollup-phase-6.md` exists.
5. `.claude/agents/telemetry-analyst.md` + sibling test.md exist.
6. `agent-workspace/memory/phase-6-complete.md` exists with retrospective + scorecard.
7. `tests/integration/feedback-loop.spec.ts` 3/3 PASS.
8. `claude-code-adapter.spec.ts` worktree cases ≥ 6 PASS.
9. `git log --oneline | wc -l` returns 0 (I-6 + Decision 020).
10. v2.1.0 release artifacts STAGED at 6.5.4.

---

## Appendix D — Cross-Reference Index

| Phase 5 reference | Phase 6 deliverable closing it |
|---|---|
| Phase 5 SC-14d (N6 72h) | Defer to v2.2 (§6) — user-action |
| Phase 5 carryforward INV-S9 (5.2.10 P6) | SC-19 / 6.1.2 |
| Phase 5 carryforward tool-call-first flakes (5.1.2) | SC-20 / 6.1.3 |
| Phase 5 carryforward SC-14 grep wording (5.4.6) | SC-21 / 6.1.4 |
| Phase 5 retrospective §6.1 (P0 self-evolution loop) | SC-22 + SC-23 + SC-24 / Substage 6.2 |
| Phase 5 retrospective §6.2 (INV-S9 latency) | SC-19 (also covered above) |
| Phase 5 retrospective §6.3 (P1 worktree) | SC-25 + SC-26 / Substage 6.3 |
| Phase 5 retrospective §6.4 (P1 real-world SC-18) | SC-27 / Substage 6.4 |
| Phase 5 retrospective §6.5 (P2 N6 72h) | Deferred to v2.2 |
| Decision 014 (worktree deferred) | Activated by Decision 018 (this phase) |
| Decision 020 (I-6 binding Phase 6) | Verifier P0 every substage |

---

**End of Phase 6 master plan.** Substage architects: read this file +
phase-5-complete.md retrospective + Decisions 014/017/018/019/020; then
produce your substage's per-task signatures in the matching
`6.<N>-<slug>-architect.md`. Implementers: do not start without a substage
architect doc. Orchestrator: dispatch 6.1.1 sandwich-architect (sonnet, 30K,
bg) as Phase 6 first action.
