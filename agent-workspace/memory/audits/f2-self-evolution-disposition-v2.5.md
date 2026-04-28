# F-2 Self-Evolution Signal-Extension — v2.5 Disposition

**Authored**: 2026-04-28
**Authored by**: task-implementer (sonnet/medium, ORCH_SPAWNED, Phase 10 substage 10.6)
**Status**: DEFER-V2.6

---

## §1 What is F-2?

F-2 (self-evolution signal-extension) is a planned extension to the rollup-telemetry
schema (`packages/core/src/telemetry/rollup-telemetry.ts` or equivalent) to track
signals specifically useful for the self-evolution loop (SC-39). The extension would
add fields capturing:

- Agent-type distribution across dispatch events (to measure unknown_agent_fraction
  improvement over time).
- Paired dispatch/completion correlation metrics (to surface pairing_rate trends).
- Loop-proposal acceptance rate (proposals generated vs. proposals accepted by
  a reviewer substage).

The purpose is to make the self-evolution feedback loop observable at the telemetry
layer — extending the rollup schema so that loop health metrics are first-class
citizens in the rollup output, not just in one-off audit scripts.

---

## §2 Gating Condition

F-2 is explicitly gated on SC-39 being enabled (ENABLE_RETRY verdict). The
substantive rationale is:

> F-2 tracks signals that are only meaningful when the self-evolution loop is
> running. Without a working SC-39 loop producing real proposals, the extended
> schema fields have no data to populate. Implementing schema extensions for a
> loop that is not yet enabled creates dead schema real-estate — exactly the
> speculative flexibility that P2 (Simplicity First) and YAGNI prohibit.
> The extension should land in the same version that enables the loop, so the
> schema and its data are co-present from day one.

This gating relationship is stated explicitly in:
- `phase-9-v2.4-carryforward-closure.md §9`: "F-2 self-evolution signal-extension
  if 9.5 SC-39 verdict = DEFER (the rollup-telemetry.ts schema extension is most
  useful when the loop is enabled; deferring the loop also defers signal-extension)."
- `phase-10-v2.5-carryforward-burndown.md §4` deferral list item 3: "F-2
  self-evolution signal-extension — if Decision 035 = DEFER-V2.6; mechanically
  gated on SC-39 enablement."
- `Decision 034 §Consequences item 4`: "F-2 self-evolution signal-extension also
  defers. Per master plan §9, F-2 is most useful when the loop is enabled;
  deferring SC-39 to v2.5+ automatically defers F-2 to the same horizon."
- `Decision 035 §8 item 4`: "F-2 self-evolution signal-extension defers to v2.6+
  alongside SC-39. Per master plan §9, F-2 is most useful when the loop is
  enabled; deferring SC-39 to v2.6+ automatically defers F-2 to the same horizon.
  No change from Decision 034."

---

## §3 Decision 035 Verdict (v2.5 Gate)

Decision 035 (2026-04-28, BINDING, authored at Phase 10 substage 10.5.3) sets the
SC-39 v2.5 verdict as **DEFER-V2.6**. The verdict is grounded in:

- 3 of 6 re-attempt prerequisites FAIL: pairing_rate = 0.000 (prereq 1), 
  unknown_agent_fraction = 1.000 (prereq 2), total_events = 8,031 < 10,000 (prereq 3).
- Root cause: `.claude/settings.json` read-once constraint means the 10.5.2.B seam
  fix is structurally correct (unit + integration tests pass) but not yet active in
  the production telemetry stream — the measurement window does not open until next
  session boot (Decision 035 §3.1).
- The engineering is done; only the measurement window and statistical floor remain
  (Decision 035 §3.4).

Per spec line 203 (Phase 10 plan §10.6): "if 10.5.3 = DEFER-V2.6, defer F-2 to
the same horizon."

---

## §4 F-2 Disposition: DEFER-V2.6

**Status**: DEFER-V2.6 (binding, gated by SC-39 v2.6 retry per Decision 035).

F-2 unblocks **if and only if** SC-39 unblocks. The prerequisites for F-2
enablement are identical to SC-39 re-attempt prerequisites (Decision 035 §5):

- **R-1**: Session restart after 10.5.2.B fix is on-disk (the PostToolUse hook
  for `Agent` calls must be in the live chain).
- **R-2**: Natural volume — ≥ 50 real Agent-tool DISPATCHED events + ≥ 1,969
  additional component-telemetry events (to cross 10,000 total).
- **R-3**: Re-measure — `unknown_agent_fraction < 0.30` AND `pairing_rate ≥ 0.40`
  on ≥ 50 pairs, both evidenced in v2.6 artifacts.
- **R-4**: A future binding decision (Decision 037 or later) explicitly cites
  R-1, R-2, R-3 as MET and authors ENABLE_RETRY.

**F-2 is NOT blocked by any engineering gap.** The schema extension can be authored
once R-4 fires. The v2.6 entry substage should include F-2 as a scheduled task
if Decision 035 R-1/R-2/R-3 all pass.

---

## §5 What is NOT done here (per spec)

Per Phase 10 plan §10.6 line 211: "OPTIONAL `session-plans/pending/f2-signal-extension-spec.md`
(if F-2 enabled by 10.5.3 verdict)." Since the verdict is DEFER-V2.6, the
f2-signal-extension-spec.md file is NOT scaffolded. No schema extension code is
written. No rollup-telemetry.ts modifications are made.

---

## §6 Re-eval Trigger

At v2.6 close, the sandwich-verifier or task-implementer responsible for the
SC-39 verdict decision (Decision 037 or equivalent) must check:

1. Does Decision 037 verdict = ENABLE_RETRY?
2. If YES: dispatch F-2 scaffolding task (rollup-telemetry.ts schema extension +
   f2-signal-extension-spec.md) immediately after SC-39 loop enablement lands.
3. If NO (another DEFER): carry F-2 forward to v2.7 with the same rationale.

---

## §7 Cross-References

- Decision 033 (SC-39 narrow gate; original F-2 gating rationale)
- Decision 034 (DEFER-V2.5; first explicit F-2 deferral statement in §Consequences item 4)
- Decision 035 (DEFER-V2.6; the binding v2.5 verdict that triggers this attestation)
- `agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md §9`
- `agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md §4`
- `agent-workspace/memory/phase-9-complete.md §2` (F-2 DEFER-V2.5 row)
- `agent-workspace/memory/phase-10-routing-brief.md §4` (F-2 deferral item 3)
