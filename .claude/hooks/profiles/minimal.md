---
name: minimal
description: Use for fast exploratory sessions, read-only investigation, or demos where hook noise is counterproductive.
profile: minimal
---

# Minimal Profile

Active when `ORCH_HOOK_PROFILE=minimal`.

## When to use

- Fast exploratory sessions
- Reading-only investigation
- Demos where hook noise is counterproductive

## When NOT to use

- Autonomous mode (use `strict`)
- Production-path edits (use `standard` minimum)
- Any session touching `packages/core/**`

## Events handled

| Event | Action |
|---|---|
| SessionStart | Log to `.session-hooks.log` |
| SessionEnd | Log to `.session-hooks.log` |
| Stop | Log to `.session-hooks.log` |

Nothing else. No pre-tool blocks, no post-tool checks.

## Wire example

```jsonc
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[session-start] $(date -Iseconds)\" >> \"${CLAUDE_PROJECT_DIR:-.}/.session-hooks.log\""
          }
        ]
      }
    ]
  }
}
```
