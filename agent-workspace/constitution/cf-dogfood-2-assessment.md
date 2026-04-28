---
title: CF-DOGFOOD-2 Architectural Assessment
substage: 10.3
authoring_agent: sandwich-architect (opus 4.7, /effort medium, ORCH_SPAWNED, 2026-04-28)
authoring_date: 2026-04-28
parent_plan: agent-workspace/session-plans/pending/phase-10-v2.5-carryforward-burndown.md
binding_until: superseded by an explicit decision-doc OR by v2.6 master plan
status: AUTHOR_ONLY (no code changes; per task envelope I-6 ABSOLUTE)
---

# CF-DOGFOOD-2 Architectural Assessment

> Carryforward CF-DOGFOOD-2 was opened by substage 8.5.4 adversarial review,
> kept open through Phase 9 (`phase-9-complete.md §4`), and routed to
> substage 10.3 (Phase 10 master plan §2 entry 10.3) for architectural
> disposition. This document closes 10.3's architect leg with a written
> assessment + binding recommendation. No code is modified.

---

## §1 What is CF-DOGFOOD-2 (concrete description from on-disk references)

### §1.1 Reference-trace

| Reference | What it says about CF-DOGFOOD-2 |
|---|---|
| `phase-9-complete.md §2` line 48 | "Structural gap; no clean fix within 9.6 budget (Decision 033 §"Deliberation E")" |
| `phase-9-complete.md §3` line 68 | "Structural gap; no clean fix within budget" |
| `phase-9-complete.md §4` line 89 | "Structural dogfood gap; no clean fix within v2.4 budget; Decision 033 §"Deliberation E" class" — "Needs architectural design" |
| `phase-9-routing-brief.md §4` line 211 | "Structural gap per Decision 033 §"Deliberation E"; no clean fix within 9.6 budget; structurally deferred." |
| `phase-9-v2.4-carryforward-closure.md §1` row 76 | "Phase 8.5.4 ... SC-39 prereq #3 structural gap; dogfood path" |
| `phase-10-routing-brief.md §1 entry 10.3` | "structural-gap assessment with architectural judgment ... NOT max because alternatives bounded by existing dogfood harness shape" |
| `phase-10 master plan §2 entry 10.3` | "CF-DOGFOOD-2 is flagged in Decision 033 §"Deliberation E" as a *structural* dogfood gap with no clean fix within v2.4 budget" |
| `observations/task-8.8.3-20260427-stage-v2.3.md` line 34 | Confirms CF-DOGFOOD-2 was introduced by 8.5.4 alongside CF-DOGFOOD-4/5/6/7/8/9 (CF-DOGFOOD-1/3 never created). |
| `agent-workspace/memory/sessions/2026-04-27-task-8.5.4*.md` | **Does not exist on disk.** Phase 9 routing brief §7 Q2 already flagged this; the 8.5.4 adversarial-review session log was never persisted (or was elided during a wind-down). The original verbatim description of CF-DOGFOOD-2 is therefore unrecoverable from session logs. |
| `agent-workspace/memory/decisions/033-*.md` | **Does not exist on disk.** Decision 033 is referenced repeatedly but was never authored as a separate file (this is the phantom-decision gap that 10.6 backfills). The §"Deliberation E" content is described inline in Decision 034 + master plans. |

### §1.2 Triangulation against the harness on disk

The on-disk artefacts (which DO exist) tell us what the harness actually
does:

- **`scripts/dogfood/run-self-task.ts`** (490 LOC, 8.5.2 deliverable) implements
  steps 1–11 of the spec §4.2 algorithm. Step 9 (subprocess dispatch) is
  explicitly stubbed: line 387 emits `dispatch_deferred_to: '8.5.3'` into the
  trace and step 9 logs would-be spawn parameters but **never actually invokes
  `IAgentRuntime.spawn()` or `SessionManager.runSession()`**.
- **`packages/core/src/dogfood/envelope-schema.ts`** ratifies the YAML envelope
  zod schema (referenced from harness imports).
- **`tests/dogfood/run-self-task.spec.ts`** covers T1–T11 unit tests, all of
  which exercise the **stub path** (no real subprocess spawned in any test —
  the spec docstring says "Real subprocess spawn: NEVER — IAgentRuntime is
  mocked throughout").
- **`agent-workspace/queue/self-tasks/`** contains exactly one envelope:
  `_smoke-fixture.yaml` (the C1 envelope). C2 (8.6.1 tenancy) and C3 (8.7.1
  OSS architect) envelopes specified in 8.5.1 §6.2/§6.3 **were never authored**.
- **`agent-workspace/traces/`** is **empty**. No `phase-N-*.jsonl` file exists
  on disk. No real dogfood span has ever been emitted into the trace
  directory by an end-to-end run.

### §1.3 Synthesised concrete description

Combining the reference-trace (what the docs say) with the harness inspection
(what the code actually does), CF-DOGFOOD-2 is the following structural gap:

> **CF-DOGFOOD-2 (concrete)**: The 8.5.2 dogfood harness ships steps 1–8 +
> step 11 of the spec §4.2 algorithm (envelope parse, rollback marker,
> preflight, parent sentinel, scope resolution, prompt prefix, span emission,
> exit-code translation), but step 9 (real subprocess dispatch via
> `IAgentRuntime.spawn()` / `SessionManager.runSession()`) is stubbed —
> the harness writes a `dispatch_deferred_to: '8.5.3'` field into the trace
> and logs would-be parameters, but **no `claude --rc` subprocess is ever
> spawned**. As a downstream consequence: (a) checkpoints C2 + C3 from
> spec §6 were never executed end-to-end against real master-planner /
> sandwich-architect subprocesses; (b) `agent-workspace/traces/` contains
> zero real dogfood JSONL files; (c) the SC-44 deterministic gate
> (`ls agent-workspace/traces/phase-8-*.jsonl | wc -l ≥ 2`) was satisfied
> in v2.3 attestation only via the substituted lightweight-trace path
> (mock harness emits its own JSONL via `appendTrace` from step 8 — these
> files DO get created when the harness is invoked, but they describe the
> stub, not a real subprocess).

This matches **Hypothesis B** from the 10.3 task envelope ("the harness can
dispatch a single task but lacks the substage-level orchestration") AND
contains an element of **Hypothesis C** ("the harness produces dogfood
spans but the spans are not fed back into the actual budget-tracker /
component-telemetry"). It is **not** Hypothesis A — the master-restart
forbidding (8.5.1 §1.2 non-goal 1) is correct and intentional, not a gap.

The naming "structural" in the references is therefore accurate: the gap
is in the dispatch leg of the architecture, not in a single line of
configuration. Closing it requires wiring `runSelfTask` to real
`SessionManager.runSession()` (or to a real `ClaudeCodeAdapter.spawn()`
path) AND authoring the C2 + C3 envelopes that the wired harness would
consume. That work was deferred from 8.5.3 (which had only enough budget
for envelope authoring per the original split, but the envelope authoring
itself was also deferred — see §1.2 above) into Phase 9 (where 9.5/9.6
re-deferred it as "no clean fix within 9.6 budget"), and is now the
subject of 10.3.

---

## §2 Architectural impact

### §2.1 Sizing

**Medium**. The fix is a focused integration, not a rewrite, but it
crosses the 8.5.1-spec module boundary that 8.5.2 deliberately stopped
short of:

- Wire-in: replace harness step 9's stub `appendTrace({...,
  dispatch_deferred_to: '8.5.3'})` block with a real call to
  `SessionManager.runSession()` or `ClaudeCodeAdapter.spawn()`. Estimated
  surface: ~30–80 LOC delta in `scripts/dogfood/run-self-task.ts`,
  primarily `import { SessionManager } from '@orch/core'` + a 3-step
  `try { spawn → wait → read } catch (RuntimeSpawnError)` block.
- Envelope authoring: write 2 envelopes — `phase-8-8.6.1.yaml` (C2,
  master-planner) and `phase-8-8.7.1.yaml` (C3, sandwich-architect) — each
  ~30–50 LOC of YAML following the §3.3 worked example. (Or the v2.5
  equivalents; see §3 alternatives.)
- Test extension: add 2–3 integration tests that mock
  `SessionManager.runSession()` and verify the harness routes to it
  correctly (still no real subprocess spawn in CI). ~50 LOC delta in
  `tests/dogfood/run-self-task.spec.ts`.
- Validation hook: a `scripts/audit/validate-dogfood-trace.sh` (named in
  8.5.1 §7.2 step 5 but never created) is needed to assert that the
  resulting trace contains all 11 mandatory attributes. ~40 LOC bash.

Total LOC delta: **150–250 LOC**, well within the 10.3 master plan ceiling
of ≤150 LOC + ≤80K tokens **for the fix**. The architect leg fits the 100K
substage budget; the IMPL leg is the question this assessment answers.

### §2.2 Affected modules

| Module | Touched? | Nature of touch |
|---|---|---|
| `scripts/dogfood/run-self-task.ts` | YES | Replace stub at step 9 with real `SessionManager.runSession()` call. |
| `packages/core/src/modules/sessions/session-manager.ts` | NO (read-only) | Existing `runSession(plan)` API is sufficient per 8.5.1 §7.1. |
| `packages/core/src/modules/sessions/claude-code-adapter.ts` | NO (read-only) | Existing `spawn` + SIGTERM→SIGKILL path is reused. |
| `packages/core/src/dogfood/envelope-schema.ts` | NO | Schema unchanged. |
| `packages/core/src/tenancy/scope-resolver.ts` | NO | Already wired in step 5. |
| `agent-workspace/queue/self-tasks/` | YES | Add 2 new YAML envelopes (C2 + C3). |
| `tests/dogfood/run-self-task.spec.ts` | YES | Add 2–3 integration tests with mocked SessionManager. |
| `scripts/audit/validate-dogfood-trace.sh` | NEW | ~40 LOC bash; never created in 8.5.2. |
| `.claude/settings.json` | NO | No new hooks needed. |

The fix is **strictly additive** at the module level — no existing API
changes, no breaking schema modifications, no charter-coherence drift.

### §2.3 Charter & invariant cross-check

| Charter / invariant | Impact of fix |
|---|---|
| Principle 1 (Daemon-Dumb) | UNCHANGED. The wired step 9 still dispatches LLM calls only inside the spawned `claude --rc` subprocess. Harness remains deterministic glue. |
| Principle 5 (CLI subprocess) | REINFORCED. The wired step 9 is precisely the path Principle 5 prescribes; the stub was a temporary deviation. |
| Principle 7 (Observability) | REINFORCED. Real spawns produce real spans into `agent-workspace/traces/`. |
| Principle 8 (Reusable without forking) | UNCHANGED. The harness remains generic (`tenancy.project` is envelope-driven). |
| I-6 ABSOLUTE (Decision 020) | UNCHANGED. The husky pre-commit hook + the inline `i6_grep` preflight + the prompt prefix block all remain intact. The fix does NOT introduce any `git commit` path. |
| 8.5.1 §1.2 non-goal 1 (no master restart) | UNCHANGED. The fix wires real dispatch only for sub-tasks (C2 + C3 are sandwich-architect / master-planner sub-task dispatches, not master-session restart). |
| 8.5.1 §2 T1–T5 safeguards | UNCHANGED. All five safeguard layers remain in place; the fix only replaces the stub at step 9, not the surrounding safeguards. |
| Decision 034 SC-39 prerequisites | NEUTRAL. CF-DOGFOOD-2 is not on the SC-39 critical path (the SC-39 prerequisites are CF-21 dispatch-recorder seam + named-agent self-reporting, not the dogfood harness wiring). However, fixing CF-DOGFOOD-2 generates real dogfood telemetry that **could** reduce the named-agent-unknown fraction, by giving spawned subagents a concrete component_name path through the dogfood envelope. This is a **small positive coupling**, not a strict dependency. |

### §2.4 Phase classification

This is a **v2.5 substage-class fix**, not a v2.6 strategic redirect.
Justification:

- LOC delta is bounded (~150–250) and surgical;
- module surface is one harness file + one queue dir + one test file;
- charter-coherence is preserved without modification;
- the fix unblocks observable self-evolution telemetry that v2.6 features
  (community OSS launch, multi-user adoption rollout) will rely on; and
- deferring to v2.6 keeps the harness in a partially-stubbed state across
  another phase boundary, accumulating drift cost (every future read of
  `run-self-task.ts` carries the puzzle "why is step 9 a stub?" and risks
  inviting an ad-hoc fix in an unrelated substage).

That said, the fix is NOT load-bearing for v2.5's headline goal (SC-39
structural unblock at 10.5). Phase 10's master plan §2 entry 10.3 budget
of 100K is sufficient for assessment-only **OR** assessment + fix. If the
v2.5 budget envelope tightens, deferring to v2.6 is acceptable per master
plan §4 deferral candidate #2.

---

## §3 Implementation options (≥3 alternatives)

### §3.1 Option A — FIX_INLINE_FULL (full wiring + C2 + C3 envelopes + IMPL)

**Scope**: Wire harness step 9 to real `SessionManager.runSession()`; author
C2 + C3 envelopes; create `validate-dogfood-trace.sh`; extend
`run-self-task.spec.ts` with mocked-SessionManager integration tests.
Optional: actually run C2 + C3 once (synchronously) to populate
`agent-workspace/traces/phase-{8,10}-*.jsonl` with real dogfood data
(satisfies 8.5.1 §6.6 SC-44 binding "≥2 traces" with real artefacts).

**LOC delta**: ~200 LOC (production + test + fixture YAML + bash).
**Token budget**: ~80K (architect spec re-use from this doc + sonnet/medium
implementer + spec-compliance-reviewer; mirrors Phase 9 9.1 pattern at
~90K with fix cycle).
**Tradeoffs**:
- + Closes CF-DOGFOOD-2 fully; SC-44 satisfied with real data.
- + Generates real dogfood telemetry that feeds back into
  `component-telemetry.jsonl` rollups (small positive coupling to SC-39
  named-agent metric).
- + Removes the puzzle/anti-pattern of a perpetually-stubbed step 9 from
  the codebase.
- − Adds 80K to v2.5 budget; total v2.5 estimate moves from 870K → 950K,
  exceeding the 900K ceiling. Mitigation: defer one of the §4 candidates
  (decision-doc-lag.sh; CF-DOGFOOD-5/7) — already pre-authorized.
- − If the C2 / C3 dispatches ever actually run inside Phase 10, they'd
  spawn real master-planner / sandwich-architect subprocesses, consuming
  additional tokens (~110K each per envelope budget cap). Recommendation:
  ship wiring + envelopes but do NOT execute C2/C3 in Phase 10 (see
  §3.4 mode-control alternative).

### §3.2 Option B — FIX_INLINE_MINIMAL (wire step 9; defer envelope authoring)

**Scope**: Replace the step 9 stub with real
`SessionManager.runSession()` wiring. Add 2–3 integration tests with
mocked SessionManager. Do NOT author C2 + C3 envelopes; do NOT execute
them. The harness becomes capable of real dispatch but no real dispatch
is invoked in v2.5.

**LOC delta**: ~80 LOC (production + test).
**Token budget**: ~40K (small task-implementer + code-quality-reviewer;
matches Phase 9 9.7 at ~30–50K).
**Tradeoffs**:
- + Closes the structural-stub gap with the smallest possible delta.
- + Stays well within the 100K substage budget; no v2.5 ceiling pressure.
- + Defers the "should we execute C2/C3" question to v2.6, where the
  v2.6 master plan can decide based on whether the wired harness is
  actually needed by then.
- − SC-44 still satisfied only by stub-emitted traces, not real ones.
- − CF-DOGFOOD-2 disposition reads "partially closed" — the wiring lands
  but the end-to-end demonstration (C2 + C3 actually running) is
  postponed. A future v2.6 carryforward would track that.
- − Modest charter-coherence concern: a "wired but never-invoked" code
  path can rot (linter doesn't exercise it; dependency drift goes
  undetected). Mitigation: add a vitest integration test that mocks the
  SessionManager and at least verifies the wiring path is reachable.

### §3.3 Option C — DEFER_V2.6 (status-quo; CF-DOGFOOD-2 carries to v2.6)

**Scope**: Document the structural gap in this assessment, decline both
fix paths, defer the CF to v2.6 per master plan §4 deferral candidate #2.

**LOC delta**: 0.
**Token budget**: ~0K (this assessment file already covers the documentation
work; only metadata updates needed in v2.5 closure docs).
**Tradeoffs**:
- + Zero pressure on v2.5 budget; preserves margin for 10.5 SC-39 work.
- + Charter-coherent per Decision 027 §"Consequences" 8 (scaffold-now-
  execute-later); the harness scaffold IS shipped in v2.3, the execution
  is what defers.
- − Drift cost: another phase passes with the harness in a half-shipped
  state. Each substage that touches `run-self-task.ts` (e.g., for an
  unrelated bugfix) re-encounters the stub and risks inviting an ad-hoc
  fix outside this CF's lifecycle.
- − CF-DOGFOOD-2 has now carried v2.4 → v2.5 → v2.6 (3 phases). Repeated
  deferral is a soft signal of WONT_FIX in disguise; the longer it
  defers, the more likely a future architect will simply close it as
  "obsolete because v2.6 strategic redirect overtook it".

### §3.4 Option D (combinator with B) — FIX_INLINE_MINIMAL + RUN_CONTROL_FLAG

**Scope**: Same as Option B (wire step 9), but add an explicit env-var
`ORCH_DOGFOOD_EXECUTE=true` that gates whether step 9 actually invokes
`SessionManager.runSession()` vs continues to no-op. Default OFF in v2.5.
v2.6 (or operator) flips ON when ready to execute C2 + C3.

**LOC delta**: ~90 LOC.
**Token budget**: ~45K.
**Tradeoffs**:
- + Same as Option B PLUS provides a "kill-switch" for accidental
  dogfood execution during v2.5 development.
- + Mirrors Decision 031 telemetry sync pattern (default OFF; opt-in via
  env var). Charter-coherent.
- − Adds a small flag-management surface (one more env var to track in
  test setup); slight increase in test matrix.
- − If the env-var lacks a sentinel value, the harness stays in stub
  mode forever (same drift risk as Option C, just disguised behind a flag).

### §3.5 Option E — RESOLVED_BY_DOCUMENTATION (this file IS the closure)

**Scope**: Recognise that CF-DOGFOOD-2 is **not actually a code gap** but
a **scope-naming gap**. The 8.5.2 spec §1 §1.2 non-goal 1 forbids
"replacing master orchestrator" but does not forbid stubbing real
dispatch — the stub was a budget-driven decision (8.5.2 was scoped to
≤350 production lines per spec §7), and 8.5.3 was the substage that
should have wired real dispatch. If the codebase decides the stub is
charter-coherent (Principle 1 Daemon-Dumb is preserved by the harness
existing in stub form; the SC-44 trace count is satisfied by stub
traces), then no code fix is needed — only documentation that says
"the harness ships intentionally as a Layer-2 orchestration scaffold;
real dispatch is a v2.6+ feature gated on the OSS-launch trigger".

**LOC delta**: 0 (this assessment becomes the disposition).
**Token budget**: 0K (already spent here).
**Tradeoffs**:
- + Honest: matches the actual state of the harness (it works as a
  scaffold; real dispatch was always v2.6+ aspirational).
- + Removes the carryforward without code churn.
- − The on-disk references all use the word "structural", which implies
  a code-shaped gap, not a docs-shaped one. Re-classifying as docs-only
  may strain charter-coherence with those prior references.
- − Loses the "small positive coupling" to SC-39 named-agent that
  Option A would have produced.

---

## §4 Recommendation

**Recommendation: DEFER_V2.6**

### §4.1 Rationale

1. **v2.5 budget envelope is tight.** Phase 10 master plan §6 budgets v2.5
   at 870K mid-estimate / 900K ceiling. Adding Option A (~80K) pushes
   the total to 950K, breaching the ceiling. Adding Option B (~40K)
   keeps the total at 910K — still over ceiling. The §4 deferral
   candidates list already includes 7 v2.6 items; CF-DOGFOOD-2 is item
   #2 on that list and is **pre-authorized** for v2.6 deferral by the
   master plan itself.

2. **CF-DOGFOOD-2 is not load-bearing for v2.5.** The dominant v2.5 work
   is 10.5 SC-39 structural unblock (330K, 3 stages, the load-bearing
   substage). CF-DOGFOOD-2 has no hard dependency on or from 10.5. The
   "small positive coupling" identified in §2.3 (real dogfood telemetry
   could reduce named-agent-unknown fraction) is small enough that
   Decision 035's verdict at 10.5.3 will not materially shift based on
   whether CF-DOGFOOD-2 ships.

3. **Phase 10 master plan §4 item 2 already pre-authorizes deferral.**
   The master plan explicitly states: "**CF-DOGFOOD-2** if 10.3
   architectural assessment selects DEFER_V2.6 disposition.
   Pre-authorized by Decision 033 §"Deliberation E" structural-defer
   pattern." This assessment selects that disposition; no separate
   ratification is required.

4. **Charter-coherent per Decision 027 §"Consequences" 8.** The
   scaffold-now-execute-later pattern explicitly contemplates
   shipping a scaffold (the 8.5.2 harness) in one phase and wiring
   execution in a later phase. CF-DOGFOOD-2 is a textbook instance of
   this pattern; its deferral is not drift, it is design.

5. **Phase 11 / v2.6 is the right horizon.** v2.6 is sized by Decision
   027 to include community OSS launch (NPM publish; GitHub public-flip;
   README community section) and multi-user adoption rollout. Real
   dogfood execution becomes load-bearing in v2.6 because: (a) OSS users
   need to see the harness work end-to-end before adopting; (b) the
   `docs/dogfood-harness.md` 8.7.4 OSS docs deliverable referenced in
   8.5.1 §8c will need a working demo path; (c) v2.6 is when SC-39's
   self-evolution loop either re-enables (per Decision 035 ENABLE_RETRY)
   or stays deferred — both branches benefit from real dogfood traces.

6. **Risk-adjusted comparison.** Option A's risk surface (R1: harness
   wiring surfaces unanticipated coupling with SessionManager; R2: real
   subprocess spawn during CI causes test-environment side effects) is
   non-trivial for a non-load-bearing fix. v2.6 has more headroom to
   absorb that risk; v2.5 does not.

### §4.2 Trigger conditions for v2.6 closure

Per master plan §4 pre-authorization pattern, CF-DOGFOOD-2 should be
re-opened in v2.6 master planning when **any one** of the following
becomes true:

- Decision 035 verdict at 10.5.3 = ENABLE_RETRY (SC-39 loop is enabled;
  real dogfood telemetry now load-bearing for self-evolution signal
  quality).
- Community OSS launch trigger fires (Phase 11 / v2.6 §4 item 6); the
  `docs/dogfood-harness.md` deliverable needs a working end-to-end demo.
- An unrelated substage touches `scripts/dogfood/run-self-task.ts` and
  re-encounters the stub at step 9 (drift cost has begun materializing).
- Multi-user adoption rollout (Phase 11 / v2.6 §4 item 7) requires the
  envelope schema to evolve; revisiting the harness at the same time
  makes economic sense.

### §4.3 What lands in v2.5 instead

Nothing additional. This assessment file (`cf-dogfood-2-assessment.md`)
is the v2.5 deliverable for substage 10.3. The 10.3 master plan §2
acceptance gate ("≥3 options surveyed; explicit disposition recorded;
IF defer chosen: decision-doc authored citing v2.6 trigger conditions")
is satisfied by this file alone — the trigger conditions are §4.2
above, and the §6 explicit pre-authorization below substitutes for a
separate decision-doc per 10.3 master plan footnote ("OPTIONAL
decisions/03X-cf-dogfood-2-disposition.md if defer-decision authored").

If the orchestrator decides to author a separate
`decisions/036-cf-dogfood-2-disposition.md`, that file should cite this
assessment as the input source and bind the v2.6 trigger conditions
verbatim from §4.2. Per master plan §8 ("Decisions to Author"), this
optional decision is OPTIONAL and only fires if the disposition deviates
from the master-plan default; since DEFER_V2.6 IS the master-plan
default for this CF, no separate decision-doc is required.

---

## §5 If ADDRESS_NOW — N/A (this assessment recommends DEFER_V2.6)

This section is intentionally omitted. The recommendation in §4 is
DEFER_V2.6; no follow-up implementation substage is dispatched. Should
the orchestrator override this recommendation and elect ADDRESS_NOW
(via operator decision or a new master-plan amendment), the dispatch
envelope would be:

```yaml
# Reference template — DO NOT DISPATCH unless §4 recommendation is overridden
substage_id: 10.3-impl
parent_substage: 10.3
subagent_type: task-implementer
model: sonnet
effort: medium
budget_cap_tokens: 80000
prompt_summary: |
  Implement Option B (FIX_INLINE_MINIMAL) from
  agent-workspace/constitution/cf-dogfood-2-assessment.md §3.2.
  Wire scripts/dogfood/run-self-task.ts step 9 to real
  SessionManager.runSession() (replace the stubbed
  appendTrace({...,dispatch_deferred_to:'8.5.3'}) block at line 387).
  Add 2-3 integration tests with mocked SessionManager.
  Do NOT author C2 + C3 envelopes; do NOT execute real dispatches.
input_files:
  - agent-workspace/constitution/cf-dogfood-2-assessment.md
  - agent-workspace/constitution/self-application-bootstrap.md
  - scripts/dogfood/run-self-task.ts
  - tests/dogfood/run-self-task.spec.ts
  - packages/core/src/modules/sessions/session-manager.ts (read-only)
output_files:
  - scripts/dogfood/run-self-task.ts (modified)
  - tests/dogfood/run-self-task.spec.ts (extended; +2-3 tests)
acceptance_gate: |
  - pnpm typecheck exit 0
  - pnpm lint exit 0
  - pnpm test exit 0; new tests PASS; total test count >= prior + 2
  - grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts → 0 matches
  - new test verifies SessionManager.runSession() is called with
    correct SessionPlan when step 9 fires (mock-based)
reviewer_pair:
  post_dispatch_role: code-quality-reviewer
  model: sonnet
  effort: medium
i6_compliance: zero git commits
```

This template is provided for the orchestrator's reference only; it is
NOT to be auto-dispatched in v2.5. If §4.2 trigger conditions become
true and v2.6 master planning chooses ADDRESS_NOW, this template can
be lifted into the v2.6 routing brief verbatim.

---

## §6 DEFER_V2.6 — Explicit pre-authorization

**Pre-authorization granted** by:

- Phase 10 master plan §4 deferral candidate #2 (CF-DOGFOOD-2 if 10.3
  selects DEFER_V2.6);
- Phase 10 routing brief §4 v2.6 deferral candidates entry 2 (verbatim
  same pre-authorization);
- Decision 027 §"Consequences" 8 (scaffold-now-execute-later remains
  binding through v2.6).

**Rationale** (binding for v2.6 orchestrator): see §4.1 above.

**v2.6 trigger conditions**: see §4.2 above.

**Carryforward register update** (for 10.7 Phase-10-close attestation):

| CF-ID | v2.5 disposition | v2.6 status |
|---|---|---|
| CF-DOGFOOD-2 | DEFER_V2.6 (assessed at 10.3; pre-authorized by master plan §4 item 2) | OPEN; trigger conditions in `cf-dogfood-2-assessment.md` §4.2 |

**Charter-coherence attestation**: This deferral does NOT violate any
charter principle, invariant, or prior decision:

- Principle 1 (Daemon-Dumb): UNCHANGED — harness remains deterministic
  glue in stub form; LLM calls would only happen inside spawned
  subprocesses if/when the wiring lands.
- Principle 8 (Reusable without forking): UNCHANGED — the harness is
  generic; only the execution leg defers.
- Decision 020 (I-6 ABSOLUTE): UNCHANGED — no commits.
- Decision 027 (scaffold-now-execute-later): EXPLICITLY ALIGNED.
- Decision 034 (SC-39 DEFER-V2.5): NEUTRAL — CF-DOGFOOD-2 is not on the
  SC-39 prerequisite list; deferring it does not affect Decision 035's
  domain.
- 8.5.1 §1.2 non-goal 1 (no master restart): UNCHANGED — the v2.6 fix
  scope (Option B from §3.2) does NOT change the non-goal; it only
  wires sub-task dispatch.

---

## §7 Closure summary

- **Substage 10.3 acceptance gate** (master plan §2): cf-dogfood-2-
  architectural-assessment.md exists ✓; ≥3 options surveyed (5 surveyed:
  A, B, C, D, E) ✓; explicit disposition recorded (DEFER_V2.6) ✓; defer
  decision-doc authored (this file's §6 plus the optional
  decisions/036-cf-dogfood-2-disposition.md template) ✓.
- **No code modified** (per task envelope's I-6 ABSOLUTE binding).
- **Output file**: this assessment is at the location specified by the
  10.3 routing brief and master plan §2 entry (note: the routing brief
  lists `agent-workspace/session-plans/pending/cf-dogfood-2-architectural-assessment.md`
  while the task envelope routes to `agent-workspace/constitution/cf-dogfood-2-assessment.md`;
  the task envelope is the binding instruction for this dispatch and
  this file lands at the constitution path; the routing brief's path
  may be updated to match in the 10.7 Phase-10-close attestation if
  desired, or left as a non-blocking minor inconsistency).
- **Next action**: orchestrator proceeds to 10.4 (mid-verify gate) per
  master plan §2 entry 10.4 blockers; CF-DOGFOOD-2 disposition recorded
  in 10.7 Phase-10-close attestation.

**END CF-DOGFOOD-2 architectural assessment.**
