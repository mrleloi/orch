# Decision 026 — CF-21: Defer tool_use_id Correlation Probe to v2.3

**Date**: 2026-04-27
**Author**: sandwich-architect (sonnet) — Task 7.3.1
**Status**: ACCEPTED
**Carryforward**: CF-21 (from 7.2.5 verifier § Concern 1 + Carryforwards to Substage 7.3)

---

## Problem Statement

During substage 7.2 (dispatch.jsonl capture seam, SC-33), 4 real COMPLETED events were
captured in `agent-workspace/memory/dispatch.jsonl`. Every line shows:
```json
{"event":"COMPLETED","agent_type":"unknown-agent","model":"unknown",...}
```

The sidecar correlation mechanism (dispatch-jsonl-recorder.sh reads `tool_use_id` from
PreToolUse stdin payload, writes a `.dispatch-pending-<id>.jsonl` sidecar, then at
SubagentStop merges the pending entry) produced zero successful merges. `agent_type` and
`model` fell back to "unknown-agent"/"unknown" on every COMPLETED line.

Two root causes identified by the 7.2.5 verifier (§ Concern 1):

**Root Cause A — settings.json reload timing**: The 4 COMPLETED events likely fired before
the PreToolUse hook was active. Claude Code reads `settings.json` once at session start; if
the settings.json PreToolUse wiring was written *during* a running session (as happened in
7.2.x development), those PreToolUse events would not fire until the next session start.
This is a transient one-time race condition that self-heals on next session reload.

**Root Cause B — PreToolUse stdin payload missing tool_use_id**: The architect spec for 7.2
(§ Risk 1) warned that Claude Code may not include `tool_use_id` in the PreToolUse stdin
payload. If the payload shape is `{ tool_name, tool_input, ... }` without `tool_use_id`,
the script's `jq -r '.tool_use_id // empty'` extraction returns empty, and the sidecar
filename uses `uuidgen` as fallback. The SubagentStop's `agent_id` (the real Claude Code
tool_use_id) then cannot match any sidecar file.

---

## Why Defer to v2.3

### 1. Upstream payload shape is not verifiable in CI

Root Cause B requires inspecting what Claude Code actually sends to the PreToolUse hook's
stdin. This requires a live Claude Code session making a real Task tool call. A vitest spec
cannot exercise this because:
- No live Claude Code process is available in the CI environment
- Stubbing the PreToolUse payload in a unit test would only prove the script handles a
  synthetic payload correctly — already covered by the dispatch-recorder.spec.ts unit tests
  (H1-H6 pass with round-trip fixture, SC-33-A PASS)
- The diagnosis requires `cat /dev/stdin` logging or a diagnostic wrapper, not a static spec

### 2. COMPLETED events are captured correctly

The SC-33-A contract ("dispatch.jsonl writes succeed with schema-conformant lines") is
SATISFIED. COMPLETED events have real `ts_ms` values from the actual SubagentStop hook
firing. These are the timestamps needed for SC-18 realworld benchmark replay. The
`agent_type`/`model` enrichment is secondary metadata — useful for the future but not
blocking on the benchmark use-case.

### 3. SC-33-B replay already works

`scripts/benchmarks/sc18-realworld.ts --use-dispatch-jsonl` groups by `dispatch_id` and
pairs DISPATCHED+COMPLETED. Currently zero pairings exist (0 DISPATCHED in production),
but COMPLETED-only lines are skipped gracefully (OQR-11 console.warn). When Root Cause A
self-heals (next session start after reload), DISPATCHED lines will appear and pair with
future COMPLETED lines.

### 4. 7.3 focus is SC-34 (worktree-isolation spec promotion)

Folding CF-21 into 7.3 would:
- Introduce a test that cannot pass in CI (requires live Claude Code)
- Mix concerns (worktree filesystem isolation vs. hook correlation)
- Risk LOC budget on the worktree spec (target ≤80 LOC)

---

## Accepted Degradation

Until v2.3 fixes this:
- Accumulated COMPLETED-only events in dispatch.jsonl show `agent_type: unknown-agent`
- SC-27 retro PARTIAL→PASS is conditional on having ≥6 *paired* events; this will not
  happen until PreToolUse hook fires correctly AND tool_use_id is present
- The production data is sparse (5 lines total, 0 paired); impact is minimal

---

## v2.3 Fix-List Item

When CF-21 is addressed in v2.3:

1. **Diagnostic step**: Add `cat /dev/stdin > /tmp/pretooluse-$(date +%s).json` wrapper
   temporarily to capture what Claude Code actually sends in PreToolUse stdin. Run 1 real
   dispatch and inspect the file. This answers the Root Cause A vs B question definitively.

2. **If Root Cause A** (timing): Root Cause A self-heals. Verify by checking dispatch.jsonl
   after the next full session restart — expect ≥1 DISPATCHED line.

3. **If Root Cause B** (missing field): Update `dispatch-jsonl-recorder.sh` to use an
   alternative correlation key. Options:
   - `tool_input.description` substring hash as sidecar key
   - Session-scoped counter (monotonic increment per SubagentStop within session)
   - Accept no DISPATCHED enrichment; add `agent_type` inference from `tool_input` fields

4. **Integration probe**: After fix, add a vitest spec or script-level test that verifies
   the sidecar merge works end-to-end using a synthetic PreToolUse payload with the
   identified field structure.

---

## References

- agent-workspace/memory/sessions/2026-04-27-task-7.2.5-substage-verify.md § Concern 1
- agent-workspace/session-plans/pending/7.2-dispatch-jsonl-architect.md § Risk 1
- agent-workspace/memory/decisions/023-7.2-dispatch-jsonl-schema.md (schema is locked)
- phase-7-v2.2-hardening.md §7.3 (substage 7.3 scope)

---

*I-6: This decision document involves no git operations.*
