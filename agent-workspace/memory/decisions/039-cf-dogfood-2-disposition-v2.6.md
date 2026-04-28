---
decision_id: 039
title: CF-DOGFOOD-2 Disposition v2.6 — DEFER-V2.7 (structural-defer pattern)
phase: 11
substage: 11.3
class: defer
verdict: DEFER-V2.7 — re-attempt prerequisites bound to v2.7 gating; charter-coherent per Decision 027 §C-8 + Decision 033 Deliberation E pattern
status: BINDING
date: 2026-04-28
authoring_agent: task-implementer (opus 4.7, /effort medium, ORCH_SPAWNED, Phase 11 §11.3)
supersedes: none (carries forward Decision 033 Deliberation E inheritance + Phase 10 §10.3 assessment recommendation)
supersession_target: superseded only when v2.7 master plan re-opens CF-DOGFOOD-2 against §"Re-attempt Prerequisites" below
---

# Decision 039 — CF-DOGFOOD-2 Disposition v2.6: DEFER-V2.7

## §1 Context

CF-DOGFOOD-2 was opened by substage 8.5.4 adversarial review (Phase 8 v2.3),
carried through Phase 9 (`phase-9-complete.md §4`), and routed to Phase 10
substage 10.3 for architectural assessment. Phase 10 §10.3 produced a binding
architectural assessment (`agent-workspace/constitution/cf-dogfood-2-assessment.md`,
516 LOC, surveyed 5 options A–E) and recommended **DEFER-V2.6** with explicit
v2.6 trigger conditions in §4.2 of that document. The Phase 10 master plan
§4 deferral candidate #2 pre-authorized that recommendation.

Phase 11 v2.6 substage 11.3 is the binding-disposition substage that the
Phase 10 assessment deferred. The 11.3 task envelope offers three admissible
verdicts:

- **FIX_INLINE** — replace `scripts/dogfood/run-self-task.ts:387` step-9
  stub (`dispatch_deferred_to: '8.5.3'`) with a real `IAgentRuntime.spawn()`
  invocation guarded behind a profile flag (Option D from Phase 10 §3.4 or
  Option B-minimal from §3.2). Budget-bounded ≤80K total, ≤150 LOC delta.
- **DEFER-V2.7** — author binding decision citing v2.7 trigger conditions;
  the assessment's §4.2 trigger conditions transcribe directly with
  v2.6 → v2.7 substitution.
- **WONT_FIX** — author binding decision citing charter-coherence
  rationale (e.g., Phase 10 §3.5 Option E "RESOLVED_BY_DOCUMENTATION").

The CF concretely is: the 8.5.2 dogfood harness (`scripts/dogfood/run-self-task.ts`,
490 LOC) ships steps 1–8 + step 11 of the spec §4.2 algorithm, but step 9
(real subprocess dispatch via `IAgentRuntime.spawn()` / `SessionManager.runSession()`)
is stubbed at `run-self-task.ts:387`. The trace currently emits
`appendTrace({...,dispatch_deferred_to:'8.5.3'})` and logs would-be spawn
parameters; no `claude --rc` subprocess is ever spawned. Downstream
consequences: (a) checkpoints C2 + C3 from spec §6 never executed end-to-end
against real master-planner / sandwich-architect subprocesses;
(b) `agent-workspace/traces/` contains zero real dogfood JSONL files;
(c) the SC-44 deterministic gate (≥2 phase-N traces) is satisfied only via
the lightweight stub-trace path.

---

## §2 Decision

**DEFER-V2.7.** CF-DOGFOOD-2 disposition is deferred to Phase 12 / v2.7
master planning. No code changes land in v2.6 substage 11.3. The
architectural assessment at `agent-workspace/constitution/cf-dogfood-2-assessment.md`
remains the binding architectural map; this decision binds the
disposition (which the assessment explicitly left for v2.6).

The structural-defer class follows the Decision 033 Deliberation E
pattern (no clean fix within phase budget; explicit re-attempt
prerequisites enumerated; supersession-target a future binding decision).

---

## §3 Rationale

### §3.1 The §4.2 trigger conditions remain unmet

Phase 10 assessment §4.2 listed four trigger conditions that would
warrant v2.6 closure of CF-DOGFOOD-2. Re-evaluated at v2.6 entry (Phase 11
substage 11.3, 2026-04-28):

| Trigger condition (assessment §4.2) | v2.6 status |
|---|---|
| Decision 035 verdict at 10.5.3 = ENABLE_RETRY | **NOT MET.** Decision 035 verdict is **DEFER-V2.6** (3 PASS / 3 FAIL on the v2.4 6-artifact gate). SC-39 self-evolution loop is NOT enabled in v2.5. Real dogfood telemetry is therefore not load-bearing for SC-39 signal quality in v2.6. (Trigger 1 was the strongest forcing function; its absence is the dominant factor.) |
| Community OSS launch trigger fires (`docs/dogfood-harness.md` 8.7.4 deliverable needs working demo) | **NOT MET.** OSS NPM publish + GitHub public-flip is a v2.6 §4 candidate per Decision 027 §C, but Phase 11 master plan does NOT schedule it before 11.5 R-4 close. The dogfood-harness OSS docs deliverable is not on the v2.6 critical path. |
| Unrelated substage touches `scripts/dogfood/run-self-task.ts` and re-encounters the stub | **NOT MET.** No substage between Phase 10 close (commit `92f50ec`, 2026-04-28) and Phase 11 11.3 dispatch has touched the harness file. `git log --since=2026-04-28 -- scripts/dogfood/run-self-task.ts` is empty. Drift cost has not begun materializing. |
| Multi-user adoption rollout requires envelope schema evolution | **NOT MET.** Multi-user rollout is a v2.6 §4 deferral candidate per Decision 027 §C, not currently scheduled in Phase 11 master plan. Envelope schema (`packages/core/src/dogfood/envelope-schema.ts`) is unchanged since 8.5.2. |

Zero out of four trigger conditions are met. The Phase 10 assessment
recommendation continues to apply with v2.7 substituted for v2.6.

### §3.2 v2.6 budget envelope is structurally analogous to v2.5

Phase 11 master plan loads:

- 11.1 audit-script + hook-config drift remediation (~120K)
- 11.2 reviewer-subagent observation-write contract (~80K)
- 11.3 this disposition (60K decision + up to 40K FIX_INLINE IMPL = 100K cap)
- 11.4 mid-verify gate (~30K)
- 11.5 SC-39 R-1/R-2/R-3/R-4 framework — **load-bearing substage of v2.6**
  (~330K across three stages 11.5.1+11.5.2+11.5.3)
- 11.6 v2.6 closure attestation + Phase 12 framing (~80K)

This loads v2.6 at ~740K mid-estimate. FIX_INLINE here adds ~40–45K (Option
D from Phase 10 §3.4) and consumes orchestrator dispatch attention against
the 11.5 load-bearing window. The Phase 10 §4.1 reasoning ("v2.5 budget
envelope is tight; CF-DOGFOOD-2 is not load-bearing") transcribes directly
to v2.6: 11.5 is load-bearing; CF-DOGFOOD-2 is not; budget pressure on
the load-bearing window is the same pattern.

### §3.3 IAgentRuntime maturity is sufficient but not the limiting factor

The IAgentRuntime contract (`packages/core/src/domain/types/runtime.ts`)
ships a stable five-method surface (`spawn`, `resume`, `terminate`,
`awaitAndClassify`, `writeStdin`) with ClaudeCodeAdapter wired via the
`IAGENT_RUNTIME` symbol token in SessionsModule. Maturity is sufficient
for FIX_INLINE wiring — confirmed: the assessment §2.2 already noted
`SessionManager.runSession(plan)` is "sufficient per 8.5.1 §7.1" and
the spawn/SIGTERM→SIGKILL path is reusable. Maturity is NOT the
limiting factor; budget-vs-load-bearing-substage prioritization is.

This means: when v2.7 re-evaluates, the technical prerequisite is
already MET. The v2.7 trigger gate is therefore purely about whether
real dogfood telemetry has become load-bearing for some v2.7+ workstream
(SC-39 retry post-fix; OSS launch; multi-user rollout; envelope schema
evolution).

### §3.4 Charter-coherence per Decision 027 §"Consequences" 8

Decision 027 §C-8 (binding through v2.6+) states: "the design discipline
(telemetry collection seam, opt-in upstream sync hook, domain-workflow
ontology) must land … as scaffolding even if execution defers to v2.4 [now
v2.7]." CF-DOGFOOD-2 is a textbook scaffold-now-execute-later instance:
the harness scaffold (steps 1–8 + 11) IS shipped; only the dispatch leg
(step 9) defers. This is design, not drift.

### §3.5 Risk-adjusted comparison vs Phase 10

The risks Phase 10 §3.1 identified (R1: harness wiring surfaces
unanticipated coupling with SessionManager; R2: real subprocess spawn
during CI causes test-environment side effects) are unchanged. The
profile-flag-default-OFF mitigation (Option D) reduces R2 to near-zero
but R1 (coupling discovery) remains: any FIX_INLINE has a non-trivial
chance of revealing that wiring requires SessionManager API extension
(e.g., `runSession()` requires a `SessionPlan` whose construction in
`runSelfTask` is non-obvious — the dogfood envelope is a different
shape than `SessionPlan`). That risk surfaces a downstream substage
the orchestrator did not budget for.

### §3.6 Why not WONT_FIX

Phase 10 §3.5 Option E (RESOLVED_BY_DOCUMENTATION) is structurally
WONT_FIX. The argument-of-record there (and rejected): "the on-disk
references all use the word 'structural', which implies a code-shaped
gap, not a docs-shaped one. Re-classifying as docs-only may strain
charter-coherence with those prior references." That objection applies
identically here. Additionally, WONT_FIX forecloses an option the
assessment explicitly preserves; the structural stub remains in code as
a known seam for a future wiring substage. Closing as WONT_FIX would
require also removing or rewriting the stub (otherwise the codebase
carries dead code labelled as resolved), which is a larger scope than
the disposition substage.

### §3.7 Why not FIX_INLINE inside this substage's 100K envelope

FIX_INLINE (Option D, ~45K IMPL) is technically feasible inside the
100K substage budget. It is rejected on grounds:

- **Opportunity cost**: 11.3's 100K envelope is shared with 11.1 + 11.2
  (`parallel_safe_with: [11.1, 11.2]`). Spending 45K of orchestrator
  attention on a non-load-bearing fix while 11.5 SC-39 framework looms
  inverts the priority order.
- **Coupling discovery risk** (§3.5 above): the SessionPlan ↔ dogfood
  envelope translation is the kind of surface where IMPL discovers
  it needs a 30–60 LOC schema extension that wasn't in the assessment's
  estimate. The 80K total budget cap could be breached, triggering the
  task envelope's "REVERT and switch to DEFER-V2.7" fallback —
  which is what this decision pre-empts.
- **Test-environment trust**: even with the profile-flag OFF default,
  shipping the wired path means CI test-environment now has a code
  path that, if accidentally enabled (env-var typo, future test
  refactor that toggles flags), spawns real `claude --rc` subprocesses.
  That is a CI risk this project has not yet accepted.
- **The "small positive coupling" with SC-39** identified in the
  assessment §2.3 is even smaller now: Decision 035 §2 shows the
  SC-39 named-agent-unknown_fraction is 1.000 in production stream,
  and pairing_rate is 0.000 — these are structural blockers in the
  hook layer (CF-21 + named-agent self-reporting), not solvable by
  more dogfood traces. Dogfood telemetry from a wired step 9 would
  generate ~10–20 dispatched events per real run, against an
  8,031-event corpus; statistically negligible.

---

## §4 Consequences (binding)

1. **No code changes in 11.3.** `scripts/dogfood/run-self-task.ts:387`
   stub remains. `tests/dogfood/run-self-task.spec.ts` unchanged.
   `agent-workspace/queue/self-tasks/` retains exactly one envelope
   (`_smoke-fixture.yaml`); C2 + C3 envelopes remain unauthored.

2. **Carryforward register**: CF-DOGFOOD-2 status updates from
   "OPEN; pending v2.6 disposition" to "**OPEN-DEFERRED-V2.7**; bound
   by Decision 039". The `carryforwards-v2.6.md` register is updated
   to mark CF-DOGFOOD-2 as bound (not pending). A new
   `carryforwards-v2.7.md` register is created seeded with this CF
   plus its v2.7 trigger conditions.

3. **§"Re-attempt Prerequisites" for v2.7 master planning**
   (re-evaluate at Phase 12 entry): any v2.7 ENABLE_RETRY of
   CF-DOGFOOD-2 (i.e., a FIX_INLINE disposition) requires citing AT
   LEAST ONE of the following as MET:

   - (R-039.1) Decision 037 verdict (v2.6 SC-39 R-4 close) =
     ENABLE_RETRY OR a v2.7-equivalent SC-39 verdict that requires
     real dogfood telemetry as a load-bearing input.
   - (R-039.2) Community OSS launch is scheduled in the v2.7 master
     plan with `docs/dogfood-harness.md` as a critical-path
     deliverable (not a deferral candidate).
   - (R-039.3) An unrelated v2.6 or v2.7 substage modifies
     `scripts/dogfood/run-self-task.ts` (drift detection: `git log
     --since=v2.6-tag -- scripts/dogfood/run-self-task.ts` becomes
     non-empty). This trigger fires automatically at the unrelated
     substage's close.
   - (R-039.4) Multi-user adoption rollout in v2.7 master plan
     requires envelope schema (`packages/core/src/dogfood/envelope-schema.ts`)
     to evolve, in which case revisiting harness wiring at the same
     time becomes economic.
   - (R-039.5) Operator override: explicit user prompt requesting
     CF-DOGFOOD-2 closure at v2.7 entry, irrespective of
     R-039.1..R-039.4.

   If NONE of R-039.1..R-039.5 holds at v2.7 entry, this decision
   self-extends to **DEFER-V2.8** by the same rationale shape.
   Decision 033's pattern (Deliberation E) explicitly contemplates
   multi-cycle structural defer; CF-DOGFOOD-2 entering its 4th cycle
   (v2.3 → v2.4 → v2.5 → v2.6 → v2.7 candidate) is acceptable under
   the same pattern.

4. **Charter-coherence**: This deferral does NOT violate any
   charter principle, invariant, or prior decision:

   | Citation | Impact |
   |---|---|
   | Principle 1 (Daemon-Dumb) | UNCHANGED — harness remains deterministic glue in stub form. |
   | Principle 5 (CLI subprocess) | UNCHANGED — wiring not added; existing CLI-subprocess paths in SessionManager untouched. |
   | Principle 7 (Observability) | UNCHANGED — stub trace continues to emit `dispatch_deferred_to:'8.5.3'`. (No new field; defer label stays the same string for citation continuity.) |
   | Principle 8 (Reusable without forking) | UNCHANGED — harness remains generic. |
   | I-6 ABSOLUTE (Decision 020) | UNCHANGED — no commits in 11.3. |
   | Decision 027 §C-8 (scaffold-now-execute-later) | EXPLICITLY ALIGNED. |
   | Decision 033 (Deliberation E structural-defer pattern) | EXPLICITLY INHERITED. |
   | Decision 034 / 035 (SC-39 DEFER-V2.5 / DEFER-V2.6) | NEUTRAL — CF-DOGFOOD-2 is not on the SC-39 prerequisite list. |
   | Decision 036 (v2.4-v2.5 bundled commit) | UNCHANGED. |
   | 8.5.1 §1.2 non-goal 1 (no master restart) | UNCHANGED. |
   | 8.5.1 §6 SC-44 (≥2 dogfood traces) | UNCHANGED — stub-emitted lightweight traces continue to satisfy the gate. |

5. **Drift-watch obligation (R-039.3 automation)**: any v2.6 or v2.7
   substage that modifies `scripts/dogfood/run-self-task.ts` MUST cite
   this decision and either:
   (a) bring the disposition forward (i.e., FIX_INLINE within the
       modifying substage's budget), OR
   (b) explicitly re-affirm DEFER with cited rationale.
   This is automated by `scripts/audit/charter-coherence-spot-check.sh`
   at v2.7 entry: spot-check should grep for changes to the harness
   file since this decision's date and surface them for re-evaluation.

6. **Phase 11 11.3 acceptance gate satisfied**: per
   `agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md
   §11.3 acceptance_gate` — "Decision 039 authored with explicit verdict
   (FIX_INLINE / DEFER-V2.7 / WONT_FIX); IF DEFER-V2.7: decision-doc cites
   v2.7 trigger conditions". This decision authors verdict DEFER-V2.7 and
   cites trigger conditions in §4.3 above. Sandwich-architect
   verdict-of-record is binding via §2 above; no separate review
   substage is required (per task envelope, spec-compliance reviewer
   pair fires "ONLY if FIX_INLINE chosen").

---

## §5 Citations

- `agent-workspace/constitution/cf-dogfood-2-assessment.md` (Phase 10 §10.3
  architectural assessment, 516 LOC, 5 options surveyed, recommendation
  DEFER-V2.6 with §4.2 trigger conditions). This decision inherits and
  re-applies the §4.2 trigger conditions with v2.6 → v2.7 substitution.
- `agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md`
  §11.3 (Phase 11 substage envelope; this decision is its disposition
  output).
- `scripts/dogfood/run-self-task.ts:387` (the structural stub:
  `dispatch_deferred_to: '8.5.3'`; remains in place per §4.1).
- `tests/dogfood/run-self-task.spec.ts` (T1–T11 unit tests covering the
  stub path; remains unchanged).
- `packages/core/src/domain/types/runtime.ts` (IAgentRuntime contract,
  five-method surface; mature and stable since Phase 6.3 / Decision 018).
- `packages/core/src/modules/sessions/agent-runtime.token.ts`
  (`IAGENT_RUNTIME` injection token; wired in SessionsModule).
- `packages/core/src/dogfood/envelope-schema.ts` (envelope schema;
  unchanged since 8.5.2).
- `agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md`
  §"Consequences" 8 (scaffold-now-execute-later; binding through v2.6+).
- `agent-workspace/memory/decisions/033-sc39-narrow-gate-supersession.md`
  §"Deliberation E" (structural-defer pattern; this decision inherits
  the pattern).
- `agent-workspace/memory/decisions/034-sc39-defer-v2.5.md` and
  `agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md`
  (SC-39 verdict chain; Decision 035's DEFER-V2.6 verdict means
  CF-DOGFOOD-2 v2.6 trigger #1 from assessment §4.2 does NOT fire, the
  dominant factor for this disposition).
- `agent-workspace/memory/decisions/032-effort-routing.md` (this
  decision authored at opus/medium per task-envelope D2 justification:
  cross-references Decision 027 §C-8 + Decision 033 Deliberation E +
  structural-gap class).
- `agent-workspace/memory/carryforwards-v2.6.md` (updated to mark
  CF-DOGFOOD-2 disposition BOUND).
- `agent-workspace/memory/carryforwards-v2.7.md` (created with
  CF-DOGFOOD-2 carried forward + R-039.1..R-039.5 trigger conditions).

---

**END Decision 039 — CF-DOGFOOD-2 Disposition v2.6 = DEFER-V2.7.**
