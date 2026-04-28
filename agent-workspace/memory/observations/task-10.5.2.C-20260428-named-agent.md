# Task 10.5.2.C — Named-agent recovery in component-telemetry

## Status
DONE

## Files Changed
- `scripts/hooks/component-telemetry.sh` (lines 115-124 AGENT_ID extraction added; lines 135-218 classify_component() updated: signature extended to 5 params, SubagentStop case rewritten with sidecar lookup)
- `tests/hooks/component-telemetry.spec.ts` (imports updated, T-NA1 + T-NA2 + C.C.5 added after Case 8, lines ~338-524)

## Tests Added
- `tests/hooks/component-telemetry.spec.ts`: 3 new cases
  - T-NA1: SubagentStop hex agent_id resolved to task-implementer via sidecar
  - T-NA2: 10-event batch fixture, unknown_agent_fraction == 0
  - C.C.5: graceful fallback to unknown-agent when no sidecar file exists

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors; 4 pre-existing web-ui warnings — pre-existing, not introduced by this task)
- test: PASS (14/14; all prior 11 cases + 3 new cases)
- invariant C.C.4: PASS (no Anthropic/SDK references in component-telemetry.sh)
- invariant C.C.5: PASS (C.C.5 test case verifies graceful fallback without crash)

## Deviations from Plan
- Added C.C.5 as a named test case (not in original spec test list T-NA1/T-NA2, but explicitly required by acceptance gate C.C.5)
- T-NA2 uses sequential polling loop per event rather than a single poll at end — necessary on Windows because dedup logic (same ts + component_name) could suppress events fired within the same millisecond

## Concerns
None

## Assumptions Made
1. SubagentStop payload field is `agent_id` (hex) — confirmed by Task B observation and dispatch-jsonl-recorder.sh lines 80+
2. Sidecar entry written by PostToolUse has `agent_type` field (not `subagent_type`) — confirmed by dispatch-jsonl-recorder.sh line 74
3. The sidecar file path uses `SESSION_ID` from the SubagentStop payload (same session that dispatched the agent) — confirmed by D1 design decision (ONE sidecar file per session)
4. `classify_component()` using bash `local` with optional parameters (4/5) is POSIX-compatible — confirmed by existing script using `set -uo pipefail` which allows `local` with default expansion `${4:-}`
