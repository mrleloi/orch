---
phase: 7
phase_name: Hardening + Self-Evolution Loop First Upgrade
status: pending
created: 2026-04-27
budget_estimate_tokens: 1_400_000
expected_sessions: 22
expected_calendar_days: 4
authoring_agent: master-planner (opus 4.7, ORCH_SPAWNED=true, bg)
authorization: User directive 2026-04-27T~08:05Z = "no need to release, git, ... for now, continue do development. full autonomous until done all"
inputs_consumed:
  - PROJECT_CHARTER.md (vision, principles 1-10)
  - agent-workspace/memory/checkpoints/latest.md (Phase 6 closure checkpoint)
  - agent-workspace/memory/phase-6-complete.md (scorecard + retrospective §A-§I + #11 split + Phase 7 candidates §H)
  - agent-workspace/memory/current-execution.md (Phase 6 row + 19-carryforward index + v2.0.0/v2.1.0 user-action checklists)
  - agent-workspace/session-plans/pending/phase-6-v2.1-absorption.md (template/shape; Appendix A binding)
  - agent-workspace/session-plans/completed/phase-5-self-evolution.md (template reference)
  - agent-workspace/constitution/invariants.md (INV-1..INV-15 + INV-S1..INV-S9)
  - agent-workspace/constitution/karpathy-principles.md (P1-P4)
  - agent-workspace/memory/agent-notes.md (architect-spec-vs-reality recurring lesson)
  - .claude/agents/sandwich-architect.md (Mandates A/B/C/D — binding)
  - agent-workspace/memory/decisions/021-6.2-telemetry-analyst-tier.md (sonnet-downgrade pattern)
---

# Phase 7 Master Plan — Hardening + Self-Evolution Loop First Upgrade

> Phase 7 closes the v2.2 backlog inherited from Phase 6 (4 DEFERRED-v2.2
> carryforwards: #9, #16, #18, #19) plus the carryforward #11 family split
> (11a + 11b — Windows-Git-Bash subprocess-timing) and codifies the Phase 6.5.3
> stall-recovery lesson (carryforward #20). It optionally produces the
> self-evolution loop's first real signal-driven upgrade if telemetry signal
> warrants. **Theme: harden v2.1, do not extend feature surface.**

> **I-6 BANNER (READ EVERY DISPATCH):** Phase 7 ships ZERO `git commit`
> invocations. v2.0.0 + v2.1.0 staged artifacts stay staged. v2.2 artifacts
> are staged at 7.8 close, no commit. Decision 020 binds. Verifier gate every
> substage: `git log --oneline | wc -l` returns 0. See decisions/020-6.x-i6-binding.md.

> **Hardening discipline (Karpathy P3 binding):** every Phase 7 IMPL task
> is bounded to ≤80 net LOC of production change. If a task proposes >80 LOC
> of new feature surface, it belongs in v2.3, not v2.2. The architect for
> the affected substage MUST self-flag and the master plan MUST be revised
> via supplementary decision file BEFORE the architect spec is dispatched.

---

## 1. Charter Alignment

The original PROJECT_CHARTER specified 5 phases (0-4). Phases 5 and 6 extended
that scope under explicit user authorization (user prompt
`tasks/feat_03_continue_after_phase4/user_prompt.txt` for Phase 5; user
directive 2026-04-27T~19:35Z for Phase 6). Phase 7 extends further under
**user directive 2026-04-27T~08:05Z** ("no need to release, git, ... for now,
continue do development. full autonomous until done all").

Phase 7's theme — **hardening** — is congruent with the charter's original
Phase 4 ("Polish & Share"); Phase 7 is "Polish v2.1 → ship-ready v2.2 staging".
No charter principle is overridden:

- **Daemon-dumb / workers-smart** preserved (carryforwards 11a/11b/16/18/19/20
  touch tests, scripts, hooks, and skills — not daemon decision logic).
- **Project-agnostic core** preserved (no `stockforge`-specific code added).
- **Adapter pattern** preserved (worktree-isolation integration spec promotion
  observes the same boundaries Phase 6 set).
- **One-way dependency** preserved (Phase 7 reads Phase 6 telemetry; does NOT
  introduce a managed-project → orch dependency).
- **CLI-subprocess only** preserved (no Agent SDK introduction).
- **I-6 ABSOLUTE** preserved (Decision 020 binding).

---

## 2. Goals & Success Criteria (SC-31 .. SC-38)

Phase 7 is DONE when **all** of the following hold. Extends (does NOT
replace) Phase 5 SC-1..SC-18 + Phase 6 SC-19..SC-30 + Charter F1-F8 / N1-N6 /
O1-O4 / S1-S4. Each criterion has a deterministic verification.

| # | Criterion | Verification |
|---|---|---|
| **SC-31** | Carryforward #11a fixed: `tests/hooks/mode-c-guard.spec.ts:152` is deterministic on Windows. INV-10 reporter pattern (`vi.useFakeTimers()` + `vi.advanceTimersByTime()`) replaces wallclock-dependent assertion. | `pnpm test:hooks` ×5 consecutive runs on Windows Git Bash: 104/104 PASS each run; mode-c-guard.spec.ts:152 PASSES every run. Baseline: pre-fix 540-580ms vs 500ms threshold = 100% fail rate. |
| **SC-32** | Carryforward #11b fixed: `tests/hooks/api-truncation.spec.ts:118` + `:153` + `tests/hooks/narration-grep-refinement.spec.ts` historical-mode-b-1 are deterministic on contended Windows. Same INV-10 reporter pattern as SC-31. | `pnpm test:hooks` ×5 consecutive on Windows under `node --max-old-space-size=4096` artificial-load fixture: 104/104 PASS each run; 0 timing-threshold flakes. |
| **SC-33** | Carryforward #18: real subagent dispatch + completion timestamp capture. `agent-workspace/memory/dispatch.jsonl` exists (or `budget-tracker.md` extended); each Agent dispatch writes `{ts_dispatch_ms, ts_complete_ms, agent, task_id, parent_session}` JSONL row. SC-27 PARTIAL becomes PASS once new methodology is exercised. | `pnpm tsx scripts/benchmarks/sc18-realworld.ts --use-dispatch-jsonl` exits 0; emits per-substage parallelism with the new data source; ≥35% on ≥2 of 3 most-recent substages (re-run against Phase 7's own telemetry once 7.7 closes, OR replay Phase 6 if 7.7 deferred). New vitest 4/4 PASS (capture, schema, replay, missing-file fallback). |
| **SC-34** | Carryforward #16: `tests/integration/worktree-isolation.spec.ts` exists and runs in CI. Promotes 6.3.8b verifier's runtime probe (real `git worktree add` in tmpdir + bidirectional sentinel-file check) into a permanent integration spec. | `pnpm test --filter integration` (or workspace-recursive equivalent) PASS; spec is a single `describe()` with ≥3 cases (write-A-not-in-B, write-B-not-in-A, both-cleaned-on-prune); platform-skipped cleanly on no-git environments via `it.skipIf`. |
| **SC-35** | Carryforward #9: citation linter `--rollup <path>` flag. Existing citation linter extended to verify component-existence in self-evolution rollup outputs (each `component_type::component_name` row in the rollup MUST resolve to an actual on-disk component file). | New CLI flag documented in `--help`; new vitest ≥3 cases PASS (rollup-with-all-resolvable, rollup-with-1-missing, rollup-empty); linter exits non-zero on missing-component rows. |
| **SC-36** | Carryforward #19: `scripts/benchmarks/sc18-realworld.ts` import.meta.url main-guard hygiene. CLI entry guard pattern aligned with rest of `scripts/` family. | `node --check scripts/benchmarks/sc18-realworld.ts` PASS; `pnpm tsx scripts/benchmarks/sc18-realworld.ts --help` exits 0; existing tests/benchmarks/sc18-realworld.spec.ts continues 3/3 PASS. |
| **SC-37** | Carryforward #20: sandwich-architect Mandate E (incremental-write rule). `.claude/agents/sandwich-architect.md` extended with "Mandate E — Incremental write for large files" requiring `Edit` per section (not one giant `Write` at end) when accumulated content >200 LOC. Regression test asserts the rule text is grep-able. | grep `Mandate E` `.claude/agents/sandwich-architect.md` ≥ 1; new vitest case in `tests/skills/architect-mandates.spec.ts` PASSES (rule-text-existence assertion). |
| **SC-38** | v2.2.0 release artifacts STAGED. `package.json` versions bumped 2.1.0 → 2.2.0 across all 6 packages; CHANGELOG.md v2.2.0 entry; RELEASE_NOTES.md updated; current-execution.md gets v2.2 user-action checklist appended. **NO COMMIT** (I-6 + Decision 020). | `git status` shows staged 2.2.0 changes; `git log --oneline | wc -l` returns 0. Verifier P0 every substage. |

**Optional / signal-permitting**:

| # | Criterion | Verification |
|---|---|---|
| **SC-39 (optional)** | Self-evolution loop produces ≥1 actionable proposal from Phase 6 telemetry that is either auto-applied (with explicit human review checkpoint) or documented-and-deferred. | `agent-workspace/memory/phase-7-routing-recommendations.md` exists and contains ≥1 proposal citing rollup row; if applied, evidence path; if deferred, decision file rationale. |

SC-39 is **deferrable** if Phase 6 telemetry is signal-thin (per phase-6-complete.md §C.3 honest assessment). If deferred, document in 7.0 decision-log entry with rationale.

**Headline metric**: Phase 7 closes the v2.2 backlog (4 DEFERRED items) + the
#11 family + the #20 stall-recovery lesson. The scorecard at 7.8 will report
**SC-31..SC-38 mandatory + SC-39 optional**.

---

## 3. Substage Decomposition

Eight substages. Pattern mirrors Phase 6's 5-substage shape but inverted:
Phase 7 begins with a small research/decision substage (7.0) since the
backlog is well-defined but options-bearing, then 6 narrow IMPL substages
(7.1-7.6), an optional 7.7 (signal-permitting), and a linear close-out (7.8).

| # | Substage | Tasks | Budget | Status | Notes |
|---|---|---|---|---|---|
| 7.0 | Research & decision-log | 2 (research-scanner + decisions write) | ~120K | PENDING | Decisions 022 (INV-10 reporter approach), 023 (dispatch.jsonl schema), 024 (citation-linter rollup CLI shape), 025 (SC-39 defer-or-execute) |
| 7.1 | Carryforward #11a/#11b — INV-10 reporter migration | 4 (architect + 1 IMPL + spec-compliance + verifier) | ~220K | PENDING | Hooks suite 104/104 deterministic on Windows |
| 7.2 | Carryforward #18 — real dispatch+completion timestamps | 4 (architect + 2 IMPL + verifier) | ~280K | PENDING | dispatch.jsonl + capture seam + replay benchmark; SC-27 PARTIAL → PASS |
| 7.3 | Carryforward #16 — worktree-isolation integration spec | 3 (architect + IMPL + verifier) | ~150K | PENDING | Promote 6.3.8b probe → permanent spec; CI-running |
| 7.4 | Carryforward #9 — citation linter --rollup flag | 3 (architect + IMPL + verifier) | ~130K | PENDING | Linter verifies component-existence in rollups |
| 7.5 | Carryforward #19 — sc18-realworld.ts import.meta.url hygiene | 1 (folded IMPL — minor) | ~40K | PENDING | One-task subagent; no separate VERIFY (folded into 7.8) |
| 7.6 | Carryforward #20 — sandwich-architect Mandate E + regression test | 2 (IMPL + spec-compliance) | ~80K | PENDING | Skill amendment + grep-existence regression test |
| 7.7 | Self-evolution loop's first real upgrade (signal-permitting) | 0-3 (architect + 1-2 IMPL or DEFER decision) | 0-200K | PENDING | Conditional on 7.0 Decision 025; if deferred = 0K |
| 7.8 | Verify + stage v2.2 | 4 (3-run determinism + scorecard + retro + stage v2.2.0) | ~240K | PENDING | Mirrors 6.5.1-6.5.4 |
| **Total** | **24 task-dispatches across ~22 main-session turns** | | **~1,260K-1,460K** | | within charter daily-cap; ~5 days |

**Net feature surface**: ~280 net LOC of production change estimated across
all substages (well under the per-task 80-LOC cap × 6 IMPL tasks). v2.2 is
hardening, not feature push.

---

## 4. Phase 7 Carryforwards from Phase 6 (consolidated source-of-truth)

| Source | ID | Item | Substage that closes it |
|---|---|---|---|
| 6.5.2 verifier (DEFERRED-v2.2) | 9 | Citation linter `--rollup <path>` flag | 7.4 |
| 6.5.2 verifier (DEFERRED-v2.2) | 16 | Worktree-isolation integration spec promotion | 7.3 |
| 6.5.2 verifier (DEFERRED-v2.2) | 18 | Real subagent dispatch+completion timestamps | 7.2 |
| 6.5.2 verifier (DEFERRED-v2.2) | 19 | sc18-realworld.ts import.meta.url hygiene | 7.5 |
| 6.5.2 verifier #11 split | 11a | mode-c-guard.spec.ts:152 deterministic-on-Windows fix | 7.1 |
| 6.5.2 verifier #11 split | 11b | api-truncation.spec.ts:{118,153} + narration-grep load-dependent fixes | 7.1 |
| 6.5.3 stall observed | 20 | sandwich-architect Mandate E (incremental write for large files) | 7.6 |
| Phase 6 §H candidate #6 | — | Self-evolution loop first real upgrade (signal-permitting) | 7.7 (optional) |
| Phase 6 §H candidate #N6 | — | 72h memory leak verification (manual user-run) | DEFER-v2.3 |
| Phase 6 §H candidate maxConcurrent>8 | — | Scaling beyond 8 sessions | DEFER-v2.3 (no real >8 demand) |
| Phase 6 §H candidate subagent-index | — | Agent listing/discovery doc | DEFER-v2.3 (cosmetic) |
| Phase 6 §H candidate description-too-long | — | 10 skills flagged | DEFER-v2.3 (cosmetic) |
| Phase 6 §H candidate auto-actuation | — | Skill loop auto-applying its own proposals | DEFER-v2.3 (extends 7.7) |
| Phase 6 §H candidate subagent test.md temporal | — | 5.2.10 minor M3 | DEFER-v2.3 (cosmetic) |

**Closed in Phase 7**: 7 items (#9, #11a, #11b, #16, #18, #19, #20).
**Optional in Phase 7**: 1 item (loop-first-upgrade, SC-39).
**Deferred to v2.3**: 6 items (cosmetic / out-of-scope / requires user manual run).

**Zero orphans.** Every Phase 6 carryforward has a known disposition.

---

## 5. Per-Substage Detail

### 7.0 — Research & Decision-Log

**Goal**: resolve 4 ambiguity points BEFORE any IMPL substage dispatches. Eliminates architect-spec-vs-reality risk by deciding shape up-front. Output: 4 decision files (022..025).

**Rationale**: Phase 6 wrote 5 decisions (017-021); each was cited downstream. Phase 7's 4 carryforwards each have an options-tree (e.g., 11a: vi.useFakeTimers vs platform-gate vs threshold-raise — Phase 6 §F already recommends Option (i) but the decision file makes it binding). Cost: ~120K total (60K research-scanner + 60K decision-write).

#### Task 7.0.1 — Research-scanner: load-test the 4 decision options

**Session type**: RESEARCH
**Model**: sonnet
**Agent**: research-scanner
**Budget**: 60K
**Depends on**: — (Phase 7 entry point)
**Parallel with**: —

**Part A — Files touched (read-only)**:
- `agent-workspace/memory/phase-6-complete.md` §F (carryforward #11 split + Option (i)/(ii)/(iii) table)
- `tests/hooks/tool-call-first.spec.ts` (existing INV-10 reporter pattern proven in 6.1.3)
- `tests/hooks/mode-c-guard.spec.ts:152` + `tests/hooks/api-truncation.spec.ts:{118,153}` + `tests/hooks/narration-grep-refinement.spec.ts` (the 3 affected spec files)
- `agent-workspace/memory/budget-tracker.md` (existing dispatch tracking format — informs #18 schema)
- `scripts/utilities/citation-linter.ts` (existing linter — informs #9 CLI shape)
- `scripts/benchmarks/sc18-realworld.ts` (existing — informs #19 hygiene + #18 replay seam)

**Part B — Output (read-only research note, NOT a decision yet)**:
Write `agent-workspace/research/phase-7-options-survey.md` (~150 LOC) with:
1. INV-10 reporter pattern verbatim from `tests/hooks/tool-call-first.spec.ts` (6.1.3 fix) — cite line numbers.
2. Decision options for #11 fix — confirm Option (i) is implementable; flag if any of the 3 spec files require non-trivial test rewrites.
3. dispatch.jsonl schema candidate (4-7 keys, sized for 1KB/dispatch worst case).
4. citation-linter `--rollup` CLI options (boolean flag vs path arg vs subcommand).
5. SC-39 (loop first upgrade) signal assessment: re-read 6.2.7 P1 "RULE-1 only fired" finding; estimate whether Phase 7 telemetry will accumulate enough to fire RULE-2/3/4.

**Part C — Gates**:
- `ls agent-workspace/research/phase-7-options-survey.md` exits 0
- `wc -l agent-workspace/research/phase-7-options-survey.md` ≥ 100
- grep -E "INV-10|dispatch.jsonl|--rollup|SC-39" agent-workspace/research/phase-7-options-survey.md → ≥ 4 hits
- **Mandate A (binding)**: section 1 must include the actual line numbers from `tests/hooks/tool-call-first.spec.ts` — research-scanner runs `grep -n "useFakeTimers\|advanceTimersByTime" tests/hooks/tool-call-first.spec.ts` LIVE before recording.

**Verify**: research note written; no decisions yet (those land in 7.0.2).

#### Task 7.0.2 — Write decisions 022/023/024/025

**Session type**: PLAN
**Model**: sonnet (decision-writer; mechanical doc generation per Decision-021 sonnet-downgrade pattern)
**Agent**: task-implementer (acting as decision-writer)
**Budget**: 60K
**Depends on**: 7.0.1
**Parallel with**: —

**Part A — Files created**:
- `agent-workspace/memory/decisions/022-phase-7-inv10-reporter-fix.md` (binding: Option (i) per phase-6-complete.md §F)
- `agent-workspace/memory/decisions/023-phase-7-dispatch-jsonl-schema.md` (binding schema for SC-33)
- `agent-workspace/memory/decisions/024-phase-7-citation-linter-rollup-cli.md` (binding CLI shape for SC-35)
- `agent-workspace/memory/decisions/025-phase-7-loop-first-upgrade-defer-or-execute.md` (binding go/no-go for SC-39 / 7.7)
- `agent-workspace/memory/decisions/README.md` index updated (022-025 added)

**Part B — Per-decision content (each ~30-50 LOC)**:
- 022: cite phase-6-complete.md §F Option (i); recommend vi.useFakeTimers + advanceTimersByTime; cite tool-call-first.spec.ts line numbers from 7.0.1 research note.
- 023: dispatch.jsonl schema = `{ts_dispatch_ms, ts_complete_ms, agent, task_id, parent_session, model?, budget_used?}` (4 mandatory + 3 optional); file path = `agent-workspace/memory/dispatch.jsonl`; append-only; one row per Agent dispatch.
- 024: CLI shape = `tsx scripts/utilities/citation-linter.ts --rollup <path> [--phase N]` (path arg, not boolean flag); failure mode = exit non-zero with row-by-row missing-component report.
- 025: defer-or-execute SC-39. Default to **DEFER** unless 7.0.1 research note documents Phase 6 telemetry has ≥2 RULES firing on real data. Document that DEFER means 7.7 produces a 2-page rationale document referencing 6.2.7 P1 instead of an actual loop run.

**Part C — Gates**:
- `ls agent-workspace/memory/decisions/02{2,3,4,5}-*.md` 4 lines (4 files exist)
- For each decision file: `awk '/^---$/{c++; if(c==2) exit} {print}' <file> | grep -cE "^id: 02[2-5]"` returns 1 (frontmatter has id field)
- `grep -c "022-\|023-\|024-\|025-" agent-workspace/memory/decisions/README.md` ≥ 4
- **Mandate B (binding)**: README.md is a tracked file; before commit-equivalent (git add), run `git show :agent-workspace/memory/decisions/README.md | wc -l` AND `wc -l agent-workspace/memory/decisions/README.md`; if working tree differs from staged, re-stage with `git add agent-workspace/memory/decisions/README.md`.

**Verify**: 4 decision files exist; README.md updated; no IMPL substage dispatches before 7.0.2 returns.

**Substage 7.0 budget**: ~120K. Risk: low.

---

### 7.1 — Carryforward #11a/#11b — INV-10 Reporter Migration

**Goal**: Hooks suite 104/104 deterministic on Windows Git Bash. Decision 022 binds Option (i). Single substage covers both 11a (mode-c-guard) and 11b (api-truncation + narration-grep) since the fix is identical.

#### Task 7.1.1 — Architect Phase 7.1 (per-task signatures)

**Session type**: PLAN
**Model**: sonnet
**Agent**: sandwich-architect
**Budget**: 30K
**Depends on**: 7.0.2
**Parallel with**: —

**Part A — Output**:
`agent-workspace/session-plans/pending/7.1-inv10-migration-architect.md` (~250 LOC) enumerating:
- Per-spec-file migration plan (3 spec files: mode-c-guard.spec.ts, api-truncation.spec.ts, narration-grep-refinement.spec.ts).
- Each migration: identify subprocess invocation site, factor behind clock injection seam, replace wallclock assertion with `vi.advanceTimersByTime()` + deterministic resolved value.
- 1 IMPL task signature (single task — all 3 spec files; estimated 80K).

**Part B — Mandates A/B/C/D self-applied**:
- A: every Part-C gate command run live against actual file before recording.
- B: spec files are tracked; architect runs `git show :tests/hooks/mode-c-guard.spec.ts | head -5` and matches working tree.
- C: no awk-range gates planned; N/A but explicitly noted.
- D: no Prisma touched; N/A.

**Part C — Gates**:
- `ls agent-workspace/session-plans/pending/7.1-inv10-migration-architect.md` exits 0
- `wc -l agent-workspace/session-plans/pending/7.1-inv10-migration-architect.md` ≥ 200
- grep -cE "vi\.useFakeTimers|advanceTimersByTime" agent-workspace/session-plans/pending/7.1-inv10-migration-architect.md ≥ 4 (each of 3 specs cited + 1 explanatory)
- grep -c "Mandate A\|Mandate B\|Mandate C\|Mandate D" agent-workspace/session-plans/pending/7.1-inv10-migration-architect.md ≥ 4

**Verify**: doc lists 1 IMPL task signature with full Part-A/B/C contracts.

#### Task 7.1.2 — IMPL: INV-10 reporter migration for the 3 spec files

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 100K
**Depends on**: 7.1.1
**Parallel with**: —

**Part A — Files modified**:
- `tests/hooks/mode-c-guard.spec.ts` (replace wallclock assertion at :152 with fake-timers reporter)
- `tests/hooks/api-truncation.spec.ts` (replace wallclock assertions at :118 + :153)
- `tests/hooks/narration-grep-refinement.spec.ts` (replace historical-mode-b-1 wallclock assertion)

**Part B — Contracts (binding)**:
- All 3 specs use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`.
- Each affected `it()` block calls `vi.advanceTimersByTime(N)` with deterministic N.
- Subprocess invocations remain real (not mocked) — only the timing assertions are made deterministic.
- Net LOC delta ≤ 80 across all 3 files (Karpathy P3 binding).

**Part C — Gates** (Mandate A applied — architect 7.1.1 must record the live numbers below):
- `pnpm test:hooks` ×5 consecutive on Windows Git Bash → 104/104 each run; no flake on the 3 target spec files.
- `pnpm tsc --noEmit` exits 0.
- `pnpm eslint tests/hooks/*.spec.ts` exits 0.
- Net LOC delta `git diff --stat tests/hooks/{mode-c-guard,api-truncation,narration-grep-refinement}.spec.ts` shows total +/- ≤ 80 net.

**Verify**: hooks suite 104/104 deterministic ×5; INV-10 reporter pattern present in all 3 files.

#### Task 7.1.3 — Spec-compliance reviewer for 7.1

**Session type**: VERIFY
**Model**: sonnet
**Agent**: spec-compliance-reviewer
**Budget**: 30K
**Depends on**: 7.1.2
**Parallel with**: —

Standard spec-compliance flow: read 7.1.1 architect Part B; run 7.1.2 Part C gates; verdict.

**Part C — Gates**: write `agent-workspace/memory/sessions/2026-04-XX-task-7.1.3-spec-compliance.md` (file-first persistence rule per Phase 5 retrospective §2.5 + symmetric extension to spec-compliance per carryforward #15 SATISFIED).

#### Task 7.1.4 — Sandwich-verifier for 7.1 (opus, fresh context)

**Session type**: VERIFY
**Model**: opus
**Agent**: sandwich-verifier
**Budget**: 60K
**Depends on**: 7.1.3
**Parallel with**: —

Probes:
- P0 pre-flight: `git log --oneline | wc -l` returns 0 (I-6 + Decision 020).
- P1 SC-31 closure: `pnpm test:hooks` ×5 on Windows; 104/104 each run.
- P2 SC-32 closure: same suite under artificial-load fixture; 104/104 each run.
- P3 invariant: grep daemon-dumb invariants clean.
- P4 net-LOC: ≤80 (Karpathy P3 binding).

**Verify**: APPROVED; SC-31 + SC-32 closed.

**Substage 7.1 budget**: ~220K.

---

### 7.2 — Carryforward #18 — Real Dispatch+Completion Timestamps

**Goal**: replace SC-27 mtime-proxy methodology with real subagent dispatch + completion millisecond timestamps captured to `agent-workspace/memory/dispatch.jsonl`. SC-27 PARTIAL → PASS once new methodology runs against Phase 6 telemetry.

#### Task 7.2.1 — Architect Phase 7.2

**Session type**: PLAN
**Model**: sonnet
**Agent**: sandwich-architect
**Budget**: 40K
**Depends on**: 7.1.4
**Parallel with**: —

**Part A — Output**: `agent-workspace/session-plans/pending/7.2-dispatch-jsonl-architect.md` enumerating 2 IMPL signatures:
- 7.2.2 — capture seam: extend Agent dispatch path to write dispatch.jsonl rows.
- 7.2.3 — replay benchmark extension: `scripts/benchmarks/sc18-realworld.ts --use-dispatch-jsonl` flag.

**Part B — Mandates A/B/C/D**:
- A: every gate command run live against actual files; numeric expectations embedded.
- B: dispatch.jsonl new file (untracked); budget-tracker.md tracked — verify staged version pre-edit.
- C: any awk-range gates in benchmark script must self-match-check (e.g., parsing JSONL by line ranges).
- D: N/A (no Prisma).

**Part C — Gates**: doc enumerates 2 IMPL signatures; full Part A/B/C per task; references Decision 023 schema verbatim.

#### Task 7.2.2 — IMPL: Dispatch capture seam

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 130K
**Depends on**: 7.2.1
**Parallel with**: 7.2.3 (different files: capture-seam vs benchmark-script)

**Part A — Files**:
- New: `scripts/utilities/dispatch-recorder.ts` (or extend existing `scripts/utilities/budget-tracker.ts` — architect 7.2.1 chooses) — append-only JSONL writer with file-lock.
- Modified: `packages/core/src/dispatcher/...` OR `scripts/hooks/...` — wherever Agent dispatch is observable; architect 7.2.1 specifies exact path.
- New tests: `tests/scripts/dispatch-recorder.spec.ts` ≥4 cases (capture, schema-conformance, replay, missing-file fallback).

**Part B — Contracts**:
- JSONL schema per Decision 023 (4 mandatory + 3 optional keys).
- File-lock (`flock` or equivalent) for concurrent dispatches (Phase 6 INV-S9 race-mitigation pattern).
- Net LOC ≤ 80 net production (excluding tests).

**Part C — Gates**:
- `pnpm test --filter scripts` PASS; new spec 4/4 PASS.
- `pnpm tsc --noEmit` exits 0.
- `cat agent-workspace/memory/dispatch.jsonl | head -1 | python -m json.tool` exits 0 (after a manual smoke dispatch).
- `git diff --stat` net production LOC ≤ 80.

#### Task 7.2.3 — IMPL: SC-27 benchmark replay extension

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 80K
**Depends on**: 7.2.1
**Parallel with**: 7.2.2 (different files)

**Part A — Files**:
- Modified: `scripts/benchmarks/sc18-realworld.ts` — add `--use-dispatch-jsonl` flag; when set, read dispatch.jsonl instead of session-log mtime.
- Modified: `tests/benchmarks/sc18-realworld.spec.ts` — add 1-2 test cases for new flag.

**Part B — Contracts**:
- Backward compatible: without flag, existing mtime-proxy behavior preserved.
- With flag: parses dispatch.jsonl, computes wallclock_actual / wallclock_serial / improvement.
- ≥35% on ≥2 of 3 substages (against Phase 6 OR Phase 7 own telemetry).
- Net LOC ≤ 60 net.

**Part C — Gates**:
- `pnpm test tests/benchmarks/sc18-realworld.spec.ts` PASS (existing 3 + 1-2 new).
- `pnpm tsx scripts/benchmarks/sc18-realworld.ts --use-dispatch-jsonl` exits 0 against Phase 6 dispatch.jsonl fixture (or skips with documented "no fixture available" if Phase 6 didn't capture; in that case, SC-33 PARTIAL until Phase 7 own data accumulates by 7.8).
- `git diff --stat scripts/benchmarks/sc18-realworld.ts` net ≤ 60.

#### Task 7.2.4 — Sandwich-verifier for 7.2

**Session type**: VERIFY
**Model**: opus
**Agent**: sandwich-verifier
**Budget**: 70K
**Depends on**: 7.2.2, 7.2.3
**Parallel with**: —

Probes:
- P0 I-6 clean.
- P1 SC-33 closure: dispatch.jsonl exists post-real-dispatch; benchmark replays and emits per-substage report.
- P2 daemon-dumb grep clean (recorder must NOT have LLM in it — pure code).
- P3 file-lock probe: 2 concurrent dispatch.jsonl writers produce valid JSON on every line.
- P4 schema conformance: JSON.parse every line of dispatch.jsonl exits 0.

**Verify**: APPROVED; SC-33 closed (or PARTIAL with documented Phase-6-fixture-absence rationale).

**Substage 7.2 budget**: ~280K.

---

### 7.3 — Carryforward #16 — Worktree-Isolation Integration Spec Promotion

**Goal**: Promote 6.3.8b verifier's runtime probe (real `git worktree add` + bidirectional sentinel-file check) to a permanent integration spec running in CI on every push.

#### Task 7.3.1 — Architect Phase 7.3

**Session type**: PLAN
**Model**: sonnet
**Agent**: sandwich-architect
**Budget**: 30K
**Depends on**: 7.2.4
**Parallel with**: —

**Part A — Output**: `agent-workspace/session-plans/pending/7.3-worktree-spec-architect.md` enumerating:
- Spec file path: `tests/integration/worktree-isolation.spec.ts` (NEW).
- 3-case structure: write-A-not-in-B / write-B-not-in-A / both-cleaned-on-prune.
- Platform-skip pattern: `it.skipIf(!hasGitOnPath())` for environments without git.
- Source: 6.3.8b verifier transcript at `agent-workspace/memory/sessions/2026-04-27-task-6.3.8b-substage-verify.md` lines containing the bidirectional probe.

**Part B — Mandates**:
- A: architect runs the 6.3.8b probe LIVE in its own tmpdir before recording — verifies behavior survives post-Phase-6.
- B: spec file is NEW (untracked) — N/A for staged-index check.
- C: no awk-range gates.
- D: no Prisma.

**Part C — Gates**: doc enumerates 1 IMPL signature with full contracts.

#### Task 7.3.2 — IMPL: worktree-isolation integration spec

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 70K
**Depends on**: 7.3.1
**Parallel with**: —

**Part A — Files**:
- New: `tests/integration/worktree-isolation.spec.ts` (~80 LOC).
- Modified (if needed): root `vitest.config.ts` or `package.json` to include `tests/integration/` in CI run.

**Part B — Contracts**:
- 3 cases per architect spec.
- Uses Node's `fs.mkdtempSync(os.tmpdir())` + `execa('git', ['worktree', 'add', ...])` (I-3 strict — no shell-string git).
- `afterEach` cleans tmpdir + prunes worktree (`execa('git', ['worktree', 'prune'])`).
- Platform-skip on missing git.
- Net LOC ≤ 80.

**Part C — Gates**:
- `pnpm test --filter integration` PASS; new spec 3/3 PASS on Windows Git Bash.
- `grep -c "execa\(.git." tests/integration/worktree-isolation.spec.ts` ≥ 3 (I-3 strict).
- `grep -c "child_process\.exec\\b" tests/integration/worktree-isolation.spec.ts` returns 0 (no shell-string git).
- `pnpm tsc --noEmit` exits 0.

#### Task 7.3.3 — Spec-compliance + verifier for 7.3 (folded pair)

**Session type**: VERIFY
**Model**: sonnet → opus
**Agent**: spec-compliance-reviewer + sandwich-verifier
**Budget**: 50K (30K + 20K)
**Depends on**: 7.3.2
**Parallel with**: —

Standard pair. Verifier runs the spec on a clean tmpdir to confirm isolation works post-promotion.

**Verify**: APPROVED; SC-34 closed.

**Substage 7.3 budget**: ~150K.

---

### 7.4 — Carryforward #9 — Citation Linter `--rollup <path>` Flag

**Goal**: extend existing citation linter so it verifies component-existence in self-evolution rollup outputs. Each `component_type::component_name` row in the rollup MUST resolve to an actual on-disk component file.

#### Task 7.4.1 — Architect Phase 7.4

**Session type**: PLAN
**Model**: sonnet
**Agent**: sandwich-architect
**Budget**: 30K
**Depends on**: 7.3.3
**Parallel with**: —

**Part A — Output**: `agent-workspace/session-plans/pending/7.4-citation-linter-rollup-architect.md` enumerating 1 IMPL signature with:
- CLI shape per Decision 024: `tsx scripts/utilities/citation-linter.ts --rollup <path> [--phase N]`.
- Component-resolution map: `skill::<name>` → `.claude/skills/<name>/SKILL.md`; `agent::<name>` → `.claude/agents/<name>.md`; `command::<name>` → `.claude/commands/<name>.md`; `hook::<name>` → `scripts/hooks/<name>.sh`.
- Failure mode: exit non-zero with row-by-row missing-component report.

**Part B — Mandates**:
- A: gate commands run live against actual rollup file (`agent-workspace/memory/component-rollup-phase-6.md` from Phase 6).
- B: citation-linter.ts is tracked — staged-index pre-verify.
- C: no awk-range.
- D: no Prisma.

**Part C — Gates**: doc enumerates IMPL signature; component-resolution map verbatim.

#### Task 7.4.2 — IMPL: citation linter --rollup flag

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 80K
**Depends on**: 7.4.1
**Parallel with**: —

**Part A — Files**:
- Modified: `scripts/utilities/citation-linter.ts` (~+50 LOC).
- New tests: `tests/scripts/citation-linter-rollup.spec.ts` ≥3 cases (all-resolvable, 1-missing, empty rollup).
- Modified: existing `tests/scripts/citation-linter.spec.ts` regression check (existing behavior preserved).

**Part B — Contracts**:
- New flag: `--rollup <path>` (path arg per Decision 024).
- Component-resolution map per architect 7.4.1.
- Exit non-zero on any missing-component; print row + expected-path.
- Backward compatible: without flag, existing linter behavior unchanged.
- Net LOC ≤ 60 net production.

**Part C — Gates**:
- `pnpm test --filter scripts` PASS; new spec 3/3 + existing regression 0 broken.
- `pnpm tsx scripts/utilities/citation-linter.ts --rollup agent-workspace/memory/component-rollup-phase-6.md` exits 0 (Phase 6 rollup is presumed clean — verify; if not, this becomes the linter's first real signal).
- `pnpm tsx scripts/utilities/citation-linter.ts --help` shows `--rollup` flag.
- `git diff --stat scripts/utilities/citation-linter.ts` net ≤ 60.

#### Task 7.4.3 — Spec-compliance + verifier for 7.4 (folded pair)

**Session type**: VERIFY
**Model**: sonnet → opus
**Agent**: spec-compliance-reviewer + sandwich-verifier
**Budget**: 30K + 20K = 50K
**Depends on**: 7.4.2
**Parallel with**: —

Probes:
- P0 I-6 clean.
- P1 SC-35 closure: linter exits 0 on Phase 6 rollup; new spec 3/3 PASS.
- P2 backward compat: existing citation-linter spec PASS unchanged.
- P3 daemon-dumb grep clean (linter is pure code, no LLM).

**Verify**: APPROVED; SC-35 closed.

**Substage 7.4 budget**: ~130K.

---

### 7.5 — Carryforward #19 — sc18-realworld.ts import.meta.url Hygiene

**Goal**: clean up CLI entry guard pattern in `scripts/benchmarks/sc18-realworld.ts`. Minor; no separate VERIFY (folded into 7.8).

#### Task 7.5.1 — IMPL (folded; no separate architect)

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 40K
**Depends on**: 7.4.3
**Parallel with**: 7.6.1 (different files: scripts/benchmarks/ vs .claude/agents/)

**Part A — Files**:
- Modified: `scripts/benchmarks/sc18-realworld.ts` (~+5-10 LOC).

**Part B — Contracts**:
- CLI entry guard pattern aligned with rest of `scripts/` family. Pattern (typical):
  ```ts
  if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    main().catch(...)
  }
  ```
- Net LOC ≤ 15 (pure hygiene; not a feature change).
- Existing tests/benchmarks/sc18-realworld.spec.ts continues 3/3 PASS unchanged.

**Part C — Gates** (Mandate A: architect-equivalent for this folded task — pre-verify the actual current pattern in the file before writing):
- `node --check scripts/benchmarks/sc18-realworld.ts` exits 0.
- `pnpm test tests/benchmarks/sc18-realworld.spec.ts` 3/3 PASS unchanged.
- `pnpm tsx scripts/benchmarks/sc18-realworld.ts --help` (or no-flag default) exits 0.
- `grep -c "import\.meta\.url" scripts/benchmarks/sc18-realworld.ts` returns 1.
- `git diff --stat scripts/benchmarks/sc18-realworld.ts` net ≤ 15.
- **Mandate B**: file is tracked; pre-verify staged matches working tree.

**Verify**: SC-36 closed (verified at 7.8 verifier sweep).

**Substage 7.5 budget**: ~40K.

---

### 7.6 — Carryforward #20 — Sandwich-Architect Mandate E (Incremental Write)

**Goal**: codify the 6.5.3 stall-recovery lesson. Architect writing >200 LOC of accumulated content MUST write incrementally (small `Edit` per section) rather than one giant `Write` at the end. Skill amendment + regression test.

#### Task 7.6.1 — IMPL: Mandate E + regression test

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: task-implementer
**Budget**: 60K
**Depends on**: 7.4.3 (after 7.4 close — uses architect skill)
**Parallel with**: 7.5.1 (different files)

**Part A — Files**:
- Modified: `.claude/agents/sandwich-architect.md` — add new section "Mandate E — Incremental write for large files (>200 LOC accumulated content)" (~25 LOC).
- New: `tests/skills/architect-mandates.spec.ts` — single regression test asserting all 5 Mandates A/B/C/D/E are grep-able in the skill file.

**Part B — Contracts (Mandate E text — binding)**:
- Trigger: any architect doc accumulating >200 LOC of in-memory content before persistence.
- Required pattern: write header + skeleton FIRST (single `Write`); then APPEND each section via separate `Edit` passes.
- Rationale: 6.5.3 architect stalled at ~647 in-memory lines BEFORE persisting Deliverables 2-4 (only Deliverable 1 landed). Incremental write means even on stall, downstream agents inherit a coherent partial doc.
- Cross-reference: phase-6-complete.md §H + checkpoints/latest.md "Session #36 — what closed" 6.5.3 row.
- Net LOC delta ≤ 30 across both files.

**Part C — Gates**:
- `grep -c "Mandate E" .claude/agents/sandwich-architect.md` returns ≥ 1.
- `grep -cE "Mandate [A-E]" .claude/agents/sandwich-architect.md` returns ≥ 5.
- `pnpm test tests/skills/architect-mandates.spec.ts` PASS (1/1 minimum; ≥3 cases ideal).
- `pnpm tsc --noEmit` exits 0.
- `git diff --stat` net ≤ 30 LOC.
- **Mandate B**: sandwich-architect.md is tracked — pre-verify staged.

**Verify**: SC-37 closed (verified at 7.8 verifier sweep).

#### Task 7.6.2 — Spec-compliance review for 7.6

**Session type**: VERIFY
**Model**: sonnet
**Agent**: spec-compliance-reviewer
**Budget**: 20K
**Depends on**: 7.6.1
**Parallel with**: —

Standard. Writes session note pre-return.

**Verify**: APPROVED; SC-37 closure paperwork ready for 7.8.

**Substage 7.6 budget**: ~80K.

---

### 7.7 — Self-Evolution Loop's First Real Upgrade (Signal-Permitting)

**Goal**: dogfood test — let the loop produce a real signal-driven upgrade proposal. **Conditional on Decision 025**: if telemetry signal is thin (per phase-6-complete.md §C.3 honest assessment + 7.0.1 research note), DEFER and write a 2-page rationale instead.

#### Task 7.7.1 — Conditional dispatch decision (orchestrator-side)

Per Decision 025 (written in 7.0.2): orchestrator reads decision file; if `verdict: defer`, dispatches 7.7.2-DEFER (single 30K task). If `verdict: execute`, dispatches 7.7.2 + 7.7.3 + 7.7.4.

#### Task 7.7.2-DEFER — Write deferral rationale (if Decision 025 = defer)

**Session type**: PLAN
**Model**: sonnet
**Agent**: task-implementer (acting as architect-as-retrospective per 6.5.3 pattern)
**Budget**: 30K
**Depends on**: 7.6.2
**Parallel with**: —

**Part A — Files**:
- New: `agent-workspace/memory/phase-7-loop-upgrade-deferral.md` (~80 LOC) — rationale citing phase-6-complete.md §C.3 RULE-1-only finding; estimates Phase 7 telemetry accumulation rate; recommends re-evaluation at v2.3 boundary.

**Part B — Contracts**:
- Cite 6.2.7 P1 verdict + phase-6-complete.md §C.3 §C.4.
- Cite Decision 025 verdict.
- Document specific signals that would trigger re-evaluation (e.g., RULE-2 fires, or RULE-3 cumulative count ≥10).

**Part C — Gates**:
- `ls agent-workspace/memory/phase-7-loop-upgrade-deferral.md` exits 0.
- `wc -l agent-workspace/memory/phase-7-loop-upgrade-deferral.md` ≥ 50.
- `grep -cE "RULE-[1-4]|6\.2\.7|§C\.[34]" agent-workspace/memory/phase-7-loop-upgrade-deferral.md` ≥ 4.

**Verify**: SC-39 marked DEFER with documented rationale.

#### Task 7.7.2-EXECUTE — Loop run + analyst proposal (if Decision 025 = execute)

**Session type**: MULTI_TASK_IMPL
**Model**: sonnet (telemetry-analyst tier per Decision 021)
**Agent**: telemetry-analyst (existing subagent from Phase 6.2)
**Budget**: 80K
**Depends on**: 7.6.2
**Parallel with**: —

**Part A — Files**:
- Run: `pnpm tsx scripts/utilities/rollup-telemetry.ts --phase 6` (or current accumulated phases) → emits `agent-workspace/memory/component-rollup-phase-7.md`.
- Spawn: telemetry-analyst against rollup → emits `agent-workspace/memory/phase-7-routing-recommendations.md` (3 H2 sections + ≥1 proposal each).

**Part B — Contracts**:
- Routing recommendations file has 3 H2 sections (model-bumps / agent-prunes / parallelization-gate-adjustments).
- Each proposal cites a rollup row.
- ≥1 proposal total across all sections (not necessarily all-fire).

**Part C — Gates**:
- `ls agent-workspace/memory/component-rollup-phase-7.md && ls agent-workspace/memory/phase-7-routing-recommendations.md` exits 0.
- `grep -cE "^## " agent-workspace/memory/phase-7-routing-recommendations.md` returns 3.
- `grep -cE "rollup row|component_type" agent-workspace/memory/phase-7-routing-recommendations.md` ≥ 1.

#### Task 7.7.3-EXECUTE — Apply OR document-and-defer the proposal (if execute)

**Session type**: PLAN
**Model**: sonnet
**Agent**: task-implementer (acting as architect-as-applier)
**Budget**: 50K
**Depends on**: 7.7.2-EXECUTE
**Parallel with**: —

For each proposal in 7.7.2-EXECUTE output:
- If proposal = trivial config edit (e.g., "downgrade agent X to sonnet"): apply via single `Edit` and write decision file `026-...md`.
- If proposal = architectural change (>20 LOC): document in `agent-workspace/memory/phase-7-loop-proposals-deferred.md` with specific defer rationale.

**Part C — Gates**:
- Either: 1 decision file 026-...md exists AND 1 frontmatter line edit applied.
- OR: phase-7-loop-proposals-deferred.md exists with rationale per proposal.

#### Task 7.7.4-EXECUTE — Sandwich-verifier for 7.7 (if execute)

**Session type**: VERIFY
**Model**: opus
**Agent**: sandwich-verifier
**Budget**: 60K
**Depends on**: 7.7.3-EXECUTE
**Parallel with**: —

Probes:
- P0 I-6 clean.
- P1 SC-39 closure: rollup + recommendations + applied/deferred state coherent.
- P2 daemon-dumb grep clean.
- P3 if config edit applied: regression test confirms no behavior change beyond what proposal targeted.

**Verify**: SC-39 PASS or DEFER (per 7.7.3 outcome).

**Substage 7.7 budget**: 0K (defer path) to 220K (execute path). Plan estimate uses execute path; actual likely defer per Decision 025 default.

---

### 7.8 — Verify + Stage v2.2

**Goal**: prove SC-31..SC-38 (+ SC-39 if executed), 3-run determinism gate, write phase-7-complete + retrospective, stage v2.2.0 artifacts. Mirrors 6.5.

#### Task 7.8.1 — Final root `pnpm test` ×3 deterministic

**Session type**: VERIFY
**Model**: sonnet
**Agent**: sandwich-dev
**Budget**: 50K
**Depends on**: 7.7.4-EXECUTE OR 7.7.2-DEFER
**Parallel with**: —

Run `pnpm test` (workspace recursive) 3× consecutive; assert byte-identical pass-counts each run; baseline ≥1470 (Phase 6 + net deltas from 7.x).

**Part C — Gates**: 3 runs all green; counts equal; budget-tracker entry; session note.

#### Task 7.8.2 — SC-31..SC-38 (+ SC-39) scorecard

**Session type**: VERIFY
**Model**: opus
**Agent**: sandwich-verifier
**Budget**: 90K
**Depends on**: 7.8.1
**Parallel with**: —

Write `agent-workspace/memory/phase-7-complete.md` with:
- Header + verdict.
- SC-31..SC-38 (+ SC-39) scorecard table (PASS/PARTIAL/DEFER + evidence path).
- Substage progress recap.
- Carryforwards (if any) consolidated into v2.3 backlog.
- Determinism evidence.
- I-6 evidence.
- Block-close audit.
- next_action for 7.8.3.

**File-first persistence rule** (Phase 5 retrospective §2.5 + Phase 6 §A.3): write file BEFORE returning terminal YAML. Auto-redispatch on missing file.

**Probes (P0-P10 per Phase 6 6.5.2 pattern)**:
- P0 I-6 clean.
- P1 SC-31 + SC-32 closure (hooks 104/104 ×5 deterministic).
- P2 SC-33 closure (dispatch.jsonl + benchmark replay).
- P3 SC-34 closure (worktree-isolation integration spec PASS).
- P4 SC-35 closure (citation linter --rollup PASS on Phase 6 rollup).
- P5 SC-36 closure (sc18-realworld.ts hygiene).
- P6 SC-37 closure (Mandate E grep + regression test PASS).
- P7 daemon-dumb grep clean across all 7.x deliverables.
- P8 net LOC audit: total Phase 7 net production change ≤ 280 LOC (hardening discipline).
- P9 determinism: 7.8.1 byte-identical confirmed.
- P10 (optional) SC-39 closure: rollup + recommendations + applied/deferred coherent.

#### Task 7.8.3 — Phase 7 retrospective

**Session type**: PLAN-LIKE
**Model**: opus
**Agent**: sandwich-architect (acting as retrospective writer)
**Budget**: 60K
**Depends on**: 7.8.2
**Parallel with**: —

Extends `phase-7-complete.md` with retrospective sections A-I (mirror Phase 6 §A-§I structure). **Mandate E binding (incremental write)** — write skeleton first, append each section via separate Edit pass (this is the dogfood test for Mandate E itself — irony).

#### Task 7.8.4 — Stage v2.2.0 artifacts (NO COMMIT)

**Session type**: FOCUSED_IMPL
**Model**: sonnet
**Agent**: sandwich-dev
**Budget**: 40K
**Depends on**: 7.8.3
**Parallel with**: —

**Part A — Files**:
- 6× `package.json` (root + 5 packages) version bump 2.1.0 → 2.2.0.
- `CHANGELOG.md` v2.2.0 entry prepended (Keep-a-Changelog format).
- `RELEASE_NOTES.md` v2.2.0 narrative added above v2.1.0.
- `agent-workspace/memory/current-execution.md` v2.2 user-action checklist appended (mirror v2.1.0 template at line 441 onward).

**Part B — Contracts**:
- All 6 package.json versions match exactly `2.2.0` (string).
- CHANGELOG entry cites SC-31..SC-38 (+ SC-39) at top level.
- RELEASE_NOTES narrative ≥ 30 LOC; cites carryforwards #9, #11, #16, #18, #19, #20.
- current-execution.md v2.2 checklist mirrors v2.1.0 template structure.

**Part C — Gates**:
- `git status --porcelain | grep package.json | wc -l` returns 6 (or AM markers for already-tracked files).
- `grep -c "\"version\": \"2.2.0\"" package.json packages/*/package.json` returns 6.
- `grep -c "## \[2.2.0\]" CHANGELOG.md` returns 1.
- `grep -c "v2.2.0" RELEASE_NOTES.md` ≥ 2.
- `git log --oneline | wc -l` returns 0 (I-6 binding).
- **Mandate B**: each modified tracked file pre-verified staged-vs-working before final `git add`.
- **Mandate D**: no Prisma touched (N/A but explicitly noted).

**Verify**: v2.2.0 staged; no commit.

**Substage 7.8 budget**: ~240K.

---

## 6. Parallel-vs-Serial Dispatch Graph

> Phase 7 is mostly serial because most substages are independent and short.
> Parallelism opportunity is highest within 7.2 (capture seam || benchmark
> extension) and across 7.5/7.6 (folded IMPL pair).

### Phase 7 DAG

```
7.0.1 (research)
   |
   v
7.0.2 (decisions 022-025)
   |
   v
7.1.1 (architect)
   |
   v
7.1.2 (IMPL)
   |
   v
7.1.3 (spec-compliance) -> 7.1.4 (verifier opus)
   |
   v
7.2.1 (architect)
   |
   v
7.2.2 (capture seam)  ─┐
7.2.3 (benchmark ext) ─┘  PARALLEL — disjoint files; PARALLELIZE gate PASSES
   |
   v (both done)
7.2.4 (verifier opus)
   |
   v
7.3.1 (architect)
   |
   v
7.3.2 (IMPL)
   |
   v
7.3.3 (spec-compliance + verifier folded pair)
   |
   v
7.4.1 (architect)
   |
   v
7.4.2 (IMPL)
   |
   v
7.4.3 (spec-compliance + verifier folded pair)
   |
   v
7.5.1 (sc18 hygiene IMPL)  ─┐
7.6.1 (Mandate E IMPL)      ─┤  PARALLEL — disjoint files; PARALLELIZE gate PASSES
                            ─┘
   |    7.6.2 (spec-compliance for 7.6) follows 7.6.1
   v
7.7.1 (orchestrator decision read — instant)
   |
   v
7.7.2-{DEFER|EXECUTE} (single task or 3-task chain)
   |
   v
7.8.1 -> 7.8.2 -> 7.8.3 -> 7.8.4
```

**Wallclock if maximally parallel**: ~22 main-session turns.
**Wallclock if forced-serial**: ~26 turns.
**Time saving**: ~15% wallclock improvement (lower than Phase 6's 31% because
Phase 7 is mostly small serial substages with limited cross-substage parallelism).

---

## 7. Per-Substage VERIFY Pair Specifications

Inherits Phase 6 §5 baseline probes (P0 I-6, P1 SC closure, P2 invariant grep,
P3 determinism). Substage-specific probes detailed inline above. **All
verifiers MUST write substage-verify file BEFORE returning terminal YAML
(Phase 5 retrospective §2.5 + Phase 6 §A.3 + spec-compliance symmetric
extension per carryforward #15 SATISFIED)**.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **INV-10 reporter migration breaks subprocess invocations** (factoring behind clock injection seam touches real code paths) | MEDIUM | MEDIUM | 7.1.1 architect produces a per-spec migration plan; 7.1.2 enforces existing subprocess invocations remain real (only timing assertions change). 7.1.4 verifier P3 file-lock probe + smoke run. |
| **Stall recovery (carryforward #20)** during 7.8.2 scorecard write OR 7.8.3 retrospective | MEDIUM | MEDIUM | Mandate E (7.6.1) binding by the time 7.8.2 dispatches — verifier must write incrementally. Skeleton-first pattern reduces in-memory accumulation. Worst-case: orchestrator dispatches task-implementer repair (Phase 6.5.3 pattern). |
| **Windows-only timing dependence in 7.1** (the fix targets Windows; Linux/macOS pass already) | HIGH | LOW | Migration is platform-agnostic (vi.useFakeTimers eliminates wallclock). Linux/macOS PASS preserved. |
| **Telemetry signal-thinness limits 7.7 integration test** | HIGH | LOW (already anticipated) | Decision 025 default = DEFER. 7.7.2-DEFER produces 80-LOC rationale doc; SC-39 marked DEFER (not FAIL); no Phase 7 close blocker. |
| **dispatch.jsonl file-lock contention on Windows** (concurrent writes) | LOW | MEDIUM | Use `proper-lockfile` or `flock`-equivalent; 7.2.4 verifier P3 explicitly probes this. |
| **Phase 7 budget overruns 1.46M** | LOW | LOW | 22-turn projection conservative; Phase 6 forecasted 1.7M, actual ~1.6M. If overrun, fold 7.5+7.6 into 7.8 (saves ~30K). |
| **Net LOC creep beyond 280** (hardening discipline) | LOW | MEDIUM | Per-task 80-LOC cap binding (Karpathy P3); 7.8.2 P8 audits total. Architect-time supplementary decision required for any task exceeding 80. |
| **I-6 binding accidentally violated** | LOW | HIGH | Decision 020 explicit; verifier P0 every substage; pre-commit hook in `.husky/`. |
| **Self-track inflation > 1.35× misleads main session into premature wind-down** | LOW | MEDIUM | Phase 5 retrospective §7.3 codified; Mode-C lint hard-guards. Real-transcript `.transcript-tokens` is source of truth. |
| **Verifier persistence rule retrospective §2.5 ignored again** | LOW | LOW | Symmetric extension already SATISFIED at 6.4.3a; Phase 6 forced compliance via auto-redispatch; pattern carries forward. |
| **Citation linter --rollup flag uncovers real component-mismatch in Phase 6 rollup** | MEDIUM | LOW (positive signal) | If linter exits non-zero on Phase 6 rollup, the mismatch IS the linter's first real signal. Document in 7.4.2 session note + add as v2.3 carryforward (fix the rollup). |

---

## 9. Phase 7 Stop Conditions

### DONE

Phase 7 is DONE when **all 8 mandatory success criteria** (SC-31..SC-38) are
PASS or PARTIAL with documented rationale, plus SC-39 PASS or DEFER. Triggers:

- 7.8.2 verifier writes phase-7-complete.md scorecard with all rows status-set.
- 7.8.3 retrospective complete.
- 7.8.4 staged (NOT committed; user authorizes per I-6 + Decision 020).

### ESCALATE (write `agent-workspace/memory/escalation.md`)

Phase 7 escalates and stops if **any** of:

1. **STOP-1** — Deterministic gate fails 3× in a row on the same task.
2. **STOP-2** — Irrecoverable environment error (SQLite lock, ccs auth fail, git unavailable for worktree integration spec).
3. **STOP-3** — Charter ambiguity: a Phase 7 task would directly contradict charter principles AND I-6 binding (any `git log --oneline | wc -l > 0` mid-phase).
4. **STOP-4** — Phase 7 budget exceeds **1.8M tokens** (24% over headline) AND no further parallelization available.
5. **STOP-5** — Mandate A/B/C/D regression: any architect doc in 7.x violates Mandates → fix architect skill FIRST.
6. **STOP-6** — Net LOC for any single task exceeds 80 without supplementary decision file (Karpathy P3 binding).
7. **STOP-7** (NEW for Phase 7) — INV-10 reporter migration breaks an existing PASS spec → revert and re-architect.

In every case: write `agent-workspace/memory/escalation.md` with trigger,
evidence paths, last-attempted-fix, specific question for user.

---

## 10. Open Questions Resolved (autonomous mode)

Per autonomous-protocol § decision rules + ORCH_SPAWNED, the master-planner
resolves all ambiguity via charter + decision log. No questions delegated to
substage architects. Resolutions land in 7.0.2 as decisions 022-025:

1. **Q1** — INV-10 reporter approach for #11a/#11b? **Decision 022**: vi.useFakeTimers + advanceTimersByTime per phase-6-complete.md §F Option (i).
2. **Q2** — dispatch.jsonl schema? **Decision 023**: 4 mandatory + 3 optional keys; append-only; file-lock.
3. **Q3** — citation-linter --rollup CLI shape? **Decision 024**: `--rollup <path>` arg flag (not boolean).
4. **Q4** — SC-39 (loop first upgrade) defer-or-execute? **Decision 025**: default DEFER unless 7.0.1 research shows ≥2 RULES firing.
5. **Q5** — Phase 7 commit policy? Resolved in Decision 020 (zero commits; binds Phase 5/6/7).
6. **Q6** — v2.2 backlog scope cap? Resolved in this master plan §3 (7 mandatory items + 1 optional; 6 deferred to v2.3).
7. **Q7** — Net LOC discipline? Resolved in this master plan §1 hardening discipline (≤80 net LOC per task).

---

## Appendix A — Subagent Dispatch Hygiene (Phase 7 binding rules)

Inherits Phase 6 Appendix A verbatim with addition:

10. **Mandate E (NEW Phase 7)** — Architect doc writes accumulating >200 LOC of in-memory content MUST use incremental Edit pattern (skeleton first, append per-section). Codified at 7.6.1.

---

## Appendix B — File Path Conventions for Phase 7

- New plans: `agent-workspace/session-plans/pending/7.<N>-<slug>-architect.md`
- Per-task session logs: `agent-workspace/memory/sessions/<YYYY-MM-DD>-task-7.<N>.<M>.md`
- Decisions: `agent-workspace/memory/decisions/<NNN>-<slug>.md` (continue from 021; next = 022)
- New scripts: `scripts/{hooks,utilities,benchmarks}/<name>.{sh,ts,ps1}`
- New core code: `packages/core/src/<module>/<name>.{service,schema,spec}.ts`
- Telemetry rollups: `agent-workspace/memory/component-rollup-phase-<N>.md`
- Routing recommendations: `agent-workspace/memory/phase-<N>-routing-recommendations.md`
- Dispatch capture: `agent-workspace/memory/dispatch.jsonl` (NEW Phase 7)
- Phase exit doc: `agent-workspace/memory/phase-7-complete.md`
- v2.2 release notes: `RELEASE_NOTES.md` (extend existing v2.0.0/v2.1.0)

---

## Appendix C — Phase 7 Done-Definition Snapshot

Phase 7 is DONE when this 10-item snapshot is true:

1. SC-31..SC-38 all PASS or PARTIAL-with-doc; SC-39 PASS or DEFER.
2. `pnpm test` (root) green 3× consecutive at 7.8.1.
3. `pnpm test:hooks` 104/104 ×5 deterministic on Windows (SC-31 + SC-32).
4. `agent-workspace/memory/dispatch.jsonl` exists; benchmark replay PASS (SC-33).
5. `tests/integration/worktree-isolation.spec.ts` 3/3 PASS (SC-34).
6. `tsx scripts/utilities/citation-linter.ts --rollup ...` exits 0 on Phase 6 rollup (SC-35).
7. `node --check scripts/benchmarks/sc18-realworld.ts` exits 0 (SC-36).
8. `grep "Mandate E" .claude/agents/sandwich-architect.md` returns ≥1 + regression test PASS (SC-37).
9. `git log --oneline | wc -l` returns 0 (I-6 + Decision 020).
10. v2.2.0 release artifacts STAGED at 7.8.4 (SC-38).

---

## Appendix D — Cross-Reference Index

| Phase 6 reference | Phase 7 deliverable closing it |
|---|---|
| Phase 6 carryforward #9 (citation linter --rollup) | SC-35 / 7.4 |
| Phase 6 carryforward #11a (mode-c-guard) | SC-31 / 7.1 |
| Phase 6 carryforward #11b (api-truncation + narration-grep) | SC-32 / 7.1 |
| Phase 6 carryforward #16 (worktree-isolation integration spec) | SC-34 / 7.3 |
| Phase 6 carryforward #18 (real dispatch+completion timestamps) | SC-33 / 7.2 |
| Phase 6 carryforward #19 (sc18-realworld import.meta.url hygiene) | SC-36 / 7.5 |
| Phase 6 carryforward #20 (sandwich-architect Mandate E) | SC-37 / 7.6 |
| Phase 6 §H candidate #6 (loop first upgrade) | SC-39 (optional) / 7.7 |
| Phase 6 retrospective §C.3 (loop signal-thin) | Decision 025 (defer-default) |
| Decision 020 (I-6 binding) | Verifier P0 every substage |
| Decision 021 (telemetry-analyst sonnet) | Pattern reused for 7.0.2 + 7.7.2-EXECUTE |
| Mandates A/B/C/D (binding) | Self-applied to all 7.x architects |

---

**End of Phase 7 master plan.** Substage architects: read this file +
phase-6-complete.md retrospective + Decisions 022-025 (after 7.0.2);
then produce your substage's per-task signatures in the matching
`7.<N>-<slug>-architect.md`. Implementers: do not start without a substage
architect doc. Orchestrator: dispatch 7.0.1 research-scanner (sonnet, 60K,
bg) as Phase 7 first action.
