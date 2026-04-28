# Decision 037: SC-39 Retry Verdict v2.6 — DEFER-V2.7

**Status**: BINDING
**Supersedes**: Decision 035 (DEFER-V2.6 verdict; §5 R-4 obligated this follow-up decision at v2.6 close).
**Author**: task-implementer (sonnet 4.6, spawned, Phase 11 substage 11.5.3, ORCH_SPAWNED=true)
**Effort routing**: opus/medium per master plan §11.5.3 / Decision 032 D2 (judgment-density high — R-4 spec explicitly requires a binding decision with explicit evidence citations; constitutes a precedent-setting DEFER-V2.7 verdict).
**Date**: 2026-04-28

---

## §1 Context

Decision 035 (2026-04-28) authored DEFER-V2.6 against the v2.5 post-fix telemetry,
finding that three quantitative prereqs (R-1 session-restart, R-2 natural volume, R-3
re-measure) were all unable to be satisfied in the v2.5 measurement window due to
settings.json read-once semantics and insufficient dispatch volume. Decision 035 §5
R-4 specified that a future binding decision — identified as Decision 037 — must cite
R-1/R-2/R-3 evidence explicitly before any v2.6 ENABLE_RETRY verdict may be authored.

This Decision 037 is the binding follow-up that Decision 035 §5 R-4 mandates. The v2.6
substages 11.5.1 (R-1 verification + test infrastructure architecture), 11.5.2 (IMPL:
R-1 probe Δ1, production integration test Δ2, audit script Δ3, skill update Δ4), and
reviewer pairs (spec-compliance-reviewer PASS_WITH_CONCERNS 14/14 gates; code-quality-
reviewer APPROVED_WITH_CONCERNS 6 CFs) were executed specifically to satisfy Decision
035 §5's prerequisite framework. This decision adjudicates the resulting evidence.

The verdict authority is the same as Decisions 033, 034, and 035: only ENABLE_RETRY or
DEFER_V2.7 are admissible at v2.6 close. DEFER_AGAIN within v2.6 is rejected a priori
— see §9 Alt 2.

---

## §2 Decision 035 §5 Prerequisite Framework — Re-Evaluation at v2.6 Close

Decision 035 §5 defined the R-1/R-2/R-3/R-4 gate framework as the authoritative
successor to Decision 034's six-prereq table. This decision evaluates each:

### §2.1 R-1: Session Restart (hard structural prereq)

**Decision 035 §5 R-1 requirement**: The v2.6 SC-39 retry evaluation session MUST start
AFTER the 10.5.2.B-fix's `.claude/settings.json` change is on disk. Verification via
option (c): "dispatch one Agent call in the new session, then read `dispatch.jsonl` and
confirm the COMPLETED row has been re-keyed onto the toolu_* dispatch_id space."

**Evidence**: Task-implementer 11.5.2 executed R-1 option (c) per Decision 035 §5 R-1
requirements and authored the observation artifact:

- **Artifact**: `agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md`
- **Probe scope**: dispatch.jsonl rows 155–169, session `0c566041-dcaa-4ba4-9607-6a9d41d4e6ba`

Sample DISPATCHED row (dispatch.jsonl line 159, verbatim):
```json
{"event":"DISPATCHED","dispatch_id":"toolu_01E9zE2egMTnLUCnnXWJKbrZ","agent_type":"sandwich-verifier","model":"opus","parent_session_id":"0c566041-dcaa-4ba4-9607-6a9d41d4e6ba","bg":true,"ts_ms":1777324518878,"outcome":null,"tokens_used":null,"tool_use_id":"toolu_01E9zE2egMTnLUCnnXWJKbrZ"}
```

Sample COMPLETED row (dispatch.jsonl line 160, verbatim):
```json
{"event":"COMPLETED","dispatch_id":"aaab70d6f388092e4","agent_type":"unknown-agent","model":"unknown","parent_session_id":"0c566041-dcaa-4ba4-9607-6a9d41d4e6ba","bg":true,"ts_ms":1777325205901,"outcome":"DONE","tokens_used":null,"tool_use_id":null}
```

**Field comparison**:

| Field | DISPATCHED (line 159) | COMPLETED (line 160) |
|---|---|---|
| `dispatch_id` | `"toolu_01E9zE2egMTnLUCnnXWJKbrZ"` (toolu_* prefix) | `"aaab70d6f388092e4"` (hex — NOT toolu_*) |
| `tool_use_id` | `"toolu_01E9zE2egMTnLUCnnXWJKbrZ"` | `null` |

**Observation verdict line** (probe artifact §"Verdict", verbatim):
> R-1 FAIL — dispatch_id is hex (no toulu_* prefix); PostToolUse-Agent re-keying NOT
> firing in this session's loaded chain

**Root cause confirmed by probe artifact §"Root Cause Analysis"**:

The PostToolUse-Agent branch in `dispatch-jsonl-recorder.sh` (lines 64–87) extracts
the hex agent ID from the Agent tool result text via the regex at line 33:

```javascript
const m = resultText.match(/agentId:\s*([a-f0-9]{10,20})/i);
```

This regex assumes Claude Code's Agent tool result text contains a field of the form
`agentId: <hex>`. Empirical observation proves this assumption is FALSE for real
Claude Code Agent tool responses: `RESULT_AGENT_ID` is empty, the guard at line 73
(`if [ -n "$HEX_ID" ]`) short-circuits, no hex-keyed sidecar entry is written, and
SubagentStop's COMPLETED writer finds no match — producing `tool_use_id: null` and
a raw hex `dispatch_id` on every COMPLETED row.

The production-vs-fixture gap is the specific failure mode: `tests/integration/
sc39-pairing-rate.spec.ts` manually injects `agentId: ${hexId}` into the fixture
tool result text. Real Claude Code Agent tool responses lack this field. The 10.5.2.B
fix is structurally correct code; the code's format-stability assumption about the
Agent tool result text is empirically falsified.

**Volume evidence** (probe artifact §"Volume Evidence"):
- Total DISPATCHED rows across all real sessions in dispatch.jsonl: 21
- Total COMPLETED rows: ~149, all with hex `dispatch_id`, all with `tool_use_id: null`
- Pairing rate: **0/21 = 0.000 (0%)**

**Spec-compliance-reviewer independent verification** (adversarial probe P1,
`task-11.5.2-20260428-spec-compliance.md` §"Adversarial Probe Results"):
> "Independently read dispatch.jsonl rows 155-170. Pattern: every DISPATCHED row has
> toolu_* dispatch_id; every COMPLETED row has hex dispatch_id + tool_use_id: null.
> 0 of 21 paired. Root cause verified at dispatch-jsonl-recorder.sh:30-36: regex
> /agentId/ against tool_response.content[0].text. Real Agent responses do not contain
> agentId field. Evidence is empirical telemetry."

**R-1 Verdict: FAIL**

This is not a session-restart failure — Phase 11 DID start from the v2.5 tag `92f50ec`
with the 10.5.2.B-fix on disk. R-1's FAIL is a deeper structural failure: the fix's
core mechanism (the PostToolUse-Agent regex) has an invalid format assumption. The session
restart that Decision 035 forecasted as necessary (§3.1 settings.json read-once) was
indeed completed — but it was insufficient, because the regex assumption was always wrong
at the format level. Decision 035 §3.1 identified the settings.json read-once constraint
as the measurement window problem; the v2.6 probe reveals that EVEN WITH the window open,
the mechanism fails on real traffic.

---

### §2.2 R-2: Natural Volume (passive, time-on-clock)

**Decision 035 §5 R-2 requirement**: v2.6 substages must produce ≥ 50 real Agent-tool
DISPATCHED events AND ≥ 1,969 additional component-telemetry events (clearing the
10,000-event threshold).

**Evidence available**: The Phase 11 mid-verify audit (`phase-11-mid-verify.md`) and
the dispatch.jsonl analysis show 21 real DISPATCHED rows as of the 11.5.2 IMPL probe.
R-2 requires ≥ 50 — the shortfall is 29 dispatches minimum.

**R-2 Verdict: INSUFFICIENT_VOLUME** (below the 50-dispatch statistical floor required
for pairing-rate evaluation).

**Materiality**: Given R-1 FAIL, R-2 measurement is MOOT for this verdict cycle. Even
if v2.6 generated 500 dispatches, all COMPLETED rows would have hex `dispatch_id` and
`tool_use_id: null` — a pairing rate of 0.00 regardless of volume. R-2 does not flip
the verdict. See §3.2 for synthesis.

---

### §2.3 R-3: Re-Measure (active, decision-author duty)

**Decision 035 §5 R-3 requirement**: Re-collect `unknown-agent-bucket-prevalence-v2.6.json`
(threshold: fraction < 0.30), `cf21-real-dispatch-sample-v2.6.json` (threshold:
pairing_rate ≥ 0.40 on sample_size ≥ 50), and `sc39-prereq-volume-v2.6.md` (threshold:
total_events ≥ 10,000), all reporting `gate_verdict=PASS`.

**Evidence**: R-3 artifacts were not produced by 11.5.2 IMPL. The master plan §11.5.2
noted these as measurement-phase artifacts; however, R-1 FAIL makes R-3 artifact
production redundant — the pairing_rate measurement would return 0.000 (empirically
confirmed by the 21-dispatch probe across 8+ session pairs), and unknown_agent_fraction
would remain 1.000 (all COMPLETED rows = unknown-agent with hex dispatch_id). Producing
these artifacts would confirm FAIL numbers rather than threshold-met numbers. The
decision not to produce them under R-1 FAIL is charter-coherent per P2 (Simplicity
First — no wasted measurement work) and P3 (Surgical Changes — R-3 production is only
warranted when the underlying mechanism is known-correct).

**R-3 Verdict: NOT COLLECTED (moot under R-1 FAIL)**

---

### §2.4 R-4: ENABLE_RETRY Only on R-1 + R-2 + R-3 All PASS

**Decision 035 §5 R-4**: "If any of R-1, R-2, R-3 is FAIL or INSUFFICIENT_VOLUME at
v2.6 close, the v2.6 verdict MUST be DEFER-V2.7 (not ENABLE_RETRY, not DEFER_AGAIN)."

**R-4 gate matrix**:

| Prereq | Verdict | Blocking? |
|---|---|---|
| R-1 (session restart + wiring live) | **FAIL** (root cause: regex format assumption empirically falsified) | YES |
| R-2 (≥ 50 dispatches; ≥ 10,000 events) | INSUFFICIENT_VOLUME (21/50 dispatches; volume moot) | YES (moot) |
| R-3 (re-measure artifacts all PASS) | NOT COLLECTED (moot under R-1 FAIL) | YES (moot) |
| Decision 034 prereqs 4–6 (inherited PASS from Decision 035) | PASS (citation-linter, CF-33, rule eval — no regression detected) | — |

**R-4 Verdict**: ENABLE_RETRY is FORECLOSED. Decision 035 §5 R-4 is explicit: any
FAIL in R-1, R-2, or R-3 mandates DEFER-V2.7.

---

## §3 Root-Cause Analysis — Why R-1 Is a Deeper Failure Than Decision 035 Anticipated

### §3.1 The Two-Level Failure Model

Decision 035 §3.1 identified the settings.json read-once constraint as the primary
structural blocker for R-1 in v2.5: "the 10.5.2.B fix's PostToolUse hook entry for
Agent is in this session's loaded hook chain — but only if R-1 holds (and R-1 has not
yet been empirically verified)." Decision 035 forecasted that with a session restart,
R-1 would be verifiable.

The v2.6 probe reveals a second, deeper level of failure that Decision 035 did not
anticipate:

**Level 1** (Decision 035 §3.1 — now RESOLVED by v2.6 session start): The PostToolUse-
Agent hook entry IS in the loaded hook chain. Phase 11 began from the v2.5 tag `92f50ec`.
The PreToolUse-Agent branch IS firing (evidence: 21 DISPATCHED rows with toolu_*
dispatch_ids in dispatch.jsonl rows 150+). The hook chain wiring is live.

**Level 2** (Decision 037 §2.1 — newly discovered in v2.6): The PostToolUse-Agent
branch IS firing but IS silently failing. The regex at `dispatch-jsonl-recorder.sh:33`:
```
/agentId:\s*([a-f0-9]{10,20})/i
```
does not match real Claude Code Agent tool result text because real Agent tool responses
do not contain the `agentId: <hex>` field that the 10.5.2.B fix assumed would be present.
`RESULT_AGENT_ID` is empty on every real invocation; `HEX_ID` is empty; the sidecar
hex-keyed index entry is never written; SubagentStop finds no match.

**The fix-tested-against-production gap**: This is the "production-vs-fixture gap"
that Decision 035 §6 CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP named. The fixture
test (`sc39-pairing-rate.spec.ts`) manually injects `agentId: ${hexId}` into the
tool result text — a field that Claude Code's actual Agent tool does not emit in any
format observed across 21+ real dispatches. The production-vs-fixture gap is now
empirically confirmed not merely as a hypothesis (Decision 035 §6) but as a root
cause (Decision 037 §2.1).

### §3.2 Why R-2 and R-3 Are Moot Under R-1 Fail (Avoids Wasted v2.7 Work)

A critical gate for this decision is establishing that R-2 and R-3 measurement is NOT
a worthwhile investment under R-1 FAIL. The reasoning:

- The SC-39 pairing mechanism is `dispatch_id` matching. A COMPLETED row's `dispatch_id`
  is set equal to `HEX_ID` (the hex agent ID from SubagentStop) when `MATCH` is empty
  (SubagentStop branch, lines 90–119 of `dispatch-jsonl-recorder.sh`).
- `MATCH` is empty because PostToolUse never wrote a hex-keyed sidecar entry.
- PostToolUse never wrote the entry because `RESULT_AGENT_ID` is always empty on real
  traffic.
- Therefore: regardless of session count, dispatch count, or event volume, ALL COMPLETED
  rows will have hex `dispatch_id` and `tool_use_id: null`. Pairing rate = 0.000.
  `unknown_agent_fraction` = 1.000.

Collecting R-2 volume metrics and R-3 measurement artifacts under these conditions
would produce: `pairing_rate=0.000`, `sample_size=<N>`, `gate_verdict=FAIL`. The
artifacts would be evidence of FAIL, not PASS. Per P2 (Simplicity First), producing
failure-confirming artifacts is wasteful. Per P3 (Surgical Changes), the correct
response to a root-cause identified FAIL is to fix the root cause, not to measure
around it.

**v2.7 implication**: R-2 and R-3 measurement artifacts should be produced ONLY in the
v2.7 phase AFTER the root cause (§3.1 Level 2, the regex format assumption) is
remediated by a fix that is empirically verified to produce non-zero `RESULT_AGENT_ID`
on real Agent tool responses.

### §3.3 Synthesis

The v2.6 probe has changed the nature of the problem:

- **Decision 034 (v2.4)**: Structural blockers — `unknown_agent_fraction=1.00`,
  `pairing_rate=0.00`, root cause unknown.
- **Decision 035 (v2.5)**: Engineering fix landed (10.5.2.B PostToolUse hook entry
  added); measurement window not yet open (settings.json read-once); deferred to v2.6.
- **Decision 037 (v2.6)**: Measurement window IS open (v2.6 session started post-fix).
  Root cause exposed: the 10.5.2.B fix's mechanism assumes an Agent tool result field
  (`agentId: <hex>`) that real Claude Code does not emit. The fix is structurally wired
  but functionally incorrect for real traffic.

This advances the understanding. v2.7's job is not "wait for more volume" — it is
"fix the agentId extraction mechanism."

---

## §4 Decision

**Verdict: DEFER-V2.7** (binding).

This Decision 037 SUPERSEDES Decision 035's DEFER-V2.6 verdict with BINDING DEFER-V2.7.

Rationale:

1. **R-1 FAIL.** The PostToolUse-Agent re-keying mechanism is non-functional on real
   Claude Code Agent tool responses. Decision 035 §5 R-4 is unambiguous: R-1 FAIL
   mandates DEFER-V2.7. This single gate closes the verdict — no further evaluation
   is required.

2. **ENABLE_RETRY is foreclosed.** Decision 033 §"Deliberation E" (still binding via
   Decision 034 → 035 inheritance chain) forbids ENABLE_RETRY against failing
   prerequisite numbers. R-1 is a failing prerequisite.

3. **DEFER_AGAIN within v2.6 cannot succeed.** Even if additional v2.6 substages
   dispatched 50+ Agent calls, all COMPLETED rows would record hex `dispatch_id` and
   `tool_use_id: null` — the same zero-pairing-rate outcome empirically confirmed by
   the 21-dispatch v2.6 probe. The root cause is not volume; it is the regex. See §9
   Alt 2 for formal rejection.

4. **The root cause is now fully known.** Unlike Decision 034 (root cause: unclear
   structural blocker) and Decision 035 (root cause: measurement window not open), this
   decision has a concrete, falsifiable root cause: the `agentId` field assumed by line
   33 of `dispatch-jsonl-recorder.sh` does not exist in real Claude Code Agent tool
   result text. v2.7's fix path is engineeringly clear. See §5 for prereqs and §6 for
   candidate fix strategies.

5. **Charter alignment.** P1 (Think Before Coding) — the root cause is exposed; a fix
   must be designed before coding. P2 (Simplicity First) — DEFER-V2.7 avoids wasted
   R-2/R-3 measurement under a known-broken mechanism. P3 (Surgical Changes) — the
   fix must be scoped to the `agentId` extraction point; not a broader rewrite. P4
   (Goal-Driven Execution) — the v2.7 prereqs in §5 are falsifiable and specific.

---

## §5 Re-attempt Prerequisites (Binding for v2.7 SC-39 Retry)

Before any v2.7 ENABLE_RETRY verdict may be authored, ALL of the following MUST be
true and evidenced. These prerequisites SUPERSEDE Decision 035 §5 by absorbing them —
Decision 035 R-1 is restated here with v2.7-specific evidence requirements; Decision
035 R-2/R-3 are inherited with updated thresholds; Decision 034 prereqs 4–6 (absorbed
into Decision 035) must remain PASS.

### W-1: AGENTID EXTRACTION FIX (mandatory, structural — supersedes R-1)

The `dispatch-jsonl-recorder.sh` PostToolUse-Agent branch must be modified such that
`RESULT_AGENT_ID` is non-empty on at least one real Agent tool dispatch in a fresh
session. This requires a fix to either:

- (a) The regex at line 33 — updated to match Claude Code's actual Agent tool result
  text format (the actual format must first be empirically determined; see §6 candidate
  fix paths), OR
- (b) The extraction mechanism — pivot to a different hook event or payload field that
  reliably exposes the hex agent ID → tool_use_id mapping (see §6 candidates W-1-C
  and W-1-D).

**Verification requirement (any one sufficient)**:

- (V1a) Produce a dispatch.jsonl COMPLETED row where `dispatch_id` is a toolu_*
  string AND `tool_use_id` is the same toolu_* string (confirming re-keying fired).
  This is the R-1 option (c) probe pattern from Decision 035 §5 R-1; run it again
  in the v2.7 session after the fix lands.
- (V1b) Produce a PostToolUse-Agent hook invocation log showing `RESULT_AGENT_ID`
  is non-empty (via stderr/audit output of `dispatch-jsonl-recorder.sh`).

**This is a hard structural prereq.** No v2.7 ENABLE_RETRY may be authored without
W-1 evidence in the decision file.

### W-2: NATURAL VOLUME (inherits Decision 035 R-2 thresholds)

v2.7 substages must collectively generate, by the time of measurement:

- ≥ 50 real Agent-tool DISPATCHED events (so the cf21 50-pair sample gate can be
  evaluated as PASS or FAIL rather than INSUFFICIENT_VOLUME); AND
- sufficient component-telemetry events to bring the running total above 10,000.

**Note**: These thresholds will be naturally accumulated across v2.7 dogfooding
substages PROVIDED W-1 is fixed. Do not attempt W-2 measurement before W-1 is
confirmed via (V1a) or (V1b) — collecting W-2 volume under a broken mechanism
produces failure-confirming artifacts, not threshold-met artifacts (see §3.2).

### W-3: RE-MEASURE (inherits Decision 035 R-3; v2.7-specific artifact names)

At v2.7 close, re-collect artifacts with v2.7-suffix filenames:

- `unknown-agent-bucket-prevalence-v2.7.json` — threshold `fraction < 0.30`
- `cf21-real-dispatch-sample-v2.7.json` — threshold `pairing_rate ≥ 0.40` on
  `sample_size ≥ 50`
- `sc39-prereq-volume-v2.7.md` — threshold `total_events ≥ 10,000`

All three must report `gate_verdict=PASS` (not INSUFFICIENT_VOLUME, not FAIL) before
W-4 may proceed.

### W-4: ENABLE_RETRY ONLY ON W-1 + W-2 + W-3 ALL PASS

A future binding decision (Decision 040 or later — the next available decision number
after any intervening decisions in Phase 12) must:

- Cite W-1 evidence explicitly (dispatch.jsonl COMPLETED row with toolu_* dispatch_id,
  OR PostToolUse stderr confirming non-empty RESULT_AGENT_ID).
- Cite W-2 quantitative measurements (DISPATCHED count ≥ 50; total events ≥ 10,000).
- Cite W-3 artifact-by-artifact PASS verdicts.
- Confirm Decision 034 inherited prereqs 4–6 remain PASS (citation-linter, CF-33
  guard, rule calibration — no regression).
- THEN, and only then, author ENABLE_RETRY.

If any of W-1, W-2, W-3 is FAIL or INSUFFICIENT_VOLUME at v2.7 close, the v2.7
verdict MUST be DEFER-V2.8 (not ENABLE_RETRY, not DEFER_AGAIN).

---

## §6 v2.7 Fix Path Candidates (Non-Binding — v2.7 Architect's Decision)

This section documents candidate approaches for remediating the W-1 root cause.
Decision 037 does NOT bind on any specific candidate — the v2.7 architect must choose
based on empirical discovery of what Claude Code's actual Agent tool result text
contains. These candidates are structured for the v2.7 architect's decision intake.

### Candidate W-1-A: Empirical Format Discovery + Updated Regex

**Approach**: In a fresh v2.7 session, add temporary logging to `dispatch-jsonl-recorder.sh`
PostToolUse-Agent branch to capture the raw `resultText` value (the full
`tool_response.content[0].text` content) for a real Agent dispatch. Inspect it to
determine Claude Code's actual format for the subagent correlation field (if any).
Update the regex at line 33 to match the real format.

**Pro**: Minimal code change; preserves the existing PostToolUse-Agent mechanism.
**Con**: Requires the raw result text to contain SOME correlation field. If Claude Code
does not emit any agent-id-correlating field in the tool result text, this candidate
fails unconditionally. Must discover empirically whether ANY such field exists.

**Risk**: If the result text format varies by Claude Code version, the regex will need
maintenance. Add a format-stability test (the failing `sc39-production-pairing-rate.spec.ts`
Case 1 becomes the regression surface once the fix is live).

**When to choose**: If empirical discovery shows Claude Code emits a parseable field in
the tool result text that can be correlated to the SubagentStop hex agent_id.

### Candidate W-1-B: Pivot to SubagentStop Correlation Without Sidecar

**Approach**: Abandon the two-phase (PreToolUse DISPATCH + PostToolUse sidecar +
SubagentStop re-key) architecture. Instead, persist the `tool_use_id` from
PreToolUse-Agent into a keyed file (e.g., `$MEMORY_DIR/.dispatch-toolu-${SESSION_ID}.jsonl`)
indexed by a stable non-hex key visible at SubagentStop time — specifically, the
`agent_id` field that IS available in the SubagentStop hook payload (confirmed by
`dispatch-jsonl-recorder.sh:90-119` which reads `$AGENT_ID` from the SubagentStop
payload). If SubagentStop payload exposes the same agent_id that PreToolUse can
anticipate, the two-key sidecar is unnecessary.

**Pro**: Eliminates the format-stability dependency on tool result text. The sidecar
key becomes `$AGENT_ID` from SubagentStop, which is stable across Claude Code versions.
**Con**: Requires determining what `AGENT_ID` value is available at PreToolUse time (if
any). The SubagentStop `$AGENT_ID` may not be predictable at PreToolUse — if Claude
Code assigns the hex agent ID only at spawn time (between PreToolUse and SubagentStop),
this pivot may not be possible without the PostToolUse extraction.

**When to choose**: If empirical testing shows the hex agent ID is stable and discoverable
at PreToolUse or immediately after (e.g., in a new hook event between PreToolUse and
SubagentStop).

### Candidate W-1-C: Use Background Dispatch ID from Agent Tool Result Differently

**Approach**: Examine whether the bg dispatch ID — the string returned by the `agent`
tool in its `tool_result` — carries a format that can be correlated to the SubagentStop
hex agent_id by a different means than regex on the text field. For example, if the
tool result JSON (not just `.content[0].text`) includes a structured field with agent
metadata, that field may be parseable without text-regex. Inspect
`tool_response.content[0]` as a full object (not just `.text`).

**Pro**: May discover a more robust correlation surface than text regex.
**Con**: Depends on Claude Code exposing a structured JSON field in the tool response
content — empirical discovery required.

**When to choose**: If W-1-A's text regex approach fails but the tool result object has
structured fields.

### Candidate W-1-D: Alternative Correlation Strategy (Session + Order)

**Approach**: If no explicit agent-id correlation field is discoverable, use session-
scoped FIFO correlation: PreToolUse-Agent enqueues the `tool_use_id` in a session-keyed
FIFO file; SubagentStop dequeues in order (FIFO). This assumes SubagentStop events fire
in the same order as PreToolUse events for a given session, which may hold for strictly
serialized dispatches but breaks for parallel dispatches (background subagents fire in
completion order, not dispatch order).

**Pro**: No dependency on Agent tool result text format.
**Con**: Order-dependent correlation is fragile for parallel dispatches (the common
case in Orch). High risk of mispairing.

**When to choose**: Only as a last resort if W-1-A, W-1-B, W-1-C all fail. Documents
as a known-imperfect fallback with explicit mispairing risk annotation.

### v2.7 Architect Guidance

The v2.7 architect for SC-39 should:

1. Run the W-1 empirical format discovery (W-1-A prerequisite) as the FIRST act of the
   SC-39 substage — before any code changes. Capture `tool_response.content[0].text`
   and `tool_response.content[0]` (full object) from a real Agent dispatch.
2. Based on the discovery, select W-1-A, W-1-B, or W-1-C. Bind on W-1-D only if all
   three higher-quality candidates are empirically infeasible.
3. Write the fix and verify (V1a) or (V1b) before proceeding to W-2/W-3 measurement.
4. The production integration test `tests/integration/sc39-production-pairing-rate.spec.ts`
   (Δ2 from 11.5.2 IMPL) is the standing regression surface. Its Case 1 (production-
   mode) is currently marked as expected-to-fail under R-1 FAIL. Once W-1 is fixed and
   (V1a) verified, Case 1 should PASS — update the JSDoc notice at spec.ts lines 25-28
   accordingly.

---

## §7 Code Quality Carryforwards from 11.5.2 — v2.7 Disposition

The code-quality-reviewer (11.5.2 review, `task-11.5.2-20260428-code-quality.md`)
raised 6 carryforward items. This section documents their v2.7 disposition and
clarifies the scope misclassification in CF-V2.6-11.5.2-OUT-OF-SCOPE-LINTER-REFACTOR.

### CF-V2.6-11.5.2-HASH-CRLF-UNSTABLE

**Location**: `scripts/audit/settings-version-check.sh:29-36, 53, 66`
**Description**: `sha256sum`/`shasum` output and `settings.json` file content may differ
in CRLF treatment between Windows (Git Bash) and Linux. No `tr -d '\r'` normalization
is applied to `CURRENT_HASH` (line 66), and `settings.json` on Windows with
`core.autocrlf=true` produces a different SHA-256 than the same file on Linux. This can
cause false FAIL verdicts when the baseline hash was captured on a different platform
than the audit run.
**Severity**: important (primary deployment is win32 per env context).
**v2.7 action**: Add `tr -d '\r'` pipe in `sha256_of_file()` on both the file content
and the stored hash retrieval. Test on Windows Git Bash with a CRLF settings.json. Add
to the settings-version-check test matrix.

### CF-V2.6-11.5.2-BASH-STRICT-MODE-INCOMPLETE

**Location**: `scripts/audit/settings-version-check.sh:18`
**Description**: `set -uo pipefail` is missing the `-e` flag. The `trap 'exit 0' ERR`
at line 19 is intended to suppress errors as a soft-fail guard, but without `set -e`,
the ERR trap only fires on `pipefail`-detected pipeline failures, not on individual
command failures (e.g., `sha256sum` returning exit 1). Error-suppression guarantee is
weaker than intended.
**Severity**: important (could silently corrupt comparison under edge conditions).
**v2.7 action**: Either (a) add `set -euo pipefail` and rely on the ERR trap for all
failures, confirming G8/G9 still pass; or (b) replace the ERR trap with explicit error
checks per command (more verbose but portable). Option (a) is preferred for consistency
with other Orch audit scripts.

### CF-V2.6-11.5.2-SKILL-LOC-CEILING-BREACH (RESOLVED ORCHESTRATOR-SIDE)

**Location**: `.claude/skills/spawned-session-mode/SKILL.md`
**Description**: Code-quality-reviewer reported body LOC = 173, exceeding the hard
ceiling of 150 for skill-discipline archetype (`config-style-lint.ts` LR-04). The
implementer added 29 LOC (the Δ4 "Settings.json edits don't take effect until next
session boot" section) to a prior body of ~145 LOC.
**Status**: RESOLVED ORCHESTRATOR-SIDE. The linter ceiling violation was addressed in
Phase 11 orchestrator-side as part of the `tools → allowed-tools` rename (11.4
mid-verify fix for CF-V2.6-LR02-LR19-CONTRACT-DRIFT). The `config-style-lint.ts`
ceiling for skill-discipline was updated from 150 to accommodate the SKILL.md growth
that was mandated by Decision 035 §6 action items. This was NOT a v2.7 carryforward
— it was resolved in-phase.
**v2.7 action**: NONE. The code-quality-reviewer's CF-V2.6-11.5.2-SKILL-LOC-CEILING-BREACH
is retired. If the linter ceiling fires again in v2.7 on this file, address at that time.

### CF-V2.6-11.5.2-OUT-OF-SCOPE-LINTER-REFACTOR (SCOPE MISCLASSIFICATION — NOT v2.7 CF)

**Location**: `scripts/audit/config-style-lint.{ts,spec.ts}` + `.claude/agents/*.md` +
`.claude/commands/*.md`
**Description**: Code-quality-reviewer flagged this as a P3 (surgical scope) violation
in task 11.5.2 — the implementer was observed to have modified `config-style-lint.ts`
and all agent/command files to flip `tools → allowed-tools`. This is NOT a v2.7
carryforward because the modification was NOT performed by the 11.5.2 implementer.
These changes were executed by the Phase 11 orchestrator-side mid-verify session
(Session #43/44) as part of the 11.4 mid-verify fix for CF-V2.6-LR02-LR19-CONTRACT-
DRIFT (the `tools:` → `allowed-tools:` rename required by Claude Code 5.2.7+ canonical
format). The changes were already in the working tree when the 11.5.2 implementer
session started. The code-quality-reviewer correctly observed the dirty working tree
but misattributed the authorship to 11.5.2.
**v2.7 action**: NONE. This CF is retired. The `tools → allowed-tools` rename is
complete. The code-quality-reviewer's future sweeps should baseline against the
post-rename state rather than flagging these changes as 11.5.2 scope creep.

### CF-V2.6-11.5.2-HASH-UNAVAILABLE-FALSE-PASS (nitpick)

**Location**: `scripts/audit/settings-version-check.sh:34-36`
**Description**: When neither `sha256sum` nor `shasum` is available, the function
returns the sentinel string `HASH_UNAVAILABLE`. If both `--init` and audit modes
produce this string, the string comparison succeeds, producing a false PASS verdict
when no hash was ever computed.
**Severity**: nitpick (sha256 unavailability is rare in any environment where the
script is useful; `sha256sum` is present in Git Bash on Windows).
**v2.7 action**: Change the unavailable-hash path to `exit 2` with a `[SKIP]` message
("sha256 tool not found — skipping hash comparison") rather than returning a sentinel
string that could false-pass. Low priority.

### CF-V2.6-11.5.2-POLL-LINES-TIMEOUT-FLAKE (nitpick)

**Location**: `tests/integration/sc39-production-pairing-rate.spec.ts:111`
**Description**: The `pollLines()` helper uses a 15-second timeout with 30ms polling
interval. On slow CI, bash background subshells may not complete within 15 seconds,
producing non-deterministic pass/fail.
**Severity**: nitpick (integration test; I-13 permits real timing; Cases 2+3 are
platform-skipped on Windows where the risk is highest).
**v2.7 action**: Consider increasing the timeout to 30 seconds or making it configurable
via `ORCH_SC39_POLL_TIMEOUT_MS` env var. Low priority until CI-on-Linux exercises
the full path.

---

## §8 Carryforward Update — v2.7

The following items are added to `agent-workspace/memory/carryforwards-v2.7.md`
as part of this decision's closure obligations:

### CF-V2.7-SC39-W1-AGENTID-EXTRACTION

**Source**: Decision 037 §2.1 (R-1 FAIL root cause) + §6 (candidate fix paths)
**Statement**: The SC-39 dispatch correlation mechanism (`dispatch-jsonl-recorder.sh`
PostToolUse-Agent branch) assumes Claude Code Agent tool result text contains an
`agentId: <hex>` field. This assumption is empirically falsified across 21+ real
Agent dispatches in Phase 11. The fix is unknown at this decision's authoring time
and requires empirical format discovery in v2.7 (see Decision 037 §6 candidates W-1-A
through W-1-D).
**Action items for v2.7**:
- Run empirical format discovery at v2.7 SC-39 substage start.
- Fix the extraction mechanism per the chosen candidate.
- Verify (V1a) or (V1b) before W-2/W-3 measurement.
- Update `sc39-production-pairing-rate.spec.ts` Case 1 JSDoc once (V1a) is confirmed.
**Gate**: W-1 in Decision 037 §5. Blocks ENABLE_RETRY.

### CF-V2.7-SC39-W2-NATURAL-VOLUME

**Source**: Decision 037 §2.2 (R-2 INSUFFICIENT_VOLUME)
**Statement**: SC-39 pairing-rate evaluation requires ≥ 50 real Agent-tool DISPATCHED
events and total component-telemetry ≥ 10,000. As of v2.6 close: 21 dispatches,
shortfall ~29. Volume gate is gated on W-1 fix (see CF-V2.7-SC39-W1).
**Action items for v2.7**: Natural dogfooding accumulation after W-1 fix; no
engineering action. Measure at v2.7 close substage.

### CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES

**Source**: Decision 037 §7 (CF-V2.6-11.5.2-HASH-CRLF-UNSTABLE + BASH-STRICT-MODE-
INCOMPLETE + HASH-UNAVAILABLE-FALSE-PASS)
**Statement**: Three quality issues in `scripts/audit/settings-version-check.sh`:
(a) CRLF normalization missing from hash comparison; (b) `set -e` missing from strict
mode; (c) HASH_UNAVAILABLE sentinel can produce false PASS.
**Action items for v2.7**: Fix all three in a single targeted task; re-run G8/G9 gates
to confirm no regression. Low-to-medium priority; does not block W-1.

---

## §9 Alternatives Considered + Rejected

### Alt 1: ENABLE_RETRY (v2.6 retry now)

**Rejected.** R-1 FAIL. Decision 033 §"Deliberation E" (still binding) forbids
ENABLE_RETRY against failing prerequisite numbers. The pairing rate is empirically
0.000 on 21 real dispatches — not a statistical artifact of low volume but a structural
failure of the `agentId` extraction mechanism. No amount of additional volume will
change the pairing rate while the extraction is broken. Same logic as Decision 034 §Alt 1
and Decision 035 §Alt 1; this decision adds the empirically-confirmed root cause.

### Alt 2: DEFER_AGAIN (re-test at end of v2.6)

**Rejected.** Decision 035 §5 R-4 is explicit: "If any of R-1, R-2, R-3 is FAIL or
INSUFFICIENT_VOLUME at v2.6 close, the v2.6 verdict MUST be DEFER-V2.7 (not
ENABLE_RETRY, not DEFER_AGAIN)." Even setting this explicit prohibition aside: re-testing
within v2.6 would re-collect the same 0.000 pairing rate because the root cause
(the regex format assumption) is a code-level failure, not a timing/volume failure.
No additional v2.6 substage can fix the regex without also verifying (V1a)/(V1b), at
which point the fix has been validated and the ENABLE_RETRY decision should await
W-2/W-3 measurement — i.e., it is a v2.7 activity by definition. Charter P3 (Surgical
Changes) rejects speculative retry without a concrete fix AND verification in hand.

### Alt 3 (chosen): DEFER-V2.7

**Selected** for the reasons in §4. R-1 FAIL is conclusive; the root cause is
precisely identified; the fix candidates (§6) are engineeringly clear; the W-1
through W-4 prereqs in §5 are falsifiable and specific. DEFER-V2.7 is the charter-
coherent landing that preserves the decision audit trail and sets the v2.7 architect
up for a clean, focused fix task.

---

## §10 Supersession Statement

This Decision 037 SUPERSEDES Decision 035's DEFER-V2.6 verdict. Decision 035 §5 R-4
stipulated: "A future binding decision (Decision 037 or later — the next available
decision number after Decision 036's expected v2.6-entry author) must cite R-1/R-2/R-3
evidence explicitly." This decision satisfies that obligation by:

- Citing R-1 evidence explicitly (probe artifact, dispatch.jsonl row verbatim, field
  comparison table, root cause identification at `dispatch-jsonl-recorder.sh:33`) in §2.1.
- Evaluating R-2 (INSUFFICIENT_VOLUME; 21/50 dispatches; moot under R-1 FAIL) in §2.2.
- Evaluating R-3 (NOT COLLECTED; moot under R-1 FAIL; reason documented per P2) in §2.3.
- Authoring DEFER-V2.7 (NOT ENABLE_RETRY) per Decision 035 §5 R-4's explicit mandate.

The Decision 035 R-1/R-2/R-3/R-4 gate framework is now ABSORBED into Decision 037's
W-1/W-2/W-3/W-4 framework (§5). Any future SC-39 retry must cite Decision 037 §5,
not Decision 035 §5 — this decision is the new authoritative gate.

---

## §11 Consequences

1. **SC-39 stays DEFERRED in the SC scorecard.** The row previously citing Decisions
   025 → 033 → 034 → 035 now adds **Decision 037 (DEFER-V2.7)**. Phase 11 closes with
   "Decision 037 authored; SC-39 retry defers to v2.7 pending W-1 (agentId extraction
   fix + verification) + W-2 (natural volume) + W-3 (re-measure) all PASS."

2. **CF-21 (Decision 026) priority remains elevated.** v2.7 planning must treat
   CF-V2.7-SC39-W1-AGENTID-EXTRACTION as a Day-0 task. The v2.7 master plan should
   include: (a) empirical format discovery at session start; (b) fix implementation;
   (c) (V1a)/(V1b) verification before any other SC-39 work proceeds.

3. **F-2 self-evolution signal-extension defers to v2.7+ alongside SC-39.** Per master
   plan §9 (Decision 035 §8.4 inheritance), F-2 is most useful when the loop is enabled;
   deferring SC-39 to v2.7 automatically defers F-2 to the same horizon.

4. **No source code modified by this decision.** Decision 037 is a doc-only artifact.
   I-6 binding (zero commits) maintained.

5. **11.5.3 substage closure unblocked.** With Decision 037 authored, 11.5.3 may close
   pending sandwich-verifier review. The next downstream dispatch (per Phase 11 master
   plan §11.5 sequencing) is sandwich-verifier opus/medium against the full 11.5
   substage outputs.

6. **`carryforwards-v2.7.md` updated.** Three new CF items appended (W-1, W-2, W-3-hash-
   fixes) per §8. The SKILL-LOC-CEILING-BREACH and OUT-OF-SCOPE-LINTER-REFACTOR CFs
   are retired (see §7).

7. **v2.7 master plan must include SC-39 Day-0 tasks**: (a) empirical Agent tool result
   format discovery; (b) select and implement W-1 fix candidate from §6; (c) run (V1a)
   or (V1b) verification; (d) proceed to W-2/W-3 measurement only after W-1 PASS.

---

## §12 Cross-References

- Decision 025 (v2.3 SC-39 DEFER originator)
- Decision 026 (CF-21 tool_use_id correlation defer; the original structural blocker)
- Decision 027 (Phase 8 strategic redirect; scaffold-now-execute-later)
- Decision 032 (effort routing; Decision 037 authored at opus/medium per D2 class)
- Decision 033 (narrow 6-artifact gate; §"Deliberation E" binding prohibit; absorbed
  into Decision 034 → 035 → 037 inheritance chain)
- Decision 034 (v2.4 DEFER-V2.5; absorbed into Decision 035)
- Decision 035 (v2.5 DEFER-V2.6; SUPERSEDED by this Decision 037)
- Decision 039 (CF-DOGFOOD-2 disposition; R-039.1 references Decision 037 verdict;
  DEFER-V2.7 means R-039.1 is NOT MET — CF-DOGFOOD-2 extends to DEFER-V2.8 unless
  R-039.2..R-039.5 hold at v2.7 entry)
- R-1 probe artifact: `agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md`
- Implementer report: `agent-workspace/memory/observations/task-11.5.2-20260428-impl.md`
- Spec compliance review: `agent-workspace/memory/observations/task-11.5.2-20260428-spec-compliance.md`
- Code quality review: `agent-workspace/memory/observations/task-11.5.2-20260428-code-quality.md`
- Architect spec: `agent-workspace/session-plans/pending/11.5-sc39-r1-r3-architect.md`
- Phase 11 master plan: `agent-workspace/session-plans/pending/phase-11-v2.6-carryforward-burndown.md`
- Dispatch recorder: `scripts/hooks/dispatch-jsonl-recorder.sh:33` (the failing regex)
- Production-vs-fixture test: `tests/integration/sc39-production-pairing-rate.spec.ts`
- Audit script: `scripts/audit/settings-version-check.sh`

---

```yaml
---
status: DONE
verdict: DEFER-V2.7
produced_files:
  - agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md
  - agent-workspace/memory/carryforwards-v2.7.md  # appended
decisions_made:
  - "Decision 037: SC-39 v2.6 retry verdict = DEFER-V2.7 (binding). R-1 FAIL — dispatch-jsonl-recorder.sh:33 regex /agentId/ does not match real Claude Code Agent tool result text (empirically confirmed, 21 real dispatches, 0 re-keyed). R-2 INSUFFICIENT_VOLUME (21/50 dispatches; moot under R-1 FAIL). R-3 NOT COLLECTED (moot). W-1/W-2/W-3/W-4 framework in §5 gates any v2.7 ENABLE_RETRY. Supersedes Decision 035. CF-V2.6-11.5.2-SKILL-LOC-CEILING-BREACH and OUT-OF-SCOPE-LINTER-REFACTOR retired. Three new v2.7 CFs appended to carryforwards-v2.7.md."
next_action:
  command: dispatch_sandwich_verifier
  args:
    target: substage-11.5
    model: opus
    effort: medium
    artifacts:
      - agent-workspace/session-plans/pending/11.5-sc39-r1-r3-architect.md
      - agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md
      - agent-workspace/memory/observations/task-11.5.2-20260428-impl.md
      - agent-workspace/memory/observations/task-11.5.2-20260428-spec-compliance.md
      - agent-workspace/memory/observations/task-11.5.2-20260428-code-quality.md
      - agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md
      - tests/integration/sc39-production-pairing-rate.spec.ts
      - scripts/audit/settings-version-check.sh
      - .claude/skills/spawned-session-mode/SKILL.md
---
```
