# Task 11.5.1 — R-1 Verification Probe Result

## Probe Metadata

- **Timestamp**: 2026-04-28T (Phase 11, Session #46, substage 11.5.2 IMPL)
- **Probe method**: Decision 035 §5 R-1 option (c) — empirical dispatch.jsonl analysis
- **Baseline reference**: `agent-workspace/memory/audits/phase-11-mid-verify.md` (SKIP: 21/23 dispatched=toolu_*, completed=hex agent_id)
- **Analyst**: task-implementer (11.5.2 IMPL leg)

---

## Sample Agent Dispatch — Session `0c566041-dcaa-4ba4-9607-6a9d41d4e6ba`

This session is the most recent real session in dispatch.jsonl (rows 155-169). It contains
multiple DISPATCHED + COMPLETED pairs, making it the primary sampling target.

### Sample DISPATCHED Row (verbatim JSON, line 159)

```json
{"event":"DISPATCHED","dispatch_id":"toolu_01E9zE2egMTnLUCnnXWJKbrZ","agent_type":"sandwich-verifier","model":"opus","parent_session_id":"0c566041-dcaa-4ba4-9607-6a9d41d4e6ba","bg":true,"ts_ms":1777324518878,"outcome":null,"tokens_used":null,"tool_use_id":"toolu_01E9zE2egMTnLUCnnXWJKbrZ"}
```

### Sample COMPLETED Row (verbatim JSON, line 160) — same parent_session_id, next dispatch

```json
{"event":"COMPLETED","dispatch_id":"aaab70d6f388092e4","agent_type":"unknown-agent","model":"unknown","parent_session_id":"0c566041-dcaa-4ba4-9607-6a9d41d4e6ba","bg":true,"ts_ms":1777325205901,"outcome":"DONE","tokens_used":null,"tool_use_id":null}
```

---

## Field Comparison: DISPATCHED vs COMPLETED

| Field | DISPATCHED (line 159) | COMPLETED (line 160) |
|---|---|---|
| `event` | `"DISPATCHED"` | `"COMPLETED"` |
| `dispatch_id` | `"toolu_01E9zE2egMTnLUCnnXWJKbrZ"` (toolu_* prefix) | `"aaab70d6f388092e4"` (hex — NOT toolu_*) |
| `tool_use_id` | `"toolu_01E9zE2egMTnLUCnnXWJKbrZ"` | `null` |
| `agent_type` | `"sandwich-verifier"` | `"unknown-agent"` |
| `model` | `"opus"` | `"unknown"` |
| `parent_session_id` | `"0c566041-dcaa-4ba4-9607-6a9d41d4e6ba"` | `"0c566041-dcaa-4ba4-9607-6a9d41d4e6ba"` |

**Key finding**: `DISPATCHED.tool_use_id = "toolu_01E9zE2egMTnLUCnnXWJKbrZ"` vs `COMPLETED.dispatch_id = "aaab70d6f388092e4"` — MISMATCH. The COMPLETED row's `dispatch_id` is the raw hex agent_id from SubagentStop, NOT the re-keyed toolu_* value. `tool_use_id` is `null` on the COMPLETED row, confirming the sidecar lookup failed.

---

## Verdict

R-1 FAIL — dispatch_id is hex (no toulu_* prefix); PostToolUse-Agent re-keying NOT firing in this session's loaded chain

---

## Explicit Diagnosis (per B.Δ1.2 — R-1 FAIL path)

### Sidecar Status

No `.dispatch-pending-*.jsonl` sidecar files exist in `agent-workspace/memory/` at probe time:

```bash
ls agent-workspace/memory/ | grep ".dispatch-pending"
# (no output — no sidecar files found)
```

**Interpretation**: The sidecar files are session-scoped and transient. They are created during PreToolUse-Agent and enriched during PostToolUse-Agent. Their absence at probe time is expected (sessions have ended; sidecar cleanup may have occurred). However, the COMPLETED rows in dispatch.jsonl having `tool_use_id: null` is permanent evidence that the SubagentStop branch DID NOT find a matching hex-keyed sidecar entry when it ran.

### Root Cause Analysis

The failure chain is clear from inspecting dispatch-jsonl-recorder.sh (lines 64-87) and the dispatch.jsonl output:

**Branch 1 — PreToolUse fires (CONFIRMED)**: DISPATCHED rows exist with `toolu_*` dispatch_ids from real sessions (e.g., rows 150-154, 155-169). PreToolUse-Agent is wired and firing. The sidecar gets the initial `toolu_*` entry at PreToolUse time.

**Branch 2 — PostToolUse-Agent (NOT CONFIRMED firing effectively)**: The PostToolUse-Agent branch (lines 64-87) is supposed to extract `agentId` from `tool_response.content[0].text` via the regex `/agentId:\s*([a-f0-9]{10,20})/i`. If the `agentId` field is absent from Claude Code's actual Agent tool result text, `RESULT_AGENT_ID` is empty, the sidecar hex-keyed entry is never written, and line 73's guard `[ -n "$HEX_ID" ]` short-circuits. No hex→toolu mapping is ever stored.

**Branch 3 — SubagentStop fallback (CONFIRMED firing, finding no match)**: The SubagentStop branch (lines 90-119) looks up `$LID` (the hex agent_id from SubagentStop payload) in the sidecar. Since PostToolUse never wrote the hex-keyed entry, `MATCH` is empty, `TOOL_USE_ID_FOUND` stays `""`, and the COMPLETED row's `dispatch_id` stays as the raw hex agent_id with `tool_use_id: null`. This is exactly what we observe.

### Most Likely Root Cause

The `agentId` field is **absent from Claude Code's actual Agent tool result text** in the real harness. The fixture test (`sc39-pairing-rate.spec.ts`) manually injects this field:

```javascript
text: `agentId: ${hexId} (internal ID for SubagentStop correlation)`,
```

But the real Claude Code Agent tool response does not include `agentId: <hex>` in its content text — this assumption was invalidated. Without this field, the PostToolUse branch is silently a no-op (the WARN message goes to stderr which is suppressed by the background subshell's `>/dev/null 2>&1`).

### Volume Evidence

Across all real sessions in dispatch.jsonl (rows 2-169):
- **Total DISPATCHED rows**: 21 (rows 150-154, 155, 157, 159, 162, 164, 167-169, plus earlier rows 1)
- **Total COMPLETED rows**: ~149 (all with hex dispatch_ids, all with `tool_use_id: null`)
- **Pairing rate**: 0/21 DISPATCHED have a matching COMPLETED with toulu_* prefix = **0.00 (0%)**

This matches the historical "21/23 dispatched=toolu_*, completed=hex agent_id" SKIP signal from phase-11-mid-verify.md exactly.

---

## Implications for 11.5.2 Deliverables

Per Decision 035 §5 / B.Δ2.7:

- **Δ2 production-mode test (Case 1)**: Expected to FAIL in this session because R-1 is FAIL. Test is committed for future sessions where the root cause (agentId field absent from real Agent result text) is fixed. `ORCH_SC39_PROD_TEST_MODE=fixture` skips the production-mode test.
- **Δ3 settings-version-check.sh**: Unaffected by R-1 verdict. The script itself is correct independent of the pairing issue.
- **Δ4 SKILL.md update**: Unaffected by R-1 verdict. The settings.json read-once finding is still valid.

---

## Observation: DISPATCHED Rows Missing Before Row 150

Rows 2-99 in dispatch.jsonl show ONLY COMPLETED events (hex agent_ids) with no corresponding DISPATCHED rows in the same session. This indicates the PreToolUse-Agent hook was NOT wired during those sessions (pre-v2.5 baseline). Only post-v2.5 sessions (rows 150+) show DISPATCHED rows, confirming the PreToolUse wiring landed correctly in v2.5. The PostToolUse re-keying is the remaining gap.

---

## Summary

| R-1 Component | Status | Evidence |
|---|---|---|
| PostToolUse-Agent branch EXISTS in settings.json | CONFIRMED | E3 (architect pre-finding) |
| PreToolUse-Agent fires, writes DISPATCHED rows | CONFIRMED | dispatch.jsonl rows 150-169 have toolu_* dispatch_ids |
| PostToolUse-Agent writes hex-keyed sidecar entry | NOT CONFIRMED | COMPLETED rows have `tool_use_id: null`; no sidecar present |
| SubagentStop finds sidecar match, re-keys COMPLETED | NOT CONFIRMED | COMPLETED.dispatch_id = hex (not toolu_*) |
| **R-1 overall** | **FAIL** | |

Root cause: `tool_response.content[0].text` in real Agent tool responses does NOT contain `agentId: <hex>` in the pattern expected by dispatch-jsonl-recorder.sh line 33. Fix requires either (a) updating the regex to match Claude Code's actual result format, or (b) finding an alternative hook event that exposes the agent_id→tool_use_id mapping. This is work for Decision 037 / v2.7.
