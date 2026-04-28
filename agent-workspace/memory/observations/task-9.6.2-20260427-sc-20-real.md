# Task 9.6.2 — SC-20 Real I/O Measurement Attestation

## Status
DONE

## Files Changed
- agent-workspace/memory/attestations/sc-20-real-measurement.md (new, ~75 LOC)
- agent-workspace/memory/observations/task-9.6.2-20260427-sc-20-real.md (this file)

## Tests Added
- None (task is attestation-only; ran existing integration spec as the gate)

## Gates
- typecheck: PASS (pnpm typecheck — all 5 packages clean, 0 errors)
- lint: PASS (pnpm lint — 4 pre-existing web-ui warnings, 0 errors)
- integration_test: PASS (3/3 cases, 986ms wall-time)
- invariants: PASS (no production code touched; I-6 = 0 git ops)

## SC-20 Gate Commands Executed
```
pnpm vitest run tests/integration/worktree-isolation.spec.ts --reporter=verbose --testTimeout=30000
# → 3/3 PASS, 986ms wall-time

pnpm vitest run tests/integration/worktree-isolation.spec.ts --reporter=json --testTimeout=30000
# → per-case: Case1=194.5ms, Case2=183.6ms, Case3=204.2ms

test -f agent-workspace/memory/attestations/sc-20-real-measurement.md
# → EXIT 0 (file exists)
```

## Measured Timings
| Case | duration_ms | status |
|---|---|---|
| Case 1 (forward isolation) | 194.5 | PASS |
| Case 2 (reverse isolation) | 183.6 | PASS |
| Case 3 (prune cleanup) | 204.2 | PASS |
| Total tests sum | 582.3 | — |
| Total wall-time | 986 | — |

SC-20 budget threshold: < 5000ms total. Utilisation: 19.7%. **PASS**.

## Deviations from Plan
- Plan §B.1 mentioned `tee /tmp/sc-20-output.log` — on Windows, `/tmp/` maps to `C:\dev\tmp\` which may not exist; ran without tee, captured output inline. No functional impact: all timings captured from JSON reporter output instead.
- Per-case duration not visible in verbose reporter; used JSON reporter (`--reporter=json`) to extract `assertionResults[].duration` per case. This is equivalent and provides more precise data.

## Concerns
None. All cases passed. Wall-time well within budget.

## Assumptions Made
1. SC-20 acceptance criterion in §B.1 refers to the worktree-isolation.spec.ts integration spec (87 LOC, 3 cases) as the measurement vehicle.
2. The 5000ms budget applies to total wall-time (not just test-execution time). Both metrics comfortably pass.
3. Platform is win32 with Git Bash; all `it.skipIf(!hasGitOnPath())` guards resolved to `false` (git is present), so all 3 cases ran as real I/O tests.
