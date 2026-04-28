# Decision 032: Effort Routing — Model/Effort Dispatch Framework

**Date**: 2026-04-27
**Session**: Phase 8 close / Phase 9 entry (post-Phase-8-complete master-planner)
**Status**: active
**Backfilled at**: 10.6 (2026-04-28). Decision 032 was authored in practice during
Phase 9 master-planner dispatch but was never persisted as a standalone file.
This backfill reconstructs the content from consistent citations across 8+
downstream plan files and decision docs. Content marked "RECONSTRUCTED" below.

---

## Context

RECONSTRUCTED. The Phase 8 master plan §11 (effort routing) was the first
systematic treatment of subagent (model, effort) dispatch in this project. Prior
to Phase 8, dispatches used ad-hoc model selection with no formal concurrency
caps or justification gates. Decision 025 (SC-39 v2.3 DEFER) surfaced the first
case where the wrong model tier was used (opus/max on a mechanical task). The
Phase 8 strategic redirect (Decision 027) added "Effort Routing" as Dimension 8
— a cross-cutting concern threaded through every substage's `effort` column.

Decision 032 formalizes the effort-routing policy so that Phase 9 and later
phases operate under documented, enforceable rules rather than per-substage
guesswork.

---

## Options Considered

RECONSTRUCTED (from master-plan §8.8 cross-cutting effort routing context).

### Option A: No formal policy — ad-hoc per-substage
- Pros: zero overhead; orchestrator decides inline.
- Cons: inconsistent; quota spikes; no audit trail; quota-burn incidents repeat
  (cf. MEMORY.md: "/effort max burns quota fast").

### Option B: Fixed routing table (model/effort locked per subagent type)
- Pros: deterministic.
- Cons: inflexible; blocks legitimate escalation for genuinely hard tasks.

### Option C: Policy with explicit escalation gates (chosen)
- Pros: enforces defaults; allows justified escalation via D2 gate; auditable.
- Cons: overhead of authoring D2 justification for each escalation; acceptable
  because escalations are rare.

---

## Decision

RECONSTRUCTED from consistent multi-file citations.

The following clauses (D1–D6) constitute the binding effort-routing policy:

### D1: Default tier
Unless a D2 justification is authored and logged, all subagent dispatches
default to **(sonnet, medium)**. This is the "no-brainer" tier for
well-scoped implementation tasks.

### D2: Escalation gate (opus/medium or above)
Any dispatch requesting opus/medium or higher MUST include an inline D2
justification at dispatch-time with the following structure:
- One sentence stating WHY the task requires higher capability
  (e.g., "telemetry-driven judgment over 6 artifacts; binding decision").
- One sentence stating WHY it is NOT opus/max
  (e.g., "alternatives are pre-defined; no open-ended architecture from scratch").
- Logged in the relevant session plan's routing matrix (§11 or equivalent).

Acceptable D2 justifications (RECONSTRUCTED from Phase 9 master plan §11):
- "supersedes Decision 033 narrow gate; 6-artifact synthesis; binds future
  SC-39 attempts. NOT max because alternatives are pre-defined."
- "metrics seam binds OTEL emit shape; downstream sync-seam consumes. NOT max
  because constrained by existing seam pattern."
- "structural dogfood-gap assessment binds future v2.6+ self-application work;
  cross-references SC-44 and Decision 027 §C-8. NOT max because alternatives
  are pre-defined (FIX_INLINE / DEFER_V2.6 / WONT_FIX)."

### D3: Budget logging
Every subagent return MUST log a row in `agent-workspace/memory/budget-tracker.md`
with format:
```
| <timestamp> | <model> | <effort> | <substage-id> | <actual-K-tokens> | <notes> |
```
This enables effort-routing skill (D5) to build historical actuals for future
calibration.

### D4: Concurrency caps
At any given moment, the orchestrator MUST NOT exceed:
- ≤ 4 concurrent subagents (any tier)
- ≤ 2 opus/* (any effort level) in flight simultaneously
- ≤ 1 opus/max in flight simultaneously

These caps prevent API rate-limit exhaustion and quota spike incidents.
If the concurrency plan for a phase violates these caps, the plan MUST be
serialized or the violation explicitly noted with justification.

### D5: Effort-routing skill
The `.claude/skills/effort-routing/SKILL.md` skill (authored in Phase 8)
provides (model, effort) recommendations based on historical budget actuals
from budget-tracker.md. The 9.0 routing-brief implementer MUST consult the
skill for at least 3 substage decisions and record the consultation in §2
of the routing brief. Cold-start behavior: skill returns master-plan default
with `alert: none` if <3 samples exist for a given (model, effort) cell.

### D6: Master-plan amendments
D6 applies retroactively: if a phase's master plan contains opus/max rows
that lack D2 justification, the orchestrator may downshift them to
opus/medium or opus/high as part of the routing-brief ratification step.
Phase 8 §11 rows 8.4.1 + 8.6.1 were downshifted from opus/max to opus/high
under D6 at Phase 9 entry. Phase 9 §11 contained zero opus/max rows by
construction, satisfying D6.

---

## Charter Reference

P2 (Simplicity First): default to the cheaper tier; escalate only when
genuinely required. P4 (Goal-Driven Execution): each dispatch is a verifiable
goal with explicit success criteria and model tier.

MEMORY.md note: "/effort max burns quota fast — reserve for high-leverage;
data-route the rest."

---

## Consequences

1. Phase 9 and Phase 10 phase-entry routing briefs reference Decision 032 D4
   for concurrency cap verification.
2. Every opus/medium dispatch in Phase 9+ carries an inline D2 justification.
3. D3 logging is mechanically enforced via budget-tracker.md rows.
4. D5 skill consultation is mandatory for routing-brief authors.
5. SC-39 verdict dispatches (Decision 034, Decision 035) both cite Decision 032
   as the D2 justification basis.

---

## Reversibility

Moderate. Changing D4 caps or D2 requirements would require updating all
downstream phase plans that cite this decision. Documented; reversible with
a superseding decision.

---

## Cross-References

- Decision 025 (SC-39 v2.3 DEFER — surfaced the first quota-burn incident)
- Decision 027 (Phase 8 strategic redirect; added Effort Routing as Dim 8)
- Decision 034 (cites this decision for D2 justification of opus/medium dispatch)
- Decision 035 (same D2 citation chain)
- `agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md` §8, §10, §11
- `agent-workspace/memory/phase-9-routing-brief.md` §1 (D4 compliance check)
- `agent-workspace/memory/phase-10-routing-brief.md` §1 (D4 compliance check)
- MEMORY.md: feedback_effort_max_quota_discipline.md
