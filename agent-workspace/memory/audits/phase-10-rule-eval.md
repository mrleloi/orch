# Phase 10 — RULE Re-evaluation Against Accumulated Telemetry

> Generated: 2026-04-28T00:00:00Z by task-implementer (sonnet, ORCH_SPAWNED, task 10.5.3)
> Source: agent-workspace/memory/component-telemetry.jsonl (8031 valid events)
> Dispatch source: agent-workspace/memory/dispatch.jsonl (148 rows)
> Baseline: agent-workspace/memory/component-rollup-phase-9.md (6652 events at Phase 9 close)
> Compare to: agent-workspace/memory/audits/phase-9-verify.md (Phase 9 CLASS-A gate)

---

## Event Count Summary

| Metric | Phase 9 Baseline | Phase 10 Current | Delta |
|--------|-----------------|-----------------|-------|
| Total valid events | 6,652 | 8,031 | +1,379 (+20.7%) |
| Hook events | 6,486 | 7,830 | +1,344 (+20.7%) |
| Agent events | 165 | 200 | +35 (+21.2%) |
| Skill events | 1 | 1 | 0 |

---

## Hook Coverage by Component_name

| Hook Name | Phase 9 | Phase 10 | Delta |
|-----------|--------:|--------:|------:|
| Bash | 2,720 | 3,305 | +585 |
| Read | 2,048 | 2,404 | +356 |
| Edit | 502 | 594 | +92 |
| Glob | 311 | 390 | +79 |
| Grep | 294 | 418 | +124 |
| Write | 314 | 373 | +59 |
| Agent (hook) | 151 | 187 | +36 |
| TaskUpdate | 80 | 80 | 0 |
| TaskCreate | 40 | 40 | 0 |
| SessionStart | 14 | 16 | +2 |
| ToolSearch | 6 | 9 | +3 |
| WebFetch | 3 | 3 | 0 |
| TaskList | 2 | 4 | +2 |
| Skill | 1 | 1 | 0 |
| TaskStop | 0 | 1 | +1 |
| TaskOutput | 0 | 5 | +5 |

---

## Agent Dispatch Counts

| Metric | Phase 9 Baseline | Phase 10 Current | Delta |
|--------|-----------------|-----------------|-------|
| Total agent events (component_type=agent) | 165 | 200 | +35 |
| unknown-agent count | 165 | 200 | +35 |
| named-agent count | 0 | 0 | 0 |
| unknown_agent_fraction | 1.000 | 1.000 | 0.000 |

**Finding**: No change in named-agent fraction. Post-10.5.2 named-agent recovery via sidecar
was implemented for the T-NA2 fixture path (synthetic test) but does NOT surface in the
production telemetry stream. The `component-telemetry.jsonl` agent bucket remains 100%
`unknown-agent`. The C-seam fix (sidecar recovery) affects the dispatch hook's ability to
recover names for in-flight sessions; it does not retroactively relabel existing events nor
does it emit new named-agent rows into component-telemetry for historical sessions.

---

## Dispatch Pairing

| Metric | Phase 9 Baseline | Phase 10 Current | Delta |
|--------|-----------------|-----------------|-------|
| Total dispatch.jsonl rows | 99 | 148 | +49 |
| DISPATCHED rows | 1 | 12 | +11 |
| COMPLETED rows | 98 | 136 | +38 |
| Paired (matching dispatch_id) | 0 | 0 | 0 |
| Pairing rate | 0.000 | 0.000 | 0.000 |

**Finding**: 12 DISPATCHED rows now exist (up from 1 in Phase 9). However, pairing_rate
remains 0.000 because DISPATCHED events use `toolu_*` / UUID IDs while COMPLETED events
use hex IDs from a different ID space. The structural CF-21 seam gap remains unfixed.

---

## RULE Classification (R1–R4)

Applying the same RULE-style logic as Phase 9 rollup:

| Rule | Definition | Phase 9 Verdict | Phase 10 Verdict | Change |
|------|-----------|----------------|----------------|--------|
| R1 | Any hook fires (PostToolUse coverage > 0) | FIRES | FIRES | stable |
| R2 | Any non-hook component_type present | FIRES (agent=165) | FIRES (agent=200) | stable |
| R3 | unknown_agent_fraction < 0.30 required for SC-39 | NO-FIRE (1.000 >> 0.30) | NO-FIRE (1.000 >> 0.30) | no improvement |
| R4 | pairing_rate >= 0.40 required for SC-39 | NO-FIRE (0.000) | NO-FIRE (0.000) | no improvement |

**Phase 10 RULE verdict**: R1=FIRES, R2=FIRES, R3=NO-FIRE, R4=NO-FIRE.
Identical to Phase 9 RULE verdict. No calibration changes needed.

---

## SC-39 Prerequisite Gate Status

| Gate | Phase 9 Verdict | Phase 10 Verdict |
|------|----------------|----------------|
| unknown_agent_fraction < 0.30 | FAIL (1.000) | FAIL (1.000) |
| pairing_rate >= 0.40 over >=50 pairs | FAIL (0.000, 0 pairs) | FAIL (0.000, 0 pairs) |
| total_events >= 10,000 | FAIL (6,561) | FAIL (8,031) — still 1,969 short |

**Phase 10 delta**: Event volume grew by +1,379 events (+20.7%) but the two structural gates
(unknown_agent_fraction and pairing_rate) are unchanged. The CF-21 seam fix remains the
critical prerequisite before any SC-39 re-attempt can succeed.
