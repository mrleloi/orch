# Primitive Verification — Claude Code Hooks Roundtrip

**Date**: 2026-04-24
**Source**: Claude Code official docs via Context7 (`/websites/code_claude`) + `.claude/settings.json` hook spec
**Verification method**: Spec read (authoritative schema from docs) + existing `.claude/settings.json` in this repo
**Live end-to-end test**: DEFERRED until Phase 1 daemon skeleton exists (see "End-to-End Test Plan" below)

---

## What Was Verified

- The Claude Code hook event list
- Common payload fields present in every hook
- Event-specific payload fields
- Hook delivery mechanism (`type: "command"` → stdin JSON, or `type: "prompt"` → LLM evaluation)
- Hook output contract (control decision, additionalContext, stdout)
- Matcher syntax (`"startup|resume"`, `"Bash"`, `"Edit|Write"`, etc.)

---

## Hook Events (Claude Code v2.1+)

| Event | Fires when | Can block? |
|---|---|---|
| `SessionStart` | New session starts (or resumes) | No (informational) |
| `SessionEnd` | Session terminates | No (cleanup) |
| `UserPromptSubmit` | User submits a prompt | Yes (can reject) |
| `PreToolUse` | Before a tool executes | Yes (can reject + reason) |
| `PostToolUse` | After a tool returns | No (informational) |
| `Stop` | Claude attempts to stop | Yes (can force continuation) |
| `SubagentStart` | A subagent is spawned | No |
| `SubagentStop` | A subagent returns | Yes (can force continuation) |
| `CwdChanged` | Working directory changes | No |
| `Notification` | Claude Code issues a system notification | No |

All events relevant to Orch. Primary targets: `SessionStart`, `SessionEnd`, `Stop`, `SubagentStop`, `PostToolUse`.

---

## Common Payload Fields

Every hook event JSON contains:

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../<uuid>.jsonl",
  "cwd": "/path/to/project",
  "hook_event_name": "<EventName>",
  "permission_mode": "default"
}
```

- `session_id`: UUID of the Claude Code session (maps to orch `Session.claudeSessionId`)
- `transcript_path`: absolute path to the JSONL transcript Claude Code writes (orch can tail for token counts / recovery)
- `cwd`: current working directory at hook fire time
- `hook_event_name`: the event literal string
- `permission_mode`: `default` | `acceptEdits` | `bypassPermissions` | `plan`

---

## Event-Specific Fields

### SessionStart

```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "...",
  "hook_event_name": "SessionStart",
  "source": "startup",         // "startup" | "resume" | "clear"
  "model": "claude-sonnet-4-6"
}
```

**Orch use**: `OrchState.sessionStarted(projectId, claudeSessionId, model, source)`. Also seeds a root OTEL span `orch.session.run`.

### SessionEnd

```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "...",
  "hook_event_name": "SessionEnd",
  "reason": "other"            // "user_exit" | "context_full" | "rate_limit" | "error" | "other"
}
```

**Orch use**: `OrchState.sessionEnded(claudeSessionId, reason)`. Categorize into trace attribute `session.end_reason` for success criteria O-4.

### Stop (and SubagentStop — same shape)

```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "...",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": true,
  "last_assistant_message": "I've completed the refactoring..."
}
```

**Orch use**: observe completion (do NOT block — orch should never force Claude Code to keep going). Log `last_assistant_message` as the final spanattr for the session trace.

### PreToolUse / PostToolUse

```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "...",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
  // PostToolUse also adds: "tool_response": {...}
}
```

**Orch use**: mostly pass-through for tracing (one OTEL span per tool call). Not used for control.

### CwdChanged

```json
{
  "session_id": "abc123",
  "hook_event_name": "CwdChanged",
  "old_cwd": "/Users/my-project",
  "new_cwd": "/Users/my-project/src"
}
```

**Orch use**: sanity check that session stays within expected project root. If `new_cwd` escapes project, log warning.

---

## Hook Configuration Format

In `.claude/settings.json` or project-level:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -X POST http://localhost:4820/hooks/session-end -H 'Content-Type: application/json' -d @-",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- Hook receives JSON payload on **stdin** (for `type: command`)
- `matcher` can be a regex string; `""` = match all
- `timeout` in seconds (default 60)
- Multiple `hooks` can fire per event (concurrent)
- `$CLAUDE_PROJECT_DIR`, `$CLAUDE_SESSION_ID` env vars available

---

## Hook Output Contract

Command hook stdout, when JSON-parseable, can control behavior:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "injected into Claude's next turn"
  }
}
```

For blocking hooks (`PreToolUse`, `Stop`, etc.):

```json
{ "decision": "block", "reason": "why this was blocked" }
```

Orch's hook targets should return EMPTY stdout (no control, just record).

---

## Orch Integration Plan (Phase 1)

1. **HTTP receiver**: NestJS controller at `POST /hooks/:event`
   - Accepts raw JSON body
   - Validates `hook_event_name` matches path param
   - Dispatches to appropriate feature module (sessions, tracing, queue)
   - Returns 200 immediately (fire-and-forget from Claude Code's perspective)

2. **Project integration**: `orch init` injects snippet into target project's `.claude/settings.json`:
   ```json
   {
     "hooks": {
       "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:4820/hooks/SessionStart -H 'Content-Type: application/json' --data @-" }] }],
       "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:4820/hooks/SessionEnd -H 'Content-Type: application/json' --data @-" }] }],
       "Stop":         [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:4820/hooks/Stop -H 'Content-Type: application/json' --data @-" }] }],
       "SubagentStop": [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:4820/hooks/SubagentStop -H 'Content-Type: application/json' --data @-" }] }]
     }
   }
   ```

3. **Safety**: Hooks call localhost only (charter S-3). If orch is down, `curl` fails silently (`-s`), Claude Code proceeds without blocking.

---

## Assumptions Flagged for Later Verification

| Assumption | Why | How to verify |
|---|---|---|
| Hooks fire reliably even under rate-limit exit | Rate-limit termination is probably a normal SessionEnd event | Phase 1: observe real rate-limit exit, check `SessionEnd.reason` |
| `transcript_path` file is readable while session is still writing | Need append-safe read for live tail feature | Phase 2: tail while session runs, confirm JSONL appends atomically |
| `curl --data @-` passes raw stdin body faithfully | Standard but worth confirming on Windows Git Bash | Phase 1 integration test |
| Multiple hooks for same event run serially, not in parallel | Unclear from docs — affects latency | Phase 1 experiment with 2 hooks logging timestamps |
| `matcher` regex against tool_name for PreToolUse uses which regex flavor? | ECMAScript vs Go vs POSIX — matters for injection | Skip for now, not on Orch critical path |

---

## End-to-End Test Plan (defer to Phase 1)

When daemon skeleton exists:

1. Start orch with HTTP receiver on 4820
2. Install hooks via `orch init` in a throwaway test project
3. Run `claude -p "say hi"` in test project
4. Assert orch receives `SessionStart` → `(assistant turn)` → `SessionEnd`
5. Assert `session_id` matches across all three events
6. Assert `SessionEnd.reason` is classified correctly

Test lives at `packages/core/test/integration/hooks-roundtrip.test.ts`.

---

## Verdict

**Hook primitive is SPEC-COMPLIANT and sufficient for Phase 1 design.** No blockers identified. Real integration test is cheap once daemon skeleton exists, so early ad-hoc verification is lower-value than spec review.
