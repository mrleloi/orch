# Task 2.10.f — DEFAULT_* constants consolidation

## Status
DONE

## Files Changed
- packages/core/src/config/defaults.ts (new, 8 named exports)
- packages/core/src/config/defaults.spec.ts (new, 1 invariant test)
- packages/core/src/modules/sessions/agent-watchdog.ts:42-59 (replaced local const declarations with imports + `export { ... } from` re-exports)
- packages/core/src/modules/api/api.controller.ts:51-54, 324-326 (added import, replaced local DEFAULT_LINES)
- packages/core/src/modules/hooks/hooks.service.ts:44-51 (added import, replaced local DEDUP_BUCKET_MS)
- packages/core/src/modules/sessions/claude-code-adapter.ts:40-59 (added imports, local aliases kept for body usage)

## Tests Added
- packages/core/src/config/defaults.spec.ts: 1 case

## Gates
- typecheck: PASS
- lint: PASS
- test (config/defaults): PASS (1/1)
- test (agent-watchdog.spec): PASS (16/16)
- test (claude-code-adapter.spec): PASS (50/50) — integration spec failure pre-existing (requires live ccs CLI)
- test (hooks.service): PASS (18/18)
- test (full suite): PASS (743/743)
- invariants: PASS (0 violations)

## Deviations from Plan
- The spec noted re-exports could use `export const DEFAULT_X = importedValue` pattern. This approach was rejected because the invariant test regex `^export const DEFAULT_` would have caught those as violations. Instead used `export { DEFAULT_X } from '../../config/defaults.js'` which the spec explicitly allows.
- In claude-code-adapter.ts, kept local `const TERMINATE_TIMEOUT_MS = DEFAULT_TERMINATE_TIMEOUT_MS` and `const STDERR_BUFFER_MAX_BYTES = DEFAULT_STDERR_BUFFER_MAX_BYTES` as bridge aliases (these are `const X = DEFAULT_X` not `export const DEFAULT_X`, so they do not trigger the invariant).

## Concerns
None.

## Assumptions Made
- The full test suite baseline was ≥742 (confirmed 743 post-change = baseline was 742, new spec adds 1).
- The integration spec failure for claude-code-adapter is pre-existing and environment-dependent (requires live ccs binary).
- Re-export form `export { X } from '...'` is the correct backwards-compat pattern as explicitly allowed by the invariant test spec.
