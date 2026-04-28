# Phase 12 / v2.7 — Active Routing Pointer

> Companion to `agent-workspace/memory/current-execution.md`. The
> `current-execution.md` file is large historic record (>26K tokens) and
> cannot be safely rewritten by autonomous master-planner sessions in a
> single turn. This file holds the active Phase 12 routing pointers for
> the orchestrator to consume at session start.
>
> **Authority**: master-planner dispatch 2026-04-28 substage 12.0.

---

## Active Phase

- **active_phase**: Phase 12 / v2.7 (ENTRY)
- **last_updated**: 2026-04-28 substage 12.0 (master-planner dispatch)
- **prior_phase**: 11 (v2.6 closed; commit 230929e + tag v2.6 LIVE)

## Master Plan

- **path**: `agent-workspace/session-plans/pending/phase-12-v2.7-self-application-priority.md`
- **LOC**: ≥ 600 (≥ §0..§13 sections; 11 substages 12.0..12.10)
- **theme**: USER-CRITICAL self-application priority (Decision 040 §3 priority order)

## Routing Brief

- **path**: `agent-workspace/memory/phase-12-routing-brief.md`
- **LOC**: ~280
- **§6 User-Intent Coherence**: 3 USER-CRITICAL items (1.5/1.6/1.7) with substage mapping per `user-intent-coherence.md` §D.4

## Authority Chain

- `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (USER-CRITICAL inventory)
- `agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md` (BINDING priority inversion)
- `agent-workspace/constitution/user-intent-coherence.md` (BINDING phase-entry checklist)
- `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md` (W-framework)
- `agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md` (framework retained, priority superseded)
- `agent-workspace/constitution/cf-dogfood-2-assessment.md` (§3.4 Option D + §3.2 Option B-minimal)

## Carryforwards Source

- `agent-workspace/memory/carryforwards-v2.7.md` (working list of 7 items)
- Phase 11 close: `agent-workspace/memory/phase-11-complete.md` §7

## Next Action (orchestrator's main session)

1. Read this file
2. Read `phase-12-v2.7-self-application-priority.md` (master plan)
3. Read `phase-12-routing-brief.md` (operational dispatch envelopes)
4. Dispatch **12.1 sandwich-architect** (opus/medium, bg) for CF-DOGFOOD-2
   step-9 wiring decision — input: `cf-dogfood-2-assessment.md` §3.4 + §3.2;
   output: `agent-workspace/session-plans/pending/12.1-cf-dogfood-2-wire-step9-architect.md`
5. Optionally parallelize with **12.2 task-implementer** (sonnet/medium, bg)
   for `user-intent-coherence-check.sh` + `post-phase.sh` A.9 wire (file-edit
   disjoint with 12.1 per master plan §4 collision matrix)

## Hard Rules

- I-6 ABSOLUTE: zero git commits across 12.0-12.9; bundled commit at 12.10 sandwich-verifier APPROVED
- All subagent dispatches `run_in_background: true`
- Decision 040 §3 priority order BINDING — CF-DOGFOOD-2 is priority 1, NOT SC-39 W-1
- USER-CRITICAL items 1.5/1.6/1.7 cannot defer absent same-phase user-override decision
- Self-application MANDATORY from 12.3 onward (real Orch dogfood dispatches)
- SC-39 W-1 (12.4) and CF-DOGFOOD-2 (12.1) are independent concerns per Decision 040 §3

## Recommended `current-execution.md` Edit (manual, by orchestrator's main session)

Insert the following block immediately after the existing `### Phase 11 Final State (2026-04-28)` block:

```markdown
### Phase 12 Active State (2026-04-28 substage 12.0)

- **Master plan**: `agent-workspace/session-plans/pending/phase-12-v2.7-self-application-priority.md` (≥600 LOC; 11 substages 12.0–12.10)
- **Routing brief**: `agent-workspace/memory/phase-12-routing-brief.md` (with §"User-Intent Coherence" attestation per user-intent-coherence.md §D.4)
- **Authority**: Decision 040 BINDING (R-039.5 user override; CF-DOGFOOD-2 = priority 1)
- **USER-CRITICAL items addressed**: 1.5 (12.1+12.3) / 1.6 (12.5) / 1.7 (12.6) per user_prompt.txt
- **Decisions to author**: 041 (12.3 closure attestation) / 042 (12.4 SC-39 W-verdict) / 043 (12.8 F-2 disposition)
- **Budget estimate**: 870K mid / 880K ceiling
- **Next dispatch**: 12.1 sandwich-architect (opus/medium, bg) for CF-DOGFOOD-2 step-9 wiring
```

This edit is non-blocking — the master plan + routing brief on disk are the
authoritative routing surface; this `phase-12-active.md` file is the read-first
pointer until `current-execution.md` head is updated.

---

_Authored 2026-04-28 by master-planner substage 12.0. Read at session-start
in addition to `current-execution.md`._
