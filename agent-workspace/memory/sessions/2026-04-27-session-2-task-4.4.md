# Session — 2026-04-27 — Task 4.4 Polish CLI Init Flow

## Goal
Implement `orch init` / `orch attach` / `orch detach` interactive CLI commands with non-TTY safety, 9+ tests, all gates green.

## Session Type
FOCUSED_IMPL

## Approach
Read existing CLI structure first (init.ts, attach.ts, index.spec.ts). Identified that existing commands use different semantics (attach requires profile.yaml to exist) vs. the new task (attach creates profile.yaml). Strategy: create new command files (init-flow.ts, attach-flow.ts, detach.ts) to avoid breaking existing 22 tests. Tests use injectable prompt/fetch fns for clean mocking without vi.mock gymnastics. Installed @inquirer/prompts via pnpm add.

## Accomplished
- Subtask: init-flow.ts — `runInitFlow()` with auth token generation (32-byte hex, idempotent), directory tree (data/logs/config/), Telegram bot instructions, interactive confirm via injectable confirmFn, summary block
- Subtask: attach-flow.ts — `runAttachFlow()` with .git/.claude detection, interactive profile creation, --no-interactive + env var fallbacks, overwrite guard, injectHooks stub (throws NOT_IMPLEMENTED_YET)
- Subtask: detach.ts — `runDetach()` with backup restoration, profile deletion, best-effort daemon unregister via injectable fetchFn
- Subtask: cli-flow.spec.ts — 10 tests covering all required scenarios
- Subtask: index.ts — added exports for all new commands
- Subtask: package.json — @inquirer/prompts dependency added

## Gates Status
- Typecheck: PASS
- Lint: PASS
- Tests: PASS (32/32 CLI, 1,359 total monorepo)
- Invariants: all green (I-1: no SDK import; I-2: no hardcoded project names; I-3: confirmed; I-14: n/a CLI)

## Files Modified
- packages/cli/package.json (added @inquirer/prompts dependency)
- packages/cli/src/index.ts (added new exports)
- packages/cli/src/commands/init-flow.ts (NEW)
- packages/cli/src/commands/attach-flow.ts (NEW)
- packages/cli/src/commands/detach.ts (NEW)
- packages/cli/src/commands/cli-flow.spec.ts (NEW)

## Decisions Made
- Created new command modules (init-flow, attach-flow, detach) rather than modifying existing ones, to preserve all 22 existing CLI tests unchanged.
- Used injectable prompt/fetch functions instead of vi.mock('@inquirer/prompts') — avoids ESM module mock isolation issues and is more testable.
- injectHooks stub throws NotImplementedError('NOT_IMPLEMENTED_YET') — caught in attach-flow and logged as a TODO, not surfaced as error. Task 4.5 will replace.
- Monorepo count 1,359 vs target 1,365: delta explained by tasks 4.1-4.3 not yet executed (they add ~8 core tests). This task added 10 new tests (≥ 8 minimum).

## Test Names (10 total)
1. runInitFlow > creates ~/.orch/ directory tree with data/, logs/, config/ and generates auth token
2. runInitFlow > is idempotent — does not regenerate auth token on second run
3. runInitFlow > interactive: when user confirms start-now, prints orch start suggestion
4. runAttachFlow > happy path: interactive prompts mocked, writes valid .orch/profile.yaml
5. runAttachFlow > --no-interactive: uses env vars to create profile without prompts
6. runAttachFlow > --no-interactive: missing ORCH_PRIMARY_PROFILE exits 1 with clear message
7. runAttachFlow > profile already exists: overwrite=N exits without modification
8. runAttachFlow > inject_hooks=false: injectHooks stub is NOT called
9. runDetach > happy path: restores .claude/settings.json from backup and deletes profile.yaml
10. runDetach > no backup: still deletes profile.yaml and logs warning

## Next Session Pickup
Task 4.5 Hook Injection Utility — implement `injectHooks(projectPath)` in attach-flow.ts (replacing the NOT_IMPLEMENTED_YET stub). Reads .claude/settings.json, atomic backup, merges Orch hooks, validates JSON, atomic write. The attach-flow.ts already has the call site and error handling in place.
