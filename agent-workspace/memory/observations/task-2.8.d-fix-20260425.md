# Task 2.8.d (fix) — Extend test 1 to cover all 4 nav routes + deep session route

## Status
DONE

## Files Changed
- packages/web-ui/src/App.spec.tsx: lines 14, 136-158

## Tests Added
- No new test cases (0 count delta); assertions were added inside the existing `it()` named "all 4 nav routes + deep session route render under TokenGate"

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors; 4 pre-existing warnings unchanged)
- test: PASS (136/136 web-ui; 1051/1051 monorepo)
- invariants: PASS

## Changes Made
1. Added `cleanup` to the `@testing-library/react` import (line 14).
2. Expanded test 1 body to render and assert all 4 routes in sequence, with `cleanup()` between each renderApp() call:
   - `/` → `page-dashboard` (was already present)
   - `/activity` → `page-activity` (new assertion)
   - `/kanban` → `page-kanban` (new assertion)
   - `/sessions/s1` → `page-session-detail` (new assertion)

## Page testids confirmed
- DashboardPage: `data-testid="page-dashboard"` (DashboardPage.tsx line 100)
- ActivityPage: `data-testid="page-activity"` (ActivityPage.tsx line 89)
- KanbanPage: `data-testid="page-kanban"` (KanbanPage.tsx lines 138, 161, 182)
- SessionDetailPage: `data-testid="page-session-detail"` (SessionDetailPage.tsx lines 34, 107)

## Deviations from Plan
None. Test name unchanged. No other tests modified.

## Assumptions Made
- `cleanup()` between sequential `renderApp()` calls within the same `it()` is the correct approach since each call mounts to the document body, and without cleanup the second mount would see both trees simultaneously.
- The trailing `cleanup()` at the end of the test is safe (and idiomatic) even though `afterEach` from Testing Library would also run cleanup; being explicit avoids any subtle multi-render collision.
