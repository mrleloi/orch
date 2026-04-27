# Task 7.2.4 — IMPL: vitest cases (dispatch-recorder + sc18-realworld extension)

## Status
DONE

## Files Changed
- `tests/benchmarks/__fixtures__/dispatch-fixture.jsonl`: 0→4 lines (new fixture)
- `tests/hooks/dispatch-recorder.spec.ts`: lines 1-372 (modified, +41 LOC from 331)
- `tests/benchmarks/sc18-realworld.spec.ts`: lines 1-110 (modified, +21 LOC from 89)
- `agent-workspace/memory/sessions/2026-04-27-task-7.2.4-vitest-fixture.md`: new session note (≥3000 bytes)

## Tests Added
- `tests/hooks/dispatch-recorder.spec.ts`: +2 cases (T2 exact-keys schema, T4 round-trip via loader) → total 8
- `tests/benchmarks/sc18-realworld.spec.ts`: +2 cases (T4 fixture replay, T5 markdown dataSource) → total 5

## Gates
- typecheck: PASS (0 new TS errors in modified files; pre-existing errors in other files unchanged)
- lint: PASS (ESLint not configured at root for tests/; pre-existing condition)
- test: PASS (114/114 hooks suite; 5/5 sc18 benchmark suite)
- invariants: PASS
  - C.1 dispatch-recorder.spec.ts exists: PASS
  - C.2 ≥4 cases: PASS (8)
  - C.3 fixture exists: PASS
  - C.4 fixture parses: PASS (ok)
  - C.5 INV-10 reporter in file: PASS (1 match)
  - C.6 sc18 extended: PASS (4 matches)
  - C.7 no fake timers: PASS (0)
  - C.8 no platform gate: PASS (0)
  - C.9 no toBeLessThan: PASS (0)
  - C.10 hooks suite 114 PASS: PASS (GO)
  - C.11 benchmark suite 5 PASS: PASS
  - C.12 TypeScript clean: PASS
  - C.13 ESLint: PASS (n/a — no root config)
  - C.14 INV-10 reporter line in output: PASS
  - C.15 I-6 no commits: PASS (0 commits)
  - C.16 staged: PASS (3 files staged)

## Deviations from Plan
1. T4 assertion uses `r.taskId.includes('task-implementer')` not `includes('toolu_T4')` — taskId is built from agent_type not dispatch_id per loader implementation
2. sc18 T4 uses agent_type substrings not dispatch_ids for same reason
3. Removed pre-existing unused `computeSubstageImprovement` import from sc18-realworld.spec.ts and `writeFileSync` from dispatch-recorder.spec.ts (both were TS6133 violations)
4. Net +41 LOC (target ≤30 ideally, hard cap +60; at 41 within hard cap)

## Concerns
None.

## Assumptions Made
1. The architect's B.2.c snippet `r.taskId.includes('fix-tu-1')` was illustrative; actual taskId derivation makes dispatch_id invisible in the record (confirmed by reading loadTaskFinishRecordsFromDispatchJsonl source)
2. C.13 ESLint gate is non-operational at root level — pre-existing condition shared with all prior 7.2.x tasks
3. INV-10 reporter em-dash in existing file (`—` not `-`) matches C.14 grep which uses `[INV-10 reporter] dispatch-jsonl-recorder.sh` (just prefix, not full line)
4. The +41 LOC delta (not ≤30 ideally) is justified: T4 requires reading back the written ts_ms for comparison, which is inherently multi-step
