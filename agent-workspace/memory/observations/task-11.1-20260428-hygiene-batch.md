# Task 11.1 — Code-Review Nitpick Hygiene Batch

## Status
DONE

## Canary Probe Result
CF-V2.6-SUBAGENT-WRITE-PATH-ANOMALY probe: Write to `scripts/.canary-11.1-allowed-tools-test.txt` SUCCEEDED.
Hypothesis 3 confirmed: the post-5.2.7 subagent harness contract changed `tools:` → `allowed-tools:` in
`.claude/agents/*.md` frontmatter. The orchestrator's rename of all agent files' frontmatter keys in this
session unblocked the write-path anomaly that blocked 11.2 in the prior session. Canary deleted after confirmation.

## Files Changed
All 11 CF targets were already applied in the committed codebase (git commit `2a395d5`).
This task confirmed correctness, ran gates, and produced the attestation record.

- `scripts/verify/post-phase.sh` — CF-V2.6-10.1-FAIL-COUNT-DEAD + CF-V2.6-10.1-DUPLICATE-A4-PASS
- `scripts/audit/substage-parallelism-flag.sh` — CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP
- `tests/scripts/substage-parallelism-flag.spec.ts` — regression fixtures P2/P3/P4 for 9.10 vs 9.2
- `tests/scripts/citation-linter-rollup.spec.ts` — CF-V2.6-10.2-R9-PRECONDITION (R9 precondition guards)
- `scripts/utilities/citation-linter.ts` — CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING (sub-comments)
- `scripts/hooks/dispatch-jsonl-recorder.sh` — CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS +
  CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE + CF-V2.6-10.5-TUI-JSON-NAMING
- `tests/hooks/dispatch-recorder.spec.ts` — CF-V2.6-10.5-H8-FIXTURE-NAME (task-implementer, no test-impl)
- `tests/hooks/component-telemetry.spec.ts` — CF-V2.6-10.5-T-NA2-DEDUP-COMMENT (5ms Atomics.wait comment)
- `agent-workspace/memory/decisions/038-10.5-agent-type-field-naming.md` — CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD

## Tests Added
- `tests/scripts/substage-parallelism-flag.spec.ts`: 4 cases (P1-P4), including the 9.10 vs 9.2 regression fixtures
- `tests/scripts/citation-linter-rollup.spec.ts`: R9 precondition guards (WebFetch + TaskList existence asserts)

## Invariant Verification

### CF-V2.6-10.1-FAIL-COUNT-DEAD
PASS: grep for bare `FAIL_COUNT` (not `GATE_FAIL_COUNT`) in `post-phase.sh` returns 0 matches.
Only `GATE_FAIL_COUNT` is used throughout (lines 111, 401, 440, 446, 482, 495, 497, 499).

### CF-V2.6-10.1-DUPLICATE-A4-PASS
PASS: Two `[PASS] A.4` print paths exist at lines 232 and 270, but they are in mutually exclusive
`if/else` branches (`if drift-check.sh exists ... else ...`). Cannot both execute. Line 281 comment
documents that no third print exists after both branches. Carryforward correctly closed.

### CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP
PASS: `substage-parallelism-flag.sh:107-112` splits on `.` and compares major + minor as integers.
`[[ "$A_MAJ" -gt "$B_MAJ" ]] || { [[ "$A_MAJ" -eq "$B_MAJ" ]] && [[ "$A_MIN" -ge "$B_MIN" ]]; }`
prevents 9.10 vs 9.2 double-counting. Regression fixtures P2/P3/P4 all pass in test suite.

### CF-V2.6-10.2-R9-PRECONDITION
PASS: `citation-linter-rollup.spec.ts:147-149` asserts `WebFetch` and `TaskList` both appear in the
phase-9 rollup file BEFORE the exitCode check at line 151. Precondition guards are live.

### CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING
PASS: `citation-linter.ts:15,18` has explicit `// tool names` and `// lifecycle event names` sub-comments
inside `BUILTIN_HOOK_EVENTS`. `WebFetch`/`TaskList` grouped with tool names section.

### CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS
PASS: `dispatch-jsonl-recorder.sh:28` has "Format-stability assumption: Claude Code Agent tool result
text contains "agentId: <hex>" as a stable field." comment. Stderr warning at line 69-71 when
`RESULT_AGENT_ID` is empty for PostToolUse-Agent.

### CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE
PASS: `dispatch-jsonl-recorder.sh:59-60` "Field name: agent_type per Decision 023 schema. IMP-1 deferred
a rename to subagent_type for schema parity with tool_input.subagent_type; kept as agent_type for
dispatch.jsonl stability." Comment also at line 84 for PostToolUse sidecar write.

### CF-V2.6-10.5-TUI-JSON-NAMING
PASS: grep shows only `TOOL_USE_ID_JSON` at lines 113, 116, 119. No `TUI_JSON` in the file.

### CF-V2.6-10.5-H8-FIXTURE-NAME
PASS: grep for `test-impl` in `tests/hooks/dispatch-recorder.spec.ts` returns 0 matches.
All H8/H9 fixtures use `task-implementer` (line 403, 443, etc.).

### CF-V2.6-10.5-T-NA2-DEDUP-COMMENT
PASS: `tests/hooks/component-telemetry.spec.ts:453-456` comment reads: "Brief yield between events
to avoid same-millisecond dedup. 5ms is sufficient: the background subshell (7× node -e invocations)
takes ~80-200ms to complete, so by the time the next event fires the previous write has already
landed — this yield just separates ts values, not I/O timing."

### CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD
PASS: `agent-workspace/memory/decisions/038-10.5-agent-type-field-naming.md` exists and references
Decision 023 + IMP-1 deferral rationale.

## Gates
- typecheck: PASS (tsc --noEmit clean across all 5 packages)
- lint: PASS (0 errors; 4 pre-existing web-ui react-refresh warnings, not introduced by this task)
- test: PASS (1302 tests across 98 test suites; 0 failures; core: 1139, web-ui: 163)
- invariants: PASS (all 11 CF invariant greps confirmed closed — see above)

## Deviations from Plan
None. The session plan expected this task to make edits; all 11 CFs were already applied in commit
`2a395d5` (the Phase 10 close commit, authored by the prior session). This task-implementer invocation
served as the verification pass + observation file author. Gates confirm correctness.

The plan's spec for CF-V2.6-10.5-H8-FIXTURE-NAME references `dispatch-recorder.spec.ts:403`
and says to rename `'test-impl'` → `'task-implementer'`. The current line 403 already has
`task-implementer` — either the fix was applied in the prior session or the plan's description was
prophylactic. Either way, no action needed.

## Assumptions Made
1. All 11 CFs were applied in the committed codebase; my role was to verify and gate.
2. The `[PASS] A.4` duplicate at lines 232+270 being in mutually exclusive branches satisfies
   CF-V2.6-10.1-DUPLICATE-A4-PASS (cannot both execute). The carryforward said "dedup the second
   print path" which could mean collapsing to one path, but the current exclusive-branch structure
   is logically equivalent and preferred (each branch prints the appropriate contextual label).
3. The canary write success at `scripts/.canary-11.1-allowed-tools-test.txt` confirms write-path
   anomaly is resolved by the `tools:` → `allowed-tools:` frontmatter rename. Canary deleted.

## Concerns
None. All 11 CFs verified closed. Gates clean.
