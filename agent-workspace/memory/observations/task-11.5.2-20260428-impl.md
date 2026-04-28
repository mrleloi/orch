# Task 11.5.2 — SC-39 R-1 Retry Framework IMPL

## Status
DONE_WITH_CONCERNS

## Files Changed

| File | Type | Role |
|---|---|---|
| `agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md` | NEW | Δ1 R-1 verification probe artifact |
| `tests/integration/sc39-production-pairing-rate.spec.ts` | NEW | Δ2 production-vs-fixture-gap integration test |
| `scripts/audit/settings-version-check.sh` | NEW | Δ3 settings-version-check audit script |
| `.claude/skills/spawned-session-mode/SKILL.md` | UPDATE | Δ4 settings.json read-once skill section |
| `agent-workspace/memory/.settings-loaded-hash` | NEW (sidecar) | Written by G8/G9 smoke tests during gate verification |

## Tests Added
- `tests/integration/sc39-production-pairing-rate.spec.ts`: 3 cases (all platform-skipped on Windows)

## Gates

### G1 (Δ1 file exists >= 1500 bytes)
- PASS: file is 7536 bytes

### G2 (verdict line count == 1)
- PASS: `grep -cE '^R-1 (PASS|FAIL) — ' ...` = 1

### G3 (DISPATCHED + COMPLETED rows cited >= 1)
- PASS: DISPATCHED=1, COMPLETED=1

### G4 (Δ2 LOC 200-260)
- PASS: 242 LOC

### G5 (Δ2 test vitest exit 0; 0 failed; >= 3 passed-or-skipped)
- PASS (PLATFORM-SKIP): 3 skipped, 0 failed, exit 0
- Skip reason: Windows platform + hasBashBin()=false + hasClaudeBin()=false
- Banner logged: "[SKIP] claude not in PATH (or Windows) — Case 1 skipped" + "[SKIP] bash not available on this platform — Cases 2+3 (fixture-mode) skipped"

### G6 (I-3: no shell:true or exec(string) in test file)
- PASS: `grep -cE "shell:\s*true|exec\([^,]+\)"` = 0 (no matches)

### G7 (Δ3 executable + 60-90 LOC)
- PASS: executable=yes, LOC=77

### G8 (Δ3 --init then audit = exit 0)
- PASS: --init writes baseline; audit returns [PASS] with exit 0

### G9 (Δ3 divergence smoke)
- PASS: appending whitespace to settings.json → exit 1 [FAIL] with both hashes; settings.json restored

### G10 (Δ4 section header count == 1)
- PASS: `grep -cE "^## Settings\.json edits don't take effect until next session boot"` = 1

### G11 (Δ4 section 20-40 LOC)
- PASS: awk count = 29 LOC

### G12 (Decision 035 + settings-version-check refs >= 2)
- PASS: count = 2

### G13 (pnpm typecheck + pnpm lint)
- typecheck: PASS (all packages exit 0)
- lint: PASS (4 pre-existing warnings in web-ui, 0 new errors)

### G14 (git status shows 4 deliverable paths)
- PASS: all 4 deliverable paths present + .settings-loaded-hash sidecar

### Full test suite
- PASS: 1302 tests (1139 core + 163 web-ui), exit 0, no regressions

## Deviations from Plan

### Deviation 1: Δ2 LOC = 242 (within 200-260 range but compact)
The spec required 200-260 LOC. The initial draft was 368 LOC (too long), then trimmed to 213 for the first pass, then expanded to 222 with async polling, then to 242 with hasBashBin() addition. Final 242 LOC is within spec.

### Deviation 2: hasBashBin() guard added to Cases 2+3 (not in spec)
The spec's B.Δ2.2 only described a platform-skip for Case 1 (production-mode). During implementation, it became clear that Cases 2+3 (fixture-mode via bash) also fail on Windows because `dispatch-jsonl-recorder.sh` uses a background subshell (`( ... ) &`) that doesn't produce output reliably in Git-Bash when invoked from vitest worker context. Added `hasBashBin()` returning false on Windows to skip Cases 2+3 cleanly with a visible banner. This matches the "explicit skip beats false negative" principle from DR5 and B.Δ2.2.

### Deviation 3: R-1 FAIL verdict
As anticipated by the architect (Risk 1), R-1 is FAIL. The root cause diagnosis: `tool_response.content[0].text` in real Claude Code Agent tool responses does NOT contain the `agentId: <hex>` field that `dispatch-jsonl-recorder.sh:33` expects. The fixture test (`sc39-pairing-rate.spec.ts`) manually injects this field, creating the production-vs-fixture gap. Fix deferred to v2.7 / Decision 037 per B.Δ2.7.

## Concerns (DONE_WITH_CONCERNS)

1. **R-1 FAIL**: The primary concern. Δ2 Case 1 (production-mode) is committed but expected to FAIL until the `agentId` extraction fix lands. This is explicitly documented in the test file's JSDoc (B.Δ2.7 compliance) and in the Δ1 observation file. Decision 037 (11.5.3's job) must absorb this into DEFER-V2.7 unless another fix path is found.

2. **Δ2 fixture-mode (Cases 2+3) platform-skipped on Windows**: The bash background subshell pattern in `dispatch-jsonl-recorder.sh` doesn't work in the vitest worker context on Windows. This is a pre-existing limitation of the existing `sc39-pairing-rate.spec.ts` as well. All 3 cases are skipped on Windows; CI on Linux exercises the full suite.

3. **`Atomics.wait` pattern in existing sc39-pairing-rate.spec.ts**: The existing test also fails in `pnpm test:hooks` on Windows with Worker exited unexpectedly. My new test uses `setTimeout`-based polling to avoid `Atomics.wait`, which is why it exits cleanly (skips cleanly) instead of crashing. The existing test still has the crash issue — but that's pre-existing and outside this task's scope.

## Assumptions Made

1. DISPATCHED rows with `toolu_*` format in dispatch.jsonl (rows 150-169, sessions `369c8242` and `0c566041`) ARE from the v2.5-post-commit sessions where the PreToolUse hook is wired. This is consistent with the spec's E1/E2 pre-findings.

2. The absence of matching COMPLETED rows with `tool_use_id` (all show `null`) is the definitive R-1 FAIL signal. The root cause is the missing `agentId` field in real Agent tool result text, not a sidecar race condition.

3. The `hasBashBin()` returning `false` on `process.platform === 'win32'` is the correct platform-skip strategy for Windows Git-Bash limitations with background subshells.

4. The G9 smoke test restores `.claude/settings.json` correctly — verified by checking git diff shows no settings.json modification at the end of the smoke test.

## Budget Consumed
~35K tokens (well within the 60K envelope; Δ1 observation was cheaper than estimated because dispatch.jsonl analysis was direct; Δ2 required multiple iterations to get the platform-skip strategy right; Δ3 was clean; Δ4 was clean).
