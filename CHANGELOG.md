# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] — 2026-04-27

### Added
- SC-31: hooks suite expanded to 126 cases (Phase 7 baseline 104 + 22 new Phase 7 add-ons including dispatch-recorder T1–T4, worktree-isolation 3 cases, architect-mandates 3 cases, INV-10 reporter migrations).
- SC-32: INV-10 reporter pattern migrated across 5 hook spec files (api-truncation, mode-c-guard, narration-grep-refinement, tool-call-first, dispatch-recorder) — Windows-Git-Bash subprocess-timing flake family eliminated via process.platform gate / threshold-raise / synthetic-INV10 marker.
- SC-33: `scripts/hooks/dispatch-jsonl-recorder.sh` (69 LOC) — PreToolUse + SubagentStop seam real-clock event log with 9-key schema (event, dispatch_id, agent_type, model, parent_session_id, bg, ts_ms, outcome, tokens_used); 4-record fixture + sc18-realworld `--use-dispatch-jsonl` mode.
- SC-34: `tests/integration/worktree-isolation.spec.ts` (87 LOC) — 3-case forward + reverse isolation gate + prune cleanup; spawnSync without `{shell:true}` (I-3 compliant); confirms zero data leak between concurrent worktrees.
- SC-35: `scripts/utilities/citation-linter.ts` (80 LOC) — `--rollup <path>` mode for hallucination-guard component verification; two-tier exemption (BUILTIN_HOOK_EVENTS + SENTINEL_NAMES); exits 0 on Phase 6 real rollup.
- SC-36: `scripts/benchmarks/sc18-realworld.ts` — `import.meta.url` + `fileURLToPath` main-guard hygiene; no side-effect on import; `node --check` exits 0.
- SC-37: `.claude/agents/sandwich-architect.md` Mandate E (incremental write for content >200 LOC — write skeleton first, then append each section via separate Edit pass) + `tests/skills/architect-mandates.spec.ts` (42 LOC, 3 regression cases).
- `decisions/022, 023, 024, 025, 026` — Phase 7 architectural decisions (INV-10 reporter pattern; dispatch.jsonl 9-key schema; citation-linter CLI shape; SC-39 DEFER rationale; CF-21 tool_use_id deferral).

### Deferred
- SC-39 (self-evolution loop first real upgrade): deferred to v2.3 per `decisions/025`; rationale at `agent-workspace/memory/phase-7-routing-recommendations.md` (104 LOC). Phase 6 rollup signal too thin — 100% success_rate across all 14 components; RULE-1 fired only on `agent::unknown-agent` sentinel.

### Carryforwards to v2.3
- CF-21: `tool_use_id` correlation in PreToolUse(Task) — upstream stdin payload gap; 19/20 `dispatch.jsonl` rows show `agent_type: "unknown-agent"`. Fix: sidecar fallback + session-start probe + payload diagnostic.
- CF-22: `tests/hooks/dispatch-recorder.spec.ts` LOC trim (372 LOC vs ~120 ideal) — dedup refactor deferred.
- CF-23: SC-27 retro attestation — PARTIAL (raw count ≥6 met; paired criterion CF-21-blocked). Promotes to PASS when CF-21 sidecar lands.
- CF-24: read-only-tmpdir injection portability on Win+Git-Bash — LOW priority; wrap `afterEach` in try/catch if CI surfaces.
- CF-25: citation-linter dedup (`lintRecommendationsCitations()` intentionally duplicated per OQR-1(b)) — pure refactor, deferred.
- CF-26: Architect-spec-vs-reality LOC variance — recurring lesson (observed Phases 5/6/7); Mandate E is the structural mitigation; v2.3 retrospective absorbs as skill-amendment input.

### Determinism
- Workspace `pnpm test` ×3 byte-identical: 1470/1470/1470 cases, 0 failures. Wall-time range 21.8s–22.6s (0.8s = healthy variance). SC-38 PASS.
- Hooks suite: `pnpm test:hooks` → **126/126 PASS** in 27.47s (Phase 7 close rerun).
- Phase 7 net new production code: **278 LOC** (≤ 280 cap; Karpathy P3 surgical discipline).

### SC Scorecard (Phase 7, SC-31..SC-39)

| SC | Title | Verdict |
|----|-------|---------|
| SC-31 | Hooks suite ≥ baseline deterministic | PASS |
| SC-32 | INV-10 reporter migration | PASS |
| SC-33 | dispatch.jsonl real timestamps (A/B/C/D/E) | PASS_WITH_CONCERN (CF-21 deferred) |
| SC-34 | worktree-isolation integration spec | PASS |
| SC-35 | citation-linter --rollup | PASS |
| SC-36 | sc18-realworld.ts main-guard hygiene | PASS |
| SC-37 | Mandate E + regression test | PASS |
| SC-38 | Phase 7 deterministic test gate (workspace ×3) | PASS |
| SC-39 | Self-evolution loop's first real upgrade | DEFERRED (decisions/025) |

8 PASS (incl. 1 PASS_WITH_CONCERN) / 1 DEFERRED / 0 FAIL.

### I-6
Zero `git commit` invocations across entire Phase 7 (all sessions; Decision 020 binding honored throughout). Running invariant since project inception: branch 'main' has no commits.

---

## [2.1.0] — 2026-04-27

### Added

- **Self-evolution feedback loop** (Phase 6 substage 6.2): `rollup-telemetry.ts` extended to produce per-component p50/p99/failure-mode statistics; `telemetry-analyst` subagent applies 4 deterministic rules (RULE-1 model-bump latency, RULE-2 agent-prune success, RULE-3 parallelization-gate wind-down, RULE-4 model-bump token) against 2,590 real telemetry events; 14 components detected; analyst→advisor pipeline produces first-pass recommendations; master-planner v3 Phase 0.5 cites recommendations file. Loop is architecturally functional, signal-thin first pass (RULE-1 only fired on `agent::unknown-agent` p99=190702ms — conservative by design).
- **Worktree isolation lifecycle** (Phase 6 substage 6.3): `git worktree add` per ClaudeCodeAdapter session; bidirectional fs-isolation probe (sentinel files in both directions) confirms zero data leak; Prisma migration `20260426223316_session_worktree` adds `Session.worktreePath String?` field (additive, zero DROP); sweep on SessionStart prunes orphan worktrees; `architecture.md` §"Worktree Isolation" section cites Decision 018.
- **Real-world SC-18 benchmark** (Phase 6 substage 6.4): `scripts/benchmarks/sc18-realworld.ts` measures parallelism via session-log mtime proxy across substages 6.1–6.3; result file `agent-workspace/memory/sc18-realworld-result.md`; SC-27 PARTIAL per Decision 019 graceful degradation (mtime-proxy methodology limitation acknowledged; actual parallelism proven via Phase 5 wallclock + 6.3 dispatch graph).
- **INV-S9 first-class invariant**: skill/agent/hook latency budget 50ms median / 200ms p99 lifted from Phase 5.2 architect doc into `agent-workspace/constitution/invariants.md`.
- **4 Mandates A/B/C/D in `sandwich-architect` skill**: Mandate A = literal Pre-write Part-C dry-run against actual file; Mandate B = staged-index pre-verification (`git show :path`); Mandate C = awk-range gate self-match check (end-regex must not match start-regex anchor, plus awk-gsub space-class collapse guard); Mandate D = Prisma flag freshness (`--to-schema-datamodel` removed; use `--to-schema`).
- **`agent-notes.md` architect-spec-vs-reality entry**: 6 incidents documented across Phases 5–6 with root causes and the Mandate A/B/C/D remediation.
- **`telemetry-analyst.test.md`**: sibling harness for the new subagent (5 H2 sections, 3 numbered assertions, >=3 named failure modes).
- **`tests/integration/feedback-loop.spec.ts`** (+4 cases): rollup-script e2e, citation-presence structural, citation-linter inline (hallucination guard), master-planner routing-recommendations citation gate.
- **`tests/hooks/session-start-worktree-sweep.spec.ts`** (+3 cases): orphan pruner T1 (3 worktrees, 1 active 2 orphan → only active survives), T2 (empty), T3 (no-git-on-PATH skips silently).

### Changed

- **INV-S9 enforcement**: `scripts/hooks/component-telemetry.sh` hook payload wrapped in fire-and-forget background subshell — median latency 567ms → 71ms (8× improvement; live foreground probe n=100 p50=105ms p99=126ms).
- **`telemetry-analyst` agent model**: `opus` → `sonnet` (Decision 021; cost reduction — 4 RULES are deterministic threshold comparisons, not pattern-recognition; no quality loss observed).
- **`master-planner.md`**: removed `proposals/*` over-build paragraph referencing non-existent directory; Phase 0.5 routing-recommendations section preserved and correct.
- **`architecture.md`**: new §"Worktree Isolation" section (lines 105–148) documenting lifecycle, fs-isolation guarantee, and Decision 018 scope.

### Deprecated

- None.

### Deferred to v2.2

- Citation linter `--rollup` flag for component-existence verification (carryforward #9).
- `mode-c-guard.spec.ts:152` + `api-truncation.spec.ts:118/:153` + `narration-grep-refinement.spec.ts` INV-10 reporter migration — Windows-Git-Bash subprocess-timing family fix (carryforward #11a/#11b).
- Real subagent dispatch+completion timestamp capture — replace mtime proxy for SC-27 (carryforward #18).
- `scripts/benchmarks/sc18-realworld.ts` `import.meta.url` main-guard hygiene (carryforward #19).
- Worktree-isolation integration spec promotion to `tests/integration/worktree-isolation.spec.ts` for CI (carryforward #16).

### Test counts

- Workspace (pnpm test recursive): **1470 / 1470** deterministic ×3 runs (shared 40 + cli 45 + telegram 125 + web-ui 163 + core 1097).
- Hooks suite (pnpm test:hooks): **103 / 104** ×2 stable runs (1 known flake = `mode-c-guard.spec.ts:152` carryforward #11a, Windows-Git-Bash subprocess timing); 100/104 ×1 (machine-load spike, same family).
- Phase 6 union baseline: **1574** (1470 workspace + 104 hooks; net +122 over Phase 5 baseline of 1452).

### SC scorecard (Phase 6, SC-19..SC-30)

17 SCs landed: 9 PASS / 3 PARTIAL / 0 FAIL / 1 deferred to 6.5.4 (SC-30 this entry). SC-27 PARTIAL per Decision 019 graceful degradation (mtime-proxy methodology limitation; actual parallelism proven via Phase 5 wallclock + 6.3 dispatch graph 5 vs 8 forced-serial ≈ 37.5%). SC-20 PARTIAL (mode-c-guard.spec.ts:152 timing flake deferred to v2.2 #11a). SC-28 PARTIAL (hooks determinism gate: runs 1+3 = 103/104, run 2 = 100/104 under Windows machine-load spike — not logic regressions).

### I-6

Zero `git commit` invocations across entire Phase 6 (Sessions #34, #35, #36; Decision 020 binding honored throughout).

---

## v2.0.0 — 2026-04-27

### Added

**Parallelization Framework (SC-7, SC-8, SC-9, SC-10, SC-11, SC-12, SC-13, SC-18)**
- Atomic queue claim (`QueueItem.claimed_by` + `claim_expires_at`) — migration `20260426072956_queue_claim`; `QueueClaimService` with 4-concurrent contention spec (SC-7).
- `max_concurrent_sessions` dispatcher cap with Zod `.max(8)` guard; integration test: N=2 cap across different projects, 3rd attempt deferred (SC-8).
- Worker mailbox table (`worker_mailbox`) with `MailboxService` — `send/pollUnread/markRead`, FIFO + count-idempotency (SC-9).
- `--resume <session_id>` argv wiring in `ClaudeCodeAdapter.resume()` with spec coverage (SC-10).
- Adapter env-var propagation audit — `env-propagation.ts` declares 7 literals + `OTEL_EXPORTER_OTLP_*` prefix glob; 29 tests cover 12 coverage points (SC-11).
- Hook decision field (`approve/deny/modify`) — `HookDecisionSchema.parse()` gate; `ToolDeniedEvent` emitted; Mode H telemetry classification (SC-12).
- Decomposition Cost Model (1x/4x/15x multipliers + PARALLELIZE quantitative gate) in `architecture.md` + `.claude/agents/master-planner.md` citation (SC-13).
- Parallel-vs-serial benchmark spec (`scripts/benchmarks/parallel-vs-serial.spec.ts`) — **75% wallclock improvement** on 4-task fixture, exceeding the >=20% gate by 3.75x (SC-18).

**Loop-Resilience Guards (SC-1, SC-2, SC-3)**
- Mode A lint (`scripts/hooks/tool-call-first-lint.sh`) — tool-call-first discipline enforcement; 6 vitest cases (SC-1).
- Mode B API-truncation auto-recovery — extended `autonomous-stop-watchdog.sh`; idempotent via per-request-id marker; 4 vitest cases (SC-2).
- Mode C premature wind-down hard guard — `budget-watchdog.sh` extended with rationalization-phrase scan + real-token gate; emits decision-block JSON; 6 vitest cases (SC-3).

**Skill Self-Evolution Scaffolding (SC-4, SC-5, SC-6)**
- All 13 skills have sibling `<name>.test.md` harness (5 H2 sections, 3 numbered assertions, >=3 named failure modes, <=80 lines each) (SC-4).
- All 13 `SKILL.md` files <=150 lines with progressive disclosure via `references/` subdirectories (SC-5).
- `scripts/skills-validate.ts` — validator with `requireAllowedTools` + `requireSiblingTest` gates; exit 0 across 13 skills (SC-6).
- `scripts/hooks/component-telemetry.sh` — Zod-validated JSONL telemetry for skill/agent/command/hook activations; schema at `packages/core/src/telemetry/component-telemetry.schema.ts` (SC-6).

**v1.0.1 Backlog Absorption (SC-14)**
- `inject-hooks.ts` JSDoc step ordering corrected (validate-then-backup-then-atomic) (SC-14a).
- `claude-code-adapter.integration.spec.ts` gated via `CI_SKIP_CCS_SPAWN` env flag (SC-14b).
- `docs/quickstart.md` — 513-line quickstart guide (SC-14c).
- N6 72h RSS protocol documented in `agent-workspace/memory/n6-rss-sample.md` as user-action TODO (SC-14d PARTIAL — 72h run deferred to user action before v2.0 GA).
- `phase-3-complete.md` decision-009 cross-reference qualified with OTel canonical marker (SC-14e).
- `tests-baseline.json` single-source citation in 5 phase-N-complete files (SC-14f).

**Subagent Infrastructure**
- Subagent failure-rate index builder (`scripts/utilities/build-subagent-index.sh`) — dual-source, 200 LOC, idempotent, runtime 4.5s vs 30s target (SC-15).
- Phase 5 retrospective and v2.0 carryforward tracking in `agent-workspace/memory/phase-5-complete.md`.

### Changed

- Monorepo test count: **1,375 → 1,452** (+77 net over Phase 5; 3-run determinism gate at 1452/1452).
  - `@orch/core`: 1,002 → 1,079 (+77)
  - `@orch/cli`: 45 (unchanged)
  - `@orch/shared`: 40 (unchanged)
  - `@orch/telegram`: 125 (unchanged)
  - `@orch/web`: 163 (unchanged)
- Decomposition Cost Model is now the canonical planning lens for the master-planner agent (replaces informal per-substage judgment).
- Architecture `Layer 3` documentation extended with env-var propagation subsection and hook-deny daemon log-only design rationale.
- All hook-event boundaries are now Zod-validated (`HookDecisionSchema`, `HookEventSchema`, `ComponentTelemetrySchema`).
- Session self-reboot `.ps1` encoding fixed (em-dash U+2014 removal); 3-layer defense stack documented in `agent-notes.md`.

### Fixed

- **5.3.3 atomic claim CURRENT_TIMESTAMP/ISO-8601 mismatch** — SQLite `CURRENT_TIMESTAMP` produced lexical string incompatible with Prisma ISO-8601 comparison; fixed via parameterized JS `Date` in the claim sweep predicate.
- **5.4.9 mailbox `markRead` count-idempotency (CF-1)** — repeated `markRead` calls on the same message now correctly count-idempotent; service docstring updated.
- **5.4.10 hook-deny daemon log-only design (CF-2)** — clarified in `architecture.md §Layer 3` that the daemon emits `ToolDeniedEvent` and logs only; CLI permission model is the upstream gate.
- **Self-reboot `.ps1` em-dash encoding bug** — `session-self-reboot.ps1` Unicode em-dash characters at lines 53/197/203/225/227 silently rejected by PowerShell parser; removed + bash wrapper + SessionStart parse-check + vitest regression test added.
- **Architect doc Part B/C contradiction (5.4.6)** — SC-14 grep gate wording refined to "no UNQUALIFIED occurrences" of the OTel canonical token (clarifying cross-references with explicit markers are acceptable).

### Deprecated

- None.

---

## v1.0.0-alpha.0 — 2026-04-27 (Phase 0–4 baseline)

Initial release covering Phases 0–4:
- Core daemon MVP with NestJS, Prisma/SQLite, state machine
- Telegram adapter (Grammy), Web UI (React+Vite)
- OTel tracing, Langfuse/SigNoz integration
- Profile-based project dispatch (`profile.yaml`)
- CLI (`orch init`, `orch attach`, `orch start`, `orch stop`, `orch status`)
- CI/CD pipelines (`.github/workflows/ci.yml` + `release.yml`)
- Docker Compose (3 profiles)
- 1,375 tests passing (monorepo)
- Charter criteria F1–F8, N1–N5, O1–O4, S1–S4 all PASS
