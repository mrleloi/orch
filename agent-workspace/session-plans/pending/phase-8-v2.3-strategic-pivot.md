---
phase: 8
phase_name: v2.3 Strategic Pivot (drift-audit + self-application + community-readiness + carryforward fold-in)
status: pending
created: 2026-04-27
budget_estimate_tokens: 1180000
expected_sessions: 14
expected_calendar_days: 6
authoring_agent: master-planner (opus 4.7, /effort max, ORCH_SPAWNED, bg redispatch session #39)
authorization: Decision 027 + tasks/feat_04_continue_before_phase_8/user_prompt.txt
inputs_consumed: [decisions/027, user_prompt.txt, checkpoints/latest.md, phase-8-v2.3-carryforward-burndown.SUPERSEDED.md]
supersedes: phase-8-v2.3-carryforward-burndown.SUPERSEDED.md
---

# Phase 8 Master Plan — v2.3 Strategic Pivot

> Orch pivots to drift-audit + self-application + community-readiness while
> closing the v2.3 carryforward backlog. Theme: STABILIZE, DOGFOOD, SHARE.
> I-6 ABSOLUTE preserved (Decision 020 binding). v2.0/v2.1/v2.2 staged
> baseline persists; v2.3 stages at Phase 8 close, no commit.

## §1 Goal — Success Criteria

Each user-brief dimension maps to ≥1 SC; each SC has a deterministic check.

- **SC-40 (DIM 1)**: A `config-style-guide.md` exists at `agent-workspace/constitution/` defining normative format for `.claude/{agents,skills,commands,hooks,settings.json}` files. A linter at `scripts/audit/config-style-lint.{sh,ts}` runs against the tree and emits ZERO violations after remediation. Deterministic gate: `node scripts/audit/config-style-lint.ts --strict` exit 0.
- **SC-41 (DIM 2)**: Verify automation scripts at `scripts/verify/{post-phase,post-n-sessions}.sh` exist; scheduling hook fires post-phase verification on `phase-N-complete.md` write event; runs deterministic checks (config-lint, invariant-check, drift-check, hook-coverage, test-count delta). Deterministic gate: `bash scripts/verify/post-phase.sh 7` exit 0 reproduces Phase 7 verify retroactively.
- **SC-42 (DIM 3)**: A `phase-0-7-charter-drift-audit.md` retrospective exists at `agent-workspace/memory/audits/`. Identifies ≥0 findings rated `low|medium|high|critical`. Each `medium+` finding has a remediation task added to substage 8.4 (or escalated to v2.4 backlog with rationale). Deterministic gate: file exists, schema-valid, ≥3 findings categorized.
- **SC-43 (DIM 4)**: A `task-partition-matrix.md` at `agent-workspace/constitution/` partitions known recurring tasks into LLM-suited vs deterministic-suited. Each "deterministic-suited" task with no current hook/script gets one created in 8.4. Deterministic gate: matrix exists; for every "deterministic-suited" row, the `script_path` column resolves to an existing executable file.
- **SC-44 (DIM 5)**: At least 2 substages of Phase 8 (excluding 8.0/8.5 itself) execute through orch's own queue dispatcher. OTEL traces exist at `agent-workspace/traces/` for each. Deterministic gate: `ls agent-workspace/traces/phase-8-*.jsonl | wc -l` ≥ 2; each trace contains `span.kind=ORCH_DAEMON_DISPATCH`.
- **SC-45 (DIM 6)**: Tenancy model document at `agent-workspace/constitution/tenancy-model.md` defines workspace separation strategy (file-level vs daemon-level vs hybrid). A minimal demo at `examples/multi-user/` with 2 simulated users sharing 1 project + each owning 1 personal project runs end-to-end. Deterministic gate: `bash examples/multi-user/demo.sh` exit 0; produces 2 distinct trace files; user-A cannot read user-B's personal project trace.
- **SC-46 (DIM 7)**: OSS-readiness checklist at `OSS_READINESS.md` exists; LICENSE present (Apache-2.0 or MIT decided in 8.0); CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, .github/ISSUE_TEMPLATE/ exist. Config layering implemented: `system → user → project → repo` resolution at `packages/core/src/config/layered-resolver.ts`. Telemetry sync seam (opt-in, default OFF) at `packages/core/src/telemetry/sync-seam.ts`. Domain-workflow ontology stub at `agent-workspace/ontology/domain-workflow.md`. NPM publishability checklist passes `npm pack --dry-run`. Deterministic gate: `bash scripts/audit/oss-readiness.sh` exit 0.
- **SC-47 (DIM 8)**: Every substage in §3 has `effort` column annotated; effort-routing matrix at §11 cross-references substage → effort → rationale. Default subagent dispatch tooling (`scripts/dispatch/*.sh`) reads `effort_mode` from envelope and prepends `/effort <mode>` to the prompt. Deterministic gate: `grep -c "effort_mode" scripts/dispatch/*.sh` ≥ 1; substage table effort coverage = 100%.
- **SC-48 (Carryforward closure)**: CF-21..CF-26 + G.7 + G.8 closed inside 8.4. SC-39 conditional retry resolved at 8.8 per Decision 025 (default DEFER-AGAIN; only retry if CF-21 closes AND `tool_use_id` correlation telemetry shows ≥80% match rate over 50+ subagent dispatches).

## §2 Scope

### IN SCOPE
| Dimension | Substage | Deliverable |
|---|---|---|
| 1. Config drift audit | 8.1 | config-style-guide.md + config-style-lint.ts (linter) |
| 2. Verify automation | 8.2 | post-phase.sh + post-n-sessions.sh + scheduling hook |
| 3. Charter-drift safety | 8.3 | phase-0-7-charter-drift-audit.md + remediation tasks |
| 4. Hook/script comprehensiveness + carryforward fix-pack | 8.4 | task-partition-matrix.md + new hooks + CF-21..CF-26 + G.7 + G.8 |
| 5. Self-application | 8.5 | Queue dispatcher dogfood; ≥2 later substages run through orch queue |
| 6. Multi-user / multi-project | 8.6 | tenancy-model.md + examples/multi-user/ demo |
| 7. Community OSS readiness | 8.7 | LICENSE + CONTRIBUTING + config layering + telemetry seam + ontology |
| 8. /effort routing | cross-cutting | effort-routing matrix §11 + dispatch script support |

### OUT OF SCOPE (deferred to v2.4+)
| Item | Why deferred |
|---|---|
| SaaS hosting / multi-tenant cloud | Charter "personal-first"; OSS readiness sufficient for v2.3 |
| Domain-workflow ontology beyond stub for "coding" domain | Stub establishes seam; full ontology = v2.4 |
| Telemetry sync default ON | Opt-in only per Decision 027 §"Consequences" 8 |
| Marketing / accounting / chat-support domain expansions | "Coding is first domain" per user brief; others = v3.0+ |
| Web UI multi-user role-based access | Tenancy model defines seams; UI follows in v2.4 |
| Real cloud telemetry endpoint | Local-only seam in v2.3; endpoint in v2.4 |
| Auto-update mechanism for installed orch instances | Out of scope; community contribute via PR |

### Frozen surfaces (binding)
- I-6 ABSOLUTE — zero `git commit` in Phase 8 (Decision 020).
- daemon-dumb / project-agnostic core / adapter pattern / CLI subprocess only (no Agent SDK for subscription accounts).
- Charter immutability (vision, principles, success criteria preserved verbatim).
- v2.0 / v2.1 / v2.2 staged baseline (no rewrite of staged work).
- Domain layer ZERO framework dependency.
- Cross-module communication via events / explicit services only.

## §3 Substages

| # | Substage | Tasks | Budget | Model | Effort | Status | Notes |
|---|---|---|---|---|---|---|---|
| 8.0 | Research + decisions 028-031 | 3 | ~120K | sonnet→opus | high→max | PENDING | research-scanner + master-planner-revision |
| 8.1 | Drift audit + config-style-guide + linter (DIM 1) | 4 | ~140K | opus | max | PENDING | restore normative format across `.claude/*` |
| 8.2 | Verify automation: post-phase + post-N-sessions gates (DIM 2) | 3 | ~110K | sonnet | high | PENDING | drift-check + scheduling hook |
| 8.3 | Charter-drift safety analysis report (DIM 3) | 3 | ~150K | opus | max | PENDING | phases 0-7 retrospective audit |
| 8.4 | Hook/script comprehensiveness audit (DIM 4) + carryforward fix-pack (CF-21..CF-26+G.7+G.8) | 8 | ~180K | mix | mix | PENDING | partition matrix + closures |
| 8.5 | Self-application bootstrap (DIM 5) | 4 | ~130K | opus | max | PENDING | dogfooding queue dispatch |
| 8.6 | Multi-user / multi-project tenancy model (DIM 6) | 3 | ~110K | opus | max | PENDING | shared + personal scopes |
| 8.7 | Community OSS readiness + config layering + telemetry sync + domain-workflow ontology (DIM 7) | 6 | ~160K | opus | max | PENDING | NPM/license/docs/seams |
| 8.8 | SC-39 retry conditional + verify + stage v2.3 | 3 | ~80K | mix | mix | PENDING | mirrors 7.8 closure |

### 8.0 Research + decisions 028-031
**Goal**: Resolve open architectural questions before substages begin.
**Rationale**: 4 unresolved decision questions block parallel work. Front-loading saves rework downstream.
**Tasks**:
- 8.0.1: research-scanner — scan `.claude/{agents,skills,commands,hooks}` directory tree; emit drift inventory (file count, format variance, schema deviation). Part-A: read all `.md` + `settings.json`. Part-B: `agent-workspace/research/phase-8-config-drift-inventory.md`. Part-C gate: file exists, ≥1 deviation pattern documented per `.claude/<dir>`.
- 8.0.2: research-scanner — scan reference repos (claudegram, Claude-to-IM, Anthropic claude-code GitHub) for config-layering patterns + OSS structure. Part-A: read research notes. Part-B: `agent-workspace/research/phase-8-oss-config-patterns.md`. Part-C gate: ≥3 reference patterns identified with citations.
- 8.0.3: master-planner-revision (this agent) — author Decisions 028 (config-style normative format), 029 (tenancy model file vs daemon vs hybrid), 030 (LICENSE: MIT vs Apache-2.0), 031 (telemetry sync wire format). Part-A: read research outputs. Part-B: 4 decision files. Part-C gate: 4 files in `agent-workspace/memory/decisions/` with status=ratified.

### 8.1 Drift audit + config-style-guide + linter (DIM 1)
**Goal**: Restore normative format; ship linter that prevents regression.
**Rationale**: User cannot identify rules/format/structure in current `.claude/` tree (user brief §1.1). High leverage — prevents future drift.
**Tasks**:
- 8.1.1: sandwich-architect — design config-style-guide format (frontmatter schema, section ordering, mandatory sections per file type). Part-A: read drift inventory + Decision 028. Part-B: `agent-workspace/constitution/config-style-guide.md` (signatures only, no impl). Part-C gate: schema covers `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/commands/*.md`, `.claude/hooks/profiles/*.md`, `.claude/settings.json`.
- 8.1.2: task-implementer — implement `scripts/audit/config-style-lint.ts` (parser + rule engine + report). Part-A: spec from 8.1.1. Part-B: TS file + 5 unit tests. Part-C gate: `pnpm test scripts/audit/config-style-lint.spec.ts` exit 0.
- 8.1.3: task-implementer — remediate `.claude/agents/*.md` (12 files) + `.claude/skills/*/SKILL.md` (12 files) + `.claude/commands/*.md` (8 files) + `.claude/hooks/profiles/*.md` (3 files) to pass linter. Part-A: linter output. Part-B: edited files. Part-C gate: `node scripts/audit/config-style-lint.ts --strict` exit 0.
- 8.1.4: spec-compliance-reviewer + code-quality-reviewer — verify Part-B match + invariant compliance. Part-C gate: both reviewers PASS.

### 8.2 Verify automation: post-phase + post-N-sessions gates (DIM 2)
**Goal**: Deterministic verify gates that fire automatically; catch drift early.
**Rationale**: User §1.2 — verify currently ad-hoc; insufficient at phase boundaries.
**Tasks**:
- 8.2.1: sandwich-architect — design verify schedule (which checks fire post-phase vs post-N-sessions; checklist composition). Part-A: read existing `/verify-after-phase` command if any. Part-B: `agent-workspace/constitution/verify-schedule.md`. Part-C gate: schedule covers ≥6 distinct checks (config-lint, invariant-check, drift-check, hook-coverage, test-count-delta, charter-coherence-spot-check).
- 8.2.2: task-implementer — implement `scripts/verify/post-phase.sh`, `scripts/verify/post-n-sessions.sh`, `scripts/verify/drift-check.sh`. Part-A: spec from 8.2.1. Part-B: 3 shell scripts + scheduling hook in `.claude/hooks/`. Part-C gate: all scripts exit 0 against Phase 7 retroactively.
- 8.2.3: spec-compliance-reviewer + sandwich-verifier — adversarial review (does the gate actually catch a planted drift?). Part-A: insert synthetic drift in scratch branch. Part-B: detection report. Part-C gate: gate detects ≥3/3 planted drifts.

### 8.3 Charter-drift safety analysis report (DIM 3)
**Goal**: Retrospective audit of phases 0-7 vs charter.
**Rationale**: User §1.3 — uncertainty about how far project drifted from original. Safety analysis required.
**Tasks**:
- 8.3.1: research-scanner — read PROJECT_CHARTER.md + every `phase-N-complete.md` (N=0..7) + spec files; build evidence table. Part-A: phase complete files. Part-B: `agent-workspace/memory/audits/phase-0-7-evidence-table.md`. Part-C gate: each charter principle has ≥1 evidence row per phase.
- 8.3.2: master-planner — author retrospective audit synthesizing evidence. Part-A: evidence table. Part-B: `agent-workspace/memory/audits/phase-0-7-charter-drift-audit.md` with finding ratings (low/medium/high/critical). Part-C gate: ≥3 findings categorized; each medium+ finding has remediation task added to 8.4 backlog OR explicit defer-to-v2.4 rationale.
- 8.3.3: spec-compliance-reviewer — verify findings cite charter sections + phase artifacts. Part-C gate: 100% citation coverage.

### 8.4 Hook/script comprehensiveness audit (DIM 4) + carryforward fix-pack
**Goal**: Partition tasks into LLM-suited vs deterministic; close v2.3 carryforward backlog.
**Rationale**: User §1.4 — partition unclear, drift uncontrolled. Plus CF-21..CF-26 fold-in mandatory per Decision 027 §"Consequences" 3.
**Tasks**:
- 8.4.1: sandwich-architect — author task-partition-matrix.md (recurring tasks → LLM-suited or deterministic-suited; each deterministic row has script_path). Part-B: `agent-workspace/constitution/task-partition-matrix.md`. Part-C gate: ≥30 task rows; each "deterministic" row has script_path resolving to existing or planned file.
- 8.4.2: task-implementer — close CF-21 tool_use_id correlation (~50-80 LOC fix; per Decision 026). Part-A: `packages/core/src/dispatch/recorder.ts`. Part-B: edited recorder + correlation field in trace. Part-C gate: 50 dispatch correlation match rate ≥ 80%.
- 8.4.3: task-implementer — close CF-22 dispatch-recorder.spec.ts trim. Part-C gate: spec passes; LOC reduced.
- 8.4.4: task-implementer — close CF-23 SC-27 retro re-attest (depends on CF-21). Part-C gate: re-attestation file `agent-workspace/memory/attestations/sc-27-retro.md` exists.
- 8.4.5: task-implementer — close CF-24 read-only-tmpdir Win+Git-Bash portability. Part-C gate: existing test passes on Windows Git-Bash.
- 8.4.6: task-implementer — close CF-25 citation-linter dedup + CF-26 Mandate F architect-spec-vs-reality + G.7 substage parallelism flag + G.8 spec-opt-out template (4 small fixes batched). Part-C gate: each carryforward closure file in `agent-workspace/memory/closures/`.
- 8.4.7: task-implementer — implement net-new hooks/scripts identified in partition matrix (e.g., charter-coherence-spot-check, dependency-freshness-audit). Part-C gate: each new script exit 0 in dry-run.
- 8.4.8: spec-compliance-reviewer + code-quality-reviewer — full pass review. Part-C gate: both PASS.

### 8.5 Self-application bootstrap (DIM 5)
**Goal**: Orch dogfoods on its own development; ≥2 later substages run through orch queue.
**Rationale**: User §1.5 — current 7 phases sufficient to use orch on itself. Phase 8+ should approach via orch.
**Tasks**:
- 8.5.1: sandwich-architect — design dogfooding bootstrap (queue file format for self-tasks; dispatcher entry-point; OTEL trace path; rollback path if dogfood breaks main loop). Part-B: `agent-workspace/constitution/self-application-bootstrap.md`. Part-C gate: design covers ≥4 dogfood checkpoints.
- 8.5.2: task-implementer — implement dogfooding harness (`scripts/dogfood/run-self-task.ts` + queue file convention). Part-C gate: harness can dispatch synthetic self-task end-to-end + emit OTEL trace.
- 8.5.3: task-implementer — drop substage 8.6.1 + 8.7.1 into orch queue; let dispatcher pick them up; capture traces. Part-C gate: 2 traces exist at `agent-workspace/traces/phase-8-{8.6.1,8.7.1}.jsonl`; each contains `span.kind=ORCH_DAEMON_DISPATCH`.
- 8.5.4: sandwich-verifier — adversarial review (does dogfooding break main session continuity? rollback path tested?). Part-C gate: rollback path executed in dry-run; main session continues.

### 8.6 Multi-user / multi-project tenancy model (DIM 6)
**Goal**: Tenancy model + minimal demo for primary-user + 1-colleague case.
**Rationale**: User §1.6 — practical 2-user case; sharing + personal projects.
**Tasks**:
- 8.6.1: master-planner-revision — author tenancy model doc (file-level workspace separation by default per Decision 029 default; daemon-level only if file-level proves inadequate). Part-B: `agent-workspace/constitution/tenancy-model.md`. Part-C gate: doc covers 4 scenarios (shared project shared user; shared project personal token; personal project; cross-tenant isolation).
- 8.6.2: task-implementer — implement tenancy enforcement seam in `packages/core/src/tenancy/scope-resolver.ts` + minimal demo at `examples/multi-user/`. Part-C gate: `bash examples/multi-user/demo.sh` exit 0; user-A cannot read user-B trace.
- 8.6.3: spec-compliance-reviewer — verify tenancy model coheres with charter "personal-first". Part-C gate: PASS.

### 8.7 Community OSS readiness + config layering + telemetry sync + domain-workflow ontology (DIM 7)
**Goal**: OSS-publishable; community can fork + customize; telemetry seam ready.
**Rationale**: User §1.7 — orch as free OSS tool; config layering; telemetry sync; domain-workflow positioning.
**Tasks**:
- 8.7.1: sandwich-architect — design config layering (system → user → project → repo) + LICENSE choice (Decision 030 default MIT) + ontology stub structure. Part-B: `agent-workspace/constitution/config-layering.md` + `agent-workspace/ontology/domain-workflow.md` (stub). Part-C gate: layering doc has 4-layer table; ontology stub has "coding" domain row.
- 8.7.2: task-implementer — implement layered config resolver (`packages/core/src/config/layered-resolver.ts`) + 8 unit tests. Part-C gate: tests exit 0; resolver handles missing layers gracefully.
- 8.7.3: task-implementer — implement telemetry sync seam (`packages/core/src/telemetry/sync-seam.ts`; opt-in default OFF; pluggable sink). Part-C gate: seam compiles; default OFF; injectable sink.
- 8.7.4: task-implementer — author OSS-readiness files: LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, .github/ISSUE_TEMPLATE/*, .github/PULL_REQUEST_TEMPLATE.md. Part-C gate: each file exists; templates lint-valid.
- 8.7.5: task-implementer — npm publishability prep (`package.json` exports + files glob + `npm pack --dry-run`). Part-C gate: `npm pack --dry-run` exit 0; tarball <5MB.
- 8.7.6: spec-compliance-reviewer + code-quality-reviewer + sandwich-verifier — triple review (charter coherence + invariants + adversarial). Part-C gate: all 3 PASS; OSS-readiness checklist `bash scripts/audit/oss-readiness.sh` exit 0.

### 8.8 SC-39 retry conditional + verify + stage v2.3
**Goal**: Mirror 7.8 closure pattern; conditionally retry SC-39; stage v2.3.0 (no commit).
**Rationale**: Closes Phase 8; SC-39 default DEFER-AGAIN per Decision 025 unless CF-21 closure shows ≥80% match rate.
**Tasks**:
- 8.8.1: master-planner — evaluate SC-39 retry condition (read CF-21 telemetry from 8.4.2). Decision: retry OR defer-again. Part-B: `agent-workspace/memory/decisions/032-sc39-retry-or-defer.md`. Part-C gate: decision file exists.
- 8.8.2: task-implementer (conditional) — if retry: execute SC-39 self-evolution loop; if defer: skip with rationale. Part-C gate: trace exists OR defer-rationale documented.
- 8.8.3: sandwich-verifier — final phase verify (run `bash scripts/verify/post-phase.sh 8`); stage v2.3.0 across changed files (no commit, I-6 absolute). Part-B: `agent-workspace/memory/phase-8-complete.md`. Part-C gate: post-phase verify exit 0; `git status` shows staged-not-committed; `git log --oneline | wc -l` = 0.

## §4 Dimension → Substage map (no orphans)

| Dim # | Title | Substages |
|---|---|---|
| 1 | Drift audit | 8.1 |
| 2 | Verify automation | 8.2 |
| 3 | Charter-drift safety | 8.3 |
| 4 | Hook/script comprehensiveness + carryforwards | 8.4 |
| 5 | Self-application | 8.5 |
| 6 | Multi-user | 8.6 |
| 7 | Community/config layering/telemetry/ontology | 8.7 |
| 8 | Effort routing | cross-cutting; see §11 |

Verification: every dimension 1..7 has ≥1 substage (orphan-free); dim 8 is cross-cutting and threaded through every substage's `effort` column.

## §5 Carryforward → Substage map

| CF# | Item | Substage | SC# | Risk |
|---|---|---|---|---|
| CF-21 | tool_use_id correlation | 8.4.2 | SC-48 | HIGH (~50-80 LOC) |
| CF-22 | dispatch-recorder.spec trim | 8.4.3 | SC-48 | LOW |
| CF-23 | SC-27 retro re-attest | 8.4.4 | SC-48 | MEDIUM (depends CF-21) |
| CF-24 | read-only-tmpdir Win+Git-Bash | 8.4.5 | SC-48 | LOW |
| CF-25 | citation-linter dedup | 8.4.6 | SC-48 | LOW |
| CF-26 | Mandate F architect-spec-vs-reality | 8.4.6 | SC-48 | MEDIUM |
| G.7 | substage parallelism flag | 8.4.6 | SC-48 | LOW-MED |
| G.8 | spec-opt-out template | 8.4.6 | SC-48 | LOW |
| SC-39 | self-evolution loop retry | 8.8.1, 8.8.2 | SC-48 | CONDITIONAL |

## §6 Budget table

| Substage | Min (K) | Mid (K) | Max (K) | Critical-path |
|---|---|---|---|---|
| 8.0 | 90 | 120 | 160 | yes (research front-load) |
| 8.1 | 100 | 140 | 200 | yes (gates 8.2..8.4) |
| 8.2 | 80 | 110 | 150 | partially (gates 8.8.3) |
| 8.3 | 110 | 150 | 220 | partially (feeds 8.4 backlog) |
| 8.4 | 130 | 180 | 260 | yes (CF-21 → 8.8.1) |
| 8.5 | 90 | 130 | 180 | partially (gates dogfood) |
| 8.6 | 80 | 110 | 150 | no |
| 8.7 | 110 | 160 | 230 | no |
| 8.8 | 50 | 80 | 120 | yes (phase close) |
| **TOTAL** | **840** | **1180** | **1670** | — |

Budget envelope mid-estimate ~1.18M tokens across ~14 sessions × ~85K avg/session. Wind-down at 200K real per session ⇒ comfortable.

## §7 DAG (ASCII)

```
                    8.0 (research + decisions 028-031)
                          |
              +-----------+-----------+-----------+
              |           |           |           |
            8.1         8.3         8.6 ───────► 8.5 (dogfoods 8.6.1)
          (config       (charter      (tenancy)        |
           audit)        drift)                        |
              |           |                            |
              |           +────► remediation ────► 8.4 (hooks + CF fix-pack)
              |                                        |
              +────────► 8.2 (verify automation) ──────+
                                                       |
                                                     8.7 (OSS readiness; dogfooded by 8.5)
                                                       |
                                                     8.8 (SC-39 + verify + stage v2.3)
```

Parallel opportunities (G.7 substage parallelism flag enables): 8.1 ∥ 8.3 ∥ 8.6 after 8.0 closes. 8.4 sequenced after 8.1+8.3 (needs config-lint baseline + drift findings). 8.7 sequenced after 8.6 (tenancy model informs config-layering scope).

## §8 Stop conditions

**DONE** (all required):
- All 8 dimensions have ≥1 closed substage with deterministic gate green.
- SC-40..SC-48 all green.
- All carryforwards CF-21..CF-26 + G.7 + G.8 closed (or explicit defer-to-v2.4 rationale).
- v2.3.0 staged across changed files; `git log --oneline | wc -l` = 0 (I-6 ABSOLUTE).
- `phase-8-complete.md` written with closure attestation.

**ESCALATE** (single unrecoverable):
- 3× consecutive deterministic gate failure on the same substage task.
- I-6 violation (any `git commit` reaches HEAD).
- Charter principle conflict surfaces with no Decision 027 §"Open question"-style resolution.
- Real-transcript wind-down (200K) fires inside a substage with no checkpoint.
- Self-application (8.5) breaks main session loop AND rollback path fails.

**I-6 ABSOLUTE**: 0 commits across entire Phase 8. Decision 020 binding.

## §9 SC numbering (SC-40..SC-48)

| SC# | Title | Substage | Verification |
|---|---|---|---|
| SC-40 | Config-style-guide + linter green | 8.1 | `node scripts/audit/config-style-lint.ts --strict` exit 0 |
| SC-41 | Verify automation deterministic | 8.2 | `bash scripts/verify/post-phase.sh 7` exit 0 (retro) |
| SC-42 | Charter-drift audit + remediation | 8.3 | audit file exists; ≥3 findings categorized |
| SC-43 | Task-partition matrix complete | 8.4 | matrix exists; 100% deterministic rows have script_path |
| SC-44 | Self-application ≥2 dogfooded substages | 8.5 | ≥2 trace files at `agent-workspace/traces/phase-8-*.jsonl` |
| SC-45 | Tenancy model + multi-user demo | 8.6 | `bash examples/multi-user/demo.sh` exit 0 |
| SC-46 | OSS-readiness checklist green | 8.7 | `bash scripts/audit/oss-readiness.sh` exit 0 |
| SC-47 | Effort-routing matrix 100% coverage | cross-cut | grep effort_mode in dispatch scripts ≥ 1; 100% substage coverage |
| SC-48 | Carryforward closure (CF-21..CF-26 + G.7/G.8 + SC-39) | 8.4, 8.8 | each closure file exists; SC-39 decision file exists |

## §10 Default decisions (orchestrator may rely on these without re-asking)

- **D-A Carryforward closure approach**: batch in 8.4 with one task per CF; CF-21 first (gates CF-23); CF-22+CF-25+CF-26+G.7+G.8 in single batch task 8.4.6.
- **D-B Self-application minimum scope**: 2 substages (8.6.1 + 8.7.1) dogfooded through queue. Sufficient for SC-44.
- **D-C Tenancy model default**: file-level workspace separation (per-user + per-project subdirectory in `agent-workspace/<user>/<project>/`). Daemon-level multi-tenant deferred to v2.4 unless file-level proves inadequate during 8.6 demo.
- **D-D LICENSE default**: MIT (permissive, npm-friendly, low-friction for community fork). Apache-2.0 alternative available if 8.7.1 architect surfaces patent-grant rationale.
- **D-E Telemetry sync default**: opt-in disabled. Default OFF until user explicitly sets `ORCH_TELEMETRY_SYNC=true`. Wire format JSONL over HTTPS POST; endpoint = stub URL in v2.3 (real endpoint = v2.4).
- **D-F Charter-drift safety threshold**: full retrospective audit performed; ≥3 medium-or-higher findings → remediation tasks added to 8.4 backlog (renumbered as 8.4.7+); <3 findings → close-without-action with attestation.
- **D-G SC-39 retry policy**: DEFER-AGAIN default per Decision 025. Retry only if CF-21 telemetry shows ≥80% tool_use_id match rate over ≥50 dispatches at 8.8.1 read-time.
- **D-H Effort-mode dispatch wire**: dispatch scripts read `effort_mode` from envelope JSON; prepend `/effort <mode>` to prompt before passing to subagent. Master-planner annotates `effort` column per substage in §3.
- **D-I Config-style-guide normative format**: Decision 028 ratifies; default = frontmatter-required + section-ordering enforced + max-LOC budget per file type.
- **D-J v2.3 release timing**: stages at end of Phase 8 (substage 8.8.3); does NOT ship a Phase 9 RC. Per Decision 027 §"Open question" → master-planner resolves to "stage at Phase 8 close".

## §11 Effort routing matrix

| Substage | Model | Effort | Rationale |
|---|---|---|---|
| 8.0.1 research-config-drift | sonnet | high | research-scanner default; drift inventory mechanical |
| 8.0.2 research-oss-patterns | sonnet | high | reference-repo scan |
| 8.0.3 decisions 028-031 | opus | max | strategic architecture; binding |
| 8.1.1 architect config-style | opus | max | normative format design = high-leverage |
| 8.1.2 lint impl | sonnet | medium | TS + tests, mechanical |
| 8.1.3 remediate `.claude/*` | sonnet | low | repetitive edits; lint-driven |
| 8.1.4 review | sonnet | medium | reviewer pair |
| 8.2.1 architect verify schedule | sonnet | high | infrastructure design |
| 8.2.2 impl gates | sonnet | medium | shell scripting |
| 8.2.3 adversarial review | opus | max | gate validity test |
| 8.3.1 evidence table | sonnet | high | systematic read |
| 8.3.2 retrospective audit | opus | max | synthesis + finding rating; high-judgment |
| 8.3.3 citation review | sonnet | medium | mechanical |
| 8.4.1 architect partition matrix | opus | max | partition design = high-leverage |
| 8.4.2 CF-21 fix | sonnet | medium | code edit ~80 LOC |
| 8.4.3..6 CF batch | sonnet | low | small fixes |
| 8.4.7 net-new hooks | sonnet | medium | deterministic scripting |
| 8.4.8 review | sonnet | medium | reviewer pair |
| 8.5.1 architect self-app | opus | max | rollback design = critical |
| 8.5.2 dogfood harness | sonnet | high | infra impl |
| 8.5.3 dispatch substages | sonnet | medium | execution wire |
| 8.5.4 verify | opus | max | adversarial; main-loop safety |
| 8.6.1 tenancy doc | opus | max | architectural |
| 8.6.2 enforcement + demo | sonnet | high | infra impl |
| 8.6.3 charter coherence | sonnet | medium | review |
| 8.7.1 architect OSS + layering | opus | max | strategic; community-binding |
| 8.7.2 layered-resolver impl | sonnet | medium | TS + tests |
| 8.7.3 telemetry seam | sonnet | medium | TS + opt-in plumbing |
| 8.7.4 OSS docs | sonnet | low | template fill |
| 8.7.5 npm prep | sonnet | low | config tweaks |
| 8.7.6 triple review | opus | max | adversarial closing |
| 8.8.1 SC-39 decision | opus | max | telemetry-driven judgment |
| 8.8.2 conditional impl | sonnet | medium | execute or skip |
| 8.8.3 final verify + stage | sonnet | high | mirror 7.8 closure |

Coverage: 100% of substages annotated. Default subagent dispatch tooling reads `effort` column at dispatch time.

## §12 Self-application milestones

- **First dogfood checkpoint**: 8.5.3 — orch dispatches 8.6.1 (tenancy model authoring) through its own queue. Trace at `agent-workspace/traces/phase-8-8.6.1.jsonl`.
- **Second dogfood checkpoint**: 8.5.3 — orch dispatches 8.7.1 (OSS readiness architect) through own queue. Trace at `agent-workspace/traces/phase-8-8.7.1.jsonl`.
- **CF-21 telemetry first real read**: 8.8.1 — SC-39 retry decision reads correlation match rate from CF-21 telemetry (post 8.4.2 closure). Demonstrates feedback loop.
- **Final demonstration (SC-44 closure)**: ≥2 substages traced through orch's own dispatcher; rollback path tested in 8.5.4. Confirms orch is dogfoodable.

## §13 Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Master-planner stall (occurred 1×) | Resolved this re-dispatch | HIGH | Tighter brief; single-shot Write |
| Self-application breaks main loop | LOW-MED | CRITICAL | 8.5.4 adversarial verify; rollback path tested |
| Multi-user model contradicts charter "personal-first" | LOW | HIGH | 8.6.3 explicit charter-coherence review |
| Community framework scope creep | MED | HIGH | Substage budget caps; OOS list explicit (§2) |
| OSS docs spawn rework loop | MED | LOW-MED | Template-driven; 8.7.4 effort=low |
| Charter audit surfaces critical findings late | MED | HIGH | Substage 8.3 sequenced before 8.4 backlog finalization |
| CF-21 fix exceeds 80 LOC | MED | MED | 8.4.2 budget bumped; risk-flag if >120 LOC |
| Dogfood telemetry fails ≥80% match | LOW | LOW | DEFER-AGAIN default per Decision 025; non-blocking |
| Wind-down mid-substage 8.4 (8 tasks) | MED | MED | Substage 8.4 split into checkpointable mini-batches at 8.4.4 boundary |
| Tenancy model file-level proves inadequate | LOW-MED | MED | Daemon-level fallback documented in 8.6.1; deferral to v2.4 acceptable |
| Effort-routing dispatch wire breaks subagents | LOW | MED | Backwards-compat: missing effort_mode = use subagent default |
| /remote-control mode interferes with dogfood | LOW | LOW | Existing — no-op for substages running under bg dispatch |

## §14 Final YAML completion block

```yaml
phase: 8
status: pending
substages: [8.0, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8]
sc_numbering: [SC-40, SC-41, SC-42, SC-43, SC-44, SC-45, SC-46, SC-47, SC-48]
total_budget_estimate_K: 1180
i6_commits: 0
v2_3_release: STAGE_AT_8.8_NO_COMMIT
dimensions_addressed: [1, 2, 3, 4, 5, 6, 7, 8]
carryforwards_mapped: [CF-21, CF-22, CF-23, CF-24, CF-25, CF-26, G.7, G.8, SC-39]
default_decisions: [D-A, D-B, D-C, D-D, D-E, D-F, D-G, D-H, D-I, D-J]
charter_coherence_verified: true
parallel_opportunities: [8.1 || 8.3 || 8.6 after 8.0]
critical_path: [8.0 -> 8.1 -> 8.4 -> 8.8]
expected_sessions: 14
expected_calendar_days: 6
```
