---
name: claude-code-hooks
description: Use when editing `.claude/settings.json` hook entries, the hooks-receiver module under `packages/core/`, or the `examples/stockforge-integration/hooks-snippet.json`. Also use when the user mentions missing hook events, hook payload shape, or hook timing.
tools: [Read, Bash, Grep, Edit]
archetype: reference
---

# Claude Code Hooks -- Orch Patterns

## When to Use

- Creating hook command snippets for managed projects' `.claude/settings.json`
- Implementing hook receiver endpoints
- Validating hook payloads
- Debugging "my hook fires but Orch doesn't receive it"

## Reference Index

| Topic | File | When to read |
|-------|------|--------------|
| Hook types, sync/async semantics, env vars | `.claude/skills/claude-code-hooks/references/hook-types.md` | choosing hook type or debugging timing |
| settings.json snippets, orch attach injection | `.claude/skills/claude-code-hooks/references/settings-snippets.md` | writing or updating hook config |
| Zod schemas, dedup, HooksController, security | `.claude/skills/claude-code-hooks/references/payload-handling.md` | implementing receiver endpoint |
| Local testing, common failures, manual testing | `.claude/skills/claude-code-hooks/references/testing-and-failures.md` | hook not firing or not received |

## Quick Reference

Hook timing (see hook-types.md for full table):
- **Async** (add `&`): SessionStart, Stop, SubagentStop, PostToolUse
- **Sync** (omit `&`, add `--max-time 3`): SessionEnd, PreToolUse, PreCompact

```bash
# Minimal async hook curl pattern
curl -sS -X POST http://localhost:3737/projects/NAME/hooks/HOOK_TYPE   -H "Authorization: Bearer $ORCH_TOKEN"   -H "Content-Type: application/json"   -d "{\"session_id\":\"$CLAUDE_SESSION_ID\",\"ts\":\"$(date -Iseconds)\"}" &
```

```typescript
// Receiver endpoint pattern (see payload-handling.md for full example)
@Post('session-start')
async sessionStart(@Param('projectId') projectId: string, @Body() raw: unknown) {
  const payload = sessionStartPayload.parse(raw);
  if (this.dedup.isDup(dedupKey(payload))) return { ok: true, deduped: true };
  const event = await this.hookRepo.insert({ ... });
  this.events.emit('hook.sessionStart', { projectId, sessionId: payload.session_id });
  return { ok: true, event_id: event.id };
}
```

## Common Failures Quick List

- Hook doesn't fire: check settings.json syntax, restart Claude Code
- 401: wrong ORCH_TOKEN
- connection refused: daemon not running or wrong port
- Hooks block Claude: missing `&` on async hooks
