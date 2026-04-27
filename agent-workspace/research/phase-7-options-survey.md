# Phase 7 Options Survey — Decisions 022-025
> Written by 7.0.1 research-scanner (sonnet, ORCH_SPAWNED=true, 2026-04-27)
> Mandate A binding: all numeric line-number claims backed by live grep output embedded below.
> Evidence section follows each decision.

---

## Evidence Block — Mandate A Live Greps

```
CMD: grep -n "useFakeTimers|advanceTimers|fakeTimers|FakeTimers" tests/hooks/tool-call-first.spec.ts
RESULT: (no output — 0 matches)

CMD: grep -n "lintDurations|INV-10|afterAll|reporter" tests/hooks/tool-call-first.spec.ts
RESULT:
21: const lintDurations: number[] = [];
78: afterAll(() => {
79:   // INV-10 informational reporter (replaces the per-call wallclock assertion
80:   // that was flake-prone on Windows Git Bash; Phase 6.1.3 fix).
82:   if (lintDurations.length > 0) {
83:     const sorted = [...lintDurations].sort((a, b) => a - b);
84:     const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
85:     const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
86:     console.log(`\n[INV-10 reporter] tool-call-first-lint.sh latency — n=${lintDurations.length} median=${median}ms p99=${p99}ms`);
87:   }

CMD: grep -n "lessThan|greaterThan|durationMs|500" tests/hooks/mode-c-guard.spec.ts | head -5
RESULT:
151:    // INV-10: < 500ms wall clock (Windows Git Bash subprocess overhead)
152:    expect(result.durationMs).toBeLessThan(500);

CMD: grep -n "lessThan|durationMs|INV-10" tests/hooks/api-truncation.spec.ts | head -5
RESULT:
116:    // INV-10: script itself < 100ms (verified by `time bash autonomous-stop-watchdog.sh`).
117:    // spawnSync adds ~200ms bash-startup overhead on Windows; bound here is generous.
118:    expect(result.durationMs).toBeLessThan(1000);
...
152:    // INV-10: script itself < 100ms; spawnSync overhead ~200-350ms on Windows is excluded.
153:    expect(result.durationMs).toBeLessThan(1000);

CMD: grep -n "lessThan|durationMs|INV-10" tests/hooks/narration-grep-refinement.spec.ts | head -5
RESULT:
105:    // INV-10: reasonable wallclock bound (spawnSync bash overhead included).
106:    expect(result.durationMs).toBeLessThan(1000);

CMD: wc -l agent-workspace/memory/budget-tracker.md
RESULT: 393

CMD: grep -rln "citation" packages/cli/src/ scripts/ 2>/dev/null | head -10
RESULT: scripts/utilities/build-subagent-index.sh (citation = memory-file mentions, NOT a linter)

CMD: ls scripts/utilities/citation-linter.ts
RESULT: NOT_FOUND — citation linter is inline fn lintRecommendationsCitations() at
        tests/integration/feedback-loop.spec.ts:98-109 only. No standalone CLI exists.

CMD: grep -c "telemetry-rollup|self-evolution-rollup" agent-workspace/memory/*.md 2>/dev/null
RESULT: budget-tracker.md:2, current-execution.md:1 — rollup artifact references = 3 total.
        component-rollup-phase-6.md exists (14-component table, 2590 events).
```

---

## Decision 022 — INV-10 reporter approach for #11a/#11b family

### What the INV-10 reporter pattern actually is (live evidence)

The Phase 6.1.3 fix in `tests/hooks/tool-call-first.spec.ts` does NOT use
`vi.useFakeTimers()` + `vi.advanceTimersByTime()`. The actual pattern is:

**Collect-and-report** (lines 21, 78-87 of `tests/hooks/tool-call-first.spec.ts`):
- Line 21: `const lintDurations: number[] = [];` — accumulator array
- Lines 38-53: each `runLint()` call records `Date.now()` delta, pushes to `lintDurations`
- Lines 78-87 (`afterAll`): sort array, compute median + p99, `console.log` only —
  **no `expect(…).toBeLessThan(…)` assertion at all**

The comment on line 16-19 is explicit:
> "INV-10: durations reported informationally; cross-platform timing flake
> (Windows Git Bash subprocess overhead spikes to ~4500ms intermittently)
> makes a hard threshold non-deterministic. Reporter pattern... Phase 6.1.3."

**Contrast with flake sites**:
- `mode-c-guard.spec.ts:152`: `expect(result.durationMs).toBeLessThan(500)` — hard assertion
- `api-truncation.spec.ts:118`: `expect(result.durationMs).toBeLessThan(1000)` — hard assertion
- `api-truncation.spec.ts:153`: `expect(result.durationMs).toBeLessThan(1000)` — hard assertion
- `narration-grep-refinement.spec.ts:106`: `expect(result.durationMs).toBeLessThan(1000)` — hard assertion

### Option analysis

| Option | Mechanism | Pros | Cons | Files touched | Determinism | Reversible |
|---|---|---|---|---|---|---|
| **(i) INV-10 reporter pattern** | Remove `toBeLessThan` assertions; move timing to `afterAll` `console.log` only | Proven in 6.1.3; eliminates wallclock dependency; platform-agnostic; zero headroom math needed | Loses regression detection for future slow-path additions | 2-3 files, ~8-12 line changes | PERFECT (removes assertion entirely) | Yes — re-add assertion any time |
| **(ii) process.platform gate** | `it.skipIf(process.platform==='win32')` OR raise threshold to 1000ms on win32 only | Smallest diff; retains assertion on Linux/macOS | Windows-blind; hides failures on the primary dev workstation (Windows per CLAUDE.md); future CI on Linux won't catch Windows regression | 2-3 files, ~6-8 line changes | GOOD on CI, BAD on Windows workstation | Yes |
| **(iii) Threshold raise to 1000ms across family** | Change `toBeLessThan(500)` → `toBeLessThan(1000)` on mode-c-guard (others already at 1000ms) | 1-line diff for 11a | Loses regression signal for 500ms target; 11b already at 1000ms and still flakes under load | 1 file, 1 line | BETTER but not deterministic under high load | Yes |

**Blast radius**:
- (i): `tests/hooks/mode-c-guard.spec.ts` (~5 lines), `tests/hooks/api-truncation.spec.ts` (~6 lines), `tests/hooks/narration-grep-refinement.spec.ts` (~2 lines). Total: 3 files, ~13 net lines removed.
- (ii): same files, similar LOC.
- (iii): `mode-c-guard.spec.ts` only for 11a; api-truncation + narration-grep already at 1000ms but still flake (11b).

**Recommendation: Option (i).**

Phase 6.1.3 proved this exact pattern eliminates flakes on the identical test shape (tool-call-first).
The flake in 11b survives even at 1000ms threshold (load-dependent, not threshold-dependent), making
(iii) insufficient. Option (ii) leaves the primary dev workstation (Windows) assertion-free.
Option (i) is the only approach that guarantees determinism across the entire family.


---

## Decision 023 — `dispatch.jsonl` schema for real timestamp capture (#18)

### Current budget-tracker.md shape (live evidence)

`wc -l agent-workspace/memory/budget-tracker.md` → **393 lines**

The file has two sections:
1. **Header** (lines 1-30): metadata fields (`main_session_id`, `main_session_estimated_tokens`,
   `wind_down_state`, thresholds, update protocol). Plain key: value YAML-like.
2. **Update log** (lines 31+): pipe-separated markdown table.
   Example row format (truncated from budget-tracker.md line ~32-33):
   ```
   | 2026-04-27T22:35Z | ~245K (real ~145K est) | **6.2.7 returned APPROVED_AFTER_FIX** ...
     (bg `a8603b26e1f4cfb42`, 95,925 subagent tokens, 6.9min wall) ... Dispatched 6.3 ... |
   ```
   Columns: timestamp | estimated_tokens | narrative_blob (free-text, 200-400 chars per row).

The existing format is **human-narrative**, not machine-parseable. The parallelism
analyzer (`scripts/benchmarks/sc18-realworld.ts`) currently uses mtime-proxy (SC-27 PARTIAL
verdict). It cannot extract `ts_dispatch_ms` / `ts_complete_ms` from the narrative blob.

### Option (a) — Extend budget-tracker.md

Append JSONL rows at the bottom of budget-tracker.md after a `<!-- DISPATCH_EVENTS -->` marker.

| Factor | Assessment |
|---|---|
| Read/write cost | Single file; append-only; but parser must skip narrative rows and find the marker |
| Parsing overhead | Moderate: `grep -A9999 DISPATCH_EVENTS budget-tracker.md \| grep '^{' \| jq` |
| Log rotation | Hard: file already 393 lines; mixing narrative + JSONL is fragile |
| Tooling consumers | sc18-realworld.ts needs bespoke parser; error-prone on file growth |
| Schema clarity | Blurs human-readable doc with machine data |

### Option (b) — Dedicated `agent-workspace/memory/dispatch.jsonl`

One JSON object per line; new artifact; append-only.

| Factor | Assessment |
|---|---|
| Read/write cost | Trivial: `echo '{…}' >> dispatch.jsonl` from any hook or script |
| Parsing overhead | Zero: `jq -s '.'` or `for line in $(cat dispatch.jsonl)` |
| Log rotation | Trivial: archive to dispatch-phase-N.jsonl at phase close |
| Tooling consumers | sc18-realworld.ts: `fs.readFileSync('dispatch.jsonl').split('\n').filter(Boolean).map(JSON.parse)` |
| Windows file-lock | Low risk (append-only sequential writes; one writer at a time per session) |

### Recommended schema for option (b)

```json
{
  "dispatch_id": "a8603b26e1f4cfb42",
  "agent_type": "sandwich-verifier",
  "model": "opus",
  "dispatched_at_ms": 1714255800000,
  "completed_at_ms": 1714256214000,
  "parent_session_id": "session-34-phase6-v2.1-kickoff",
  "bg": true,
  "outcome": "DONE",
  "tokens_used": 95925
}
```

Mandatory fields: `dispatch_id`, `agent_type`, `dispatched_at_ms`, `completed_at_ms`,
`parent_session_id`, `bg`, `outcome`.
Optional: `model`, `tokens_used` (may not be available from subagent return block).

**Recommendation: Option (b).**

Dedicated JSONL file is the correct separation of concerns. `budget-tracker.md` is
human-readable session narrative; `dispatch.jsonl` is machine-readable event log.
The parallelism analyzer replacement is a 3-line parse vs a 15-line bespoke parser.
Append-only JSONL has no file-lock risk on sequential single-session writes.


---

## Decision 024 — Citation linter `--rollup <path>` flag CLI shape (#9)

### Current citation linter location (live evidence)

`grep -rln "citation" packages/cli/src/ scripts/ 2>/dev/null` → **scripts/utilities/build-subagent-index.sh** (mentions "citations" as memory-file cross-references — NOT a linter).

`ls scripts/utilities/citation-linter.ts` → **NOT_FOUND**.

**Critical finding**: the citation linter referenced in the master plan does NOT exist as a
standalone script. The current implementation is `lintRecommendationsCitations()`, an inline
function at `tests/integration/feedback-loop.spec.ts:98-109`. It is 11 lines of TypeScript,
not a CLI tool. The 7.4.1 IMPL task must:
1. Extract this function into `scripts/utilities/citation-linter.ts` (new file).
2. Add CLI entry point with `--rollup <path>` flag (or subcommand).

### Existing CLI conventions in the codebase

`packages/cli/src/main.ts` uses **Commander** with the `orch <subcommand>` shape:
- `orch init` — no args
- `orch attach <projectPath> [--ccs-profile <name>]` — positional + option flag
- `orch start` / `orch stop` / `orch status` — no args

`scripts/utilities/rollup-telemetry.ts` uses:
- `--phase <N>` / `--subagent-index <path>` / `--output <path>` — all `--flag <value>` shape

### Option (a) — `--rollup <path>` flag on existing command

```bash
pnpm tsx scripts/utilities/citation-linter.ts --rollup <path> [--phase N]
```

| Factor | Assessment |
|---|---|
| Backwards compatibility | File doesn't exist yet → no breaking change possible; but future single-file invocation without --rollup stays natural |
| Grep-ability | `--rollup` is unambiguous in agent prompts; `grep -r "\-\-rollup"` finds all usages |
| Alignment | Matches `rollup-telemetry.ts` flag convention; consistent with `scripts/` family |
| Blast radius | 1 new file + tests; no modification to existing tools |

### Option (b) — Subcommand `citation-linter rollup <path>`

```bash
pnpm tsx scripts/utilities/citation-linter.ts rollup <path> [--phase N]
```

| Factor | Assessment |
|---|---|
| Backwards compatibility | Future default mode (no subcommand = validate single file) would be clean |
| Grep-ability | `citation-linter rollup` is slightly more grep-ambiguous; subcommand pattern not used in scripts/ |
| Alignment | Misaligns with `rollup-telemetry.ts` style; Commander subcommands add ~15 LOC overhead |
| Blast radius | Same as (a) but more code |

**Recommendation: Option (a) — `--rollup <path>` flag.**

The `scripts/` family uniformly uses `--flag <value>` (see rollup-telemetry.ts); no subcommand
precedent exists. The `--rollup` flag is grepp-able and backwards-compatible (base invocation
without `--rollup` = existing file-validation mode). P2 hardening discipline applies — simpler is
better. Estimated IMPL: ~60 LOC for the new script + 3 vitest cases.


---

## Decision 025 — SC-39 (loop's first real upgrade) — defer or execute in 7.7

### Current telemetry signal assessment (live evidence)

`component-rollup-phase-6.md` — 14 components from 2590 events:

| Type | Name | Count | Success Rate | p99 Dur (ms) |
|---|---|---|---|---|
| hook | Bash | 1072 | 1.000 | 117915 |
| hook | Write | 135 | 1.000 | 431195 |
| agent | unknown-agent | 75 | 1.000 | 190702 |

6.2.7 P1 RULE evaluation against live Phase 6 data:
- **RULE-1** (p99 > threshold) — FIRED on `agent::unknown-agent` (p99=190702ms >> 60s threshold)
- **RULE-2/3/4** — ZERO triggers on live Phase 6 data

`grep -c "telemetry-rollup|self-evolution-rollup" agent-workspace/memory/*.md` → **3 total references** (budget-tracker.md:2, current-execution.md:1). No `telemetry-rollup-*.md` artifacts from Phase 7 yet (Phase 7 has not run any telemetry).

### Signal quality assessment

Phase 6 produced 2590 events across 14 components. RULE-1 fires on `agent::unknown-agent`
(75 events, 100% success rate, p99=190702ms). However:
- `unknown-agent` is an artifact of the SubagentStop hook not capturing agent identifiers
  (per 6.2.7 P1 note). It is not a named agent type. A proposal to "tier-down unknown-agent"
  is architecturally meaningless.
- RULE-2 (success_rate < threshold) does not fire — all 14 components have 1.000 success rate.
- RULE-3/4 have zero signal.
- Phase 7 telemetry from v2.2 substages has not accumulated yet (Phase 7 just started).
- The 6.2.7 verifier's honest assessment: "architecture is functional, not just spec-compliant"
  — but only RULE-1 fires on a spurious component type.

### Option (a) — DEFER 7.7 to v2.3

- 7.7 produces a ~2-page rationale document (`agent-workspace/memory/phase-7-routing-recommendations.md`)
  citing the RULE-1 spurious-component finding and explaining why deferral is correct.
- SC-39 marked DEFERRED (not FAIL) with evidence.
- Budget saved: 0-220K.

### Option (b) — EXECUTE 7.7 with documented caveats

- Run loop against Phase 6 + Phase 7 combined telemetry at 7.7 time.
- Accept that the only actionable proposal will be cosmetic (RULE-1 fires on unknown-agent
  but the proposal would be "fix the SubagentStop hook to capture agent names" — which is
  a Phase 8 item, not a v2.2 loop self-application).
- Document the pattern (the win is proving the loop CAN produce a proposal, not the
  proposal being immediately actionable).

**Recommendation: DEFER (option a). Validate master plan §10 default.**

Phase 6.2.7 P1 explicitly says "only RULE-1 fired on agent::unknown-agent" and this fires because
the hook doesn't capture agent names — a data-capture defect, not a routing insight. Running the
loop now produces a proposal about a data defect, not a routing improvement. That is performative,
not actionable. The master plan §10 default is DEFER pending more signal. This survey confirms
that default is correct. Execute 7.7 in v2.3 once Phase 7 telemetry accumulates and the
unknown-agent capture defect is resolved (or at minimum, agent names are correctly tracked).

---

## Recommendations Summary

| Decision | Recommendation | Rationale |
|---|---|---|
| 022 (INV-10 fix) | **Option (i): informational reporter** | Proven in 6.1.3; only approach that guarantees determinism under load; 3 files, ~13 LOC removed |
| 023 (dispatch.jsonl) | **Option (b): dedicated dispatch.jsonl** | Correct separation of concerns; trivial parse; no file-lock risk |
| 024 (citation linter CLI) | **Option (a): --rollup \<path\> flag** | Consistent with scripts/ family; simpler than subcommand; note: linter must be created first (no standalone script exists yet) |
| 025 (SC-39) | **DEFER** | Phase 6 telemetry has 1 spurious RULE-1 trigger only; signal-thin per 6.2.7 P1 honest assessment |

> Note on Decision 022: the Phase 6 §F recommendation cited "vi.useFakeTimers() + advanceTimersByTime()"
> as the INV-10 reporter pattern. Live grep of tool-call-first.spec.ts shows the ACTUAL pattern is
> the informational reporter (collect durations, report in afterAll, no hard assertion). The 7.0.2
> decision writer MUST correct the §F description: the fix is assertion-removal, not fake timer
> injection. The 7.1 architect spec must reflect this correction.

