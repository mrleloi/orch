# Current Execution State

> Routing source of truth. Read at the start of every session.
> Updated at the end of every session.

---

## Autonomous Mode

**autonomous_mode**: true — user directive 2026-04-27 (session #39 entry): "no need to ask my opinion further, automatically complete according to your reasonable proposal, only stop work after all project work is complete"; supersedes earlier 08:05Z directive
**last_updated**: 2026-04-27 session #41 entry (post `/clear` reboot; 8.3.1 + 8.6.2 re-dispatched bg in parallel; 578-byte 8.3.1 stub deleted)
**updated_by**: opus 4.7 main session #41 (autonomous resume from checkpoint `latest.md`; tool-call-first dispatch per autonomous-protocol §TOOL-CALL-FIRST)
**active_phase**: **Phase 8 / v2.3 Strategic Pivot** — substages 8.1 (8.1.3 bg) + 8.3 (8.3.1 re-dispatch bg) + 8.6 (8.6.2 re-dispatch bg) IN FLIGHT
**routing**: read `agent-workspace/memory/checkpoints/latest.md` first; then `agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md` (master plan); then `agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md` (redirect authority); then `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (canonical 8-dimension brief).
**superseded_artifact**: `agent-workspace/session-plans/pending/phase-8-v2.3-carryforward-burndown.SUPERSEDED.md` (retained as audit-trail; CF-21..CF-26+G.7+G.8 fold into 8.4 of new plan per §5).
**in_flight_subagents** (4 in flight; ≤4 concurrency cap; at-limit):
- 8.1.4b code-quality-reviewer (bg `ae1edfaf39cd216a2` session #41, sonnet, /effort medium, ~60-80K) — code-quality + invariant review of 8.1.3
- 8.5.1 sandwich-architect (bg `a237c95cb055f8ac5` session #41, opus, /effort max, ~150-220K) — self-application-bootstrap.md
- 8.7.2 task-implementer (bg session #41, sonnet, /effort medium, ~120-160K) — packages/core/src/config/layered-resolver.ts + spec (≥8 unit tests)
- 8.7.4 task-implementer (bg session #41, sonnet, /effort low, ~80-100K) — LICENSE + CONTRIBUTING.md + COC + SECURITY.md + .github/ISSUE_TEMPLATE/* + PR template + OSS_READINESS.md (9 files)

**Substage 8.7 progress**: 8.7.1 ✅ DONE (config-layering.md 601 LOC + ontology/domain-workflow.md 439 LOC; LICENSE=MIT; 9 architectural decisions). 8.7.2 + 8.7.4 in flight; 8.7.3 + 8.7.5 + 8.7.6 pending.

**Substage 8.3 CLOSED ✅ (session #41 verdict path)**:
- 8.3.1 research-scanner DONE — 17.7KB evidence table (80 rows, 8 findings preview)
- 8.3.2 master-planner DONE — 27.4KB charter-drift audit; 7 findings (5 medium / 2 low / 0 high / 0 critical); verdict PASS_WITH_CAVEAT; 4 routes to 8.4
- 8.3.3 spec-compliance-reviewer ✅ PASS — all 7 findings have charter+phase citations; 3/3 stress-test walk-throughs PASS; routing capacity OK; substage closure attested 2026-04-27.
- Carryforward (advisory): F-2 + F-3 Craft Philosophy cites optionally sharpened by 8.4.1 architect (non-blocking).

**Recently CLOSED in session #41**:
- 8.1.4a spec-compliance-reviewer ✅ DONE — verdict PASS_WITH_CONCERNS; 0 critical / 2 major / 3 minor; 4 carryforwards CF-1..CF-4; advance to 8.1.4b authorized.

**Substage 8.6 CLOSED ✅ (session #41 verdict path)**:
- 8.6.1 master-planner DONE (387 LOC tenancy-model.md, 25 Decision 029 citations)
- 8.6.2 task-implementer DONE → 8.6.3 spec-compliance FAIL_REQUIRES_REWORK → 8.6.2-rework DONE (3 fixes) → 8.6.3b PASS — substage closure ATTESTED 2026-04-27. 3 minor findings (MIN-1 rootDir JSDoc + MIN-2 check-isolation.mjs comment + MIN-3 canAccess DEFAULT_USER bypass observability) carryforward to 8.7+ as deferred items.
- Final state: 1114/1114 tests; demo.sh 4 assertions PASS; typecheck 0; I-6 0 commits.

**Recently CLOSED (session #41)**:
- 8.6.2 task-implementer ✅ DONE 2026-04-27T~21:00Z — 480 LOC production + 8 deliverables + +17 tests + typecheck 0 + demo.sh exit 0 + backwards-compat PASS + 0 commits. Awaiting 8.6.3 review.
- 8.1.3 task-implementer ✅ DONE_WITH_CONCERNS 2026-04-27 — 102 ERROR → 0; 84 WARN → 13 (3 documented exception classes EX-1/EX-2/EX-3); 59 files modified; default lint exit 0; strict mode exit 1; 58/58 linter spec pass; 0 commits. Awaiting 8.1.4a spec-compliance.
- 8.3.1 research-scanner ✅ DONE 2026-04-27 — `agent-workspace/memory/audits/phase-0-7-evidence-table.md` (17.7KB, 80 rows, 8 findings preview, all phases covered, no UNCLEAR rows). Feeds 8.3.2.

**Recently CLOSED**:
- 8.0 substage CLOSED ✅ (4 decisions 028-031 ratified; 6/7 architect Qs answered; Q5 deferred to 8.1.1)
- 8.1.1 sandwich-architect ✅ DONE (521 LOC config-style-guide.md, 15 ERROR + 14 WARN rules, Q5 Option (b))
- 8.1.2 task-implementer ✅ DONE (1252 LOC config-style-lint.ts + 739 LOC spec, 58/58 tests; detected 102 ERROR + 84 WARN in `.claude/*`)
- 8.6.1 master-planner ✅ DONE (387 LOC tenancy-model.md, 25 Decision 029 citations)

**Re-dispatched in session #41 (after session #40 API connectivity failures)**:
- 8.3.1: deleted 578-byte stub; re-dispatched with tightened brief (250-450 LOC target, ≥80 evidence rows in 0..7 × P1..P10 grid, success-criteria spot-check, findings preview)
- 8.6.2: empty `packages/core/src/tenancy/` dir left intact (agent will populate); re-dispatched with backwards-compat default-user fallback emphasized + opt-in migration script + ≥8 unit test minimum + .gitignore update

**Substage 8.0 CLOSED** ✅
- 8.0.1 ✅ DONE (350 LOC drift inventory; 38 files scanned; 12 deviation patterns; 7 architect Q1-Q7)
- 8.0.2 ✅ DONE (228 LOC OSS patterns; 7 sources; 5 borrow / 3 reject; MIT recommended)
- 8.0.3 ✅ DONE (4 decisions 028/029/030/031 ratified; decisions/README.md updated; 6/7 architect Qs addressed; Q5 deferred to 8.1.1)

**Substage 8.1 progress**:
- 8.1.1 🟡 IN FLIGHT (config-style-guide architect)
- 8.1.2 PENDING (linter implementation; awaits 8.1.1)
- 8.1.3 PENDING (24-file remediation; awaits 8.1.2 — split potential at 8.1.3a/b per 8.0.3 concern)
- 8.1.4 PENDING (review pair)

**Substage 8.3 progress**:
- 8.3.1 🟡 IN FLIGHT (charter evidence table)
- 8.3.2 PENDING (master-planner audit synthesis; awaits 8.3.1)
- 8.3.3 PENDING (citation review; awaits 8.3.2)

**Substage 8.6 progress**:
- 8.6.1 ✅ DONE (387 LOC; 4 demo scenarios; backwards-compat permanent + opt-in migration script designed; 6 daemon-level fallback thresholds)
- 8.6.2 🟡 IN FLIGHT (task-implementer; scope-resolver.ts + 8 unit tests + demo.sh + v2.3-tenancy-rehome.sh + NestJS wiring)
- 8.6.3 PENDING (charter-coherence review; awaits 8.6.2)

## Phase 7 Final State (2026-04-27)

| Substage | Status | Verdict |
|----------|--------|---------|
| 7.0 Research + decisions 022-025 | CLOSED | DONE |
| 7.1 INV-10 reporter migration | CLOSED | APPROVED |
| 7.2 dispatch.jsonl real timestamps | CLOSED | APPROVED_AFTER_FIX |
| 7.3 worktree-isolation integration | CLOSED | APPROVED |
| 7.4 citation-linter --rollup | CLOSED | APPROVED_WITH_CONCERNS |
| 7.5 sc18 main-guard hygiene | CLOSED | DONE (folded) |
| 7.6 Mandate E + regression test | CLOSED | PASS_WITH_CONCERNS |
| 7.7 SC-39 DEFER rationale | CLOSED | DONE |
| 7.8 Verify + stage v2.2 | CLOSED | APPROVED_WITH_CONCERNS |

**Phase 7 verdict**: APPROVED_WITH_CONCERNS. v2.2.0 staged. 6 carryforwards CF-21..CF-26 + 2 retrospective items (G.7/G.8) deferred to Phase 8 / v2.3. SC-39 DEFERRED per decisions/025.

## Phase 8 Entry State (2026-04-27 — REDIRECTED at session #39)

**STATUS**: old carryforward-burndown plan SUPERSEDED per Decision 027. New master plan in flight.

- Old master plan: `agent-workspace/session-plans/pending/phase-8-v2.3-carryforward-burndown.SUPERSEDED.md` (renamed; retained as audit-trail)
- New master plan: `agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md` (PENDING — master-planner /effort max in flight at session #39 entry)
- User brief canonical: `tasks/feat_04_continue_before_phase_8/user_prompt.txt`
- Redirect authority: `agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md`

**8 strategic dimensions in user brief** (master-planner must address all):
1. Agent config / settings drift audit (rules, format, structure clarity)
2. Verify-after-phase + verify-after-N-sessions automation
3. Project-vs-charter drift safety analysis (planning, ideas, implementation alignment)
4. Hook / deterministic-script comprehensiveness (LLM-task vs deterministic-task partition)
5. Self-application — orch supports its own development; baseline from Phase 8.x onward
6. Multi-user / multi-project sharing (personal + colleague-shared simultaneously)
7. Community open-source readiness — config layering (system/user/project), telemetry sync, domain-workflow positioning
8. /effort low/high/max routing first-class (orthogonal to opus/sonnet model tier)

**Carryforwards from Phase 7** (CF-21..CF-26 + G.7+G.8 + SC-39 conditional retry) MUST fold into new plan as one substage. They do not vanish.

**I-6 ABSOLUTE preserved**. Decision 020 binding. Phase 8 ships ZERO `git commit`. v2.0.0 + v2.1.0 + v2.2.0 staged baseline persists; v2.3.0 stages at Phase 8 close, no commit.

---

## Phase 5 Archive — Self-Evolution / v2.0 (CLOSED 2026-04-27)

### Phase 5 Final State (2026-04-27T~19:30Z) — ARCHIVED

| Substage | Status | Verdict |
|----------|--------|---------|
| 5.0 Research | DONE | 4 bg agents |
| 5.1 Loop-Resilience | DONE | 8 tasks; SC-1/2/3 closed |
| 5.2 Skill Self-Evolution | CLOSED | 5.2.10 PASS_WITH_CONCERNS; SC-4/5/6 closed |
| 5.3 Parallelization | CLOSED | 5.3.12 APPROVED; SC-7..SC-13+SC-18 closed; 75% wallclock improvement |
| 5.4 v1.0.1 Backlog Absorption | CLOSED | 5.4.8b APPROVED; SC-14 closed (1 PARTIAL = N6 user-action TODO) |
| 5.5 Verification & Release | CLOSED | 5.5.1 PASS, 5.5.2 APPROVED (17 PASS / 1 PARTIAL / 0 FAIL), 5.5.3 retro DONE, 5.5.4 v2.0.0 staged |

**Phase 5 verdict**: APPROVED. v2.0.0 staged. (Subsequent: Phase 6 v2.1.0 staged → Phase 7 v2.2.0 staged. All three on the same uncommitted-baseline branch.)

**Test counts**: monorepo 1452/1452 (8 independent identical runs across 5.3.12, 5.4.8b, 5.5.1).
**I-6 evidence**: `git log --oneline` → "fatal: your current branch 'main' does not have any commits yet". Zero commits across entire Phase 5 (and project lifetime in this branch).

---

## Phase 5 — Self-Evolution / v2.0 (ACTIVE — Research & Audit substage)

**Phase**: 5 — Self-Evolution / v2.0
**Status**: kickoff (Research & Audit substage running 4 parallel bg agents)
**Source authorization**: tasks/feat_03_continue_after_phase4/user_prompt.txt (user explicitly authorized continued autonomous mode)

**Phase 5 charter (extracted from user prompt)**:
1. **Meta-retrospective on phases 0-4**: trace human-intervention root causes; identify tracking gaps; convert lessons into self-upgrade actions (not human notifications).
2. **Self-evolving skill/command/workflow system**: every component (skills, commands, agents, workflows) must be testable with metrics, goals, objectives — fed into a self-loop-upgrade mechanism. Use the tracking system as the LLM's long-term advantage.
3. **Parallelization as first-class capability**: model the master-agent / sub-agent graph as a job queue. Decide which jobs run sequentially, in parallel, retried. Decompose horizontally / vertically. Self-plan, self-execute, self-measure improvement on (quality × time × budget).
4. **External resource ingestion**: study claudekit-skills, claudekit docs, claude-code-learn — borrow patterns; re-evaluate Orch architecture and adjust plan if needed.
5. **Resume autonomous execution** after re-planning, completing residual Phase 4 work AND new v2.0 phases.

**Phase 5 substages (master-planner output 2026-04-27 — see `session-plans/pending/phase-5-self-evolution.md`)**:

| # | Substage | Tasks | Budget | Status |
|---|---|---|---|---|
| 5.0 | Research & Self-Audit | 4 bg | 65K actual | DONE |
| 5.1 | Loop-Resilience Hardening (Mode A/B/C lints) | 8 | ~440K | architect dispatched 2026-04-27 |
| 5.2 | Skill Self-Evolution Framework | 10 | ~830K | **CLOSED** — 5.2.10 PASS_WITH_CONCERNS (0 must-fix, 1 important non-blocking + 4 minor); SC-4/SC-5/SC-6 closed |
| 5.3 | Parallelization Framework (v2.0 spine) | 12 | ~1,420K | **CLOSED** 2026-04-27T~17:00Z — 5.3.11 PASS_WITH_CONCERNS (0 FAIL/0 fix), 5.3.12 APPROVED (P1/P2/P5/P6/P7/P8 PASS, P3+P4 CONCERN non-blocking), determinism gate 1451/1451 ×2 identical, SC-7..SC-13+SC-18 all CLOSED; 2 carryforwards to 5.4 (mailbox count-idempotency doc, hook-deny architecture note) |
| 5.4 | v1.0.1 Backlog Absorption | 8 | ~470K | **CLOSED** 2026-04-27T~18:30Z — 5.4.8a PASS_WITH_CONCERNS (1 APPROVED_AFTER_FIX = architect-doc spec contradiction, NOT implementation defect), 5.4.8b APPROVED (P0-P6 all PASS), determinism gate 1452/1452 ×3 identical runs. Net +1 test (5.4.9 mailbox case 9). All 8 IMPL deliverables shipped. |
| 5.5 | Verification & Release | 4 | ~250K | **ACTIVE** — 5.5.1 (final root pnpm test ×3 deterministic) dispatched 2026-04-27T~18:30Z |
| **Total** | **42 tasks · 28 sessions · 4 calendar days** | | **~4.4M** | |

**SC count**: 18 (SC-1 .. SC-18). SC-18 is the explicit time-axis benchmark: parallel-vs-serial wallclock improvement ≥ 20% on synthetic fixture.

**Current task**: Substage 5.4 Turn 1 — **5.4.1 sandwich-architect dispatched** (sonnet, 30K, bg). Output: `agent-workspace/session-plans/pending/5.4-backlog-architect.md` enumerating 6 IMPL tasks (5.4.2–5.4.7) with file paths, success criteria, and deliverables. After 5.4.1 returns → Turn 2 fully-parallel batch (6 IMPL bg) per master plan §4 (highest parallelism ratio of any substage). Then 5.4.8 VERIFY pair.

**Substage 5.3 CLOSED 2026-04-27T~17:00Z (session #33)**:
- 5.3.11 spec-compliance reviewer (sonnet bg `a5b44c2f45d9e7128`, ~88K used): all 9 IMPL PASS, 0 FAIL, 0 APPROVED_AFTER_FIX. SC-7..SC-13+SC-18 closure cross-checked. Output: `budget-tracker.md` lines 238-286 + `sessions/2026-04-27-task-5.3.11-spec-compliance-review.md`.
- 5.3.12 sandwich-verifier (opus bg `a1d229cbf715ad3b2`, ~121K used): APPROVED. P0 pre-flight clean (no authoring conflict). P1 (8 SCs)/P2 (8-concurrent contention via ad-hoc probe)/P5 (env matrix 12 coverage points)/P6 (resume vs spawn argv)/P7 (cap N=2 max-active≤2)/P8 (daemon-dumb 0 hits) ALL PASS. P3 (mailbox count-idempotency) CONCERN — implementation state-idempotent but not count-idempotent; architect §9.3.D did not require count-idempotency; non-blocking. P4 (writeStdin suppression on hook deny) CONCERN — daemon log-only by design (CLI permission model is upstream gate); non-blocking. Determinism gate: monorepo 1451/1451 ×2 identical pass-counts. test:hooks 84/86 (2 pre-existing Phase 5.1 carryforward flakes). Verifier persistence note: declined to write file citing system-reminder; orchestrator wrote `sessions/2026-04-27-task-5.3.12-substage-verify.md` from task-notification message.

**Carryforwards to 5.4** (verifier recommendations 1+2):
1. Mailbox markRead count-idempotency: add `read: false` filter to `mailbox.repository.ts:151` OR document state-idempotent semantics in service docstring (pick one).
2. Document daemon log-only choice on hook deny in `architecture.md §Layer 3` or `hooks.service.ts` header.

**Turn 3 (3-parallel batch) ALL CLOSED 2026-04-27T~15:30Z**:
- **5.3.3 queue-claim service** DONE_WITH_CONCERNS — caught real architect-spec bug (SQLite `CURRENT_TIMESTAMP` lexical mismatch with Prisma ISO-8601 → silent dead branch in on-claim sweep); fixed via parameterized JS Date. Also worked around stale Prisma client cache. Both findings logged to `agent-notes.md`. 6 vitest, contention deterministic ×5.
- **5.3.4 worker mailbox** DONE — 8 vitest, prisma migrate clean, `mailbox.service.ts` + `mailbox.repository.ts` + `MailboxMessage` interface. Used beforeEach/afterEach pattern (matches `queue.service.spec.ts` working pattern; avoids Jest PrismaClient proxy init issue).
- **5.3.5 hook decision-field parsing** DONE — 13 vitest (9 §6.4 + 4 schema units), full suite 1041 passing, all gates green. Decision: added `ToolDenied` to domain/state-machine.ts as transient (no state change) for DomainEvent exhaustiveness.

**Aggregate Turn 3 result**: core 1014→1041 (+27, exactly matches +6+8+13). Monorepo baseline preserved. INV-S grep clean across all three modules. I-6 satisfied (no commits).

**5.3.2 CLOSED earlier**: all gates green; brief vs reality grep discrepancy noted for 5.3.11 reviewer.

**5.3.1 architect CLOSED 2026-04-27T~14:48Z** (DONE_WITH_CONCERNS): produced `agent-workspace/session-plans/pending/5.3-parallel-architect.md` (1,273L, ~40% over 600-900 target — architect prioritized completeness of 12-task Part A/B/C/D contracts + verbatim arch.md text for §7 cost model; flagged self-concern for 5.3.12 verifier). 7 open questions (Q1-Q7) all resolved in §2. 8-turn dispatch DAG: PLAN(1) → 5.3.2 BLOCKING(1) → 5.3.3||5.3.4||5.3.5(1) → 5.3.6(1) → 5.3.7||5.3.8||5.3.9(1) → 5.3.10(1) → 5.3.11(1) → 5.3.12(1).

**5 decision files written 2026-04-27T~14:50Z** (prereq for 5.3.2 dispatch per architect §11):
- `decisions/012-5.3-module-paths.md` — paths use `packages/core/src/modules/{queue,sessions,hooks}/`
- `decisions/013-5.3-max-concurrent-scope.md` — field exists at profile.ts:185; 5.3.8 wires dispatcher + adds `.max(8)`
- `decisions/014-5.3-worktree-deferred.md` — v2.0 = single-main-session + within-session subagent parallelism only
- `decisions/015-5.3-claim-service-location.md` — QueueClaimService in queue/, not sessions/
- `decisions/016-5.3-otlp-prefix-glob.md` — OTEL_EXPORTER_OTLP_* propagation = prefix-glob match
- `decisions/README.md` index updated (011-016 added)

**Substage 5.2 CLOSED 2026-04-27T~14:32Z**: 5.2.10 verifier verdict PASS_WITH_CONCERNS (`agent-workspace/memory/sessions/2026-04-27-task-5.2.10-substage-verify.md`). 0 critical / 1 important / 4 minor — all non-blocking.
- **Important (carryforward)**: INV-S9 latency violation in `tests/hooks/component-telemetry.spec.ts` — component-telemetry.sh median=567ms, p99=2527ms (target <50ms p99 / cap 200ms). Recommended fix: wrap hook payload in fire-and-forget background subshell. Owner: defer to **Phase 5.5 telemetry-rollup re-verification** (per verifier next_action note); do NOT block 5.3 advance.
- **Minor M1**: per-task session logs absent for 5.2.8.1–.13 + 5.2.9 (audit trail; deliverables verifiable from disk).
- **Minor M2**: `subagent-driven-development` test.md Assertion #2 ("exactly one spec-compliance + exactly one code-quality follows") false-positives against actual orchestration (5.2.9 used spec-compliance only). Phase 5.5 evaluator design.
- **Minor M3**: `confusion-protocol` test.md Assertion #2 presumes git history.
- **Minor M4**: 10 description-too-long warnings (deferred to v2.1).

**Substage 5.2 final state**: SC-4/SC-5/SC-6 closed. Validator: 13 skills, 0 errors, 10 warnings (all description-too-long). Monorepo: **1,387 passing**. Vitest skills-validate 16/16. component-telemetry 8/8. test:hooks: 72 passed / 7 failed (Phase-5.1 carryforward in `tool-call-first.spec.ts`). No commits (I-6 satisfied).

**Next action (after 5.3.6 returns)**:
1. Verify 5.3.6 gates: vitest +14, adapter spec regression 0, architecture.md grep ≥1, typecheck+lint exit 0, core ≥1055.
2. If PASS → dispatch **Turn 5 = 5.3.7 || 5.3.8 || 5.3.9 parallel batch** (3 bg, file-disjoint per architect §10):
   - 5.3.7 task-implementer (sonnet, 80K): `--resume <session_id>` wiring in claude-code-adapter.ts — extends `resume()` argv to include `['--resume', sessionId]`; +2 vitest cases.
   - 5.3.8 task-implementer (sonnet, 130K): `maxConcurrentSessions` dispatcher loop — adds `.max(8)` to existing schema field at profile.ts:185, wires dispatcher cap-counting, integration test (4 items / 2 projects / N=2 → ≤2 ACTIVE).
   - 5.3.9 task-implementer (sonnet, 70K): architecture.md decomposition cost model + master-planner.md citation paragraph (verbatim from architect §7).
3. After Turn 5 batch → dispatch Turn 6 = **5.3.10 parallel-vs-serial benchmark** (depends on 5.3.3 + 5.3.4 + 5.3.8 — all should be DONE by then).
4. After 5.3.10 → 5.3.11 spec-compliance reviewer + 5.3.12 sandwich-verifier (opus, fresh context, full root pnpm test ×2 determinism check).

---

## Phase 4 (COMPLETE) — preserved for reference

---

## Current Phase

**Phase**: 6 — Self-Evolution Loop Activation + v2.1 Backlog (ACTIVE — substage 6.1 CLOSED, 6.2 architect in flight)
**Phase file**: `agent-workspace/session-plans/pending/phase-6-v2.1-absorption.md` (master-planner output 2026-04-27T~19:50Z — 27 tasks / 5 substages / SC-19..SC-30 / ~1.7M total budget)
**Status**: 6.1 CLOSED 2026-04-27T~21:10Z (APPROVED) → 6.2 architect dispatched 2026-04-27T~21:15Z (bg `a632c9bc5aed36272`, self-evolution feedback loop P0)
**Source authorization**: User directive 2026-04-27T~19:35Z = "no need to release now, continue development until done all"

## Phase 6 Substage Progress

| Substage | Status | Verdict | Notes |
|---|---|---|---|
| 6.1 Carryforward fixes | CLOSED 2026-04-27T~21:10Z | APPROVED | 6.1.6 all 8 probes PASS/CONCERN-non-blocking. INV-S9 71ms (vs 567ms = 8× improvement). test:hooks 88/89 ×5 det. SC-19 + SC-21 closed |
| 6.2 Self-evolution feedback loop (P0) | CLOSED 2026-04-27T~22:30Z | APPROVED_AFTER_FIX | 6.2.7 P1 end-to-end loop PASS (functional architecture); Decision 021 WRITTEN downgrading telemetry-analyst opus→sonnet. 9 new tests (+5 rollup +4 integration). 6 carryforwards to 6.5. 14 components detected from 2,590 telemetry events |
| 6.3 Worktree isolation (P1) | **CLOSED 2026-04-27T~06:44Z** | APPROVED_AFTER_FIX | 6.3.8b 11 probes P0–P10 ALL PASS. P6 data-leak probe: bidirectional file-system isolation **PROVEN with real `git worktree add`** in tmpdir (sentinel A absent in B; sentinel B absent in A). Determinism: 1097/1097 ×2 core + 100/101 ×2 hooks (1 pre-existing mode-c-guard flake — carryforward #11). Migration confirmed additive via `prisma migrate diff` from BOTH `--from-empty` and `--from-migrations` (zero DROP). I-3 strict: 3× `execa('git', [...])` calls (worktree add/remove + branch -D); ZERO shell-string git. SC-25 + SC-26 closed. Test count: 1090→1097 net (+7 = +4 profile +9 adapter incl. T8/T9 −2 tests-restructured + +3 probe + +3 sweep + +2 manager - 12 reorganized to align). 8/8 substage tasks done. **0 block-close triggers.** |
| 6.4 Real-world SC-18 (P1) | **CLOSED 2026-04-27T~07:35Z** | APPROVED_AFTER_FIX | 6.4.3b 5 probes P0–P5 ALL PASS. **0 block-close triggers.** SC-27 result-file headline = FAIL (per-substage 6.1=8.0%, 6.2=0.9%, 6.3=0.4%); **recommended scorecard SC-27 PARTIAL** per Decision 019 §Consequences + master plan §1 line 405 graceful degradation. Methodology limitation acknowledged: session-log mtime proxy measures orchestrator's serial log-write batches, NOT actual subagent parallel execution overlap (verified parallelism happened via Phase 5 wallclock data + 6.3 dispatch graph 5 turns vs 8 forced-serial = ~37.5%). Determinism: result file byte-identical ×2 (excluding ISO timestamp) + vitest 3/3 ×2. Files: scripts/benchmarks/sc18-realworld.ts (140 LOC) + tests/benchmarks/sc18-realworld.spec.ts (3 cases) + agent-workspace/memory/sc18-realworld-result.md (generated). 6.4.3a file 7545 bytes — **carryforward #15 SATISFIED this time**. |
| 6.5 Verify + stage v2.1 | **CLOSED 2026-04-27T~08:00Z** | APPROVED | 6.5.1 1470/1470 ×3 det. 6.5.2 SC-19..SC-30 scorecard written. 6.5.3 Phase 6 retrospective + Mandates A/B/C/D. 6.5.4 v2.1.0 artifacts staged (this task). 3 carryforwards absorbed (#6 telemetry-analyst sonnet, #7 proposals/* delete, #8 re-stage). |

## Phase 6 Carryforwards (defer to 6.5 unless noted)

### From 6.1.6 verifier:
1. **Editorial gate-text fix** (4 locations): `phase-5-complete.md:57`, `phase-6-v2.1-absorption.md:48/123/302`. Working gate: `grep -cE '(Orch pin: cache_read_tokens; OTel canonical: cache_read_input_tokens' agent-workspace/memory/phase-3-complete.md` → 1
2. **agent-notes.md learned rule**: architect-spec-vs-reality recurring pattern. Pre-write Part-C gates must be run live, not reviewed semantically.
3. **Architect-skill amendment** (combined with carryforward #10 below): `.claude/agents/sandwich-architect.md` requires literal Pre-write Part-C-against-actual-file dry-run AND staged-index pre-verification.
4. **INV-S9 promotion**: lift text from `5.2-skill-evolution-architect.md:902` into `agent-workspace/constitution/invariants.md` as first-class invariant.
5. ~~mode-c-guard.spec.ts:152 timing flake~~ → SUPERSEDED by carryforward #11 (consolidated)

### From 6.2.7 verifier (added 2026-04-27T~22:30Z):
6. **Telemetry-analyst opus → sonnet downgrade** (Decision 021 WRITTEN; 1-line frontmatter edit `model: opus` → `model: sonnet` in `.claude/agents/telemetry-analyst.md`)
7. **Master-planner.md delete `proposals/*` over-build paragraph** (line 54 references non-existent directory; gate counts still pass post-delete)
8. **Re-stage `.claude/agents/master-planner.md`** so `git diff --cached` matches working tree (current state is `AM` — staged version is OLD)
9. **Citation linter `--rollup <path>` flag** for component-existence verification → **DEFER to v2.2 backlog** (not 6.5)
10. **Architect-skill amendment combined with #3**: ALSO mandate staged-index pre-verification (`git show :<path>`) for any gate targeting an existing tracked file. Recurring pattern: 6 incidents now (5.3.2, 5.3.3, 6.1.2 C.5, 6.1.4 C.2, 6.2.4 C.4, 6.2.4 cost-model).
11. **mode-c-guard.spec.ts threshold raise** (consolidates #5): Windows Git Bash subprocess overhead 541ms vs 500ms wallclock threshold. Either raise to 600ms or use `vi.useFakeTimers` / INV-10 reporter pattern (same as 6.1.3 fix).
12. **Master plan §1 1452-baseline reconciliation**: actual is 1079 packages/core + 98 root via test:hooks = 1177 union. Update target throughout `phase-6-v2.1-absorption.md` and `phase-5-complete.md` if cited. (Now 1097 core + 100 root post-6.3 = 1197 union; update target to ~1200 baseline for 6.4/6.5.)

### From 6.3.8a + 6.3.8b verifiers (added 2026-04-27T~06:44Z):
13. **6.3.7 C.4 awk-gate-defect** — architect's section-length gate `awk '/^### Worktree Isolation/,/^### |^## /' ... | wc -l` returns 1 because the end pattern `^### ` self-matches the opening heading line. Corrected portable awk: `awk '/^### Worktree Isolation/{found=1} found{count++} /^### |^## /{if(count>1){found=0}} END{print count}'` → returns 44. **Fold into architect-skill amendment carryforward #3/#10** as a third Mandate (Mandate-C: pre-write awk-range dry-run; check end-regex doesn't match the start-regex anchor).
14. **P10 Prisma flag deprecation** — architect cited `prisma migrate diff --from-empty --to-schema-datamodel`; flag was removed in current Prisma. Use `--to-schema`. **Update master-planner / sandwich-architect skill template** for any future Prisma probes.
15. **Spec-compliance-reviewer file-persistence rule (symmetric)** — predecessor 6.3.8a returned full report via task-result message but persisted only a 58-byte placeholder to disk. Sandwich-verifier-persistence-rule (Phase 5 retrospective §2.5) currently applies only to verifier; **extend to spec-compliance-reviewer** in `.claude/agents/spec-compliance-reviewer.md`. Orchestrator could also add a file-size sanity check at dispatch-completion gate. (Orchestrator reconstructed the 6.3.8a file from task-notification trace this session as a stop-gap; future sessions should not rely on this.)
16. **P6 worktree data-leak adversarial probe is now proven on Windows** — bidirectional sentinel-file test in tmpdir confirms `git worktree add` provides real fs isolation. Worth promoting the test pattern into `tests/integration/worktree-isolation.spec.ts` so it runs in CI on every push (currently only in 6.3.8b verifier transcript). **Defer to 6.5** as a hardening item OR v2.2 backlog if 6.5 budget tight.

### From 6.4.3a + 6.4.3b verifiers (added 2026-04-27T~07:35Z):
17. **6.4.2 C.4 awk space-in-gsub defect** — gate command `awk '/^\| 6\.[123] / {gsub(/[\| %]/,""); print $5}'` produces empty output because the space char in the gsub class collapses fields. Corrected portable form: `grep -E "^\| 6\.[123] " result.md | awk -F'|' '{gsub(/[ %]/,"",$6); print $6}'` OR `awk '/^\| 6\.[123] / {for(i=1;i<=NF;i++) if($i ~ /%$/) {gsub(/%/,"",$i); print $i; break}}'`. **Architect-skill amendment carryforward** (joins #3/#10/#13 awk family). Per-substage real numbers from corrected awk: 6.1=8.0%, 6.2=0.9%, 6.3=0.4%.
18. **Proxy-methodology improvement** (session-log mtime → actual dispatch+completion timestamps) — record real subagent dispatch + completion ms timestamps to `budget-tracker.md` (or a dedicated `dispatch.jsonl`) so SC-27 measures actual parallelism rather than orchestrator's log-write serialization. **Defer to v2.2** unless 6.5 has budget headroom.
19. **`scripts/benchmarks/sc18-realworld.ts` import.meta.url main-guard hygiene** — verifier flagged minor: the CLI entry guard pattern. Non-blocking. **Defer to v2.2**.

---

## Phase 5 — Self-Evolution / v2.0 (CLOSED 2026-04-27T~19:30Z)

---

## Phase 5 — Self-Evolution / v2.0 (CLOSED 2026-04-27T~19:30Z)

---

## Phases Overview

| Phase | Name | Status | Master Plan |
|---|---|---|---|
| 0 | Research & Verify | complete 2026-04-24 | `session-plans/completed/phase-0-research.md` |
| 1 | Core Daemon MVP | complete 2026-04-25 | `session-plans/completed/phase-1-core.md` |
| 2 | Interfaces | complete 2026-04-25 | `session-plans/completed/phase-2-interfaces.md` |
| 3 | Intelligence | complete 2026-04-26 | `session-plans/completed/phase-3-intelligence.md` |
| 4 | Polish & Share | complete 2026-04-27 | `session-plans/completed/phase-4-polish-plan.md` |
| 5 | Self-Evolution / v2.0 | complete 2026-04-27 (CLOSED — v2.0.0 staged, release deferred per user) | `session-plans/completed/phase-5-self-evolution.md` |
| 6 | Self-Evolution Loop Activation + v2.1 Backlog | **complete 2026-04-27** (CLOSED — v2.1.0 staged, release deferred per user; all 5 substages APPROVED/APPROVED_AFTER_FIX) | `session-plans/completed/phase-6-v2.1-absorption.md` |
| 7 | Hardening + Self-Evolution Loop First Upgrade (v2.2) | **active 2026-04-27** (master plan written; 7.0.1 research-scanner pending dispatch) | `session-plans/pending/phase-7-v2.2-hardening.md` |

---

## PROJECT COMPLETE — User-Confirm Halt Point

**All 5 phases done. 1,375 monorepo tests green. 21/22 Charter criteria PASS (N6 deferred).**

The following actions require **explicit user authorization**. Orch will NOT perform any of these automatically.

---

### User Action Checklist

#### 1. Replace placeholders before publishing

Before pushing to GitHub or npm, update these literal placeholders in `README.md`:

- `<OWNER>/<REPO>` — CI badge URL (line ~3 of README.md). Replace with your actual GitHub username and repo name.
- `@<scope>/orch-cli` — npm install command in the quick-start section (line ~32). Replace with your actual npm scope and package name.
- `<owner>` — ccs CLI link in README §Requirements. Replace with the GitHub username hosting the ccs CLI.

#### 2. Initialize git repository

The project has never been committed. Run:

```bash
git init
git add .          # or curate specific files
git commit -m "v1.0.0 release"
```

#### 3. Tag and push

```bash
git tag v1.0.0
git remote add origin https://github.com/<OWNER>/<REPO>.git
git push origin main v1.0.0
```

The `v1.0.0` tag push triggers `.github/workflows/release.yml` which publishes the npm package.

#### 4. Configure release secrets (one-time GitHub repo setup)

In your GitHub repo Settings → Secrets and variables → Actions:

- **`NPM_TOKEN`** — required for `release.yml` to publish `@<scope>/orch-cli` to npm. Generate at npmjs.com → Access Tokens → Automation.
- **`CODECOV_TOKEN`** — optional, for `ci.yml` coverage upload to Codecov.

#### 5. Verify post-release

After pushing v1.0.0:

- GitHub Actions `ci.yml` runs on both Node 20 and 22 — confirm both matrix jobs green.
- GitHub Actions `release.yml` publishes to npm — confirm package appears at `npmjs.com/package/@<scope>/orch-cli`.
- GitHub Releases page shows auto-generated release notes from the v1.0.0 tag.

---

### v1.0.1 Backlog (non-blocking, for future sessions)

| Item | Notes |
|---|---|
| `inject-hooks.ts` JSDoc step-numbering | Header says backup→validate→atomic; actual is validate→backup→atomic. Cosmetic doc fix. |
| ccs-spawn integration test gating | `claude-code-adapter.integration.spec.ts` environmental failure; add to CI gating. |
| `docs/quickstart.md` population | Not mandated by Phase 4; stub exists. |
| N6 — 72h memory leak verification | Manual run; capture RSS delta over 72h. |
| Multi-tenant dashboard | Phase 4 out-of-scope; v1.1 roadmap. |

---

## Phase 4 Progress (COMPLETE)

| Task | Status | Tests delta |
|---|---|---|
| 4.0 — Phase 4 Kickoff Scaffolding | DONE | baseline 1,331 |
| 4.1 — SessionManager Schema Extension (#10) | DONE | +13 core; commit_sha + session_log_path; R1 guard DELETED |
| 4.1.fix — Integration test fixture | DONE | gitDiff.getHeadCommit + sessionLogResolver mocks |
| 4.2 — Adapter Prepend Coverage (#9) | DONE | +3 core; -p arg path behavioral; seedPrompt prepend |
| 4.3 — Module Shutdown Ordering (MINOR-3) | DONE | +2 core; cron inFlightTicks drain |
| 4.4 — Polish CLI Init Flow | DONE | +10 cli; init/attach/detach |
| 4.5 — Hook Injection Utility | DONE | +11 cli; backup-validate-atomic |
| 4.6 — Example Integration | DONE | +2 cli; stockforge + generic examples |
| 4.7 — CI Setup | DONE | ci.yml + release.yml |
| 4.8 — Docker Compose Validation | DONE | 3-profile + Linux-gated smoke |
| 4.9 — Comprehensive README | DONE | 173 lines |
| 4.10 — Configuration Reference (#4) | DONE | 751 lines; #4 verbatim at line 738 |
| 4.11 — Architecture + Troubleshooting + Release | DONE | 314 + 605 + 249 lines |
| 4.12 — Final E2E Verification Gate | FAIL → recovered by 4.12.r | CRITICAL-1 P2021 async-void leak |
| 4.12.r — P2021-tolerance narrow-fix | DONE | +3 core; 1375/1375 deterministic × 3 runs |
| 4.13 — Phase 4 Close Housekeeping | DONE | plan files moved; retrospectives written |

**Phase 4 final test counts**: core 1002/1002, cli 45/45, shared 40/40, telegram 125/125, web-ui 163/163 = **monorepo 1,375 passing**

---

## Phase 3 Progress (COMPLETE — see phase-3-complete.md)

All Tasks 3.0–3.13 complete. Tests 1,346 at Phase 3 exit. Carryforwards #4/#9/#10/MINOR-3 all closed in Phase 4.

---

## Phase 2 Progress (COMPLETE — see phase-2-complete.md)

All Tasks 2.0–2.13 complete. Tests 1,092 at Phase 2 exit.

---

## Phase 1 Progress (COMPLETE — see phase-1-complete.md)

All Tasks 1.0–1.17 complete. Tests 707 at Phase 1 exit.

---

## Session Counter

**Last session**: 28 (Phase 4 Task 4.13 — Project Complete Housekeeping)

---

## Decisions Made

See `agent-workspace/memory/decisions/`:
- `001-phase0-execution-adjustments.md` — Phase 0 execution strategy
- `002-task-1.7-sandwich-dev-vs-task-implementer.md` — Task 1.7 single-agent rationale
- `003-task-1.8-sandwich-dev-rationale.md` — Task 1.8 single-agent rationale
- `004-context-full-ingestion-mode.md` — Context-full ingestion mode
- `005-trace-backend-toggle.md` — Langfuse alt-backend ACTIVE env gate
- `006-handoff-no-llm.md` — Handoff context builder zero LLM
- `007-handoff-tx-ordering.md` — HandoffContext transaction ordering Path B
- `008-handoff-spawn-locus.md` — Orchestrator owns spawn-locus
- `009-cache-read-attr-name.md` — Cache-read token attribute name
- `010-task-3.10-http-vs-sse-timing.md` — N5 latency: HTTP + SSE-listener both

Research decisions D1–D15: `agent-workspace/research/SYNTHESIS.md`.

---

## Escalations

None active. Phase 4 completed with single narrow-fix cycle (4.12.r). Project is at user-confirm halt point.

---

## Budget Tracking

**Daily cap**: 5M tokens (charter N-2)
**Used Phase 0**: ~193K
**Used Phase 1**: ~800K est
**Used Phase 2**: ~1.2M est
**Used Phase 3**: ~1.8M est
**Used Phase 4**: ~900K est
**Total estimated**: ~4.9M across all phases and 28 autonomous sessions

---

## Pick-up Instructions

**Project is complete. Autonomous mode is OFF.**

If resuming for v1.0.1 work:

1. Read this file (you did)
2. Read `agent-workspace/memory/project-complete.md` for full retrospective
3. Read `agent-workspace/memory/phase-4-complete.md` for Phase 4 detail
4. Identify which v1.0.1 backlog item to address
5. Get user authorization before proceeding (autonomous_mode = false)

---

## v2.0.0 Release User-Action Checklist (after Phase 5 staged)

> Task 5.5.4 has staged the following release artifacts (NO COMMIT yet — I-6 binding):
> - `package.json` (root) — version bumped to 2.0.0
> - `packages/core/package.json` — version bumped to 2.0.0
> - `packages/cli/package.json` — version bumped to 2.0.0
> - `packages/shared/package.json` — version bumped to 2.0.0
> - `packages/telegram/package.json` — version bumped to 2.0.0
> - `packages/web-ui/package.json` — version bumped to 2.0.0
> - `CHANGELOG.md` — created with v2.0.0 entry (Keep-a-Changelog format)
> - `RELEASE_NOTES.md` — created with narrative + headline features + SC-18 75% benchmark
> - `agent-workspace/memory/current-execution.md` — this checklist appended
> - `agent-workspace/memory/sessions/2026-04-27-task-5.5.4-stage-v2.md` — session log written
>
> All other Phase 5 deliverables (SC-1..SC-18, 1452 tests, hooks, skills, etc.) were staged by prior tasks.

### Step 1 — Review staged changes

```bash
git status
git diff --stat HEAD
# Note: HEAD does not exist yet (no commits). Use:
git diff --cached --stat   # to see what's staged
# Or simply review file list from git status
```

### Step 2 — Curate the commit

Decide which staged files to include in the v2.0.0 commit vs. which to defer to a
follow-up (e.g., memory/session logs, agent-workspace docs, etc.).

Suggested curated set for the v2.0.0 commit:
- All `packages/*/src/**` TypeScript source and spec files
- All `packages/*/package.json` + root `package.json`
- `CHANGELOG.md`, `RELEASE_NOTES.md`
- `docs/` directory
- `.github/workflows/` CI/CD
- `scripts/` hooks and utilities
- `.claude/` agents, skills, commands
- `prisma/` migrations and schema
- `Dockerfile.*`, `docker-compose*.yml`

Optional deferral (non-essential for release):
- `agent-workspace/memory/**` (internal orchestration logs)
- `agent-workspace/session-plans/**`
- `reference-repos/**` (third-party reference code)

### Step 3 — Commit

```bash
git add <curated files>
git commit -m "v2.0.0 release

Phase 5: parallelization framework, loop-resilience guards, skill self-evolution scaffolding.
75% wallclock improvement (SC-18). 1,452/1,452 tests (3-run determinism gate).
17/18 SC PASS; SC-14d PARTIAL (N6 72h user-action deferred)."
```

### Step 4 — Tag

```bash
git tag v2.0.0
```

### Step 5 — Push

```bash
git remote add origin https://github.com/<OWNER>/<REPO>.git   # if not already set
git push origin main v2.0.0
```

The `v2.0.0` tag push triggers `.github/workflows/release.yml` which publishes the npm package.

### Step 6 — Verify GitHub Actions

After pushing:
- `ci.yml` runs on Node 20 and 22 — confirm both matrix jobs green.
- `release.yml` publishes to npm — confirm package appears at `npmjs.com/package/@<scope>/orch-cli`.
- GitHub Releases page shows v2.0.0 with auto-generated release notes.

### Step 7 — Optional: N6 72h RSS run (SC-14d carryforward)

Per `agent-workspace/memory/n6-rss-sample.md`, run:

```bash
scripts/utilities/measure-rss.sh --duration-sec 259200
```

Attach CSV + summary to GitHub Release notes. Flip SC-14 to full PASS in
`agent-workspace/memory/phase-5-complete.md`.

---

## v2.1.0 Release User-Action Checklist

> Task 6.5.4 has staged the following release artifacts (NO COMMIT yet — I-6 binding):
> - `package.json` (root) — version bumped to 2.1.0
> - `packages/core/package.json` — version bumped to 2.1.0
> - `packages/cli/package.json` — version bumped to 2.1.0
> - `packages/shared/package.json` — version bumped to 2.1.0
> - `packages/telegram/package.json` — version bumped to 2.1.0
> - `packages/web-ui/package.json` — version bumped to 2.1.0
> - `CHANGELOG.md` — v2.1.0 entry prepended (Keep-a-Changelog format)
> - `RELEASE_NOTES.md` — v2.1.0 narrative added above v2.0.0 narrative
> - `.claude/agents/telemetry-analyst.md` — model: opus → sonnet (carryforward #6, Decision 021)
> - `.claude/agents/master-planner.md` — proposals/* paragraph deleted + re-staged (carryforwards #7 + #8)
> - `agent-workspace/memory/current-execution.md` — this checklist appended
> - `agent-workspace/memory/sessions/2026-04-27-task-6.5.4-stage-v2.1.0.md` — session log written
>
> All other Phase 6 deliverables (SC-19..SC-30, 1470 tests, worktree isolation, self-evolution loop, etc.) were staged by prior tasks.

### Step 1 — Review staged changes

```bash
git diff --cached --stat   # view all staged changes
git status                 # verify no unexpected AM markers remain
```

### Step 2 — Curate the v2.1.0 commit

**Option A**: If you have NOT yet committed v2.0.0, you may create a single inaugural commit
for the entire history (v2.0.0 + v2.1.0 combined), or two separate commits for clarity.

**Option B**: If v2.0.0 is already committed, this is a follow-up commit containing
the Phase 6 additions on top of v2.0.0.

Suggested curated set for the v2.1.0 commit:
- All `packages/*/src/**` TypeScript source and spec files (Phase 6 additions)
- All `packages/*/package.json` + root `package.json` (version 2.1.0)
- `CHANGELOG.md`, `RELEASE_NOTES.md`
- `.claude/agents/telemetry-analyst.md` (model downgrade)
- `.claude/agents/master-planner.md` (proposals/* paragraph delete)
- `scripts/benchmarks/sc18-realworld.ts` + spec
- `scripts/utilities/rollup-telemetry.ts` (extended)
- `tests/integration/feedback-loop.spec.ts`
- `tests/hooks/session-start-worktree-sweep.spec.ts`
- `prisma/migrations/20260426223316_session_worktree/`
- `prisma/schema.prisma` (worktreePath field)
- `agent-workspace/constitution/invariants.md` (INV-S9)
- `agent-workspace/memory/decisions/017-021*.md`
- `agent-workspace/memory/phase-6-complete.md`

Optional deferral (non-essential for release):
- `agent-workspace/memory/**` session logs and tracker files
- `agent-workspace/session-plans/**`

### Step 3 — Commit

```bash
git add <curated files>
git commit -m "v2.1.0 release

Phase 6: self-evolution loop activated, worktree isolation, INV-S9 8x fix.
1,470/1,470 tests (3-run determinism gate). 9/12 SC PASS, 3/12 PARTIAL.
Carryforwards #6+#7+#8 absorbed. Zero autonomous git commits (I-6 honored)."
```

### Step 4 — Tag

```bash
git tag v2.1.0
```

### Step 5 — Push

```bash
git remote add origin https://github.com/<OWNER>/<REPO>.git   # if not already set
git push origin main v2.1.0
```

The `v2.1.0` tag push triggers `.github/workflows/release.yml` which publishes the npm package.

### Step 6 — Verify GitHub Actions

After pushing:
- `ci.yml` runs on Node 20 and 22 — confirm both matrix jobs green.
- `release.yml` publishes to npm — confirm package appears at `npmjs.com/package/@<scope>/orch-cli`.
- GitHub Releases page shows v2.1.0 with auto-generated release notes.

### Step 7 — v2.2 backlog (Phase 7 candidates)

Per `agent-workspace/memory/phase-6-complete.md §H`:
- Carryforward #9: citation linter `--rollup` flag
- Carryforward #11a/#11b: mode-c-guard + api-truncation INV-10 reporter migration (Windows timing)
- Carryforward #16: worktree-isolation integration spec promotion to CI
- Carryforward #18: real dispatch+completion timestamps (replace mtime proxy for SC-27)
- Carryforward #19: sc18-realworld.ts import.meta.url main-guard hygiene

---

## Phase 7 — Hardening + Self-Evolution Loop First Upgrade (ACTIVE 2026-04-27)

**Phase**: 7 — Hardening + Self-Evolution Loop First Upgrade (v2.2)
**Phase file**: `agent-workspace/session-plans/pending/phase-7-v2.2-hardening.md` (master-planner output 2026-04-27 — 24 tasks / 8 substages / SC-31..SC-38 + optional SC-39 / ~1.26-1.46M total budget)
**Status**: master plan written 2026-04-27; pending dispatch of 7.0.1 research-scanner (sonnet, 60K, bg)
**Source authorization**: User directive 2026-04-27T~08:05Z = "no need to release, git, ... for now, continue do development. full autonomous until done all"
**Theme**: harden v2.1, close v2.2 carryforward backlog (4 DEFERRED-v2.2 + carryforward #11 split + carryforward #20 stall lesson). NOT a feature push.

> **Note**: the "Phases Overview" table at line 168 above is now superseded by an updated table that includes Phase 7 as `active 2026-04-27`. The earlier table is preserved for historical context; the updated table appears in the §"Phases Overview (v2 — Phase 7 active)" section below.

### Phase 7 Substage Progress

| Substage | Status | Verdict | Notes |
|---|---|---|---|
| 7.0 Research & decision-log | **CLOSED 2026-04-27T~09:14Z** | DONE | 7.0.1 research-scanner DONE (survey 318 LOC; 2 critical Mandate-A corrections caught — INV-10 = informational reporter NOT useFakeTimers, citation-linter does NOT exist yet). 7.0.2 sandwich-architect DONE_WITH_CONCERNS (4 decisions 022-025 + decisions/README.md + 7.1 architect spec 594 LOC; budget-tracker append skipped due to architect tool surface — orchestrator absorbed). |
| 7.1 Carryforward #11a/#11b — INV-10 reporter migration | **CLOSED 2026-04-27T~10:08Z** | APPROVED | All 11 probes PASS (P9 OK_AS_IS non-blocking). 3× pnpm test:hooks = 104/104 deterministic. 4 INV-10 reporter lines confirmed (mode-c-guard, api-truncation, narration-grep, tool-call-first). Decision 022 honored (0 useFakeTimers, 0 process.platform, 0 retained `toBeLessThan(500\|1000)`). Reference pattern (tool-call-first.spec.ts) untouched. LOC delta sum=44 (≤65 ✓). Verifier session note 10280 bytes (≥4000 ✓). SC-31 + SC-32 CLOSED. Carryforward #11a + #11b CLOSED. |
| 7.2 Carryforward #18 — real dispatch+completion timestamps | PENDING | — | dispatch.jsonl + capture seam + sc18-realworld replay flag. ~280K. SC-33 (replaces SC-27 PARTIAL). |
| 7.3 Carryforward #16 — worktree-isolation integration spec | PENDING | — | tests/integration/worktree-isolation.spec.ts; 6.3.8b probe promoted to CI. ~150K. SC-34. |
| 7.4 Carryforward #9 — citation linter --rollup flag | PENDING | — | Linter verifies component-existence in rollup outputs. ~130K. SC-35. |
| 7.5 Carryforward #19 — sc18-realworld.ts import.meta.url hygiene | PENDING | — | Folded IMPL; minor; verify at 7.8. ~40K. SC-36. |
| 7.6 Carryforward #20 — sandwich-architect Mandate E (incremental write) | PENDING | — | Skill amendment + regression test. ~80K. SC-37. |
| 7.7 Self-evolution loop's first real upgrade (signal-permitting) | PENDING | — | Conditional on Decision 025; default DEFER per phase-6-complete.md §C.3. ~0K (defer) to ~220K (execute). SC-39 optional. |
| 7.8 Verify + stage v2.2 | PENDING | — | 3-run determinism + SC scorecard + retro + stage v2.2.0 (NO COMMIT). ~240K. SC-38. |

### Phase 7 Carryforwards from Phase 6 (consolidated source-of-truth)

| Source | ID | Item | Substage |
|---|---|---|---|
| 6.5.2 verifier (DEFERRED-v2.2) | 9 | Citation linter `--rollup <path>` flag | 7.4 |
| 6.5.2 verifier (DEFERRED-v2.2) | 16 | Worktree-isolation integration spec promotion | 7.3 |
| 6.5.2 verifier (DEFERRED-v2.2) | 18 | Real subagent dispatch+completion timestamps | 7.2 |
| 6.5.2 verifier (DEFERRED-v2.2) | 19 | sc18-realworld.ts import.meta.url hygiene | 7.5 |
| 6.5.2 verifier #11 split | 11a | mode-c-guard.spec.ts:152 deterministic-on-Windows fix | 7.1 |
| 6.5.2 verifier #11 split | 11b | api-truncation.spec.ts:{118,153} + narration-grep load-dependent | 7.1 |
| 6.5.3 stall observed | 20 | sandwich-architect Mandate E (incremental write) | 7.6 |
| Phase 6 §H candidate #6 | — | Self-evolution loop first real upgrade | 7.7 (optional) |

### Phase 7 Decisions to Write (7.0.2)

- `decisions/022-phase-7-inv10-reporter-fix.md` — vi.useFakeTimers + advanceTimersByTime per phase-6-complete.md §F Option (i)
- `decisions/023-phase-7-dispatch-jsonl-schema.md` — `{ts_dispatch_ms, ts_complete_ms, agent, task_id, parent_session, model?, budget_used?}` append-only
- `decisions/024-phase-7-citation-linter-rollup-cli.md` — `--rollup <path>` arg flag (not boolean); component-resolution map binding
- `decisions/025-phase-7-loop-first-upgrade-defer-or-execute.md` — defer-default unless ≥2 RULES firing on Phase 6 telemetry

### Next Action (Phase 7 entry point)

Dispatch **7.0.1 research-scanner** (sonnet, 60K, bg). Brief: load-test the 4 decision options before any IMPL substage. Output: `agent-workspace/research/phase-7-options-survey.md` (~150 LOC) with INV-10 reporter pattern from `tests/hooks/tool-call-first.spec.ts` (verbatim line numbers), dispatch.jsonl schema candidate, citation-linter CLI shape, SC-39 signal assessment.

After 7.0.1 returns → dispatch 7.0.2 task-implementer (sonnet, 60K, bg) to write decisions 022-025 + update decisions/README.md.

### Phase 7 Stop Conditions

DONE: SC-31..SC-38 PASS or PARTIAL with documented rationale; SC-39 PASS or DEFER. v2.2.0 staged at 7.8.4.
ESCALATE: STOP-1..STOP-5 inherited from Phase 6 + STOP-6 (net LOC >80 per task without supplementary decision; Karpathy P3 binding) + STOP-7 (INV-10 reporter migration breaks an existing PASS spec).

---

## Phases Overview (v2 — Phase 7 active)

> Supersedes earlier "Phases Overview" table at line 168.

| Phase | Name | Status | Master Plan |
|---|---|---|---|
| 0 | Research & Verify | complete 2026-04-24 | `session-plans/completed/phase-0-research.md` |
| 1 | Core Daemon MVP | complete 2026-04-25 | `session-plans/completed/phase-1-core.md` |
| 2 | Interfaces | complete 2026-04-25 | `session-plans/completed/phase-2-interfaces.md` |
| 3 | Intelligence | complete 2026-04-26 | `session-plans/completed/phase-3-intelligence.md` |
| 4 | Polish & Share | complete 2026-04-27 | `session-plans/completed/phase-4-polish-plan.md` |
| 5 | Self-Evolution / v2.0 | complete 2026-04-27 (CLOSED — v2.0.0 staged, release deferred per user) | `session-plans/completed/phase-5-self-evolution.md` |
| 6 | Self-Evolution Loop Activation + v2.1 Backlog | complete 2026-04-27 (CLOSED — v2.1.0 staged, release deferred per user) | `session-plans/completed/phase-6-v2.1-absorption.md` |
| 7 | Hardening + Self-Evolution Loop First Upgrade (v2.2) | **CLOSED 2026-04-27** (v2.2.0 staged; 7.8.4 DONE; release pending user authorization) | `session-plans/pending/phase-7-v2.2-hardening.md` |

---

## v2.2.0 Release User-Action Checklist

> Task 7.8.4 has staged the following release artifacts (NO COMMIT yet — I-6 binding; Decision 020 absolute):
> - `package.json` (root) — version bumped to 2.2.0
> - `packages/core/package.json` — version bumped to 2.2.0
> - `packages/cli/package.json` — version bumped to 2.2.0
> - `packages/shared/package.json` — version bumped to 2.2.0
> - `packages/telegram/package.json` — version bumped to 2.2.0
> - `packages/web-ui/package.json` — version bumped to 2.2.0
> - `CHANGELOG.md` — v2.2.0 entry prepended (Keep-a-Changelog format; SC-31..SC-39 scorecard + CF-21..CF-26 carryforwards)
> - `RELEASE_NOTES.md` — v2.2.0 narrative added above v2.1.0 narrative (≥30 LOC; cites carryforwards #9, #11, #16, #18, #19, #20)
> - `agent-workspace/memory/current-execution.md` — this checklist appended
> - `agent-workspace/memory/sessions/2026-04-27-task-7.8.4-stage-v2.2.0.md` — session log written
>
> All other Phase 7 deliverables (SC-31..SC-38, 1470/1470/1470 tests, dispatch.jsonl, worktree-isolation spec, citation-linter, Mandate E, etc.) were staged by prior substage tasks (7.1–7.8.3).

### Step 1 — Review staged changes

```bash
git status --porcelain         # verify 6× package.json + CHANGELOG + RELEASE_NOTES + current-execution.md markers
git diff --cached --stat       # view all staged changes summary
git diff --cached CHANGELOG.md # verify v2.2.0 entry is present and correct
git diff --cached RELEASE_NOTES.md
```

### Step 2 — Skim the Phase 7 scorecard

```bash
cat agent-workspace/memory/phase-7-complete.md   # §B SC-31..SC-39 table + §D carryforwards
```

Key facts:
- **8/8 SCs PASS** (1 PASS_WITH_CONCERN on SC-33 per CF-21; non-blocking)
- **SC-39 DEFERRED** to v2.3 per `decisions/025` (signal-thin rollup)
- **1470/1470/1470** workspace tests ×3 (SC-38 PASS)
- **126/126** hooks tests (SC-31 PASS)
- **278 LOC** net Phase 7 production code (≤ 280 cap; P8 PASS)

### Step 3 — Decide: commit + tag v2.2.0, or defer further

**Option A — Commit now (v2.2.0 alone)**:

```bash
git add package.json packages/*/package.json CHANGELOG.md RELEASE_NOTES.md \
    agent-workspace/memory/current-execution.md \
    agent-workspace/memory/phase-7-complete.md \
    agent-workspace/memory/sessions/2026-04-27-task-7.8.4-stage-v2.2.0.md \
    scripts/utilities/citation-linter.ts \
    scripts/hooks/dispatch-jsonl-recorder.sh \
    scripts/benchmarks/sc18-realworld.ts \
    tests/integration/worktree-isolation.spec.ts \
    tests/skills/architect-mandates.spec.ts \
    tests/hooks/ \
    .claude/agents/sandwich-architect.md \
    agent-workspace/memory/decisions/022-026*.md \
    agent-workspace/memory/phase-7-routing-recommendations.md

git commit -m "v2.2.0 hardening release

Phase 7: 6 carryforwards closed, Mandate E, INV-10 reporter migration.
126/126 hooks, 1470/1470/1470 workspace tests (3-run determinism).
8/9 SC PASS (SC-39 deferred). 278 LOC net. Zero autonomous git commits (I-6)."
```

**Option B — Commit all staged history at once** (v2.0.0 + v2.1.0 + v2.2.0 in one inaugural commit):

Appropriate if no prior commits exist. Use `git log` to confirm state.

```bash
git log --oneline    # expect: "fatal: your current branch 'main' does not have any commits yet"
git add -A           # or carefully curate the set
git commit -m "v2.2.0 inaugural commit: Phases 0–7 complete ..."
```

### Step 4 — Tag

```bash
git tag v2.2.0
# or, if also tagging prior milestones first:
git tag v2.0.0 <sha>
git tag v2.1.0 <sha>
git tag v2.2.0 HEAD
```

### Step 5 — Push

```bash
git remote add origin https://github.com/<OWNER>/<REPO>.git   # if not already set
git push origin main v2.2.0
```

The `v2.2.0` tag push triggers `.github/workflows/release.yml` which publishes the npm package.

### Step 6 — Verify GitHub Actions

After pushing:
- `ci.yml` runs on Node 20 and 22 — confirm both matrix jobs green.
- `release.yml` publishes to npm — confirm package appears at `npmjs.com/package/@<scope>/orch-cli`.
- GitHub Releases page shows v2.2.0 with auto-generated release notes.

### Step 7 — v2.3 backlog (Phase 8 candidates)

Per `agent-workspace/memory/phase-7-complete.md §D`:
- CF-21: `tool_use_id` correlation in PreToolUse(Task) — sidecar fallback + session-start probe
- CF-22: `dispatch-recorder.spec.ts` LOC trim (372 vs ~120 ideal)
- CF-23: SC-27 retro attestation (promotes to PASS when CF-21 ships)
- CF-24: read-only-tmpdir injection portability on Win+Git-Bash (LOW)
- CF-25: citation-linter dedup (pure refactor, sandwiched)
- CF-26: Architect-spec-vs-reality LOC variance — skill-amendment input for v2.3 retrospective
- SC-39: self-evolution loop first real upgrade — re-evaluate when ≥2 RULES fire on v2.3 rollup
