# Spec Compliance Review — Task 12.D-1 (subscription-mode adapter tests)

Date: 2026-04-28
Reviewer: spec-compliance-reviewer (Session #51)

## Verdict

PASS

## Contract Match Matrix

Spec source: `agent-workspace/memory/checkpoints/latest.md` § "Priority 2 — Add adapter tests"

| Clause | Code Evidence | Match |
|---|---|---|
| Test 1: `ORCH_RUNTIME_MODE='subscription'` → binary `'claude'` | spec.ts:442 `expect(mockExeca).toHaveBeenCalledWith('claude', ...)` | ✓ |
| Test 1: argv = `['--rc', 'orch-myprofile', '-p', 'do the thing', '--output-format', 'stream-json']` | spec.ts:443 exact array literal | ✓ |
| Test 1: env-var isolation (save/restore) | spec.ts:430-453 `const prev = ...` try/finally delete or restore | ✓ |
| Test 2: `ORCH_RUNTIME_MODE` unset (deleted) → binary `'ccs'` | spec.ts:469 `expect(mockExeca).toHaveBeenCalledWith('ccs', ...)` | ✓ |
| Test 2: argv = `['myprofile', '-p', 'do the thing', '--output-format', 'stream-json']` | spec.ts:470 exact array literal | ✓ |
| Test 2: env-var isolation (save/restore) | spec.ts:457-481 try/finally pattern | ✓ |
| Test 3: `ORCH_RUNTIME_MODE='api'` (non-subscription) → binary `'ccs'` | spec.ts:492-494 `expect(callArgs[0]).toBe('ccs')` | ✓ |
| Test 3: argv must NOT contain `'--rc'` | spec.ts:495 `expect(callArgs[1]).not.toContain('--rc')` | ✓ |
| Test 3: env-var isolation (save/restore) | spec.ts:484-503 try/finally pattern | ✓ |

Adapter source (adapter.ts:291-295) verified to match the tested contract:
- `process.env.ORCH_RUNTIME_MODE === 'subscription'` strict equality
- subscription path: `execa('claude', ['--rc', \`orch-${profile || 'self'}\`, '-p', effectivePrompt, '--output-format', 'stream-json'])`
- default path: `execa('ccs', [profile, '-p', effectivePrompt, '--output-format', 'stream-json'])`

## Test Runner Result

```
Tests: 76 passed, 76 total  (+3 from baseline of 73)
Runner: Jest (NOT vitest)
Command: npx jest "claude-code-adapter.spec.ts" from packages/core/
```

Delta matches spec expectation of 2-3 new tests. Actual delta = +3. Claim validated.

## Test Runner Discrepancy Note

The task envelope specified `npx vitest run packages/core/src/modules/sessions/claude-code-adapter.spec.ts` as the run command. The actual test runner in `packages/core/` is Jest (not vitest). Running the vitest command would have produced an error (`jest is not defined`). The implementer correctly diagnosed this and used `npx jest` instead. The task envelope guidance was wrong; the implementer's correction was right. This is a documentation issue only — no test correctness impact.

## Missing Requirements

None. All 3 Part B clauses fully covered.

## Over-Building

None. The diff adds exactly 84 lines inside the existing `spawn` describe block. No new public exports, no new config flags, no new abstractions beyond the 3 spec-required test cases. The section comment `// ── ORCH_RUNTIME_MODE: subscription-mode branch ...` is a test-organization comment consistent with the existing file style.

## I-6 Status

`git status --short` confirms:
- `claude-code-adapter.spec.ts` is ` M` (modified, unstaged, working tree only)
- Zero `git commit` invocations
- Last commit unchanged: `230929e v2.6: Phase 11 v2.6 carryforward burndown + SC-39 ENABLE_RETRY window`

I-6 HOLDS.

## Required Fixes (blocking)

None.

## Next Action

PASS → dispatch code-quality-reviewer
