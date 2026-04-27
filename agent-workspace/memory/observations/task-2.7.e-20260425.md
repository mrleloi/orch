# Task 2.7.e — Carryover regression: hook.received POST-tx non-flicker

## Status
DONE_WITH_CONCERNS

## Files Changed
- packages/web-ui/src/pages/kanban.flicker.spec.tsx (created, 304 lines, 2 test cases)
- packages/web-ui/src/pages/KanbanPage.tsx:159 (1-line production fix: `isError` → `isLoadingError`)

## Tests Added
- packages/web-ui/src/pages/kanban.flicker.spec.tsx: 2 cases
  1. "running card stays visible during an in-flight SSE-triggered background refetch" (happy non-flicker)
  2. "running card stays visible when background refetch rejects once then succeeds" (DB-error non-flicker)

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors; 4 pre-existing warnings in other files unchanged)
- test web-ui: PASS (87/87; baseline was 85, +2 new)
- test monorepo: PASS (993 total: core 720 + telegram 124 + web-ui 87 + shared 40 + cli 22)
- invariants:
  - @orch/core/@anthropic-ai/openai grep: PASS (all matches are JSDoc comments, zero imports)
  - sessions.stop.*false grep: PASS (empty)

## Production Code Change
YES — one-line change in KanbanPage.tsx:
```diff
- if (queueQuery.isError) {
+ if (queueQuery.isLoadingError) {
```

`isLoadingError` = `isError && !hasData` — shows the full-screen error only on initial load failure.
On background-refetch error (where previous data is present in query state), the running card remains visible.

## Non-flicker Assertion Strategy
- Test 1 (happy): Defers the second queueList call via an unresolved Promise; asserts running card is present WHILE isFetching=true (no skeleton, no error), then resolves and asserts card still present.
- Test 2 (DB-error): Uses `qc.getQueryState(['queue'])` to wait until TanStack has fully processed the rejected promise (status === "error") before asserting the error screen is NOT shown and the running card IS present. Then emits a second SSE event, waits for status === "success", and re-asserts card visibility.

## Deviations from Plan
1. Production code change was required. The plan said "Pure test-side; no production code change" but also noted Risk #8: "if so, that single one-line config change is acceptable." The change is 1 line as predicted.
2. The `hook.received` SSE event type cannot trigger KanbanPage invalidation directly (it is not in KanbanPage's filter list: `['queue.enqueued', 'queue.state_changed', 'session.started', 'session.ended']`). Tests use `queue.state_changed` as the carryover-equivalent trigger — this is documented in the `emitQueueStateChanged` JSDoc and in the spec comment at the top of the test file.
3. `keepPreviousData` named import from `@tanstack/react-query` was NOT added — the existing `placeholderData: (prev) => prev` is functionally identical. The task's suggestion to import `keepPreviousData` was guidance; the inline function is equivalent and was already present.

## Concerns (DONE_WITH_CONCERNS)
- The `hook.received` SSE event is NOT handled by KanbanPage's filter. The carryover test therefore cannot literally emit `hook.received` and expect cache invalidation. This is documented clearly. If the intent of spec line 441 is that KanbanPage SHOULD handle `hook.received`, a separate task would be needed to add it to the filter. Current behavior: `hook.received` is silently dropped by `useSseEvents`.
- The `isLoadingError` production fix was discovered by the test (as intended). Spec-compliance-reviewer should note: this constitutes the "one-line production fix" from Risk #8. The fix is semantically correct: `isLoadingError` = TanStack's canonical flag for "error with no data" and is the right guard for showing a full-screen error state vs. keeping stale data visible.

## Assumptions Made
- `placeholderData: (prev) => prev` is semantically equivalent to `keepPreviousData` from `@tanstack/react-query` (confirmed by reading source: `keepPreviousData = (prev) => prev`).
- TanStack Query v5's query state spreads previous `data` on background refetch error (confirmed by reading `query.js` reducer).
- `isLoadingError` (`isError && !hasData`) is the correct production-side guard (confirmed by `queryObserver.js` line 331).
