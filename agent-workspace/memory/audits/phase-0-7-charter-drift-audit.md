# Phase 0-7 Charter Drift Retrospective Audit

> Synthesis of `phase-0-7-evidence-table.md` (substage 8.3.1, 80 rows + 16 SC
> spot-checks + 8 findings preview). Author: master-planner (opus 4.7,
> /effort max, ORCH_SPAWNED, 2026-04-27, /effort max). Ratification: this
> audit's findings drive 8.4 remediation backlog and inform v2.4 deferral
> list. Authority basis: Phase 8 master plan §3 substage 8.3.2 + §10 D-F
> (charter-drift safety threshold).

---

## §1 Executive Summary

**Headline verdict: PASS_WITH_CAVEAT.** Phases 0-7 were broadly faithful to the
PROJECT_CHARTER.md immutable contract. Across 80 (phase × principle) cells
the evidence table records **0 critical violations**, **0 high-severity drifts**,
and the daemon-dumb / project-agnostic / CLI-subprocess / adapter-abstraction
pillars (P1, P3, P5, P6) held PASS-or-better in every phase. Two cells
labeled `PASS_WITH_CAVEAT` (P6/Phase 1, P7/Phase 5, P7/Phase 7) and two
spot-check rows below `PASS` (N6 NOT_RUN; SC-27 PARTIAL) anchor the
medium-severity finding pool.

**Five medium findings are surfaced** (F-1..F-5) and **two low findings**
(F-6, F-7) — total 7 categorized findings, exceeding the SC-42 floor of 3.
The single highest-leverage finding is **F-1: charter success criterion N6
(72-hour stable RSS) was never empirically executed across seven phases of
work** — this is the only charter SC that has no PASS evidence anywhere in
the table and gates the v2.0 GA narrative. The second-highest is **F-2:
the self-evolution loop landed architecturally functional but signal-thin,
producing no real upgrade through Phase 7** — Charter §"Craft Philosophy"
and the implicit Phase 5+ self-application thesis depend on this loop
demonstrating a proposed change from its own telemetry. **F-3 (architect-
spec-vs-reality recurrence)** is the most procedurally instructive:
the project caught the pattern, shipped Mandates A-E in Phases 6-7, and the
pattern recurred in Phase 7 anyway, suggesting Mandate F (pre-IMPL `wc -l`
analog check) is the right next step.

**Recommended Phase 8 §3 routing**: 4 of 7 findings route into Phase 8
substage 8.4 (1 new task + 3 attach to existing 8.4.x); 2 route to v2.4
deferral with explicit rationale; 1 closes with NO_ACTION (editorial only).
Net additions to 8.4: 1 (8.4.7 net-new hooks already budgeted; F-1 N6 task
attaches there). **Phase 8 budget envelope unchanged.** The verdict is
therefore: project drifted on observability/measurement (F-1 + F-2 + F-4 +
F-5 = a coherent observability-completeness theme) but not on the
architectural-principle pillars. The remediation is one Phase 8 substage
plus an explicit v2.4 backlog, not a charter revision.

## §2 Methodology

### Inputs read

1. `agent-workspace/memory/audits/phase-0-7-evidence-table.md` (8.3.1
   output, 17.7KB, 80 evidence rows + 16 SC spot-check rows + 8 findings
   preview) — primary input.
2. `PROJECT_CHARTER.md` (immutable v1.0; vision, 10 principles, 22 SCs).
3. `agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md`
   §3 substage 8.3.2 spec, §10 D-F (severity → routing rule), §3 8.4
   substage map.
4. `agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md`
   (redirect authority + Option C ratification).
5. **Spot-check sample (5 rows validated against phase-N-complete artifacts)**:
   - `(P6, Phase 1)` SessionManager → ClaudeCodeAdapter soft-violation
     fix-D — confirmed in `phase-1-complete.md` lines 50-52 and 96+ (Fix
     D Major).
   - `(P7, Phase 5)` INV-S9 567ms median — confirmed in
     `phase-5-complete.md` line 52 retrospective + line 202 P0 candidate
     ranking.
   - `(P10, Phase 6)` self-evolution signal-thin — confirmed verbatim in
     `phase-6-complete.md` lines 314-319 (architecturally functional but
     signal-thin in its first pass).
   - `(P7, Phase 7)` SC-39 DEFERRED — confirmed in `phase-7-complete.md`
     §B SC-39 row + decisions/025 cite.
   - `(SC, Phase 7)` SC-14d / N6 72h — confirmed NOT_RUN at Phase 7 close
     (no `SC-14|72h|measure-rss` matches in `phase-7-complete.md`); user-
     action TODO carried since `phase-5-complete.md` line 51.
   - `(B.1, Phase 6)` architect-spec-vs-reality 7 incidents — confirmed at
     `phase-6-complete.md` line 172 ("recurred 6+ times") + line 267 §B.1
     header.

### Rating rubric

The 4-tier severity rubric is calibrated to charter-binding strength and
remediation cost, not to surface frequency:

- **critical**: a charter principle is outright violated and the violation
  is currently in the staged baseline. Remediation requires charter
  revision OR architectural change to the staged code. **Project shipping
  is BLOCKED** until resolved.
- **high**: a charter principle is compromised in ≥2 phases, or a single
  phase contains an active staged regression. Remediation requires an
  architectural change but the project can ship without it (degraded mode).
- **medium**: a charter principle drifted in 1-2 phases but is recoverable
  with targeted fix in 1-2 sessions; OR a charter SC has incomplete
  evidence (PARTIAL / NOT_RUN) and v2.0 GA narrative depends on it.
- **low**: editorial drift; doesn't affect functionality but should be
  cleaned up for code-coherence + future-team-readability.

**Tie-breaking rule** (per task-brief §"Constraints"): if a finding
hovers between `low` and `medium`, lean **medium**. Under-rating drift
costs more than over-rating it (charter erosion is path-dependent).

### Reference to evidence table column semantics

The evidence table uses two orthogonal labels per row:
- **Compliance**: `PASS | PASS_WITH_CAVEAT | DRIFT_LOW | DRIFT_MED |
  DRIFT_HIGH | UNCLEAR` — captures whether the row's evidence shows
  the principle was honored.
- **Confidence**: `HIGH | MED | LOW` — captures the implementer's
  certainty in the evidence-citation accuracy.

This audit weights `PASS_WITH_CAVEAT @ HIGH` rows as candidate findings
(the implementer found a soft-violation that was honestly disclosed) and
`PASS @ MED` rows as lower-priority candidates (implementer was less
certain — usually documentation-trail completeness, not principle drift).
80/80 rows are `PASS` or `PASS_WITH_CAVEAT`; **0 rows carry DRIFT labels**.
The findings emerge from cross-cell pattern analysis (e.g., the 7-incident
architect-spec-vs-reality recurrence appears as PASS in every individual
cell but as a meta-pattern across the §B.1 retrospective).

## §3 Per-Principle Compliance Trajectory (P1..P10)

### P1. Daemon is dumb, workers are smart

**Trajectory**: Established Phase 0 (`research/SYNTHESIS.md` D6 + D15 reject
AI-classify in tier 3); enforced phase-by-phase via the I-1 grep
(`grep @anthropic-ai/sdk packages/core/src/`). Phase 1 → 0 hits. Phase 2
SSE bridge = pure relay. Phase 3 HandoffOrchestratorService = `git diff +
session log + prompt render` (Decision 006 explicit "zero LLM calls").
Phase 4-7 maintained 0-hit grep; Phase 6 self-evolution loop landed
deliberately conservative ("no LLM added to daemon routing") per Decision
017. **Cumulative compliance**: PASS across all 8 phases.
**Evidence rows**: phase-0..7 P1 (8/8 PASS). **Risk**: principle held
through Phase 8 entry; no creeping LLM in daemon path. **No finding.**

### P2. Tight scope

**Trajectory**: Phase 0 produced explicit MUST/SHOULD/NICE/OUT-OF-SCOPE
matrix; Phase 5 retrospective explicitly states "Did NOT add agent
intelligence; loop-resilience + parallelization = mechanical work";
Phase 7 net production LOC ≤ 280 measured (phase-7-complete.md H P8).
**Cumulative compliance**: PASS. **Risk**: Phase 8 §1 SC-46 (community OSS
readiness with config layering, telemetry sync, ontology stub) introduces
new surface area within scope; the substage 8.7 budget caps + OOS list in
§2 of the master plan are the mitigation. **No finding for phases 0-7.**

### P3. Project-agnostic core, project-specific config

**Trajectory**: Phase 0 design (D4 globalThis.OrchContext singleton; no
project names in core); Phase 1 verified by `grep stockforge core/src/` =
empty; Phase 2 D21 ratified `@orch/core` not imported by feature
packages; Phase 3 HandoffContextBuilder config-driven via profile
thresholds; Phase 4 examples/{stockforge,generic-project}/ prove
template-isolation; Phase 5-7 worktree isolation via profile field.
**Cumulative compliance**: PASS across all phases. **No finding.**

### P4. Light-touch integration

**Trajectory**: Phase 0 chose hooks-first + examples/ as the only
integration surface (D5); Phase 1 examples/stockforge-integration/ ships
`profile.yaml + hooks-snippet.json` as the entire integration surface;
Phase 4 inject-hooks.ts atomic backup→validate→atomic; Phase 6 worktree
additive Prisma migration (zero DROP per D018); Phase 7 hook injection
unchanged across 4 carryforward fixes. **Cumulative compliance**: PASS.
**Caveat**: F-7 captures inject-hooks.ts JSDoc step-numbering inconsistency
(documentation-cosmetic, not functional). **One low finding.**

### P5. CLI subprocess path for subscription accounts

**Trajectory**: Phase 0 chose IAgentRuntime + execa + claude CLI
subprocess (D1 explicit); ClaudeCodeAdapter never imports
`@anthropic-ai/sdk`; Phase 1-7 maintained the path (decisions/026 defers
sidecar fallback, NOT replaces CLI subprocess). **Cumulative compliance**:
PASS. **Risk**: Anthropic ToS April 2026 binding; principle held under
realistic adversarial probe (Phase 7 cross-account ccs failover; F3 redefined
per D1+D8 to acknowledge cross-account resume is not seamless without
handoff-builder rebridge). **No finding.**

### P6. Adapter abstraction for runtimes

**Trajectory**: Phase 0 IAgentRuntime interface decided (D1); **Phase 1
soft-violation: SessionManager initially injected concrete
ClaudeCodeAdapter, caught by adversarial verifier at Task 1.16, fix-D
introduced IAGENT_RUNTIME token**. Phase 2-3 HandoffModule consumes
IAGENT_RUNTIME via SessionsModule import (D21); Phase 4 fix-D backport
re-confirmed; Phase 5-7 worktree lifecycle T1-T9 specs hold the adapter
boundary. **Cumulative compliance**: PASS_WITH_CAVEAT** (one phase had
soft-violation; corrected before phase-end gate). **Risk**: pattern is
verifier-detectable, not statically guaranteed; F-6 captures this as
low (verifier already caught it; future regression covered by existing
test coverage). **One low finding.**

### P7. Observability from day one

**Trajectory**: Phase 0 chose Grafana LGTM stack + W3C TRACEPARENT
propagation (D6+D7); Phase 1 createPinoOtelMixin() + sdk.start() succeeds;
Phase 2 OTEL HTTP auto-instrumentation BEFORE NestFactory.create() (D19
ordering critical); Phase 3 Task 3.8 cost-queryable via
`/sessions/:id/usage`; Phase 4 O1-O4 all PASS; **Phase 5 PASS_WITH_CAVEAT:
INV-S9 telemetry hook latency 567ms median for one full phase before
Phase 6 SC-19 fixed it to p50=105ms p99=126ms**. Phase 6 SC-22
rollup-telemetry.ts ships; **Phase 7 PASS_WITH_CAVEAT: SC-33 dispatch.jsonl
asymmetric (1 DISPATCHED + 19 COMPLETED; CF-21 deferred); SC-39
DEFERRED**. **Cumulative compliance**: PASS_WITH_CAVEAT** (two phases
had latency or telemetry-attribution caveats; both have remediation
slated for Phase 8). **Findings**: F-2 (signal-thin self-evolution
loop), F-4 (dispatch.jsonl pairing asymmetry), F-5 (INV-S9 one-phase
latency-regression window). **Three medium findings — this is the
highest-finding-density principle in the audit.**

### P8. Reusable without forking

**Trajectory**: Phase 0 BaseChannelAdapter + side-effect self-registration
(D9); Phase 1 packages/cli 5 commands (`init/attach/start/stop/status`);
Phase 2 packages/web-ui Vite+React; Phase 3 ORCH_TRACE_BACKEND
configurable; Phase 4 `orch init < 60s` + GitHub Actions CI + 2 examples;
Phase 5 skill validator + .test.md harness; Phase 6 telemetry-analyst
subagent + 14 components from 2590 events; Phase 7 sc18-realworld.ts
hygiene + citation-linter exit 0. **Cumulative compliance**: PASS.
**Risk**: F-3 (architect-spec-vs-reality recurrence) shows that the
process-improvement layer of "reusable without forking" (Mandates A-E)
needs Mandate F to fully discharge. Routed to F-3. **No standalone
finding.**

### P9. Fail loud, recover gracefully

**Trajectory**: Phase 0 watchdog + FIFO queue + wake-dedup (D13 + D3);
Phase 1 BoundedStderrBuffer 256 KiB ring + unhandledRejection handlers;
Phase 2 SSE auto-reconnect exponential backoff + bounded buffer 200
events + redactSecrets(); Phase 3 Date passthrough fix in
redact-log-object.ts (silent handoff failure root-caused); Phase 4
P2021-tolerance for Prisma stale-table-cache; Phase 5 Mode B + Mode C
hard guard wired; Phase 6 INV-S9 fix p50=105ms; Phase 7 byte-identical
1470/1470/1470 across 3 runs + 126/126 hooks PASS. **Cumulative
compliance**: PASS. **Risk**: F-1 (N6 72h NOT_RUN) is the only
empirical-evidence gap for "memory leak" branch of P9; rated medium per
the rubric (charter SC depends on it). **No standalone P9 finding;
F-1 is more naturally categorized under "observability-completeness"
in §5.**

### P10. No feature creep into agent intelligence

**Trajectory**: Phase 0 explicitly rejects AI-classify tier 3 (D15) +
praktor swarm DAG (overkill); Phase 1 I-1 + I-14 (domain zero framework
deps); Phase 2 deferred token/cost chart (no smart routing); Phase 3
Decision 006 zero-LLM HandoffContextBuilder; Phase 4 docs/architecture.md
no new agent-intelligence; Phase 5 retrospective "framework records
data but does NOT read own data and propose changes"; Phase 6 Decision
017 self-evolution conservative-by-design; Phase 7 SC-39 DEFERRED with
routing recommendation. **Cumulative compliance**: PASS. **Risk**: F-2
(signal-thin loop) is a P10-adjacent finding — the loop's first real
upgrade demonstration is precisely the dogfood test that distinguishes
"the loop is conservative" (charter-aligned) from "the loop will never
fire" (charter-betraying). Rated medium because Phase 8 §3 substage 8.5
self-application thesis depends on resolution. **No standalone P10
finding; F-2 captures it.**

## §4 Success-Criteria Spot-Check Synthesis

The 16-row SC spot-check segment of the evidence table reports 14 PASS,
1 DRIFT_LOW (N6), and 1 PARTIAL (SC-27 from the findings preview).

The functional family (F1-F8) is fully green. Functional charter coverage
is **complete** for v2.0 GA: plan auto-pickup, ccs failover, 230K
graceful end, orch init <60s, 2+ projects (PASS via SC-8 N=2 across
DIFFERENT projects).

The non-functional family (N1-N6) has **one critical-narrative gap**:
**N6 (72h stable RSS) is the only charter SC never empirically run**.
The protocol is documented (n6-rss-sample.md from Phase 5); the
deterministic gate (`scripts/utilities/measure-rss.sh --duration-sec
259200`) exists; the user-action TODO has been carried since
phase-5-complete.md line 51 and remains uncleaned at phase-7-complete.md
(no `SC-14|72h|measure-rss` matches found at Phase 7 close). This is
F-1 below.

The observability family (O1-O4) is **green at the SC level** but the
subordinate findings (F-2, F-4, F-5) catalog observability-completeness
gaps: signal-thinness (F-2), dispatch.jsonl pairing asymmetry (F-4), and
INV-S9 one-phase latency window (F-5). The pattern is: each individual
charter SC passed, but the *coherent observability story* has thin spots
where attribution + correlation + replay-from-trace are not all green
simultaneously. **This is the audit's most consequential cross-cell
pattern.**

The safety family (S1-S4) is fully green: I-6 destructive-confirm gate,
no credential reads, localhost-bind, projects-read-only-modulo-hook-inject.
**No finding from S family.**

## §5 Findings (priority order)

### F-1. Charter SC N6 (72h stable RSS) never empirically executed across phases 0-7

**Severity**: medium
**Charter principle affected**: charter §"Success Criteria phase 1.0" /
N6 (Non-functional); P9 (Fail loud, recover gracefully) — adjacent.
**Phases involved**: 5, 6, 7 (carryforward unbroken since
phase-5-complete.md line 51).
**Evidence**: `(N6 72h memory leak, SC spot-check)` row labeled
DRIFT_LOW with confidence HIGH; phase-5-complete.md line 51 user-action
TODO; no `SC-14|72h|measure-rss` matches in phase-7-complete.md
(grep verified during methodology spot-check). The deterministic gate
exists (`scripts/utilities/measure-rss.sh`); the protocol document
exists (`agent-workspace/memory/n6-rss-sample.md`); the empirical run
has not happened.
**Root cause hypothesis**: 72h wallclock duration cannot fit inside a
single Claude Code session; the protocol routes to user-action;
autonomous mode does not own the 72h schedule. Result: the SC has
been DRIFT_LOW for 3 phases consecutive.
**Remediation routing**: 8.4.7 (net-new hooks/scripts identified in
partition matrix) — add a small task: implement
`scripts/audit/n6-72h-launcher.sh` that registers the 72h run as a
detached background job + `scripts/audit/n6-72h-status.sh` that
queries its progress. The actual 72h wallclock still requires user-
action, but the launcher + status scripts make it routine, and a
subsequent phase can attest SC-14 PASS once the 72h run lands.
**Effort estimate**: ~30K (sonnet, /effort medium); ~50 LOC of shell
scripts + 1 unit test for the launcher.

### F-2. Self-evolution loop landed signal-thin (no real upgrade through Phase 7)

**Severity**: medium
**Charter principle affected**: P7 (Observability) + P10 (No feature
creep into agent intelligence) — adjacent. Charter §"Craft Philosophy"
("edge comes from compounding") implicitly depends on the loop
producing upgrades.
**Phases involved**: 6 (loop landing), 7 (defer-with-rationale).
**Evidence**: `(P10, Phase 6)` row PASS — but the row text itself
acknowledges "conservative-by-design (Decision 017); no LLM added";
phase-6-complete.md lines 314-319 verbatim "architecturally functional
but signal-thin in its first pass; RULE-1's single firing on a
metadata-attribution bug is real and useful, but the loop is not yet
catching the dominant Phase 6 defect class". `(P10, Phase 7)` row PASS
— but SC-39 DEFERRED via decisions/025; routing-recommendations.md
classifies the deferral.
**Root cause hypothesis**: the loop captures component
duration/success/failure-mode metrics from `rollup-telemetry.ts`, but
the dominant Phase 6+7 defect class is **architect-spec-vs-reality**
LOC variance (F-3) which is a schema-level / runtime-shell-syntax
issue, not telemetry-detectable from the current rollup signal. The
loop is conservative-by-design (correct charter alignment) but its
signal-stream needs extension before it can fire on the real defects.
Phase 6 itself surfaced the v2.2 candidate: "extend rollup to capture
architect Part-C gate live-run results" so spec-vs-reality incidents
route into RULE-2's `success_rate < 0.6` channel.
**Remediation routing**: 8.4.7 (net-new hooks) + Phase 8 §3 substage
8.4 implicit dependency on CF-21 (tool_use_id correlation) closing
first, since better dispatch attribution unblocks the architect-Part-C
live-run capture. Net-new task (call it 8.4.7-N6 or similar; rename at
8.4.1 architect-time): "extend rollup-telemetry.ts to ingest
architect-Part-C gate live-run events; define synthetic event schema;
demonstrate RULE-2 firing on a planted architect-spec-vs-reality
violation". Decision 027 §"Open question" 8 already states community
framework + telemetry sync seam may stretch to v2.4 with scaffolding
in v2.3 — F-2 fits cleanly there but the *signal-extension* part
should land in 8.4 to enable Phase 8 SC-44 self-application from a
loop with non-thin signal.
**Effort estimate**: ~80-120K (sonnet base + opus-architect for
schema design; /effort high — this is the architectural extension of
the conservative loop, not routine impl). LOC ~80-150 (rollup schema
extension + new event emit-points in `architect-mandates.spec.ts`
runner + 2-3 unit tests).

### F-3. Architect-spec-vs-reality pattern recurred 7 times across Phases 5-7 despite Mandates A-E

**Severity**: medium
**Charter principle affected**: P8 (Reusable without forking) — process-
improvement layer; charter §"Craft Philosophy" ("compounding").
**Phases involved**: 5 (5.3.2, 5.3.3), 6 (6.1.2 C.5, 6.1.4 C.2, 6.2.4 C.4
cost-model, 6.2.4 proposals/*, 6.3.7 C.4 awk-range, 6.4.2 C.4 awk-gsub —
6 incidents), 7 (recurring per CF-26 in 7.1/7.2/7.3/7.4).
**Evidence**: phase-6-complete.md line 172 "architect-spec-vs-reality
pattern recurred 6+ times"; phase-6-complete.md §B.1 (line 267) "7
incidents through Phase 6"; phase-7-complete.md line 312 "Mandate F
candidate — pre-IMPL LOC reality check"; CF-26 is logged as a
recurring lesson, not a blocking bug. Mandates A-D shipped in Phase
6/7; Mandate E shipped Phase 7; pattern still recurred in Phase 7
LOC-variance subspecies.
**Root cause hypothesis**: existing 5 Mandates address spec-format
discipline (A through E), but the pattern's LOC-variance subspecies
is a *pre-IMPL estimation* failure, not a spec-discipline failure.
The architect estimates an LOC cap without running `wc -l` on the
closest analog file. Mandate F (pre-IMPL `wc -l` analog check) is
the surgical fix; phase-7-complete.md line 506-507 already drafts
the Mandate F text.
**Remediation routing**: 8.4 — attach to existing 8.4.6 batch (CF-25
+ CF-26 + G.7 + G.8) which already lists CF-26 as a v2.3 retrospective
input. CF-26 should explicitly produce the Mandate F amendment to
`.claude/agents/sandwich-architect.md` + 1-2 cases in
`tests/skills/architect-mandates.spec.ts`. **No additional 8.4 task
needed; CF-26 in 8.4.6 absorbs F-3.**
**Effort estimate**: ~80K (sonnet; /effort medium); ~30 LOC per
phase-7-complete.md line 504-505 ("Mandate F text + 1-2 new test
cases").

### F-4. dispatch.jsonl pairing asymmetry (CF-21 carryforward)

**Severity**: medium
**Charter principle affected**: P7 (Observability from day one); O3
(cost queryable per session).
**Phases involved**: 6 (dispatch.jsonl introduced), 7 (CF-21 surfaced
+ deferred).
**Evidence**: `(P7, Phase 7)` row PASS_WITH_CAVEAT in evidence table;
phase-7-complete.md SC-33 PASS_WITH_CONCERN — "production runs show
agent_type: 'unknown-agent' in 19/20 records (PreToolUse(Task) seam
stdin payload gap)"; SC-27 retro PARTIAL — "1 DISPATCHED + 19
COMPLETED = 20 total events, BUT pairing asymmetric per CF-21
(PreToolUse(Task) seam not firing reliably)".
**Root cause hypothesis**: the PreToolUse(Task) hook's stdin
payload gap means agent_type is missing for 19/20 records. The
dispatch + completion event pairing depends on tool_use_id correlation
which is currently absent. CF-21 fix is ~50-80 LOC per Decision 026
(captured in Phase 8 §5 carryforward map row CF-21 → 8.4.2 SC-48).
**Remediation routing**: 8.4.2 (already mapped per Phase 8 master plan
§5 carryforward map row CF-21 → 8.4.2). **No new task needed; F-4
is materially equivalent to CF-21 closure already scoped.**
**Effort estimate**: ~50-80 LOC sonnet/medium per Decision 026 (no
change to Phase 8 budget).

### F-5. INV-S9 telemetry hook latency 567ms regression window persisted one full phase before fix

**Severity**: medium
**Charter principle affected**: P7 (Observability from day one); N5
(Telegram command response latency <2s as proxy for end-user
responsiveness).
**Phases involved**: 5 (regression introduced + lived); 6 (fix
shipped, p50=105ms p99=126ms).
**Evidence**: `(P7, Phase 5)` row PASS_WITH_CAVEAT; phase-5-complete.md
line 52 retrospective "INV-S9 telemetry hook latency (567ms median,
target <50ms)"; line 202 P0 candidate ranking "every tool-use call
pays ~500ms-2.5s. On a 200-tool-use session that is 100s-500s extra
wallclock". Phase 6 SC-19 fix p50=105ms p99=126ms (subshell fire-and-
forget).
**Root cause hypothesis**: the `component-telemetry.sh` hook lacks
a backstop latency gate. A regression that pushes hook latency from
<50ms to 567ms wired into PostToolUse + SubagentStop + SessionStart
multiplies into 100s-500s extra wallclock per 200-tool-use session.
The fix shipped in Phase 6 (subshell fire-and-forget pattern) is
the right architectural answer, but **no regression test exists to
prevent re-regression**. Phase 8 §3 8.2 verify automation will
include drift-check, but a hook-latency budget assertion is missing
from the spec.
**Remediation routing**: 8.2 (verify automation) — attach to existing
substage 8.2.2 (impl gates). Add to `scripts/verify/post-phase.sh` a
hook-latency budget assertion: parse `agent-workspace/telemetry/*.jsonl`
for hook-component duration; assert p99 < 200ms (10× headroom over
current 105ms p50 / 126ms p99). **No new substage; F-5 absorbs into
8.2.2.**
**Effort estimate**: ~20K (sonnet/medium); ~30 LOC of shell + JSON
parsing in `post-phase.sh`.

### F-6. P6 adapter soft-violation pattern was verifier-detectable, not statically guaranteed

**Severity**: low
**Charter principle affected**: P6 (Adapter abstraction for runtimes).
**Phases involved**: 1 (introduced + caught + fixed in same phase).
**Evidence**: `(P6, Phase 1)` row PASS_WITH_CAVEAT; phase-1-complete.md
fix-D (line 50-52, line 96+ Major). SessionManager initially injected
concrete ClaudeCodeAdapter; Task 1.16 adversarial verifier caught it;
IAGENT_RUNTIME token introduced. Principle held *after* fix; soft-
violation existed pre-fix.
**Root cause hypothesis**: no static lint enforces "domain modules
import only abstract tokens, never concrete adapters". The pattern is
caught at adversarial-verify time, which is reliable but late
(after IMPL session has closed but before phase close). Pattern did
not recur in Phases 2-7 (single instance).
**Remediation routing**: NO_ACTION (editorial / process-monitoring
only). Single-incident; verifier caught it; subsequent phases held;
no architectural change needed. Phase 8 §3 substage 8.4.1 task
partition matrix may add a "concrete-adapter-import lint" row to the
deterministic-suited pile, but this is at the discretion of the
8.4.1 architect and is not a finding-driven requirement.
**Effort estimate**: n/a.

### F-7. inject-hooks.ts JSDoc step-numbering inconsistent with implementation order

**Severity**: low
**Charter principle affected**: P4 (Light-touch integration) — cosmetic.
**Phases involved**: 4 (inject-hooks.ts shipped + carryforward
acknowledged).
**Evidence**: phase-4-complete.md Carryforwards "JSDoc header says
backup→validate→atomic; actual impl is validate→backup→atomic;
substance correct, doc cosmetic". No functional impact; no behavioral
divergence; only the JSDoc comment is mis-ordered.
**Root cause hypothesis**: editorial drift between spec and impl;
corrected impl order (validate-first is safer) but JSDoc never
updated.
**Remediation routing**: NO_ACTION at audit-time; can absorb into
8.1.3 (`.claude/*` remediation pass) only as a stretch goal. Per
the v2.4 deferral path: leave the inconsistency; document in
`agent-notes.md` as a low-priority editorial; future routine
maintenance picks it up. Not worth a dedicated task.
**Effort estimate**: <5K if anyone touches inject-hooks.ts for
another reason in 8.1.3 or later.

## §6 Remediation Backlog Routing Summary (input to 8.4)

| Finding | Severity | Routes to | Substage hint | Effort |
|---|---|---|---|---|
| F-1 N6 72h launcher | medium | 8.4.7 (net-new hooks) | new launcher + status scripts | sonnet medium ~30K |
| F-2 self-evolution signal-extension | medium | 8.4.7 (new task) | extend rollup-telemetry.ts schema | sonnet+opus high ~80-120K |
| F-3 Mandate F (architect LOC reality check) | medium | 8.4.6 (CF-26 batch) | absorb into existing CF-26 task | sonnet medium ~80K |
| F-4 dispatch.jsonl tool_use_id correlation | medium | 8.4.2 (CF-21) | already mapped | sonnet medium ~50-80 LOC |
| F-5 hook-latency budget assertion | medium | 8.2.2 (verify gates) | extend post-phase.sh | sonnet medium ~20K |
| F-6 adapter soft-violation lint | low | NO_ACTION | optionally 8.4.1 architect | n/a |
| F-7 inject-hooks.ts JSDoc | low | NO_ACTION | absorb in 8.1.3 if convenient | n/a |

**Cross-check vs Phase 8 §3 substage 8.4 (8 tasks budget)**:
- 8.4.1 architect partition matrix — unchanged.
- 8.4.2 CF-21 — F-4 already mapped here; no addition.
- 8.4.3 CF-22 / 8.4.4 CF-23 / 8.4.5 CF-24 — unchanged.
- 8.4.6 CF-25/26+G.7/G.8 — F-3 absorbs into CF-26 (already a member of
  this task batch); **no addition to task count**.
- 8.4.7 net-new hooks — F-1 + F-2 attach as **2 new line-items** within
  the existing task. Substage budget impact: +30K (F-1) + +80-120K
  (F-2) = ~110-150K added to 8.4.7 estimate. Phase 8 master plan §6
  budget table lists 8.4 mid-estimate at 180K with max at 260K. Adding
  110-150K to 8.4.7 alone may push the substage past mid-estimate.
- 8.4.8 review — unchanged.

**Substage 8.2.2** absorbs F-5 (~20K added). Phase 8 §6 budget table
8.2 mid-estimate is 110K; +20K is well within max=150K.

**Net Phase 8 budget impact**: ~130-170K added across 8.2 + 8.4.
Phase 8 §6 total mid-estimate 1180K; max 1670K. **Comfortable headroom;
no budget concern flag.**

**Recommended phase-8 substage update (non-binding hint to orchestrator
+ 8.4.1 architect)**:
- Either keep F-1 + F-2 as line-items inside the existing 8.4.7
  net-new-hooks task (orchestrator's call at dispatch-time), OR
- Promote F-2 to a dedicated substage 8.4.9 ("self-evolution loop
  signal-extension") since the architectural-design weight of F-2
  exceeds the typical "hook script" granularity of 8.4.7. Master
  planner recommends **promote F-2 to its own task 8.4.9** to keep
  the LLM/deterministic distinction clean: 8.4.7 = scripts; 8.4.9 =
  rollup schema + agent test harness extension.

## §7 Charter-Coherence Verdict

**PASS_WITH_CAVEAT.**

Charter principles P1-P10 held across phases 0-7. The single soft-
violation (P6 Phase 1 SessionManager → ClaudeCodeAdapter concrete
injection) was caught by adversarial verify within the same phase
and corrected via the IAGENT_RUNTIME token; the pattern did not
recur. Architectural pillars (daemon-dumb, project-agnostic core,
CLI-subprocess-only, adapter-abstraction) are intact.

**The drift surfaces in observability-completeness, not architecture.**
Five medium-severity findings cluster into a coherent observability
theme: F-1 (N6 never empirically run), F-2 (signal-thin self-evolution
loop), F-4 (dispatch.jsonl pairing asymmetry), F-5 (INV-S9 one-phase
latency window), and F-3 (architect-spec-vs-reality recurrence is
process-observability). Charter §"Observability from day one" is
PASS at the SC level (O1-O4 all green) but the deeper "every session
is a trace; every hook event is a span" promise has thin spots.
Remediation is straightforward: 4 of 5 medium findings route to
existing or trivially-extended Phase 8 substages.

**The audit recommends Phase 8 proceed without charter revision.**
SC-42 floor of 3 categorized findings is exceeded (7 surfaced, 5
medium). Each medium-or-higher finding has explicit remediation
routing per Decision D-F. **0 critical / 0 high** means the project's
v2.0/v2.1/v2.2 staged baseline is not at risk; v2.3 closes the
observability gap before community OSS launch (Phase 8 §1 SC-46),
which is the right sequencing.

## §8 Phase 8 §3 substage update recommendation (NON-binding hint)

If §6 routing requires new 8.4 sub-tasks beyond 8.4.1-8.4.8 budget,
list the sub-tasks here:

- **Recommended addition**: **substage 8.4.9 — self-evolution loop
  signal-extension** (absorbs F-2). Rationale: F-2's architectural
  weight exceeds the "hook script" granularity of 8.4.7; promoting
  it to its own task preserves the LLM-task vs deterministic-task
  partition clean. Effort: opus architect /effort high (design) +
  sonnet impl /effort medium (rollup schema + harness extension).
  Budget estimate: ~80-120K. Insert between 8.4.7 (net-new hooks) and
  8.4.8 (review); review absorbs the new task without modification.
- **Recommended absorption (no new substage)**: F-1 N6 launcher
  attaches to 8.4.7 net-new hooks line-items; F-3 Mandate F absorbs
  into 8.4.6 CF-26 batch; F-4 CF-21 unchanged 8.4.2; F-5 hook-latency
  budget attaches to 8.2.2 impl gates.

**Net Phase 8 substage count change**: +1 (8.4.9) — total 8.4 task
count moves from 8 to 9. Phase 8 master plan §3 substage table row
"8.4" Tasks column updates from `8` to `9`; budget mid-estimate from
`180K` to `~280K` (adds F-2's 100K mid-point). The orchestrator and
8.4.1 architect ratify the addition at substage 8.4 dispatch time.

The orchestrator may also choose **NOT** to promote F-2 to 8.4.9 and
instead leave it as a line-item inside 8.4.7 — the master-planner
recommendation is non-binding. Either approach satisfies SC-48 closure.

## §9 Stop conditions encountered

**None.** The evidence table is internally consistent across all 80
rows + 16 SC spot-check rows + 8 findings preview. Spot-check sample
of 6 rows against actual phase-N-complete artifacts found 0 mis-
attributions. The audit completes within budget with all required
sections (§1-§7 mandatory) populated. ≥3 findings categorized (7
surfaced); ≥1 routing != NO_ACTION (5 of 7); charter-coherence verdict
explicitly stated (PASS_WITH_CAVEAT in §7); remediation routing table
present in §6.

**End of audit.**
