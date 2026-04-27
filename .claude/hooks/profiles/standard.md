---
name: standard
description: Use for default development sessions — most FOCUSED_IMPL and MULTI_TASK_IMPL sessions when not in autonomous mode.
profile: standard
---

# Standard Profile (default)

Active when `ORCH_HOOK_PROFILE=standard` or unset.

## When to use

- Default development
- Most FOCUSED_IMPL and MULTI_TASK_IMPL sessions

## When NOT to use

- Autonomous mode with `ORCH_SPAWNED=true` (use `strict`)
- Any session touching ToS-sensitive adapter / cli subprocess boundary

## Events handled

| Event | Action |
|---|---|
| SessionStart | Log + print profile + print session id |
| SessionEnd | Log |
| Stop | Log |
| PreToolUse (Bash) | Soft-warn on `rm -rf`, `git push`, `git reset --hard` — still allowed via deny list in settings.json |
| PostToolUse (Write, Edit) | No-op (kept deterministic for speed) |

## Wire examples

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "cmd=\"${CLAUDE_TOOL_BASH_COMMAND:-}\"; case \"$cmd\" in rm*-rf*|git*push*|git*reset*--hard*) echo \"[WARN] destructive: $cmd\" >&2 ;; esac"
          }
        ]
      }
    ]
  }
}
```

## When to upgrade to strict

- ORCH_SPAWNED=true (autonomous)
- Touching ToS-sensitive code (adapter / cli subprocess boundary)
- Near a budget cliff where invariant violations are costly
