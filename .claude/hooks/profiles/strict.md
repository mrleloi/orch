---
name: strict
description: Use for ORCH_SPAWNED=true sessions, production-path commits, and any session where a reviewer is not guaranteed to run afterward.
profile: strict
---

# Strict Profile

Active when `ORCH_HOOK_PROFILE=strict`.

## When to use

- `ORCH_SPAWNED=true` sessions (autonomous)
- Production-path commits
- Any session where a reviewer is NOT guaranteed to run afterward
- MULTI_TASK_IMPL on `packages/core/**`

## When NOT to use

- Fast exploratory / read-only sessions (overhead not justified; use `minimal`)
- Demos where hook latency is counterproductive

## Events handled

| Event | Action |
|---|---|
| SessionStart | Log + print profile + assert memory/current-execution.md exists |
| SessionEnd | Log + assert `/invariant-check` ran this session (grep `.session-hooks.log`) |
| Stop | Log; run `budget-watchdog.sh`; run `autonomous-stop-watchdog.sh`; run `tool-call-first-lint.sh` (Mode-A advisory lint) |
| PreToolUse (Bash) | Hard-block on destructive ops (already in settings.json deny, plus lint) |
| PreToolUse (Write, Edit) | Block if path is in deny list; log every write target |
| PostToolUse (Edit, Write) | Run scoped invariant grep if path matches `packages/core/**` |

## Wire examples

```jsonc
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "[ \"${ORCH_HOOK_PROFILE:-standard}\" = \"strict\" ] && { path=\"${CLAUDE_TOOL_EDIT_FILE_PATH:-${CLAUDE_TOOL_WRITE_FILE_PATH:-}}\"; case \"$path\" in packages/core/*) rg -q 'anthropic|openai|@anthropic-ai' \"$path\" && echo \"[I-1 VIOLATION] $path contains SDK import\" >&2 ;; esac; }; :"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "[ \"${ORCH_HOOK_PROFILE:-standard}\" = \"strict\" ] && bash \"${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/tool-call-first-lint.sh\" || :"
          }
        ]
      }
    ]
  }
}
```

## Costs

- Slight latency on each Edit/Write (grep pass)
- Slight latency on each Stop (tool-call-first-lint.sh Mode-A advisory scan — < 100 ms target per INV-10)
- Hook failures can block work — if false-positive, downgrade to `standard` for that session and file an issue

## Never mix with production secrets

Strict mode logs write-target paths. Ensure `.session-hooks.log` is gitignored (it is).
