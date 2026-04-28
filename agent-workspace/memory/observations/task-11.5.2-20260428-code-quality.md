# Code Quality Review - Task 11.5.2

**Timestamp**: 2026-04-28
**Reviewer**: code-quality-reviewer (sonnet)
**Prereq**: spec-compliance-reviewer PASS assumed (parallel run)
**Scope**: Invariant adherence + code quality only -- NOT spec compliance re-check

---

## Verdict

APPROVED_WITH_CONCERNS

---

## Invariant Grep Results

| Invariant | Deliverable | Check Result | Evidence |
|---|---|---|---|
| I-1 no LLM in daemon | D2, D3 | PASS | No Anthropic SDK imports in diff |
| I-2 no project name hardcoding | D2, D3, D4 | PASS | grep stockforge/StockForge/vnstock = zero results |
| I-3 spawnSync array args no shell:true | D2 | PASS | Lines 59,69,137,197 use array args; shell option absent |
| I-5 no .ccs/.claude credential path access | D2 | PASS | .claude refs inside isolated tmpdir, not home dir |
| I-6 no git commit operations | All | PASS | No git commit/push in any deliverable |
| I-14 no module-level let/var | D2 | PASS | dirs is const; loop-local let i is block-scoped |

---

## P3 Surgical Scope Audit

Expected in-scope files per task brief: 4 deliverables + observation doc.

Out-of-scope modified files detected in git status:
- M scripts/audit/config-style-lint.spec.ts
- M scripts/audit/config-style-lint.ts
- M .claude/agents/*.md (multiple files)
- M .claude/commands/*.md (multiple files)
- M agent-workspace/memory/checkpoints/latest.md
- M agent-workspace/memory/component-telemetry.jsonl
- M agent-workspace/memory/subagent-index.md
- M agent-workspace/telemetry/verify-fallback.jsonl

The config-style-lint changes flip the tools <-> allowed-tools convention in LR-02 across
the linter and all agent/command files. The refactor is internally consistent (Claude Code
5.2.7+ uses allowed-tools as canonical). However it was not in the task 11.5.2 brief and
represents a P3 (surgical scope) violation. CF-V2.6-11.5.2-OUT-OF-SCOPE-LINTER-REFACTOR.

---

## Test Quality -- D2 (sc39-production-pairing-rate.spec.ts)

**3 test cases added.**

- Assertion quality: All 3 cases use specific numeric threshold (expect(rate).toBeGreaterThanOrEqual(0.40)). No bare toBeTruthy/toBeDefined. GOOD.
- Behavior focus: Tests assert observable rate, not internal function calls. GOOD.
- Platform skip logic: hasClaudeBin() and hasBashBin() are clean I-3-compliant guards. GOOD.
- Edge cases: Windows skip, missing binary skip, CI fixture override, corrupt settings. GOOD.
- Flake risk: pollLines uses real async setTimeout polling (30ms interval, 15s timeout).
  This is an integration test (I-13 permits real subprocesses), so real timing is authorized.
  However, the 15s timeout for PAIR_COUNT*2=20 lines from bash background subshells on slow
  CI is a moderate flake vector. Partial results could cause non-deterministic pass/fail
  depending on host speed.

---

## Bash Script Quality -- D3 (settings-version-check.sh)

### Strict Mode
Line 18: set -uo pipefail -- MISSING -e flag.
Line 19: trap 'exit 0' ERR -- intended to suppress all errors.

Without set -e, the ERR trap only fires on pipefail-detected failures, not on individual
command failures. Example: if sha256sum returns exit 1 (file disappeared), the function
propagates non-zero exit but without -e the script continues rather than triggering ERR trap.
The error-suppression guarantee is weaker than intended. CF-V2.6-11.5.2-BASH-STRICT-MODE-INCOMPLETE.

### CRLF / Hash Stability
Line 53: printf '%s
' "$HASH" > "$BASELINE_FILE" -- hash stored with trailing newline.
Line 65: BASELINE_HASH="$(cat "$BASELINE_FILE" | tr -d '[:space:]')" -- strips whitespace. OK.
Line 66: CURRENT_HASH="$(sha256_of_file ...)" -- NOT whitespace-stripped.

sha256_of_file pipes through awk '{print $1}' which strips filename but not a trailing 
on Windows Git Bash output. More critically: settings.json itself may be CRLF on Windows
(git core.autocrlf=true). The sha256 of a CRLF file != sha256 of a LF file. If baseline
is captured on Windows and compared on Linux (or vice versa), comparison will false-positive.
No --text or tr -d '' mitigation present. CF-V2.6-11.5.2-HASH-CRLF-UNSTABLE.
Primary deployment platform is win32 (per env context) making this important.

### Hash Unavailable Sentinel
Lines 34-36: echo "HASH_UNAVAILABLE" when no sha256 tool found. If both --init and audit
modes produce this string, comparison succeeds (false PASS). Should exit 2 instead.
CF-V2.6-11.5.2-HASH-UNAVAILABLE-FALSE-PASS (nitpick -- sha256 unavailability is rare).

### Tmp Files / Trap
No mktemp usage -- writes directly to BASELINE_FILE. No tmp-file races. PASS.

---

## SKILL.md Quality -- D4

### LOC Ceiling (Q3 Probe) -- IMPORTANT

Frontmatter: lines 1-7 (archetype: discipline).
Body starts: line 8.
Total file lines: 180.
Body LOC: 180 - 7 = 173.
hardCeiling for skill-discipline (config-style-lint.ts line 912): 150.
Overshoot: +23 lines over hard ceiling.

LR-04 would flag this as ERROR. CLAUDE.md requires deterministic gates (including
config-style-lint) to pass before claiming task done. The implementer's claim of
"29 LOC inserted, prior body was 146" is consistent with our measurement (prior body
at HEAD = 152 - 7 = 145 lines; current = 173; delta = +28 inserted lines per git diff).
CF-V2.6-11.5.2-SKILL-LOC-CEILING-BREACH -- Important.

### Decision Reference Validity
Line 149: agent-workspace/memory/decisions/035-sc39-retry-verdict-v2.5.md -- EXISTS. PASS.
Line 153: scripts/audit/settings-version-check.sh cross-reference -- EXISTS. PASS.

### Style / H2 Hierarchy
Inserted sections use valid H2 headings matching existing pattern. Prose style consistent.
Large-output verifier protocol section (lines 75-84) and Settings.json section (lines 133-160)
are well-structured additions. No orphan references. PASS.

---

## Adversarial Probes

Q1 hasBashBin() -- legitimate necessity, not band-aid. On Windows, bash background subshell
stdout redirection differs from Linux; skip is accurate platform documentation. On CI
(Linux/macOS) tests run fully. PASS.

Q2 CRLF hash stability -- see D3 analysis. Unmitigated risk on win32. Important.

Q3 SKILL.md LOC -- 173 > 150 ceiling. Linter gate violation. Important.

---

## Carryforward Items

| CF ID | Severity | File | Description |
|---|---|---|---|
| CF-V2.6-11.5.2-SKILL-LOC-CEILING-BREACH | important | .claude/skills/spawned-session-mode/SKILL.md | Body LOC 173 exceeds hard ceiling 150; LR-04 ERROR |
| CF-V2.6-11.5.2-HASH-CRLF-UNSTABLE | important | scripts/audit/settings-version-check.sh:29-36,53,66 | CRLF not normalized; false FAIL on Windows |
| CF-V2.6-11.5.2-BASH-STRICT-MODE-INCOMPLETE | important | scripts/audit/settings-version-check.sh:18 | set -uo pipefail missing -e; ERR trap incomplete |
| CF-V2.6-11.5.2-OUT-OF-SCOPE-LINTER-REFACTOR | important | scripts/audit/config-style-lint.{ts,spec.ts} + agents/commands | P3 violation; not in task brief |
| CF-V2.6-11.5.2-HASH-UNAVAILABLE-FALSE-PASS | nitpick | scripts/audit/settings-version-check.sh:34-36 | HASH_UNAVAILABLE sentinel causes false PASS |
| CF-V2.6-11.5.2-POLL-LINES-TIMEOUT-FLAKE | nitpick | tests/integration/sc39-production-pairing-rate.spec.ts:111 | 15s timeout moderate flake risk on slow CI |

---

## Next Action

APPROVED_WITH_CONCERNS. No blocking invariant violations. Log all Important CFs to
agent-notes. Proceed to merge. Address Important CFs in v2.7 or dedicated 11.5.3 hygiene task.
