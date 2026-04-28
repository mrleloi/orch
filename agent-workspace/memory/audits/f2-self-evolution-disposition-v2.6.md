# F-2 Self-Evolution Signal-Extension — v2.6 Disposition

**Authored**: 2026-04-28
**Authored by**: orchestrator (Session #47, Phase 11 substage 11.6, absorbed inline; ~50 LOC re-defer note vs full subagent dispatch — Karpathy P2 + /effort discipline)
**Status**: **DEFER-V2.7**
**Predecessor**: `f2-self-evolution-disposition-v2.5.md` (DEFER-V2.6)
**Binding decision**: Decision 037 (`decisions/037-sc39-retry-verdict-v2.6.md`) — SC-39 verdict = DEFER-V2.7

---

## §1 Substage 11.6 framing

Master plan `phase-11-v2.6-carryforward-burndown.md §11.6` declares:

> If 11.5.3 verdict = ENABLE_RETRY, scaffold F-2: extend
> `packages/core/src/telemetry/rollup-telemetry.ts` … If 11.5.3 verdict = DEFER-V2.7,
> re-defer F-2 to v2.7 with explicit gate.

Decision 037 (BINDING, 2026-04-28, 11.5.3) verdict = **DEFER-V2.7** under R-1 FAIL
(agentId-extraction regex `dispatch-jsonl-recorder.sh:33` empirically falsified across
21+ real Agent dispatches; pairing_rate = 0.000 on all production telemetry; root cause
is upstream Claude Code Agent tool result text format, not solvable from codebase
alone).

Therefore 11.6 is a **no-op disposition**: re-defer F-2 to v2.7 and lock the gate to
the SC-39 W-1/W-2/W-3 framework defined in Decision 037 §5.

---

## §2 Re-defer rationale (charter-grounded)

- **P2 Simplicity / YAGNI**: F-2 schema extension would add agent-type distribution,
  pairing-rate, and loop-proposal acceptance fields. Under DEFER-V2.7, no
  self-evolution loop is producing real proposals; the fields would be dead schema
  real-estate. Land schema and data co-present.
- **P1 Think before coding**: extending rollup-telemetry under a known-broken
  extraction path means the extended schema would record `unknown-agent` for every
  agent_type and `null` for every pairing — confirming Decision 037 §2.1 R-1 FAIL
  numbers, not adding signal.
- **Decision 035 §"Deliberation E" inheritance**: structural-defer is the precedent
  shape. F-2 follows the same shape for the same reason (gate on SC-39 enablement).

---

## §3 Re-attempt prerequisites for v2.7 (Phase 12 entry)

F-2 re-opens to FIX_INLINE disposition only if **ALL** of the following hold at
Phase 12 entry:

- **F-2-R1** (SC-39 enabled): Decision 037 successor (Decision 0XX in v2.7) = ENABLE_RETRY
  OR a v2.7-equivalent verdict that establishes a working self-evolution loop.
  Mechanical signal: `dispatch.jsonl` shows ≥ 1 COMPLETED row with toolu_*
  `dispatch_id` (V1a in Decision 037 §5).
- **F-2-R2** (real proposal volume): self-evolution loop has produced ≥ 5 real
  proposals across ≥ 1 phase, with proposal acceptance/rejection metadata captured
  in component-telemetry.
- **F-2-R3** (rollup spec authored): `specs/tier1-strategic/f2-self-evolution-signal-extension.md`
  exists with explicit field-list + acceptance criteria authored at v2.7
  substage start.

If **any** of F-2-R1..F-2-R3 fails at Phase 12 entry, this disposition self-extends
to **DEFER-V2.8** by the same rationale shape (Decision 033 Deliberation E pattern;
multi-cycle structural defer is contemplated and admissible).

---

## §4 What does NOT change in v2.6

- `packages/core/src/telemetry/rollup-telemetry.ts` (or wherever the rollup schema
  lives) is **untouched** in v2.6. No field additions, no schema migration, no
  speculative extension scaffolding.
- No new spec authored in `specs/tier1-strategic/f2-self-evolution-signal-extension.md`.
  The spec lands at v2.7 substage start IFF F-2-R1..F-2-R3 hold.
- No tests are added for F-2 fields. Test surface lands with the schema.

This zero-LOC stance is a deliberate choice: it preserves the v2.6 burndown's
P3 (surgical) discipline and prevents accidental coupling between F-2 schema design
and a still-broken SC-39 loop.

---

## §5 Charter cross-check

| Principle | Holds? | How |
|---|---|---|
| P1 (think before coding) | ✅ | Defer is the explicit no-coding path; Decision 037 R-1 FAIL surfaced first |
| P2 (simplicity / YAGNI) | ✅ | Zero LOC delta; no speculative schema |
| P3 (surgical) | ✅ | Disposition note only; no production touch |
| P4 (goal-driven) | ✅ | Re-attempt gate F-2-R1..F-2-R3 is concrete + verifiable |
| I-1..I-15 | ✅ | No invariant touched; F-2 disposition is design-layer |
| Decision 027 §C-8 (scaffold-now-execute-later) | ✅ | Inverse direction: "no scaffold while loop is broken" |

---

## §6 Linkage

- Predecessor disposition: `f2-self-evolution-disposition-v2.5.md` (DEFER-V2.6)
- Binding gate: `decisions/037-sc39-retry-verdict-v2.6.md` (DEFER-V2.7)
- Master plan §11.6: `session-plans/pending/phase-11-v2.6-carryforward-burndown.md`
- Decision 035: `decisions/035-sc39-defer-v2.6-verdict.md` (predecessor SC-39 verdict)
- Decision 033 Deliberation E: structural-defer precedent shape

---

## §7 11.6 substage acceptance

- F-2 disposition recorded ✅ (this file)
- Re-defer gate explicit ✅ (§3 F-2-R1..F-2-R3 above)
- No production-code touch ✅ (§4 zero-LOC stance)
- Charter cross-check passes ✅ (§5)

**11.6 substage CLOSED — F-2 deferred to v2.7 under SC-39 gate.**
