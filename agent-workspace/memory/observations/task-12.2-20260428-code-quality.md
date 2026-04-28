# Code Quality Review -- Task 12.2
# Audit Hook + Post-Phase A.9 Wire

**Review date**: 2026-04-28
**Reviewer**: claude-sonnet-4-6 (code-quality-reviewer)
**Files under review**:
- scripts/audit/user-intent-coherence-check.sh (186 LOC)
- scripts/verify/post-phase.sh (A.9 block: lines 16, 85, 95, 106, 111, 383-395)
- tests/scripts/user-intent-coherence-check.spec.ts (182 LOC, 5 tests)

---

## Verdict

APPROVED_WITH_CONCERNS

All gates pass (exit 0). No blocking invariant violations. Two IMPORTANT concerns require
follow-up before 12.10 phase-close. Neither prevents 12.2 gate passage today, but
IMPORTANT-1 will cause a false-positive WARN at phase-12-complete.md authoring time.

---

## Invariant Grep

| Invariant | Check Result |
|---|---|
| I-1 no SDK in core | PASS -- N/A, shell script and test, no core package changes |
| I-2 no project-name hardcode | PASS -- 0 matches for stockforge in changed files |
| I-3 no claude-agent-sdk | PASS -- N/A, shell script |
| I-5 no .ccs/.claude/ path access | PASS -- not present in audit script |
| I-6 zero git commits | PASS -- no commits made, confirmed |
| I-9 structured logging | PASS -- N/A, shell script, not domain code |
| I-10 zod parse at boundaries | PASS -- N/A, no new TypeScript domain code |
| I-14 no module-level let/var | PASS -- shell; spec.ts has no module-level mutable state |
| CLAUDE.md hook-paths CLAUDE_PROJECT_DIR | PASS -- audit script line 10, post-phase.sh line 37 |
| post-phase.sh A.9 env inheritance | PASS -- consistent with A.6/A.7/A.8 pattern |

---

## Test Quality

Count: 5 tests (T1-T5). Passes G2 acceptance gate (>=4 tests).

Live run: 5/5 PASS, exit 0 (confirmed 2026-04-28 via pnpm vitest run with tests/vitest.config.ts).

Spec section-F scenario coverage:

| Spec F scenario | Test | Covered |
|---|---|---|
| (a) closure via phase-complete cite | T1 | YES |
| (c) closure via routing-brief cite | T2 | YES |
| (b) closure via user-override decision | T3 | YES |
| FAIL -- no attestation/override/routing below legacy threshold | T4 | YES |
| No user_prompt.txt files at all | T5 | YES |
| WARN -- A=true but cyc > 2 (false-positive scenario) | MISSING | NO |
| WARN -- legacy implied coverage (total > LEGACY_THRESHOLD) | MISSING | NO |

Behavior-focused: YES. Each test runs the real bash script in a fresh tmpdir with
controlled fixtures, asserts exit code and output string match.

Assertion quality: OK. Exit code assertions use descriptive failure messages.
Output assertions use /PASS/i and /FAIL/i patterns. No bare toBeTruthy.

Isolation: PASS. All tests use mkdtempSync(join(tmpdir())) -- OS tmpdir,
never the repo tasks/ folder. Cleanup is in finally blocks.

Flake risk: LOW. spawnSync with timeout:15000 on lightweight bash script.
No network, no randomness, no real timers. Deterministic per fixture.

---

## Layering and Adapter Check

N/A -- no TypeScript domain or adapter code introduced. Shell scripts and test spec only.
No NestJS imports in changed files.

---

## Spec-Sanity Fold-In (section F compliance)

Decision 040 G2 acceptance gate: audit script authored + wired into post-phase.sh.
Both verified present and functional.

user-intent-coherence.md section F specifies:
1. Read all tasks/*/user_prompt.txt -- IMPLEMENTED (mapfile + find)
2. Extract USER-CRITICAL items (quan trong / important / bat buoc / critical)
   -- IMPLEMENTED (grep -inE with diacritic variants)
3. Locate (a) phase-complete, (b) user-override decision, or (c) routing-brief
   -- IMPLEMENTED (has_attestation / has_override / has_routing)
4. FAIL if none of (a)/(b)/(c) -- IMPLEMENTED (exit 1 when FAIL_COUNT > 0)
5. WARN if carried > 2 cycles without (a) closure -- PARTIALLY MISIMPLEMENTED
   (WARN fires even when A=true -- see IMPORTANT-1)

Overall spec compliance: HIGH with one WARN-condition misread.

---

## Findings

### Blocking (must fix before merge)

None.

---

### Important (should fix before 12.10)

**IMPORTANT-1: WARN false-positive when A=true but cyc > 2**

File: scripts/audit/user-intent-coherence-check.sh:75

What happens: cycles_without_closure() returns the count of phase-complete.md files
that do NOT cite the slug. Line 75 checks cyc -gt 2 inside the branch where A||B||C
is true. This means WARN fires even when A=true (a phase-complete already cites the
slug) if there are more than 2 prior phase-complete files that did not.

Live confirmation: created a tmpdir with 11 phase-complete files + 1 citing slug.
A.9 emitted: [WARN] slug -- carried 11 phases without phase-close citation
(evidence: (a)phase-complete). Self-contradictory: says without citation while
showing (a)phase-complete as evidence.

Spec section F clause 5: WARN if any USER-CRITICAL item has been carried > 2 cycles
without (a) closure. The phrase without (a) closure constrains WARN to fire only when
(a) is absent.

Future impact: at 12.10, phase-12-complete.md will cite feat_04 (establishing A=true).
But cyc will then be 10 (10 prior files do not cite slug). A.9 will WARN perpetually
on a properly closed item in every future phase-close run.

Fix: scripts/audit/user-intent-coherence-check.sh line 75.
  Change: if [[ cyc -gt 2 ]]; then
  To:     if [[ cyc -gt 2 ]] and not A; then
When (a) is established, promote to PASS regardless of legacy cycle count.

Constitution ref: user-intent-coherence.md section F clause 5

---

**IMPORTANT-2: Missing test T6 for A=true + cyc>2 scenario**

File: tests/scripts/user-intent-coherence-check.spec.ts (no T6)

Evidence: T1 covers A=true with cyc=0 (single phase-complete cites slug). No test
covers A=true + multiple prior non-citing phases. The IMPORTANT-1 false-positive is
not caught by the existing suite.

Recommended T6 (pseudocode):
  it T6 -- phase-complete cites slug but 5 prior phases do not -- expect PASS not WARN
    slug = feat_95_old_with_closure
    user_prompt.txt contains quan trong item
    write 5 phase-N-complete.md WITHOUT citing slug
    write phase-6-complete.md WITH slug in text
    run(dir) --> expect code=0, expect /PASS/, expect not /WARN/

Constitution ref: coding-principles.md Testing Rules; user-intent-coherence.md section F

---

### Nitpicks (document only, not blocking)

**NITPICK-1: Dead code at cycles_without_closure line 39**

File: scripts/audit/user-intent-coherence-check.sh:39

Evidence: The grep -rl slug ... > /dev/null at line 39 discards all output and its
exit code is never captured (next pipeline resets it). The function return value
comes from wc -l at line 40. Line 39 has zero functional effect. Likely a leftover
from a draft iteration where 0-based logic was considered.

Fix: Remove line 39 entirely.
Constitution ref: P2 (simplicity), P3 (surgical)

**NITPICK-2: Stale section banner in post-phase.sh**

File: scripts/verify/post-phase.sh:430

Evidence: Line 430 reads Run all 8 checks sequentially but CHECK_ORDER now has
9 items (A.1-A.9). File header line 2 correctly says 9 checks. Banner was not
updated when A.9 was added.

Fix: Change 8 checks to 9 checks at line 430.
Constitution ref: P3 (surgical -- changes should be internally consistent)

---

## Live Gate Confirmations

| Gate | Result |
|---|---|
| pnpm vitest run with tests/vitest.config.ts | 5/5 PASS exit 0 |
| bash audit script against live repo | exit 0, 2 WARN (both expected) |
| grep -c A.9 scripts/verify/post-phase.sh | 8 occurrences (>=5 required) |
| CHECK_PLANNED[A.9]=false at post-phase.sh:111 | Confirmed mandatory |
| A.9 in CHECK_ORDER at post-phase.sh:85 | Confirmed |

---

## WARN State Analysis (live run)

Both WARNs in the live audit run are expected at Phase 12 mid-execution state.

feat_03_continue_after_phase4: LEGACY_THRESHOLD path. No B/C evidence found.
11 phase-complete files > threshold=4. Task predates citation discipline.
Correct WARN, non-blocking.

feat_04_continue_before_phase_8: B=true (Decision 040 cites slug + user_override
keyword) and C=true (phase-12-routing-brief.md cites slug). A=false because no
phase-complete.md cites the slug yet -- Phase 12 in progress. cyc=11 > 2 -- WARN
fires correctly at this moment.

HOWEVER: due to IMPORTANT-1, after phase-12-complete.md is authored at 12.10
establishing A=true, cyc will still be 10. The WARN will persist incorrectly.
This is the future false-positive the IMPORTANT-1 fix would prevent.

---

## Next Action

APPROVED_WITH_CONCERNS. Orchestrator should:

1. Route IMPORTANT-1 (WARN false-positive at user-intent-coherence-check.sh:75)
   to 12.9 housekeeping batch. Time-sensitive: must land before 12.10 to avoid
   false WARN in the final gate run.

2. Route IMPORTANT-2 (missing T6) to 12.9 alongside IMPORTANT-1.

3. Log NITPICK-1 and NITPICK-2 to agent-notes.

4. Proceed with 12.2 gate passage. No blocking issues prevent advance to 12.3.
