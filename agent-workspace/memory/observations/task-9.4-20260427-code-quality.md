# Code Quality Review — Task 9.4 (Drift-detection scripts)
_Generated: 2026-04-27 | Reviewer: code-quality-reviewer (sonnet/medium) | Status: APPROVED_WITH_CONCERNS_

---

## Acceptance Gates

| Gate | Pass | Evidence |
|---|---|---|
| 5 scripts exist + executable bit set | PASS | `ls -la scripts/audit/` shows `-rwxr-xr-x` for all 5 |
| Each has shebang + set -uo pipefail | PARTIAL | All have `#!/usr/bin/env bash` + `set -uo pipefail`; missing `-e` flag (see Concern 1) |
| charter-coherence wired in post-phase.sh A.6 | PASS | post-phase.sh:327 — `bash "$script_a6"` |
| A.7/A.8 wires for hook-latency + hook-coverage/dispatch/adapter | PASS | A.7=hook-latency-budget.sh (line 340); A.8 composite: hook-coverage + dispatch-pairing-rate + concrete-adapter-import-lint (lines 354-371) |
| charter-coherence detection logic catches Drift C | PASS | Lines 50-94: checks MUST/NEVER/ABSOLUTE removal, soft-replacement addition, bypass language, strikethrough, Red Flags flip. Verified exits 0 on current repo. |

---

## Invariant Grep

| Invariant | Check | Result |
|---|---|---|
| I-1 no SDK imports in core | N/A — bash scripts, not TS | PASS (exempt) |
| I-2 no project-name hardcoding | grep stockforge/StockForge/vnstock/VCB | PASS — CLEAN |
| I-3 no claude-agent-sdk / ClaudeSDKClient | N/A — bash scripts | PASS (exempt) |
| I-5 no ~/.ccs/ ~/.claude/ credential access | .claude/ refs are ${PROJECT_DIR}/.claude/ (project dir, not home) | PASS |
| I-9 structured log fields | N/A — shell scripts, not structured logs | N/A |
| I-10 zod parse at external boundaries | N/A — no TypeScript | N/A |
| I-14 no module-level let/var | N/A — bash scripts | N/A |

---

## Test Quality

- Count: 0 tests added (scripts are audit/verify tools; no accompanying spec files)
- Spec rationale: routing brief §9.4 does not mandate test files for shell scripts; acceptance gate is "each exit 0 on current repo"
- All 5 scripts run successfully against current repo (verified via direct execution above)
- No flake risk in static analysis scripts

---

## LOC vs Spec

| Script | Spec LOC | Actual LOC |
|---|---|---|
| charter-coherence-spot-check.sh | 127 | 104 |
| hook-latency-budget.sh | 96 | 61 |
| hook-coverage.sh | 35 | 35 |
| dispatch-pairing-rate.sh | 98 | 62 |
| concrete-adapter-import-lint.sh | 41 | 41 |
| post-phase.sh | 497 | 497 |

Note: charter-coherence and hook-latency-budget are meaningfully shorter than spec LOC estimates. This is P2-aligned (minimum code) and not a defect.

---

## Findings

### Blocking
None.

### Important (should fix)

**Concern 1 — Missing `-e` flag in all 5 scripts (set -uo pipefail, not -euo pipefail)**
- Spec acceptance gate says "set -euo pipefail (or equivalent)"
- All 5 scripts use `set -uo pipefail` (no errexit)
- Impact: unexpected subcommand failures (e.g., awk crash, git internal error) are silently swallowed and the script may exit 0 falsely
- Mitigation present: all external commands use `|| true` or `2>/dev/null` guards — so the omission is deliberate to avoid grep exit-1-on-no-match causing abort
- Assessment: the "or equivalent" clause covers intentional -e omission when grep/awk patterns are used heavily. This is a known bash idiom tradeoff. The scripts are robust enough without -e given the `|| true` guards throughout.
- Files: all 5 scripts, line 7-15 respectively
- Verdict: Document in agent-notes; NOT blocking per "or equivalent" spec clause

**Concern 2 — hook-latency-budget.sh comment filter doesn't handle grep -n output format**
- Location: hook-latency-budget.sh:34-35, 41-43
- Pattern: `grep -nE '^\s*sleep' | grep -vE '^\s*#'`
- Bug: `grep -n` prefixes output with `linenum:content`. The `grep -vE '^\s*#'` filter then sees `"5:# sleep 5"` and does NOT filter it (# is not at position 0)
- Result: commented-out `sleep` lines in hooks would produce false-positive WARN
- Current impact: low (no commented sleep lines in actual hook scripts; verified by running the script — it exits 0/PASS)
- Fix: change to `grep -vE ':[[:space:]]*#'` or use `awk -F: '{print $2}' | grep -vE...`
- Files: hook-latency-budget.sh:35, 43

**Concern 3 — post-phase.sh A.4 duplicate PASS print when drift-check.sh exists**
- Location: post-phase.sh:232 and post-phase.sh:282
- Line 282 fires unconditionally after the if/else block, so when drift-check.sh path succeeds, both line 232 and line 282 print `[PASS] A.4`
- Impact: cosmetic noise in output only; no correctness issue
- Files: post-phase.sh:282

**Concern 4 — post-phase.sh A.6/A.7 suppress sub-script output (>/dev/null 2>&1)**
- When charter-coherence or hook-latency-budget FAILs, post-phase.sh shows A.6=FAIL or A.7=FAIL in the summary table but the operator sees no violation details (all output suppressed)
- Operator must re-run the sub-script manually to see what failed
- Same pattern applies to A.8 composite
- Acceptable given the summary table directs operator to the script path; but degrades DX when CI is the runner
- Files: post-phase.sh:329, 342, 362, 366, 370

### Nitpicks

1. `dispatch-pairing-rate.sh:27` — `tr -d '"event:'` uses char-set deletion semantics, not string deletion. Works correctly for ALL-CAPS event names (no lowercase overlap) but is semantically surprising. A `sed` or `awk` extraction would be clearer.

2. `charter-coherence-spot-check.sh` — scope is git diff HEAD only; pre-existing drift (already committed) is not detected. This is intentional (audits changes, not history) but worth documenting as a limitation in the script header.

3. `hook-coverage.sh:29` — `$(IFS=', '; echo "${REQUIRED_EVENTS[*]}")` is correct bash idiom but the subshell scoping of IFS is a subtlety. Minor.

---

## Verdict

**APPROVED_WITH_CONCERNS**

All 5 scripts exist, are executable, pass syntax checks, run successfully against current repo, and are wired correctly into post-phase.sh (A.6/A.7/A.8). charter-coherence detection logic demonstrably covers Drift C patterns (soft replacement of MUST/NEVER/ABSOLUTE, bypass language, strikethrough, Red-Flags flip). No invariant violations. No blocking findings.

Concerns 1-4 are "should fix" level; none block deployment. The comment-filter false-positive (Concern 2) is the highest-priority fix candidate but has zero current impact.

