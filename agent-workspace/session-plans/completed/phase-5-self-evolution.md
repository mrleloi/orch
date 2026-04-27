---
phase: 5
phase_name: Self-Evolution / v2.0
status: pending
created: 2026-04-27
budget_estimate_tokens: 4_400_000
expected_sessions: 28
expected_calendar_days: 4
authoring_agent: master-planner (opus 4.7)
inputs_consumed:
  - agent-workspace/memory/phase-0-4-meta-retrospective.md
  - agent-workspace/research/claudekit-skills.md
  - agent-workspace/research/claudekit-docs.md
  - agent-workspace/research/claude-code-learn.md
  - PROJECT_CHARTER.md
  - CLAUDE.md
  - agent-workspace/constitution/{architecture,invariants,session-budgets,karpathy-principles,model-routing,coding-principles,reusability-rules,research-protocol,autonomous-protocol}.md
  - agent-workspace/memory/current-execution.md
  - agent-workspace/memory/checkpoints/latest.md
  - agent-workspace/memory/agent-notes.md
---

# Phase 5 Master Plan — Self-Evolution / v2.0

> Transition from "Orch v1.0 ships" to "Orch v2.0 self-improves and parallelizes".
> Phase 5 is the first phase where Orch is asked to act on itself: harden its own
> autonomous loop, instrument its own components, and gain genuine parallelism. The
> charter's daemon-dumb / workers-smart rule still binds — every self-evolution loop
> runs as deterministic code or as worker-side LLM analysis, never as daemon-side LLM.

---

## 1. Goals & Success Criteria

Phase 5 is DONE when **all** of the following hold. Mirrors Phase 4's exit-criteria scorecard format. Each criterion is verifiable by a deterministic check listed in the right column.

| # | Criterion | Verification |
|---|---|---|
| **SC-1** | Mode-A (narrate-without-tool-call) is detectable and rejected by a Stop-hook lint. The lint reads transcript content blocks and flags a turn where a present-progressive verb pattern (`Dispatching`, `Will run`, `About to`) appears in a `text` content block AND no `tool_use` block follows in the same turn AND `autonomous_mode=true`. | Run `pnpm test` in `packages/core` — new vitest covers 6 scripted transcripts (3 Mode-A positives, 3 false-positive baits). All 6 PASS. |
| **SC-2** | Mode-B (Anthropic API mid-stream truncation) auto-recovers without human nudge. Stop-hook side effect inspects `.autonomous-stop-watchdog.log`'s last entry; if `api_error=suspected` AND no recovery-fired marker for the same request_id exists, the hook fires `continue-injector` exactly once and writes `.api-truncation-recovery-fired-<request_id>` for idempotency. | Replay-test harness: feed 3 synthetic api_error transcripts through the watchdog script; assert exactly 1 SendKeys-style invocation per unique request_id, 0 duplicates on repeat fires. |
| **SC-3** | Mode-C (premature wind-down) cannot recur. Stop-hook reads `.transcript-tokens` AND scans last 200 lines of transcript for the rationalization phrases (`approaching 200K`, `give next task fresh envelope`, `past 150K soft-prep, stopping`); if real tokens < `ORCH_WIND_DOWN_TOKENS - 20K` AND any phrase matches AND `.wind-down` marker is absent, the Stop is REJECTED via `additionalContexts` injection containing the actual real-transcript number and a forced-dispatch reminder. | Synthetic transcript test PASSes; live `.autonomous-premature-windown-alert.log` shows 0 new entries from the moment the lint ships. |
| **SC-4** | Every skill in `.claude/skills/<name>/SKILL.md` has a sibling `<name>.test.md` (alongside SKILL.md) declaring: trigger conditions, expected behavior, named failure modes, and ≥3 assertions. A `pnpm skills:validate` script enforces presence + structural shape. | `pnpm skills:validate` exits 0 across all 14 skills. CI runs it on every PR touching `.claude/skills/`. |
| **SC-5** | All 6 oversized SKILL.md files (otel-tracing 350L, grammy-bot 275L, prisma-sqlite 278L, profile-yaml 270L, nestjs-module 249L, claude-code-hooks 251L) are refactored to ≤150 lines, with detail moved to `references/<topic>.md` files in the same skill dir. SKILL.md frontmatter has `allowed-tools` declared. | Line-count check + `pnpm skills:validate`; sample-spawn a fresh subagent that activates `otel-tracing` and confirm references/ is loaded on demand only when the body cites it. |
| **SC-6** | Component telemetry exists. Every skill activation, agent dispatch, command invocation, and hook fire writes a structured event to `agent-workspace/memory/component-telemetry.jsonl` (append-only). Schema: `{ts, component_type, component_name, trigger, outcome, tokens_self, tokens_real, duration_ms, session_id}`. | `cat agent-workspace/memory/component-telemetry.jsonl | wc -l > 100` after a single Phase 5 session. JSON lines all parse via zod schema. |
| **SC-7** | A new Prisma migration adds `claimed_by TEXT` and `claim_expires_at DATETIME` columns to `QueueItem`. The dispatcher uses an atomic `UPDATE queue_item SET claimed_by=:worker, claim_expires_at=:expiry WHERE id=:id AND claimed_by IS NULL` for claim acquisition; 0-row result means another worker won. | Vitest contention test: spawn 4 concurrent `claimItem(workerId, id)` calls in WAL-mode in-memory SQLite; assert exactly 1 success, 3 failures with no exception thrown. |
| **SC-8** | `profile.yaml` schema gains `max_concurrent_sessions: number` (default 1, hard cap 8). Daemon dispatcher respects it. When N=2, two sessions dispatch concurrently across DIFFERENT projects (worktree isolation deferred to v2.1 per claude-code-learn P3). | Integration test: profile with `max_concurrent_sessions: 2`, queue 4 items across 2 projects; assert ≤2 sessions ACTIVE at any wallclock moment. |
| **SC-9** | `worker_mailbox` SQLite table exists with schema `{id PK, to_worker TEXT, from_worker TEXT, message TEXT, read BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP}`. Domain service `MailboxService` exposes `send(to, msg)`, `pollUnread(worker, limit)`, `markRead(ids)`. Daemon-dumb invariant holds (no LLM in MailboxService). | `pnpm --filter @orch/core test mailbox.spec.ts` PASS. `grep -rn "anthropic\|openai" packages/core/src/sessions/mailbox` returns 0. |
| **SC-10** | Session resume via `claude --resume <id>` is wired in `ClaudeCodeAdapter`. When `QueueItem.claude_session_id` is non-null AND `--resume` is supported by the runtime, adapter passes `--resume <id>` instead of rebuilding HandoffContext file. Backward compat preserved when null. | Adapter unit test scripted with 2 cases (resume-true / resume-false); both spawn-arg arrays match expected. |
| **SC-11** | Env var propagation audit closed. `ClaudeCodeAdapter.spawn()` propagates: `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, `CLAUDE_CODE_REMOTE`, `TRACEPARENT`, `OTEL_EXPORTER_OTLP_*`. Documented in `docs/architecture.md` adapter section. | Adapter unit test: scripted env input → assert all expected vars present in spawned-process env. |
| **SC-12** | Hook `decision: approve|deny|modify` field is parsed by hooks-receiver and surfaces to session module as `HookDecision` enum. Existing PreToolUse fixtures regress-test all 3 values. If a hook returns `{decision: "deny", message: "blocked"}`, the corresponding tool-use must NOT execute and the message must appear in session log. | Hook receiver unit test (3 cases per decision). Session-module integration test: simulated PreToolUse `deny` → tool not invoked. |
| **SC-13** | Token-cost decision-rule documented + enforced. `agent-workspace/constitution/architecture.md` gains a "Decomposition Cost Model" section with the 1× / 4× / 15× multipliers (single / single+tools / multi-agent) and a quantitative rule the master-planner cites in its decomposition decision. master-planner.md skill embeds the rule. | Read of architecture.md shows the section. Spawn a master-planner with a synthetic 3-task brief; observe its returned plan cites the rule. |
| **SC-14** | All v1.0.1 backlog items absorbed: (a) `inject-hooks.ts` JSDoc step ordering corrected to `validate→backup→atomic`. (b) `claude-code-adapter.integration.spec.ts` either passes or is gated in CI with documented skip-condition. (c) `docs/quickstart.md` populated with ≥150-line walkthrough mirroring README. (d) N6 (72h memory leak) verification protocol documented + a 4h sample run executed; RSS delta < 50 MB recorded. (e) `phase-3-complete.md:90` decision-009 title typo fixed. (f) `tests-baseline.json` emitted per phase + cited by phase-N-complete.md. | `pnpm test` (root) green; `cat docs/quickstart.md | wc -l ≥ 150`; `cat agent-workspace/memory/n6-rss-sample.md` exists; `grep cache_read_input_tokens agent-workspace/memory/phase-3-complete.md` returns 0. |
| **SC-15** | Subagent failure-rate index exists. `scripts/utilities/build-subagent-index.sh` parses `.session-hooks.log` for SubagentStop events and writes `agent-workspace/memory/subagent-index.md` (table: agentId → start → return → verdict_class). master-planner reads it and adjusts model/agent routing in plan generation. | Script runs in <30s, output file ≥50 rows after Phase 5.5. |
| **SC-16** | Full monorepo test suite passes deterministically across 3 consecutive `pnpm test` (root) runs at Phase 5 close. Test count ≥ 1,375 (the v1.0 baseline) plus net additions from 5.1–5.4 work; final number recorded in `tests-baseline.json` for Phase 5. | 3-run loop in CI; all green. |
| **SC-17** | Charter exit scorecard updated. `agent-workspace/memory/phase-5-complete.md` enumerates SC-1..SC-17 with PASS/PARTIAL/DEFER and budget actuals vs estimates. Phase 5 retrospective written. | File exists; all 17 rows have status. |
| **SC-18** | Decomposition strategy is empirically tested. Master-planner v2 produces a parallel-vs-serial DAG for at least one synthetic Phase-5-shaped brief, AND the resulting dispatch shows wallclock improvement over a forced-serial reference run. Time-to-completion delta ≥ 20% on the test brief. | `scripts/benchmarks/parallel-vs-serial.spec.ts` records both runs, asserts ≥20% wallclock improvement on the multi-task fixture. |

**Headline metric (charter §3 mandate)**: Phase 5 is the first phase that deliberately measures *time*. Through Phases 0-4, time was the single dimension we did not improve. SC-18 makes "time" first-class. SC-6 + SC-15 give the measurement substrate.

---

## 2. Substage Decomposition

Five execution substages plus 5.0 (already done as Research & Self-Audit) and a 5.5 close.

### 5.0 — Research & Self-Audit (DONE)
Produced this kickoff's 4 inputs (meta-retro + 3 research notes). No further work.

### 5.1 — Loop-Resilience Hardening
**Theme**: kill the three named failure modes (A/B/C) so Phase 5+ cannot stall on the same root causes Phases 1-4 hit. Closes meta-retro proposals #1, #2, #3, #8 and tracking gaps G-1, G-2, G-7, G-8.

**Deliverables**: 6 modified hook scripts, 1 new lint script, 4 vitest files, 2 doc updates, 1 G-1 sentinel-write change to `/session-end`.

### 5.2 — Skill Self-Evolution Framework
**Theme**: every skill becomes testable; oversized skills are refactored; a CI validator enforces structure; telemetry captures effectiveness. Closes meta-retro proposals #4, #5, #9, #10 + claudekit-skills BORROW items 1-4 + claudekit-docs ideas #1-#3.

**Deliverables**: 14 skill `.test.md` siblings, 6 progressive-disclosure refactors, 1 TS validator (`scripts/skills-validate.ts`), 1 telemetry schema + writer, 1 `tests-baseline.json` machinery, 1 phase-N-complete generator update.

### 5.3 — Parallelization Framework (v2.0 spine)
**Theme**: introduce real concurrency to the daemon. Closes claude-code-learn P0+P1+P2 items, the charter §3 explicit ask, and SC-18.

**Deliverables**: 1 Prisma migration, 1 atomic-claim service, 1 max_concurrent_sessions config + dispatcher, 1 worker_mailbox table + service, 1 `--resume` adapter wiring, 1 env-var audit, 1 hook decision-field fix, 1 architecture.md cost-model section, 1 master-planner v2 update, 1 wallclock benchmark.

### 5.4 — v1.0.1 Backlog Absorption
**Theme**: clear residual debt from v1.0 ship while we have momentum. Closes user prompt §5 and SC-14.

**Deliverables**: 6 small fixes (JSDoc, CI gating, quickstart, N6, typo, tests-baseline single-source).

### 5.5 — Verification & Release
**Theme**: prove SC-1..SC-18, run the parallel-vs-serial benchmark, write phase-5-complete + retrospective, stage v2.0.0 release artifacts (no commit; user authorizes per I-6 charter rule).

**Deliverables**: phase-5-complete.md, retrospective, charter scorecard update, deterministic 3× root run, benchmark file.

---

## 3. Per-Task Tables

> Convention: `task_id` follows `5.<substage>.<index>` (lowercase letter for narrow-fix). `agent` cites the `.claude/agents/<name>.md` file. `model` is sonnet unless explicitly opus. `parallel_with` = sibling tasks safe to dispatch in the same wallclock turn (no shared file edits, no shared schema migrations). `success_check` = the deterministic gate run at task close.

### 5.1 — Loop-Resilience Hardening (8 tasks · ~440K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 5.1.1 | Architect Phase 5.1 (read meta-retro §5; produce per-task signatures + acceptance harness for Mode A/B/C lints) | PLAN | opus | sandwich-architect | 70K | — | — | `agent-workspace/session-plans/pending/phase-5-self-evolution.md` (this file) is the input; output: `agent-workspace/session-plans/pending/5.1-loop-resilience-architect.md` | architect doc lists exact files-to-modify + assertions per lint |
| 5.1.2 | Tool-call-first lint (Mode A) | FOCUSED_IMPL | sonnet | task-implementer | 90K | 5.1.1 | 5.1.3 | `scripts/hooks/tool-call-first-lint.sh` (NEW) + wired into `.claude/hooks/profiles/strict.md` Stop block | new vitest `tests/hooks/tool-call-first.spec.ts` 6/6 PASS |
| 5.1.3 | API-truncation auto-recovery (Mode B) — Stop-hook side effect | FOCUSED_IMPL | sonnet | task-implementer | 90K | 5.1.1 | 5.1.2 | `scripts/hooks/autonomous-stop-watchdog.sh` (extend) + `.api-truncation-recovery-fired-<id>` marker contract | replay test in `tests/hooks/api-truncation.spec.ts` 3/3 PASS, idempotency held |
| 5.1.4 | Premature-wind-down hard guard (Mode C) | FOCUSED_IMPL | sonnet | task-implementer | 80K | 5.1.1 | — (touches budget-watchdog.sh; serialized after 5.1.3 to avoid hook-script merge conflict) | `scripts/hooks/budget-watchdog.sh` (extend) — add transcript phrase scan + `additionalContexts` rejection | 3 synthetic transcripts → 3 rejections; 3 baseline → 0 false-positives |
| 5.1.5 | Watchdog narration-hit grep refinement (Mode A negative training) | FOCUSED_IMPL | sonnet | task-implementer | 60K | 5.1.4 | 5.1.6, 5.1.7 | `scripts/hooks/autonomous-stop-watchdog.sh` — refined grep requires (verb pattern AND no tool_use block) | replay over `.autonomous-api-error-alert.log`'s 33 historical entries: ≤3 false-positive (vs 33 today) |
| 5.1.6 | G-1: escalation.md sentinel discipline | FOCUSED_IMPL | sonnet | task-implementer | 50K | 5.1.4 | 5.1.5, 5.1.7 | `.claude/commands/session-end.md` (extend) + `agent-workspace/memory/escalation.md` (sentinel write contract) | running `/session-end` produces escalation.md `status: NONE` if no STOP-1..5 hit |
| 5.1.7 | G-8: subagent-failure index builder | FOCUSED_IMPL | sonnet | task-implementer | 60K | 5.1.4 | 5.1.5, 5.1.6 | `scripts/utilities/build-subagent-index.sh` (NEW) → `agent-workspace/memory/subagent-index.md` | script runs in <30s; output ≥50 rows when fed Phase 0-4 session-hooks log |
| 5.1.8 | 5.1 verification (run lints adversarially against captured Phase 1-4 transcripts) | VERIFY | opus | sandwich-verifier | 50K | 5.1.2 .. 5.1.7 | — | session log + verdict appended to budget-tracker.md | verifier returns APPROVED or APPROVED_AFTER_FIX (max 1 narrow-fix) |

### 5.2 — Skill Self-Evolution Framework (10 tasks · ~830K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 5.2.1 | Architect Phase 5.2 (skill validator schema; refactor strategy; telemetry schema) | PLAN | opus | sandwich-architect | 70K | 5.1.8 | — | `agent-workspace/session-plans/pending/5.2-skill-evolution-architect.md` | doc enumerates skill validator zod schema + refactor mapping table |
| 5.2.2 | Skill validator (TS port of quick_validate.py) | FOCUSED_IMPL | sonnet | task-implementer | 80K | 5.2.1 | 5.2.3, 5.2.4 | `scripts/skills-validate.ts` + `tests/scripts/skills-validate.spec.ts` | `pnpm skills:validate` exits 0 across 14 skills; vitest 5/5 PASS |
| 5.2.3 | Telemetry writer + schema (component-telemetry.jsonl) | FOCUSED_IMPL | sonnet | task-implementer | 100K | 5.2.1 | 5.2.2, 5.2.4 | `scripts/hooks/component-telemetry.sh` (NEW) + zod schema in `packages/core/src/telemetry/component-telemetry.schema.ts` + integration in PostToolUse / SubagentStop | telemetry vitest 6/6 PASS; live JSONL appended after a sample dispatch |
| 5.2.4 | tests-baseline.json + phase-N-complete.md generator (G-6 closer) | FOCUSED_IMPL | sonnet | task-implementer | 70K | 5.2.1 | 5.2.2, 5.2.3 | `scripts/utilities/emit-tests-baseline.ts` + template tag in phase-N-complete generator | running on Phase 4 reproduces 1,375 inline; phase-3-complete typo (decision 009) fixed inline |
| 5.2.5 | Refactor SKILL.md set #1: otel-tracing, prisma-sqlite, profile-yaml | FOCUSED_IMPL | sonnet | task-implementer | 130K | 5.2.2, 5.2.3 | 5.2.6 | 3× `references/<topic>.md` files per skill; SKILL.md trimmed ≤150 lines | `pnpm skills:validate` PASS; line counts checked |
| 5.2.6 | Refactor SKILL.md set #2: grammy-bot, nestjs-module, claude-code-hooks | FOCUSED_IMPL | sonnet | task-implementer | 130K | 5.2.2, 5.2.3 | 5.2.5 | 3× refactor (mirror set #1) | `pnpm skills:validate` PASS; line counts checked |
| 5.2.7 | `allowed-tools` frontmatter for all 14 skills | FOCUSED_IMPL | sonnet | task-implementer | 70K | 5.2.5, 5.2.6 | 5.2.8 | 14× SKILL.md frontmatter edits | grep `allowed-tools:` → 14 hits; validator updated to require it |
| 5.2.8 | Skill self-test discipline — write `<name>.test.md` for all 14 skills | MULTI_TASK_IMPL | sonnet | task-implementer (one task per skill, fresh context per dispatch) | 180K | 5.2.5, 5.2.6 | 5.2.7 | 14× sibling `.test.md` files | each test file declares trigger + expected + named failure modes + ≥3 assertions; validator PASS |
| 5.2.9 | spec-compliance review of 5.2 deliverables | VERIFY | sonnet | spec-compliance-reviewer | 50K | 5.2.2..5.2.8 | — | review note in budget-tracker | PASS or APPROVED_AFTER_FIX |
| 5.2.10 | adversarial verifier — fresh context | VERIFY | opus | sandwich-verifier | 50K | 5.2.9 | — | session log | APPROVED |

### 5.3 — Parallelization Framework (12 tasks · ~1,420K tokens)

> The single largest substage. Carries the bulk of v2.0's product weight. Schema migration (5.3.2) is the critical-path serialization point — many tasks depend on `claimed_by` column existing.

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 5.3.1 | Architect Phase 5.3 (DAG, Prisma migration, mailbox schema, adapter env audit, hook decision-field contract, cost model wording) | PLAN | opus | sandwich-architect | 90K | 5.2.10 | — | `agent-workspace/session-plans/pending/5.3-parallel-architect.md` | doc enumerates per-task signatures + 12-row dispatch DAG |
| 5.3.2 | Prisma migration: add `claimed_by`, `claim_expires_at` to QueueItem | FOCUSED_IMPL | sonnet | task-implementer | 80K | 5.3.1 | — (BLOCKING — schema migration serializes everyone after) | `packages/core/prisma/migrations/<ts>_queue_claim/` + `schema.prisma` edits | `pnpm prisma migrate` clean; existing 1,002 core tests still PASS |
| 5.3.3 | Atomic claim service `QueueClaimService.claim(workerId, itemId)` | FOCUSED_IMPL | sonnet | task-implementer | 100K | 5.3.2 | 5.3.4, 5.3.5 | `packages/core/src/queue/queue-claim.service.ts` + spec | contention test: 4 concurrent → 1 success / 3 fail; no exception |
| 5.3.4 | Worker mailbox table + service | FOCUSED_IMPL | sonnet | task-implementer | 130K | 5.3.2 | 5.3.3, 5.3.5 | `packages/core/prisma/migrations/<ts>_worker_mailbox/` + `MailboxService` | mailbox spec 8/8 PASS; daemon-dumb grep clean |
| 5.3.5 | Hook `decision: approve\|deny\|modify` parsing in hooks-receiver | FOCUSED_IMPL | sonnet | task-implementer | 100K | 5.3.1 | 5.3.3, 5.3.4 (different module) | `packages/core/src/hooks/hooks-receiver.service.ts` + `HookDecision` enum + integration | hook decision spec 9/9 PASS (3 approve, 3 deny, 3 modify); session module gates correctly |
| 5.3.6 | Adapter env-var propagation audit | FOCUSED_IMPL | sonnet | task-implementer | 70K | 5.3.1 | 5.3.7 | `packages/core/src/adapters/claude-code.adapter.ts` env-build extension + spec | adapter spec asserts all 8 vars present in spawned env |
| 5.3.7 | Adapter `--resume <session_id>` wiring | FOCUSED_IMPL | sonnet | task-implementer | 80K | 5.3.6 | — (touches same adapter file as 5.3.6 — serialize) | adapter `spawn()` argv extension + spec | resume-true / resume-false unit tests both PASS |
| 5.3.8 | `max_concurrent_sessions` profile field + dispatcher loop | FOCUSED_IMPL | sonnet | task-implementer | 130K | 5.3.3 | 5.3.4 | `packages/profile/src/profile.schema.ts` + `packages/core/src/dispatch/dispatcher.service.ts` | 2-project integration test: 4 items / N=2 / asserts ≤2 ACTIVE |
| 5.3.9 | architecture.md decomposition cost model + master-planner v2 update | FOCUSED_IMPL | sonnet | task-implementer | 70K | 5.3.3 | 5.3.4, 5.3.5, 5.3.6, 5.3.7 | `agent-workspace/constitution/architecture.md` (new section) + `.claude/agents/master-planner.md` (cite the rule) | new section >40 lines; master-planner agent file diff shows the cite |
| 5.3.10 | Parallel-vs-serial benchmark | FOCUSED_IMPL | sonnet | task-implementer | 100K | 5.3.3, 5.3.4, 5.3.8 | — | `scripts/benchmarks/parallel-vs-serial.spec.ts` + `agent-workspace/memory/parallel-benchmark-result.md` | recorded delta ≥ 20% on a multi-task fixture |
| 5.3.11 | spec-compliance review of 5.3 set | VERIFY | sonnet | spec-compliance-reviewer | 60K | 5.3.2..5.3.10 | — | budget-tracker note | PASS |
| 5.3.12 | adversarial verifier — fresh context, full root `pnpm test` | VERIFY | opus | sandwich-verifier | 90K | 5.3.11 | — | session log + verdict | APPROVED; root suite green; deterministic 2× re-run |

### 5.4 — v1.0.1 Backlog Absorption (8 tasks · ~470K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 5.4.1 | Architect Phase 5.4 (just enumerate per-task scope; tiny) | PLAN | sonnet | sandwich-architect | 30K | 5.3.12 | — | `agent-workspace/session-plans/pending/5.4-backlog-architect.md` | doc lists 6 tasks with file paths |
| 5.4.2 | inject-hooks.ts JSDoc step ordering fix | FOCUSED_IMPL | sonnet | task-implementer | 40K | 5.4.1 | 5.4.3, 5.4.4, 5.4.5, 5.4.6, 5.4.7 | `packages/cli/src/utils/inject-hooks.ts` JSDoc edit | grep confirms `validate→backup→atomic`; tests still PASS |
| 5.4.3 | ccs-spawn integration test CI gating | FOCUSED_IMPL | sonnet | task-implementer | 80K | 5.4.1 | 5.4.2, 5.4.4, 5.4.5, 5.4.6, 5.4.7 | `.github/workflows/ci.yml` skip-condition + spec docstring | CI yml validates; documented skip reason |
| 5.4.4 | docs/quickstart.md (≥150 lines) | FOCUSED_IMPL | sonnet | task-implementer | 100K | 5.4.1 | 5.4.2, 5.4.3, 5.4.5, 5.4.6, 5.4.7 | `docs/quickstart.md` populated | wc -l ≥ 150; sample bash commands run clean against fresh checkout |
| 5.4.5 | N6 protocol + 4h sample run | FOCUSED_IMPL | sonnet | task-implementer | 80K | 5.4.1 | 5.4.2, 5.4.3, 5.4.4, 5.4.6, 5.4.7 | `agent-workspace/memory/n6-rss-sample.md` + `scripts/utilities/measure-rss.sh` | 4h sample logs RSS delta < 50 MB |
| 5.4.6 | phase-3-complete.md decision-009 typo fix + tests-baseline.json single-source | FOCUSED_IMPL | sonnet | task-implementer | 50K | 5.4.1, 5.2.4 | 5.4.2, 5.4.3, 5.4.4, 5.4.5, 5.4.7 | `agent-workspace/memory/phase-3-complete.md:90` edit + back-port tests-baseline citation | grep `cache_read_input_tokens` → 0 hits; phase-N-complete files all cite tests-baseline |
| 5.4.7 | G-3 backfill: phase-0-complete.md retrospective enhancements | FOCUSED_IMPL | sonnet | task-implementer | 40K | 5.4.1 | 5.4.2..5.4.6 | `agent-workspace/memory/phase-0-complete.md` extend with research-artifact list + D1-D15 + 1-line citation per ref repo | wc -l increased ≥30 |
| 5.4.8 | spec-compliance + verifier sweep for 5.4 | VERIFY | sonnet → opus | spec-compliance-reviewer then sandwich-verifier | 50K | 5.4.2..5.4.7 | — | budget-tracker note | both PASS |

### 5.5 — Verification & Release (4 tasks · ~250K tokens)

| task_id | title | session_type | model | agent | budget | depends_on | parallel_with | deliverable_path | success_check |
|---|---|---|---|---|---|---|---|---|---|
| 5.5.1 | Final root `pnpm test` × 3 deterministic | VERIFY | sonnet | sandwich-dev | 60K | 5.4.8 | — | budget-tracker entry | 3 consecutive green runs; counts equal each run |
| 5.5.2 | SC-1..SC-18 scorecard | VERIFY | opus | sandwich-verifier | 80K | 5.5.1 | — | `agent-workspace/memory/phase-5-complete.md` | every SC has PASS/PARTIAL/DEFER + evidence path |
| 5.5.3 | Phase 5 retrospective | PLAN-LIKE | opus | sandwich-architect (acting as retrospective writer) | 70K | 5.5.2 | — | `agent-workspace/memory/phase-5-complete.md` (extends 5.5.2 doc with retro section) | retro covers what worked, what didn't, time-as-dimension result, next-phase candidates |
| 5.5.4 | Stage v2.0.0 artifacts (NO COMMIT — I-6) | FOCUSED_IMPL | sonnet | sandwich-dev | 40K | 5.5.3 | — | staged release notes draft + CHANGELOG entry, version bump in `package.json` files | `git status` shows staged changes; no `git commit` invoked; user-action checklist in `current-execution.md` updated |

---

## 4. Parallel-vs-Serial Dispatch Graph

> Charter §3 explicitly requires parallelization to be first-class. Phase 5 master-planner makes the DAG explicit per substage. Phase 5 itself runs single-main-session (per claude-code-learn open-question §7 recommendation: "Pick (a) for v2.0 minimum"), but within each session we maximize SUBAGENT-level parallelism via `run_in_background:true`.

### Substage 5.1 DAG

```
5.1.1 (PLAN, opus)
   |
   +--> 5.1.2 (Mode A lint)        ─┐
   +--> 5.1.3 (Mode B recovery)    ─┤  PARALLEL — different scripts/files
                                    │
   (5.1.2, 5.1.3 finish)            │
            v                       v
   5.1.4 (Mode C guard) — SERIAL after 5.1.3 (both edit hook scripts; merge risk)
            |
            +--> 5.1.5 (grep refinement)   ─┐
            +--> 5.1.6 (G-1 sentinel)      ─┤  PARALLEL — different files
            +--> 5.1.7 (G-8 index builder) ─┘
                       v
            5.1.8 (VERIFY, opus, fresh context)
```

**Wallclock**: PLAN (1) → IMPL pair (1 turn, 2 bg dispatches) → IMPL serial (1 turn) → IMPL triple (1 turn, 3 bg dispatches) → VERIFY (1 turn). 5 main-session turns vs 8 if forced-serial. **Time saving: ~3 turns.**

### Substage 5.2 DAG

```
5.2.1 (PLAN, opus)
   |
   +--> 5.2.2 (validator)    ─┐
   +--> 5.2.3 (telemetry)    ─┤  PARALLEL — independent files
   +--> 5.2.4 (tests-baseline)─┘
                v (all 3 done)
   +--> 5.2.5 (refactor #1: otel/prisma/profile)  ─┐
   +--> 5.2.6 (refactor #2: grammy/nest/hooks)    ─┘  PARALLEL — disjoint skill dirs
                v
   5.2.7 (allowed-tools, all 14)  — SERIAL after refactor (touches same SKILL.md files refactored)
                |
                v
   5.2.8 (skill .test.md, MULTI_TASK_IMPL, 14 fresh-context dispatches in 4 batches of ~3-4)
                |
                v
   5.2.9 (spec-compliance) → 5.2.10 (verifier opus)
```

**Wallclock**: PLAN (1) → IMPL triple (1) → IMPL pair (1) → IMPL serial (1) → MULTI_TASK_IMPL batched (4) → 2× VERIFY (2). 10 turns vs 16 forced-serial. **Time saving: ~6 turns.**

### Substage 5.3 DAG

```
5.3.1 (PLAN, opus, larger budget — DAG production is itself work)
   |
   v
5.3.2 (Prisma migration) — BLOCKING SERIAL (everyone after needs the columns)
   |
   +--> 5.3.3 (claim service)          ─┐
   +--> 5.3.4 (mailbox)                ─┤  PARALLEL — disjoint domain modules
   +--> 5.3.5 (hook decision parsing)  ─┘  (uses queue table indirectly, but no schema overlap)
                v (all 3 done)
   5.3.6 (env audit, adapter file)
        |
        v
   5.3.7 (--resume, same adapter file) — SERIAL after 5.3.6
                |
                +--> 5.3.8 (dispatcher max_concurrent)  ─┐  needs 5.3.3 only
                +--> 5.3.9 (architecture.md cost model) ─┤  PARALLEL with 5.3.8
                +--> 5.3.10 (benchmark)                ─┘  needs 5.3.3 + 5.3.4 + 5.3.8 — actually serialize after 5.3.8
                       v
                5.3.11 (spec-compliance) → 5.3.12 (verifier opus + root pnpm test)
```

Refined: 5.3.10 must serialize after 5.3.8. So:
- Turn 1: PLAN
- Turn 2: 5.3.2 (BLOCKING serial)
- Turn 3: 5.3.3 || 5.3.4 || 5.3.5 (3 parallel)
- Turn 4: 5.3.6 (serial)
- Turn 5: 5.3.7 || 5.3.9 (parallel — different files)
- Turn 6: 5.3.8 (needs 5.3.3 done, but also serializes against 5.3.7's adapter edits — actually 5.3.8 touches dispatcher.service.ts not adapter, so 5.3.8 can run parallel to 5.3.7)

Corrected DAG, Turn 5: 5.3.7 || 5.3.8 || 5.3.9 (3 parallel, all touch different files).
- Turn 6: 5.3.10 (needs 5.3.8)
- Turn 7-8: VERIFY pair

**Wallclock**: 8 turns vs 12 forced-serial. **Time saving: ~4 turns.**

### Substage 5.4 DAG

```
5.4.1 (PLAN, sonnet, small)
   |
   v
5.4.2 .. 5.4.7 (all 6 IMPL, FULLY PARALLEL — disjoint files, no shared state)
   |
   v
5.4.8 (VERIFY)
```

All six IMPL tasks dispatch in **one main-session turn** with 6 background subagents. **Wallclock: 3 turns vs 8 forced-serial. Time saving: ~5 turns** — the highest parallelism ratio of any substage.

### Substage 5.5 DAG

Pure linear:
```
5.5.1 → 5.5.2 → 5.5.3 → 5.5.4
```

No parallelism opportunities — each step consumes the previous output. 4 turns.

### Phase 5 total

- **Wallclock if maximally parallel within each substage**: ~30 main-session turns
- **Wallclock if forced-serial**: ~50 turns
- **Time saving**: ~40% wallclock improvement (charter §3 "*time was the unimproved dimension*" — Phase 5 directly attacks it).
- **SC-18 references this 40% as the empirical baseline** that the parallel-vs-serial benchmark must beat by ≥20% on its own synthetic fixture.

---

## 5. Self-Evolution Metrics Framework (Charter §2)

### Component model

Every Orch component is one of: `skill | agent | command | hook`. Each gets a row in a logical "component registry" enforced by `scripts/skills-validate.ts` (extended to cover all 4 types in 5.2.2).

### Per-component schema (zod, shared with telemetry)

```typescript
// packages/core/src/telemetry/component-telemetry.schema.ts
const ComponentEvent = z.object({
  ts: z.string().datetime(),
  component_type: z.enum(['skill','agent','command','hook']),
  component_name: z.string(),                    // kebab-case, matches dir or filename
  trigger: z.enum([
    'keyword_match','explicit_invoke','agent_dispatch',
    'hook_event','user_prompt','sched_idle',
  ]),
  outcome: z.enum(['ok','reject','timeout','error','no_op']),
  tokens_self: z.number().int().min(0).optional(),   // LLM-self-estimated (subagent-side)
  tokens_real: z.number().int().min(0).optional(),   // .transcript-tokens delta (main-side)
  duration_ms: z.number().int().min(0),
  session_id: z.string().nullable(),
  task_id: z.string().nullable(),                    // 5.x.y when in Phase 5
  decision: z.enum(['approve','deny','modify']).optional(),  // hooks only (SC-12)
  failure_mode: z.enum(['A','B','C','D','E','F','G']).nullable(),
});
```

### Per-component test contract (sibling `<name>.test.md`)

Required sections:

```markdown
# <component-name> self-test

## Trigger
<exact phrase / event / file pattern that activates>

## Expected behavior (PASS)
<≤5 lines describing what success looks like>

## Named failure modes
- Mode <X>: <description>
- Mode <Y>: <description>

## Metrics targets
- activation_count_per_session: <range>
- success_rate: <≥0.X>
- token_cost_p50: <≤NNNK>
- duration_ms_p50: <≤NNN>

## Assertions (≥3, machine-checkable)
1. <assertion>
2. <assertion>
3. <assertion>
```

### Storage

- **Live append**: `agent-workspace/memory/component-telemetry.jsonl` (zod-validated on read).
- **Periodic rollup**: `scripts/utilities/rollup-telemetry.ts` (run weekly via cron-like skill) → `agent-workspace/memory/component-rollup-<YYYY-WW>.md` with aggregate stats per component.
- **Phase-end snapshot**: phase-N-complete.md cites the rollup for that phase.

### Writer wiring

- `scripts/hooks/component-telemetry.sh` (NEW in 5.2.3) is invoked by the existing PostToolUse + SubagentStop + SessionStart hooks. It receives the hook payload, classifies the component being executed, computes deltas (`tokens_real` from `.transcript-tokens`), and appends one JSONL line.
- The hook is daemon-side **deterministic code** (shell). No LLM is called. This satisfies I-1.

### Feedback loop

1. **Manual review** at each phase end: master-planner reads the phase rollup AND the subagent-failure index (5.1.7 output) before producing the next phase's plan.
2. **Automated boundary**: master-planner v2 (5.3.9 update) embeds the decomposition cost model (§6 below) and uses telemetry-derived per-agent failure rates as a routing input. *No LLM call inside the daemon* — the daemon only reads the rollup file; the LLM that consumes it lives in the master-planner subagent context.
3. **Component pruning rule**: any component with `activation_count == 0` for 2 consecutive phases AND no critical-path role is flagged for pruning in the next phase plan.
4. **Component refactor rule**: any component with `success_rate < 0.85` over its rolling-30-activation window is flagged for refactor.

This framework is what charter §2 means by "self-loop-upgrade": the system measures its own components, the master-planner reads those measurements, and Phase 6+ plans incorporate the data.

---

## 6. Decomposition Strategy (Charter §3) — quantitative rule

The master-planner's choice between horizontal (parallel siblings) and vertical (sequential pipeline) decomposition uses the **token-cost multiplier model** from claudekit-docs (Theme 1 in claudekit-skills research):

| Pattern | Token cost multiplier | When to choose |
|---|---|---|
| Single direct execution | **1×** | 1 task, fully understood, ≤30K | 
| Single + tools (research-first / validator scripts) | **4×** | 1 task, requires ≤2 tool round-trips |
| Multi-agent (subagent dispatch) | **15×** | ≥2 independent tasks **AND** isolation value > 11× cost overhead |

### The quantitative gate (master-planner cite this verbatim, embedded in 5.3.9)

```
PARALLELIZE = (
  num_independent_subtasks >= 2
  AND
  estimated_isolation_value_tokens >= 11 * single_task_baseline_tokens
  AND
  no_shared_file_writes
  AND
  no_shared_schema_migration
)
```

`estimated_isolation_value_tokens` = the tokens the main session would otherwise consume to context-switch between the subtasks (typically 8-15K per switch over 3+ subtasks). Below 2 subtasks the math never closes; above 5 subtasks isolation almost always wins.

### Horizontal vs vertical decision

- **Horizontal** (parallel siblings, same level of abstraction): when the gate above passes.
- **Vertical** (sequential pipeline, each step transforms the previous output): when the gate fails OR when later steps depend on earlier outputs.

### Worked example (Phase 5 itself)

- Substage 5.4 has 6 disjoint IMPL tasks, no shared files: gate PASSES → horizontal (1 turn, 6 parallel subagents).
- Substage 5.3 has the Prisma migration as a hard prerequisite: gate FAILS for that step → vertical (5.3.2 alone) THEN horizontal (5.3.3 || 5.3.4 || 5.3.5).

This rule is documented in `agent-workspace/constitution/architecture.md` (new "Decomposition Cost Model" section, deliverable 5.3.9) and cited by `.claude/agents/master-planner.md` (also 5.3.9).

---

## 7. Budget & Schedule

### Per-substage budget envelope

| Substage | Sessions | Estimated tokens | Rationale |
|---|---:|---:|---|
| 5.0 | 4 (DONE) | 65K (actuals) | 4 bg agents already returned |
| 5.1 | 4 | 440K | 1 PLAN + 6 small IMPL + 1 VERIFY |
| 5.2 | 6 | 830K | 1 PLAN + 7 IMPL (3 are larger refactor sets) + 2 VERIFY; MULTI_TASK_IMPL 5.2.8 is the biggest single line item |
| 5.3 | 8 | 1,420K | 1 PLAN + 9 IMPL + 2 VERIFY; the migration + dispatcher work alone is ~700K |
| 5.4 | 3 | 470K | 1 PLAN + 6 small IMPL (all parallel in 1 turn) + 1 VERIFY |
| 5.5 | 3 | 250K | linear close-out |
| **Total** | **28** | **~3,475K** | within charter daily-cap of 5M/day; spread over 4 calendar days = ~870K/day average |

**Buffer for narrow-fixes, RECOVERY sessions, unforeseen contention**: +~925K (~27%) → headline budget **~4.4M tokens** total.

### Calendar estimate

- 28 main-session turns × ~8 min/turn (steady-state observed Phase 4) = **3.7 hours of active wallclock**.
- Plus auto-reboots, hook fires, subagent runtimes (which are concurrent with each other but the main session waits for them) = ~**4 calendar days** under the same daily-cap-bounded autonomous regime as Phases 1-4.
- The 4-day estimate is comparable to Phase 3 (the longest phase by calendar) and shorter than Phases 1+2 combined.

### Daily cap compliance

- Charter N-2 daily cap: **5M tokens/day**.
- Phase 5 average: ~1.1M/day across 4 days. Well under.
- Worst single-day projection (Substage 5.3 dense run): ~1.5M. Still under.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Mode B recurrence during 5.2 or 5.3** (the 7h Phase-2 cluster's root cause may still be live in Anthropic's API) | MEDIUM | HIGH (1-2h stall per occurrence) | 5.1.3 ships the auto-recovery FIRST — every later substage benefits. If 5.1.3 itself triggers a Mode B (chicken-and-egg), the manual `agent-notes.md:120-130` recovery protocol still works. |
| **Mode C recurrence on a long IMPL chain in 5.3** | LOW (post-fix in 5.1.4) | HIGH | 5.1.4 ships before 5.3 starts. Validation against captured H-25 transcript in 5.1.8. |
| **Prisma migration breaks existing 1,002 core tests** | MEDIUM | HIGH | 5.3.2 is its own task; 5.3.12 verifier runs full root suite and 3× deterministic re-run. Rollback plan: revert migration commit + regenerate client. |
| **5.3.4 mailbox table conflicts with another concurrent migration** | LOW | MEDIUM | 5.3 substage architect (5.3.1) ensures only ONE migration filename per task; serialize migrations even if logical work is parallel. |
| **5.3.5 hook decision-field change breaks hooks-receiver downstream consumers** | MEDIUM | MEDIUM | hooks-receiver tests cover all 3 decision values; new enum is additive (existing approve-only path keeps default). |
| **Component telemetry over-fires and bloats memory** | MEDIUM | LOW | Append-only JSONL with monthly rollup + truncation. Watchdog adds a 10MB soft cap per file with rotation. |
| **`max_concurrent_sessions: 2` runs into ccs single-flight limit** (ccs may serialize at the auth layer regardless) | MEDIUM | MEDIUM | 5.3.8 starts with N=2 across DIFFERENT projects (ccs serializes per-account, not per-project). If contention is observed, document as a known limitation; v2.1 worktree story addresses same-project parallelism. |
| **claudekit-skills MIT pattern misinterpretation** (we borrow ideas not files) | LOW | LOW | Borrow patterns documented per task; no `_research_clones/claudekit-skills/` files are copied verbatim. Validator script written from scratch in TS. |
| **claude-code-learn IP boundary violation** (we MUST NOT copy code) | LOW | HIGH (legal) | 5.3 architect (5.3.1) reviews each task signature for any verbatim TypeScript from `_research_clones/claude-code-learn`. Reviewer (5.3.11) does same check. |
| **Phase 5 budget overruns 4.4M** | MEDIUM | LOW | 27% buffer baked in. If actually overrun, split substage 5.3 into 5.3-A and 5.3-B at the natural boundary (after 5.3.7). |
| **Time benchmark (SC-18) does not show ≥20%** | MEDIUM | MEDIUM | Benchmark fixture is synthetic; if delta is < 20% the fix is to make the fixture more parallelism-friendly (more disjoint tasks). Document the actual delta. SC-18 is verified empirically; if it fails, defer to 5.5 retro and re-plan in phase 6. |
| **G-7 current-execution.md drift compounds** (file mutated again mid-phase) | MEDIUM | LOW | Phase 5.5 includes a footer-pattern fix (per meta-retro open Q5) so future kickoffs preserve previous state by reference. |
| **Self-track inflation > 1.35× on long IMPL chains** (open Q10) | LOW | MEDIUM | meta-retro proposal #3 + 5.1.4's hard-guard check the real-transcript file directly. Self-track is bookkeeping only. |
| **Master-planner v2 (5.3.9) over-decomposes** (15× cost path on simple tasks) | MEDIUM | MEDIUM | The cost rule has hard 11× threshold. Audit master-planner outputs in 5.5.2 scorecard. |

---

## 9. Phase 5 Stop Conditions

### DONE

Phase 5 is DONE when **all 18 success criteria** (SC-1..SC-18) are PASS or PARTIAL with documented deferral. Triggers:

- 5.5.2 verifier writes phase-5-complete.md scorecard with all rows status-set.
- 5.5.3 retrospective complete.
- 5.5.4 staged (NOT committed; user authorizes commit per I-6).

### ESCALATE (write `agent-workspace/memory/escalation.md`)

Phase 5 escalates and stops if **any** of:

1. **STOP-1** — Deterministic gate fails 3× in a row on the same task (per autonomous-protocol).
2. **STOP-2** — Irrecoverable environment error (e.g., SQLite lock that cannot be cleared, ccs auth failure for all configured accounts).
3. **STOP-3** — Charter ambiguity: a Phase 5 task would require directly contradicting Charter principles (daemon-dumb, project-agnostic, CLI-subprocess) with no compliant alternative.
4. **STOP-4** — Phase 5 budget exceeds **5.5M tokens** (25% over headline) AND no further parallelization is available — escalate for user re-planning.
5. **STOP-5** — Mode B or Mode C recurs **after** 5.1.3 + 5.1.4 ship — implies the lints themselves are broken; escalate to user for diagnosis (do not just patch and retry).

In every case, **write the escalation**: `agent-workspace/memory/escalation.md` MUST contain the trigger, evidence paths, last-attempted-fix, and a specific question for the user. The 5.1.6 sentinel discipline (G-1 closer) ensures the file is always either present-with-content or present-as-`status: NONE`.

---

## 10. Open Questions (deferred to substage architects)

These cannot be resolved at master-plan time without IMPL-level discovery. Each is delegated to the named substage architect.

1. **(5.1 architect)** Should the Mode-B auto-recovery use the existing continue-injector.ps1 OR spawn a fresh `session-self-reboot.ps1`? Trade-off: continue-injector preserves session state (cheaper); reboot guarantees fresh budget (safer if the session was already past 200K when the API truncated). Recommendation default: **continue-injector first; if `.transcript-tokens` already > 200K, escalate to reboot.** Architect to validate.

2. **(5.2 architect)** Should `<name>.test.md` files live ALONGSIDE SKILL.md (in same dir) or in a separate `.claude/skills-tests/` tree? Recommendation default: **alongside** (consistent with claudekit-skills convention). Architect to validate that ck-style validators don't choke on multiple .md per skill dir.

3. **(5.2 architect)** Is the 200-char description limit a hard error or a warning in `skills-validate.ts`? Currently 3 Orch skills exceed it (subagent-driven-development 258, claude-code-hooks 247, confusion-protocol 222). Recommendation default: **warning for v2.0, hard-error for v2.1** (so we can ship while refactor backlog drains).

4. **(5.3 architect)** Where does `claim_expires_at` get reaped? A cron-like `QueueClaimReaper` service? An on-claim sweep? Recommendation default: **on-claim sweep** (deterministic, no scheduler needed); cron alternative is v2.1.

5. **(5.3 architect)** Does `worker_mailbox` need TTL / pruning, or is append-only acceptable for v2.0? Recommendation default: **append-only with explicit `archive_before_ts` admin command** (no auto-prune in v2.0).

6. **(5.3 architect)** For SC-12 hook `decision: deny` path — does the rejected tool-use need to surface to telemetry as a separate failure mode (Mode H?), or does existing Mode-A..G suffice? Recommendation default: **add Mode H — hook_denied** with telemetry classification.

7. **(5.3 architect)** Master-planner v2: should the cost-model rule live in `architecture.md` (canonical, immutable) OR in `master-planner.md` (per-agent prompt, can drift)? Recommendation default: **architecture.md is the source; master-planner.md cites it** — single source of truth.

8. **(5.4 architect)** N6 sample: 4-hour vs 72-hour. Charter mandates 72h. Recommendation default: **document the 72h protocol; run a 4h sample in 5.4.5 + a TODO note for the user to run the full 72h post-Phase-5 before v2.0 GA**. Mark SC-14 as PARTIAL until 72h confirms.

9. **(5.5 architect)** Is the parallel-vs-serial benchmark a unit test (vitest) or a separate npm script? Recommendation default: **vitest, ran in `pnpm test`** so deterministic and CI-gated.

10. **(5.5 architect)** Phase 6 candidates list — should it ship at the bottom of phase-5-complete.md, or a separate `phase-6-candidates.md`? Recommendation default: **bottom of phase-5-complete.md** (single retrospective doc per phase).

---

## Appendix A — Subagent Dispatch Hygiene (Phase 5 binding rules)

These bind every IMPL session in Phase 5. Violations stop the session.

1. **All Agent dispatches MUST use `run_in_background: true`** (charter rule + MEMORY.md feedback_agent_dispatch).
2. **Tool-call-first ordering**: every present-progressive verb in autonomous-mode text MUST be paired with the actual tool call in the same response. The 5.1.2 lint enforces this from substage 5.2 onward — but discipline applies in 5.1 too (manual until lint ships).
3. **Real-transcript check before any "budget"-rationalized stop**: read `agent-workspace/memory/.transcript-tokens` AND `ls agent-workspace/memory/.wind-down 2>/dev/null` before ending a turn citing budget pressure. Ending allowed only if real ≥ 200K OR `.wind-down` marker exists OR a true STOP-1..STOP-5 condition triggered.
4. **Spec-compliance gate before code-quality gate**: per charter subagent flow. Phase 5 has 4 dedicated VERIFY tasks (5.1.8, 5.2.9, 5.2.10, 5.3.11, 5.3.12, 5.4.8, 5.5.2) — none can be skipped.
5. **No `git commit` unless user explicitly asks** — I-6. 5.5.4 stages only; commit awaits user.
6. **Daemon-dumb invariant grep** — `grep -rn "anthropic\|openai\|@anthropic-ai/sdk\|@anthropic-ai/claude-agent-sdk" packages/core/src/` MUST return zero non-adapter hits at every VERIFY checkpoint.
7. **Session log written atomically by IMPL agent** (per meta-retro proposal #6) — every task-implementer / sandwich-dev MUST write `agent-workspace/memory/sessions/<date>-task-<id>.md` with files-modified inline before declaring DONE. No "orchestrator will catch up later".

---

## Appendix B — File Path Conventions for Phase 5

All paths absolute or workspace-relative (Windows backslashes acceptable in commentary, forward-slashes preferred in cross-platform scripts).

- New plans: `agent-workspace/session-plans/pending/5.<N>-<slug>-architect.md`
- Per-task session logs: `agent-workspace/memory/sessions/<YYYY-MM-DD>-task-5.<N>.<M>.md`
- Decisions: `agent-workspace/memory/decisions/<NNN>-<slug>.md` (continue from 011)
- New scripts: `scripts/{hooks,utilities,benchmarks}/<name>.{sh,ts,ps1}`
- New core code: `packages/core/src/<module>/<name>.{service,schema,spec}.ts`
- Telemetry: `agent-workspace/memory/component-telemetry.jsonl`
- Subagent index: `agent-workspace/memory/subagent-index.md`
- Tests baseline: `agent-workspace/memory/tests-baseline.json` (root-level + per-phase variants)
- Phase exit doc: `agent-workspace/memory/phase-5-complete.md`
- Skill self-tests: `.claude/skills/<name>/<name>.test.md` (sibling to SKILL.md)
- Skill references: `.claude/skills/<name>/references/<topic>.md`

---

## Appendix C — Carryforward Items From Meta-Retrospective Open Questions

| Meta-retro open Q | Phase 5 disposition |
|---|---|
| Q1 — Mode B recovery hook-side vs LLM-side | **Hook-side**, with `.api-truncation-recovery-fired-<request_id>` idempotency marker (5.1.3). |
| Q2 — Deprecate narration-hit heuristic | **No** — refine instead (5.1.5). The 5.1.2 tool-call-first lint is a complement, not a replacement. |
| Q3 — `pnpm test` (root) per-IMPL gate | **Per-VERIFY gate** (already SC-16 + 5.3.12 + 5.5.1) — not per-IMPL. ROI of per-IMPL was uncertain in the meta-retro; per-VERIFY catches the same defects without 28× cost. |
| Q4 — Unit of self-improvement | **Per-task-shape** routing via subagent-index (5.1.7) + per-component telemetry (5.2.3). Both ship; phase-end review reads them together. |
| Q5 — current-execution.md preservation pattern | **Footer-only** preserved-state pointer; backfill in 5.5 retro. |
| Q6 — Auto-generate phase-N-complete.md from template | **Yes** for the test-count cell only (5.2.4). The narrative retrospective stays human-written. |
| Q7 — Parallel main sessions vs harder subagent parallelism | **(a) — harder subagent parallelism** for v2.0 (current substage 5.3 design). True session-pool is v2.1+. |
| Q8 — `agent-workspace/memory/project.md` deprecation | **Defer to v2.1**; mark "stale, see current-execution.md" in 5.5. |
| Q9 — observations/ directory | **Keep, document policy** — 5.4.7 backfill includes a README clarifying observations/ is OPTIONAL only when single task spans >1 day. |
| Q10 — Self-track vs real-transcript inflation ratio | **Codify 1.35× as observed constant**; LLM rule: "if your self-track > 1.35 × `.transcript-tokens`, recalibrate." Documented in 5.5 retro. |

---

## Appendix D — Phase 5 Done-Definition Snapshot

Phase 5 is DONE when this 10-item snapshot is true:

1. SC-1..SC-18 all PASS or PARTIAL-with-doc.
2. `pnpm test` (root) green 3× consecutive.
3. `pnpm skills:validate` green.
4. `agent-workspace/memory/component-telemetry.jsonl` ≥ 100 lines.
5. `agent-workspace/memory/subagent-index.md` ≥ 50 rows.
6. `agent-workspace/memory/phase-5-complete.md` exists with retrospective + scorecard.
7. `agent-workspace/memory/tests-baseline.json` exists with Phase 5 entry.
8. `docs/quickstart.md` ≥ 150 lines.
9. v2.0.0 release artifacts STAGED (not committed; awaiting user).
10. `agent-workspace/memory/current-execution.md` updated to mark Phase 5 complete + autonomous_mode set per user instruction.

---

**End of Phase 5 master plan.** Substage architects: read this file + the meta-retrospective + the 3 research notes; then produce your substage's per-task signatures in the matching `5.<N>-<slug>-architect.md`. Implementers: do not start without a substage architect doc.
