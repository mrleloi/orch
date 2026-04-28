---
name: spawned-session-mode
description: Use whenever checking env ORCH_SPAWNED to branch interactive vs autonomous behavior. Applies to every command, subagent, and skill that might prompt the user. Core mechanism for orchestrator-driven autonomous execution.
allowed-tools: [Read, Write]
archetype: discipline
model: sonnet
---

# Spawned Session Mode

## What it is

`ORCH_SPAWNED=true` is the signal that the current Claude Code session was started by an orchestrator (not by a human at a terminal). Every behavior that assumes interactive human should branch on this variable.

## Why it exists

The Orch daemon spawns Claude Code sessions to execute managed-project tasks without human input. If those sessions call `AskUserQuestion`, wait for confirmation, or ask "should I proceed?" — the daemon blocks forever or timeouts. Autonomous execution requires explicit dual-mode behavior.

## When to check

**In every command, subagent, or skill that:**
- Asks clarifying questions
- Shows a "proceed?" confirmation
- Performs a destructive op that normally needs I-6 confirmation
- Writes to a shared log / sends a Telegram message / posts a Web UI notification

**In every code path that:**
- Reads from stdin expecting user input
- Blocks on a modal dialog
- Pauses for "review before merge"

## The Branch Pattern

```
if os.getenv('ORCH_SPAWNED') == 'true':
    # Autonomous mode
    # - no AskUserQuestion
    # - auto-choose most charter-aligned option
    # - document decisions in decisions/NNN-*.md
    # - end with structured completion report
else:
    # Interactive mode
    # - AskUserQuestion for ambiguity
    # - show confirmation for destructive
    # - narrate decisions conversationally
```

## Structured Completion Report Format

When `ORCH_SPAWNED=true`, the final output MUST be a machine-parseable YAML-like block:

```yaml
---
status: DONE | DONE_WITH_CONCERNS | BLOCKED | ESCALATED
produced_files:
  - absolute/path/to/file1
  - absolute/path/to/file2
decisions_made:
  - agent-workspace/memory/decisions/NNN-<slug>.md
concerns:
  - "one-line concern"
blockers:
  - "one-line blocker, if any"
next_action:
  command: <slash-command-or-subagent-invocation>
  args: { ... }
budget_consumed: NNK / NNNK
---
```

Orchestrator parses this to decide the next hop.

**CRITICAL**: The YAML completion block MUST be the LAST content in the final assistant message. The orchestrator parses the trailing YAML; any prose after the closing `---` will be silently discarded or cause parse failure.

## Large-output verifier protocol

When a spawned session is forbidden (by system-reminder or CLAUDE.md) from writing summary/findings/analysis `.md` files, return findings **inline in the final assistant message** followed by the YAML completion block. Do NOT create `findings.md`/`analysis.md`/`summary.md` to bypass the restriction — inline prose IS the output.

## Forbidden Tools (when ORCH_SPAWNED=true)

The following are **NEVER** permitted in a spawned session. Violations block the orchestrator loop.

| Forbidden | Reason |
|---|---|
| `AskUserQuestion` | Nobody is listening; daemon blocks forever |
| Any modal confirmation prompt ("Should I proceed?", "Are you sure?") | Same — daemon cannot answer |
| Interactive stdin read | Blocks with no timeout |
| Writing separate summary/findings `.md` files when CLAUDE.md prohibits it | Violates system-reminder; use inline prose instead |

**Escalation instead of asking**: if you hit true ambiguity that requires human judgment, write `agent-workspace/memory/escalation.md` and emit `status: ESCALATED`. Do NOT ask.

## Red Flags — STOP

- "The user's not around, I'll just ask anyway" → in ORCH_SPAWNED=true, nobody is listening
- "Skipping I-6 destructive confirmation because ORCH_SPAWNED" → NEVER; I-6 is absolute even in autonomous
- "I won't write a decision log because nobody will read it" → wrong, the orchestrator may consult it on resume
- "Structured report is boilerplate, narrate instead" → orchestrator cannot parse prose

## Rationalization Counters

**Pressure**: "Interactive mode is simpler, just always treat the session as interactive."
**Correct response**: Interactive-only mode defeats the purpose of an orchestration daemon. Orch's reason to exist is to run Claude Code sessions without human wait.

**Pressure**: "The decision log is not auditable in autonomous mode, skip it."
**Correct response**: Decision logs are MORE critical in autonomous mode, because there's no user context to reconstruct intent. Log precisely because autonomy.

**Pressure**: "I-6 confirmation is interactive, ORCH_SPAWNED should bypass it."
**Correct response**: I-6 exists because destructive operations in autonomous mode are the highest risk. In spawned mode, the orchestrator sends the confirmation (via Telegram button or pre-authorized flag). The session still REQUIRES the flag; it just doesn't block on stdin.

## Mapping: what changes in spawned mode

| Behavior | Interactive | Spawned |
|---|---|---|
| Ambiguity | AskUserQuestion | auto-resolve by charter + log decision |
| Destructive op | show confirm button | require pre-authorized flag in task envelope |
| Narration | conversational | structured YAML completion block |
| Session-start greeting | brief banner | skip; assume orchestrator knows context |
| `/session-start` command | user-triggered | auto-run via SessionStart hook |
| Error presentation | "I hit an issue, what do you want?" | write escalation.md, exit with BLOCKED |
| `confusion-protocol` | ask user | write decision or escalation |

## How commands and subagents declare spawned-awareness

Every agent and command file should include a `## Spawned Session Handling` section near the end with explicit divergence rules. If missing → add it before using the agent in orchestrated flows.

## Settings.json edits don't take effect until next session boot

Claude Code reads `.claude/settings.json` exactly once at session start. The hook chain is loaded into memory and remains fixed for the session lifetime. Mid-session edits are silently inert until the next session boots.

A spawned session editing `settings.json` cannot measure its own fix — current-session telemetry reflects the pre-fix chain. This is the root cause behind Decision 034's dispatch-pairing-rate SKIP persisting into Phase 11 despite v2.5 landing the wiring (see `decisions/035-sc39-retry-verdict-v2.5.md` §3.1, §5 R-1).

Regression detector: `scripts/audit/settings-version-check.sh` (Decision 035 §6 deliverable). `--init` at SessionStart captures baseline; later runs detect mid-session drift.

**Action item**: if your task envelope edits `.claude/settings.json`, set `requires_session_restart: true` in your completion YAML so the orchestrator chains a restart.

## Detecting spawned mode programmatically

```bash
# In hook scripts
[ "$ORCH_SPAWNED" = "true" ]

# In subagent prompts (inspect env)
ORCH_SPAWNED=${ORCH_SPAWNED:-false}
```

## Escalation path (spawned mode)

1. Write `agent-workspace/memory/escalation.md` with specific question
2. Emit completion report with `status: ESCALATED`
3. HALT

Orchestrator observes the escalation status, can either:
- Notify human via Telegram / Web UI
- Retry after context change
- Close the task as unresolvable
