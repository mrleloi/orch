# Phase 4 Master Plan — Polish & Share

> **Status**: APPROVED — produced by master-planner (opus) on 2026-04-26
> **Pre-requisite**: Phase 3 COMPLETE (~1,346 monorepo tests, all I-1..I-15 PASS, verifier PASS_WITH_CONCERNS with 3 minor concerns; 1 inline-fixed in 3.13, 1 carried forward as MINOR-3, plus #4/#9/#10).
> **Supersedes**: `phase-4-polish.md` stub (kept as scope-of-work reference; this plan is the executable decomposition).

---

## A. Phase Goal Statement

Transform Orch from a feature-complete daemon into a **shippable, npm-installable, dogfoodable v1.0** product. Phase 4 closes the four Phase-3 carryforwards (#4 controller config, #9 adapter prepend behavioral coverage, #10 SessionManager schema extension, MINOR-3 SessionLock teardown noise), polishes the operator UX (CLI scaffolding, hook injection), produces documentation a senior outsider can read in < 5 minutes, validates the full container stack via Docker Compose, wires CI on Node 20+22, and runs an exhaustive end-to-end verification gate before tagging v1.0.0.

The entire phase is gated on the **Definition of Done** from `phase-4-polish.md`: a project owner can install on a clean machine in < 5 minutes, attach a project in < 60 seconds, dispatch their first plan in < 2 minutes, and a peer can repeat the steps with zero hand-holding.

Charter alignment:
- **F1, F2, F7, F8** — operator scaffolding, multi-project dispatch, hook injection (Tasks 4.1, 4.2, 4.7).
- **F3, F4, F5, F6** — full E2E re-verification at Task 4.13 against fresh install.
- **N1, N2, N3, N4, N6** — re-asserted under fresh-machine conditions in Task 4.13.
- **O1–O4** — re-asserted via integration trace inspection in Task 4.13.
- **S1–S4** — explicit re-audit in Task 4.13 (confirmation flow, no credential reads, localhost binding, hook-injection consent).
- **#10 SessionManager schema extension** lifts the last placeholder (`PLACEHOLDER_COMMIT='HEAD'`, `sessionLogPath: null`) and deletes the R1 regression guard, finishing the F4 evidence chain begun in Phase 3.

---

## B. Task Sequence

| # | Title | Type | Subagent | Model | Budget | Deps |
|---|---|---|---|---|---|---|
| 4.0 | Phase 4 Kickoff Scaffolding | FOCUSED_IMPL | sandwich-dev | sonnet | ~50K | — |
| 4.1 | SessionManager Schema Extension (#10) | FOCUSED_IMPL | sandwich-dev | sonnet | ~150K | 4.0 |
| 4.2 | Adapter Prepend Behavioral Coverage (#9) | FOCUSED_IMPL | sandwich-dev | sonnet | ~30K | 4.0 |
| 4.3 | Module Shutdown Ordering (MINOR-3) | FOCUSED_IMPL | sandwich-dev | sonnet | ~50K | 4.0 |
| 4.4 | Polish CLI Init Flow | FOCUSED_IMPL | sandwich-dev | sonnet | ~80K | 4.0 |
| 4.5 | Hook Injection Utility | FOCUSED_IMPL | sandwich-dev | sonnet | ~60K | 4.4 |
| 4.6 | Example Integration (StockForge + Generic) | FOCUSED_IMPL | sandwich-dev | sonnet | ~60K | 4.5 |
| 4.7 | CI Setup (GitHub Actions) | FOCUSED_IMPL | sandwich-dev | sonnet | ~40K | 4.0 (parallel-eligible) |
| 4.8 | Docker Compose Validation | FOCUSED_IMPL | sandwich-dev | sonnet | ~40K | 4.0 (parallel-eligible) |
| 4.9 | Comprehensive README | DOC | sandwich-dev | sonnet | ~50K | 4.4, 4.5 |
| 4.10 | Configuration Reference (incl. #4 doc note) | DOC | sandwich-dev | sonnet | ~45K | 4.1, 4.4 |
| 4.11 | Architecture Overview + Troubleshooting + Release Checklist | DOC | sandwich-dev | sonnet | ~70K | 4.9, 4.10 |
| 4.12 | Final E2E Verification Gate | VERIFY | sandwich-verifier | opus | ~80K | all 4.1–4.11 |
| 4.13 | Phase 4 Close (housekeeping + v1.0.0 tag) | FOCUSED_IMPL | sandwich-dev | sonnet | ~30K | 4.12 PASS |

**Total estimated budget**: ~835K tokens across **14 fresh sessions**. (Budget headroom of ~150K reserved for unknowns: any task exceeding 150K planned budget — currently only 4.1 — has explicit split contingency in Task Detail.)

---

## C. Task Detail

### Task 4.0 — Phase 4 Kickoff Scaffolding
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~50K · **Deps**: none

Lightweight launching session that establishes Phase 4 directory layout and confirms baseline. Pattern matches Phase 1.0 / Phase 2.0 / Phase 3.0 scaffolding sessions.

**Scope**:
1. Create `docs/` directory tree if absent: `docs/quickstart.md` (placeholder), `docs/configuration.md` (placeholder), `docs/troubleshooting.md` (placeholder), `docs/architecture.md` (placeholder), `docs/release.md` (placeholder). Each file gets a one-line "Phase 4 Task 4.X will populate this" marker so subsequent tasks have stable file paths to write to.
2. Create `examples/` directory with empty `examples/stockforge-integration/` and `examples/generic-nodejs-project/` subfolders.
3. Create `.github/workflows/` directory with two empty placeholder files (`ci.yml`, `release.yml`) marked `# Phase 4 Task 4.7 will populate`.
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm test` across the monorepo. Confirm clean baseline matches Phase 3 exit (981 core, 22 cli, 40 shared, 125 telegram, 163 web-ui = ~1,346 default + 15 integration).
5. Read `agent-workspace/memory/phase-3-complete.md` carryforward table; cross-reference into `current-execution.md` "Phase 4 Carryover" section (already written) — confirm consistency, no fix needed if accurate.
6. Append session log; update `current-execution.md` to reflect Phase 4 active.

**Acceptance criteria**:
- All placeholder paths exist; gates green; baseline test counts match Phase 3 exit numbers.
- No production code touched.
- No git commits (I-6).

**Risks**: Low. Setup-only.

---

### Task 4.1 — SessionManager Schema Extension (#10 carryforward)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~150K · **Deps**: 4.0

**Closes Phase 3 carryforward #10.** Largest single Phase 4 task. The Phase 3 R1 regression guard at `integration.spec.ts:639-689` pins the placeholder behavior (`PLACEHOLDER_COMMIT='HEAD'`, `sessionLogPath: null`) until this lands. When this task completes, the guard MUST be deleted.

**Scope**:
1. **Prisma schema migration**: extend the `Session` (or `HandoffContext`, depending on which entity owns the fields per the Phase 3 architect decision) Prisma model with two new optional columns: `commit_sha String?` and `session_log_path String?`. Generate migration file under `packages/core/prisma/migrations/<TS>_session_handoff_capture/`.
2. **Real `commit_sha` capture**: replace the literal `PLACEHOLDER_COMMIT='HEAD'` at `handoff-orchestrator.service.ts:80` with an actual `git rev-parse HEAD` invocation through the existing `execa`-wrapped git util. Reuse the `GitDiffCollector` pattern from Phase 3 Task 3.5.b — likely add a `getHeadCommit()` method on the same collector or its wrapper.
3. **Real `sessionLogPath` capture**: replace the literal `null` at `handoff-orchestrator.service.ts:239` with the actual session log path. The path is computable from `agent-workspace/memory/sessions/YYYY-MM-DD-session-N.md` naming convention plus the active session metadata. If the path lookup is non-trivial, add a small `SessionLogPathResolver` service.
4. **DELETE the R1 placeholder regression guard** at `integration.spec.ts:639-689` and any associated `// R1:` comments. Replace with a positive assertion: real `commit_sha` is a 40-char hex; real `sessionLogPath` matches the expected glob.
5. **Tests**:
   - Unit: `getHeadCommit()` returns a 40-char hex against a real git repo fixture.
   - Unit: `SessionLogPathResolver` (or equivalent) returns the correct path for a synthetic session.
   - Integration (in `integration.spec.ts`): the previously-placeholder path now persists real values; assert `commit_sha.match(/^[0-9a-f]{40}$/i)` and `sessionLogPath.endsWith('.md')`.
6. **Migration safety**: Prisma migration must be reversible (down-step deletes the columns); run `pnpm prisma migrate dev` and confirm schema diff is clean.

**I-10 / I-15 guardrails**:
- Schema additions: zod validation on the new fields where they cross module boundaries (I-10).
- No new external input → no I-10 surface beyond the migration; I-15 unaffected (token attributes flow unchanged).

**Budget split contingency**: 150K is the upper FOCUSED_IMPL band. If pre-flight estimation in the session shows >180K projected (per session-budgets formula — 12K fixed + 5–6 modules × 3K + Prisma schema 3K + git/log fixture overhead), split into 4.1.a (schema migration + capture) and 4.1.b (test cleanup + R1 guard deletion). Document split in session log per session-budgets R-2.

**Acceptance criteria**:
- Prisma migration applied; `commit_sha` and `session_log_path` columns persist with non-null values for new HandoffContext rows.
- R1 regression guard removed; Phase 3 placeholder no longer present anywhere in the codebase (grep `PLACEHOLDER_COMMIT` returns zero hits in `packages/`).
- ≥ 5 new tests; integration test asserts real values on the previously-placeholdered path.
- Monorepo test count target: ≥ 1,351 (Phase 3 exit + 5).
- All gates green.

**Risks**:
- **MEDIUM** — git invocation in a test environment without a real repo fixture. Mitigation: tests that need a real commit hash use a `tmp` git repo created in `beforeAll`.
- **LOW** — migration drift if Prisma client regen is forgotten. Mitigation: kickoff scaffolding (4.0) confirms baseline; this task explicitly runs `pnpm prisma generate`.

---

### Task 4.2 — Adapter Prepend Behavioral Coverage (#9 carryforward)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~30K · **Deps**: 4.0

**Closes Phase 3 carryforward #9.** The Phase 3 architect for Task 3.6 specified `seedPrompt` threading through `IAgentRuntime.spawn()`. The unit-level mock test verifies the parameter passes; this task adds **end-to-end behavioral coverage** that the `ClaudeCodeAdapter.spawn()` actually prepends the seed prompt to the child process's stdin (or equivalent input channel) BEFORE the user's first prompt arrives.

**Scope**:
1. New spec `packages/core/src/modules/sessions/runtime/claude-code-adapter.spec.ts` (or augment existing) with an `it('prepends seedPrompt to child stdin before user input', ...)` block.
2. Use a fake child process (per the existing test-double pattern from Phase 3 Task 3.3 graceful-end tests) that records all `stdin.write()` calls.
3. Call `adapter.spawn({ ..., seedPrompt: 'TEST_SEED_MARKER' })`; assert first stdin write contains `TEST_SEED_MARKER`; subsequent writes do not duplicate it.
4. Edge case: `seedPrompt` is `undefined` → no prepend; `seedPrompt` is empty string → no prepend (treat as absent, not as "write empty line").

**Acceptance criteria**:
- ≥ 3 new tests (happy path, undefined, empty string).
- Existing seedPrompt unit tests continue to pass.
- Monorepo test count target: ≥ 1,354.

**Risks**: Low. Surgical test-only addition.

---

### Task 4.3 — Module Shutdown Ordering (MINOR-3 carryforward)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~50K · **Deps**: 4.0

**Closes Phase 3 carryforward MINOR-3.** Cron task tries to release `SessionLock` via `prisma.sessionLock.delete()` AFTER `PrismaService.onModuleDestroy()` has closed the client. Cosmetic in production (DomainError swallowed; idempotent on next boot) but visible in test logs and confusing.

**Scope**:
1. `CronSchedulerService.onModuleDestroy()` (in `packages/core/src/modules/scheduler/cron-scheduler.service.ts` or equivalent): make it `async` and `await` cron-task termination + lock release **before returning**. Use `clearInterval()` + a tracked `Promise<void>` of the in-flight tick handler.
2. Confirm NestJS module lifecycle order honors this — Nest awaits `onModuleDestroy` returns in module-import order. The fix relies on `SchedulerModule` importing `PrismaModule` so Scheduler tears down BEFORE Prisma. If import order is wrong, adjust `module.imports[]` or use explicit dependency declaration.
3. Add a unit test using `Test.createTestingModule()`: boot the module, fake-trigger an in-flight cron tick, call `app.close()`, assert no DomainError logged AND lock is released (no orphaned `SessionLock` row).
4. **Do NOT** touch `PrismaService.onModuleDestroy` — that's invariant order territory and the fix lives upstream.

**Acceptance criteria**:
- Test logs in `integration.spec.ts` Scenario B `afterAll` no longer show "DomainError: SessionLock release failed" output.
- ≥ 2 new tests.
- Monorepo test count target: ≥ 1,356.
- All Phase 3 cron tests still green.

**Risks**: **LOW-MEDIUM**. Module destruction ordering is subtle in Nest. Mitigation: explicit test that simulates the race (in-flight tick at shutdown).

---

### Task 4.4 — Polish CLI Init Flow
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~80K · **Deps**: 4.0

Implements the `phase-4-polish.md` Task 4.1 stub (renumbered to 4.4 here for sequencing). Interactive CLI commands using `@inquirer/prompts`:
- `orch init` — creates `~/.orch/`, generates 32-byte hex auth token, prints Telegram bot setup instructions, asks if user wants to start daemon now, prints summary.
- `orch attach <path>` — detects project root, interactively builds `.orch/profile.yaml`, optionally injects hooks (delegates to Task 4.5 utility), Telegram-notifications opt-in.
- `orch detach <path>` — removes `.orch/profile.yaml`, restores `.claude/settings.json` from backup, unregisters from daemon.

**Non-TTY safety**: support `--no-interactive` flag with env var fallbacks (`ORCH_PRIMARY_PROFILE`, `ORCH_FALLBACK_PROFILES`, `ORCH_INJECT_HOOKS`, `ORCH_TELEGRAM_NOTIFICATIONS`). Required for CI Task 4.7.

**Acceptance criteria**:
- ≥ 8 CLI tests (happy path, --no-interactive path, missing project flag, hook injection declined, profile already exists path, detach happy path, detach with no backup, init re-run idempotent).
- All `@orch/cli` package tests pass.
- Monorepo test count target: ≥ 1,364.

**Risks**:
- **LOW-MEDIUM** — Interactive CLI in test harness requires mocking `@inquirer/prompts`. Mitigation: existing CLI test pattern from Phase 1 (mock-based) carries over.
- **LOW** — Path resolution on Windows. Mitigation: use `node:path` consistently; existing CLI already handles this.

---

### Task 4.5 — Hook Injection Utility
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~60K · **Deps**: 4.4

Standalone utility called by `orch attach` to merge Orch hooks into `.claude/settings.json` non-destructively.

**Scope**:
1. Read existing `.claude/settings.json`. If absent, create with Orch hooks only.
2. Atomic backup to `.claude/settings.json.backup-<TS>` BEFORE modifying (charter S4 — explicit user consent enforced one level up in 4.4).
3. Merge: append Orch hooks (`SessionStart`, `Stop`, `SubagentStop`, `PostToolUse`) without replacing existing entries; deduplicate by hook command identity (idempotent on re-run).
4. Validate JSON before write (zod schema or `JSON.parse` round-trip); abort with clear error on parse failure (charter S4 — never corrupt user's settings).
5. Atomic write via `fs.rename()` from temp file.

**Acceptance criteria**:
- ≥ 8 tests covering: empty starting state, existing non-Orch hooks preserved, existing Orch hooks deduplicated, malformed JSON rejected with clear error, backup exists after write, double-run no duplicate hooks.
- Monorepo test count target: ≥ 1,372.

**Risks**:
- **MEDIUM** — Corrupting a user's existing settings is a charter S4 violation. Mitigation: backup-first + validate-before-write + atomic rename. All three required.

---

### Task 4.6 — Example Integration (StockForge + Generic)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~60K · **Deps**: 4.5

Concrete reference integrations users can copy-paste.

**Scope**:
1. `examples/stockforge-integration/` — full `profile.yaml` matching the StockForge structure documented in Phase 0 research notes (`agent-workspace/research/stockforge.md` if present, else inferred from `agent-workspace/memory/`). Include `settings.json` snippet with hooks + `README.md` with the 3-step integration:
   - Step 1: `orch attach /path/to/stockforge`
   - Step 2: confirm `.orch/profile.yaml` matches expected
   - Step 3: `orch start`
2. `examples/generic-nodejs-project/` — minimal profile for any Node project: just `name`, `primary_profile`, `cron: {}` empty.
3. Each example folder has a `README.md` with explicit cited paths and commands (no marketing).
4. **I-2 check** — examples are the ONE place `stockforge` strings are allowed (in fixture data, NOT imported by core). Document this exception in the example README.

**Acceptance criteria**:
- Both example directories complete with all three files (profile.yaml, settings.json snippet, README.md).
- A "verify" test in the CLI package: `orch attach examples/generic-nodejs-project/` (in `--no-interactive` mode) produces a valid daemon-loadable profile.
- Monorepo test count target: ≥ 1,373.

**Risks**:
- **LOW** — StockForge structure may have drifted since Phase 0. Mitigation: cite Phase 0 research notes; if drift detected, scope down to "structure as documented in Phase 0" with a TODO.

---

### Task 4.7 — CI Setup (GitHub Actions)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~40K · **Deps**: 4.0 (parallel-eligible with 4.1–4.6)

Two GitHub Actions workflows.

**Scope**:
1. `.github/workflows/ci.yml`:
   - Triggers: `push` to `main`, `pull_request`.
   - Matrix: `node: [20, 22]` on `ubuntu-latest`.
   - Steps: `actions/setup-node@v4` (with cache: pnpm), `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Optional: coverage upload to Codecov (gated on `CODECOV_TOKEN` secret presence — non-blocking).
2. `.github/workflows/release.yml`:
   - Trigger: tag `v*`.
   - Steps: build all packages, `pnpm publish -r --access public` (requires `NPM_TOKEN`), create GitHub release with auto-generated changelog from PR titles.
3. Both workflows tested locally via `act` (if available) OR by inspection — no live CI runs required for plan acceptance.

**Acceptance criteria**:
- Both YAML files committed; pass `actionlint` (or equivalent linter) if available; otherwise manual review confirms syntax.
- README has CI badge (added in Task 4.9).

**Risks**:
- **LOW** — pnpm cache config differs from npm. Mitigation: use `pnpm/action-setup@v3` standard pattern.

---

### Task 4.8 — Docker Compose Validation
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~40K · **Deps**: 4.0 (parallel-eligible)

Validate the existing (or yet-to-be-written) `docker-compose.yml` profiles spin up the full stack.

**Scope**:
1. `docker-compose.yml` profiles:
   - **default**: just `orch-core` (the daemon container; bind-mounts SQLite + `.orch/`).
   - **observability**: adds Langfuse + Postgres (referenced in Phase 0 research; one of the `agent-workspace/research/*.md` files documents the upstream compose snippet).
   - **full**: core + observability + web-ui exposed on host port.
2. `Dockerfile.core` (if absent) — Node 20-slim base, pnpm install, copy build artifacts, `CMD ["node", "packages/core/dist/main.js"]`.
3. Health check via curl against the daemon's `/health` endpoint after `docker compose up -d --wait`.
4. README snippet for `docker compose --profile full up -d` in Task 4.9.

**Acceptance criteria**:
- `docker compose config --profiles default observability full` returns valid YAML for each profile.
- `docker compose --profile default up -d --wait` + `curl http://localhost:4141/health` returns 200 (manual smoke OR a CI-gated `docker-smoke.spec.ts` that runs only on Linux CI).
- Documentation cross-references Task 4.11 troubleshooting.

**Risks**:
- **MEDIUM** — Docker on Windows test environment (developer machine) may not behave like CI Linux. Mitigation: docker-smoke test gated to `process.platform === 'linux'`; manual smoke acceptable on Windows.

---

### Task 4.9 — Comprehensive README
**Session type**: DOC · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~50K · **Deps**: 4.4, 4.5

Root-level `README.md` rewrite. Target reader: senior dev evaluates in 5 minutes.

**Scope** (mirror `phase-4-polish.md` Task 4.3):
- **Hero** (1 paragraph): what Orch is.
- **Why** (3 bullets): pains it solves.
- **Quick start** (5 commands): `npm i -g @<scope>/orch-cli` → `orch init` → `orch attach <project>` → `orch start` → drop plan.
- **Architecture overview**: one ASCII diagram. Detailed version lives in `docs/architecture.md` (Task 4.11).
- **Features** (bullet list, no marketing).
- **Requirements**: Node 20+, pnpm 9+, ccs, claude CLI, optional Docker.
- **Screenshot of Web UI**: placeholder reference; actual screenshot deferred to v1.0 release tag (post-Phase 4 manual step).
- **Links**: `docs/quickstart.md`, `docs/configuration.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/release.md`.
- **License, contributing, support**.
- **CI badge** (linked to Task 4.7 workflow).

Tone: direct. No marketing fluff. No emojis.

**Acceptance criteria**:
- README.md replaces or augments existing root README.
- All links resolve to existing files (placeholders from 4.0 are populated by 4.10 + 4.11; this task may run in parallel with those — links can resolve to placeholder content as long as paths exist).
- `pnpm lint:md` (if configured) passes.

**Risks**: **LOW**. Doc-only.

---

### Task 4.10 — Configuration Reference (incl. #4 doc note)
**Session type**: DOC · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~45K · **Deps**: 4.1, 4.4

`docs/configuration.md` — complete reference for every config surface.

**Scope**:
1. **Every env var** — name, default, type, description. Source: `packages/core/src/config/env.schema.ts` (zod schema; iterate fields).
2. **`~/.orch/config.yaml` structure** — top-level keys, defaults.
3. **Profile schema** — full reference of `.orch/profile.yaml`. Source: `packages/core/src/modules/profiles/profile.schema.ts`. Include cron, session_types, hooks, context_budget, auto_handoff, commands.session_end.
4. **Hook event schemas** — payloads Orch receives (`SessionStart`, `Stop`, `SubagentStop`, `PostToolUse`). Cite `@orch/shared` schema definitions.
5. **API reference** — REST endpoints (each route in `api.module.ts`) + WS/SSE events (each `SseEnvelopeSchema` variant).
6. **Carryforward #4 absorbed here** — add a brief subsection "Why ApiController doesn't inject ConfigService": one-paragraph note explaining I-10 is satisfied by `validateEnv` at boot; the pattern will be added when ≥ 3 controllers need it. No code change. This is the documented disposition for #4.

**Acceptance criteria**:
- `docs/configuration.md` populated; every env var present (cross-check by grepping `process.env.ORCH_` in `packages/core/`).
- The #4 carryforward subsection is present and explicitly cites the threshold ("when ≥ 3 controllers...").
- Internal links from README (Task 4.9) resolve.

**Risks**:
- **LOW-MEDIUM** — Config surface drift; missed env var. Mitigation: grep-based cross-check is part of acceptance.

---

### Task 4.11 — Architecture Overview + Troubleshooting + Release Checklist
**Session type**: DOC · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~70K · **Deps**: 4.9, 4.10

Three doc files combined into one session (each ~25K):

1. **`docs/architecture.md`** (mirror `phase-4-polish.md` Task 4.6):
   - User-facing version of `agent-workspace/constitution/architecture.md`.
   - ASCII or mermaid diagrams: module map, data flow for a queue item's lifecycle, hook event flow.
   - Extensibility points: `IAgentRuntime` adapters, custom Telegram commands, custom cron entries.

2. **`docs/troubleshooting.md`** (mirror `phase-4-polish.md` Task 4.5):
   - Daemon won't start (port conflict, permissions, missing `~/.orch/`).
   - Hooks not firing (Claude Code version, settings.json path resolution, hook injection didn't run).
   - ccs account switching (quota visibility, fallback chain).
   - OTEL traces missing (collector endpoint, env vars, `ORCH_TRACE_BACKEND`).
   - Telegram bot silent (token invalid, user not in whitelist, network).
   - SQLite lock errors (WAL mode, concurrency, container bind mount).

3. **`docs/release.md`** (mirror `phase-4-polish.md` Task 4.10):
   - Steps to cut a release (tag → CI publish → GitHub release).
   - CHANGELOG format (Keep a Changelog).
   - Semver rules (referencing charter "Versioning Policy").
   - Breaking change policy.

**Acceptance criteria**:
- All three files populated; cross-links from README (4.9) resolve; links from configuration.md (4.10) where appropriate.
- No fictional features documented (every behavior traces to actual code).

**Risks**:
- **LOW-MEDIUM** — 70K combined budget is the upper end of DOC sessions. If projection exceeds 100K mid-session, split troubleshooting + release into a 4.11.b.

---

### Task 4.12 — Final E2E Verification Gate
**Session type**: VERIFY · **Subagent**: sandwich-verifier · **Model**: opus · **Budget**: ~80K · **Deps**: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11

Adversarial whole-phase review + exhaustive end-to-end against all Charter F/N/O/S criteria. Mirror Task 3.12 structure but broader scope.

**Mandatory checks**:

1. **Carryforward closure**:
   - #10: grep for `PLACEHOLDER_COMMIT` in `packages/` returns 0 hits; grep for R1 regression-guard comment returns 0 hits; integration test asserts real commit_sha + sessionLogPath.
   - #9: adapter prepend behavioral test exists and passes.
   - MINOR-3: `integration.spec.ts` Scenario B afterAll runs clean (no DomainError lines in test output).
   - #4: `docs/configuration.md` contains the documented disposition.

2. **Charter F evidence**:
   - F1: drop a plan file, verify pickup (live test).
   - F2: hook events received and update state (mocked Claude Code subprocess in test mode).
   - F3: ccs failover continuity test from Phase 1 still passes.
   - F4: 230K threshold path (Phase 3 integration test) still passes; the placeholder is gone.
   - F5: Telegram commands respond (mocked bot or live bot if configured).
   - F6: Web UI usage chart renders (Phase 3 evidence; re-verified).
   - F7: `orch init` end-to-end completes in < 60 seconds (timed in test).
   - F8: 2+ projects simultaneously — register two profiles, verify no collision.

3. **Charter N evidence**:
   - N1: zero `any` in `packages/core/src/` — `tsc --noEmit` + grep.
   - N2: coverage > 70% for state machine, queue, session controller.
   - N3: SQLite WAL mode + transactions — config check.
   - N4: cold-start < 5s — timed in test.
   - N5: latency harness < 2s — Phase 3 evidence; re-run.
   - N6: 72h memory leak — DEFERRED to post-v1.0 manual run; Task 4.12 records the deferral with explicit charter-acknowledgement that this is a manual extra-mile check.

4. **Charter O evidence**:
   - O1: every queue item one OTEL trace root with TRACEPARENT — Phase 2 evidence; re-grep.
   - O2: Claude Code spans nest under Orch root — Phase 2 evidence.
   - O3: `/sessions/:id/usage` endpoint returns aggregated data — Phase 3 evidence.
   - O4: session end reasons categorized — Phase 3 evidence (CONTEXT_FULL, CONTEXT_FULL_FORCED, COMPLETED, FAILED).

5. **Charter S evidence**:
   - S1: destructive ops require Telegram + Web UI confirm — Phase 2 I-6 evidence.
   - S2: zero reads/writes to `~/.ccs/` or `~/.claude/` credential files — grep `\.ccs\b` and `\.claude/credentials` in packages/core, expect 0 hits in non-test code (hook injection writes `.claude/settings.json` which is config, not credentials — explicit allowlist).
   - S3: Web UI bound to localhost by default — config inspection.
   - S4: hook injection requires explicit consent — Task 4.5 implementation traces.

6. **Invariant gates** (re-grep, no drift from Phase 3):
   - I-1: zero `anthropic|openai|@anthropic-ai/sdk|claude-agent-sdk|ClaudeSDKClient` in `packages/core/src/` (excluding test mocks).
   - I-2: zero `stockforge|StockForge` in `packages/core/src/` (`examples/stockforge-integration/` is allowlisted as fixture).
   - I-3, I-5, I-9, I-10, I-11, I-14, I-15: re-greppped against Phase 3 baseline.

7. **Fresh-machine smoke** (in a clean Docker container or pristine sandbox):
   - Install Node 20 + pnpm + Docker.
   - Install Orch from local pnpm link (simulate `npm install -g @<scope>/orch-cli`).
   - Run `orch init` + `orch attach examples/generic-nodejs-project/`.
   - Run `orch start`.
   - Drop plan file, verify processing.
   - Test Telegram (real bot if available; mock otherwise).
   - Test Web UI access.
   - Simulate context-full (artificial 230K span injection); verify handoff.
   - Simulate budget breach; verify pause.
   - Simulate rate limit (mocked ccs failure); verify graceful handling.

**Acceptance criteria**:
- Verifier produces written verdict: `PASS` | `PASS_WITH_CONCERNS` | `FAIL`.
- For `PASS_WITH_CONCERNS`: critical = 0, major = 0, minor ≤ 3 (carryable to v1.0.1 as patch).
- For `FAIL`: specific blocking issues listed; main session loops into RECOVERY (a Task 4.12.r recovery cycle, then re-run 4.12).
- N6 (72h memory leak) acknowledged as deferred manual check, NOT a Phase 4 blocker.

**Risks**:
- **MEDIUM** — fresh-machine smoke is hard to fully automate on Windows dev box. Mitigation: scriptable smoke test runs in a Linux Docker container (`docker run --rm -v $PWD:/orch node:20 bash /orch/scripts/smoke-fresh-install.sh`). If Docker unavailable, fall back to bind-mounting an empty `~/.orch/` and asserting CLI commands behave correctly.
- **MEDIUM** — Verifier finds a critical issue in #10 (e.g., commit_sha capture races with session-end). Mitigation: Task 4.1 has explicit integration test asserting the real value; if verifier still finds an issue, RECOVERY scope is bounded.

---

### Task 4.13 — Phase 4 Close (housekeeping + v1.0.0 tag)
**Session type**: FOCUSED_IMPL · **Subagent**: sandwich-dev · **Model**: sonnet · **Budget**: ~30K · **Deps**: 4.12 PASS

Final housekeeping. Mirrors Task 3.13 structure.

**Scope**:
1. Move `phase-4-polish.md` (stub) and `phase-4-polish-plan.md` (this file) from `pending/` to `completed/phase-4-polish.md`.
2. Write `agent-workspace/memory/project-complete.md` retrospective:
   - Phases executed (0 through 4).
   - Deliverables shipped (per phase, with test counts).
   - Decisions made (index by ID with one-line summary).
   - Known limitations / future work (cross-account rate-limit aggregation, multi-tenant dashboard, plugin system, hot-reload, etc. — from `phase-4-polish.md` "Out of Scope" section).
   - Stats: monorepo LOC, test coverage %, Phase 0–4 token budget total.
3. Append session log.
4. Update `current-execution.md` to `Phase 5 (post-v1.0 maintenance)` placeholder OR leave as "Phase 4 COMPLETE — v1.0.0 tagged".
5. **v1.0.0 tag**: this is the ONE explicit commit + tag the user pre-authorizes for Phase 4 close. Per I-6 standing rule, the agent does NOT auto-commit; instead, the agent prepares a staged commit with all final files + a `git tag -a v1.0.0 -m "Orch v1.0.0 — Phase 4 complete"` instruction, and **explicitly halts to ask user to confirm tag creation**. This is the only Phase 4 STOP-for-user-confirmation point.

**Acceptance criteria**:
- All Phase 4 deliverables in `completed/`.
- Retrospective written; project-complete.md present.
- Final commit STAGED (not yet committed); tag command READY (not yet run); user confirmation requested.

**Risks**: **LOW** — close-out only.

---

## D. Phase 3 Carryforward Absorption Map

| # | Carryforward | Absorbed by | Why this placement |
|---|---|---|---|
| #4 | ApiController ConfigService injection | **Task 4.10** (DOC) | I-10 is already satisfied via `validateEnv` at boot. No code change is warranted until ≥ 3 controllers exhibit the pattern. The disposition is documented in `docs/configuration.md` so future contributors understand the threshold. Absorbed as **doc-only**, not as a code change. |
| #9 | T-SEED-2 behavioral coverage on adapter prepend | **Task 4.2** (FOCUSED_IMPL, ~30K) | Surgical test-only addition; sized exactly per Phase 3 estimate. Scheduled early (after kickoff 4.0) so it can run in parallel with the 4.1 schema work and is closed before any UX work begins. |
| #10 | SessionManager schema extension (commit_sha + sessionLogPath capture; delete R1 regression guard) | **Task 4.1** (FOCUSED_IMPL, ~150K) | Largest carryforward. Scheduled **first after kickoff** so subsequent tasks (especially 4.12 verification) benefit from a clean schema with no placeholders. Critical-path: 4.12 cannot pass without #10 closure. |
| MINOR-3 | SessionLock DomainError teardown noise | **Task 4.3** (FOCUSED_IMPL, ~50K) | Standalone module-shutdown-ordering fix; sized per Phase 3 estimate. Scheduled in the early-Phase-4 cleanup wave (4.1, 4.2, 4.3 all run before user-facing 4.4 polish) so test logs are clean for the rest of Phase 4. |

---

## E. Sequencing Diagram

```
                        ┌─────────────┐
                        │ Task 4.0    │  Kickoff scaffolding
                        │ (50K)       │
                        └──────┬──────┘
                               │
        ┌──────────────────────┼──────────────────────┬─────────────┐
        │                      │                      │             │
        ▼                      ▼                      ▼             ▼
   ┌────────────┐       ┌────────────┐         ┌────────────┐ ┌────────────┐
   │ Task 4.1   │       │ Task 4.2   │         │ Task 4.7   │ │ Task 4.8   │
   │ Schema #10 │       │ Adapter #9 │         │ CI         │ │ Docker     │
   │ (150K)     │       │ (30K)      │         │ (40K)      │ │ Compose    │
   └─────┬──────┘       └─────┬──────┘         └─────┬──────┘ │ (40K)      │
         │                    │                      │        └─────┬──────┘
         │                    ▼                      │              │
         │              ┌────────────┐               │              │
         │              │ Task 4.3   │               │              │
         │              │ MINOR-3    │               │              │
         │              │ (50K)      │               │              │
         │              └─────┬──────┘               │              │
         │                    │                      │              │
         └────────────────────┴──────────────────────┘              │
                              │                                     │
                              ▼                                     │
                        ┌────────────┐                              │
                        │ Task 4.4   │                              │
                        │ CLI Init   │                              │
                        │ (80K)      │                              │
                        └─────┬──────┘                              │
                              │                                     │
                              ▼                                     │
                        ┌────────────┐                              │
                        │ Task 4.5   │                              │
                        │ Hook Inj.  │                              │
                        │ (60K)      │                              │
                        └─────┬──────┘                              │
                              │                                     │
                              ▼                                     │
                        ┌────────────┐                              │
                        │ Task 4.6   │                              │
                        │ Examples   │                              │
                        │ (60K)      │                              │
                        └─────┬──────┘                              │
                              │                                     │
                ┌─────────────┴────────┐                             │
                ▼                      ▼                             │
          ┌────────────┐         ┌────────────┐                      │
          │ Task 4.9   │         │ Task 4.10  │                      │
          │ README     │         │ Config Ref │                      │
          │ (50K)      │         │ +#4 doc    │                      │
          │            │         │ (45K)      │                      │
          └─────┬──────┘         └─────┬──────┘                      │
                │                      │                             │
                └──────────┬───────────┘                             │
                           ▼                                         │
                     ┌────────────┐                                  │
                     │ Task 4.11  │                                  │
                     │ Arch+Trbl+ │                                  │
                     │ Release    │                                  │
                     │ (70K)      │                                  │
                     └─────┬──────┘                                  │
                           │                                         │
                           └─────────────────────┬───────────────────┘
                                                 ▼
                                           ┌────────────┐
                                           │ Task 4.12  │  sandwich-verifier (opus)
                                           │ E2E VERIFY │  ALL deps required
                                           │ (80K)      │
                                           └─────┬──────┘
                                                 │ PASS
                                                 ▼
                                           ┌────────────┐
                                           │ Task 4.13  │  Housekeeping + v1.0.0 tag
                                           │ Close      │  (USER CONFIRMS TAG)
                                           │ (30K)      │
                                           └────────────┘
```

**Critical path**: 4.0 → 4.1 → 4.4 → 4.5 → 4.6 → 4.9 → 4.11 → 4.12 → 4.13 (9 tasks, ~625K).

**Parallelizable lanes** (in human-driven mode; in autonomous single-session-at-a-time, run sequentially after 4.0):
- **Lane A** (carryforward closure): 4.1 → 4.3 (4.2 standalone, can sit anywhere after 4.0).
- **Lane B** (UX): 4.4 → 4.5 → 4.6.
- **Lane C** (infra): 4.7, 4.8 fully independent of A/B; can run any time.
- **Lane D** (docs): 4.9 ‖ 4.10 → 4.11 (4.9 and 4.10 parallel; 4.11 depends on both).

In autonomous mode, recommended order: **4.0 → 4.1 → 4.2 → 4.3 → 4.7 → 4.8 → 4.4 → 4.5 → 4.6 → 4.9 → 4.10 → 4.11 → 4.12 → 4.13**. Frontloads carryforward closure (4.1–4.3), then unblocks docs by completing implementation (4.4–4.6 + 4.7 + 4.8), then docs (4.9–4.11), then verify and close.

---

## F. Phase 4 Exit Criteria

1. **Charter satisfaction (all four categories re-asserted under fresh-machine conditions)**:
   - **Functional F1–F8**: all live-tested in Task 4.12 fresh-machine smoke. F4 specifically uses real (non-placeholder) commit_sha + sessionLogPath persisted via Task 4.1.
   - **Non-functional N1–N5**: re-asserted via existing test suite + new fresh-install timing tests (F7 < 60s, N4 < 5s). N6 (72h memory leak) deferred as documented manual extra-mile check.
   - **Observability O1–O4**: re-asserted via Phase 2/3 evidence + re-grep in 4.12.
   - **Safety S1–S4**: re-audited in 4.12; hook-injection consent flow (4.5) is the new Phase 4 surface.

2. **Phase 3 carryforwards CLOSED**:
   - #4: documented in `docs/configuration.md` (Task 4.10).
   - #9: behavioral test exists and passes (Task 4.2).
   - #10: schema extended, real values persisted, R1 guard deleted (Task 4.1).
   - MINOR-3: shutdown order fixed, test logs clean (Task 4.3).

3. **Test count target**: monorepo **≥ 1,375 tests** (Phase 3 exit ~1,346 + ~30 new across 4.1/4.2/4.3/4.4/4.5/4.6); all green; no new flakes.

4. **Invariant gates** (re-grep, zero drift from Phase 3 baseline):
   - I-1: zero LLM imports in `packages/core/src/`.
   - I-2: zero `stockforge` in `packages/core/src/` (`examples/stockforge-integration/` allowlisted).
   - I-3, I-5, I-9, I-10, I-11, I-14, I-15: unchanged from Phase 3 exit.
   - I-6: no auto-commit; v1.0.0 tag explicitly user-confirmed in Task 4.13.

5. **Verification subagent verdict**: Task 4.12 produces `PASS` or `PASS_WITH_CONCERNS` with **critical = 0, major = 0, minor ≤ 3**. Anything else loops into RECOVERY before Task 4.13.

6. **Shippability**:
   - `npm install -g @<scope>/orch-cli` works (simulated via local `pnpm link`).
   - `orch init` < 60s.
   - `orch attach <path>` interactive flow complete + non-interactive flag works.
   - `README.md` clear to outside dev.
   - `docs/` complete: quickstart + configuration + troubleshooting + architecture + release.
   - `docker-compose.yml` profiles work (default + observability + full).
   - `examples/` integrations exist and verify clean.
   - GitHub Actions CI passes on Node 20 + 22.
   - `v1.0.0` tag staged for user confirmation.

7. **Documentation**:
   - `phase-4-complete.md` retrospective written (Task 4.13).
   - `project-complete.md` written summarizing all five phases (Task 4.13).
   - `current-execution.md` updated to reflect Phase 4 complete.

---

## G. Estimated Total Phase 4 Budget

| Slice | Tasks | Token estimate |
|---|---|---|
| Kickoff | 4.0 | ~50K |
| Carryforward closure (#10, #9, MINOR-3) | 4.1, 4.2, 4.3 | ~230K |
| UX & Examples | 4.4, 4.5, 4.6 | ~200K |
| Infra (CI + Docker) | 4.7, 4.8 | ~80K |
| Documentation (incl. #4 doc note) | 4.9, 4.10, 4.11 | ~165K |
| Verify + Close | 4.12, 4.13 | ~110K |
| **Total** | **14 tasks** | **~835K tokens** |

**Fresh sessions expected**: **14** (one per task). No single planned task exceeds the 250K cap (R-1); 4.1 sits at 150K with explicit split contingency to 4.1.a + 4.1.b if the session pre-flight estimate exceeds 180K.

**Expected duration in autonomous-days**: **2 autonomous days** (consistent with `phase-4-polish.md` stub estimate of 1–2 autonomous days; Phase 3 was 2 autonomous days for 13 sessions / ~1.8M tokens, Phase 4 is leaner at ~835K but has more sequential gating around docs and verify).

---

## H. Model Routing Table (per `model-routing.md`)

| Task | Type | Subagent | Model | Rationale |
|---|---|---|---|---|
| 4.0 | FOCUSED_IMPL | sandwich-dev | sonnet | Setup; plan carries reasoning |
| 4.1 | FOCUSED_IMPL | sandwich-dev | sonnet | Schema migration is pattern-execute; no synthesis |
| 4.2 | FOCUSED_IMPL | sandwich-dev | sonnet | Test addition; surgical |
| 4.3 | FOCUSED_IMPL | sandwich-dev | sonnet | Module shutdown ordering; pattern-execute |
| 4.4 | FOCUSED_IMPL | sandwich-dev | sonnet | CLI flow; specified in stub |
| 4.5 | FOCUSED_IMPL | sandwich-dev | sonnet | Utility; merge logic specified |
| 4.6 | FOCUSED_IMPL | sandwich-dev | sonnet | Example fixtures; reference data |
| 4.7 | FOCUSED_IMPL | sandwich-dev | sonnet | YAML workflows; standard pattern |
| 4.8 | FOCUSED_IMPL | sandwich-dev | sonnet | Compose YAML; standard pattern |
| 4.9 | DOC | sandwich-dev | sonnet | README; specification carries content |
| 4.10 | DOC | sandwich-dev | sonnet | Reference doc; iteration over schema |
| 4.11 | DOC | sandwich-dev | sonnet | Three reference docs; pattern-execute |
| 4.12 | VERIFY | **sandwich-verifier** | **opus** | Adversarial whole-phase review; deep pattern recognition needed |
| 4.13 | FOCUSED_IMPL | sandwich-dev | sonnet | Housekeeping + tag prep |

**Master-planner (this dispatch)**: opus — phase decomposition.

No Phase 4 task uses `sandwich-architect` (no new architecturally-novel module to design) or `task-implementer + reviewers` (no MULTI_TASK_IMPL — every sub-piece is small enough for FOCUSED_IMPL).

---

## I. Risks (consolidated)

| Risk | Severity | Task | Mitigation |
|---|---|---|---|
| #10 schema extension exceeds 150K budget | MEDIUM | 4.1 | Explicit split contingency to 4.1.a + 4.1.b documented in task detail; pre-flight estimate gates the split |
| Hook injection corrupts user `settings.json` | MEDIUM (charter S4) | 4.5 | Backup-first + validate-before-write + atomic rename; all three required by acceptance criteria |
| Module shutdown ordering still races | LOW-MEDIUM | 4.3 | Explicit unit test simulating in-flight tick at shutdown |
| Interactive CLI fails in non-TTY | LOW-MEDIUM | 4.4 | `--no-interactive` flag + env var fallbacks; CI smoke test exercises non-interactive path |
| Docker Compose Windows dev parity | MEDIUM | 4.8 | docker-smoke gated to `process.platform === 'linux'`; manual smoke acceptable on Windows |
| StockForge example structure drift since Phase 0 | LOW | 4.6 | Cite Phase 0 research notes; scope-down with TODO if drift detected |
| Verifier finds critical issue in #10 schema work | MEDIUM (recovery cost) | 4.12 | 4.1 has explicit integration test asserting real values; recovery scope bounded |
| Fresh-machine smoke hard to fully automate | MEDIUM | 4.12 | Linux Docker container scriptable smoke; bind-mount fallback if Docker unavailable |
| N6 (72h memory leak) not testable in 4.12 | EXPECTED | 4.12 | Documented as deferred manual extra-mile check; NOT a Phase 4 blocker |
| npm publish credentials missing | EXPECTED | 4.13 | User-driven manual step; documented in `docs/release.md` (Task 4.11) |

---

## J. Out of Scope for Phase 4

Deferred to v1.0.1 / v1.1 / v2:

- Multi-tenant dashboard (charter explicitly out-of-scope).
- Team-level shared queue (out-of-scope).
- Plugin system (out-of-scope).
- Cloud-hosted SaaS option (charter anti-requirement).
- Non-English UI (out-of-scope).
- Voice commands (out-of-scope).
- ML-based session scheduling (charter anti-requirement; Karpathy P2).
- Profile.yaml hot-reload (Phase 0 open question; deferred).
- Tasks page in Web UI for cron status (deferred from Phase 3).
- Cross-account rate-limit aggregation beyond ccs auto-failover (deferred — `ccs` handles failover; Orch's "all exhausted" detection is a v1.1 surface).
- Real npm publish (Task 4.13 stages the tag; the publish itself requires user credentials and is the manual extra-mile step).
- 72-hour soak test (charter N6 evidence — deferred as documented manual run).

---

## K. Charter Alignment Summary

| Charter goal | Task(s) closing it |
|---|---|
| F1 plan auto-pickup | 4.12 (re-verify) |
| F2 hook events update state | 4.12 (re-verify) |
| F3 ccs failover continuity | 4.12 (re-verify) |
| F4 graceful end at 230K + handoff | 4.1 (real schema), 4.12 (re-verify, no placeholder) |
| F5 Telegram commands | 4.12 (re-verify) |
| F6 Web UI usage chart | 4.12 (re-verify) |
| F7 `orch init` < 60s | 4.4, 4.12 (timed) |
| F8 multi-project | 4.6 (examples), 4.12 (re-verify) |
| N1 zero `any` | 4.12 (grep + tsc) |
| N2 coverage > 70% | 4.12 (coverage gate) |
| N3 SQLite WAL | 4.12 (config audit) |
| N4 cold-start < 5s | 4.12 (timed) |
| N5 latency < 2s | 4.12 (re-run Phase 3 harness) |
| N6 72h memory leak | DEFERRED (manual extra-mile) |
| O1 trace per queue item | 4.12 (re-grep) |
| O2 spans nest | 4.12 (re-grep) |
| O3 cost queryable | 4.12 (re-verify Phase 3 endpoint) |
| O4 reasons categorized | 4.12 (re-verify enum) |
| S1 destructive op confirmation | 4.12 (Phase 2 evidence + audit) |
| S2 no credential reads | 4.12 (grep audit) |
| S3 localhost binding | 4.12 (config audit) |
| S4 hook injection consent | 4.5, 4.12 (re-verify) |
| Principle 1 daemon-dumb | 4.12 (I-1 re-grep) |
| Principle 3 project-agnostic | 4.6 (examples), 4.12 (I-2 re-grep) |
| Versioning v1.0.0 | 4.13 (tag staged for user confirm) |

---

## Next Action

Dispatch **Task 4.0** (Phase 4 Kickoff Scaffolding) — sandwich-dev (sonnet, FOCUSED_IMPL, ~50K, run_in_background=true, tool-call-first ordering). This is the unblock for everything else.

```
plan_path: C:\htdocs\orch-starter\agent-workspace\session-plans\pending\phase-4-polish-plan.md
total_budget_estimated: ~835K tokens
session_count: 14
risks:
  - #10 schema extension may exceed 150K (MEDIUM, split contingency to 4.1.a+4.1.b)
  - Hook injection corrupting settings.json (MEDIUM charter S4, backup+validate+atomic-rename)
  - Module shutdown race (LOW-MEDIUM, explicit unit test)
  - Interactive CLI in non-TTY (LOW-MEDIUM, --no-interactive flag)
  - Docker Compose Windows parity (MEDIUM, Linux-gated smoke)
  - StockForge example drift (LOW, cite Phase 0 research)
  - Verifier finds critical #10 issue (MEDIUM recovery, bounded by 4.1 integration test)
  - Fresh-machine smoke automation (MEDIUM, Docker container)
  - N6 72h leak not in Phase 4 (EXPECTED, deferred manual)
  - npm publish credentials (EXPECTED, user manual step)
decisions_made:
  - Task 4.0 created as kickoff scaffolding session (matches Phase 1/2/3 pattern)
  - Carryforward #10 placed FIRST (after 4.0) so subsequent tasks benefit from clean schema
  - Carryforward #4 absorbed as DOC-only in 4.10 (no code change; threshold rule documented)
  - Tasks 4.7 + 4.8 (CI + Docker) marked parallel-eligible to keep critical path lean
  - Task 4.11 combines architecture + troubleshooting + release into single ~70K DOC session
  - v1.0.0 tag explicitly user-gated in 4.13 (I-6 standing rule)
next_action: Dispatch Task 4.0 (sandwich-dev, sonnet, FOCUSED_IMPL, ~50K, bg=true, tool-call-first)
```
