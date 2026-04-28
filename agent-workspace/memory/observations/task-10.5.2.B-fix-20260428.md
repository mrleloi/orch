# Task 10.5.2.B-fix — Spec-Compliance Blocker Fixes

## Status
DONE

## Files Changed
- `.claude/settings.json`: lines 208-233 — added PostToolUse entry for dispatch-jsonl-recorder.sh
- `scripts/hooks/dispatch-jsonl-recorder.sh`: lines 97-108 — emit `null` for `tool_use_id` on sidecar-miss (B.B.3)
- `tests/hooks/dispatch-recorder.spec.ts`: line 313 comment update (9→10), H10 test added (lines 491-525)

## Tests Added
- `tests/hooks/dispatch-recorder.spec.ts`: 1 new case (H10) — COMPLETED with no sidecar entry produces `tool_use_id: null`

## Gates
- typecheck: PASS
- lint: PASS (0 errors; 4 pre-existing web-ui warnings unrelated to task)
- test dispatch-recorder.spec.ts: PASS (11/12 — H7 skipped win32 as designed)
- test sc39-pairing-rate.spec.ts: PASS (1/1; pairing_rate=1.000 >> 0.40 gate)
- `cat .claude/settings.json | jq -e '.hooks.PostToolUse'`: PASS (3 entries; entry[1] = dispatch-jsonl-recorder.sh with matcher ".*")
- invariants: PASS — no violations

## Fixes Applied

### BLK-1 — PostToolUse hook wiring
Added a PostToolUse entry in `.claude/settings.json` between the budget-watchdog and component-telemetry entries:
```json
{
  "matcher": ".*",
  "hooks": [
    {
      "type": "command",
      "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/dispatch-jsonl-recorder.sh\""
    }
  ]
}
```
The script's internal guard at lines 35-36 (`[ "$TOOL_NAME" != "Agent" ] && exit 0`) ensures only Agent PostToolUse events are processed. No redundant filtering needed in the settings entry.

### BLK-2 — `tool_use_id: null` on sidecar-miss
Changed the COMPLETED row emit logic in `dispatch-jsonl-recorder.sh`. On sidecar-miss, `TUI_JSON` is set to literal `null` (not quoted). On hit, `TUI_JSON` is set to the quoted tool_use_id string. The `dispatch_id` still falls back to hex agent_id on miss (B.B.4 graceful degradation preserved).

Before:
```bash
printf '...' "...\"tool_use_id\":\"${DID}\"..."
```
After:
```bash
if [ -n "$TOOL_USE_ID_FOUND" ]; then
  DID="$TOOL_USE_ID_FOUND"
  TUI_JSON="\"$TOOL_USE_ID_FOUND\""
else
  DID="${LID:-unknown}"
  TUI_JSON="null"
fi
printf '...' "...\"tool_use_id\":${TUI_JSON}..."
```

### NIT-1 — Stale comment updated
`tests/hooks/dispatch-recorder.spec.ts:313`: "all 9 fields" → "all 10 fields"

### H10 — New test
Added H10 in the SC-39 Case γ describe block. Sends SubagentStop with hex agent_id that has no prior sidecar entry. Asserts:
- `event` = `COMPLETED`
- `dispatch_id` = hex agent_id (graceful degradation)
- `tool_use_id` = `null` (JSON null, not string)
- `agent_type` = `unknown-agent`
- All 10 required fields present (via `assertSchema`)

## Deviations from Plan
None.

## Assumptions Made
- The PostToolUse entry was inserted between budget-watchdog and component-telemetry (ordering preserves existing behavior; dispatch-recorder writes sidecar before telemetry reads it, which is correct).
- IMP-1 sidecar-field-name deviation explicitly left out of scope per task instructions.
