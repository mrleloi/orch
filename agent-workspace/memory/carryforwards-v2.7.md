# Carryforwards — v2.7

> Working list of carryforwards surfacing during v2.6 (Phase 11) burndown.
> Authored at substage close-time as concerns are surfaced; consolidated into a
> final carryforwards-v2.7.md at Phase 11 close.

## Source: 11.3 CF-DOGFOOD-2 disposition (binding decision, 2026-04-28)

Decision: `agent-workspace/memory/decisions/039-cf-dogfood-2-disposition-v2.6.md`
Verdict: **DEFER-V2.7** (structural-defer pattern; inherits Decision 033
Deliberation E shape)

### CF-DOGFOOD-2 (carried v2.3 → v2.4 → v2.5 → v2.6 → v2.7)

**Source**: `scripts/dogfood/run-self-task.ts:387` step-9 stub
(`appendTrace({...,dispatch_deferred_to:'8.5.3'})`). The 8.5.2 dogfood
harness ships steps 1–8 + step 11 of the spec §4.2 algorithm but the
real subprocess dispatch via `IAgentRuntime.spawn()` /
`SessionManager.runSession()` is not wired.

**Severity**: structural; non-load-bearing for v2.6 critical path.

**Why deferred again**: zero of the four Phase 10 §4.2 trigger conditions
were met at Phase 11 entry. Decision 035 verdict is DEFER-V2.6 (SC-39
remains gated; real dogfood telemetry not load-bearing). OSS launch
not scheduled before Phase 11 §11.5 close. No drift detected (no
unrelated substage has touched the harness). Multi-user rollout not
on Phase 11 critical path.

**Re-attempt prerequisites for v2.7 (Decision 039 §4.3)** — at Phase 12
entry, this CF re-opens to FIX_INLINE disposition only if AT LEAST ONE
of the following is MET:

- **R-039.1**: Decision 037 verdict (v2.6 SC-39 R-4 close) =
  ENABLE_RETRY OR a v2.7-equivalent verdict that requires real dogfood
  telemetry as a load-bearing input.
- **R-039.2**: Community OSS launch is scheduled in v2.7 master plan
  with `docs/dogfood-harness.md` (8.7.4 OSS docs deliverable) on the
  critical path.
- **R-039.3**: Drift detected — any v2.6 or v2.7 substage modifies
  `scripts/dogfood/run-self-task.ts` (auto-detected by
  `scripts/audit/charter-coherence-spot-check.sh` at v2.7 entry).
- **R-039.4**: Multi-user adoption rollout requires envelope schema
  (`packages/core/src/dogfood/envelope-schema.ts`) to evolve.
- **R-039.5**: Operator override — explicit user prompt requesting
  CF-DOGFOOD-2 closure at v2.7 entry.

**If NONE of R-039.1..R-039.5 holds at v2.7 entry**: this CF
self-extends to DEFER-V2.8 by the same rationale shape (Decision 033
Deliberation E pattern explicitly contemplates multi-cycle structural
defer).

**How to apply (when re-opened)**:
- Reference template in `cf-dogfood-2-assessment.md` §5 (Phase 10 §10.3
  output) provides the Option B (FIX_INLINE_MINIMAL) dispatch envelope
  verbatim.
- Recommended scope at v2.7 re-open: Option D from assessment §3.4
  (FIX_INLINE_MINIMAL + RUN_CONTROL_FLAG; profile-flag default OFF;
  ~90 LOC delta; ~45K budget).
- Acceptance gate: `pnpm typecheck` + `pnpm lint` + `pnpm test` PASS;
  `grep -n "dispatch_deferred_to" scripts/dogfood/run-self-task.ts` →
  0 matches (stub label removed); new test verifies
  `IAgentRuntime.spawn()` invoked with correct config when profile
  flag ON.

**Charter-coherence**: Decision 039 §4.4 cross-checks all charter
principles, invariants, and prior decisions. Deferral is design
(scaffold-now-execute-later per Decision 027 §C-8), not drift.

---

## Source: (additional v2.7 carryforwards will be appended here as Phase 11 substages close)

---

## Source: 11.5.3 SC-39 retry verdict (Decision 037, 2026-04-28)

Decision: `agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md`
Verdict: **DEFER-V2.7** (structural-defer; R-1 FAIL — agentId extraction mechanism
empirically falsified on 21+ real Agent dispatches)

### CF-V2.7-SC39-W1-AGENTID-EXTRACTION

**Source**: Decision 037 §2.1 (R-1 FAIL root cause) + §6 (candidate fix paths)

**Statement**: `dispatch-jsonl-recorder.sh` PostToolUse-Agent branch (line 33) uses
regex `/agentId:\s*([a-f0-9]{10,20})/i` against `tool_response.content[0].text` to
extract the hex agent ID for SubagentStop correlation. Real Claude Code Agent tool
responses do not contain an `agentId: <hex>` field in any format observed across 21+
real dispatches in Phase 11. `RESULT_AGENT_ID` is always empty; the sidecar hex-keyed
index entry is never written; all COMPLETED rows retain raw hex `dispatch_id` and
`tool_use_id: null`. Pairing rate = 0.000 on all production telemetry.

**Root cause**: The `agentId` field was manually injected by the fixture test
(`sc39-pairing-rate.spec.ts`) but does not exist in real Agent tool result text.
This is the production-vs-fixture gap named in Decision 035 §6
CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP, now empirically confirmed as the
primary root cause of SC-39 pairing failure across v2.4 → v2.5 → v2.6.

**Severity**: structural blocker for ENABLE_RETRY.

**Why deferred again**: The fix requires empirical format discovery of what Claude
Code actually emits in Agent tool result text — this is not knowable from the codebase
alone. Decision 037 §6 provides four candidate fix strategies (W-1-A through W-1-D).
No candidate was selected or implemented in v2.6 because the correct approach depends
on empirical discovery that must happen in a fresh v2.7 session.

**Re-attempt prerequisites for v2.7 (Decision 037 §5 W-1)** — at Phase 12 entry,
this CF re-opens to FIX_INLINE disposition only after ALL of the following:

- **W-1-DISCOVER**: Run empirical format discovery at v2.7 substage start — capture
  raw `tool_response.content[0].text` and full `tool_response.content[0]` object from
  a real Agent dispatch.
- **W-1-FIX**: Select and implement one of Decision 037 §6 candidates (W-1-A through
  W-1-D) based on discovery.
- **W-1-VERIFY**: Confirm (V1a) — a COMPLETED row in dispatch.jsonl with toolu_*
  `dispatch_id` — OR (V1b) — PostToolUse stderr showing non-empty `RESULT_AGENT_ID`.

**How to apply**:
- Read Decision 037 §6 for candidate fix strategies and selection criteria.
- The production integration test `tests/integration/sc39-production-pairing-rate.spec.ts`
  (Δ2, Case 1) is the standing regression surface. Update its JSDoc `@note` block
  (lines 25-28) from "expected to FAIL" to "expected to PASS" once W-1 is verified.
- After W-1 PASS: proceed to W-2 (natural volume ≥ 50 dispatches, total events ≥ 10,000)
  and W-3 (re-measure artifacts with v2.7-suffix names).

**Charter-coherence**: P1 (empirical discovery before fix), P2 (no speculative fix
without knowing the real format), P3 (line-33-scoped change, no broader rewrite). All
satisfied by the discovery-first approach mandated in W-1-DISCOVER.

---

### CF-V2.7-SC39-W2-NATURAL-VOLUME

**Source**: Decision 037 §2.2 (R-2 INSUFFICIENT_VOLUME)

**Statement**: SC-39 pairing-rate evaluation requires ≥ 50 real Agent-tool DISPATCHED
events (statistical floor for cf21 gate) and total component-telemetry events ≥ 10,000.
As of v2.6 close: 21 DISPATCHED rows (shortfall: 29), total events ~8,031+ (shortfall
depends on v2.6 activity; may be resolved naturally). Volume gate is moot until W-1 is
fixed — collecting volume under broken extraction confirms FAIL numbers, not PASS.

**Severity**: gating (blocks ENABLE_RETRY) but passive — no engineering action needed.

**Re-attempt prerequisites for v2.7 (Decision 037 §5 W-2)**:
- W-1 PASS (fix verified) MUST precede W-2 measurement.
- Natural dogfooding accumulation: ≥ 50 real Agent dispatches in the phase; events
  crossing 10,000 total.
- Produce `cf21-real-dispatch-sample-v2.7.json` + `sc39-prereq-volume-v2.7.md` at
  v2.7 close substage.

**Charter-coherence**: P2 — passive accumulation, no engineering. Volume is a
time-on-clock gate, not an engineering problem.

---

### CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES

**Source**: Decision 037 §7 (retiring 3 code-quality CFs from 11.5.2 review)

**Statement**: Three quality issues in `scripts/audit/settings-version-check.sh`
(Δ3 deliverable, 11.5.2 IMPL):

1. **HASH-CRLF-UNSTABLE** (sh:29-36, 53, 66): No CRLF normalization in hash comparison;
   sha256 of CRLF `settings.json` ≠ sha256 of LF version; can false-fail on Windows.
2. **BASH-STRICT-MODE-INCOMPLETE** (sh:18): `set -uo pipefail` missing `-e`; ERR trap
   only catches pipefail failures, not individual command failures.
3. **HASH-UNAVAILABLE-FALSE-PASS** (sh:34-36): `HASH_UNAVAILABLE` sentinel string
   causes false PASS when sha256 tool is absent.

**Severity**: important (1+2), nitpick (3).

**Re-attempt prerequisites for v2.7**:
- Fix (1): Add `tr -d '\r'` normalization in `sha256_of_file()` and hash retrieval.
- Fix (2): Change to `set -euo pipefail`; re-run G8/G9 divergence smoke tests.
- Fix (3): Change unavailable-hash path to `exit 2` with `[SKIP]` message.
- All three can be addressed in a single focused task (~20-30 LOC delta; budget ~5K).
- Re-run acceptance gates G7 through G9 after fixes.

**Does NOT block SC-39 ENABLE_RETRY** (W-1, W-2, W-3 gate; hash script is auxiliary).
Address as a housekeeping task in v2.7 planning.

---

### CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE

**Source**: Decision 037 §7.6 (code-quality nitpick from 11.5.2 review).

**Statement**: `scripts/audit/settings-version-check.sh` `poll_lines()` helper uses a
15-second timeout for the line-count poll loop. On slow CI runners the timeout boundary
may produce moderate flake risk under contention.

**Severity**: nitpick. Non-blocking. Tracked here for v2.7 housekeeping completeness
(11.5.3 sandwich-verifier P8 minor concern: ensure surface in working list, not only
inside Decision 037 §7.6).

**Re-attempt prerequisites for v2.7**:
- Raise timeout to 30s OR replace with retry-with-backoff loop (~5 LOC delta).
- Bundle with the other settings-version-check fixes (CF above) under a single
  housekeeping task (~5K budget).

**Charter-coherence**: P2 (simplicity); P3 (single-helper-scoped change).
