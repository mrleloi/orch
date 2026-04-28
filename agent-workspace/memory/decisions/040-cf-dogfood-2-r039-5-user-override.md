---
title: Decision 040 — CF-DOGFOOD-2 R-039.5 User Override + Priority Inversion
status: BINDING
authored_date: 2026-04-28
authored_by: orchestrator (Session #47, autonomous, ORCH_SPAWNED)
supersedes: Decision 039 §"Re-attempt Prerequisites" priority ordering only (Decision 039's structural framework remains intact)
supersession_target: superseded only by future user override or Phase 12 retry verdict
phase: 12 (v2.7 entry)
---

# Decision 040 — CF-DOGFOOD-2 R-039.5 User Override + Priority Inversion

## §1 Context

Decision 039 (BINDING, 2026-04-28, Phase 11 substage 11.3) deferred CF-DOGFOOD-2 to v2.7 with prerequisites R-039.1..R-039.5. R-039.5 is defined as:

> Operator override — explicit user prompt requesting CF-DOGFOOD-2 closure at v2.7 entry.

User intent for CF-DOGFOOD-2 closure was already explicit at Phase 8 entry via `tasks/feat_04_continue_before_phase_8/user_prompt.txt` mục 1.5:

> "phase 8 và các phase tiếp theo nên thực sự được tiếp cận bằng cách dùng chính dự án này, một công cụ hỗ trợ code, để tự code và theo dõi quá trình, tự nâng cấp chính nó, với goals và objective do human đề ra."

User reaffirmed at v2.7 entry (Session #47, 2026-04-28):

> "việc yêu cầu từ đầu phase 8 đến giờ, là 3 phase, mà bạn vẫn chưa nhận thức được yêu cầu 'tự sử dụng orch' là quan trọng. tại sao lại như vậy? mục 1.5 và 1.6 trong [user_prompt.txt] là những yêu cầu 'quan trọng'."

The user_prompt.txt was the operator-override trigger at Phase 8 entry; the v2.7 reaffirmation is the explicit re-grant. **R-039.5 is satisfied retroactively for Phases 8-11 and prospectively for Phase 12.**

## §2 Decision

**R-039.5 INVOKED**. CF-DOGFOOD-2 is **NOT DEFERRED** to v2.8. CF-DOGFOOD-2 closure becomes Phase 12 / v2.7 PRIORITY 1.

Decision 039's other prerequisites (R-039.1..R-039.4) remain documented but are **not gating** in v2.7. A user override is sufficient per Decision 039 §4.3 R-039.5 wording.

## §3 Priority Inversion (load-bearing change)

Phase 11 master plan §11.5 + Decision 037 framed SC-39 W-1 (agentId regex fix) as the v2.7 priority, with CF-DOGFOOD-2 implicitly gated on R-039.1 (= Decision 037 ENABLE_RETRY successor verdict). **This priority ordering is reversed by this decision.**

**Architectural reason for reversal**: SC-39 W-1 and CF-DOGFOOD-2 are **independent concerns** that the prior defer logic conflated:

- **SC-39 W-1**: regex `dispatch-jsonl-recorder.sh:33` extracting `agentId` from `tool_response.content[0].text`. Affects **telemetry quality** (the `agent_type` field correlation between DISPATCHED ↔ COMPLETED rows in `dispatch.jsonl`). Decision 037 R-1 FAIL means pairing_rate = 0.000 in current telemetry.
- **CF-DOGFOOD-2**: `scripts/dogfood/run-self-task.ts:387` step-9 stub (`dispatch_deferred_to: '8.5.3'`). Affects **runtime dispatch** (whether `IAgentRuntime.spawn()` is called to spawn a `claude --rc` subprocess at all).

These are decoupled:

| Concern | What's broken | Affects |
|---|---|---|
| SC-39 W-1 | telemetry correlation (regex extracts wrong/empty value) | post-hoc analysis quality |
| CF-DOGFOOD-2 | dispatch never fires | runtime behavior |

CF-DOGFOOD-2 fix does NOT require SC-39 W-1 to be fixed first. Wiring step 9 produces real `claude --rc` subprocess spawns; the resulting telemetry rows will have `unknown-agent` in `agent_type` until W-1 lands, but the **DISPATCH ITSELF works**. Telemetry quality is a downstream concern.

**Therefore Phase 12 priority order is**:

1. **CF-DOGFOOD-2 fix** (wire step 9) — USER-CRITICAL per user_prompt.txt mục 1.5. Highest priority.
2. **Self-applied Phase 12 substages** — once step 9 wired, Phase 12 substages 12.X+ MUST dispatch through Orch dogfood harness (proof-of-concept "Orch tự code Orch"). USER-CRITICAL per user_prompt.txt mục 1.5.
3. **SC-39 W-1 empirical discovery + fix** — telemetry quality. Important, not USER-CRITICAL. Can run parallel-after step 9 wires (W-1 discovery is easier with real dispatches happening).
4. **Multi-user/multi-project namespace** — USER-CRITICAL per user_prompt.txt mục 1.6. Per-user `.orch/` separation, private vs shared profile split, sync stub.
5. **Community sharing prep** — USER-CRITICAL per user_prompt.txt mục 1.7. Telemetry sync schema, privacy/consent flow, "domain workflow autonomous knowledge" framing in docs.
6. **SC-39 W-2 (volume) + W-3 (re-measure)** — passive accumulation gate. Becomes useful once W-1 lands.
7. **F-2 self-evolution signal-extension** — gated on SC-39 ENABLE_RETRY (unchanged from Decision 037 §11).
8. **Housekeeping carryforwards** — settings-version-check.sh quality fixes, cosmetic minor from 11.7 verifier.

## §4 Reasoning Why This Was Missed for 4 Cycles

This decision documents the structural drift mechanism for charter audit purposes:

1. **User intent encoded as carryforward at Phase 8**: User_prompt.txt mục 1.5 was translated to spec `self-application-bootstrap.md` (8.5.1) + CF-DOGFOOD-2 (8.5.4 adversarial review). Once CF, treated as CF.
2. **CF-handling rules silently overrode user-intent rules**: Decision 033 "Deliberation E" pattern (multi-cycle structural-defer is admissible) became the dispatch path. Each phase inherited the prior defer rationale.
3. **Master-planner never re-read `user_prompt.txt`**: Master-planner reads charter, decisions, carryforwards-vN.md. Did not re-read `tasks/*/user_prompt.txt`. User intent was "frozen at Phase 8 architect output" and never re-checked.
4. **R-039.5 (operator override) added as Phase 11 §11.3 prerequisite but never proactively invoked**: Decision 039 codified the override mechanism but the orchestrator never surfaced it at Phase 11 entry. The original user_prompt.txt was already a valid trigger; orchestrator failed to recognize.

This is a procedural-gate failure, not an engineering failure. Fix at constitution layer (next section).

## §5 Mandated Constitution Update

Author `agent-workspace/constitution/user-intent-coherence.md` with:

- **Section A**: Inventory of user_prompt.txt files with priority tags. Each item flagged USER-CRITICAL / USER-IMPORTANT / USER-OPTIONAL based on user wording (e.g., "quan trọng" → USER-CRITICAL).
- **Section B**: Phase-entry checklist — master-planner MUST attest each USER-CRITICAL item is being addressed by a specific substage of THIS phase, OR an explicit user-override decision is in place to defer.
- **Section C**: Severity tier: `USER-CRITICAL` > `important` > `nitpick` in CF severity ladder. USER-CRITICAL CFs cannot defer without explicit user-override decision in same cycle.
- **Section D**: Anti-patterns (4-cycle defer of CF-DOGFOOD-2 catalogued as anti-pattern).

Hook: `scripts/audit/user-intent-coherence-check.sh` — runs in `post-phase.sh` — FAIL if any USER-CRITICAL item carried > 1 cycle without explicit user-override decision in current cycle.

## §6 Acceptance Gate for Decision 040 Closure

This decision CLOSES when ALL of:

- (G1) `agent-workspace/constitution/user-intent-coherence.md` authored ≥ 200 LOC.
- (G2) `scripts/audit/user-intent-coherence-check.sh` authored + wired into `scripts/verify/post-phase.sh`.
- (G3) `scripts/dogfood/run-self-task.ts:387` step-9 stub replaced with real `IAgentRuntime.spawn()` call (Option D from Phase 10 §3.4 OR Option B-minimal from §3.2).
- (G4) ≥ 1 Phase 12 substage dispatched through Orch dogfood harness (`run-self-task.ts` end-to-end), producing ≥ 1 real `agent-workspace/traces/dogfood-*.jsonl` file with non-stub trace entries.
- (G5) `phase-12-complete.md` attests CF-DOGFOOD-2 CLOSED.

## §7 Charter-Coherence

| Principle | Holds? | How |
|---|---|---|
| P1 (think before coding) | ✅ | This decision is the "think" step; identifies that 4-cycle defer was procedural error, not engineering reality |
| P2 (simplicity) | ✅ | Reverses an over-complex defer dependency tree (SC-39 W-1 → CF-DOGFOOD-2) into independent concerns |
| P3 (surgical) | ✅ | Targets specific procedural gap (master-planner blind to user_prompt.txt); fix is one constitution doc + one audit script |
| P4 (goal-driven) | ✅ | G1-G5 acceptance gates are concrete and verifiable |
| Decision 027 (strategic redirect) | ✅ | Self-application was Phase 8 redirect priority; this decision restores that priority |
| Decision 032 (effort routing) | ✅ | CF-DOGFOOD-2 fix substage = sonnet/medium (D2 default) |
| Decision 037 (SC-39 DEFER-V2.7) | ✅ | Decoupled from CF-DOGFOOD-2; SC-39 verdict unchanged |
| Decision 039 (CF-DOGFOOD-2 DEFER-V2.7) | ⚠️ | §"Re-attempt Prerequisites" priority ordering REVERSED via R-039.5; structural framework retained |

## §8 Linkage

- Trigger: `tasks/feat_04_continue_before_phase_8/user_prompt.txt` mục 1.5 + 1.6 + 1.7
- Predecessor: Decision 039 (CF-DOGFOOD-2 DEFER-V2.7)
- Adjacent: Decision 037 (SC-39 DEFER-V2.7) — independent concern, unchanged
- Successor: Phase 12 master plan must encode this priority ordering

## §9 Next Action

Phase 12 / v2.7 master plan must encode:

1. Substage 12.0 routing brief — manual orchestrator-driven (last manual phase entry)
2. Substage 12.1 — wire step 9 in `run-self-task.ts`; G3 acceptance
3. Substage 12.2 — author `user-intent-coherence.md` + `user-intent-coherence-check.sh`; G1+G2 acceptance
4. Substage 12.3+ — Phase 12 dispatch substages routed through Orch dogfood harness; G4 acceptance
5. Substage 12.4 — SC-39 W-1 empirical discovery (now feasible since real dispatches are happening)
6. Substage 12.5 — Multi-user/multi-project namespace work (mục 1.6)
7. Substage 12.6 — Community sharing prep (mục 1.7)
8. Substage 12.7 — Phase-close + v2.7 commit; G5 acceptance

Master plan re-dispatch immediately after this decision is authored.
