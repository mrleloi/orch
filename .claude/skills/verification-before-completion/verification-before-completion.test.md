# verification-before-completion self-test

## Trigger

About to write "task done", "implemented", or "fixed" anywhere (commit message,
session log, self-report, orchestrator response) - once per task, not per session.

## Expected behavior (PASS)

Skill activates and emits a `## Completion Verification -- Task <id>` checklist
with `[x]` for typecheck, lint, scoped tests, and invariant grep
(I-1/I-2/I-3/I-5/I-14). Actual `pnpm test <scope>` output containing the
literal patterns `passed` and `failed` is pasted inline. `status: DONE` is only
emitted when every checklist item is checked; otherwise `DONE_WITH_CONCERNS` or
`BLOCKED`.

## Named failure modes

- Mode F1: "Looks good to me" without running gates (Red Flag - gate evidence absent)
- Mode F2: assertion claim ("tests pass") emitted without pasted output (Rationalization
  Counter - evidence required over assertion)
- Mode F3: invariant grep skipped because "session-end will catch it" (per-task
  invariant grep is mandatory; session-end is too late if later tasks build on a
  cracked foundation)

## Metrics

- activation_count_per_session: per-task (>=1 per IMPL task)
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. Every task-implementer completion report MUST contain the verbatim checklist
   heading `## Completion Verification -- Task <id>` with `[x]` for at least:
   typecheck, lint, scoped tests, and invariant grep (I-1/I-2/I-3/I-5/I-14);
   grep observation files under `agent-workspace/memory/observations/` for this
   heading pattern.
2. Pasted output for `pnpm test <scope>` MUST include the literal pattern `passed`
   AND `failed` (proves a real test run occurred, not a fabricated assertion);
   grep the observation file body for both words.
3. NO completion report emits `status: DONE` without all checklist items checked -
   `DONE_WITH_CONCERNS` or `BLOCKED` must be used when any item is unchecked;
   grep observation files for `status: DONE` lines and verify the corresponding
   checklist section has no `[ ]` (unchecked) items.
