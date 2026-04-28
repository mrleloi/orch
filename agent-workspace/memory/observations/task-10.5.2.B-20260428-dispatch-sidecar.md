# Task 10.5.2.B — Dispatch sidecar seam fix (Case γ)

## Status
DONE

## Files Changed
- `scripts/hooks/dispatch-jsonl-recorder.sh` (full rewrite, lines 1-69)
- `tests/hooks/dispatch-recorder.spec.ts` (lines 30-41 REQUIRED_FIELDS +1, H1/H2/H3/H5/H6/T2/T4 tool_name updated, H8+H9 added ~lines 350-425)
- `tests/integration/sc39-pairing-rate.spec.ts` (new, 150 LOC)

## Tests Added
- `tests/hooks/dispatch-recorder.spec.ts`: 2 new cases (H8, H9)
- `tests/integration/sc39-pairing-rate.spec.ts`: 1 integration case (50-pair cycle)

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors; 4 pre-existing web-ui warnings unrelated)
- test C.B.1: PASS (10/11 — 1 skipped = H7 win32 skip, expected per spec)
- test C.B.2: PASS (pairing_rate = 1.000 on 50 pairs; threshold 0.40)
- invariants C.B.5: PASS (no Anthropic/SDK references in dispatch-jsonl-recorder.sh)
- schema C.B.4: PASS (132 pre-existing dispatch.jsonl lines all parse against 9-field schema; new field tool_use_id additive)

## Deviations from Plan
1. **REQUIRED_FIELDS updated from 9 to 10**: T2 previously asserted exactly 9 fields; updated to 10 (tool_use_id added). This is correct behavior — the spec adds tool_use_id as field 10.
2. **H1-H6/T2/T4 tool_name updated from "Task" to "Agent"**: Required by Bug 1 fix. The guard change means "Task" is no longer accepted; existing tests used the wrong tool_name. Updated to "Agent" so H1-H7 still PASS (which they do).
3. **Integration test uses polling between steps**: Background subshell timing requires polling for sidecar entry presence before firing SubagentStop. Without polling, SubagentStop fires before PostToolUse's background subshell writes the hex index. Used `Atomics.wait` polling (same pattern as existing hook specs). Test runs in ~25s for 50 pairs on this machine.

## Sidecar Key Strategy Implemented (Case γ)
Two-key approach:
- **PreToolUse** writes sidecar entry: `{dispatch_id: "toolu_*", tool_use_id: "toolu_*", agent_type, model}`
- **PostToolUse** parses `agentId: <hex>` from result text (regex `agentId:\s*([a-f0-9]{10,20})/i`) and writes second entry: `{dispatch_id: "<hex>", tool_use_id: "toolu_*", agent_type, model}`
- **SubagentStop** greps sidecar by `dispatch_id == agent_id (hex)` → retrieves `tool_use_id (toolu_*)` → rewrites COMPLETED `dispatch_id` to `toolu_*` for loadTaskFinishRecordsFromDispatchJsonl groupBy compatibility (B.B.4).
- **Fallback**: if no hex sidecar entry found, dispatch_id stays as hex agent_id → `unknown-agent` (C.5 graceful degradation preserved).

## Validated Pairing Rate
pairing_rate = 1.000 (50/50 pairs) in integration test.

## Assumptions Made
1. PostToolUse hook fires with `hook_event_name: "PostToolUse"` in Claude Code (consistent with PreToolUse pattern; not explicitly confirmed by probe but structurally necessary).
2. Agent tool result text format `"agentId: <hex>"` is stable enough for best-effort regex (spec §B.B.3 says "if PostToolUse parsing is fragile, fall back to best-effort").
3. The `settings.json` PostToolUse hook for "Agent" tool must be wired for this to work in production (not done in this task — that is a configuration concern outside the script itself).
