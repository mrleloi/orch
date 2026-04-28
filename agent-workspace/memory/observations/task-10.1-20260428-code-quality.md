---
task: 10.1
title: Code Quality Review — CF-V2.5 Script Bug Fixes (3 scripts)
date: 2026-04-28
agent: code-quality-reviewer (sonnet, ORCH_SPAWNED)
status: PASS_WITH_CONCERNS
---

# Task 10.1 — Code Quality Review: CF-V2.5 Script Bug Fixes

## Verdict
PASS_WITH_CONCERNS

## Files Reviewed
- scripts/audit/substage-parallelism-flag.sh (140 LOC, 2-pass state machine rewrite)
- scripts/audit/charter-coherence-spot-check.sh (108 LOC, from 9.4, no change)
- scripts/verify/post-phase.sh (504 LOC, from 9.4/8.2.2)

All three are new files relative to HEAD (single init commit repo).

---

## Invariant Grep

| Invariant | Check | Result |
|---|---|---|
| I-2 no project-name hardcoding | grep stockforge/StockForge/vnstock/VCB | PASS — only occurrence is post-phase.sh:239 inside a grep detection pattern, not hardcoded logic |
| I-5 no ~/.ccs/ ~/.claude/ access | grep ~/.ccs/.claude | PASS — all .claude/ refs are ${PROJECT_DIR}/.claude/ (project-local) |
| set -uo pipefail (not -euo) | head check all 3 | PASS — lines 17, 15, 34 respectively; CF-36 lesson applied |
| no eval | grep eval | PASS — none |
| I-1/I-3/I-9/I-10/I-14 | N/A bash scripts | EXEMPT |

---

## Core Fix Verification: 2-Pass State Machine (substage-parallelism-flag.sh)

Prior blocking finding (9.7): script was a no-op; SUBSTAGE_A/PARALLEL_LIST checked on same line, body never reached; PAIRS_CHECKED=0, exits 0 silently.

New architecture:
- Pass 1: while read loop over routing brief, builds SUBSTAGE_PARALLEL[id] and SUBSTAGE_OUTPUT[id] associative arrays
- Pass 2: iterates array keys, checks output file intersection per pair

Collision detection verified by live probe with synthetic routing brief:
  [FAIL] G.7 collision: 9.1 and 9.2 both declare output file: packages/core/src/shared.ts
  Exit: 1

No-collision path: exits 0. SKIP (exit 2) fires when no routing brief or no parallel_safe_with entries.

Edge case: parallel_safe_with on last line of file (no following heading) -- PASS. The while read loop processes all lines regardless of position.

---

## Test Quality

- Tests added: 0 (consistent with 9.4 pattern; acceptance probes substituted)
- bash -n: all 3 scripts pass syntax check
- Acceptance probes conducted live:
  - Collision detection: PASS
  - Clean path: PASS
  - Last-line edge case: PASS
  - charter-coherence bypass filter mixed-line edge case: PASS
  - post-phase.sh FAIL_COUNT propagation: exit 1 confirmed with planted failing A.6 script
- Flake risk: NONE

---

## Bash Idiom Quality

substage-parallelism-flag.sh:
- Associative array usage is idiomatic
- Unquoted $PEER_LIST (line 75) and $PEERS (line 103): word-splitting intentional and safe
- SUBSTAGE_OUTPUT append syntax correct
- ${SUBSTAGE_OUTPUT[$SUB_B]:-} uses :- default for set -u safety
- BASH_REMATCH accesses all guarded by preceding [[ =~ ]] match

charter-coherence-spot-check.sh:
- Unicode arrow in grep patterns works correctly in C locale (no -P flag used; basic grep handles multi-byte)
- Two-step bypass filter tested: line with both bypass pattern and NO-arrow filtered out; separate genuine bypass line caught
- Check 1 fires correctly for deletion-with-no-replacement AND for deletion-with-soft-replacement

post-phase.sh:
- Local variable declarations safe: unbound locals accessed only via ${var:-} expansion at line 397
- All A.6/A.7/A.8 case blocks set exit_code in all branches; no unbound access path
- A.8 partial-script-presence handled correctly

---

## Findings

### Blocking
None.

### Important (should fix in v2.6)

C-1 — FAIL_COUNT and GATE_FAIL_COUNT are always equal; one is dead code
- Location: post-phase.sh:111-112, 402-403, 501
- Both increment together at lines 402-403. No code path increments one without the other.
- Comment at line 499 describes a scenario that cannot occur.
- FAIL_COUNT is redundant; GATE_FAIL_COUNT alone suffices for exit code at line 501.
- NOT blocking: redundant code causes no incorrect behavior.

C-2 — Duplicate A.4 PASS print (pre-existing Concern 3 from 9.4 review, still present)
- Location: post-phase.sh:233 and post-phase.sh:283
- When drift-check.sh exists and passes, two [PASS] A.4 lines appear in output.
- Not introduced by this diff. Cosmetic noise only.

C-3 — substage-parallelism-flag.sh dedup guard breaks for N.10+ substages
- Location: substage-parallelism-flag.sh:105
- [[ "$SUB_A" < "$SUB_B" ]] is lexicographic string comparison. "9.10" < "9.2" in string sort (1 < 2 char comparison), which would cause double-counting for 10+ substage phases.
- Current phases use at most 8-9 substages. Risk low but real.
- Fix: use version sort or integer comparison after stripping major component.
- NOT blocking for current phase structures.

### Nitpicks

1. charter-coherence-spot-check.sh:79 -- filter uses "NO," (comma), not "NO." (period). If a Red Flags line ends with period instead of comma, it would not be filtered. Current constitution uses comma; minor brittleness.

2. post-phase.sh A.6/A.7/A.8 sub-script output suppressed (>/dev/null 2>&1). Pre-existing concern from 9.4 review; operator must re-run sub-scripts manually to see violation details.

3. substage-parallelism-flag.sh is phase-10/phase-9 specific by variable name. When Phase 11 arrives, routing brief path selection requires an edit. Low priority per YAGNI.

---

## Summary

The core fix (2-pass state machine) directly resolves the 9.7 blocking no-op finding. Collision detection verified functional. All invariants pass. Bash idioms sound. C-1 and C-3 are minor carryforward concerns; C-2 was already in agent-notes. None block 10.1 close.
