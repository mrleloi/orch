---
attestation_id: f-2-self-evolution-defer-v2.6
feature: F-2 (self-evolution signal extension — rollup-telemetry.ts schema extension)
disposition: DEFER-V2.6
date: 2026-04-28
authored_by: task-implementer (sonnet/medium, ORCH_SPAWNED, substage 10.6)
gates_decision: 035 (SC-39 Retry Verdict v2.5 — DEFER-V2.6 BINDING)
---

# F-2 Self-Evolution Signal Extension — DEFER-V2.6 Attestation

## §1 What F-2 Is

F-2 refers to the self-evolution signal-extension feature: extending the
`rollup-telemetry.ts` schema to capture richer per-component performance
signals (latency, retry counts, token consumption by component_name) that
the SC-39 self-evolution loop can use to generate more targeted
skill-improvement proposals.

The F-2 schema extension would have been most valuable with the SC-39 loop
actively enabled, because the loop's RULE-1..RULE-4 heuristics would
immediately consume the richer signal. Without an enabled loop, extending the
schema adds maintenance overhead without delivering the proposal-generation
benefit.

## §2 Gating Logic

F-2 is gated on SC-39 enablement:

```
F-2 = DEFER-V2.6  iff  SC-39 verdict = DEFER-V2.6
```

This dependency was first established in Phase 9 planning (Decision 034
§"Consequences" item 4):

> "F-2 self-evolution signal-extension also defers. Per master plan §9, F-2
> is most useful when the loop is enabled; deferring SC-39 to v2.5+
> automatically defers F-2 to the same horizon."

The same consequence was carried forward into Decision 035 §8 item 4:

> "F-2 self-evolution signal-extension defers to v2.6+ alongside SC-39.
> Per master plan §9, F-2 is most useful when the loop is enabled;
> deferring SC-39 to v2.6+ automatically defers F-2 to the same horizon.
> No change from Decision 034."

## §3 Decision 035 Verdict (Binding)

Decision 035 (`agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md`)
is BINDING with verdict **DEFER-V2.6**, authored 2026-04-28 by opus 4.7 main
session (substage 10.5.3).

**Evidence of DEFER-V2.6 verdict** (from Decision 035 §4):

> "**Verdict: DEFER-V2.6** (binding). … Three of six prereqs FAIL. …
> DEFER_AGAIN within v2.5 cannot succeed. … The engineering is done; only
> measurement remains."

The three failing prerequisites that block ENABLE_RETRY (and thus F-2):

| Prereq | Threshold | Phase 10 Measurement | Verdict |
|---|---|---|---|
| CF-21 pairing_rate | ≥ 0.40 on ≥50 pairs | 0.000; 12 dispatched (INSUFFICIENT_VOLUME) | FAIL |
| unknown_agent_fraction | < 0.30 | 1.000 (200/200 rows) | FAIL |
| total_events | ≥ 10,000 | 8,031 (gap: 1,969) | FAIL |

Root cause (Decision 035 §3.1): the harness reads `.claude/settings.json` ONCE
at session start; the 10.5.2.B wiring fix is on-disk but inert in this session.
The measurement window opens at next session boot. Structural measurement issue,
not an engineering gap.

## §4 F-2 Disposition

**F-2 is DEFERRED to v2.6+** (binding, per Decision 035).

### What is NOT built in v2.5:

- `rollup-telemetry.ts` schema extension (F-2 extension fields)
- Additional component-level aggregation columns
- RULE updates that would consume the extended schema

### What IS already built (F-2 infrastructure, carried from earlier phases):

- `scripts/utilities/rollup-telemetry.ts` — the base rollup script (Phase 6.2,
  substage 6.2.4) is on disk and functional; it produces the current
  `component-telemetry.jsonl` aggregate.
- Citation-linter rollup mode (Phase 10 §10.2) is GREEN — prerequisite 4 of
  Decision 034 is PASS. The toolchain is ready to consume F-2 proposals
  once SC-39 is enabled.

The existing infrastructure is sufficient. F-2 extension is additive work that
can be deferred without breaking anything in v2.5.

## §5 Re-enablement Conditions (v2.6)

F-2 may be re-considered in v2.6 ONLY IF Decision 035 §5 prerequisites
R-1, R-2, R-3, R-4 are ALL MET, and the v2.6 SC-39 verdict is ENABLE_RETRY.

If the v2.6 SC-39 verdict is DEFER-V2.7 (or another deferral), F-2 follows
to the same horizon without a separate attestation — Decision 034 §consequence-4
and Decision 035 §8-4 establish this automatic coupling.

A future substage authoring F-2 enablement MUST cite:
- The v2.6 SC-39 ENABLE_RETRY decision (expected: Decision 037 or later)
- This attestation as the F-2 DEFER-V2.6 baseline
- Specific schema extension fields proposed for rollup-telemetry.ts

## §6 Master Plan Reference

Phase 10 master plan
`agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md`
§10.6 (line 219):

> "acceptance_gate: decisions/README.md no longer has phantom citations;
> F-2 disposition recorded (DEFER-V2.6 attestation)."

This file is the F-2 disposition record that satisfies that acceptance gate.

## §7 Cross-References

- Decision 034 (`034-sc39-retry-or-defer-v2.4.md`) §"Consequences" item 4
  — first establishment of F-2/SC-39 coupling (DEFER-V2.5 horizon)
- Decision 035 (`035-sc39-retry-verdict-v2.5.md`) §4 Verdict + §8 item 4
  — DEFER-V2.6 verdict and F-2 consequence (binding)
- `agent-workspace/memory/decisions/README.md` — index now includes 032 and 033
  (phantom citations resolved in substage 10.6)
- `agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md`
  §10.6 line 219 (acceptance gate this file satisfies)
- Phase 9 routing brief §4 item 6 — first F-2 deferral candidate listing

**END F-2 attestation.**
