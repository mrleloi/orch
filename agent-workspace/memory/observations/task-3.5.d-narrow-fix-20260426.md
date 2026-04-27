# Task 3.5.d narrow-fix — PromptRenderer Loop Restructure + hard_truncated Kind

## Status
DONE_WITH_CONCERNS

## Files Changed
- `packages/core/src/modules/handoff/prompt-renderer.ts`: lines 11, 252-380 (loop restructure, hard_truncated emission, comment fix)
- `packages/core/src/modules/handoff/types.ts`: line 192 (added hard_truncated to TruncationAction union)
- `packages/core/src/modules/handoff/prompt-renderer.spec.ts`: lines 196-287 (T-CAP-3 strengthened, T-CAP-3b added, T-CAP-5 strengthened, T-CAP-INV invariant tests added)
- `packages/core/src/modules/handoff/types.spec.ts`: lines 234-245 (updated "all four kinds" to "all five kinds")

## Tests Added
- `prompt-renderer.spec.ts`: +4 cases (T-CAP-3b pathological pending overflow, T-CAP-INV small/medium/pathological invariant tests)
- `types.spec.ts`: 0 new cases (updated existing test to cover 5th kind)

## Gates
- typecheck: PASS
- lint: PASS
- test: FAIL (921/922) — 1 pre-existing test now fails due to correct loop behavior
- no_any: PASS
- i1_grep: PASS
- no_tokenizer_dep: PASS

## Deviations from Plan
- `header preservation` test (prompt-renderer.spec.ts:363-372) now FAILS because the correctly-restructured loop reaches Step 5 (hard-truncate) and slices text to `hardCap=4 chars` at `maxTokens=1`. The test asserts `session-test-001` is present in the output, but "# Ha" (first 4 chars) does not contain it. This test was previously VACUOUSLY PASSING because the broken loop never reached Step 5. The reviewer RESOLVED the header preservation question as "position (a): hard-truncate IS the operative final guard; no byte-guarding of header." The test's assertion contradicts this resolution. Per task instructions, the test was NOT modified.

## Concerns (DONE_WITH_CONCERNS)
1. **Pre-existing test now correctly fails**: `prompt-renderer.spec.ts:370` — `header preservation: header fields survive even at very low maxTokens` uses `maxTokens=1` (hardCap=4 chars) which is pathologically small. The fixed loop now reaches Step 5 and hard-truncates to "# Ha". The test asserts `session-test-001` remains, which is impossible at hardCap=4. The reviewer's position (a) explicitly accepted this trade-off. Recommended fix: update test to use `maxTokens=50` (hardCap=200), which is small enough to trigger truncation but large enough for the header (~130 chars) to survive. This is a 1-line change at line 366: `renderer.render(ctx, 50)` instead of `renderer.render(ctx, 1)`. Also update the assertion comment to clarify the position (a) resolution.

## Assumptions Made
1. The reviewer's "position (a)" resolution means hard-truncate MAY cut the header in truly pathological inputs (maxTokens=1). No code change to byte-guard the header.
2. T-CAP-3 redesign uses maxTokens=100 (hardCap=400) with 10 pending items at charsPerItem=20 → pending section ≈ 250 chars + header ≈ 130 chars = ≈380 chars < 400. Decisions+completed push total over 400, forcing drops. Pending survives intact.
3. T-CAP-5 redesign uses maxTokens=15 (hardCap=60) with 3 decisions, 3 completed, 3 diff files, pickup=3000 chars. In pass 1: step1 drops 1 decision, step2 drops 1 completed, step3 drops 1 diff file, step4 shortens pickup (3000→2000), step5 hard-truncates. All 4 required step categories appear.
4. `madeProgress` flag in loop handles the edge case where all three droppable sources are already empty but `pickupShortened` is true and pickup is short — in that case, Step 5 fires in the same pass via the `if (text.length > hardCap)` block before `madeProgress` check.
