# claude-code-hooks self-test

## Trigger

Editing `.claude/settings.json` hook entries; OR hooks-receiver module under
`packages/core/`; OR `examples/stockforge-integration/hooks-snippet.json`;
OR user mentions missing hook events, payload shape, or hook timing.

## Expected Behavior

Skill activates and async hooks (SessionStart/Stop/SubagentStop/PostToolUse)
end with `&` (non-blocking). Sync hooks (PreToolUse/PreCompact) include
`--max-time 3` so Claude Code does not stall. Hook-receiver controllers call
`<schema>.parse(raw)` on body before insert (I-10) and consult `dedupKey`
via `this.dedup.isDup(...)` BEFORE the repo insert (I-8 idempotency).

## Failure Modes

- F1: missing `&` on async hook entries (SessionStart/Stop/SubagentStop/PostToolUse)
  — blocks Claude Code UX while curl runs synchronously
- F2: hook receiver does not call zod `.parse()` on raw body before insert
  — I-10 violation; untyped data reaches the repository
- F3: dedup key not computed or `isDup` check skipped before repo insert
  — I-8 idempotent-receiver violation; duplicate events recorded on retry
- F4: sync hook (PreToolUse/PreCompact) missing `--max-time 3`
  — risks Claude Code stall if receiver is slow or unreachable

## Metrics

- activation_count_per_session: 0-3
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. Every `*.controller.ts` `@Post(...)` handler for a hook route calls
   `<schema>.parse(raw)` within 3 lines of method entry — grep
   `packages/core/src/` for controller files and verify parse-before-insert
   ordering (I-10 grep).
2. Every hook insert path computes a `dedupKey` AND calls
   `this.dedup.isDup(...)` BEFORE the repo insert call — multiline grep over
   `packages/core/src/` hook handler bodies (I-8 grep).
3. `.claude/settings.json` async hook entries (types: SessionStart, Stop,
   SubagentStop, PostToolUse) MUST each end with `&`; sync hook entries
   (PreToolUse, PreCompact) MUST contain `--max-time` — regex audit of
   settings.json hook command strings.
