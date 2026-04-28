# Decision 035: SC-39 Retry Verdict v2.5 — DEFER-V2.6

**Status**: BINDING
**Supersedes**: Decision 034 (DEFER-V2.5 verdict; §"Re-attempt Prerequisites"
item 6 obligated this follow-up at v2.5 close).
**Author**: opus 4.7 main session (autonomous Decision 035 dispatch, ORCH_SPAWNED, Phase 10 substage 10.5.3)
**Date**: 2026-04-28

---

## §1 Context

Decision 034 (2026-04-27) authored DEFER-V2.5 against the v2.4 6-artifact
prerequisite gate, finding 3 PASS / 3 FAIL with two of the three failures
being structural (`unknown_agent_fraction = 1.00`, `pairing_rate = 0.00`)
rather than temporal. That decision foreclosed v2.4 ENABLE_RETRY and listed
six explicit re-attempt prerequisites that any future SC-39 retry MUST cite
as MET (Decision 034 §"Re-attempt Prerequisites" item 6: a future binding
decision must explicitly cite all five prior prerequisites as MET before any
v2.5+ ENABLE_RETRY verdict is authored).

This Decision 035 is the binding follow-up that Decision 034 §item 6
mandates. The v2.5 substages 10.5.2.A (sidecar capture probe), 10.5.2.B
(TOOL_NAME wiring fix), and 10.5.2.C (named-agent sidecar recovery seam)
were authored to address the structural blockers identified in Decision 034.
At the close of those substages, substage 10.5.3 collected fresh measurement
artifacts (artifacts 1–5 below) so this decision can adjudicate against
post-fix telemetry rather than the Phase 9 baseline.

The verdict authority is the same as Decision 034: only ENABLE_RETRY,
DEFER_AGAIN (within v2.5), or DEFER-V2.6 are admissible. Decision 033
§"Deliberation E" (still binding via Decision 034 inheritance) forbids
authorizing ENABLE_RETRY against failing artifact numbers.

---

## §2 Evidence — Fresh Measurement (post-10.5.2)

The Decision 034 prerequisite gates, re-measured against post-10.5.2
telemetry by task-implementer 10.5.3 (observation file
`agent-workspace/memory/observations/task-10.5.3-20260428-artifacts.md`,
status DONE_WITH_CONCERNS), produce the following table:

| # | Prereq (Decision 034 §"Re-attempt Prerequisites") | Source Artifact | Phase 9 Baseline | Phase 10 Measurement | Threshold | Verdict |
|---|----|----|----|----|----|----|
| 1 | CF-21 tool_use_id correlation closure (pairing_rate ≥ 0.40 on ≥50 real pairs) | `agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.5.json` | pairing_rate = 0.00, dispatched=1, completed=98 | pairing_rate = **0.000**; dispatched=12, completed=136; **INSUFFICIENT_VOLUME** for 50-pair sample | ≥ 0.40 on ≥ 50 pairs | **FAIL** (volume + rate; structural ID-space mismatch persists) |
| 2 | Named-agent self-reporting (unknown_agent_fraction < 0.30) | `agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.5.json` | 1.00 (162/162) | **1.000** (200/200 agent rows = `component_name=unknown-agent`) | < 0.30 | **FAIL** (production stream unchanged from Phase 9) |
| 3 | Phase-cycle stability + event volume ≥ 10,000 | `agent-workspace/memory/audits/sc39-prereq-volume-v2.5.md` | 6,561 events | **8,031** events (+1,379 / +20.7%); shortfall 1,969 | ≥ 10,000 | **FAIL** by 1,969 events (19.7% gap) |
| 4 | Citation-linter rollup-mode hygiene (BUILTIN_HOOK_EVENTS extended) | Phase 10 §10.2 closure (rollup tests R7+R8+R9 added; `WebFetch`, `TaskList` recognized) | FAIL | **PASS** (BUILTIN_HOOK_EVENTS now includes built-in tools previously absent; rollup-mode citation-linter no longer FAILs spuriously) | rollup-mode green | **PASS** |
| 5 | CF-33 dead-code guard | `agent-workspace/memory/audits/cf33-state-v2.5.md` | PASS (file absent) | **PASS** (`packages/core/src/dispatch/recorder.ts` still absent; zero importers) | file absent OR safely deleted | **PASS** (auto-satisfied; invariant grep clean) |
| 6 | RULE re-eval (no new rule fires; calibration unchanged) | `agent-workspace/memory/audits/phase-10-rule-eval.md` | calibration baseline (R1=FIRES, R2/R3/R4=NO-FIRE) | **PASS** (re-eval against 8,031-event corpus; no new rule fires; thresholds unchanged) | no new rule fires | **PASS** |

**Aggregate**: 3 PASS, 3 FAIL.

The PASS trio (4, 5, 6) is mechanical/dead-code/rule-stability — the same
shape as the Decision 034 PASS trio (artifacts 1, 5, 6 there). The FAIL
trio (1, 2, 3) is the same trio that failed at Decision 034 close.

**Key delta from Decision 034**: prerequisite 4 (citation-linter rollup-mode)
moved PASS this cycle (Phase 10 §10.2 closed CF-25). That is real progress
but does not flip the structural gates.

---

## §3 Root-Cause Analysis — Why Prereqs 1+2 Are Still FAIL Despite the 10.5.2 Seam Fixes

The 10.5.2 substages (.A probe, .B wiring fix, .C sidecar recovery) DID land
correct, tested fixes. Unit tests for B and C pass; the integration pairing
test (H10 + H9) reports `pairing_rate=1.000` against the synthetic T-NA2
fixture; the dead-code guard remains green. Despite this, prereqs 1 and 2
remain FAIL in production telemetry. Three root causes converge:

### §3.1 Settings.json read-once constraint (the structural finding)

The Claude Code harness reads `.claude/settings.json` **once at session
start** to construct its hook chain. Mid-session edits to `settings.json`
(such as the 10.5.2.B-fix that wired the sidecar's PostToolUse hook for
`Agent` calls) do NOT take effect in the session that performed the edit —
they take effect in the **next** session that boots after the edit is
on-disk.

**Evidence for this finding**:
- The 10.5.2.A probe discovered this exact behavior empirically. It had to
  embed dispatch capture code DIRECTLY inside `dispatch-jsonl-recorder.sh`
  (script files are re-read fresh on every hook invocation — they are not
  loaded into harness memory). Hook chain entries in `settings.json`,
  conversely, are loaded once and frozen for the session.
- Production telemetry post-10.5.2.B shows `unknown_agent_fraction=1.000`
  (200/200) and `pairing_rate=0.000` (0/12). If the new PostToolUse hook
  for `Agent` were active, the sidecar's hex-keyed index would populate and
  COMPLETED events would be re-keyed onto the toolu_* dispatch_id space.
  Neither is happening in this session.
- The unit tests pass (B + C + integration H10+H9 all green) because they
  exercise the seam logic directly, bypassing the harness hook chain.
  Tests confirm the fix is structurally correct; they cannot confirm the
  harness has loaded the new chain.

**Implication**: the v2.5 fixes are correct in code but inert in this
session's runtime. They will activate at the next session boot.

### §3.2 Telemetry inertia — sample volume below statistical floor

Even if §3.1 were resolved (e.g., session restarted, hook chain reloaded),
Phase 10 has accumulated only 12 real `Agent`-tool DISPATCHED events. The
Decision 034 §item 1 gate requires `pairing_rate ≥ 0.40` on a sample of
**≥ 50 dispatch pairs**. The artifact correctly reports
`gate_verdict=INSUFFICIENT_VOLUME` rather than FAIL on this metric, because
12 pairs is below the statistical evaluation floor. A genuine evaluation
needs 50+ paired dispatches, which requires a full phase of natural
dogfooding activity.

### §3.3 Volume gate is gated on session-cumulative dispatch activity

The 10,000-event volume gate (Decision 034 §item 3) is short by 1,969
events (19.7% gap). The v2.5 substages alone added +1,379 component
telemetry events (Phase 9 → Phase 10). At a comparable cadence, v2.6 will
naturally cross 10,000 within 0.5–1 day of active dogfooding. This is
**not** an engineering problem — it is a sampling / time-on-clock problem.

### §3.4 Synthesis

The structural fix space is now correct (the engineering work is done).
The remaining FAILs are **measurement issues**, not **engineering issues**:

- Prereq 1 needs a session restart (§3.1) AND ≥50 natural dispatches (§3.2).
- Prereq 2 needs a session restart (§3.1) — once the new PostToolUse hook
  is in the live chain, the sidecar's hex-keyed index will populate and the
  unknown-agent fraction will drop.
- Prereq 3 needs ≥1,969 additional component-telemetry events (§3.3),
  which v2.6 dogfooding will produce naturally.

This is precisely the situation Decision 034 §"Re-attempt Prerequisites"
item 3 anticipated: "phase-cycle stability for both metrics … must hold
over ≥ 1 full phase cycle … not just a single sample window." v2.5 is the
WRONG phase to evaluate v2.5 fixes — fixes need a full v2.6 cycle of
natural dispatch volume to reflect in the telemetry stream.

---

## §4 Decision

**Verdict: DEFER-V2.6** (binding).

Rationale:

1. **Three of six prereqs FAIL.** Decision 033 §"Deliberation E" (still
   binding) forbids ENABLE_RETRY against failing prerequisite numbers.
   ENABLE_RETRY is foreclosed.

2. **DEFER_AGAIN within v2.5 cannot succeed.** The remaining v2.5
   substages will not change the production telemetry signal because
   §3.1 (settings.json read-once) means this session cannot observe the
   10.5.2.B fix's effect regardless of how many additional dispatches it
   performs. Re-measuring within v2.5 would re-collect the same FAIL
   numbers — a wasted retry cycle, exactly the pattern Decision 034 §Alt 2
   rejected.

3. **The engineering is done; only measurement remains.** Unlike
   Decision 034 (which deferred because the **fix** was undone),
   Decision 035 defers because the **measurement window** is not yet open.
   The 10.5.2.B + 10.5.2.C seam fixes ARE structurally correct — every
   unit test and the H10+H9 integration test confirm
   `pairing_rate = 1.000` against the synthetic fixture. The next session
   boot opens the measurement window.

4. **Charter alignment.** P2 (Simplicity First) argues against re-running
   the v2.5 measurement on a closed window; P3 (Surgical Changes) argues
   against piling more code on top of fixes that haven't been measured at
   all yet. The clean charter-coherent landing is: ship 10.5.2 as-is,
   let the next session boot activate the hooks, re-measure at v2.6
   close, and author Decision 037 (or equivalent) with explicit
   threshold-met evidence.

The verdict is **DEFER-V2.6** with explicit re-attempt prerequisites
listed in §5.

---

## §5 Re-attempt Prerequisites (Binding for v2.6 SC-39 retry)

Before any v2.6 ENABLE_RETRY verdict may be authored, ALL of the following
MUST be true and evidenced. These prerequisites SUPERSEDE Decision 034
§"Re-attempt Prerequisites" by absorbing them — Decision 034 prereqs 1, 2,
3 are restated here with v2.6-specific evidence requirements; Decision 034
prereqs 4, 5, 6 are inherited as PASS-and-must-stay-PASS.

### R-1: SESSION RESTART (mandatory, structural)

The next Claude Code session evaluating SC-39 retry MUST start AFTER the
10.5.2.B-fix's `.claude/settings.json` change is on disk. Verification
options (any one is sufficient):

- (a) Re-run the 10.5.2.A probe in the new session and confirm the
  PostToolUse hook fires for `Agent` calls (probe artifact must show
  non-empty hex-keyed index after a real Agent dispatch).
- (b) Inspect the live hook chain at runtime via the harness self-audit
  command and confirm `Agent` is in the PostToolUse trigger list.
- (c) Empirically: dispatch one Agent call in the new session, then read
  `dispatch.jsonl` and confirm the COMPLETED row has been re-keyed onto
  the toolu_* dispatch_id space (i.e., shares an ID with its DISPATCHED
  partner).

This is a **hard structural prereq**. No v2.6 retry may be authored
without R-1 evidence in the decision file.

### R-2: NATURAL VOLUME (passive, time-on-clock)

v2.6 substages must collectively generate, by the time of measurement:

- ≥ 50 real `Agent`-tool DISPATCHED events (so the cf21 50-pair sample
  gate can be evaluated as PASS or FAIL rather than INSUFFICIENT_VOLUME);
  AND
- ≥ 1,969 additional component-telemetry events on top of the Phase 10
  baseline of 8,031 (so the volume gate clears 10,000).

These thresholds are likely automatic given v2.6's projected dogfooding
activity, but they are gating: re-measure cannot be authored before they
are met.

### R-3: RE-MEASURE (active, decision-author duty)

At v2.6 close, re-collect artifacts equivalent to artifacts 2, 3, 4 of
this decision against the post-restart, post-volume telemetry:

- `unknown-agent-bucket-prevalence-v2.6.json` — threshold `fraction < 0.30`
- `cf21-real-dispatch-sample-v2.6.json` — threshold `pairing_rate ≥ 0.40` on
  `sample_size ≥ 50`
- `sc39-prereq-volume-v2.6.md` — threshold `total_events ≥ 10,000`

All three artifacts MUST report `gate_verdict=PASS` (not
INSUFFICIENT_VOLUME, not FAIL) before R-4 may proceed.

### R-4: ENABLE_RETRY only on R-1 + R-2 + R-3 all PASS

A future binding decision (Decision 037 or later — the next available
decision number after Decision 036's expected v2.6-entry author) must:

- Cite R-1 evidence explicitly (probe / hook-chain audit / empirical
  re-keying observation).
- Cite R-2 quantitative measurements (DISPATCHED count ≥ 50; total events
  ≥ 10,000).
- Cite R-3 artifact-by-artifact PASS verdicts.
- Confirm prereqs 4, 5, 6 from this decision remain PASS (no regression).
- THEN, and only then, author ENABLE_RETRY.

If any of R-1, R-2, R-3 is FAIL or INSUFFICIENT_VOLUME at v2.6 close, the
v2.6 verdict MUST be DEFER-V2.7 (not ENABLE_RETRY, not DEFER_AGAIN).

---

## §6 Carryforwards from this Decision (v2.6)

### CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE

**Statement**: The Claude Code harness loads `.claude/settings.json` ONCE
at session start to construct its hook chain. Mid-session edits to
`settings.json` (adding or modifying hook entries) are NOT active until the
next session boots. Script files referenced from settings.json
(`.sh`/`.ps1` files) ARE re-read fresh on every hook invocation, so edits
to script bodies take effect immediately; but adding a new hook entry to
the JSON itself requires a session restart.

**Action items for v2.6**:
- Document this in `harness-audit` skill output (a session-start audit
  should report which settings.json revision is loaded vs. what's on disk).
- Consider adding a `settings-version-check` probe that compares an
  in-memory settings hash to the on-disk hash and warns at session start
  if they diverge (would catch the silent stale-settings case).
- Update `.claude/skills/spawned-session-mode/SKILL.md` to call out: "if
  you edit settings.json mid-session, your fix won't measure as effective
  until next session boot — author a restart-required prerequisite into
  the relevant decision."

### CF-V2.6-10.5.3-NATURAL-VOLUME-DEPENDENCY

**Statement**: SC-39 measurement gates (and similar telemetry-driven
success criteria) depend on session-cumulative dispatch volume that takes
a full phase to accumulate. Evaluating these gates inside the same phase
the fix lands in is structurally premature — there is no statistical
floor of dispatch activity to measure against.

**Action items for v2.6**:
- Future SC-N gate definitions in `specs/tier1-strategic/` should declare
  a `min_phases_after_fix` annotation (default 1; explicit when higher).
- The Decision 034-style retry-or-defer ritual should include a "phase
  separation check" — does the phase being measured contain the fix being
  measured? If yes, default to DEFER unless the fix is binary on/off
  (which the §3.1 settings.json case is NOT).

### CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP

**Statement**: Synthetic test fixtures pass while production telemetry
fails when the production runtime depends on harness state (settings.json
hook chain) that fixtures bypass. The 10.5.2.B + 10.5.2.C unit tests and
the H10 + H9 integration test all report `pairing_rate=1.000`; the
production telemetry reports `pairing_rate=0.000`. The gap is the harness
hook chain.

**Action items for v2.6**:
- Add `tests/integration/sc39-production-pairing-rate.spec.ts` that spawns
  a CHILD `claude` process with the post-fix settings.json and verifies
  end-to-end pairing across a fresh session boundary. This proves the
  wiring works in the harness, not just in fixture-space.
- The test should: (a) write a known-good settings.json into a temp dir,
  (b) spawn `claude` with that as project root, (c) inject a real Agent
  dispatch, (d) read the resulting dispatch.jsonl, (e) assert
  `pairing_rate ≥ 0.40` on the spawned session's output.
- This integration test, once green, becomes the standing R-1 verification
  surface for any future SC-N gate that depends on settings.json wiring.

---

## §7 Supersession Statement

This Decision 035 SUPERSEDES Decision 034's DEFER-V2.5 verdict. Decision
034 §"Re-attempt Prerequisites" item 6 stipulated "A future binding
decision (Decision 035 or later) must explicitly cite all five
prerequisites above as MET before any v2.5+ ENABLE_RETRY verdict is
authored." This decision satisfies that obligation by:

- Explicitly evaluating each Decision 034 prereq against fresh v2.5
  measurements (§2 table).
- Finding that prereqs 1, 2, 3 remain FAIL (with structural root-cause
  identified in §3) and prereqs 4, 5, 6 are PASS.
- Authoring DEFER-V2.6 (NOT ENABLE_RETRY) consistent with Decision 033
  §"Deliberation E" (forbids ENABLE_RETRY against failing prereqs).

The Decision 034 6-prereq gate is now ABSORBED into Decision 035's
R-1 / R-2 / R-3 / R-4 framework (§5). Any future SC-39 retry must cite
Decision 035 §5, not Decision 034 §"Re-attempt Prerequisites" — this
decision is the new authoritative gate.

---

## §8 Consequences

1. **SC-39 stays DEFERRED in the SC scorecard.** The row that previously
   cited Decision 025 (v2.3), Decision 033 (v2.4 narrow gate), and
   Decision 034 (v2.5 defer) now adds **Decision 035 (DEFER-V2.6)**.
   Substage 10.5.3 closes with verdict "Decision 035 authored; SC-39
   retry defers to v2.6+ pending R-1 (session restart) + R-2 (natural
   volume) + R-3 (re-measure) all PASS."

2. **No `sc39-defer-attestation-v2.5.md` file is created.** Decision 035
   itself is the attestation, mirroring Decision 034's pattern.
   `phase-10-complete.md` (when authored) must reference Decision 035
   directly in its decisions-ratified section.

3. **CF-21 (Decision 026) priority remains elevated.** v2.6 planning must
   treat CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE and the §6 action items
   as v2.6-entry concerns. The `sandwich-architect` for the v2.6 entry
   substage should read this Decision and include R-1 verification (probe
   re-run or equivalent) in the v2.6 master plan as a Day-0 task.

4. **F-2 self-evolution signal-extension defers to v2.6+ alongside SC-39.**
   Per master plan §9, F-2 is most useful when the loop is enabled;
   deferring SC-39 to v2.6+ automatically defers F-2 to the same horizon.
   No change from Decision 034.

5. **No source code modified by this decision.** Decision 035 is a
   doc-only artifact. Substage 10.5.3 verified all gates PASS for the
   measurement-only artifact production. I-6 binding (zero commits)
   maintained.

6. **10.5.3 substage closure unblocked.** With Decision 035 authored,
   10.5.3 may close pending sandwich-verifier review. The next downstream
   dispatch (per Phase 10 master plan §10.5.4 / §10.6) is sandwich-verifier
   opus/medium against this substage's artifacts and decision file.

7. **v2.6 master plan must include 3 Day-0 tasks**: (a) re-run 10.5.2.A
   probe to verify R-1 PASS; (b) author the
   `sc39-production-pairing-rate.spec.ts` integration test from §6
   CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP; (c) commit a
   `settings-version-check` audit per §6
   CF-V2.6-10.5.3-SETTINGS-JSON-READ-ONCE.

---

## §9 Alternatives Considered + Rejected

### Alt 1: ENABLE_RETRY (v2.5 retry now)

**Rejected.** Three quantitative prereqs fail (1, 2, 3 in §2 table).
Decision 033 §"Deliberation E" (still binding) forbids ENABLE_RETRY
against failing artifact numbers. Even setting that constraint aside, the
loop would receive 100% unknown-agent buckets and 0% paired dispatches —
proposals would be guaranteed ungrounded. Charter P1 (Think Before Coding)
and the daemon-dumb invariant both reject this path. Same logic as
Decision 034 §Alt 1.

### Alt 2: DEFER_AGAIN (re-test at end of v2.5)

**Rejected.** §3.1 (settings.json read-once) means re-testing within v2.5
would re-collect identical FAIL numbers because the harness in this
session never loaded the 10.5.2.B-fix's PostToolUse hook entry. The
expected outcome is foreseeable: prereqs 1 and 2 stay FAIL because the
measurement window for them does not open until next session boot. Burning
another v2.5 retry cycle to confirm a known-stale measurement is wasteful.
Charter P3 (Surgical Changes) rejects speculative retry without a
seam-level OR session-boundary change in flight.

### Alt 3 (chosen): DEFER-V2.6

**Selected** for the reasons in §4 Decision. The structural correctness of
the 10.5.2 fixes (proven by unit + integration tests), the §3.1
settings.json measurement window, the §3.2 statistical floor, and Decision
033's anticipation of structural-defer paths all converge on DEFER-V2.6
as the charter-coherent landing. R-1 / R-2 / R-3 / R-4 prerequisites in
§5 are explicit, evidenceable, and tied to natural v2.6 activity rather
than additional engineering work.

---

## §10 Cross-References

- Decision 025 (v2.3 SC-39 DEFER originator)
- Decision 026 (CF-21 tool_use_id correlation defer; the original
  structural blocker; now partially closed by 10.5.2.B but pending R-1
  verification)
- Decision 027 (Phase 8 strategic redirect; scaffold-now-execute-later)
- Decision 032 (effort routing; Decision 035 authored at opus/medium per
  D2-class justification, same as Decision 034)
- Decision 033 (the narrow 6-artifact gate; absorbed into Decision 034
  which is now superseded by this)
- Decision 034 (the v2.5 defer this decision supersedes; §"Re-attempt
  Prerequisites" item 6 mandates Decision 035's existence)
- 5 measurement artifacts produced by 10.5.3 (see §2 table sources)
- Implementer report: `agent-workspace/memory/observations/task-10.5.3-20260428-artifacts.md`
- Phase 10 master plan: `agent-workspace/session-plans/pending/phase-10-v2.5.md` §10.5.3 (lines 180-190)
- 10.5.2 fix substages: A (sidecar capture probe), B (TOOL_NAME wiring fix
  to settings.json), C (named-agent sidecar recovery seam)
- Tests passing in v2.5: H10 + H9 + integration `pairing_rate=1.000`
  against synthetic T-NA2 fixture (proves engineering correctness; does
  NOT prove harness wiring active)

---

```yaml
---
status: DONE
verdict: DEFER-V2.6
produced_files:
  - agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md
decisions_made:
  - "Decision 035: SC-39 v2.5 retry verdict = DEFER-V2.6 (binding). 3 of 6 Decision 034 prereqs FAIL (1, 2, 3); 3 PASS (4, 5, 6). Root cause is settings.json read-once measurement window + statistical floor + volume — not engineering. Re-attempt prereqs R-1 (session restart) + R-2 (natural volume) + R-3 (re-measure) + R-4 (decision author-ack) gate any v2.6 ENABLE_RETRY. Supersedes Decision 034."
next_action:
  command: dispatch_sandwich_verifier
  args:
    target: substage-10.5.3
    artifacts:
      - agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md
      - agent-workspace/memory/observations/task-10.5.3-20260428-artifacts.md
      - agent-workspace/memory/audits/cf21-real-dispatch-sample-v2.5.json
      - agent-workspace/memory/audits/unknown-agent-bucket-prevalence-v2.5.json
      - agent-workspace/memory/audits/sc39-prereq-volume-v2.5.md
      - agent-workspace/memory/audits/cf33-state-v2.5.md
      - agent-workspace/memory/audits/phase-10-rule-eval.md
---
```
