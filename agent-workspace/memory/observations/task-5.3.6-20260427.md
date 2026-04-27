# Task 5.3.6 — Adapter env-var propagation audit (SC-11)

## Status
DONE_WITH_CONCERNS

## Files Changed
- packages/core/src/modules/sessions/env-propagation.ts (NEW)
- packages/core/src/modules/sessions/env-propagation.spec.ts (NEW, 20 cases)
- packages/core/src/modules/sessions/claude-code-adapter.ts (lines 40-41 import + lines 616-624 buildEnv body)
- packages/core/src/modules/sessions/claude-code-adapter.spec.ts (lines 720-761 new describe block)
- agent-workspace/constitution/architecture.md (lines 84-99 new subsection)
- agent-workspace/memory/sessions/2026-04-27-task-5.3.6-env-propagation.md

## Tests Added
- env-propagation.spec.ts: 20 cases
- claude-code-adapter.spec.ts: 9 cases (6 it.each + 1 TRACEPARENT + 1 OTLP + 1 override)

## Gates
- typecheck: PASS
- lint: PASS
- test (env-propagation): PASS (20/20)
- test (adapter spec): PASS (62/62, +9 new)
- test (full core, excl integration): PASS (1070/1070, +29 from 1041)
- invariants: PASS (arch.md grep count=1)

## Deviations from Plan
- Architect §5.4 specified `it.each` including 'TRACEPARENT' with `process.env[varName] = 'test-value'`. This fails because TracingService mock always injects its own TRACEPARENT via `injectTraceparentIntoEnv()`, overwriting process.env value. Replaced with a dedicated test asserting the TracingService-injected value appears in the result. Behavior is correct per D7 invariant.

## Concerns (DONE_WITH_CONCERNS)
- The TRACEPARENT it.each deviation is a spec interpretation difference, not a bug. The underlying behavior (TRACEPARENT always propagated, TracingService wins) is correct and tested. The architect's exact test text was unimplementable as written due to mock interaction. The replacement test covers the same invariant.

## Assumptions Made
- File at `packages/core/src/modules/sessions/claude-code-adapter.ts` (flat, not in adapters/ subdir) — confirmed by glob.
- Decision 012 path note about `adapters/` subdir was incorrect for this specific file; actual path is correct per 5.3 architect doc front-matter.
- 20 tests in env-propagation.spec.ts (not 5 minimum) — all legitimate coverage, not speculative.
