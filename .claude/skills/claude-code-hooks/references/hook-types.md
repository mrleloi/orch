# Hook Types: Full Table and Sync vs Async Semantics

## Hook Types Table (Claude Code v2.1+)

| Hook | When fired | Sync or Async | Orch uses |
|---|---|---|---|
| SessionStart | Session boot or resume | async-safe | YES (MVP) |
| SessionEnd | Session exits normally | SYNC (Claude waits briefly) | YES (MVP) |
| Stop | Claude finishes a turn | async-safe | YES (watchdog reset) |
| SubagentStop | Subagent task completes | async-safe | YES (v1) |
| PreToolUse | Before tool invocation | SYNC (can block tool) | v2 optional |
| PostToolUse | After tool returns | async-safe | v2 optional |
| UserPromptSubmit | User sends a prompt | async-safe | v2 optional |
| PreCompact | About to auto-compact | SYNC | v2 (for context detection) |
| Notification | UI notification | async-safe | Logs only |

## Sync vs Async Semantics

**Async hooks** (add & at end of curl command):
- Claude does NOT wait for the hook to complete
- Use for: SessionStart, Stop, SubagentStop, PostToolUse, UserPromptSubmit, Notification
- Risk if blocking: none (Claude continues immediately)

**Sync hooks** (omit &, use --max-time):
- Claude WAITS for the command to exit
- Use for: SessionEnd, PreToolUse, PreCompact
- MUST complete in < 3 seconds for SessionEnd
- PreToolUse return code controls whether tool executes (non-zero = block)
- Risk if slow: blocks Claude Code UX

## Environment Variables Available in Hooks

| Variable | Description |
|---|---|
| CLAUDE_SESSION_ID | Current session UUID |
| PWD | Working directory at hook time |
| CLAUDE_PROJECT_DIR | Project root directory |
| ORCH_TOKEN | Bearer token (must be set in shell rc) |

## Version Compatibility

Hook API has changed across Claude Code 2025-2026. Pin managed project's expected Claude Code version in .orch/profile.yaml:

```typescript
const cliVersion = await execa('claude', ['--version']);
if (!semver.satisfies(cliVersion, profile.runtime.minClaudeCodeVersion)) {
  logger.warn('Claude Code version mismatch; hooks may not fire as expected');
}
```
