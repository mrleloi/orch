# Task 2.7.d — KanbanPage (4 columns + queue cards + Stop confirm flow + SSE invalidation)

## Status
DONE

## Files Changed
- `packages/web-ui/src/pages/KanbanPage.tsx` — full implementation (replaced placeholder)
- `packages/web-ui/src/components/kanban-column.tsx` — NEW: generic column component
- `packages/web-ui/src/components/queue-card.tsx` — NEW: single queue item card
- `packages/web-ui/src/lib/kanban-grouping.ts` — NEW: pure groupByState helper
- `packages/web-ui/src/lib/kanban-grouping.spec.ts` — NEW: 5 pure unit tests
- `packages/web-ui/src/pages/kanban.spec.tsx` — NEW: 13 page-level + dialog + SSE tests

## Tests Added
- `packages/web-ui/src/lib/kanban-grouping.spec.ts`: 5 cases
- `packages/web-ui/src/pages/kanban.spec.tsx`: 13 cases
- Total new: 18 tests

## Gates
- typecheck: PASS (0 errors, `pnpm --filter @orch/web run typecheck`)
- lint: PASS (0 errors, 6 pre-existing warnings from 2.7.a/b/c files — none new)
- test web-ui: PASS (84/84 — 66 baseline + 18 new)
- test monorepo: PASS (990 total: 720 core + 124 telegram + 84 web-ui + 40 shared + 22 cli)
- invariants:
  - `grep @orch/core|@anthropic-ai|anthropic|openai packages/web-ui/src` → only comment lines (PASS)
  - `grep sessions.stop.*false packages/web-ui/src` → empty (PASS)

## Deviations from Plan
- none

## Part B Contract Checkpoints
- B.2 KanbanPage: `export function KanbanPage(): JSX.Element` — PASS
- B.5 4 columns: Pending, Running, Completed, Failed headings — PASS (data-testid assertions in test 1)
- B.6 Stop gated by AlertDialog (I-6): Stop button calls onStopRequest → parent sets dialog.open=true → StopSessionDialog wraps AlertDialog → confirm calls sessions.stop(id, true) — PASS
- B.7 SSE invalidation: queue.enqueued + queue.state_changed + session.started + session.ended all invalidate ['queue'] — PASS (tests 10, 11)
- B.8 Loading/error/empty states: loading skeleton (data-testid="kanban-loading"), error div (data-testid="kanban-error"), empty column placeholder (data-testid="kanban-column-empty-*") — PASS

## I-6 Enforcement Evidence
- Test 7: "clicking Stop opens AlertDialog but does NOT call sessions.stop" — negative path
- Test 8: "clicking Stop then Cancel → sessions.stop NOT called" — I-6 negative (cancel path)
- Test 9: "clicking Stop then Confirm → sessions.stop called with (sessionId, true)" — I-6 positive path, second arg = true asserted

## cancelled→failed Decision
cancelled state maps to failed column per Risk #7 (spec line 418 defines exactly 4 columns; no 5th column). Documented in `kanban-grouping.ts` JSDoc + inline comment. Regression guard: kanban-grouping.spec.ts test case 3.

## Relative-time Format
`Intl.RelativeTimeFormat` with `{ numeric: 'auto', style: 'short' }`. Thresholds: <60s → seconds, <60min → minutes, <24h → hours, else → days. No extra npm dependency.

## Concerns
none

## Assumptions Made
- `QueueItemDto.id` is used as the targetSessionId for `sessions.stop` (item.id = session id in the queue context per client.ts schema)
- Loading state uses `queueQuery.isLoading` (true only on initial load, not refetch) — prevents flicker on SSE-driven refetches; combined with `placeholderData: (prev) => prev` for stale data retention
- Stop button testid is `queue-card-stop-{item.id}` to allow precise targeting in I-6 tests
- `key={idx}` used in KanbanColumn wrapper div — acceptable since parent `renderCard` already sets `key={item.id}` on the QueueCard; the outer div is purely structural
