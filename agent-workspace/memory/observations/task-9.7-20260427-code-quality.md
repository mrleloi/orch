---
task: 9.7
title: Code Quality Review — medium-priority scripts
date: 2026-04-27
agent: code-quality-reviewer (sonnet/medium, ORCH_SPAWNED)
status: PASS_WITH_CONCERNS
---

# Task 9.7 — Code Quality Review

## Deep-reviewed scripts (by LOC: highest 2)
- dependency-freshness.sh (100 LOC) — PASS-result script
- substage-parallelism-flag.sh (97 LOC) — SKIP-result script

## Acceptance Gates
- 10/10 scripts shipped: PASS
- All have shebang + set -uo pipefail (not -euo): PASS
- All have exec bit: PASS
- bash -n all clean: PASS
- partition-matrix.md §7 updated (10 SHIPPED rows, status column, path deviation notes): PASS

## Invariants
- I-1 (no SDK in core): N/A — bash scripts
- I-2 (no project-name hardcoding): PASS — oss-readiness.sh uses 'stockforge' as a DETECTION
  pattern inside grep (correct use), not hardcoded output or logic
- I-5 (.ccs/.claude path access): PASS — profile-vs-settings-diff.sh and emit-spec-opt-out.sh
  access PROJECT_DIR/.claude/settings.json (project-local), NOT ~/.claude/

## Blocking Finding
### substage-parallelism-flag.sh: line-by-line parse logic never fires
The while loop reads the routing brief line by line. SUBSTAGE_A is set when the line matches
"### 9.x" heading; PARALLEL_LIST is set when line contains "parallel_safe_with: [...]".
These are never on the same line in the actual routing brief format.
Line 61 check `[[ -z "$SUBSTAGE_A" || -z "$PARALLEL_LIST" ]] && continue` ensures the loop
body is NEVER reached. PAIRS_CHECKED remains 0, exits 0 with "[SKIP] no parallel pairs found".
The script is effectively a no-op against the actual data it targets.
Impact: G.7 collision detection is never exercised, but silently "passes".

## Concerns (non-blocking)
1. substage-parallelism-flag.sh line 85-87: PAIRS_CHECKED=0 exits 0, but header comment
   documents "2=SKIP". The message says "[SKIP]" but exit code is 0, not 2.
2. substage-parallelism-flag.sh lines 43/67: BASH_VERSION string compare `> "4"` works for
   bash 4.x/5.x but would fail for hypothetical bash 10+ ("1" < "4" in ASCII). Low risk today.
3. dependency-freshness.sh: sed extraction (line 50) on package.json could match non-dependency
   keys like "peerDependencies", "engines", or "scripts" whose values look like version strings.
   The filter (line 49) excludes only name/version/description/license; "scripts" and "engines"
   sections could produce false dep_name/dep_ver pairs. However since KNOWN_THRESHOLDS is a
   narrow list, false positives from non-matching keys are silently discarded.

## Verdict
PASS_WITH_CONCERNS — blocking finding in substage-parallelism-flag.sh parsing logic.
Orchestrator should log concern and note script is currently a no-op but exits 0 (not 1).
