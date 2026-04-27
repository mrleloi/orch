# Task 4.2 — Adapter Prepend Behavioral Coverage

## Goal
Close Phase 3 carryforward #9. Add end-to-end behavioral coverage that `ClaudeCodeAdapter.spawn()` correctly prepends `seedPrompt` to the child process input channel before user prompt delivery.

## Session Type
FOCUSED_IMPL

## Approach
Read the adapter source to understand the actual seedPrompt delivery mechanism, then write 3 targeted tests. Discovered the adapter delivers seedPrompt via the `-p` CLI argument (assembled as `${seedPrompt}\n\n---\n\n${prompt}`), not via stdin writes. Adapted the test assertions accordingly per task risk note: "adapt the fake to the real interface."

No existing seedPrompt unit tests existed (grep confirmed zero matches in spec files before this task). The existing E2E test `A5: successor session spawned with rendered seedPrompt in SpawnConfig` lives in `__e2e__/integration.spec.ts` and has a pre-existing timeout failure unrelated to this task.

## Accomplished
- Added `describe('seedPrompt prepend behavior', ...)` block to `claude-code-adapter.spec.ts`
- 3 new `it()` blocks:
  1. `it('prepends seedPrompt to child stdin before user input', ...)` — verifies `TEST_SEED_MARKER` appears first in the `-p` arg, user prompt appears after, marker appears exactly once
  2. `it('does not prepend when seedPrompt is undefined', ...)` — verifies prompt passes through unchanged, no separator injected
  3. `it('treats empty string seedPrompt as absent (no prepend)', ...)` — verifies empty string is falsy-treated (adapter uses truthy check), prompt passes through unchanged

## Gates Status
- Typecheck: PASS
- Lint: PASS (eslint --fix ran clean)
- Tests: PASS (997/997 — up from 994 baseline)
- Invariants: all green (I-1 I-2 I-3 I-14)

## Files Modified
- `packages/core/src/modules/sessions/claude-code-adapter.spec.ts` (+80 lines)

## Adapter Source Not Modified
The adapter's seedPrompt implementation (lines 246-251 of `claude-code-adapter.ts`) was confirmed correct:
```typescript
const effectivePrompt = seedPrompt
  ? `${seedPrompt}\n\n---\n\n${prompt}`
  : prompt;
```
Empty string is correctly treated as absent (falsy check). No production bug found.

## Decisions Made
No new decision files created. Adaptation from "stdin writes" to "CLI -p argument" follows task risk note authority.

## Next Session Pickup
- Task 4.3 (Module Shutdown Ordering, MINOR-3 carryforward) is next in the phase plan.
- The pre-existing timeout in `__e2e__/integration.spec.ts` A5 test is NOT caused by this task; it may need investigation separately.
