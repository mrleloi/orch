# Task 5.3.10 — Parallel-vs-Serial Benchmark (SC-18)

## Status
DONE

## Files Changed
- scripts/benchmarks/parallel-vs-serial.spec.ts (NEW — the benchmark spec)
- agent-workspace/memory/parallel-benchmark-result.md (NEW — result table, 4 rows from determinism runs)
- tests/vitest.config.ts (MODIFIED — added `scripts/**/*.spec.ts` to include glob)
- agent-workspace/memory/sessions/2026-04-27-task-5.3.10-benchmark.md (NEW — session log)

## Tests Added
- scripts/benchmarks/parallel-vs-serial.spec.ts: 1 case ("parallel <= 80% of serial wallclock (>=20% improvement)")

## Gates
- typecheck: PASS (0 errors on benchmark spec file; pre-existing errors in other test files are unchanged)
- lint: PASS (benchmark file not in any package lint scope; no new errors introduced)
- test: PASS (4/4 consecutive runs via `pnpm run test:hooks "parallel-vs-serial"`)
- invariants:
  - I-1 (daemon-dumb / no LLM): PASS — synthetic setTimeout only, no Anthropic API calls
  - I-6 (no git commit): PASS — no commit made
  - SC-18 threshold (>=20% improvement): PASS — observed ~75% improvement consistently

## Deviations from Plan
- Added `: number[]` type annotations to `serialRuns`/`parallelRuns` arrays (architect body omitted them; strict TypeScript requires it)
- Added `node:fs/promises`, `node:path`, `node:url` imports for `recordBenchmarkResult` helper (helper defined in spec file, not a sibling — Karpathy P3)
- Added explicit `30_000ms` test timeout (vitest default 5000ms insufficient for 3-run serial/parallel loop)

## Assumptions Made
- `tests/vitest.config.ts` is the correct config to extend for scripts-level specs (confirmed by project structure: root `pnpm test` uses Jest per-package; `pnpm run test:hooks` uses vitest for hooks + scripts)
- The `recordBenchmarkResult` helper belongs in the spec file (P3: simplest placement; no other consumer)
- 200ms per-task fixture is sufficient (yields ~75% improvement, architect's concern about <25% only applies at timer-overhead regime which 200ms avoids)

## Concerns
None. The benchmark is deterministic at 75% improvement across all 4 test runs.
