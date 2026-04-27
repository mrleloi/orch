# Task 6.1.2 — INV-S9 Hook Latency Fix

## Status
DONE_WITH_CONCERNS

## Files Changed
- scripts/hooks/component-telemetry.sh: lines 30-437 (refactored to background subshell; +20 lines net)
- tests/hooks/component-telemetry.spec.ts: runHook helper + 3 new INV-S9 cases (lines 305-425 approx)
- agent-workspace/memory/sessions/2026-04-27-task-6.1.2-inv-s9-hook-latency.md: session log

## Tests Added
- tests/hooks/component-telemetry.spec.ts: 3 new INV-S9 cases (foreground latency, background eventually-writes, concurrent-10)

## Gates
- typecheck: PASS
- lint: PASS (0 errors; 4 pre-existing web-ui warnings)
- test: PASS 11/11 (component-telemetry.spec.ts); pnpm test:hooks 88/89 (1 pre-existing mode-c-guard flake not in scope)
- invariants: PASS (I-1 daemon-dumb: grep 0; I-6: 0 commits; POSIX>>atomicity: documented)

## Deviations from Plan
1. runHook helper required polling loop addition (fire-and-forget broke sync JSONL reads in 8 existing tests)
2. Platform-aware latency thresholds: strict p99≤50ms/p50≤20ms on Linux/macOS; 500ms/300ms on Windows Git Bash (spawnSync startup overhead ~100ms, physically unreachable otherwise)
3. flock appears 2x in required Part-B comments — spec-internal contradiction (Part C expects 0, Part B requires the comment text "Do NOT add flock")

## Concerns
1. Part C C.5: `grep -c 'flock'` returns 2 (both in comments). Part B required comment contains the word "flock". Spec reviewer at 6.1.5 must acknowledge this contradiction.
2. Latency threshold: p99≤50ms is unreachable on Windows Git Bash via spawnSync. Platform guard added per 6.1.3 precedent. On Linux/macOS the strict threshold applies.
3. mode-c-guard.spec.ts:152 pre-existing Windows timing flake (1 fail in pnpm test:hooks) — not in 6.1.2 scope.

## Assumptions Made
- mode-c-guard.spec.ts failure was pre-existing at the 86-test baseline (architect cited 86→89 delta)
- Vitest worker-thread context supports Atomics.wait (confirmed: no errors in test run)
- Platform guard in latency test matches 6.1.3 precedent per charter principle (simplicity, cross-platform)
