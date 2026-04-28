# SC-39 Self-Evolution Loop — Dry Run Output

> Generated 2026-04-27 by task-implementer (sonnet/medium, ORCH_SPAWNED).
> This is the DRY-RUN. No source files were mutated. No commits made.

## 1. Rollup Generation

Command: `pnpm tsx scripts/utilities/rollup-telemetry.ts --phase 9`

Result:
```
rollup-telemetry: wrote C:\htdocs\orch-starter\agent-workspace\memory\component-rollup-phase-9.md
```

Exit code: 0. Rollup generated successfully.

**Rollup summary:**
- Source: component-telemetry.jsonl (6,561 valid events)
- Subagent index: 225 rows
- Total component rows: 16

Key rows relevant to RULE evaluation:
| Type | Name | Count | p99 Dur (ms) | p99 Tokens | Top Failure Modes |
|------|------|------:|-------------:|-----------:|-------------------|
| agent | unknown-agent | 162 | 193,909 | 4,115 | A:1 |
| hook | Bash | 2,678 | 154,152 | 6,204 | A:13 |
| hook | Write | 305 | 447,617 | 14,548 | A:2 |

## 2. RULE Evaluation Against Phase 9 Rollup

Applying the 4 RULES from `.claude/agents/telemetry-analyst.md §Phase 3`:

**RULE-1** (Model Bump latency — p99_duration_ms > 60,000 AND current routing = sonnet):
- `agent::unknown-agent`: p99=193,909ms > 60,000ms. FIRES.
- No other agent-type rows.
- **Result: 1 proposal generated.**

**RULE-2** (Agent Prune — count >= 5 AND success_rate < 0.6):
- `agent::unknown-agent`: count=162, success_rate=1.000. No trigger.
- **Result: 0 proposals.**

**RULE-3** (Parallelization Gate — count >= 3 AND top_failure_mode = C):
- Top failure modes observed: A (tool abort/cancellation). No C (premature wind-down) in any row.
- **Result: 0 proposals.**

**RULE-4** (Model Bump tokens — component_type == "agent" AND p99_tokens_real > 100,000):
- `agent::unknown-agent`: p99_tokens_real=4,115. Not > 100,000. No trigger.
- **Result: 0 proposals.**

**Total proposals: 1 (RULE-1 on agent::unknown-agent).**

## 3. Sample Proposal (DRY-RUN — not written to production path)

Sample content of what `phase-9-routing-recommendations.md` would contain:

```markdown
# Phase 9 Routing Recommendations

> Generated 2026-04-27T16:30:00.000Z by telemetry-analyst against
> `agent-workspace/memory/component-rollup-phase-9.md`.
> Total rollup rows considered: 16. Total proposals: 1.

## Model Bumps

- **agent::unknown-agent** sonnet → opus — p99_duration_ms=193909 exceeds 60s threshold;
  complex synthesis warrants opus. cites rollup row: agent::unknown-agent.

## Agent Prunes

- (no proposals at this time — all components within thresholds)

## Parallelization Gate Adjustments

- (no proposals at this time — all components within thresholds)
```

**Note**: This proposal was NOT written to `agent-workspace/memory/phase-9-routing-recommendations.md`
as this is a DRY-RUN. The actual telemetry-analyst subagent would write it at phase-boundary dispatch time.

**Important caveat on the RULE-1 proposal**: The unknown-agent p99=193,909ms reflects full
session wall-time for background subagent invocations, not a single-tool latency spike. This
is expected behavior for a complex multi-step agent. The "sonnet → opus" recommendation from
RULE-1 is mechanically correct per the rule definition but may not be operationally meaningful
for the unknown-agent sentinel (which by definition represents agents of mixed types).
Decision 034 authors should note this semantic gap.

## 4. Citation Linter Result

### 4a. Default mode (--input) against sample proposal

Command: `pnpm tsx scripts/utilities/citation-linter.ts --input /tmp/sample-proposal.md`

Result:
```
OK: all citations present
EXIT: 0
```

**Citation linter PASS** — all proposal bullets contain the required `cites rollup row: <type>::<name>` substring.

### 4b. Rollup mode (--phase 9) against component-rollup-phase-9.md

Command: `pnpm tsx scripts/utilities/citation-linter.ts --phase 9`

Result:
```
FAIL  hook::WebFetch — expected: scripts/hooks/WebFetch.sh
FAIL  hook::TaskList — expected: scripts/hooks/TaskList.sh
2 missing component(s).
EXIT: 1
```

**Rollup mode FAIL (pre-existing gap)**: `WebFetch` and `TaskList` are Claude Code built-in
tool events that appeared in Phase 8-9 telemetry but are absent from the `BUILTIN_HOOK_EVENTS`
exemption set in citation-linter.ts. This is a known issue related to CF-25 (citation-linter
dedup; Phase 9.6 scope). The FAIL does not indicate a hallucination in the rollup or proposals;
it reflects a missing-exemption in the linter's BUILTIN set.

**Action needed** (not 9.5 scope): Add `'WebFetch', 'TaskList'` to `BUILTIN_HOOK_EVENTS` in
`scripts/utilities/citation-linter.ts`. Routed to CF-35 (reserved slot) or 9.6 CF-25 scope.

## 5. Dry-Run Verdict

| Step | Result |
|------|--------|
| rollup-telemetry.ts --phase 9 | OK (exit 0; 6,561 events; 16 component rows) |
| RULE evaluation | 1 proposal (R1 fires; R2/R3/R4 no-fire) |
| Sample proposal generated | YES (content above; not written to production path) |
| Citation linter (default mode, --input) | CLEAN (exit 0) |
| Citation linter (rollup mode, --phase 9) | 2 pre-existing FAILs (WebFetch, TaskList not in BUILTIN set) |

**Overall dry-run assessment**: Loop is mechanically runnable end-to-end. The rollup step works.
The RULE evaluation produces a deterministic proposal. The citation linter passes on the proposal
itself. The rollup-mode citation linter has a known gap (BUILTIN_HOOK_EVENTS missing 2 new tool
names) that needs a 1-line fix in CF-25/9.6 scope.

**Reviewer ACK requested**: Does this dry-run output demonstrate sufficient loop functionality
for SC-39 evaluation? Key finding: the loop CAN run, but the SC-39 gate artifacts show multiple
FAIL conditions (unknown-agent fraction=1.00, event volume=6,561 < 10,000, pairing_rate=0.00)
that suggest Decision 034 verdict should be DEFER_AGAIN or DEFER-V2.5 rather than ENABLE_RETRY.
