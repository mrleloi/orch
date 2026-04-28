# Task 9.1-fix-cf29 — layered-resolver.ts cleanup (CF-29 duplicate removal)

## Status
DONE

## Files Changed
- packages/core/src/config/layered-resolver.ts: lines 478-569 replaced with 5-line re-export block; unused `join` import (node:path) removed

## LOC Before / After
- Before: 569
- After: 480

## Diff Summary
1. Deleted the `// ── Path resolution helpers ──` section header and all three function definitions:
   - `resolveUserHome` (lines 488-497)
   - `resolveUserConfigPath` (lines 510-523)
   - `buildDefaultLayers` (lines 536-569)
   - Associated JSDoc blocks above each function
2. Removed unused `import { join } from 'node:path'` (was only used by the now-deleted functions)
3. Added re-export block at the same location:
   `export { resolveUserHome, resolveUserConfigPath, buildDefaultLayers } from './layer-builder.js';`

## Tests Added
- None (backward compat verified via existing suite)

## Gates
- typecheck: PASS (pnpm run typecheck — all 5 packages clean)
- lint: PASS (pnpm run lint — packages/core clean; web-ui warnings are pre-existing)
- test: PASS (14/14 — jest --testPathPatterns="layered-resolver.spec" in packages/core)
- invariants:
  - loc_le_500: pass (480 lines)
  - no internal references to deleted functions: pass (grep confirms no remaining calls)
  - backward compat (no test file changes): pass

## Deviations from Plan
- Also removed the now-unused `import { join } from 'node:path'` which was only consumed by the three deleted functions. This is required for lint to pass (unused import error). Plan did not explicitly mention this but it is a necessary consequence of the deletion.

## Assumptions Made
- The `join` import was exclusively used by the three deleted functions (verified by grep — all remaining `join` calls in the file are `Array.prototype.join`, not `path.join`).
- Pre-existing telegram bot.spec.ts failure (1 test) is unrelated to this change (confirmed by nature of failure: bot instantiation test, not config layer test).

---

```yaml
---
status: DONE
substage: 9.1-fix-cf29
files_changed: [packages/core/src/config/layered-resolver.ts]
loc_before: 569
loc_after: 480
gates:
  typecheck: PASS
  lint: PASS
  layered-resolver-tests: 14/14
  loc_le_500: pass
next_action: { command: spec-compliance-reviewer, args: { substage: 9.1, scope: cf29-only } }
---
```
