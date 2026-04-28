# SC-20 Real I/O Measurement Attestation

**Date**: 2026-04-27
**Runner platform**: win32 (Windows 11 Pro 10.0.26100)
**Git version**: 2.53.0.windows.1
**Node.js version**: v22.22.1
**Produced by**: task-implementer (sonnet/medium, ORCH_SPAWNED, substage 9.6.2)
**Source spec**: `agent-workspace/session-plans/pending/9.6-phase-7-partial-closures-architect.md` §B.1

---

## Methodology

Integration spec: `tests/integration/worktree-isolation.spec.ts` (87 LOC, 3 cases, all `it.skipIf(!hasGitOnPath())`).

The spec exercises real I/O via:
- `mkdtempSync` — creates an isolated tmpdir per case
- `git init -q` + `git commit --allow-empty -q` — initialises a real git repo
- `git worktree add -q -b <name> <path> HEAD` — creates real git worktrees
- `writeFileSync` + `existsSync` — sentinel write/probe across worktree boundaries
- `pruneWorktrees` (`git worktree prune`) + `rmSync` — cleanup

**No mocking. No stubs. Pure subprocess spawnSync calls against the real git binary.**

Command run (run 1 — verbose + JSON reporter for per-case timings):

```bash
pnpm vitest run tests/integration/worktree-isolation.spec.ts --reporter=verbose --testTimeout=30000
pnpm vitest run tests/integration/worktree-isolation.spec.ts --reporter=json --testTimeout=30000
```

---

## Measurements

### Run 1 — JSON reporter (per-case duration from vitest `assertionResults[].duration`)

| Case | Title | duration_ms | passed |
|---|---|---|---|
| Case 1 | file written in worktree-A is absent in worktree-B (forward isolation) | 194.5 | yes |
| Case 2 | file written in worktree-B is absent in worktree-A (reverse isolation) | 183.6 | yes |
| Case 3 | prune removes both worktrees, no sentinel files leak to tmpdirs | 204.2 | yes |
| **Total (tests sum)** | — | **582.3** | **3/3 PASS** |
| **Total (wall-time)** | — | **986** | — |

### Run 2 — verbose reporter (confirmation)

```
Tests:      3 passed (3)
Duration:   967ms (transform 40ms, setup 0ms, collect 44ms, tests 581ms, environment 0ms, prepare 108ms)
```

All 3 cases: PASS. Tests wall-time: 967ms. Test-execution-only duration: 581ms.

### Timing derivation note

Vitest JSON `duration` per `assertionResult` measures wall-clock ms from `it()` body start to end, including all `spawnSync` calls within that case. Each case runs:
- 1× `initRepo()` = `mkdtempSync` + `git init -q` + 2× `git config` + `git commit --allow-empty -q`
- 2× `addWorktree()` = 2× `git worktree add -q`
- 1× `writeFileSync` + 1× `existsSync` (Cases 1/2) or 2× `git worktree prune` + 2× `rmSync` (Case 3)

Sum of per-case durations (582ms) < total wall-time (986ms) because vitest startup, transform, and prepare phases add ~400ms overhead. The 582ms represents pure subprocess I/O time.

---

## SC-20 Budget Threshold

From `agent-workspace/session-plans/pending/9.6-phase-7-partial-closures-architect.md` §B.1:

> PASS if all 3 cases pass and total wall-time < 5000ms total  
> Budget derived from: 3× `mkdtempSync` + 3× `git init -q` + 6× `git worktree add` + cleanup ≈ < 5s on dev hardware.  
> A single `git init -q` + `git commit --allow-empty -q` is < 100ms typical; 6 worktree adds < 1s total; total well under 5s.

---

## Verdict

| Metric | Measured | Budget | Verdict |
|---|---|---|---|
| All 3 cases pass | 3/3 | 3/3 | PASS |
| Total wall-time (ms) | 986 | < 5000 | PASS |
| Total test execution (ms) | 582 | < 5000 | PASS |
| Cases skipped (no git) | 0 | 0 | PASS |

**Overall SC-20 verdict: PASS**

Git is present on PATH (Windows Git Bash 2.53.0). All 3 cases executed with real I/O. No `it.skipIf` guards triggered. Wall-time 986ms is well within the 5000ms budget (19.7% utilisation).

---

## SC-20 Closure

This attestation **replaces** the proxy measurement noted in `agent-workspace/memory/phase-7-complete.md` §B (P3 row: "3/3 PASS in 601ms" — that was real but captured inline in the phase-7 verifier pass without a dedicated attestation file).

The phase-7-complete.md §B P3 entry confirmed SC-34 (the worktree-isolation spec itself), but did not produce a standalone `attestation/sc-20-real-measurement.md` artifact per SC-20's formal closure requirement. This file closes that gap.

SC-20 is formally **CLOSED** as of 2026-04-27 substage 9.6.2.

---

## Raw vitest output (run 1 — verbose)

```
RUN  v2.1.9 C:/htdocs/orch-starter

 ✓ tests/integration/worktree-isolation.spec.ts > worktree isolation > Case 1: file written in worktree-A is absent in worktree-B (forward isolation)
 ✓ tests/integration/worktree-isolation.spec.ts > worktree isolation > Case 2: file written in worktree-B is absent in worktree-A (reverse isolation)
 ✓ tests/integration/worktree-isolation.spec.ts > worktree isolation > Case 3: prune removes both worktrees, no sentinel files leak to tmpdirs

 Test Files  1 passed (1)
       Tests  3 passed (3)
    Start at  23:44:05
    Duration  986ms (transform 39ms, setup 0ms, collect 45ms, tests 598ms, environment 0ms, prepare 110ms)
```
