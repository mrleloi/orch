# Session — Task 4.5 — 2026-04-25

## Goal
Replace the `NotImplementedError` stub in `packages/cli/src/commands/attach-flow.ts` with a real hook injection utility that merges Orch hooks into a managed project's `.claude/settings.json` non-destructively, with Charter S4 triple safety.

## Session Type
FOCUSED_IMPL

## Approach
Created `inject-hooks.ts` as a co-located CLI utility implementing: JSON parse/validate before any write, atomic backup before mutation, zod schema validation of merged result, and fs.rename atomic write. The utility is project-agnostic (uses `${CLAUDE_PROJECT_DIR:-.}` in hook commands, no hardcoded paths). `attach-flow.ts` stub replaced with a thin wrapper that delegates to the utility and surfaces `DomainError` to the caller.

## Accomplished
- Subtask 1: `packages/cli/src/commands/inject-hooks.ts` — utility with `injectHooks`, `mergeOrchHooks`, `ORCH_HOOKS`, `ORCH_HOOK_MARKER`, `DomainError`. Zod schema for settings validation. Full Charter S4 triple safety.
- Subtask 2: `packages/cli/src/commands/inject-hooks.spec.ts` — 11 tests (8 in `injectHooks` suite + 3 `mergeOrchHooks` unit tests).
- Subtask 3: `packages/cli/src/commands/attach-flow.ts` — replaced stub with real delegate; updated hook-injection error handling to surface `DomainError` instead of silencing `NotImplementedError`; updated summary line to remove "stub" wording.

## Gates Status
- Typecheck: PASS
- Lint: PASS (0 errors; 4 pre-existing web-ui warnings unrelated to this task)
- Tests: PASS (43/43 — 32 prior + 11 new)
- Invariants: all green (I-1: no Anthropic SDK; I-2: no stockforge hardcoding; I-3: N/A; I-14: N/A)

## Files Modified
- `packages/cli/src/commands/inject-hooks.ts` (new)
- `packages/cli/src/commands/inject-hooks.spec.ts` (new)
- `packages/cli/src/commands/attach-flow.ts` (modified: stub replaced)

## Decisions Made
- Hook commands use `bash "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/orch-receiver.sh" <event>` per plan spec and project memory rule (I-2 + CLAUDE.md hook rule).
- Orch hooks detected by `ORCH_HOOK_MARKER = "orch-receiver.sh"` substring — this handles path drift across versions by replacing any Orch hook regardless of its full path.
- Backup is skipped (and `created=true` returned) when settings.json does not exist — nothing to backup.
- `DomainError` is exported from `inject-hooks.ts` and re-imported in `attach-flow.ts` so the attach flow can distinguish settings corruption from other errors.
- `NotImplementedError` kept as export in `attach-flow.ts` for Task 4.4 test backwards compat (test imports it by name).

## Next Session Pickup
Task 4.6 — Example Integration (StockForge + Generic). Deps: 4.5 (this task — DONE). Session plan at `agent-workspace/session-plans/pending/phase-4-polish-plan.md` lines 190+.
