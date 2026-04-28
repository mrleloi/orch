# Phase 8 RULE Re-evaluation — CF-34

> Generated 2026-04-27 by task-implementer (sonnet/medium, ORCH_SPAWNED).
> Source: agent-workspace/memory/component-telemetry.jsonl (6561 valid events, 6558 by wc).
> Rollup used: agent-workspace/memory/component-rollup-phase-9.md (generated 2026-04-27T16:23:56.499Z).
> Rules from: .claude/agents/telemetry-analyst.md §Phase 3.
> Prior attestation: Phase 6.2.7 verifier (found RULE-1 fire only; R2/R3/R4 zero-trigger on 2590 events).

## Rollup Data (Phase 9 — post-Phase-8 component-telemetry.jsonl)

| Type | Name | Count | Success Rate | p99 Dur (ms) | p99 Tokens | Top Failure Modes |
|------|------|------:|-------------:|-------------:|-----------:|-------------------|
| hook | Bash | 2678 | 1.000 | 154152 | 6204 | A:13 |
| hook | Read | 2027 | 1.000 | 17909 | 8842 | A:5 |
| hook | Edit | 502 | 1.000 | 48894 | 10587 | A:8 |
| hook | Write | 305 | 1.000 | 447617 | 14548 | A:2 |
| hook | Glob | 304 | 1.000 | 8992 | 5098 | |
| hook | Grep | 287 | 1.000 | 16989 | 6418 | |
| agent | unknown-agent | 162 | 1.000 | 193909 | 4115 | A:1 |
| hook | Agent | 149 | 1.000 | 233701 | 22994 | |
| hook | TaskUpdate | 80 | 1.000 | 27943 | 11251 | |
| hook | TaskCreate | 40 | 1.000 | 11984 | 4996 | |
| hook | SessionStart | 14 | 1.000 | 632 | 5225 | |
| hook | ToolSearch | 6 | 1.000 | 18850 | 3573 | |
| hook | WebFetch | 3 | 1.000 | 8423 | 0 | |
| hook | TaskList | 2 | 1.000 | 3445 | 1382 | |
| skill | research-first | 1 | 1.000 | 0 | 0 | |
| hook | Skill | 1 | 1.000 | 3901318 | 1647 | |

## RULE-1 — Model Bump (latency): p99_duration_ms > 60000 AND component routing = sonnet

**Threshold**: p99_duration_ms > 60,000

Candidates:
- `agent::unknown-agent` — p99=193,909ms. Component type=agent, name=unknown-agent. Unknown-agent is not explicitly routed in master-planner.md (it's a sentinel); however, as the only agent row in the rollup, it would default to sonnet tier. **FIRES.**
  - Phase 6.2.7 found p99=190,702ms on 75 events. Now 193,909ms on 162 events — value has slightly increased; condition persists.
  - Threshold tuning recommendation: current 60s threshold is appropriate; the unknown-agent p99 reflects full subagent session wall-time, not tool latency. Consider documenting this semantic gap: agent p99 measures session duration (correct behavior), not a pathology.

No other agent-type rows exist in the rollup. Hook rows are excluded from RULE-1 scope (routing model applies to agent components, not hooks).

**RULE-1 verdict: FIRES on `agent::unknown-agent` (p99=193,909ms > 60,000ms threshold).**

## RULE-2 — Agent Prune (low success): count >= 5 AND success_rate < 0.6

Candidates scanned: only `agent::unknown-agent` (count=162, success_rate=1.000).

1.000 is not < 0.6. No row triggers RULE-2.

**RULE-2 verdict: NO-FIRE. Zero triggers across all 16 rollup rows.**

## RULE-3 — Parallelization Gate Adjustment (failure mode C): count >= 3 AND top_failure_mode = C

All failure modes in the Phase 9 rollup: Bash=A:13, Read=A:5, Edit=A:8, Write=A:2, unknown-agent=A:1. No C failure mode appears in any row's top_failure_modes.

Per the previous Phase 6 attestation, Phase 6.2.7 also found zero RULE-3 triggers. This remains consistent.

**RULE-3 verdict: NO-FIRE. No component has top failure mode C with count >= 3.**

## RULE-4 — Model Bump (token budget): component_type == "agent" AND p99_tokens_real > 100,000

Only agent row: `agent::unknown-agent` — p99_tokens_real=4,115. 4,115 is not > 100,000.

**RULE-4 verdict: NO-FIRE. agent::unknown-agent p99_tokens_real=4,115 is well below 100K threshold.**

## Summary

| RULE | Phase 6.2.7 result | Phase 9 result (this eval) | Change |
|------|--------------------|---------------------------|--------|
| R1 | FIRES (unknown-agent p99=190,702ms) | FIRES (unknown-agent p99=193,909ms) | Stable — value +1.7% |
| R2 | NO-FIRE | NO-FIRE | Unchanged |
| R3 | NO-FIRE | NO-FIRE | Unchanged |
| R4 | NO-FIRE | NO-FIRE | Unchanged |

## Threshold Tuning Recommendations

- **RULE-1 threshold (60s)**: appropriate for tool-level hooks. For agent-type rows, p99 measures
  full session wall-time which is legitimately high for multi-step subagents. Consider adding an
  agent-specific exemption note in telemetry-analyst.md (no change to threshold value; only
  semantic documentation). No immediate tuning needed.
- **RULE-2 threshold (count >= 5, success_rate < 0.6)**: not triggered; calibration not needed.
- **RULE-3 (top_failure_mode = C)**: no C-mode failures have materialized across 6,561 events.
  The threshold is well-calibrated.
- **RULE-4 threshold (100K tokens)**: unknown-agent p99=4,115 tokens. The token reading may be
  incomplete (tokens_used often null in dispatch.jsonl). If token recording is improved in v2.4,
  re-run this rule. No tuning needed based on current data.

## Gate verdict for SC-39 artifact 1

- All 4 rules evaluated against post-Phase-8 component-telemetry.jsonl (6,561 events).
- Result: R1 fires (stable from Phase 6.2.7), R2/R3/R4 zero-trigger (stable).
- No new RULE fires discovered. No threshold tuning required.
- **CF-34 CLOSED.**
