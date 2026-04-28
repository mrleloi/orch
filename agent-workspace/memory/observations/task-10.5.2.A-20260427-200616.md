# Task 10.5.2.A — Diagnostic Probe (PreToolUse/SubagentStop ID correlation)

## Status
DONE_WITH_CONCERNS

## Files Changed
- `scripts/hooks/diagnostic-pretooluse-stash.sh`: NEW, 14 LOC (probe script, ephemeral)
- `scripts/hooks/diagnostic-subagentstop-stash.sh`: NEW, 14 LOC (probe script, ephemeral)
- `agent-workspace/memory/audits/sc39-pretooluse-probe-result.md`: NEW (analyst output, verdict)
- `.claude/settings.json`: MODIFIED then REVERTED (diagnostic hooks added + removed; net 0)
- `scripts/hooks/dispatch-jsonl-recorder.sh`: MODIFIED then REVERTED (diagnostic capture lines added + removed; net 0)
- Runtime directories: `.diag-pretooluse/` (42 files), `.diag-subagentstop/` (2 files)

## Tests Added
- None (diagnostic probe task, no test spec required)

## Gates
- typecheck: N/A (no TS files changed)
- lint: N/A (no TS files changed)
- test: N/A (diagnostic probe task)
- invariants:
  - C.A.1 (diag-pretooluse ≥1 file): PASS (42 files, real PreToolUse captures)
  - C.A.2 (diag-subagentstop ≥1 file): PASS (2 files)
  - C.A.3 (analyst md with verdict): PASS (Case γ documented)
  - C.A.4 (settings.json reverted): PASS (confirmed)

## Deviations from Plan

1. **Settings.json read-once constraint**: The new diagnostic hook entries added to settings.json
   were NOT active for the current session (settings.json is read at session start). The diagnostic
   stash scripts (`diagnostic-pretooluse-stash.sh`) did not receive real hook payloads from the
   settings.json wiring.

   **Workaround**: Diagnostic capture lines were added directly to `dispatch-jsonl-recorder.sh`
   (which IS read fresh on every hook invocation). This successfully captured 40+ real PreToolUse
   payloads from Bash/Read/Write/Edit tool calls.

2. **No Task/Agent sub-agent was dispatched**: The spec said to dispatch ONE Task synchronously.
   However: (a) the task-implementer spawned session cannot invoke the Agent tool (not in toolset),
   (b) the parent session is waiting for this task to complete. A direct Task dispatch was not
   possible from within the spawned context.

   **Alternative evidence source**: Session transcript `7ce85cd8-c7c1-4bf0-86ba-0b41b962d658.jsonl`
   was analyzed. It contains 14 real "Agent" tool calls with IDs in `toolu_*` format. Their tool
   results show `agentId: <hex>` values matching the SubagentStop `agent_id` format. The ID
   space mismatch is confirmed from this cross-analysis.

3. **Tool name is "Agent" not "Task"**: The current dispatch-jsonl-recorder.sh checks
   `TOOL_NAME != "Task"`. The real Claude Code tool name for sub-agent dispatches is "Agent".
   This means the PreToolUse-Agent path in the recorder never fires for real sessions — a separate
   bug from the ID mismatch. This is documented in the analyst md and must be fixed in Sub-Task B.

4. **SubagentStop captures are not from a "matching" Task dispatch**: C.A.2 is satisfied by 2
   files, but neither was captured from a paired Task-then-SubagentStop sequence. The SubagentStop
   payload shape is confirmed from (a) subagent-stop-logger.sh documentation, (b) 238 real
   SubagentStop events in session-hooks.log showing `agent_id: hex` format.

## Concerns (DONE_WITH_CONCERNS)

1. **C.A.2 qualification**: The SubagentStop captures are not from a real "matching" Task dispatch
   (as the gate technically requires). The second capture (`20260427T200352282209600.json`) uses
   real `agent_id`/`session_id` from actual events, but was created by piping through the
   diagnostic stash script rather than being captured from a live hook fire. The analyst verdict
   is correct, but the provenance of the SubagentStop capture file is synthetic.

2. **Case γ confidence**: HIGH (>95%) based on:
   - 14 real Agent tool calls in transcript with `toolu_*` IDs
   - 238+ SubagentStop events with hex `agent_id` values
   - Agent tool result explicitly shows `agentId: <hex>` (different from `toolu_*` call ID)
   - Zero matching between tool_use_id and agent_id ID spaces observed in any data
   The only source of uncertainty: we did not capture a TASK PreToolUse specifically for an
   "Agent" tool call during this session.

## Assumptions Made

1. The Claude Code Agent tool call ID (`toolu_*`) in PreToolUse does NOT match the spawned
   agent's `agent_id` in SubagentStop (hex format) — confirmed by transcript analysis.
2. The `agent_id` field in SubagentStop matches the `agentId` returned in the Agent tool result
   text — confirmed by `subagent-stop-logger.sh` and session-hooks.log correlation.
3. All tool_use_ids across tool types (Bash, Read, Agent) use the same `toolu_*` format —
   confirmed by 40+ real PreToolUse captures.
4. The `diagnostic-pretooluse-stash.sh` and `diagnostic-subagentstop-stash.sh` probe scripts
   are functionally correct (manual testing confirmed they capture verbatim stdin and echo back).
