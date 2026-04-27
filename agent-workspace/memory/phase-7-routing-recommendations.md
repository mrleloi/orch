---
title: SC-39 Deferral Rationale — Self-Evolution Loop First Real Upgrade
date: 2026-04-27
status: DEFERRED-TO-V2.3
binds: SC-39
decision-source: agent-workspace/memory/decisions/025-7.7-sc39-defer.md
authored-by: task-implementer (architect-as-retrospective per 6.5.3 pattern)
substage: 7.7.2-DEFER
---

# SC-39 Self-Evolution Loop Upgrade — DEFERRED to v2.3

## Section 1 — Live RULE Evaluation (Phase 6 Telemetry)

Source: `agent-workspace/memory/component-rollup-phase-6.md` (14 components, 2,590 events).
Phase 7 telemetry not yet aggregated as of 2026-04-27 (dispatch.jsonl = 18 events / 4,112 bytes);
section will refresh at 7.8 closure if signal changes to ≥2 RULES firing on real components.

| Rule | Condition | Fires? | Proposed Action | Valid? |
|---|---|---|---|---|
| RULE-1 | `p99_duration_ms > 60000 AND model == sonnet` | YES — `agent::unknown-agent` (p99=190,702ms) | "Tier-down unknown-agent" | NO — data-capture artifact (see §2) |
| RULE-2 | `count >= 5 AND success_rate < 0.6` | NO — every component success_rate == 1.000 | (no proposal) | N/A |
| RULE-3 | `count >= 3 AND top_failure_mode == "C"` | NO — zero Mode-C events captured | (no proposal) | N/A |
| RULE-4 | `component_type == "agent" AND p99_tokens_real > 100000` | NO — per-agent tokens not captured at this telemetry granularity | (no proposal) | N/A |

**Outcome**: RULE-1 is the sole firing rule. Its proposal is architecturally void (§2). RULE-2/3/4 do not
fire. Signal is insufficient to support an actionable upgrade proposal. **DEFER is correct.**

## Section 2 — 6.2.7 P1 Verifier Finding: `unknown-agent` Is a Data-Capture Defect

The SubagentStop hook does not reliably capture the agent identifier at hook-fire time.
Events from unidentified agents accumulate in the `unknown-agent` bucket (75 events,
p99=190,702ms). This is documented in the 6.2.7 P1 adversarial dry-run:

> "A proposal to tier-down unknown-agent is architecturally meaningless: there is no such
> agent to tier-down." — decisions/025-7.7-sc39-defer.md §Context

Running the loop on this signal would produce a proposal with no valid target in the agent
registry. Human review would correctly REJECT it. Executing the loop now is performative theater.

## Section 3 — Citation Chain and Phase 7 Accumulation Estimate

- `phase-6-complete.md §C.3` ("signal-thin first pass"): "RULE-1's single firing on a
  metadata-attribution bug is real and useful, but the loop is not yet catching the dominant
  Phase 6 defect class."
- `phase-6-complete.md §C.4` (Phase 7 candidates): cross-phase rollup and real-dispatch-ts
  improvements are the correct v2.2/v2.3 precursors to a meaningful loop run.
- Phase 7 dispatch.jsonl at 7.7 dispatch time: 18 events / 4,112 bytes. At Phase 6's rate of
  ~2,590 events per phase, Phase 7 will end with an estimated 2,600–3,200 combined events
  across both phases — still below the ≥5× threshold (target: 12,000–15,000 events).
- **Re-evaluation recommended at v2.3 boundary**, after SubagentStop hook fix and multi-phase
  telemetry rollup are in place.

## Section 4 — v2.3 Prerequisites for Re-Evaluating SC-39

Per decisions/025-7.7-sc39-defer.md §Decision (verbatim):

1. Fix the SubagentStop hook to capture agent identifiers reliably (Phase 8 candidate item).
2. Accumulate ≥5× current event volume (target: ~12,000–15,000 events post-Phase 7).
3. Verify ≥2 RULES fire on real components (not data-capture artifacts).

Until all three prerequisites are met, re-executing SC-39 produces a vacuous proposal.
The loop infrastructure (rollup-telemetry.ts, telemetry-analyst subagent, citation-linter)
is fully in place from Phases 6.2 + 7.4; no rebuild is needed when prerequisites are met.

## Section 5 — Trade-offs Accepted

| Property | DEFER (this decision) | EXECUTE |
|---|---|---|
| SC-39 status | DEFERRED (explicit decision recorded, not FAIL) | PASS_WITH_CONCERNS |
| Charter alignment (hardening theme) | Strict — no feature surface extension | Mild violation |
| Loop end-to-end demonstration | Already provided by 6.2.7 P1 | Redundant second demonstration |
| Budget consumed | ~30K (this rationale doc only) | ~200K (architect + 1-2 IMPL + verifier) |
| v2.3 readiness | Same | Same |
| Noise added to recommendations corpus | None | Vacuous historical proposal that future runs must sift past |

## Section 6 — Charter Alignment

Phase 7's theme is **HARDENING** (master plan §1: "harden v2.1, do not extend feature surface").
Executing the loop would extend feature surface even if the proposal is ultimately rejected,
because it creates a proposal-application path and a historical artifact of dubious quality.

- **Karpathy P2 (Simplicity First)**: do not run a loop that produces a vacuous proposal when
  doing nothing costs 170K fewer tokens and preserves the same v2.3 readiness.
- **Karpathy P4 (Goal-Driven)**: SC-39's goal is "actionable proposal." Current data cannot
  satisfy that goal regardless of execution. DEFER is the goal-aligned choice.

## Section 7 — Reversibility

**HIGH.** All loop infrastructure landed in Phases 6.2 and 7.4:
- `scripts/utilities/rollup-telemetry.ts` + spec
- `.claude/agents/telemetry-analyst.md` (sonnet, Decision 021)
- `citation-linter` with `--rollup` flag (Phase 7.4)
- `master-planner.md` recommendation-cite hooks

v2.3 entry requires only an architect + IMPL pair to dispatch the first substantive loop run
once the three prerequisites above are satisfied. No code is removed by deferring SC-39.

---

**Filename reconciliation**: this file is named `phase-7-routing-recommendations.md` per
`decisions/025-7.7-sc39-defer.md §Decision` (binding, frontmatter `binds: 7.7`). Master plan
§7.7.2-DEFER Part A labels the output `phase-7-loop-upgrade-deferral.md`. Decision 025 is more
recent and explicitly binds substage 7.7; its filename supersedes the master plan label.
