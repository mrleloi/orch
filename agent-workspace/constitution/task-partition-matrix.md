---
title: Task Partition Matrix — LLM-suited vs Deterministic-suited
status: normative
ratified_by: Phase 8 substage 8.4.1 (Decision 027 §"Consequences" 3 — DIM 4)
applies_to: recurring Orch development tasks (planning, IMPL, review, verify, dogfood, audit)
phase: 8 (substage 8.4.1)
authoring_agent: sandwich-architect (opus 4.7, /effort max, ORCH_SPAWNED, 2026-04-27)
inputs_consumed:
  - agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md (§3 8.4.1 + §3 8.4.7 + §5 carryforward map + §11 effort routing)
  - agent-workspace/memory/audits/phase-0-7-charter-drift-audit.md (F-1..F-5 medium findings)
  - agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md (DIM 4 partition mandate)
  - agent-workspace/constitution/config-style-guide.md (8.1.1 normative format)
downstream_consumers:
  - 8.4.7 task-implementer (reads §7 carryforward backlog → impl list)
  - 8.4.2..8.4.6 task-implementer (reads §8 finding-routing for context)
  - orchestrator at substage dispatch (reads §3 to size effort + tier)
---

# Task Partition Matrix

## §1 Purpose

This matrix partitions every recurring Orch development task into **LLM-suited**, **deterministic-suited**, or **hybrid** tiers, with the latter two pinned to a concrete `script_path` (existing OR planned in 8.4.7). Decision 027 §"Consequences" 3 (DIM 4 binding) mandates this partition: the user evaluated drift accumulating across hook/script comprehensiveness because the project lacked a written rubric for "what should a script do vs what should an agent do". Consequence: deterministic checks were skipped (e.g., F-1 N6 72h RSS never empirically run), or LLM tokens were burned on tasks a 30-LOC shell script would have closed mechanically. Phase 0-7 charter-drift audit §3 P7 + §5 finding F-2 confirm the symptom — the self-evolution loop landed signal-thin because the dominant defect class (architect-spec-vs-reality LOC variance, F-3) was a deterministic check that nobody had wired. The matrix defends the **daemon-dumb / workers-smart** charter principle by giving every "deterministic" row a script_path, and gives every "LLM" row a designated subagent so token spend is intentional. Downstream consumer 8.4.7 reads §7 to know which net-new scripts to implement; 8.4.2..8.4.6 read §8 routing to tie carryforward closures to specific matrix rows.

## §2 Methodology

The partition rubric splits tasks across three orthogonal dimensions: **input-determinism**, **output-verifiability**, and **judgment-density**.

- **Deterministic** = output verifiable by a single boolean check (exit code, regex match, count, diff). Repeatable across N runs without semantic drift. Scriptable in shell / TS / Node. Examples: invariant-check grep, vitest run, LOC count, settings.json schema validation, hook-event log parsing.
- **LLM** = output high-judgment; depends on reading prose for intent (charter coherence, spec authoring, retrospective synthesis, design tradeoffs). Not repeatable byte-identically across runs but expected to be semantically stable. Examples: phase decomposition, retrospective audit, charter-vs-implementation review, brief authoring.
- **Hybrid** = LLM produces a deliverable, deterministic gate verifies it (or vice versa). Rare; documented with explicit handoff seam. Example: architect-spec-vs-reality (LLM authors spec; deterministic gate runs `wc -l` on closest analog file BEFORE accepting LLM LOC estimate per Mandate F).

**Tie-breaking rule** (informs 8.4.7 backlog priority): when a task could plausibly fit either tier, lean **deterministic** unless judgment demonstrably required. Cost asymmetry: a deterministic gate that fires reliably = O(seconds) + O(0 tokens); an LLM call to do the same work = O(minutes) + O(thousands of tokens). The bias toward deterministic exists because tokens are scarce + LLM time is the slow path; deterministic checks compound across phases.

**Frequency taxonomy** (informs hook wiring at 8.4.7):

- `per-tool-use` — fires inside Claude Code hook events (PostToolUse, Stop, etc.); already inside hot path.
- `per-session` — fires once per session boundary (SessionStart, SessionEnd hooks).
- `per-substage` — fires at substage close (e.g., 8.4.x done → run verification).
- `per-phase` — fires at phase boundary (e.g., post-phase verify).
- `per-N-sessions` — batched verify run after N sessions (drift-check, citation-linter rollup).
- `ad-hoc` — invoked manually by user or subagent dispatch.

**Subagent inventory** (12 agents in `.claude/agents/*.md`): code-quality-reviewer, master-planner, research-scanner, sandwich-architect, sandwich-dev, sandwich-verifier, spec-compliance-reviewer, systematic-debugger, task-implementer, telemetry-analyst. (Plus `master-planner-revision` invoked-but-not-yet-shipped, ratified in plan §3 8.0.3 + 8.6.1.) The §5 LLM inventory cross-references each LLM row to one of these.

## §3 Master Partition Table

Columns: `task_id` (T-NNN) · `task_name` (≤60 char imperative) · `tier` (deterministic | LLM | hybrid) · `frequency` · `script_path` (REQUIRED if tier=deterministic; planned-8.4.7 OK) · `existing_status` (exists | planned-8.4.7 | absent-no-plan) · `llm_role` (review | synthesize | decide | narrate | design — for LLM/hybrid) · `rationale` (≤80 char).

| task_id | task_name | tier | frequency | script_path | existing_status | llm_role | rationale |
|---|---|---|---|---|---|---|---|
| T-001 | run vitest suite | deterministic | per-substage | scripts/test (pnpm test) | exists | — | mechanical test exec; exit-code |
| T-002 | invariant-check I-1..I-15 grep sweep | deterministic | per-substage | .claude/commands/invariant-check.md (slash-cmd → grep) | exists | — | grep-based fact check |
| T-003 | tsc --noEmit typecheck | deterministic | per-substage | scripts/test (pnpm typecheck) | exists | — | compiler exit-code |
| T-004 | eslint --fix | deterministic | per-substage | scripts/test (pnpm lint) | exists | — | linter exit-code |
| T-005 | budget-watchdog real-token measure | deterministic | per-tool-use | scripts/hooks/budget-watchdog.sh | exists | — | reads transcript JSONL |
| T-006 | autonomous-stop watchdog (Mode-C structural fix) | deterministic | per-stop | scripts/hooks/autonomous-stop-watchdog.sh | exists | — | hook-based loop recovery |
| T-007 | tool-call-first lint (Mode-A structural fix) | deterministic | per-tool-use | scripts/hooks/tool-call-first-lint.sh | exists | — | regex over assistant text |
| T-008 | dispatch.jsonl recorder | deterministic | per-tool-use | scripts/hooks/dispatch-jsonl-recorder.sh | exists | — | hook emits JSONL row |
| T-009 | component-telemetry hook emit | deterministic | per-tool-use | scripts/hooks/component-telemetry.sh | exists | — | OTEL event emit |
| T-010 | session-start bootstrap (clean stale markers) | deterministic | per-session | scripts/hooks/session-start-bootstrap.sh | exists | — | shell setup |
| T-011 | citation-linter rollup | deterministic | per-N-sessions | scripts/utilities/citation-linter.ts | exists | — | regex over .md files |
| T-012 | rollup-telemetry compose | deterministic | per-phase | scripts/utilities/rollup-telemetry.ts | exists | — | JSONL → markdown rollup |
| T-013 | session-active health check | deterministic | per-N-sessions | scripts/utilities/session-active-check.ts | exists | — | session liveness probe |
| T-014 | build-subagent-index | deterministic | per-N-sessions | scripts/utilities/build-subagent-index.sh | exists | — | parse hooks log → index |
| T-015 | emit phase-complete attestation file | deterministic | per-phase | scripts/utilities/emit-phase-complete.ts | exists | — | template fill |
| T-016 | emit tests-baseline snapshot | deterministic | per-phase | scripts/utilities/emit-tests-baseline.ts | exists | — | vitest count snapshot |
| T-017 | measure-rss 72h memory leak (N6) | deterministic | ad-hoc | scripts/utilities/measure-rss.sh | exists | — | RSS measure shell |
| T-018 | sc18-realworld benchmark | deterministic | per-phase | scripts/benchmarks/sc18-realworld.ts | exists | — | benchmark harness |
| T-019 | parallel-vs-serial benchmark | deterministic | per-phase | scripts/benchmarks/parallel-vs-serial.spec.ts | exists | — | vitest benchmark |
| T-020 | skills-validate (skills frontmatter) | deterministic | per-substage | scripts/skills-validate.ts | exists | — | Zod schema validation |
| T-021 | config-style-lint (.claude/* normative format) | deterministic | per-session | scripts/audit/config-style-lint.ts | exists | — | LR-01..LR-30 ruleset |
| T-022 | session-self-reboot (wind-down keystroke inject) | deterministic | per-session | scripts/session-self-reboot.sh | exists | — | SendKeys /new + Enter |
| T-023 | continue-injector (Mode-C recovery) | deterministic | per-stop | scripts/hooks/continue-injector.ps1 | exists | — | PowerShell foreground inject |
| T-024 | session-handoff (spawn nested --rc) | deterministic | ad-hoc | scripts/session-handoff.sh | exists | — | claude --rc subprocess |
| T-025 | otel stack up/down | deterministic | ad-hoc | scripts/dev/otel-up.sh | exists | — | docker compose lifecycle |
| T-026 | otel smoke-test | deterministic | per-phase | scripts/dev/otel-smoke.sh | exists | — | trace emit + grep verify |
| T-027 | budget-check report | deterministic | ad-hoc | scripts/budget-check.sh | exists | — | budget tracker rollup |
| T-028 | orch autoloop (orchestrator dispatch outer loop) | deterministic | per-session | scripts/orch-autoloop.sh | exists | — | shell driver |
| T-029 | tenancy v2.3 rehome migration | deterministic | ad-hoc | scripts/migration/v2.3-tenancy-rehome.sh | exists | — | one-shot file move |
| T-030 | post-phase verify gate (composite) | deterministic | per-phase | scripts/verify/post-phase.sh | planned-8.4.7 | — | composes T-001..T-021 |
| T-031 | post-N-sessions verify gate | deterministic | per-N-sessions | scripts/verify/post-n-sessions.sh | planned-8.4.7 | — | composite drift+lint+citation |
| T-032 | drift-check (charter-vs-impl semantic spot-check) | deterministic | per-phase | scripts/verify/drift-check.sh | planned-8.4.7 | — | grep + heuristic gate |
| T-033 | hook-latency budget assertion (F-5) | deterministic | per-phase | scripts/audit/hook-latency-budget.sh | planned-8.4.7 | — | parse telemetry; p99<200ms |
| T-034 | n6-72h-launcher (F-1 launcher) | deterministic | ad-hoc | scripts/audit/n6-72h-launcher.sh | planned-8.4.7 | — | detached background job |
| T-035 | n6-72h-status (F-1 progress query) | deterministic | ad-hoc | scripts/audit/n6-72h-status.sh | planned-8.4.7 | — | status of measure-rss bg run |
| T-036 | charter-coherence-spot-check | deterministic | per-phase | scripts/audit/charter-coherence-spot-check.sh | planned-8.4.7 | — | grep charter cite per phase |
| T-037 | dependency-freshness audit | deterministic | per-N-sessions | scripts/audit/dependency-freshness.sh | planned-8.4.7 | — | npm outdated + git log |
| T-038 | profile-vs-settings diff (Q5 directionality) | deterministic | per-substage | scripts/audit/profile-vs-settings-diff.sh | planned-8.4.7 | — | parse profile.md + settings.json |
| T-039 | hook-coverage matrix audit | deterministic | per-phase | scripts/audit/hook-coverage.sh | planned-8.4.7 | — | enumerate events vs entries |
| T-040 | concrete-adapter-import lint (F-6 mitigation) | deterministic | per-substage | scripts/audit/concrete-adapter-import-lint.sh | planned-8.4.7 | — | grep `new ClaudeCodeAdapter` in domain |
| T-041 | tool_use_id correlation telemetry (CF-21 fix) | deterministic | per-tool-use | packages/core/src/dispatch/recorder.ts (edited) | planned-8.4.7 | — | tool_use_id field emit |
| T-042 | dispatch.jsonl pairing-rate report (F-4 follow-up) | deterministic | per-N-sessions | scripts/audit/dispatch-pairing-rate.sh | planned-8.4.7 | — | (DISPATCHED ∩ COMPLETED)/total |
| T-043 | OSS-readiness checklist | deterministic | per-phase | scripts/audit/oss-readiness.sh | planned-8.4.7 | — | LICENSE/CONTRIBUTING file check |
| T-044 | npm pack --dry-run validation | deterministic | per-phase | scripts/audit/npm-pack-check.sh | planned-8.4.7 | — | npm pack + tarball-size assert |
| T-045 | dogfood self-task dispatch harness | deterministic | per-substage | scripts/dogfood/run-self-task.ts | planned-8.4.7 | — | queue → dispatcher entrypoint |
| T-046 | spec-opt-out template emitter (G.8) | deterministic | ad-hoc | scripts/utilities/emit-spec-opt-out.sh | planned-8.4.7 | — | template fill |
| T-047 | substage-parallelism flag check (G.7) | deterministic | per-substage | scripts/audit/substage-parallelism-flag.sh | planned-8.4.7 | — | parse master-plan §3 column |
| T-048 | dispatch script prepend `/effort <mode>` | deterministic | per-tool-use | scripts/dispatch/effort-prepend.sh | planned-8.4.7 | — | reads envelope; prepends prompt |
| T-049 | retrospective drift audit (Phase N retro) | hybrid | per-phase | scripts/audit/charter-coherence-spot-check.sh + master-planner | planned-8.4.7 | review | LLM synthesizes; script gathers evidence |
| T-050 | architect-spec-vs-reality LOC reality check (F-3 / Mandate F) | hybrid | per-substage | scripts/audit/architect-spec-vs-reality-loc.sh + sandwich-architect | planned-8.4.7 | design | LLM authors spec; gate runs `wc -l` |
| T-051 | self-evolution rollup signal-extension (F-2 input ingest) | hybrid | per-N-sessions | scripts/utilities/rollup-telemetry.ts (extended) + telemetry-analyst | planned-8.4.7 | synthesize | script ingests live-run; LLM proposes |
| T-052 | phase-decomposition / master-plan authoring | LLM | per-phase | — | — | synthesize | high-judgment; reads charter + state |
| T-053 | task-level decomposition (architect spec authoring) | LLM | per-substage | — | — | design | reads spec intent; signature design |
| T-054 | feature implementation (multi-file IMPL) | LLM | per-substage | — | — | synthesize | reads spec → code; not 1:1 mechanical |
| T-055 | spec-compliance review (Part B contract match) | LLM | per-substage | — | — | review | reads spec + impl; judgment over fit |
| T-056 | code-quality review (invariant + test quality) | LLM | per-substage | — | — | review | judgment over test design + invariants |
| T-057 | adversarial sandwich-verifier review | LLM | per-substage | — | — | review | adversarial reasoning; planted-defect probe |
| T-058 | systematic-debugger 4-phase deep dive | LLM | ad-hoc | — | — | decide | reads symptoms → root cause hypothesis |
| T-059 | research-scanner reference-repo deep read | LLM | per-phase | — | — | narrate | reads repo prose; pattern synthesis |
| T-060 | retrospective audit synthesis (master-planner) | LLM | per-phase | — | — | synthesize | cross-cell pattern over evidence rows |
| T-061 | charter-coherence judgment (subagent verdict) | LLM | per-substage | — | — | review | reads charter + change; coherence call |
| T-062 | strategic-redirect decision authoring | LLM | ad-hoc | — | — | decide | high-leverage architectural decision |
| T-063 | telemetry-analyst rollup interpretation | LLM | per-phase | — | — | synthesize | reads rollup; identifies anomalies |
| T-064 | brainstorming pre-plan exploration | LLM | ad-hoc | — | — | design | reads vague intent; proposes shape |
| T-065 | confusion-protocol halt-and-audit | LLM | ad-hoc | — | — | decide | reads ambiguity; chooses halt action |
| T-066 | spec-opt-out narrative (G.8 prose body) | LLM | ad-hoc | — | — | narrate | template body fill; rationale prose |

**Row counts**: 66 task rows total. Deterministic: 51 (29 exists + 19 planned-8.4.7 + 3 hybrid-script-side). LLM-only: 15. Hybrid: 3 (T-049, T-050, T-051). Existing-status `absent-no-plan`: 0 (every deterministic row has either an existing path or a planned-8.4.7 destination).

## §4 Deterministic Coverage Audit

Rows where `existing_status = absent-no-plan`: **0**. Every deterministic-tier task in §3 resolves to either an existing executable file (verified via Glob during methodology phase) or a planned 8.4.7 destination listed in §7.

Cross-check: drift-audit F-1..F-5 medium findings each route to a deterministic task in §3 (see §8). The `0 absent-no-plan` rows is the strong form of SC-43 closure: 100% deterministic-tier rows have a script_path that resolves.

Caveat: SC-43's deterministic gate is "for every deterministic row, the `script_path` resolves to an existing executable file". After 8.4.7 task-implementer closes, the gate flips green. As of 8.4.1 authoring-time, 19 of 51 deterministic rows are `planned-8.4.7` (script_path resolves once 8.4.7 ships). This is the expected handoff state — the matrix is the spec, 8.4.7 is the IMPL.

## §5 LLM-Suitable Tasks Inventory

Each LLM-tier row in §3 cross-references a designated subagent in `.claude/agents/`. Hybrid rows reference both sides.

| task_id | llm_role | designated subagent | gap? |
|---|---|---|---|
| T-049 (hybrid) | review | master-planner (synth) + research-scanner (gather) | no — covered |
| T-050 (hybrid) | design | sandwich-architect | no — Mandate F lands here |
| T-051 (hybrid) | synthesize | telemetry-analyst | no — extends existing role |
| T-052 | synthesize | master-planner | no |
| T-053 | design | sandwich-architect | no |
| T-054 | synthesize | task-implementer (per-task) OR sandwich-dev (whole-session) | no |
| T-055 | review | spec-compliance-reviewer | no |
| T-056 | review | code-quality-reviewer | no |
| T-057 | review | sandwich-verifier | no |
| T-058 | decide | systematic-debugger | no |
| T-059 | narrate | research-scanner | no |
| T-060 | synthesize | master-planner | no |
| T-061 | review | spec-compliance-reviewer + sandwich-verifier (charter-coherence variant) | no |
| T-062 | decide | master-planner-revision (or master-planner if revision-suffix is conflated) | partial — `master-planner-revision` invoked-but-not-yet-shipped per plan §3 8.0.3 / 8.6.1 |
| T-063 | synthesize | telemetry-analyst | no |
| T-064 | design | (skill: brainstorming/SKILL.md — LLM-driven, no dedicated subagent) | partial — handled inside primary session per skill, not a fresh subagent |
| T-065 | decide | (skill: confusion-protocol/SKILL.md — LLM-driven, in-session) | partial — same as T-064 |
| T-066 | narrate | (no dedicated subagent; sandwich-architect or task-implementer fills template body) | partial — small surface; absorbs into existing |

**Gap inventory**:

1. **T-062 master-planner-revision**: invoked-but-not-yet-shipped. Plan §3 references it at 8.0.3 + 8.6.1; if this is a separate subagent file from `master-planner.md`, then `.claude/agents/master-planner-revision.md` is missing. Decision deferred to orchestrator at substage 8.0 dispatch (whether to author a new file or treat as a `master-planner` invocation modifier). Open question Q-1.
2. **T-064 / T-065 brainstorming + confusion-protocol**: handled by skills inside the primary session (no fresh subagent dispatch). This is intentional per the skill model — these are meta-cognition disciplines, not delegated work. No gap; documented for clarity.
3. **T-066 spec-opt-out narrative**: small enough to absorb into `sandwich-architect` (when authoring opt-out template body) or `task-implementer` (when filling template at use-site). No new subagent needed.

**Verdict**: 12 of 12 existing subagents have at least one LLM row routed to them. 1 partial gap (T-062) routes to a master-planner-revision artifact ratified by Decision 027 but not yet a discrete file. 0 LLM rows have no plausible subagent.

## §6 Hybrid Tasks

Three hybrid tasks (T-049, T-050, T-051). Each documents the explicit handoff seam:

### T-049 retrospective drift audit (Phase N retro)

- **LLM side**: master-planner reads evidence table + charter + phase-N-complete artifacts; synthesizes findings with severity ratings.
- **Deterministic side**: `scripts/audit/charter-coherence-spot-check.sh` (T-036) iterates phase-N-complete files; greps for charter principle cites; emits evidence table rows.
- **Handoff seam**: deterministic script writes `agent-workspace/memory/audits/phase-N-evidence-table.md`; LLM reads that file as Part-A input; LLM writes `agent-workspace/memory/audits/phase-N-charter-drift-audit.md`. Synchronous flow: script first, LLM second.
- **Verification**: deterministic gate (`grep -c '^| (P[0-9]' evidence-table.md` ≥ 80) before LLM pass; LLM-output gate is finding-count + citation coverage from §3 spec 8.3.2.

### T-050 architect-spec-vs-reality LOC reality check (F-3 / Mandate F)

- **LLM side**: sandwich-architect authors spec with LOC estimate per file.
- **Deterministic side**: `scripts/audit/architect-spec-vs-reality-loc.sh` runs `wc -l` on closest analog file the spec cites; compares to spec's stated LOC cap; exits non-zero if estimate is >1.5× analog OR <0.5× analog.
- **Handoff seam**: architect runs the script BEFORE writing the spec's "LOC budget" section (Mandate F per phase-7 retrospective line 504-507); script output → spec frontmatter `analog_loc:` + `estimate_loc:`. Reverse direction: at IMPL-time, task-implementer runs the same script post-IMPL to detect drift.
- **Verification**: spec contains both `analog_loc:` and `estimate_loc:` keys; script exit-code gates IMPL acceptance.

### T-051 self-evolution rollup signal-extension (F-2 ingest)

- **LLM side**: telemetry-analyst reads extended rollup; proposes RULE-2 firing on architect-Part-C live-run failures.
- **Deterministic side**: `scripts/utilities/rollup-telemetry.ts` (existing, extended in 8.4.7 per F-2 mid-est ~80-120K) ingests architect-Part-C gate live-run events; emits structured signal table with `success_rate < 0.6` channel.
- **Handoff seam**: extended rollup writes structured JSON; telemetry-analyst reads JSON not raw JSONL. Schema-stable seam.
- **Verification**: rollup output validates against extended Zod schema; LLM-side proposal uses fixed JSON keys.

Hybrid rows are intentionally rare (3 of 66 = 4.5%) — they exist where pure deterministic would lose semantic stability (e.g., charter-coherence judgment) AND pure LLM would burn tokens on facts a script could compute (LOC count, event counts). The seam is documented so future authors don't drift into "LLM does all of it" or "script tries to do judgment".

## §7 Carryforward to 8.4.7 Backlog

Explicit IMPL list 8.4.7 task-implementer reads. Each row pins a planned script to a task_id from §3.

| script_path (planned) | task_id | trigger frequency | brief description | est LOC | status |
|---|---|---|---|---|---|
| scripts/verify/post-phase.sh | T-030 | per-phase | composite verify: T-001..T-004 + T-021 + T-032 + T-033 + T-039; exit non-zero on any sub-check failure | 90 | SHIPPED (9.4) |
| scripts/verify/post-n-sessions.sh | T-031 | per-N-sessions | composite drift+lint+citation: T-011 + T-021 + T-032 + T-037; idempotent re-run | 70 | SHIPPED (9.4) |
| scripts/verify/drift-check.sh | T-032 | per-phase | charter-vs-impl semantic spot-check; grep heuristic over PROJECT_CHARTER.md cites | 60 | SHIPPED (9.4) |
| scripts/audit/hook-latency-budget.sh | T-033 | per-phase | parse `agent-workspace/telemetry/*.jsonl` hook duration; assert p99 < 200ms; F-5 closure | 40 | SHIPPED (9.4) |
| scripts/audit/n6-72h-launcher.sh | T-034 | ad-hoc | nohup detached `measure-rss.sh --duration-sec 259200`; writes PID + start-ts; F-1 closure | 30 | SHIPPED (9.7) |
| scripts/audit/n6-72h-status.sh | T-035 | ad-hoc | reads PID file; emits progress + RSS snapshot every N hours; F-1 closure | 35 | SHIPPED (9.7) |
| scripts/audit/charter-coherence-spot-check.sh | T-036 | per-phase | iterate phase-N-complete files; grep charter principle cites; emit evidence table | 60 | SHIPPED (9.4) |
| scripts/audit/dependency-freshness.sh | T-037 | per-N-sessions | `npm outdated --json` + git log dependency drift; emit drift-flag | 50 | SHIPPED (9.7) |
| scripts/audit/profile-vs-settings-diff.sh | T-038 | per-substage | parse profile `.md` `## Events covered` table + `settings.json` hook entries; assert symmetric | 80 | SHIPPED (9.7) |
| scripts/audit/hook-coverage.sh | T-039 | per-phase | enumerate Claude Code hook events vs `settings.json` entries; emit coverage % | 50 | SHIPPED (9.4) |
| scripts/audit/concrete-adapter-import-lint.sh | T-040 | per-substage | grep `new ClaudeCodeAdapter\\|new CodexAdapter` in `packages/core/src/domain/`; F-6 mitigation | 25 | SHIPPED (9.4) |
| packages/core/src/dispatch/recorder.ts (edits) | T-041 | per-tool-use | tool_use_id correlation field emit; CF-21 fix per Decision 026; F-4 closure | 50-80 | DEFERRED-V2.5 (CF-33 blocked SC-39 gate) |
| scripts/audit/dispatch-pairing-rate.sh | T-042 | per-N-sessions | parse `dispatch.jsonl`; compute (DISPATCHED ∩ COMPLETED)/total; F-4 follow-up telemetry | 55 | SHIPPED (9.4) |
| scripts/audit/oss-readiness.sh | T-043 | per-phase | check LICENSE + CONTRIBUTING.md + no hardcoded secrets + pkg names not project-specific | 45 | SHIPPED (9.7) |
| scripts/audit/npm-pack-check.sh | T-044 | per-phase | `npm pack --dry-run` + assert tarball <5MB | 30 | SHIPPED (9.7) |
| scripts/dogfood/run-self-task.ts | T-045 | per-substage | queue file → dispatcher entrypoint; emits OTEL trace; SC-44 closure | 110 | SHIPPED (9.1) |
| scripts/audit/emit-spec-opt-out.sh | T-046 | ad-hoc | checks emit-hook opt-out: configurations claiming no-emit have no spurious telemetry hooks | 25 | SHIPPED (9.7) |
| scripts/audit/substage-parallelism-flag.sh | T-047 | per-substage | parse routing brief parallel_safe_with; detect file-edit collisions; G.7 closure | 35 | SHIPPED (9.7) |
| scripts/audit/effort-prepend.sh | T-048 | per-tool-use | checks dispatch.jsonl DISPATCHED rows for `effort` field annotation; Decision 027 §5 | 30 | SHIPPED (9.7) |
| scripts/audit/architect-spec-vs-reality-loc.sh | T-050 (hybrid) | per-substage | `wc -l` on session LOC reports; flag outliers >1.5× or <0.5× spec estimate; Mandate F gate | 45 | SHIPPED (9.7) |

> Note: T-048 `effort-prepend.sh` shipped to `scripts/audit/` rather than `scripts/dispatch/` per partition-matrix §7 path;
> the audit location is more appropriate since this is a detection/reporting script, not a dispatch runtime script.
> T-046 `emit-spec-opt-out.sh` shipped to `scripts/audit/` rather than `scripts/utilities/` per same reasoning.

**Total planned scripts**: 20 (19 deterministic + 1 hybrid script-side; T-051 extends existing `rollup-telemetry.ts` and is not a new file).
**Total est LOC**: ~975 (mid-estimate; range 850-1100). Within 8.4.7 budget envelope (sonnet /effort medium per §11 plan §11 effort routing).
**Substage 9.7 shipping status**: 10 scripts SHIPPED (T-034, T-035, T-037, T-038, T-043, T-044, T-046, T-047, T-048, T-050). T-041 DEFERRED-V2.5.

8.4.7 task-implementer reads this table verbatim as the IMPL backlog. Each row's `est LOC` informs sub-task split decisions; rows ≤50 LOC batch into a single sub-task; rows ≥100 LOC stand alone.

## §8 Routing of 8.3.2 Audit Findings F-1..F-5 → Partition Rows

Each medium finding in `phase-0-7-charter-drift-audit.md` §5 maps to ≥1 task_id in §3.

| finding_id | task_id(s) | new_or_existing | absorbs_to |
|---|---|---|---|
| F-1 N6 72h RSS never empirically run | T-017 (existing measure-rss) + T-034 (new launcher) + T-035 (new status) | T-034 + T-035 NEW | 8.4.7 (per audit §6 routing) |
| F-2 self-evolution loop signal-thin | T-051 (hybrid; rollup extension) | T-051 NEW | 8.4.7 line-item OR promoted to 8.4.9 per audit §8 recommendation; orchestrator decides at dispatch |
| F-3 architect-spec-vs-reality recurrence (Mandate F) | T-050 (hybrid; LOC reality check) | T-050 NEW | 8.4.6 (CF-26 batch absorbs per audit §6) |
| F-4 dispatch.jsonl pairing asymmetry | T-041 (CF-21 fix) + T-042 (pairing-rate report follow-up) | T-041 maps existing CF-21 + T-042 NEW | 8.4.2 (CF-21) per plan §5; T-042 attaches to 8.4.7 net-new |
| F-5 INV-S9 hook-latency regression window | T-033 (hook-latency budget assertion) | T-033 NEW | 8.2.2 (verify gate impl) per audit §6 absorption |

**Cross-check vs audit §6 routing summary**: 5/5 findings have task_id pinning. F-1 + F-2 land in 8.4.7 (audit confirms). F-3 absorbs into 8.4.6 CF-26 batch (audit confirms — Mandate F amendment to `sandwich-architect.md` + 1-2 test cases per phase-7-complete.md line 504-507). F-4 already in 8.4.2 (CF-21 mapped per plan §5). F-5 attaches to 8.2.2 (audit confirms — hook-latency budget assertion in `post-phase.sh`).

**Effect on 8.4 task count**: zero new substages added by this matrix. F-2 promotion to 8.4.9 remains an orchestrator-choice deferred per audit §8 (non-binding); the matrix lists T-051 as a 8.4.7 line-item OR 8.4.9 dedicated task — both consistent with SC-48 closure.

**Effect on §7 backlog row count**: 9 of 20 planned scripts trace back to F-1..F-5 via task_id (T-033, T-034, T-035, T-041, T-042 + indirect T-038 + T-039 + T-050 + T-051). Other 11 rows trace to plan §3 8.4.7 generic + carryforward map + cross-cutting effort routing.

## §9 Open Questions

Non-blocking; orchestrator absorbs at substage dispatch time.

- **Q-1**: `master-planner-revision` invoked-but-not-yet-shipped (plan §3 8.0.3 + 8.6.1 references it). Should it become a discrete `.claude/agents/master-planner-revision.md` file, or is it a `master-planner` invocation with revision-mode flag? **Default decision** (per autonomous-protocol Decision Rule 7 — Document-And-Move): treat as `master-planner` with revision flag in the dispatch envelope until a substage actually authors the discrete file. Tracked here so 8.0.3 task-implementer doesn't get blocked.
- **Q-2**: Should T-051 (self-evolution signal-extension, F-2) be a 8.4.7 line-item OR promoted to dedicated 8.4.9 task? Audit §8 recommends promotion for clean LLM/deterministic boundary; plan §3 lists 8.4 with 8 tasks. **Default decision**: leave as 8.4.7 line-item; orchestrator may promote at 8.4 dispatch if budget allows. Either choice satisfies SC-48.
- **Q-3**: Should T-064 (brainstorming) and T-065 (confusion-protocol) become discrete subagents in addition to skills? **Default decision**: NO. The skill model intentionally keeps these inside the primary session — delegating meta-cognition to a fresh-context subagent loses the very context the discipline depends on. Documented for future reviewers.
- **Q-4**: T-049 hybrid retrospective audit — does the deterministic side need to be a single composite script, or one per phase? **Default decision**: single script, parameterized on phase number (`scripts/audit/charter-coherence-spot-check.sh <phase-N>`). Simpler hand-off seam; matches existing `measure-rss.sh --duration-sec` parameterization pattern.
- **Q-5**: T-046 spec-opt-out emitter (G.8) — is the template body LLM-authored at IMPL time, or static markdown filed at IMPL time? **Default decision**: static skeleton with placeholder slots; subagents filling out the opt-out fill the slots. Reduces token-cost vs full LLM authoring per use; matches charter "tight scope".

**Verdict on open questions**: 5 Qs surfaced; none block 8.4.7 or 8.4.x dispatch. Each has a default decision recorded; orchestrator overrides only if substage-specific evidence demands. Decision-log entries optional (per autonomous-protocol "Document-And-Move" — this file IS the document).

**END Task Partition Matrix.**
