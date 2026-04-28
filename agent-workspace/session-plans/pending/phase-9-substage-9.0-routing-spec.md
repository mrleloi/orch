---
title: Phase 9 Substage 9.0 — Routing Brief Specification
substage: 9.0
parent_plan: agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md
status: BINDING
authored_by: sandwich-architect (opus/medium, ORCH_SPAWNED, 2026-04-27)
authored_date: 2026-04-27
session_type: FOCUSED_IMPL
session_role: routing-synthesis
recommended_dispatch: { agent: task-implementer, model: sonnet, effort: medium }
budget_estimate_K: 60
i6_compliance: zero git operations; document-authoring only
---

# Phase 9 Substage 9.0 — Routing Brief Spec

## Part A — Motivation

Phase 9 fans out into 8 downstream substages (9.1..9.8) plus 4 reviewer
dispatches plus 2-3 architect spawns (e.g., 9.6 SC-28 metrics-seam design).
Without a routing pass, the orchestrator main session would re-read
`phase-8-complete.md §4` (carryforward register, ~120 LOC) and `agent-notes.md`
(CF-27..CF-34 register, ~60 LOC) and `task-partition-matrix.md §7` (planned-
script backlog, ~40 LOC) for **every** dispatch — that is 220+ LOC × 11+
dispatches = ~2,420 LOC of repeat-read context-tax across the phase.

The 9.0 routing pass amortizes this read into one synthesis pass that emits
a per-substage handoff brief consumable by each downstream architect and
implementer in 1-2 reads instead of 11+. This is the same amortization
pattern used at Phase 8.0 (master-plan synthesis) and Phase 7.0 (Decision-018
strategic synthesis).

Secondary motivation: **effort-routing skill calibration**. Per Decision 032
D5, the `.claude/skills/effort-routing/SKILL.md` skill recommends (model,
effort) pairs for each dispatch from historical budget actuals. The 9.0 pass
is the appropriate moment to consult the skill once for the whole phase
rather than ad-hoc per-dispatch — the skill's "cold-start <3 samples"
fallback to master-plan defaults means a phase-entry consultation produces
a stable recommendation set that the orchestrator follows for the phase.

Tertiary motivation: **parallelism feasibility check**. §4 of the master
plan claims 9.1∥9.2∥9.3∥9.4 are parallel-safe. The routing brief verifies
this by inspecting each substage's actual file-edit set and flagging any
collisions (e.g., 9.1's CF-29 `layered-resolver.ts` edit and 9.5's CF-33
`packages/core/src/dispatch/recorder.ts` deletion are NOT collisions
because they touch different files; but if 9.2's MAJ-1 H7 edit overlapped
with 9.5's artifact-3 dispatch.jsonl re-sample, that would be a flag).

## Part B — Contract

### B.1 Inputs (read-only)

The 9.0 substage MUST read these files in this order:

1. `agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md` §1-§3, §9, §11 (the master plan; primary source for substage scopes, routing matrix, and v2.5 deferral pre-authorizations).
2. `agent-workspace/memory/phase-8-complete.md` §4 (full 18-row carryforward register with severity + status + v2.4-blocker flags).
3. `agent-workspace/memory/agent-notes.md` (full file; cite specific entries for each carryforward — CF-27 at :706-740, CF-28..31 at the 8.7.6 triple-review entries, M1/M2 at 8.1.4b entries, etc.).
4. `agent-workspace/memory/budget-tracker.md` (full file; for D3 historical actuals — feed to effort-routing skill; ≥3 sonnet/medium samples expected from Phase 8 8.x.x dispatches).
5. `agent-workspace/constitution/task-partition-matrix.md` §7 (19-script backlog with T-NN row IDs).
6. `agent-workspace/memory/audits/phase-0-7-charter-drift-audit.md` F-1..F-5 (drift-detection script motivation).
7. `.claude/skills/effort-routing/SKILL.md` (consulted for at least 3 (substage, model, effort) recommendations; deviations documented).

NO writes to any of these files. Read-only contract.

### B.2 Output (single deliverable)

Author `agent-workspace/memory/phase-9-routing-brief.md` (target ≤300 LOC).

Document shape (mandatory sections):

```markdown
---
title: Phase 9 Routing Brief
phase: 9
authored_by: task-implementer (sonnet/medium, ORCH_SPAWNED, 2026-04-27)
authored_date: 2026-04-27
parent_plan: agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md
spec: agent-workspace/session-plans/pending/phase-9-substage-9.0-routing-spec.md
status: ACTIVE
---

# Phase 9 Routing Brief

## §1 Per-substage routing entries (9.1..9.8)

(One subsection per substage. See §B.3 schema below.)

## §2 Effort-routing skill consultation log

(≥3 (substage, model, effort) entries consulted; rationale + deviation if any.)

## §3 Parallelism feasibility matrix

(Cross-check 9.1∥9.2∥9.3∥9.4 file-edit sets for collisions.)

## §4 v2.5 deferral candidates (final list)

(Confirm or amend the master plan §9 candidate list based on 9.0 analysis.)

## §5 Carryforward coverage assertion

(Bullet list: each of 18 v2.4 CFs mapped to its target substage or §4 deferral row.)

## §6 Budget sum verification

(Sum substage budgets from §1; assert ≤900K LOC budget = master plan claim.)

## §7 Open questions surfaced by routing

(Any newly-found gaps; route to architect re-dispatch or escalate.)
```

### B.3 Per-substage entry schema (§1 of the brief)

For each substage 9.1..9.8, the brief MUST emit a structured block:

```markdown
### 9.N — <substage title from master plan §3>

- **substage_id**: 9.N
- **scope_summary**: <1-2 sentence summary citing master plan §3 9.N Part A>
- **primary_carryforwards**: [CF-XX, CF-YY, ...]  (cite phase-8-complete.md §4 row IDs)
- **input_files** (read): [path1, path2, ...]
- **output_files** (write/edit): [path1, path2, ...]
- **recommended_dispatch_count**: N  (1 for atomic substages; 2-3 if architect+impl+reviewer triple)
- **recommended_(model, effort)**: <e.g., (sonnet, medium)>
  - **rationale**: <cite master plan §11 row + effort-routing skill consultation if invoked>
  - **deviation_from_master_plan**: <NONE | UPSHIFT_TO_X | DOWNSHIFT_TO_X> + reason
- **reviewer_pairs**: [{ post_dispatch_role: spec-compliance|code-quality|sandwich-verifier, model: sonnet, effort: medium }]
- **blockers**: <NONE | "depends on 9.0" | "depends on 9.5 artifact 5">  (cite master plan §4 dependency arrows)
- **parallel_safe_with**: [list of other substage IDs that may run concurrently per §3 parallelism analysis]
- **estimated_budget_K**: N  (from master plan §2 catalogue)
- **acceptance_gate** (verbatim from master plan §3): <1-line deterministic boolean>
```

### B.4 Acceptance gate (boolean; deterministic)

The 9.0 substage is COMPLETE when ALL of the following hold:

1. `agent-workspace/memory/phase-9-routing-brief.md` exists and is ≤300 LOC.
2. §1 contains exactly 8 substage entries (9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8) — no more, no fewer; each entry conforms to the §B.3 schema (all fields present).
3. §5 carryforward coverage assertion lists every CF in `phase-8-complete.md §4` rows with status=`OPEN-V2.4` (18 CFs total: CF-25, CF-27, CF-28, CF-29, CF-30, CF-31, CF-32, CF-33, CF-34, CF-DOGFOOD-2, CF-DOGFOOD-4, CF-DOGFOOD-5, CF-DOGFOOD-7, M1, M2, MAJ-1, MAJ-2, T11) and maps each to its target substage OR an explicit §4 v2.5 deferral row.
4. §2 effort-routing skill consultation log has ≥3 entries; deviations from skill output (if any) are documented with rationale.
5. §6 budget sum verification asserts `sum(estimated_budget_K) ≤ 900` and matches master plan §2's 850K claim within ±5%.
6. §3 parallelism feasibility matrix flags zero file-edit collisions among 9.1∥9.2∥9.3∥9.4 OR explicitly amends the parallel-safe set with rationale.
7. I-6 evidence: `git log --oneline | wc -l` = 1 at end of substage; no `git add`, `git commit`, `git stash` invoked.

### B.5 Hard constraints

- **Read-only on master plan**: 9.0 does NOT amend the parent plan. If routing analysis surfaces a defect in master plan §3 (e.g., a missing CF), 9.0 emits a §7 "open question" entry instead of self-amending; escalate to master-planner re-dispatch.
- **Read-only on PROJECT_CHARTER.md** and `decisions/*.md`: zero edits.
- **No premature dispatch**: 9.0 does NOT dispatch 9.1+ subagents. The brief is consumable downstream; the actual dispatches happen as orchestrator-driven follow-ups after 9.0 returns.
- **No new carryforwards authored**: if a finding warrants a new CF, emit it in §7 as a candidate; the orchestrator decides slot allocation (CF-35+ per master plan §7).
- **LOC budget**: brief ≤300 LOC. If §1 entries blow the budget, compress prose; do NOT lose schema fields.
- **D2 justification gate**: 9.0 itself is sonnet/medium per master plan §11 (mechanical synthesis); no D2 needed. If the implementer judges that opus/medium is required (e.g., complex parallelism analysis exposes hidden dependencies), the implementer documents the upshift rationale and proceeds — but stays at opus/medium per Decision 032 (no opus/max for routing-synthesis tasks).

### B.6 Effort-routing skill integration (Decision 032 D5)

The 9.0 implementer MUST invoke the effort-routing skill for at least these 3 substage (model, effort) decisions and record the consultation in §2:

1. **9.5 (Decision 034 authoring)** — master plan §11 says opus/medium with D2 justification. Confirm the skill agrees, or document downshift to sonnet/high if historical actuals support it.
2. **9.6 (SC-28 design)** — master plan §11 says opus/medium with D2 justification. Confirm or downshift.
3. **9.4 (drift-detection scripts)** — master plan §11 says sonnet/medium. Confirm the historical median actual_K for sonnet/medium across Phase 8 supports the 100K planned_K, or downshift to sonnet/low if median ≤60K.

Optional (recommended if budget allows):
4. **9.7 (medium-priority scripts)** — verify 120K is a realistic envelope for 9-10 small scripts.
5. **9.8 (phase close)** — verify sonnet/high is appropriate; mirror 8.8.3 actuals if available.

### B.7 Reviewer pairing recommendations (master plan §11 row "reviewers")

The brief's §1 entries SHOULD recommend reviewer pairings using this default policy (consistent with phase-8 routing):

| Substage class | post-impl reviewer | model/effort |
|---|---|---|
| Code-quality CF (9.1) | spec-compliance + code-quality | sonnet/medium ×2 (sequential) |
| Test-coverage CF (9.2) | code-quality | sonnet/medium ×1 |
| Safety CF (9.3) | spec-compliance | sonnet/medium ×1 |
| Drift-detection scripts (9.4) | code-quality (script style) | sonnet/medium ×1 |
| SC-39 path (9.5) | sandwich-verifier (adversarial; verdict-binding) | opus/medium ×1 with D2 |
| Phase 7 PARTIAL (9.6) | spec-compliance + code-quality | sonnet/medium ×2 |
| Scripts batch (9.7) | code-quality (sample 2 of 9-10) | sonnet/medium ×1 |
| Phase close (9.8) | sandwich-verifier (full-phase adversarial) | opus/medium ×1 with D2 |

The 9.0 brief MAY override these if the implementer's analysis surfaces a stronger pairing, but MUST document the override in §1's `reviewer_pairs` field per-substage.

### B.8 Verification (post-9.0; orchestrator self-checks)

After 9.0 returns, the orchestrator runs these deterministic checks before dispatching 9.1:

```bash
# Existence
test -f agent-workspace/memory/phase-9-routing-brief.md || exit 1

# LOC budget
[ "$(wc -l < agent-workspace/memory/phase-9-routing-brief.md)" -le 300 ] || exit 1

# Substage entry count (8 entries: 9.1..9.8)
[ "$(grep -c '^### 9\.[1-8] ' agent-workspace/memory/phase-9-routing-brief.md)" -eq 8 ] || exit 1

# CF coverage (18 mentions of CF-XX or M1/M2/MAJ-N/T11 across the brief)
covered=$(grep -oE '(CF-25|CF-27|CF-28|CF-29|CF-30|CF-31|CF-32|CF-33|CF-34|CF-DOGFOOD-2|CF-DOGFOOD-4|CF-DOGFOOD-5|CF-DOGFOOD-7|\bM1\b|\bM2\b|MAJ-1|MAJ-2|\bT11\b)' agent-workspace/memory/phase-9-routing-brief.md | sort -u | wc -l)
[ "$covered" -ge 18 ] || exit 1

# I-6 check
[ "$(git log --oneline | wc -l)" -eq 1 ] || exit 1
```

If any check fails, the orchestrator re-dispatches 9.0 with the failed check cited; max 2 retries before escalating to master-planner.

## §C — Risks (logged here per spawned-mode rationale convention)

1. **Skill cold-start fallback**: budget-tracker.md may have <3 samples for some (model, effort) cells (e.g., opus/medium); skill will return master-plan default with `alert: none`. This is acceptable per SKILL.md §"Cold-start check"; document in §2 of brief.
2. **CF-DOGFOOD-2 is structurally deferred**: master plan §9 already lists CF-DOGFOOD-2 as a v2.5 deferral candidate (Decision 033 §"Deliberation E"). The 9.0 brief should classify it as deferral in §4, not pretend to assign it to 9.5 or 9.6.
3. **Parallelism collision discovery**: if §3 reveals 9.1 and 9.4 share a file edit (low probability — drift scripts go to `scripts/audit/` and CF-29 goes to `packages/core/src/config/`), serialize the affected pair and flag in §7. Do NOT silently amend §1's `parallel_safe_with` lists.
4. **Budget sum mismatch**: if §6 finds sum >900K (e.g., 9.5 estimate creeps to 150K under realistic artifact load), the brief flags this in §7; orchestrator may re-dispatch master-planner for §2 catalogue revision.

## §D — Handoff to next substage (9.1)

After 9.0 returns and verification passes:

- 9.1 architect (if invoked) reads `phase-9-routing-brief.md §1 9.1` for scope + carryforwards + file targets.
- Orchestrator dispatches 9.1 + 9.2 + 9.3 + 9.4 in parallel per master plan §4 (concurrency cap 4).
- 9.1's task-implementer reads only 9.1's brief entry (≤30 LOC) instead of the full master plan + carryforward register (≥220 LOC). Context-tax savings per dispatch: ~190 LOC × 11 dispatches = ~2,090 LOC.

**END Substage 9.0 Routing Spec.**
