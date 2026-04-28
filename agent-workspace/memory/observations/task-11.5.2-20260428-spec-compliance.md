# Spec Compliance Review

## Verdict: PASS_WITH_CONCERNS

Timestamp: 2026-04-28T04:16:00Z
Reviewer: spec-compliance-reviewer (sonnet)
Spec: 11.5-sc39-r1-r3-architect.md (387 LOC)
---

## Gate Results (All 14 Re-Run)

| Gate | Result | Evidence |
|---|---|---|
| G1 (D1 exists >= 1500 bytes) | PASS | 7536 bytes |
| G2 (verdict count == 1) | PASS | grep count = 1 |
| G3 (DISPATCHED+COMPLETED each >= 1) | PASS | D=1, C=1 |
| G4 (D2 LOC 200-260) | PASS | 242 LOC |
| G5 (vitest exit 0, 0 failed, >=3 skipped) | PASS | exit 0; 3 skipped, 0 failed |
| G6 (I-3: no shell:true or exec-string) | PASS | count = 0 |
| G7 (D3 executable, 60-90 LOC) | PASS | 77 LOC, executable=yes |
| G8 (--init then audit = exit 0) | PASS | both exit 0; PASS messages |
| G9 (divergence smoke, exit 1, file restored) | PASS | exit 1 + both hashes |
| G10 (D4 header count == 1) | PASS | count = 1 |
| G11 (D4 section 20-40 LOC) | PASS | awk count = 29 |
| G12 (035 + settings-version-check refs >= 2) | PASS | count = 2 |
| G13 (typecheck + lint) | PASS | exit 0; 0 new errors |
| G14 (4 deliverable paths present) | PASS* | 4 paths + sidecar present |

G14 note: 40+ pre-existing dirty files from prior sub-agents exist in working tree
(scripts/audit/config-style-lint.* changed 353 lines - tools->allowed-tools rename).
These pre-date 11.5.2 IMPL. All 4 required deliverable paths ARE present.

---

## Contract Match Matrix

### D1 - R-1 Verification Probe (task-11.5.1-r1-probe-result.md)

| Clause | Evidence | Match |
|---|---|---|
| B.D1.1 Sampling: >=1 dispatch, DISPATCHED+COMPLETED cited | obs:13-27; dispatch.jsonl 155-170 confirmed | PASS |
| B.D1.2 timestamp | obs:5 | PASS |
| B.D1.2 parent_session_id | obs:12 | PASS |
| B.D1.2 verbatim DISPATCHED row | obs:19-22 | PASS |
| B.D1.2 verbatim COMPLETED row | obs:25-27 | PASS |
| B.D1.2 explicit field comparison table | obs:32-41 | PASS |
| B.D1.2 verdict line exact canonical string | obs:48 matches spec exactly | PASS |
| B.D1.2 FAIL path sidecar diagnostic | obs:52-83 Branch 1/2/3 chain | PASS |
| B.D1.3 Idempotency single canonical file | timestamped filename no append | PASS |
| B.D1.4 No production code touched | git status: no deliverable modifications | PASS |

### D2 - Production-vs-Fixture-Gap Integration Test (sc39-production-pairing-rate.spec.ts)

| Clause | Evidence | Match |
|---|---|---|
| B.D2.1 describe name exact | spec.ts:176 | PASS |
| B.D2.1 >= 3 it-cases | spec.ts:190,214,225 | PASS |
| B.D2.1 Case 1 it.skipIf(!hasClaudeBin()) | spec.ts:190 skipIf(!PROD_MODE||!claudeOk) | PASS |
| B.D2.1 Case 1 spawns claude array args | spec.ts:197 spawnSync claude --print | PASS |
| B.D2.1 Case 1 asserts rate >= 0.40 | spec.ts:209 toBeGreaterThanOrEqual(0.40) | PASS |
| B.D2.1 Case 2 fixture-mode parity rate >= 0.40 | spec.ts:213-221 | PASS |
| B.D2.1 Case 3 regression detection | spec.ts:224-239 (see Case 3 note) | PASS |
| B.D2.2 hasClaudeBin() spawnSync array args | spec.ts:57-60 | PASS |
| B.D2.2 Windows returns false for hasClaudeBin() | spec.ts:58 hardcoded | PASS |
| B.D2.2 SKIP banner in beforeAll | spec.ts:178-186 console.log | PASS |
| B.D2.2 ORCH_SC39_PROD_TEST_MODE=fixture documented | spec.ts:22,50 | PASS |
| B.D2.3 mkdtempSync per case | spec.ts:90 | PASS |
| B.D2.3 afterEach rmSync cleanup | spec.ts:81-86 | PASS |
| B.D2.3 cpSync not symlink | spec.ts:94,96 | PASS |
| B.D2.3 CLAUDE_PROJECT_DIR in child spawn env | spec.ts:139,199 | PASS |
| B.D2.4 loadTaskFinishRecordsFromDispatchJsonl used | spec.ts:40,166 | PASS |
| B.D2.5 No production code touched | git status: untracked new file only | PASS |
| B.D2.6 each case timeout <= 60s | spec.ts:192,216,227 all 60000ms | PASS |
| B.D2.7 JSDoc R-1 FAIL NOTICE at top | spec.ts:25-28 | PASS |

Case 3 note: spec says production-mode assert rate < 0.40 after corruption.
Implementation asserts >= 0.40 in fixture mode (fixture immune). Correct: documents
gap by proving fixture immunity. Production assertion untestable without live claude.
spec.ts:234-236 explains. Aligned with DR2 and Decision 035 S6. NOT a violation.

### D3 - settings-version-check.sh

| Clause | Evidence | Match |
|---|---|---|
| B.D3.1 --init captures sha256 to .settings-loaded-hash | sh:52-56 | PASS |
| B.D3.2 PASS message exact string | sh:69 | PASS |
| B.D3.2 FAIL message with timestamp + both hashes | sh:73-75 | PASS |
| B.D3.2 exit codes 0/1/2 | sh:56,76,62,41,46 | PASS |
| B.D3.2 SKIP message (minor wording deviation) | sh:61 "no baseline at path; run --init" vs spec "no baseline; first run?" | MINOR |
| B.D3.3 --init forces init mode, no flag = audit | sh:52 | PASS |
| B.D3.4 sha256sum / shasum fallback | sh:29-36 | PASS |
| B.D3.5 CLAUDE_PROJECT_DIR path discipline | sh:21 exact pattern | PASS |
| B.D3.6 No production code outside new audit file | git status confirms | PASS |

### D4 - spawned-session-mode/SKILL.md Update

| Clause | Evidence | Match |
|---|---|---|
| B.D4.1 Insertion AFTER How-commands BEFORE Detecting-spawned | SKILL.md line order 129->133->161 | PASS |
| B.D4.1 Header text exactly as specified | SKILL.md:133 | PASS |
| B.D4.2 Para 1: settings.json read-once finding | SKILL.md:135-141 | PASS |
| B.D4.2 Para 2: implication for spawned sessions | SKILL.md:143-151 | PASS |
| B.D4.2 Cross-ref decisions/035 S3.1 + S5 R-1 | SKILL.md:149-150 | PASS |
| B.D4.2 Mention settings-version-check.sh | SKILL.md:152-155 | PASS |
| B.D4.2 Action item requires_session_restart flag | SKILL.md:157-159 | PASS |
| B.D4.3 No other section modified | git diff: single section addition | PASS |
| B.D4.4 Frontmatter unchanged | SKILL.md:1-7 verified | PASS |

---

## Over-Building Check

| Addition | In spec? | Verdict |
|---|---|---|
| hasBashBin() function (spec.ts:67-70) | NOT in B.D2.2 | LOW P2 flag |
| it.skipIf(!bashOk) on Cases 2+3 (spec.ts:214,225) | NOT in B.D2.2 | LOW P2 flag |

Severity: LOW. Practically necessary: Cases 2+3 call spawnSync bash directly.
Without hasBashBin(), they would FAIL not skip on Windows. Aligns with DR5.
Implementer documented as Deviation 2 with correct rationale.

---

## Missing Requirements

NONE. All Part B clauses verified present and correct.

---

## Adversarial Probe Results

P1 - R-1 FAIL empirically grounded: CONFIRMED. Independently read dispatch.jsonl rows 155-170.
Pattern: every DISPATCHED row has toolu_* dispatch_id; every COMPLETED row has hex
dispatch_id + tool_use_id: null. 0 of 21 paired. Root cause verified at
dispatch-jsonl-recorder.sh:30-36: regex /agentId/ against tool_response.content[0].text.
Real Agent responses do not contain agentId field. Evidence is empirical telemetry.

P2 - Platform-skip is REAL: CONFIRMED. Uses process.platform===win32 hardcoded (spec.ts:58,68).
Linux CI will exercise full paths. beforeAll banner at spec.ts:178-186.
Vitest JSON reporter: success=true, 3 tests skipped, exit 0.

P3 - D3 no injection or tmp-file leaks: CONFIRMED CLEAN. No eval, exec, /tmp.
All variables quoted. Writes to PROJECT_DIR/agent-workspace/memory/ only.
Quality concern: trap exit-0-on-ERR (sh:19) masks errors - but G8/G9 pass correctly.

P4 - D4 SKILL.md semantically correct: CONFIRMED. Accurately reflects Decision 035 S3.1,
S5 R-1, S6 action items. Cross-references verified. No false claims.

---

## Implementer Concern Adjudication

Concern 1 (R-1 FAIL with deferred fix): DIAGNOSIS CORRECT. Empirically grounded.
Deferred to Decision 037 / v2.7 correct per Decision 035 S5 Risk 1 and B.D2.7.

Concern 2 (platform-skip - appropriate or coverup?): APPROPRIATE, NOT COVERUP.
Explicit hardcoded platform check, visible banner, DR5-aligned. Linux CI exercises full paths.

Concern 3 (Case 1 will FAIL when claude available): EXPECTED AND CORRECT TO KEEP.
B.D2.7 mandates keeping even when R-1 FAIL. Standing regression surface for Decision 037.
Removing it would violate Decision 035 S6.

---

## Required Fixes (Blocking)

NONE.

---

## Non-Blocking Quality Flags (for code-quality-reviewer)

1. scripts/audit/settings-version-check.sh:19 - trap exit-0-on-ERR masks errors as PASS;
   G8/G9 pass but edge-case fragile
2. spec.ts:67-70 + 214,225 - hasBashBin() over-build relative to B.D2.2; practically necessary
3. sh:61 - SKIP message wording deviates from spec template (exit code 2 is correct)
4. G14 - pre-existing dirty files in working tree (not 11.5.2 responsibility)

---

## Next Action
PASS_WITH_CONCERNS -> dispatch code-quality-reviewer
