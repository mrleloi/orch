# Spec Compliance Review — Task 9.1 CF-29 Fix

Date: 2026-04-27
Reviewer: spec-compliance-reviewer (re-review after prior FAIL)
Scope: layered-resolver.ts CF-29 fix only; MAJ-2 + T11 already PASS.

## Verdict: PASS

## Contract Match Matrix

| Gate | Evidence | Match |
|---|---|---|
| layered-resolver.ts LOC ≤ 500 | `wc -l` → 484 | ✓ |
| function resolveUserHome removed | grep returns 0 matches | ✓ |
| function resolveUserConfigPath removed | grep returns 0 matches | ✓ |
| function buildDefaultLayers removed | grep returns 0 matches | ✓ |
| named re-export block present (lines 480-484) | `export { resolveUserHome, resolveUserConfigPath, buildDefaultLayers } from './layer-builder.js';` | ✓ |
| node:path import removed | lines 13-15 import only zod, js-yaml, domain/profile | ✓ |
| typecheck PASS | `tsc --noEmit` exits 0, no output | ✓ |
| lint PASS | eslint exits 0, no output | ✓ |
| 14/14 tests PASS | jest: 14 passed, 14 total | ✓ |

## Non-Blocking Concerns

1. `layered-resolver.ts:5` — file header comment still says "Imports: zod, js-yaml, node:path only."
   `node:path` was removed when the 3 functions moved to layer-builder.ts. The comment is stale.
   Not a functional defect but creates misleading documentation.

2. Re-export syntax uses named re-export (preferred form), not star re-export. Correct.

3. `layer-builder.ts` confirmed unchanged at 102 LOC.

## Missing Requirements: none

## Over-Building: none

## overall_9_1_status_after_fix: PASS
(CF-29 fix now PASS; MAJ-2 + T11 already PASS from prior review)
