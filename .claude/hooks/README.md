# Hook Profiles

Inspired by ECC's `ECC_HOOK_PROFILE` pattern. Switch behavior via `ORCH_HOOK_PROFILE` env var in `.claude/settings.json`:

```json
"env": {
  "ORCH_HOOK_PROFILE": "minimal" | "standard" | "strict"
}
```

## Profiles

### `minimal`
- SessionStart / SessionEnd / Stop logging only
- No blocking pre-tool-use gates
- Use for: quick exploration, demos

### `standard` (default)
- All `minimal` hooks
- PreToolUse soft-warn for destructive ops (I-6)
- PostToolUse log annotations
- Use for: normal development work

### `strict`
- All `standard` hooks
- PreToolUse hard-block on writes outside allowed dirs
- PostToolUse invariant grep on Edit/Write in `packages/core/**`
- SessionEnd: enforce `/invariant-check` ran (fail if not)
- Use for: autonomous-mode sessions, production-path work

## How to switch

Set `ORCH_HOOK_PROFILE` in `.claude/settings.json` under `env`. A session-start re-reads settings.json.

## Implementation state

Currently only the env flag is declared in settings.json. The hook bodies below are **scaffolds** — wire them as session hooks grow. The flag exists so downstream hooks can branch on it via `${ORCH_HOOK_PROFILE:-standard}` in shell commands.

## Adding a new hook

1. Choose the event (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`, `PreCompact`, etc.)
2. Write a shell command that inspects `$ORCH_HOOK_PROFILE` and branches
3. Add the hook to `.claude/settings.json` → `hooks` section
4. Update this README

## Pitfall: relative paths in hook commands

**Never use bare relative paths** in hook commands (e.g. `agent-workspace/memory/.session-hooks.log`). Hooks fire with a `$PWD` that may NOT be the project root — subagents, spawned sessions, and `Stop` hooks from nested contexts all fail with "no such file or directory" on relative paths.

**Always use `$CLAUDE_PROJECT_DIR`** (injected by Claude Code for hooks) and `mkdir -p` the target directory defensively:

```jsonc
{
  "type": "command",
  "command": "mkdir -p \"${CLAUDE_PROJECT_DIR:-.}/agent-workspace/memory\" && echo \"...\" >> \"${CLAUDE_PROJECT_DIR:-.}/agent-workspace/memory/.session-hooks.log\""
}
```

Observed 2026-04-24: `Stop` hook from a spawned subagent failed because `$PWD` was the subagent's working directory. Using `$CLAUDE_PROJECT_DIR` resolves from any cwd.

## Spawned-session awareness

Hooks can also inspect `$ORCH_SPAWNED`:
- `true` → orchestrator-spawned, never prompt user
- `false` → interactive, free to use AskUserQuestion

See `.claude/skills/spawned-session-mode/SKILL.md` for the full branch pattern.
