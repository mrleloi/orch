---
id: 027
title: Phase 8 Strategic Redirect — invalidate carryforward burndown, pivot to drift-audit + self-application + community-readiness
status: ratified
date: 2026-04-27
phase: 8 (entry)
authoring_session: opus 4.7 main session #39 (post-/clear autonomous resume)
authorized_by: User prompt at tasks/feat_04_continue_before_phase_8/user_prompt.txt
supersedes: agent-workspace/session-plans/pending/phase-8-v2.3-carryforward-burndown.SUPERSEDED.md (master-planner output 2026-04-27)
supersedes_decisions: 027/028/029/030 placeholder slots in old plan are FREED (renumbered to 028+ for new plan)
---

# Decision 027 — Phase 8 Strategic Redirect

## Context

End of Phase 7 (v2.2.0 staged) the orchestrator authored a Phase 8 master plan
themed "v2.3 Carryforward Burndown" — fold CF-21..CF-26 + G.7/G.8 from Phase 7
into substages 8.0..8.5. Master-planner output: `phase-8-v2.3-carryforward-burndown.md`
(612 LOC). 8.0.1 research-scanner was dispatched; killed mid-execution; redispatch
queued for session #39 entry per checkpoint.

User intercepted at session #39 entry (post-/clear) with a strategic brief
(Vietnamese, 8 dimensions, ~600 words; canonical at
`tasks/feat_04_continue_before_phase_8/user_prompt.txt`) that fundamentally
redirects Phase 8+ trajectory. The carryforward-burndown framing is no longer
the priority; user evaluates significant **drift** has accumulated across:

- Agent config / settings (rules, format, structure unclear)
- Verify processes (insufficient phase-end + N-session-batch verification)
- Project-vs-charter alignment (scope, plan, ideas vs implementation drift)
- Hook / deterministic-script comprehensiveness (LLM-task vs deterministic-task partition)

User additionally introduces **new strategic dimensions**:

- **Self-application** — orch should now be capable of supporting its own
  development (use orch to develop orch); Phase 8+ should track this.
- **Multi-user / multi-project sharing** — practical use case = primary user
  + 1 colleague using orch for shared and personal projects; sharing and
  personalization must be designed before Phase 8 closes.
- **Community open-source readiness** — orch positioned as free autonomous-
  coding tool for community; configuration layering (system / user / project,
  analogous to Claude Code itself); telemetry collection sync to upstream;
  domain-workflow knowledge framework where coding is the first domain.
- **Effort-mode routing** — `/effort low/high/max` (orthogonal to opus/sonnet
  model tier) is a first-class capability; planning + lessons synthesis +
  high-impact tasks → effort max; routine code edits → effort low.

User explicitly authorized full project-folder customization
("folder C:\htdocs\orch-starter hoàn toàn cho phép bạn tùy chỉnh mọi thứ")
and full autonomy ("không cần hỏi thêm ý kiến tôi, tự động hoàn thành theo
đề xuất hợp lý của bạn, chỉ dừng lại công việc sau khi toàn bộ công việc
của dự án đã hoàn thành").

## Options considered

### Option A — Continue old Phase 8 carryforward-burndown plan unchanged

Pros: minimal change; CF-21..CF-26 close cleanly; v2.3 ships in ~3 days.
Cons: ignores user's explicit redirect; drift continues to accumulate; self-
application not built; community-readiness not addressed; project ships into
v2.3 without addressing the foundational concerns. Charter alignment WEAK —
"craft philosophy" (build for personal use, team-share second) is silently
shelved. **REJECTED — directly contradicts user's brief.**

### Option B — Hybrid: insert "drift audit + verify build-out" substage as 8.0bis, then continue old Phase 8 plan

Pros: addresses #1 + #2 + #3 of the user brief; CF-21..CF-26 still close.
Cons: ignores #4..#7 of the user brief (hook partition, self-application,
multi-user, community); risks next session repeating same redirect. Half-
measures rarely satisfy users who write 600-word strategic briefs. **REJECTED
— addresses ~40% of the brief.**

### Option C — Full redirect: re-author Phase 8 master plan against all 8 dimensions, fold CF-21..CF-26 as one substage

Pros: addresses 100% of user brief; charter alignment STRONG (craft philosophy
+ project-agnostic core + reusable-without-forking principles all benefit);
self-application capability becomes baseline for v2.3+ (every subsequent phase
dogfoods orch on itself); community-readiness lands in v2.3, not v3.0+;
configuration layering replaces ad-hoc current-execution.md with structured
config; effort-mode routing improves token-efficiency. CF-21..CF-26 fold into
one of the new substages (likely "drift audit" or "hardening fold-in").
Cons: ~3-5× larger than Option A budget; high authoring complexity; demands
master-planner /effort max + opus + structured 8-dimension decomposition.
**ACCEPTED.**

## Choice

**Option C.** The orchestrator will dispatch master-planner (opus, /effort max,
ORCH_SPAWNED, run_in_background: true) with a comprehensive briefing covering
all 8 user-brief dimensions, the CF-21..CF-26 backlog from old plan, and the
existing constitution / charter binding. Output:
`agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md`.

The old plan `phase-8-v2.3-carryforward-burndown.md` is renamed
`phase-8-v2.3-carryforward-burndown.SUPERSEDED.md` and remains in
`session-plans/pending/` as audit-trail evidence (NOT moved to `completed/`
since it was never executed; SUPERSEDED suffix communicates state to any
agent that reads the directory).

## Why (Charter rules + Karpathy)

- **Charter §"Craft Philosophy"**: "Build for personal use first, team-share
  second" + "Reusability as explicit design constraint, never an afterthought"
  → multi-user / sharing must be designed before final release, not bolted on
  later. Option C honors this; Option A defers it indefinitely.
- **Charter Principle 8**: "Reusable without forking" → community-readiness +
  configuration layering directly enable this. Option C lands it in v2.3.
- **Charter Principle 6**: "Adapter abstraction for runtimes" → existing
  pattern. Configuration layering extends this principle from runtime to
  config; charter coherent.
- **Karpathy P1 (Think Before Coding)**: user surfaced strategic concerns
  about drift; closing eyes and continuing old plan is "do not stop when
  confused". P1 binding → re-plan.
- **Karpathy P4 (Goal-Driven Execution)**: user provided 8 explicit goals
  with verifiable criteria. Option C transforms these to the new plan;
  Option A ignores them.
- **Autonomous-protocol Rule 1 (Charter Principles Win)**: charter §"Tight
  scope" might worry about Option C scope-creep, but charter ALSO says
  "Reusability as explicit design constraint" + "Build for personal use
  first, team-share second". The new dimensions are within the existing
  scope envelope (orch is a personal Claude Code orchestrator → multi-user
  + community sharing IS the team-share dimension already in charter).
- **Autonomous-protocol Decision Rule 7 (Document-And-Move)**: this decision
  file IS the "document"; master-planner dispatch IS the "move".

## Consequences (binding)

1. **Phase 8 becomes "v2.3 Strategic Pivot"** (new theme: drift-audit +
   self-application + community-readiness + carryforward fold-in). Master
   plan to be authored by master-planner.

2. **Old phase-8 plan SUPERSEDED**. Renamed file
   `phase-8-v2.3-carryforward-burndown.SUPERSEDED.md` retained in pending/
   as audit-trail. Decisions 027/028/029/030 placeholders in that plan are
   FREED — new plan will use 028+ for its decisions (this 027 is the redirect
   itself).

3. **CF-21..CF-26 + G.7/G.8 fold-in mandatory**. New plan must include these
   as one substage (likely the "hardening" or "drift-audit fix-pack" substage),
   so the v2.3 backlog still closes. They do not vanish; they ride alongside
   the strategic dimensions.

4. **I-6 ABSOLUTE preserved**. Decision 020 remains binding. Phase 8 ships
   ZERO `git commit`. v2.0.0 + v2.1.0 + v2.2.0 staged baseline persists;
   v2.3.0 stages at Phase 8 close, no commit.

5. **/effort routing first-class**. master-planner brief includes effort-mode
   selection per substage; high-impact tasks (planning, lessons synthesis,
   architectural decisions) → effort max; routine IMPL → effort low/medium.

6. **Self-application becomes baseline**. From Phase 8.x onward, where
   feasible, the orch daemon should be invoked on its own development tasks
   (queue items dropped into its own session-plans/pending/, processed by
   its own dispatcher, traced by its own OTEL pipeline). This is dogfooding.

7. **Configuration layering land in this phase or next**. System / user /
   project layers, analogous to Claude Code's own config inheritance.
   master-planner decides exact substage placement.

8. **Community framework / data collection / domain-workflow positioning**
   may stretch to v2.4 if budget tight, but the design discipline (telemetry
   collection seam, opt-in upstream sync hook, domain-workflow ontology) must
   land in v2.3 as scaffolding even if execution defers to v2.4.

9. **STOP conditions** inherit from autonomous-protocol unchanged. Wind-down
   triggers unchanged. /effort max routing in subagents does not change main-
   session budget thresholds.

## Master-planner brief (verbatim, attached for audit)

See orchestrator dispatch in session #39 transcript. Brief covers all 8
dimensions, references this decision file, requests output at
`agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md`,
mandates fold-in of CF-21..CF-26+G.7+G.8, mandates effort-mode-per-substage
annotation, mandates I-6 absolute preservation, mandates ≥10 incremental
Edit operations (Mandate E carry-over from Phase 7 retrospective).

## Open question

Master-planner determines: does v2.3 ship at end of Phase 8, or does Phase 8
end with v2.3.0-rc and Phase 9 ships v2.3? Decision deferred to master-planner
output; either is consistent with charter. v2.3 release timing is a master-
planner judgment call — orchestrator does not pre-bind it.

## Cross-references

- Old plan (superseded): `agent-workspace/session-plans/pending/phase-8-v2.3-carryforward-burndown.SUPERSEDED.md`
- User brief (canonical): `tasks/feat_04_continue_before_phase_8/user_prompt.txt`
- Phase 7 closure (carryforward catalog): `agent-workspace/memory/phase-7-complete.md`
- Decision 020 (I-6 absolute): `agent-workspace/memory/decisions/020-6.x-i6-binding.md`
- Decision 026 (CF-21 fix-list): `agent-workspace/memory/decisions/026-cf21-tool-use-id-correlation-defer.md`
- Decision 025 (SC-39 defer prerequisites): `agent-workspace/memory/decisions/025-7.7-sc39-defer.md`
- Charter craft philosophy: `PROJECT_CHARTER.md` §"Craft Philosophy"
- Charter principle 8: `PROJECT_CHARTER.md` Principle 8 (Reusable without forking)

**END Decision 027.**
