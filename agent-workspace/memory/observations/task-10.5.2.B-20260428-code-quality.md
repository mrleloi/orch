---
task: 10.5.2.B + B-fix (combined)
title: Code Quality Review — SC-39 dispatch sidecar seam fix
date: 2026-04-28
agent: code-quality-reviewer (sonnet, ORCH_SPAWNED, bg afc1a533874cc0890)
prerequisite: spec-compliance reviewer PASS (B-fix-spec F1-F7)
status: APPROVED_WITH_CONCERNS
---

# Task 10.5.2.B + B-fix — Code Quality Review

## Verdict
APPROVED_WITH_CONCERNS

## Files Reviewed
- `scripts/hooks/dispatch-jsonl-recorder.sh` (TOOL_NAME guard fix; case-γ two-key sidecar; PostToolUse handler; null-on-miss)
- `tests/hooks/dispatch-recorder.spec.ts` (H1-H6/T2/T4 `Task`→`Agent`; H8/H9/H10 added; comment "9→10 fields")
- `tests/integration/sc39-pairing-rate.spec.ts` (NEW — 50 synthetic pairs)
- `.claude/settings.json` (PostToolUse entry added)

## Invariant Grep
| Invariant | Result |
|---|---|
| I-1 no SDK imports | PASS — no Anthropic/SDK/openai references |
| I-2 no project-name hardcoding | PASS |
| I-3 no claude-agent-sdk/ClaudeSDKClient | PASS |
| I-5 no ~/.ccs/~/.claude/ access | PASS |
| I-14 no module-level let/var | PASS — all let usages inside test scopes |

## Test Quality
- H8: behavior-focused; sidecar + dispatch.jsonl assertions on parsed fields. PASS.
- H9: full PreToolUse→PostToolUse→SubagentStop chain; `dispatch_id` rewrite to `toolu_*` (B.B.4) verified; `agent_type` recovered from sidecar. PASS.
- H10: strict `toBeNull()` check on `tool_use_id` (stringified `"null"` would fail) — exactly the contract H10 must verify. PASS.
- Integration: REAL subprocess via spawnSync (not pure JS). Positive-only assertion (`pairing_rate >= 0.40`); no negative case (mismatched IDs to drive rate down). Test passed at 1.000 in implementer run. Moderate flake risk on slow CI/Windows due to 50 × 2 × 5s polling windows — acknowledged.
- `Task`→`Agent` migration: complete (grep returns zero stale `tool_name.*Task` refs).

## Decision 023 Schema Lock Preservation
Original 9 fields (`event`, `dispatch_id`, `agent_type`, `model`, `parent_session_id`, `bg`, `ts_ms`, `outcome`, `tokens_used`) all present byte-identical in DISPATCHED + COMPLETED rows. `tool_use_id` is the additive 10th. PASS.

## Layering
- Domain purity: N/A (bash + tests + config only).
- Script confinement: recorder logic fully contained in `dispatch-jsonl-recorder.sh`. No leak.
- PostToolUse ordering in settings.json: budget-watchdog → dispatch-recorder → component-telemetry. Correct (sidecar written before component-telemetry reads it).

## Findings

### Blocking
None.

### Important (log as v2.6 CFs)
1. **PostToolUse regex brittleness undocumented in code** — `dispatch-jsonl-recorder.sh:27-29`. Regex `/agentId:\s*([a-f0-9]{10,20})/i` depends on Claude Code internal Agent result-text format stability. Format change → silent degradation to unknown-agent (B.B.4 fallback preserves correctness; pairing_rate drops). The risk is acknowledged in B's observation file but NOT in the source code. Future maintainer has no warning. Add a one-line comment near line 29.
2. **`agent_type` vs `subagent_type` naming divergence undocumented** — `dispatch-jsonl-recorder.sh:55,74` uses `agent_type`; architect spec `10.5-sc39-structural-unblock-architect.md:56` uses `subagent_type`. Consistent across B + C (IMP-1 architect-deferred), but no code comment explains the divergence. Future maintainer reading both will be confused.

### Nitpicks
1. `TUI_JSON` variable name (`dispatch-jsonl-recorder.sh:102-106`) — opaque. `TOOL_USE_ID_JSON` would be clearer.
2. H8 uses `subagent_type='test-impl'` (not a canonical type). Test passes; cosmetic.

## Summary
| Category | Result |
|---|---|
| Invariants | ALL PASS |
| Decision 023 lock | PRESERVED |
| H10 strict null | PASS |
| Task→Agent migration | COMPLETE |
| Layering | PASS |
| Settings ordering | CORRECT |
| Integration mechanism | Real subprocess |
| Flake risk | Moderate on slow CI (acknowledged) |
| Scope creep | None |
