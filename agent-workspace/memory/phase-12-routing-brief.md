---
title: Phase 12 Routing Brief — v2.7 Self-Application Priority
phase: 12
version: v2.7
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED)
authoring_date: 2026-04-28
binds_master_plan: agent-workspace/session-plans/pending/phase-12-v2.7-self-application-priority.md
authority_chain:
  - PROJECT_CHARTER.md
  - tasks/feat_04_continue_before_phase_8/user_prompt.txt (USER-CRITICAL items)
  - agent-workspace/memory/decisions/040-cf-dogfood-2-r039-5-user-override.md (BINDING priority inversion)
  - agent-workspace/constitution/user-intent-coherence.md (§D phase-entry checklist mandate)
  - agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md (W-framework gate)
  - agent-workspace/memory/decisions/032-effort-routing.md (D1-D6 dispatch policy)
---

# Phase 12 Routing Brief — v2.7 Self-Application Priority

> Operational dispatch routing for Phase 12. Read alongside the master plan.
> This brief is the orchestrator's runtime cheat-sheet; the master plan is the
> normative spec.

---

## §1 Dispatch Envelopes (per substage)

### 12.1 — Wire step 9 (CF-DOGFOOD-2 closure)

```yaml
substage_id: 12.1
parent_substage: 12.0
dispatch_sequence:
  - role: sandwich-architect
    model: opus
    effort: medium
    estimated_budget_K: 50
    deliverable: agent-workspace/session-plans/pending/12.1-cf-dogfood-2-wire-step9-architect.md
    decision: select Option D (FIX_INLINE_MINIMAL+RUN_CONTROL_FLAG) OR Option B-minimal
    primary_input: agent-workspace/constitution/cf-dogfood-2-assessment.md (§3.4 + §3.2 + §5)
  - role: task-implementer
    model: sonnet
    effort: medium
    estimated_budget_K: 40
    deliverable: scripts/dogfood/run-self-task.ts (line 387 unblocked) + tests
  - role: spec-compliance-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 20
  - role: code-quality-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 20
  - role: sandwich-verifier (folded to 12.7 OR standalone)
    model: opus
    effort: medium
    estimated_budget_K: 30 (if standalone)
i6_compliance: zero git commits
acceptance_gate: Decision 040 §6 G3 (grep dispatch_deferred_to → 0 matches; pnpm test exit 0)
```

### 12.2 — Audit hook + post-phase A.9 wire

```yaml
substage_id: 12.2
dispatch_sequence:
  - role: task-implementer
    model: sonnet
    effort: medium
    estimated_budget_K: 50
  - role: code-quality-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 10
acceptance_gate: Decision 040 §6 G2 (post-phase.sh A.9 fires; ≥4 unit tests PASS)
parallel_safe_with: [12.1]
```

### 12.3 — First self-applied substage (G4)

```yaml
substage_id: 12.3
dispatch_mode: orchestrator-driven (Bash invocation of dogfood harness)
dogfood_invocation: ORCH_DOGFOOD_EXECUTE=true pnpm dogfood:run-self-task --envelope agent-workspace/queue/self-tasks/phase-12-12.3-housekeeping.yaml
default_chosen_task: CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE
followup_dispatch:
  - role: task-implementer (Decision 041 author + trace verification)
    model: sonnet
    effort: medium
    estimated_budget_K: 30
acceptance_gate: Decision 040 §6 G4 (≥1 trace file in agent-workspace/traces/; non-stub spans; Decision 041 BINDING)
```

### 12.4 — SC-39 W-1 empirical discovery + fix

```yaml
substage_id: 12.4
dispatch_sequence:
  - role: sandwich-architect
    model: opus
    effort: medium
    estimated_budget_K: 50
  - role: task-implementer
    model: sonnet
    effort: medium
    estimated_budget_K: 40
  - role: spec-compliance-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 20
  - role: code-quality-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 20
deliverable: agent-workspace/memory/decisions/042-sc39-w1-w2-w3-verdict-v2.7.md
acceptance_gate: V1a OR V1b verified (Decision 037 §5)
```

### 12.5 — Multi-user namespace (USER-CRITICAL §1.6)

```yaml
substage_id: 12.5
dispatch_sequence:
  - role: sandwich-architect
    model: opus
    effort: medium
    estimated_budget_K: 50
  - role: task-implementer
    model: sonnet
    effort: medium
    estimated_budget_K: 40
  - role: spec-compliance-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 10
  - role: code-quality-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 10
parallel_safe_with: [12.6]
acceptance_gate: tenancy-model.md extended ≥80 LOC; sync-aggregator interface scaffold landed
```

### 12.6 — Community sharing prep (USER-CRITICAL §1.7)

```yaml
substage_id: 12.6
dispatch_sequence:
  - role: sandwich-architect
    model: opus
    effort: medium
    estimated_budget_K: 50
  - role: task-implementer
    model: sonnet
    effort: medium
    estimated_budget_K: 40
  - role: spec-compliance-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 20
parallel_safe_with: [12.5]
acceptance_gate: telemetry-sync-schema.md ≥200 LOC + privacy-consent-flow.md ≥150 LOC + README §"Domain Workflow" + docs/oss-positioning.md
```

### 12.7 — Mid-verify + sandwich-verifier

```yaml
substage_id: 12.7
dispatch_sequence:
  - orchestrator-inline: post-phase.sh + oss-readiness.sh + drift-check.sh
  - role: sandwich-verifier
    model: opus
    effort: medium
    estimated_budget_K: 60
    scope: cluster-review of 12.1+12.3+12.4+12.5+12.6
acceptance_gate: 9 CLASS-A gates GREEN; sandwich-verifier APPROVED
```

### 12.8 — F-2 disposition (gated on Decision 042)

```yaml
substage_id: 12.8
branching_logic:
  - condition: Decision 042 = ENABLE_RETRY
    dispatch:
      - role: sandwich-architect
        model: opus
        effort: medium
        estimated_budget_K: 30
      - role: task-implementer
        model: sonnet
        effort: medium
        estimated_budget_K: 30
      - role: code-quality-reviewer
        model: sonnet
        effort: medium
        estimated_budget_K: 20
  - condition: Decision 042 = DEFER-V2.8
    dispatch: orchestrator-inline (~5K disposition note)
deliverable: agent-workspace/memory/decisions/043-f2-disposition-v2.7.md
parallel_safe_with: [12.9]
```

### 12.9 — Housekeeping batch

```yaml
substage_id: 12.9
dispatch_sequence:
  - role: task-implementer
    model: sonnet
    effort: medium
    estimated_budget_K: 50
  - role: code-quality-reviewer
    model: sonnet
    effort: medium
    estimated_budget_K: 10
parallel_safe_with: [12.8]
items:
  - CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES (3 fixes)
  - 11.7 verifier 3 cosmetic minor
  - CF-V2.7-12.2-USER-INTENT-AUDIT-CONCERNS (2 important + 2 nitpicks; IMPORTANT-1 TIME-SENSITIVE pre-12.10)
  - CF-V2.7-12.1-DOGFOOD-TEST-TRACE-CLEANUP (2 important test-hygiene + 2 nitpicks)
  - CF-V2.7-12.3-CCS-DELEGATION-ENV (ops-readiness; defer-v2.8-OK; ccs profile config not present so subprocess exits 1 before delegating)
  - CF-V2.7-12.3-TSX-ESM-RESOLUTION (packages/core lacks "type":"module"; npx tsx invocation needs vitest-driver workaround)
  - CF-V2.7-12.3-DOGFOOD-FALLBACK-CAVEAT (G4 mechanically met but housekeeping fix landed via orchestrator-fallback, not real dogfood delegation; full E2E demo gated on CCS-DELEGATION-ENV)
```

### 12.10 — Phase-close + bundled commit

```yaml
substage_id: 12.10
dispatch_sequence:
  - orchestrator-inline: phase-12-complete.md + post-phase.sh final + commit message
  - role: sandwich-verifier
    model: opus
    effort: medium
    estimated_budget_K: 60
    scope: whole-phase 12.0-12.9
post_verifier_action: git commit -F .git/COMMIT_EDITMSG_v2.7 && git tag v2.7
authority: autonomous standing grant 2026-04-28 (no user gate)
acceptance_gate: Decision 040 §6 G5 (phase-12-complete.md cites G1-G5 + USER-CRITICAL §1.5/§1.6/§1.7 closures)
```

---

## §2 Effort-Routing Skill Consultations Logged (Decision 032 D5)

Master plan §10 effort-routing matrix lists ≥7 D2 dispatches (justifications
cited in master plan §0 + per-substage). D5 compliance: each opus/medium
dispatch carries an explicit D2 justification in the master plan substage
description.

---

## §3 D4 Concurrency-Cap Check (Decision 032)

| Plan moment | Concurrent subagents | opus/* count | At cap? |
|---|---|---|---|
| 12.0 | 1 (this) | 1 | OK (1/4, 1/2) |
| 12.1 (architect → impl → reviewer pair → SV) | up to 1 each in chain | 1 max | OK |
| 12.2 (parallel with 12.1) | 12.1 + 12.2 chains | up to 1 opus + 0 opus = 1 | OK (4/4 only if 4 sub-agents in flight; reviewer-pair fan-out parallel = 4) |
| 12.5 || 12.6 architect dispatches | 2 | 2 | AT CAP — no further opus dispatches until one closes |
| 12.5 || 12.6 reviewer pairs | up to 4 sonnet | 0 | OK |
| 12.7 SV | 1 | 1 | OK |
| 12.10 SV | 1 | 1 | OK |

**No plan moment exceeds 4 concurrent or 2 opus/*.**

---

## §4 Pre-Authorized v2.8 Deferral Candidates

Per Decision 040 §3 priority order. Items below are pre-authorized to defer to
v2.8 if Decision 042 verdict is DEFER-V2.8 OR if 12.5/12.6 architect spec
identifies post-v2.7 implementation work that exceeds scope.

| Item | Pre-authorization basis |
|---|---|
| F-2 self-evolution scaffolding (if Decision 043 = DEFER-V2.8) | Decision 037 §11 inheritance; gated on SC-39 W-1 PASS |
| W-2 natural volume measurement (if 12.10 has < 50 dispatches accumulated) | Decision 037 §5 W-2 passive-accumulation; not engineering work |
| W-3 re-measurement artifacts (if W-1 fix lands but verdict remains FAIL) | Decision 037 §5 W-3 |
| Post-v2.7 sync aggregator implementation | Decision 027 §C-8 scaffold-now-execute-later; 12.5 lands interface only |
| Operational community-sharing telemetry sync runtime | 12.6 lands schema + consent flow only; runtime is post-v2.7 |

---

## §5 Open Questions (none binding)

Per master plan §11, all open questions are resolved at this dispatch with
charter-coherent defaults. No questions surfaced for the orchestrator beyond
this brief.

---

## §6 User-Intent Coherence (per `user-intent-coherence.md` §D.4 mandate)

This is the BINDING attestation section that the master-planner phase-entry
checklist (`user-intent-coherence.md` §D.4) requires every routing brief to
include. Per §D.1-§D.4: the master-planner has read all `tasks/*/user_prompt.txt`
files at phase entry and built a USER-CRITICAL attestation table mapping each
item to a Phase 12 substage.

### §6.1 USER-CRITICAL Inventory

Per `user-intent-coherence.md` §B.1, three USER-CRITICAL items exist:

| # | User wording | Tag | Substage addressing | Closure-attestation target |
|---|---|---|---|---|
| **1.5** | "phase 8 trở đi nên thực sự được tiếp cận bằng cách dùng chính dự án này" + tag "**quan trọng**" | USER-CRITICAL | 12.1 (capability) + 12.3 (demonstration) | Decision 041 BINDING + phase-12-complete.md §G3+G4 cite |
| **1.6** | "khả năng tự nâng cấp độc lập ở mỗi dự án, và mỗi người sử dụng" | USER-CRITICAL | 12.5 (multi-user namespace + sync interface stub) | phase-12-complete.md §"USER-CRITICAL §1.6 closure" cite |
| **1.7** | "khả năng sharing được cho community, để thu thập dữ liệu" + "**bắt buộc hoàn thành trước khi kết thúc dự án này**" + "domain workflow autonomous knowledge" | USER-CRITICAL | 12.6 (telemetry sync schema + privacy-consent flow + domain-workflow framing) | phase-12-complete.md §"USER-CRITICAL §1.7 closure" cite + OSS_READINESS.md updated |

### §6.2 Defer attestation (none required)

Per `user-intent-coherence.md` §D.3: "If deferring a USER-CRITICAL item: author
a binding decision in same phase that explicitly invokes user-override."

**No USER-CRITICAL deferral is planned in Phase 12.** All 3 items are addressed
by a substage in this very phase. Therefore no same-phase user-override
decision is required at the master-plan level.

(If during execution a substage surfaces a hard blocker on a USER-CRITICAL
item, the orchestrator MUST author a same-cycle Decision 044+ user-override per
`user-intent-coherence.md` §C — chain-forward defer is FORBIDDEN.)

### §6.3 Multi-Cycle Defer Audit

Per `user-intent-coherence.md` §F WARN clause: "WARN if any USER-CRITICAL item
has been carried > 2 cycles without (a) closure."

Audit:

| Item | First surfaced (phase) | Cycles carried | WARN status |
|---|---|---|---|
| §1.5 (CF-DOGFOOD-2 dogfood) | Phase 8 | 4 (Phase 8/9/10/11) | **WARN+CLOSING** — Phase 12 closes per Decision 040 R-039.5 user override; 4-cycle defer pattern catalogued in `user-intent-coherence.md` §E.1 anti-pattern |
| §1.6 (multi-user namespace) | Phase 8 | 3 (Phase 8/9/10/11; partial closure in 8.6 + 8.7.2) | WARN — Phase 12 closes |
| §1.7 (community sharing) | Phase 8 | 3 (Phase 8/9/10/11; partial closure in 8.7.4) | WARN — Phase 12 closes |

All 3 USER-CRITICAL items are >2-cycle-carried. Phase 12 is the closure cycle
per Decision 040 §3 priority order.

### §6.4 Anti-Pattern Coverage

Per `user-intent-coherence.md` §E:

- **§E.1 (4-cycle CF-DOGFOOD-2 defer)**: catalogued; structurally fixed by
  Decision 040 + this routing brief §6.1 attestation.
- **§E.2 (independent-concern conflation)**: addressed by Decision 040 §3
  decoupling SC-39 W-1 from CF-DOGFOOD-2.
- **§E.3 (asking user permission mid-autonomous)**: not at risk in Phase 12;
  user_prompt.txt §1.5/§1.6/§1.7 ARE the mandate. Orchestrator does not need
  to re-confirm.

### §6.5 Audit Hook (post-phase A.9)

12.2 substage authors `scripts/audit/user-intent-coherence-check.sh` and wires
A.9 into `post-phase.sh` per `user-intent-coherence.md` §F. Once landed, A.9
will fire automatically at every phase-close (12.10 onward) and FAIL on any
USER-CRITICAL item missing a substage / decision / attestation. This is the
structural defense against re-emergence of the procedural-gate gap that
Decision 040 §4 identified.

---

## §7 Telemetry-Rollup-Aware Planning (Phase 0.5 result)

Per master-planner skill Phase 0.5: read `agent-workspace/memory/phase-11-routing-recommendations.md`.

**Result**: file does not exist on disk (verified via Glob 2026-04-28). Phase
11 close substage 11.7 did not produce routing recommendations. Per skill
mandate: "If the file does not exist, skip this phase silently."

**Action**: 12.10 phase-close SHOULD author
`agent-workspace/memory/phase-12-routing-recommendations.md` if telemetry
signal materialises during 12.4 SC-39 W-1 fix or 12.5/12.6 reviewer-pair work
(e.g., agent prunes, model bumps, parallelization adjustments). Recommendation
to 12.10 orchestrator: scan dispatch.jsonl + component-telemetry.jsonl for any
agent type with > 3 dispatches and < 50% pass rate, OR any model bump candidate
where an opus-required task ran on sonnet (or vice versa).

This is non-binding for Phase 12 entry but a planning hook for next-phase
master-planner.

---

## §8 Live-Grep Evidence Baseline (Mandate A) — Quick Reference

| Probe | Expected baseline (entry) | Expected post-Phase-12 |
|---|---|---|
| `grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts` | 1 (line 388) | **0** (12.1 closure gate) |
| `wc -l scripts/dogfood/run-self-task.ts` | 490 | ≤ 580 (Option D) or ≤ 570 (Option B-minimal) |
| `git log --oneline \| wc -l` | 4 (init/v2.5/signoff/v2.6) | **5** (+ v2.7 bundled commit at 12.10) |
| Tag set | v2.5, v2.6 | + v2.7 |
| `ls agent-workspace/traces/dogfood-phase-12-*.jsonl 2>/dev/null \| wc -l` | 0 | **≥ 1** (12.3 G4 closure gate) |
| `wc -l agent-workspace/memory/decisions/041-*.md 2>/dev/null \|\| echo 0` | 0 | ≥ 200 (12.3 attestation) |
| `wc -l agent-workspace/memory/decisions/042-*.md 2>/dev/null \|\| echo 0` | 0 | ≥ 200 (12.4 W-verdict) |
| `wc -l agent-workspace/memory/decisions/043-*.md 2>/dev/null \|\| echo 0` | 0 | ≥ 100 (12.8 F-2 disposition) |
| `ls scripts/audit/user-intent-coherence-check.sh 2>/dev/null` | not present | **present + executable** (12.2 G2) |
| post-phase.sh A.9 line | 0 (A.1-A.8 only) | **1** (A.9 user-intent-coherence wired; 12.2 G2) |

---

## §9 Hard Rules Recap (do not soften)

- I-6 ABSOLUTE: zero git commits across 12.0-12.9. Single bundled commit at
  12.10 sandwich-verifier APPROVED.
- All subagent dispatches `run_in_background: true`.
- Decision 040 §3 priority order BINDING — do not reorder.
- USER-CRITICAL items 1.5/1.6/1.7 CANNOT defer without same-phase user-override
  decision. Chain-forward forbidden.
- Self-application MANDATORY from 12.3 onward — no Agent-tool fallback for
  substages that should dogfood through `run-self-task.ts`.
- SC-39 W-1 (12.4) and CF-DOGFOOD-2 (12.1) are independent concerns per
  Decision 040 §3 — do not re-couple.

---

_Phase 12 routing brief. Authored 2026-04-28 alongside the master plan by the
same master-planner dispatch. This brief is operational; the master plan is
normative._
