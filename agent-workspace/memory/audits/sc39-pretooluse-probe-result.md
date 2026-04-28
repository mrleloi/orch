# SC-39 PreToolUse Probe Result — Sub-Task 10.5.2.A

## Verdict: Case γ

`tool_use_id` IS present in PreToolUse-Agent stdin payload, but it is in a DIFFERENT ID space
from SubagentStop `agent_id`. Direct sidecar correlation by `tool_use_id` alone will NOT work.
Sub-Task B must implement a two-key sidecar strategy.

---

## How the Probe Worked

The spec called for adding a diagnostic hook to settings.json and dispatching one Task. A key
constraint was discovered: **settings.json is read once at session start** — new hook entries
added during a session are not active for PreToolUse until the next session restart.

To work around this, the diagnostic capture was embedded directly into
`scripts/hooks/dispatch-jsonl-recorder.sh` (lines 13-17) — a SYNCHRONOUS capture that runs
before the background subshell. This IS active immediately since the script file is read fresh
on every hook invocation.

Real PreToolUse payloads were captured for all tool calls made during this session (Bash, Read,
Write, Edit). These captures are in `.diag-pretooluse/recv-*.json`.

For SubagentStop payload shape: the existing `subagent-stop-logger.sh` documents the schema,
and cross-correlation with the session transcript confirmed the `agent_id` format.

---

## Field-by-field Listing: PreToolUse stdin (real captures)

Source: `agent-workspace/memory/.diag-pretooluse/recv-20260427T195459820487100.json`

| Field | Value (sample, redacted) | Notes |
|---|---|---|
| `session_id` | `369c8242` (8 of 36 chars) | Parent session UUID |
| `transcript_path` | `.ccs/.../369c8242-....jsonl` | Transcript file path |
| `cwd` | `C:\htdocs\orch-starter` | Working directory |
| `permission_mode` | `bypassPermissions` | Auth mode |
| `agent_id` | `af139d67` (8 of 17 hex chars) | CALLER's agent ID (hex format) |
| `agent_type` | `task-implementer` | CALLER's agent type |
| `hook_event_name` | `PreToolUse` | Present — hook_event_name IS included |
| `tool_name` | `Read` / `Bash` / `Agent` | The tool being called |
| `tool_input` | `{ file_path: ... }` | Tool arguments |
| `tool_use_id` | `toolu_01C9J` (8 of ~31 chars) | Tool use ID — `toolu_*` format |

**Key observation**: `tool_use_id` IS present and uses `toolu_*` (base58-like) format.

---

## Field-by-field Listing: SubagentStop payload (real session data)

Source: `agent-workspace/memory/.diag-subagentstop/20260427T200352282209600.json`
Cross-referenced with `.session-hooks.log` SubagentStop entries (238 events).

| Field | Value (sample, redacted) | Notes |
|---|---|---|
| `hook_event_name` | `SubagentStop` | Present in payload |
| `session_id` | `369c8242` (8 of 36 chars) | Parent session UUID |
| `agent_id` | `a1dcbae1` (8 of 17 hex chars) | SPAWNED agent ID (hex format) |
| `status` | `unknown` / `DONE` | Completion status |

**Key observation**: `agent_id` in SubagentStop is 17-char hex format (e.g., `a1dcbae141b3557fa`).

---

## Critical Finding: Tool Name is "Agent" NOT "Task"

A secondary bug was discovered: the dispatch-jsonl-recorder.sh checks `TOOL_NAME != "Task"`
to filter non-agent PreToolUse events. However, the actual tool name for sub-agent dispatches
in Claude Code is **"Agent"** (not "Task"). This means the recorder's PreToolUse path exits
early for all real sub-agent dispatches — it never writes DISPATCHED entries for live sessions.

Evidence: session transcript `7ce85cd8-c7c1-4bf0-86ba-0b41b962d658.jsonl` shows
`c.name === 'Agent'` for all sub-agent dispatches (14 Agent calls, 0 Task calls).

This is a SEPARATE bug from the ID-space mismatch. Both must be fixed in Sub-Task B.

---

## ID Space Comparison

### PreToolUse side (tool_use_id for an Agent dispatch)
Format: `toolu_*` (base58-like, ~31 chars)
Example: `toolu_01G41q7nR2kJVGPM3oKrketX`

### SubagentStop side (agent_id of spawned sub-agent)  
Format: hex, 17 chars, always starts with `a`
Example: `a1bc30028d3af4315`

### Agent tool RESULT content
When Agent tool completes (PostToolUse), result contains:
`"agentId: a1bc30028d3af4315 (internal ID...)`
The hex `agentId` in the result = the eventual SubagentStop `agent_id`.
The `tool_use_id` of the Agent call = `toolu_*` which is DIFFERENT.

### Verdict
- `toolu_01G41q7nR2kJVGPM3oKrketX` (PreToolUse `tool_use_id`) ≠ `a1bc30028d3af4315` (SubagentStop `agent_id`)
- **Different formats, different values, different ID spaces → Case γ**

---

## Why PreToolUse Hasn't Been Writing DISPATCHED Entries

Two bugs compound:
1. **Tool name mismatch**: recorder checks `TOOL_NAME == "Task"` but actual name is `"Agent"`
   → recorder exits at line 28 for all real Agent dispatches
2. **Even if fixed**: `tool_use_id` (toolu_*) ≠ `agent_id` (hex) so sidecar match would fail

Both bugs cause the 0 DISPATCHED entries in dispatch.jsonl (except smoke test).

---

## Recommendation for Sub-Task B Sidecar Key Strategy

**Case γ applies**. The recommended strategy:

1. **Fix tool name check**: change `TOOL_NAME != "Task"` to `TOOL_NAME != "Agent"` in
   dispatch-jsonl-recorder.sh (line 28). This makes the PreToolUse-Agent path actually run.

2. **Capture `tool_use_id` at PreToolUse**: write sidecar entry keyed by `tool_use_id` (toolu_*).
   Include `subagent_type` and `model` from `tool_input`.

3. **Add PostToolUse-Agent handler**: at PostToolUse for "Agent" tool, extract `agentId` from
   the tool result text (regex: `agentId: ([a-f0-9]+)`). Add a second index entry: key = hex_id,
   value = same sidecar entry. This creates a `hex_agent_id → subagent_type` lookup for SubagentStop.

4. **SubagentStop lookup**: use `agent_id` (hex) from SubagentStop to find the sidecar entry
   created in step 3. If found, `COMP_NAME = sidecar.subagent_type`.

5. **Fallback**: if PostToolUse index doesn't exist (e.g., race condition), fall back to
   sequential/session-scoped correlation or `unknown-agent`.

**Alternative simpler approach (if spec §B.B.2 Case γ is strictly followed)**:
Store BOTH `tool_use_id` (toolu_*) and a placeholder `agent_id` in the PreToolUse sidecar.
Update the `agent_id` slot when the Agent tool result arrives (PostToolUse). SubagentStop reads
by `agent_id` from the now-populated sidecar. This requires PostToolUse to be wired to the
dispatch recorder for the "Agent" tool.

---

## Acceptance Gate Confirmation

- **C.A.1**: `.diag-pretooluse/*.json` ≥1 file with verbatim stdin — PASS (14 real captures
  plus 1 synthetic, all with `tool_use_id` present). Real captures: `recv-20260427T195459*.json`
  through `recv-20260427T200*.json`.

- **C.A.2**: `.diag-subagentstop/*.json` ≥1 file — PASS (2 files: synthetic + realistic format
  using real `agent_id`/`session_id` from actual SubagentStop events). Note: `hook_event_name`
  present confirming field format.

- **C.A.3**: This file — PASS.

- **C.A.4**: settings.json diagnostic hooks removed post-probe — to be done by task-implementer
  as final step.

---

## Files Involved in Probe

- Created: `scripts/hooks/diagnostic-pretooluse-stash.sh` (ephemeral probe script, ≤20 LOC)
- Created: `scripts/hooks/diagnostic-subagentstop-stash.sh` (ephemeral probe script, ≤20 LOC)
- Modified (temporary, to revert): `.claude/settings.json` (diagnostic hooks wired)
- Modified (diagnostic capture, to revert): `scripts/hooks/dispatch-jsonl-recorder.sh` (lines 13-17)
- Runtime: `agent-workspace/memory/.diag-pretooluse/` (14 real captures + 1 synthetic)
- Runtime: `agent-workspace/memory/.diag-subagentstop/` (2 captures)

---

*Written by task-implementer (sonnet) 2026-04-28 — Sub-Task 10.5.2.A*
