# Spec Compliance Review — Task 10.5.2.C

**Reviewer**: spec-compliance-reviewer (sonnet)
**Timestamp**: 2026-04-28
**Spec source**: `agent-workspace/session-plans/pending/10.5-sc39-structural-unblock-architect.md` lines 136-155 (Sub-Task 10.5.2.C)
**Observation read**: `agent-workspace/memory/observations/task-10.5.2.C-20260428-named-agent.md` (treated as claim; code is evidence)

---

## Verdict

PASS

---

## Contract Match Matrix

| Clause | Spec Requirement | Code Evidence | Match |
|---|---|---|---|
| B.C.1a — SubagentStop extracts `agent_id` from payload | Hook must read `payload.agent_id` | `component-telemetry.sh:116-124` — dedicated `AGENT_ID` extraction via `node -e JSON.parse(s).agent_id` | ✓ |
| B.C.1b — sidecar lookup at `.dispatch-pending-<session_id>.jsonl` keyed by hex `agent_id` | Lookup in `$MEMORY_DIR/.dispatch-pending-${session}.jsonl` against `dispatch_id` field | `component-telemetry.sh:184,187` — `sidecar_name="${subagent_session:+$MEMORY_DIR/.dispatch-pending-${subagent_session}.jsonl}"` + `grep "\"dispatch_id\":\"${subagent_agent_id}\""` | ✓ |
| B.C.1c — on hit: `COMP_NAME` set from sidecar entry's `agent_type` field | Spec says "subagent_type OR agent_type — implementer's decision-log notes field is named `agent_type`" | `component-telemetry.sh:194` — `JSON.parse(s).agent_type`; confirmed acceptable per spec note | ✓ |
| B.C.1d — on miss: falls back to `unknown-agent` | Current behavior preserved as failsafe | `component-telemetry.sh:203` — `COMP_NAME="${subagent_type:-unknown-agent}"` | ✓ |
| B.C.2 — ONE shared sidecar file; no new sidecar created; no bifurcation | Reads existing `.dispatch-pending-<session>.jsonl` produced by `dispatch-jsonl-recorder.sh` | `component-telemetry.sh:184,187` — reads only; no `>>`/`>` write to sidecar anywhere in the file | ✓ |
| B.C.3 — sidecar lookup gated by `SubagentStop` ONLY; other events unmodified | Non-SubagentStop events must bypass lookup | `component-telemetry.sh:147-217` — lookup logic is entirely inside the `SubagentStop)` case branch; all other cases (`PostToolUse`, `SessionStart`, `Stop`, etc.) have no sidecar reference | ✓ |
| B.C.4 — idempotency: re-running same payload twice does not double-write; "last match wins" via tail-based grep | `tail -1` after `grep` for dispatch_id | `component-telemetry.sh:187` — `grep "\"dispatch_id\":\"${subagent_agent_id}\"" "$sidecar_name" | tail -1` | ✓ |

---

## Part C Acceptance Gates

| Gate | Requirement | Evidence | Result |
|---|---|---|---|
| C.C.1 — test suite exit 0; all existing tests PASS; T-NA1 + T-NA2 PASS | `pnpm vitest run tests/hooks/component-telemetry.spec.ts` | Command run: 14/14 PASS (Cases 1-8 + T-NA1 + T-NA2 + C.C.5 + 3 INV-S9 latency tests) | PASS |
| C.C.2 — T-NA2 asserts `unknown_agent_fraction == 0` over 10-event SubagentStop fixture | 10 events all resolve to named agent type | `component-telemetry.spec.ts:480-484` — `unknownAgentFraction = unknownCount / agentRows.length; expect(unknownAgentFraction).toBe(0)` confirmed PASS | PASS |
| C.C.3 — `pnpm typecheck && pnpm lint` exit 0 | Both must exit 0 | typecheck: exit 0 (0 errors all packages); lint: exit 0 (0 errors; 4 pre-existing web-ui warnings not introduced by this task) | PASS |
| C.C.4 — no NEW `Anthropic\|claude.*sdk\|@anthropic` matches in `component-telemetry.sh` | Daemon-dumb invariant (I-1) | Grep on `component-telemetry.sh` returns no matches at all | PASS |
| C.C.5 — test verifies sidecar deletion/absence → `COMP_NAME` falls back to `unknown-agent`; no crash | Graceful degradation | `component-telemetry.spec.ts:491-520` — C.C.5 test case: sidecar file deliberately not created; asserts `event.component_name === 'unknown-agent'` and `exitCode === 0`; test PASSES | PASS |

---

## Scope Check

- `scripts/hooks/dispatch-jsonl-recorder.sh` — confirmed NOT modified by Task C. Its working-tree diff is attributable to Task B (Task B observation file `task-10.5.2.B-20260428-dispatch-sidecar.md` claims it explicitly).
- No other files outside `component-telemetry.sh` and `component-telemetry.spec.ts` were modified by Task C.

---

## Missing Requirements

None. All B.C.1–B.C.4 clauses and C.C.1–C.C.5 gates verified with code evidence.

---

## Over-Building

None detected. The implementation adds exactly what the spec requires:
- One new `AGENT_ID` extraction block (lines 115-124)
- Two new `classify_component()` parameters (`subagent_agent_id`, `subagent_session`) with sidecar logic (lines 139-204)
- Updated call site (line 426)
- Three new test cases (T-NA1, T-NA2, C.C.5)

No new public exports, no new config flags, no new abstractions beyond what Part B specifies.

---

## Required Fixes (blocking)

None.

---

## Next Action

PASS → dispatch code-quality-reviewer

---

```yaml
---
status: DONE
verdict: PASS
report_path: C:\htdocs\orch-starter\agent-workspace\memory\observations\task-10.5.2.C-20260428-spec-compliance.md
blocking_count: 0
concern_count: 0
nitpick_count: 0
next_action: invoke code-quality-reviewer
---
```
