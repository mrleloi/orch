# Task 2.7.c — DashboardPage (4 stat cards + recent-sessions list + ApiClientContext + SSE invalidation)

## Status
DONE

## Files Changed
- `packages/web-ui/src/api/api-client-context.tsx` (created) — React context, ApiClientProvider, useApiClient()
- `packages/web-ui/src/api/dashboard-stats.ts` (created) — client-side aggregation fallback
- `packages/web-ui/src/api/recent-sessions.ts` (created) — recent sessions fetch with zod
- `packages/web-ui/src/components/stat-card.tsx` (created) — reusable stat card component
- `packages/web-ui/src/components/recent-sessions-list.tsx` (created) — recent sessions list
- `packages/web-ui/src/pages/DashboardPage.tsx` (modified) — full implementation replacing placeholder
- `packages/web-ui/src/App.tsx` (modified) — wrapped TokenGate children with ApiClientProvider
- `packages/web-ui/src/pages/dashboard.spec.tsx` (created) — 12 new tests
- `packages/web-ui/src/router.spec.tsx` (modified) — updated to provide ApiClientContext + MockEventSource

## Tests Added
- `packages/web-ui/src/pages/dashboard.spec.tsx`: 12 new test cases
  1. Renders all 4 stat cards after data loads
  2. Renders Skeleton inside stat cards while queries are loading
  3. Shows error card with Retry button when stats query fails
  4. Clicking Retry in error state triggers a refetch
  5. Active Session card shows "1" when session is active
  6. Active Session card shows "0" when no session is active
  7. Queue Depth card shows integer count of pending/running items
  8. Daily Cost card renders $X.XX format
  9. Shows "No recent sessions" when no active session
  10. Renders session rows sorted newest-first by startedAt
  11. queue.state_changed SSE event invalidates queue key and triggers refetch
  12. session.ended SSE event invalidates active-session query and triggers refetch

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors, 4 warnings — all pre-existing react-refresh/only-export-components in vendored shadcn files + context export, treated as warn not error)
- test: PASS (65/65 web-ui; 971 monorepo total)
- invariants:
  - I-3/I-4 grep (@orch/core, @anthropic-ai, openai): PASS — only in comments
  - I-6 grep (sessions.stop.*false): PASS — empty
  - I-7 grep (0.0.0.0, host: *): PASS — empty

## Deviations from Plan
1. `api-client-context.ts` → renamed to `.tsx` because the file contains JSX (`<ApiClientContext.Provider>`). ESLint's TypeScript parser requires `.tsx` for JSX. Import paths using `.js` extension still resolve correctly.
2. `ApiClientContext` is exported (named export) from `api-client-context.tsx` — needed by test harnesses to inject a mock ApiClient without a real TokenGate tree. The plan did not specify whether to export or not.
3. Risk #2 confirmed: `/api/v1/dashboard/stats` does not exist. Fallback implemented: client-side aggregation from `queue.list()` + `sessions.active()`. Documented with comment in `dashboard-stats.ts`.
4. Risk for recent-sessions: no `/api/v1/sessions?limit=10` endpoint. Fallback: `sessions.active()` only. Documented with comment in `recent-sessions.ts`.
5. `router.spec.tsx` modified (pre-existing file from 2.6 era) — required because DashboardPage now needs ApiClientContext. Added MockEventSource install + ApiClientContext.Provider + QueryClientProvider wrappers. This is a valid modification since DashboardPage behavior changed.

## Concerns
None — all gates pass cleanly.

## Assumptions Made
- `ApiClientContext` exported as named export for test harness access (matches existing pattern in `TokenGateContext`)
- SSE subscription URL `/api/v1/events/stream` without token (TODO 2.8 comment added per brief)
- `dashboard-stats.ts` fallback aggregates from active session only for daily tokens/cost (no session history endpoint exists yet)
- `recent-sessions.ts` fallback returns active session only (no session list endpoint exists yet)
- `router.spec.tsx` update is in scope since the DashboardPage change broke it (pre-existing test for a file this task modifies)

## ApiClientContext
- Location: `packages/web-ui/src/api/api-client-context.tsx`
- Memoization: `useMemo([token, onUnauthorized])` — new ApiClient only created when token or 401 handler changes
