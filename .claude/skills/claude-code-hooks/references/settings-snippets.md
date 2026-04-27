# settings.json Hook Snippets

## Full Four-Hook Configuration

The full hook config from the original SKILL.md (see references/hook-types.md for semantics):

```json
{
  "hooks": {
    "SessionStart": [ { "matcher": "startup|resume", "hooks": [{ "type": "command", "command": "curl -sS -X POST http://localhost:3737/projects/stockforge/hooks/session-start -H 'Authorization: Bearer $ORCH_TOKEN' -H 'Content-Type: application/json' -d '{"session_id":"'"$CLAUDE_SESSION_ID"'"}' &" }] } ],
    "SessionEnd": [ { "hooks": [{ "type": "command", "command": "curl -sS -X POST http://localhost:3737/projects/stockforge/hooks/session-end -H 'Authorization: Bearer $ORCH_TOKEN' -H 'Content-Type: application/json' --max-time 3 -d '{"session_id":"'"$CLAUDE_SESSION_ID"'","ts":"'"$(date -Iseconds)"'"}'" }] } ],
    "Stop": [ { "hooks": [{ "type": "command", "command": "curl -sS -X POST http://localhost:3737/projects/stockforge/hooks/stop -H 'Authorization: Bearer $ORCH_TOKEN' -H 'Content-Type: application/json' -d '{"session_id":"'"$CLAUDE_SESSION_ID"'"}' &" }] } ],
    "SubagentStop": [ { "hooks": [{ "type": "command", "command": "curl -sS -X POST http://localhost:3737/projects/stockforge/hooks/subagent-stop -H 'Authorization: Bearer $ORCH_TOKEN' -H 'Content-Type: application/json' -d '{"session_id":"'"$CLAUDE_SESSION_ID"'"}' &" }] } ]
  }
}
```

## Key curl flags

- `&` at end = detach (async hooks). Omit for sync hooks (SessionEnd).
- `--max-time 3` for sync hooks -- Claude waits up to 3 seconds
- `-sS` = silent but show errors (so hook failures log somewhere)
- The `$ORCH_TOKEN` env var must be in the shell spawning Claude Code (add to user shell rc)
- Environment variables available: `$CLAUDE_SESSION_ID`, `$PWD`, `$CLAUDE_PROJECT_DIR`

## orch attach Hook Injection

```typescript
// packages/cli/src/commands/attach.ts
async function injectHooks(projectPath: string, projectName: string, token: string) {
  const settingsPath = path.join(projectPath, '.claude/settings.json');
  const backup = `${settingsPath}.backup-${Date.now()}`;

  const existing = existsSync(settingsPath)
    ? JSON.parse(await readFile(settingsPath, 'utf-8'))
    : {};

  if (existsSync(settingsPath)) {
    await copyFile(settingsPath, backup);
  }

  const newHooks = generateOrchHooks(projectName, token);
  const merged = {
    ...existing,
    hooks: mergeHooks(existing.hooks ?? {}, newHooks),
  };

  await writeFile(settingsPath, JSON.stringify(merged, null, 2));
  console.log(`Hooks injected. Backup at ${backup}`);
}
```

Idempotency: mark Orch-inserted hooks with a comment or distinguishable command prefix. On re-run: skip already-present.
