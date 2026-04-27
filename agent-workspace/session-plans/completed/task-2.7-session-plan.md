# Session Plan: Task 2.7 — Web UI Dashboard + Kanban Pages

## Meta
- **Spec**: `agent-workspace/session-plans/pending/phase-2-interfaces.md` lines 410-441
- **Phase master plan**: `phase-2-interfaces.md`
- **Session type**: MULTI_TASK_IMPL (5 subtasks; task-implementer per subtask + spec-compliance-reviewer + code-quality-reviewer per subtask)
- **Budget envelope**: 140K total (a=10K, b=25K, c=35K, d=35K, e=15K + reviewer overhead ≈ 20K)
- **Prerequisites**:
  - Task 2.1 SSE bridge (`/api/v1/events/stream`) live in `@orch/core`
  - Task 2.6 ApiClient + TokenGate complete (signatures match Part B exactly)
  - Tests baseline: 939 passing (33 in web-ui)
- **Package alias**: spec uses `packages/web/...`; actual on-disk path is `packages/web-ui/...` (npm name `@orch/web`). All concrete file paths below use the actual on-disk path.

## Goal
Replace placeholder Dashboard + Kanban pages with the real, SSE-driven implementations called out in spec lines 416-421, delivering the four Part B signatures (`useSseEvents`, `DashboardPage`, `KanbanPage`, `StopSessionDialog`), all loading/error/empty states, an I-6-compliant confirm dialog before session stop, and ~30 new web tests on top of the existing 33.

## Files to Create / Modify

### Subtask 2.7.a — Tailwind + shadcn/ui (deferred from 2.6 — pay back FIRST)
- **Modify** `packages/web-ui/package.json` — add devDeps: `tailwindcss@^3.4`, `postcss`, `autoprefixer`, `tailwindcss-animate`; deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-slot`. (Plan only — installs happen during execution.)
- **Create** `packages/web-ui/tailwind.config.ts` — content globs for `src/**/*.{ts,tsx}`, dark-mode `class`, design tokens (HSL CSS vars).
- **Create** `packages/web-ui/postcss.config.js` — tailwind + autoprefixer.
- **Create** `packages/web-ui/src/index.css` — `@tailwind base/components/utilities` + shadcn HSL CSS vars (`--background`, `--foreground`, `--primary`, `--destructive`, `--muted`, `--border`, `--ring`, etc.).
- **Modify** `packages/web-ui/src/main.tsx` — `import './index.css';` at top.
- **Create** `packages/web-ui/src/lib/utils.ts` — shadcn `cn(...inputs)` helper (`clsx` + `tailwind-merge`).
- **Create** `packages/web-ui/components.json` — shadcn config (rsc=false, tsx=true, alias `@/components`, `@/lib/utils`).
- **Modify** `packages/web-ui/tsconfig.app.json` + `vite.config.ts` — add `@/*` path alias to `src/*`.
- **Create** shadcn primitives (vendored, not generated at runtime — copy from shadcn registry as static files):
  - `packages/web-ui/src/components/ui/button.tsx`
  - `packages/web-ui/src/components/ui/card.tsx`
  - `packages/web-ui/src/components/ui/alert-dialog.tsx` (mandatory for I-6)
  - `packages/web-ui/src/components/ui/badge.tsx`
  - `packages/web-ui/src/components/ui/skeleton.tsx`
- **Create** `packages/web-ui/src/components/ui/ui-smoke.spec.tsx` — render each primitive once, assert no crash; verifies bundling.

### Subtask 2.7.b — `useSseEvents` hook + `StopSessionDialog`
- **Create** `packages/web-ui/src/hooks/use-sse-events.ts` — Part B signature (browser `EventSource`-based; mirrors telegram patterns but adapts to browser).
- **Create** `packages/web-ui/src/hooks/use-sse-events.spec.ts` — fake `EventSource` + reconnect test, schema-validation drop test, filter test.
- **Create** `packages/web-ui/src/hooks/use-sse-events-fixtures.ts` — `MockEventSource` class for tests (jsdom has no native `EventSource`).
- **Create** `packages/web-ui/src/components/stop-session-dialog.tsx` — Part B signature; wraps shadcn `AlertDialog`.
- **Create** `packages/web-ui/src/components/stop-session-dialog.spec.tsx` — click-through test; cancel-resets test; "Confirm Stop" callback wiring test.

### Subtask 2.7.c — DashboardPage + 4 stat cards + recent sessions
- **Modify** `packages/web-ui/src/pages/DashboardPage.tsx` — full implementation, Part B signature unchanged.
- **Create** `packages/web-ui/src/components/stat-card.tsx` — reusable card (label, value, icon, loading skeleton).
- **Create** `packages/web-ui/src/components/recent-sessions-list.tsx` — last-10 sessions list with empty/error/loading states.
- **Create** `packages/web-ui/src/api/dashboard-stats.ts` — typed fetch for `/api/v1/dashboard/stats` (4 stat values; reuses existing ApiClient pattern; uses zod for validation per I-10). If endpoint doesn't yet exist, define DTO contract here with TODO note + minimal computation client-side from existing `queue.list()` + `sessions.active()` so subtask is unblocked. (Document this fallback as a Risk.)
- **Create** `packages/web-ui/src/api/recent-sessions.ts` — typed fetch for `/api/v1/sessions?limit=10` (zod-validated).
- **Create** `packages/web-ui/src/pages/dashboard.spec.tsx` — render + 4 stat cards present + SSE invalidation test + loading/error/empty.
- **Create** `packages/web-ui/src/api/api-client-context.ts` — `ApiClientContext` + `useApiClient()` hook (memoized client bound to `useTokenGate().token` + `onUnauthorized`). One context for both pages; created in c since it's needed first.
- **Modify** `packages/web-ui/src/App.tsx` — wrap `<TokenGate>`'s children with `<ApiClientProvider>`.

### Subtask 2.7.d — KanbanPage + 4 columns + stop button wiring
- **Modify** `packages/web-ui/src/pages/KanbanPage.tsx` — full implementation, Part B signature unchanged.
- **Create** `packages/web-ui/src/components/kanban-column.tsx` — column header + card list (props: title, items, render).
- **Create** `packages/web-ui/src/components/queue-card.tsx` — single card (project, plan-file, started-at; conditional stop button when state === 'running').
- **Create** `packages/web-ui/src/lib/kanban-grouping.ts` — pure function `groupByState(items): { pending, running, completed, failed }`.
- **Create** `packages/web-ui/src/lib/kanban-grouping.spec.ts` — pure unit test for grouper (no React).
- **Create** `packages/web-ui/src/pages/kanban.spec.tsx` — column filter, stop-confirm flow E2E, SSE-driven refresh, empty-column state.

### Subtask 2.7.e — Carryover regression: hook.received POST-tx non-flicker
- **Create** `packages/web-ui/src/pages/kanban.flicker.spec.tsx` — integration-level: simulate SSE event sequence where a `hook.received` event arrives concurrently with a (mocked) `queue.list()` failure mid-transition; assert kanban "Running" column never holds a card whose state was rolled back; assert TanStack Query keeps stale data on transient `queue.list()` error rather than emptying column. Pure test-side; no production code change.

## Public API Signatures (Part B verbatim)

```typescript
// packages/web-ui/src/hooks/use-sse-events.ts
import type { SseEnvelope, EventType } from '@orch/shared';
export interface UseSseEventsOptions {
  url: string;
  filter?: EventType[];
  onEvent: (env: SseEnvelope) => void;
}
export interface UseSseEventsResult {
  connected: boolean;
  lastError: Error | null;
}
export function useSseEvents(opts: UseSseEventsOptions): UseSseEventsResult;

// packages/web-ui/src/components/stop-session-dialog.tsx
export interface StopSessionDialogProps {
  sessionId: string;
  onConfirm: () => void;
  // Plan note: open/onOpenChange managed by parent for testability;
  // children prop or `trigger` prop carries the button. Architect-chosen
  // shape: controlled via `open: boolean; onOpenChange: (v: boolean) => void;`
  // (NOT in spec line 437 but required to integrate into parent KanbanPage).
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
export function StopSessionDialog(props: StopSessionDialogProps): JSX.Element;

// packages/web-ui/src/pages/DashboardPage.tsx (file uses PascalCase due to existing repo convention)
export function DashboardPage(): JSX.Element;

// packages/web-ui/src/pages/KanbanPage.tsx
export function KanbanPage(): JSX.Element;
```

> Spec literal-quote uses `dashboard.tsx` / `kanban.tsx`; the on-disk repo uses PascalCase (`DashboardPage.tsx` / `KanbanPage.tsx` — see existing placeholders). **Decision**: keep PascalCase to avoid renaming churn + breaking imports in `App.tsx`. Document in subtask 2.7.c risk section. Function NAMES are Part B verbatim (`DashboardPage`, `KanbanPage`).

## Subtask Breakdown

### 2.7.a — Tailwind + shadcn/ui install + design tokens (paying back 2.6 deferral)
- **Budget**: ~10K
- **Action**: install Tailwind v3 + shadcn/ui primitives; vendor 5 components (button, card, alert-dialog, badge, skeleton); wire `@/*` alias.
- **Files**: see "Subtask 2.7.a" above.
- **Verify**:
  - `pnpm --filter @orch/web run typecheck` passes
  - `pnpm --filter @orch/web run lint` passes
  - `pnpm --filter @orch/web run build` produces a CSS bundle > 0 bytes
  - `pnpm --filter @orch/web test` — existing 33 pass + 5 new ui-smoke tests
  - `grep -rn "@orch/core\|@anthropic-ai\|anthropic\|openai" packages/web-ui/src` → empty (I-3, I-4)
- **Part B contract checkpoint**: line 421 — shadcn AlertDialog exists and renders.
- **Reviewer notes**: code-quality-reviewer — verify no `any` in vendored shadcn files; spec-compliance-reviewer — confirm AlertDialog primitive present.

### 2.7.b — `useSseEvents` hook + `StopSessionDialog` component
- **Budget**: ~25K
- **Action**: implement browser EventSource hook with reconnect + zod validation; build StopSessionDialog wrapping shadcn AlertDialog.
- **Files**: see "Subtask 2.7.b" above.
- **Verify**:
  - Hook: jsdom test with `MockEventSource` proves
    1. connects on mount;
    2. dispatches valid envelopes;
    3. drops malformed envelopes silently (logs `console.warn`);
    4. honours `filter` (events not in filter NOT dispatched);
    5. reconnects after `error` event with exponential backoff (use fake timers; verify 3 reconnect attempts);
    6. cleans up `EventSource.close()` on unmount.
  - Dialog: RTL test proves
    1. trigger renders;
    2. opening dialog shows "Confirm Stop" button;
    3. clicking "Confirm" calls `onConfirm` exactly once;
    4. clicking "Cancel" does NOT call `onConfirm`;
    5. dialog closes after either button click (parent state notified via `onOpenChange`);
    6. dialog has `role="alertdialog"` (a11y).
  - Tests count: ~12 new (6 hook + 6 dialog).
  - All pre-existing tests still green.
- **Part B contract checkpoint**: signatures lines 425-428 + 436-437.
- **Invariants**: I-3 (no anthropic/openai), I-4 (no @orch/core), I-10 (zod-validated envelopes via `parseSseEnvelope` from `@orch/shared`).
- **Reviewer notes**: spec-compliance-reviewer — confirm signature exactly matches Part B; flag the open/onOpenChange addition (decision documented).

### 2.7.c — DashboardPage (4 stat cards + recent-sessions list)
- **Budget**: ~35K
- **Action**: real DashboardPage; ApiClientContext; 4 stat cards; recent-sessions list; SSE-driven cache invalidation.
- **Files**: see "Subtask 2.7.c" above.
- **Verify**:
  - Stat cards render with: Active Session (count: 0/1), Queue Depth, Daily Tokens, Daily Cost (USD format).
  - Each card renders Skeleton during `isLoading`.
  - Each card renders error fallback on `isError` (uses `<Card>` with destructive variant + retry button).
  - Empty: when `queue.list()` returns 0 items + no active session, dashboard renders without crashing; "no recent sessions" copy shown.
  - SSE invalidation: dispatch a `queue.state_changed` envelope through the mock SSE; assert TanStack Query `['queue']` is invalidated and refetch fires (mock `apiClient.queue.list`).
  - Recent sessions list renders 10-or-fewer sessions, sorted newest-first by `startedAt`.
  - 401 mid-fetch evicts token (existing `onUnauthorized` path; covered by integration test).
  - Tests count: ~10 new.
- **Part B contract checkpoint**: lines 417, 419, 420 (loading/error/empty), 430-431.
- **Invariants**: I-3, I-4, I-7 (vite still binds 127.0.0.1:4142 — no change), I-10 (every fetch zod-parsed).
- **Reviewer notes**: code-quality-reviewer — assert no React `useEffect` does cleanup-less subscriptions; spec-compliance-reviewer — confirm the four stat-card categories match spec line 417 verbatim.

### 2.7.d — KanbanPage (4 columns + stop button wiring)
- **Budget**: ~35K
- **Action**: real KanbanPage; 4 columns; queue cards; stop-confirm wiring through StopSessionDialog → `apiClient.sessions.stop(id, true)`; SSE invalidation.
- **Files**: see "Subtask 2.7.d" above.
- **Verify**:
  - 4 column headings render with counts: Pending, Running, Completed, Failed (from `cancelled` mapped to Failed? — **Decision**: map `cancelled` → Failed column per phase plan line 418 which lists 4 columns; document in `kanban-grouping.ts` JSDoc).
  - Cards show projectId + planPath (basename) + relative `startedAt` ("2 min ago" via `Intl.RelativeTimeFormat`, no extra dep).
  - Stop button visible ONLY when `item.state === 'running'`.
  - Clicking Stop opens AlertDialog; clicking Confirm fires `apiClient.sessions.stop(id, true)`; on success, queue cache invalidates.
  - Empty state per column: "No items" placeholder.
  - SSE: `queue.enqueued` → pending column refresh; `queue.state_changed` → all columns refresh; `session.ended` → running column drains.
  - I-6 enforcement: a test asserts that calling `apiClient.sessions.stop(id, false as unknown as true)` throws (already enforced in client); kanban path must NEVER bypass the dialog (test: clicking Stop button without confirming does NOT call `sessions.stop`).
  - Tests count: ~13 new (column-grouper unit + page-level + dialog flow + invalidation).
- **Part B contract checkpoint**: lines 418, 419, 420, 421, 433-434.
- **Invariants**: I-3, I-4, I-6 (confirm gate), I-7, I-10.
- **Reviewer notes**: spec-compliance-reviewer — verify cards include `project + plan-file + started-at + stop-button (if running)` per line 418; code-quality-reviewer — verify no DOM mutation outside React, no direct `fetch` (must go through ApiClient).

### 2.7.e — Carryover regression: hook.received POST-tx non-flicker
- **Budget**: ~15K
- **Action**: integration-level test only.
- **Files**: see "Subtask 2.7.e" above.
- **Verify**:
  - Test simulates: kanban renders with 1 running card; SSE delivers `hook.received`; `apiClient.queue.list()` mock is set to reject ONCE then succeed; after refetch settles, the running card is unchanged (no flicker, no transient empty column).
  - Use TanStack Query's `keepPreviousData` semantics; if not currently configured, change query options to `placeholderData: keepPreviousData` (a one-line modification to `kanban.spec.tsx`-targeted page code, OR documented as "test reveals required behavior; document if production fix needed").
  - Tests count: 2 new (happy non-flicker + DB-error non-flicker).
- **Carryover reference**: spec line 441 + Task 1.10 reference.
- **Reviewer notes**: spec-compliance-reviewer — confirm the assertion targets the carryover requirement directly; if production code change needed, escalate (do not fold silently).

## Dependency Order

```
2.7.a  (foundation: Tailwind + shadcn primitives)
   │
   ▼
2.7.b  (hook + dialog — depend on AlertDialog primitive from a)
   │
   ▼
2.7.c ──── 2.7.d   (parallel-ELIGIBLE: both depend only on a + b; touch
   │           │   different page files. ApiClientContext is created in c
   │           │   and consumed in d, so prefer SERIAL c → d unless the
   │           │   implementer factors ApiClientContext upfront.)
   ▼           ▼
            2.7.e  (integration regression on top of d)
```

**Recommendation: SERIAL execution.** ApiClientContext crosses a-c-d boundary, and SSE wiring identical between pages — running c first lets d copy the established pattern. Parallelizing risks two divergent ApiClient memoization strategies. Architect's call: **a → b → c → d → e**.

## Acceptance Criteria (whole-task)

- [ ] All 5 subtasks pass their per-subtask verify steps
- [ ] `pnpm --filter @orch/web typecheck` passes
- [ ] `pnpm --filter @orch/web lint` passes
- [ ] `pnpm --filter @orch/web test` — green; total web-ui tests ≥ 33 + 30 = **63** (target ~30 new)
- [ ] Cross-package: `pnpm test` reports ≥ 939 + 30 = **969 passing** (no regressions in core/cli/shared/telegram)
- [ ] **Invariant greps clean**:
  - `grep -rn "@orch/core\|@anthropic-ai\|anthropic\|openai" packages/web-ui/src` → empty (I-3, I-4)
  - `grep -rn "0\\.0\\.0\\.0\\|host: ['\"]\\*['\"]" packages/web-ui` → empty (I-7)
  - `grep -rn "sessions.stop.*false" packages/web-ui/src` → empty except runtime guard test (I-6)
- [ ] **Part B contract** (spec lines 416-441):
  - [ ] B.1 `useSseEvents` signature exact + Result type exact
  - [ ] B.2 `DashboardPage` + `KanbanPage` no-arg `JSX.Element` returns
  - [ ] B.3 `StopSessionDialog` accepts `sessionId` + `onConfirm`
  - [ ] B.4 4 stat cards present (Active Session, Queue Depth, Daily Tokens, Daily Cost)
  - [ ] B.5 4 kanban columns present (Pending, Running, Completed, Failed)
  - [ ] B.6 Stop button gated by AlertDialog (I-6)
  - [ ] B.7 SSE-driven cache invalidation observable in tests
  - [ ] B.8 Loading + error + empty states for every query
  - [ ] B.9 Auth-401 evicts token (existing path, integration test re-asserts)
  - [ ] B.10 Carryover (line 441): non-flicker integration test green

## Handoff to Next (Task 2.8)

- ApiClientContext + `useApiClient()` ready; reuse directly in ActivityPage.
- `useSseEvents` hook ready; ActivityPage will subscribe with broader filter (no filter, all events).
- shadcn primitives (Button, Card, AlertDialog, Badge, Skeleton) vendored; ActivityPage may add `Input`, `Select`, `Tabs`, `ScrollArea` primitives in 2.8.a.
- Pattern for SSE-driven TanStack invalidation established in `dashboard.tsx` + `kanban.tsx`; ActivityPage tail buffer will instead push to local state (Agent-Monitor pattern, max 200 events) — different paradigm; document in 2.8 plan.
- TestUtils: `MockEventSource` from `use-sse-events-fixtures.ts` is the reusable harness for ActivityPage SSE tests.

## Risks

1. **Spec path mismatch** (`packages/web/...` in spec vs `packages/web-ui/...` on disk): kept PascalCase page names + on-disk paths. Function names match Part B verbatim. Documented; no escalation.
2. **`/api/v1/dashboard/stats` may not yet exist in core**: 2.7.c falls back to client-side aggregation from `queue.list()` + `sessions.active()`. If a `/dashboard/stats` endpoint exists, prefer it. If implementation requires the endpoint and it's missing, escalate to master-planner — do NOT add core endpoints from web-ui subtask.
3. **`StopSessionDialog` Part B is under-specified** (no `open`/`onOpenChange` in spec line 437): added controlled-state props for testability. Documented as deviation; spec-compliance-reviewer should not flag as failure.
4. **Spawned-mode**: this plan was authored under `ORCH_SPAWNED=true`-equivalent autonomous mode. All ambiguity resolutions defaulted to charter principles (simplicity, no speculative endpoints, test-first).
5. **shadcn install in monorepo**: pnpm workspace + Vite alias `@/*`. Must align tsconfig + vite resolve.alias + components.json. Single-source path config in `tsconfig.app.json` `paths`, mirrored in `vite.config.ts`. If implementer hits resolution drift, refer here.
6. **Tailwind v4 vs v3**: choose **v3** for stability + shadcn/ui canonical compatibility (April 2026: Tailwind v4 is GA but shadcn registry still ships v3 templates by default). Document if implementer prefers v4 and revalidate.
7. **`cancelled` queue state mapping**: phase plan lists 4 columns but `QueueItemState` has 5 values. Decision: `cancelled` rolls into `failed` column with subtle "(cancelled)" badge. If reviewer disagrees, escalate to a 5th column — but adding columns deviates from spec line 418.
8. **2.7.e may surface a production-code requirement** (TanStack `placeholderData: keepPreviousData`): if so, that single one-line config change is acceptable; anything larger triggers escalation back to architect.

## Reviewer Workflow (per subtask)

After each subtask's task-implementer returns:
1. **spec-compliance-reviewer (sonnet, background)**: verify Part B contract checkpoints listed in that subtask.
2. On PASS → **code-quality-reviewer (sonnet, background)**: verify invariant greps, no `any`, test quality.
3. On either FAIL → return to task-implementer with reviewer notes; max 3 retries before escalate.
4. On both PASS → mark subtask DONE in `agent-workspace/memory/current-execution.md`; advance to next subtask.

## Hard-Rule Carry-Forward (applies to ALL subtasks)
- **I-3**: zero `@anthropic-ai`, `anthropic`, `openai` references in `packages/web-ui/src`.
- **I-4**: zero `@orch/core` imports in `packages/web-ui/src`. Communicate via HTTP (ApiClient) + SSE (useSseEvents) only.
- **I-6**: stop is destructive; AlertDialog confirmation is mandatory. ApiClient runtime guard (already present) is belt-and-suspenders, not a substitute for the UI gate.
- **I-7**: vite dev/preview server binds `127.0.0.1` only (already enforced). Do not modify.
- **I-10**: every cross-trust-boundary value (HTTP response, SSE envelope, env var) zod-parsed before use. `parseSseEnvelope` from `@orch/shared` is the canonical entry point for SSE.
