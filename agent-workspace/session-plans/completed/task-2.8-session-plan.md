# Task 2.8 Session Plan — Web UI Activity Feed + Session Detail

## Meta

- **Spec**: `agent-workspace/session-plans/pending/phase-2-interfaces.md` Task 2.8 (lines 445-471)
- **Phase master plan**: Phase 2 — Interfaces (in-flight)
- **Mode**: **MULTI_TASK_IMPL** (4 discrete sub-concerns: hook URL rewrite, Activity Feed page, Session Detail page, routing/nav + integration. Task-implementer per subtask, each reviewed by spec-compliance + code-quality.)
- **Budget envelope**: 4 subtasks summing to ~70K dispatches (see roll-up in Part D).
- **Prerequisites**:
  - Task 2.7 DONE (993/993 tests baseline)
  - Pre-work `BearerAuthGuard` `?token=` fallback already landed in `packages/core/src/modules/api/bearer-auth.guard.ts` (verified lines 74-91, mounted only on SseController)
  - `MockEventSource` + `installMockEventSource` harness at `packages/web-ui/src/hooks/use-sse-events-fixtures.ts`
  - `ApiClientProvider` / `useApiClient()` at `packages/web-ui/src/api/api-client-context.tsx`
  - `useTokenGate()` at `packages/web-ui/src/auth/token-gate-context.ts`
  - Core endpoints already exist: `GET /api/v1/sessions/:id/tail?lines=N`, `GET /api/v1/sessions/:id/logs`, `GET /api/v1/sessions/active` (verified in `packages/core/src/modules/api/api.controller.ts` lines 307-371)

## Goal

Two new live Web UI pages ship:

1. `ActivityFeedPage` at `/activity` — a bounded 200-event ring-buffer of ALL SSE traffic, rendered most-recent-first. Uses Agent-Monitor pattern (local React state, NOT TanStack invalidation).
2. `SessionDetailPage` at `/sessions/:id` — session metadata + tail-lines panel + optional full-logs fallback, with per-session SSE filter for live updates.

Plus the `useSseEvents` URL-auth fix (append `?token=`) so production SSE actually authenticates via the BearerAuthGuard.

On completion:
- 993 → ~1035 tests (+40 to +46 in web-ui, 0 elsewhere)
- Zero TODO(2.8) / auth-gap comments remain anywhere in `packages/web-ui/src`
- All 4 routes render under TokenGate; nav links present in layout shell
- All gates green (typecheck, lint, test across all packages)

---

## Part A — Strategy

### Why MULTI_TASK_IMPL over FOCUSED_IMPL

Three discrete concerns touch independent files with independent verification:
1. `useSseEvents` URL shape + hook consumers (low risk; touches 3 callsites)
2. `ActivityFeedPage` — new paradigm (ring buffer, NOT TanStack invalidation) — NEW code, minimum spec-reviewer vigilance required
3. `SessionDetailPage` — wires NEW UI to EXISTING core endpoints (tail/logs) — highest risk of drift from Part B of phase spec
4. Route/nav + cross-page integration + regression suite

Collapsing all four to a single sandwich-dev session risks the same "review granularity cliff" the phase plan warns about for Task 2.7 (line 680). Each subtask is self-contained, fits in <30K, and has its own Part B contract + test count floor.

### Dispatch order (DAG)

```
2.8.a (useSseEvents URL) ──┬──► 2.8.b (ActivityFeedPage) ──┐
                           │                                │
                           └──► 2.8.c (SessionDetailPage) ──┴──► 2.8.d (Routes + nav + integration)
```

2.8.a MUST land first: both 2.8.b and 2.8.c rely on `useSseEvents` producing authenticated URLs. 2.8.b and 2.8.c are parallelizable in principle but should be serialized for review capacity. 2.8.d must be last (it's the integration gate).

---

## Part B — Per-subtask Contracts

### Subtask 2.8.a — `useSseEvents` URL `?token=` auth + TODO cleanup

**Budget**: ~5K (task-implementer, sonnet, bg)

**Files to modify**:
- `packages/web-ui/src/hooks/use-sse-events.ts` — docblock: remove "LIMITATION" paragraph (lines 8-13); update to "Auth: caller is expected to pass a URL including `?token=<urlencoded>` query param — BearerAuthGuard accepts the fallback path (see `bearer-auth.guard.ts` lines 74-91)."
- `packages/web-ui/src/pages/DashboardPage.tsx` — line 24: add `import { useTokenGate } from '../auth/token-gate-context.js';`; line 78: replace `url: '/api/v1/events/stream'` with `url: \`/api/v1/events/stream?token=${encodeURIComponent(token)}\``; remove `TODO 2.8 pre-work` comment on line 78.
- `packages/web-ui/src/pages/KanbanPage.tsx` — identical pattern, line 84 comment + line 86 URL. Add `useTokenGate` import at top.

**Public signatures unchanged**:
- `useSseEvents(opts: UseSseEventsOptions): UseSseEventsResult` — no signature change. URL construction is caller responsibility per docblock rule.

**New exports**: none.

**Reuse**:
- `useTokenGate()` returns `{ token: string; onUnauthorized: () => void }` — token is NON-NULL inside TokenGate children (guaranteed by TokenGate gating unauthenticated renders).
- `encodeURIComponent` is standard lib.

**Tests**:
- `packages/web-ui/src/hooks/use-sse-events.spec.ts` — NEW test: `"opens EventSource with URL exactly as passed"` asserting `getLastMockEventSource().url === '/api/v1/events/stream?token=abc%20%26def'` when given that URL. Proves caller-owns-URL semantics.
- `packages/web-ui/src/pages/dashboard.spec.tsx` — NEW test: `"SSE URL contains ?token= from useTokenGate"` rendering DashboardPage inside a TokenGate with token `"t-test"`, asserting `getLastMockEventSource().url` matches `/\?token=t-test$/`.
- `packages/web-ui/src/pages/kanban.spec.tsx` — identical new assertion adapted for KanbanPage.

**Success criteria (each must be verifiable)**:
- [ ] Grep `TODO 2.8 pre-work` in `packages/web-ui/src` → 0 matches
- [ ] Grep `LIMITATION` in `packages/web-ui/src/hooks/use-sse-events.ts` → 0 matches
- [ ] All three new tests pass
- [ ] `pnpm --filter @orch/web-ui run typecheck` → 0 errors
- [ ] `pnpm --filter @orch/web-ui run lint` → 0 errors

**Handoff to 2.8.b / 2.8.c**: both consumers call `useSseEvents` with URL `\`/api/v1/events/stream?token=${encodeURIComponent(token)}\``; the filter/onEvent args are page-specific (see below).

---

### Subtask 2.8.b — `ActivityFeedPage` with Agent-Monitor ring buffer

**Budget**: ~25K (task-implementer, sonnet, bg; paired with spec-compliance-reviewer + code-quality-reviewer)

**Files to create**:
- `packages/web-ui/src/lib/bounded-ring.ts` — pure utility: append-and-cap function for immutable arrays.
- `packages/web-ui/src/lib/bounded-ring.spec.ts` — unit tests for ring.
- `packages/web-ui/src/pages/ActivityPage.tsx` — replace placeholder (currently `packages/web-ui/src/pages/ActivityPage.tsx` lines 1-7) with the real page.
- `packages/web-ui/src/pages/activity.spec.tsx` — page tests.

**Public signatures**:

```typescript
// packages/web-ui/src/lib/bounded-ring.ts
/** Append one item and drop oldest entries so result.length <= maxSize.
 *  Returns a NEW array — never mutates input. Pure. No logging. */
export function appendBounded<T>(existing: readonly T[], next: T, maxSize: number): T[];

// packages/web-ui/src/pages/ActivityPage.tsx
export function ActivityPage(): JSX.Element;
```

**Behavior**:

- Maintains local state `events: ActivityEntry[]` (NOT TanStack — Agent-Monitor paradigm per spec line 452).
- On every incoming SSE event: `setEvents(prev => appendBounded(prev, { ...envelope, receivedAt: Date.now() }, 200))`.
- `ActivityEntry` shape: `{ id: string; type: EventType; trace_id: string | null; ts: string; receivedAt: number; payloadPreview: string }`.
  - `id`: `${envelope.ts}-${monotonicCounter}` (cheap per-render counter reset on mount); ensures stable React keys even if two events share `ts` at millisecond granularity.
  - `payloadPreview`: `JSON.stringify(envelope.payload).slice(0, 120)` — bounded string display; no fancy formatting.
- Filter: `undefined` (all events).
- Render list: `<ul>` of rows, most-recent-first (prepend semantics — see ring util contract below). Each row: `[time] type trace_id payloadPreview`.
- Empty state (`events.length === 0`): `<p>Waiting for events...</p>`.
- Status indicator: small badge showing `connected` from `useSseEvents` return value (green when true, red+error-msg when false).

**`bounded-ring.ts` contract decision**:

- Design intent: most-recent-FIRST rendering, so the data-structure primitive UNSHIFTS (prepend) and drops from the TAIL when length exceeds `maxSize`.
- Signature above returns `[next, ...existing].slice(0, maxSize)` — prepend-and-cap. Keeps output ready-to-render (index 0 is newest).
- Length constraint strictly enforced: if `maxSize <= 0` → throw `RangeError('maxSize must be > 0')`.
- Immutability: `Object.freeze` not required (hot path, caller owns), but MUST NOT mutate input.

**Tests — `bounded-ring.spec.ts`** (target: 6 tests):
- `"appends to empty array"` → length 1, item at index 0
- `"prepends — newest at index 0"` → feed 3 items; assert order `[c, b, a]`
- `"caps at maxSize"` → feed 205 items with maxSize 200; length exactly 200; index 0 = newest
- `"does not mutate input"` → snapshot input array before call; assert unchanged after
- `"throws on maxSize <= 0"` → each of 0, -1 throws RangeError
- `"maxSize 1 keeps only newest"` → feed 3, length 1, item = third

**Tests — `activity.spec.tsx`** (target: 10 tests):
- `"renders placeholder when no events yet"` — mount; expect `"Waiting for events..."`.
- `"renders single event after emit"` — mount, emit one valid envelope, expect one `<li>`, content contains envelope type.
- `"renders newest at top"` — emit three events with differing `ts`; assert DOM order matches reverse-chronological.
- `"caps at 200 entries"` — emit 205 events; assert `screen.getAllByRole('listitem').length === 200`.
- `"drops malformed envelopes"` — emit non-JSON + malformed JSON; list stays empty (relies on `parseSseEnvelope` inside `useSseEvents` already dropping; test verifies no crash + empty list).
- `"no filter — receives events of any known type"` — emit one `hook.received` and one `session.started`; both appear in list.
- `"shows connected badge when open"` — emit open event; assert badge text/testid shows connected state.
- `"shows disconnected badge on error"` — emit error; assert badge shows disconnected + lastError message.
- `"SSE URL includes ?token="` — mount under TokenGate fixture with token `"t-act"`; assert `getLastMockEventSource().url.includes('?token=t-act')`.
- `"useSseEvents is called with no filter (undefined)"` — spy on `useSseEvents`; assert `.filter` arg is `undefined` (all-events paradigm).

**Dependencies**:
- Imports `useSseEvents` from `../hooks/use-sse-events.js`.
- Imports `useTokenGate` from `../auth/token-gate-context.js`.
- Imports `appendBounded` from `../lib/bounded-ring.js`.
- Imports `SseEnvelope`, `EventType` types from `@orch/shared`.
- NO `@orch/core` imports (I-4).
- NO `any` (strict TypeScript).

**Success criteria**:
- [ ] `pnpm --filter @orch/web-ui test` adds +16 tests (6 ring + 10 page); total delta +16
- [ ] `grep -rn '@orch/core' packages/web-ui/src` → 0 matches (I-4)
- [ ] `grep -rn 'anthropic\|openai' packages/web-ui/src` → 0 matches (I-1, I-3)
- [ ] `grep -n 'any' packages/web-ui/src/pages/ActivityPage.tsx packages/web-ui/src/lib/bounded-ring.ts` → 0 matches (strict TS)
- [ ] `pnpm --filter @orch/web-ui run typecheck` → 0 errors
- [ ] `pnpm --filter @orch/web-ui run lint` → 0 errors
- [ ] Ring util is < 25 lines of production code (simplicity goal per architect brief)

**Handoff to 2.8.c**: the ring util MAY be reused in Session Detail if the tail panel wants live-append semantics; otherwise Session Detail uses its own tail-buffer strategy.

---

### Subtask 2.8.c — `SessionDetailPage` + tail/logs panel + per-session SSE filter

**Budget**: ~30K (task-implementer, sonnet, bg; paired with spec-compliance-reviewer + code-quality-reviewer)

**Files to create / modify**:
- `packages/web-ui/src/api/client.ts` — add two methods to `ApiClient.sessions` namespace (signatures below). Extend zod schemas.
- `packages/web-ui/src/api/client.spec.ts` — tests for the two new client methods.
- `packages/web-ui/src/pages/SessionDetailPage.tsx` — replace placeholder (lines 1-14 currently) with real page.
- `packages/web-ui/src/pages/session-detail.spec.tsx` — page tests.

**Public signature additions on ApiClient** (Part B contract):

```typescript
// packages/web-ui/src/api/client.ts — add to sessions namespace
readonly sessions: {
  active(): Promise<ActiveSessionDto | null>;                       // existing
  stop(id: string, confirm: true): Promise<void>;                   // existing
  // NEW:
  tail(id: string, lines?: number): Promise<{ lines: string[]; truncated: boolean }>;
  logs(id: string): Promise<string>;
};
```

**New zod schemas in `client.ts`**:

```typescript
const TailResponseSchema = z.object({
  lines: z.array(z.string()),
  truncated: z.boolean(),
});
```

- `logs()` returns `text/plain` (content-type set server-side, verified in `api.controller.ts:357`). Client calls `response.text()` — no zod validation of the body itself, but DO assert `response.headers.get('content-type')?.startsWith('text/plain')` and throw `ApiClientError(415, ...)` otherwise. This is I-10 defence against API drift.

**Endpoint wiring**:
- `tail(id, lines?)` → `GET /api/v1/sessions/${encodeURIComponent(id)}/tail${lines !== undefined ? \`?lines=${lines}\` : ''}`.
  - 404 → throw `ApiClientError(404, ...)` (page handles).
  - 200 → `parseJson(res, TailResponseSchema, path)`.
- `logs(id)` → `GET /api/v1/sessions/${encodeURIComponent(id)}/logs`.
  - 404 → throw `ApiClientError(404, ...)`.
  - 200 → `response.text()` (with content-type check above).

**`SessionDetailPage` behavior**:

```typescript
export function SessionDetailPage(): JSX.Element;
```

- Read `id` from `useParams<{ id: string }>()`. If `id` is undefined (shouldn't happen given route) → render `"No session ID"`.
- Three sections rendered in order:
  1. **Metadata card**: `sessionId`, state badge, project path, started-at (relative). Data sourced from `client.sessions.active()` filtered by id. If the session is NOT in the active list, show `"Session <id> not active"` and render only sections below if endpoints still respond.
  2. **Tail panel**: calls `client.sessions.tail(id, 50)` via TanStack Query; renders lines in `<pre>`; shows "truncated" banner when `truncated === true`. Refetch button. Loading skeleton while query pending. Error fallback: "Tail unavailable; try full logs." with a "Load full logs" button that triggers the logs query.
  3. **Full logs** (lazy): only fetched on demand via the "Load full logs" button (spec Risk #1 authorized). Shown in `<pre>` with scrollable container.
- **Per-session SSE filter**: subscribe via `useSseEvents` with URL `/api/v1/events/stream?token=<t>` (NO `filter` on the hook because filtering by session ID is not a schema-level filter — it's a payload filter). In the `onEvent` callback: if `envelope.payload?.sessionId === id` OR envelope type is `session.*` with matching id, call `tailQuery.refetch()` (and any metadata refetch). Keep filter logic inline + exhaustive over relevant types.
- Nav link: "← Back to Activity" to `/activity`.

**Tests — `client.spec.ts`** (target: +6 tests):
- `"tail — happy path returns lines + truncated"` — mock fetch with `{ lines: ['a','b'], truncated: false }`; call `client.sessions.tail('s1', 20)`; assert request URL `.../sessions/s1/tail?lines=20`; assert parsed result.
- `"tail — lines param omitted when undefined"` — no `?lines=` in URL.
- `"tail — 404 throws ApiClientError with status=404"`.
- `"tail — schema-invalid body throws validation error"`.
- `"logs — happy path returns text body"`.
- `"logs — wrong content-type throws ApiClientError(415)"`.

**Tests — `session-detail.spec.tsx`** (target: 12 tests):
- `"renders metadata when session is active"` — mock client active() returns list including `id='s1'`.
- `"renders 'not active' banner when session missing from active list"`.
- `"renders tail lines in <pre>"` — mock tail to return 3 lines.
- `"renders truncated banner when tail.truncated=true"`.
- `"clicking Load full logs triggers logs query"`.
- `"logs render in <pre>"`.
- `"SSE event matching sessionId triggers tail refetch"` — emit `session.state_changed` with `payload.sessionId === 'current-id'`; assert tail.refetch called.
- `"SSE event with different sessionId does NOT trigger refetch"` — assert no extra refetch.
- `"SSE URL includes ?token="`.
- `"tail loading state shows skeleton"`.
- `"tail error shows fallback with 'Load full logs' button"`.
- `"back-to-activity link present"`.

**Route fixture for page tests**: use `MemoryRouter` with `initialEntries={['/sessions/s1']}` + `<Route path="/sessions/:id" element={<SessionDetailPage />} />`.

**Success criteria**:
- [ ] `pnpm --filter @orch/web-ui test` adds +18 tests (6 client + 12 page); total delta +18
- [ ] Invariants: `@orch/core`, `anthropic`, `openai` greps over `packages/web-ui/src` remain 0
- [ ] No `any` in new files
- [ ] `pnpm --filter @orch/web-ui run typecheck` → 0 errors
- [ ] `pnpm --filter @orch/web-ui run lint` → 0 errors
- [ ] I-6 NOT invoked: Session Detail does NOT expose a stop button (per spec scope — stop lives on Kanban only). If implementer is tempted to add stop, reject.
- [ ] I-10: every core-API response validated via zod or explicit content-type check

**Handoff to 2.8.d**: route `/sessions/:id` is already wired in `App.tsx`; 2.8.d just verifies nav link + integration.

---

### Subtask 2.8.d — Routes/nav layout + cross-page integration regression

**Budget**: ~10K (task-implementer, sonnet, bg; paired with spec-compliance-reviewer + code-quality-reviewer)

**Files to create**:
- `packages/web-ui/src/components/nav-shell.tsx` — shared nav bar with 4 links (Dashboard, Activity, Kanban, Settings). Renders children in `<main>`.
- `packages/web-ui/src/components/nav-shell.spec.tsx` — tests.
- `packages/web-ui/src/App.spec.tsx` — NEW integration regression test (app-level).

**Files to modify**:
- `packages/web-ui/src/App.tsx` — wrap each `<Route element={...}/>` content in `<NavShell>` OR hoist `<NavShell>` above `<Routes>` so it renders on every page. Prefer the latter (single shell). App.tsx shape:

```tsx
<BrowserRouter>
  <NavShell>
    <Routes>...</Routes>
  </NavShell>
</BrowserRouter>
```

**Public signatures**:

```typescript
// packages/web-ui/src/components/nav-shell.tsx
export function NavShell(props: { children: ReactNode }): JSX.Element;
```

- Uses React Router `<NavLink>` so active route gets `aria-current="page"`.
- Link list (data-testid `nav-link-<slug>`):
  - `/` → "Dashboard"
  - `/activity` → "Activity"
  - `/kanban` → "Kanban"
  - `/settings` → "Settings"
- NO link to `/sessions/:id` (that's deep-link only). Per spec scope.

**Tests — `nav-shell.spec.tsx`** (target: 4 tests):
- `"renders all 4 nav links"`.
- `"renders children below nav"`.
- `"current route link has aria-current='page'"`.
- `"no sessions nav link (deep-link only)"`.

**Tests — `App.spec.tsx`** (target: 4 tests):
- `"all 4 nav routes + deep session route render under TokenGate"` — extend router.spec.tsx patterns: navigate `/`, `/activity`, `/kanban`, `/sessions/s1`; assert each testid renders.
- `"SSE TODO strings do not appear anywhere in packages/web-ui/src"` — file-scan assertion via `readFileSync`+regex (reuse `fs` from node); asserts clean of `TODO 2.8`.
- `"no @orch/core imports"` — file-scan assertion (mirror pattern if any exists) OR delegate to a shell-gate rule documented in handoff.
- `"all SSE subscriptions use authenticated URL (contain '?token=')"` — render each page under TokenGate; assert every `getAllMockEventSources()` entry's URL contains `?token=`.

**Success criteria**:
- [ ] `pnpm --filter @orch/web-ui test` adds +8 tests total (4 nav-shell + 4 App integration)
- [ ] `App.tsx` renders `<NavShell>` on every route
- [ ] Nav links visible on all 4 pages (manual boot smoke OK but not a CI gate)
- [ ] All gates green (typecheck / lint / test)
- [ ] Monorepo `pnpm -r run test` count = 993 + (3 from 2.8.a + 16 from 2.8.b + 18 from 2.8.c + 8 from 2.8.d) = **993 + 45 = 1038**

---

## Part C — Risks & Authorized Deviations

### Risk #1 — Tail endpoint returns 404 for sessions that ended pre-session-detail-implementation
- **Likelihood**: high — `getSessionTail` only works for ACTIVE sessions (per `api.controller.ts:336-339`).
- **Authorized response**: Session Detail renders "Session <id> not active" banner + hides tail panel (or shows "no live tail available"). Implementer MUST NOT invent a historical-transcript endpoint — out of scope, deferred.
- **Test coverage**: `session-detail.spec.tsx` test `"renders 'not active' banner when session missing from active list"`.

### Risk #2 — `logs` endpoint returns text/plain; client must tolerate it
- **Likelihood**: certain — verified line 357 in `api.controller.ts`.
- **Authorized response**: Client method `logs(id)` calls `response.text()` and checks content-type header. Explicit `ApiClientError(415)` if drift.
- **Test coverage**: `client.spec.ts` test `"logs — wrong content-type throws ApiClientError(415)"`.

### Risk #3 — `useTokenGate()` throws when rendered outside TokenGate (e.g., tests that mount DashboardPage without TokenGate)
- **Likelihood**: medium — `router.spec.tsx` currently uses `ApiClientContext.Provider` directly, bypassing TokenGate.
- **Authorized response**: Tests that render pages directly (without TokenGate) MUST wrap in a minimal `TokenGateContext.Provider` fixture. Add a `renderWithTokenGate` helper in a shared test util OR inline. Existing `router.spec.tsx` may need adjustment (2.8.d implementer: if `router.spec.tsx` breaks after 2.8.a rewrite, fix it by providing `TokenGateContext.Provider` with `{ token: 't-test', onUnauthorized: vi.fn() }`).
- **Test coverage**: each page spec provides the wrapper; `router.spec.tsx` gets the wrapper in 2.8.a or 2.8.d.

### Risk #4 — `encodeURIComponent(token)` for tokens containing `%` or `&`
- **Likelihood**: low (tokens are alphanum by convention) but defence-in-depth matters.
- **Authorized response**: ALWAYS call `encodeURIComponent`; `BearerAuthGuard` uses `req.query['token']` which Fastify URL-decodes — so the round-trip is safe even for weird tokens. Add 1 test case: `use-sse-events.spec.ts` new test `"URL is passed verbatim (encoding is caller's responsibility)"`.

### Risk #5 — `payloadPreview: JSON.stringify(...)` on circular / huge payloads could OOM the browser
- **Likelihood**: low (core events are small + serialized) but unbounded structured clone is a smell.
- **Authorized response**: Use `try { JSON.stringify(envelope.payload).slice(0, 120) } catch { return '[unserializable]'; }`. Covered by code-quality review invariant about bounded structures (agent-notes 2026-04-25 rule on unbounded push).

### Risk #6 — Ring buffer's newest-first semantics may feel slow for 200 events at every keystroke (cost: 200-element copy)
- **Likelihood**: negligible (200 items × React's reconciliation is microseconds).
- **Authorized response**: ship as-is. Do NOT premature-optimize to linked-list or dequeue. If perf regresses in manual smoke, escalate to a separate task — spec-line simplicity principle (P2) wins.

### Risk #7 — Session Detail SSE filter might trigger re-render storms for busy sessions (many `hook.received` per minute)
- **Likelihood**: medium.
- **Authorized response**: filter to only `session.*` envelope types + envelopes where payload.sessionId matches. Do NOT refetch on every `hook.received` — spec focus is state + tail updates, not every hook. Tail refetch budget: ≤1 / 500ms via small manual debounce if test evidence shows storm. Initial impl WITHOUT debounce; if 2.8.c code-quality reviewer flags storm-risk, authorize +5K narrow fix adding debounce.

### Risk #8 — `TokenGate` token is technically `string`, not `NonEmptyString`; guard in hook consumers
- **Likelihood**: low — TokenGate gates rendering on a valid token.
- **Authorized response**: rely on TokenGate guarantee. No extra runtime check in consumer pages. Document in each page's docblock: "Assumes TokenGate has validated token before rendering."

### Risk #9 — File-scan tests in `App.spec.tsx` depend on `readFileSync` at test time; fragile to `dist/` contamination
- **Likelihood**: medium — Vitest jsdom env + `readFileSync` works but path resolution from test files can drift.
- **Authorized response**: scan ONLY `src/**/*.{ts,tsx}`; use `import.meta.url` → `fileURLToPath` to resolve the src dir relative to the test file. If resolution becomes flaky, demote the scan test to a package.json script grep instead and DELETE the test — do not let flaky tests land.

---

## Part D — Per-subtask Test Count Targets

| Subtask | New tests | Test files created/modified |
|---|---|---|
| 2.8.a | **+3** | `use-sse-events.spec.ts` (+1), `dashboard.spec.tsx` (+1), `kanban.spec.tsx` (+1) |
| 2.8.b | **+16** | `bounded-ring.spec.ts` (+6 new file), `activity.spec.tsx` (+10 new file) |
| 2.8.c | **+18** | `client.spec.ts` (+6), `session-detail.spec.tsx` (+12 new file) |
| 2.8.d | **+8** | `nav-shell.spec.tsx` (+4 new file), `App.spec.tsx` (+4 new file) |
| **Total** | **+45** | web-ui only; core/cli/shared/telegram deltas = 0 |

Monorepo: 993 → **1038**. Floor threshold (per agent-notes 2026-04-25 red-flags rule: ~4 tests per feature minimum): each subtask clears the floor. Below-floor would trigger code-quality reviewer challenge.

---

## Part E — Dispatch Order & Reviewer Pipeline

Per phase plan (line 726) and agent-notes rule (2026-04-25 "security primitives wired at boundaries + integration test"), each subtask dispatches as:

```
task-implementer (sonnet, bg) → DONE_WITH_CONCERNS or DONE
  → spec-compliance-reviewer (sonnet, bg) — PASS or APPROVED_AFTER_FIX
    → code-quality-reviewer (sonnet, bg) — PASS or APPROVED_AFTER_FIX
      → if either reviewer flags, narrow-fix implementer (sonnet, bg, ~5K)
        → re-review cycle
```

### Sequence

1. **Dispatch 2.8.a** first. On DONE + both reviewers PASS → proceed.
2. **Dispatch 2.8.b**. On DONE + both reviewers PASS → proceed.
3. **Dispatch 2.8.c**. On DONE + both reviewers PASS → proceed.
4. **Dispatch 2.8.d** LAST — it verifies the combined surface + acts as integration gate.

At the end of 2.8.d, before close-out:
- [ ] Monorepo `pnpm -r run test` → all green, count ≥ 1038
- [ ] `pnpm -r run typecheck` → 0 errors
- [ ] `pnpm -r run lint` → 0 errors
- [ ] `grep -rn 'TODO 2.8' packages/web-ui/src` → 0 matches
- [ ] `grep -rn '@orch/core' packages/web-ui/src` → 0 matches
- [ ] `grep -rn 'anthropic\|openai' packages/web-ui/src` → 0 matches
- [ ] Manual boot smoke (optional, NOT a CI gate): `pnpm --filter @orch/core dev` + `pnpm --filter @orch/web-ui dev`; navigate to `/activity` with a real plan firing through core; assert events appear within 2s. If core is not runnable locally (env issue), skip and note in close-out.

No `git commit` at any point unless user explicitly requests (I-6 project rule).

---

## Success Criteria (Task-level close-out)

- [ ] All 4 subtasks DONE (or DONE_WITH_CONCERNS with concerns documented in close-out)
- [ ] Monorepo tests: 993 → 1038 passing (target) ±2 for test-case consolidation
- [ ] `pnpm -r run typecheck` / `lint` / `test` all green
- [ ] Invariant greps clean (I-1, I-2, I-3, I-4, I-10, I-14)
- [ ] Phase-spec Part A `ActivityFeedPage` contract satisfied (ring buffer 200, no filter, Agent-Monitor paradigm, live count)
- [ ] Phase-spec Part A `SessionDetailPage` contract satisfied (tail panel, logs fallback, per-session SSE filter, metadata)
- [ ] Phase-spec Part B contract satisfied (page exports are the same signatures we specified in `Part B` above)
- [ ] `useSseEvents` TODO comments removed; URL construction site is caller-owned per docblock
- [ ] NavShell renders on all 4 primary routes; deep `/sessions/:id` route works

---

## Handoff to Next Task (2.9 — OTEL runtime wiring)

- All Web UI SSE subscriptions are now production-authenticated via `?token=` query param
- `useSseEvents`, `ActivityFeedPage`, `SessionDetailPage` are wired
- `bounded-ring.ts` util available for future live-append panels (Phase 3 handoff builder may reuse)
- No new core endpoints shipped — 2.9 can proceed without rebase risk
- Known deferral: Session Detail's full transcript pagination (spec line 453 — `?offset=&limit=`) deferred to Phase 3 as the current `tail` / `logs` pair sufficiently covers 2.8 scope. Verify in phase verifier (2.12) that this deferral is documented.

---

## Risks Carried Forward (if any subtask DONE_WITH_CONCERNS)

- If 2.8.b: payload-preview truncation at 120 chars could hide event context (by design; diagnostic UX improvement = Phase 3)
- If 2.8.c: no debounce on per-session SSE refetch (Risk #7) — authorized deviation; acceptable unless verifier flags re-render storm
- If 2.8.d: file-scan tests may be demoted to package.json scripts if flaky (Risk #9)

All deferred items document in `agent-workspace/memory/sessions/<YYYY-MM-DD>-session-<N>.md` on close.
