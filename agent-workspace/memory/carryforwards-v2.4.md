---
title: Phase 9 v2.4 carryforward register (new CFs discovered during Phase 9)
authored_by: opus 4.7 main session #44
authored_date: 2026-04-27
status: ACTIVE
---

# Phase 9 v2.4 Carryforward Register (new CFs)

This file tracks NEW carryforwards discovered during Phase 9 v2.4 fan-out (substages 9.1..9.4 reviewer pass + fixes). The pre-existing v2.4 carryforwards (CF-25..CF-34 + dogfood + M1+M2+MAJ-1+MAJ-2+T11) are tracked in `phase-8-complete.md §4` and `agent-workspace/session-plans/pending/phase-9-v2.4-carryforward-closure.md §11`.

## CF-35 — `scripts/audit/config-style-lint.ts` `checkRequiredOrder` off-by-one

**Status**: OPEN (production bug)
**Discovered by**: 9.2 task-implementer (`a8e0fdf9330f5a9c1`) while writing FAIL-path tests
**Verified by**: 9.2 code-quality reviewer (`a0372b42ec0be254e`)
**Source code**: `scripts/audit/config-style-lint.ts:971`
**Bug**: predicate `sections.findIndex((s, i) => i > lastFoundIdx - 1 && match(s.heading, req))` — `i > lastFoundIdx - 1` is equivalent to `i >= lastFoundIdx`, which allows `findIndex` to match at the same position as the last found element. Out-of-order sections are silently swallowed.
**Correct predicate**: `i > lastFoundIdx` (strictly after last found index).
**Affected paths**: `checkAgentOrder` (line 981), `checkReferenceOrder` (line 1000), `checkHookProfileOrder` (line 1019). All three FAIL paths are unreachable.
**Unaffected**: `checkDisciplineOrder` (line 988) and `checkCommandOrder` (line 1006) use independent direct-index comparisons.
**New 9.2 tests do NOT expose the bug**: LR-05 PASS tests use correct paths; LR-05 FAIL tests use `checkDisciplineOrder`/`checkCommandOrder`. A dedicated agent-out-of-order FAIL test is needed to expose CF-35.
**Recommended target**: 9.x in-phase fix (small change; high value: fixes broken linter for 3 categories) OR DEFER-V2.5 if budget tight.
**Fix scope**: 1 char change at `scripts/audit/config-style-lint.ts:971` + add 3 FAIL-path tests (one each for agent/reference/hook-profile out-of-order).

## CF-36 — `scripts/audit/hook-latency-budget.sh` comment-filter false-positive

**Status**: OPEN (should-fix)
**Discovered by**: 9.4 code-quality reviewer (`a015c0657349a9ddb`) — PASS_WITH_CONCERNS verdict
**Source code**: `scripts/audit/hook-latency-budget.sh:35` and `:43`
**Bug**: pattern `grep -nE '^\s*sleep\s+[0-9]' | grep -vE '^\s*#'` does not work as intended. `grep -n` prefixes lines with `linenum:content` (e.g., `5:# sleep 2`), so `^\s*#` cannot match — the `#` is not at start-of-line position 0 anymore.
**Current impact**: ZERO (no commented-out `sleep` lines exist in current hook scripts).
**Risk**: false-positive WARN the moment someone adds a comment like `# sleep 2 # removed for latency`.
**Fix**: change `grep -vE '^\s*#'` to `grep -vE ':[[:space:]]*#'` to match after the linenum colon prefix.
**Recommended target**: DEFER-V2.5 unless surfaced earlier by a real hook edit.

## CF-37 — `scripts/verify/post-phase.sh` A.6/A.7/A.8 sub-script output suppression (DX degradation)

**Status**: OPEN (DX degradation; non-blocking)
**Discovered by**: 9.4 code-quality reviewer (`a015c0657349a9ddb`)
**Source code**: `scripts/verify/post-phase.sh:329, 342, 362, 366, 370`
**Issue**: A.6/A.7/A.8 sub-scripts run with `>/dev/null 2>&1`, fully suppressing output. When a gate FAILs, the operator sees only the summary table — no inline diagnostic detail. Must manually re-run the sub-script to see the violation messages.
**Fix**: capture output, emit only on failure:
```bash
output=$(bash script 2>&1)
rc=$?
if [[ $rc -ne 0 ]]; then
  printf '%s\n' "$output"
fi
```
**Recommended target**: DEFER-V2.5 (operator-facing improvement; not blocking phase closure).

## Cosmetic (no CF) — `scripts/verify/post-phase.sh:282` duplicate PASS print

**Status**: documented (cosmetic only)
**Discovered by**: 9.4 code-quality reviewer
**Issue**: When the drift-check.sh path succeeds, both line 232 and line 282 emit a PASS message for A.4 — visual noise but no correctness impact.
**Fix**: remove unconditional line 282 or wrap in else-branch. Optional polish during 9.7 or v2.5.
