/**
 * kanban.flicker.spec.tsx — Integration-level non-flicker regression tests.
 *
 * Carryover from spec line 441 + Task 1.10: proves the Kanban "Running" column
 * does NOT flicker (does NOT empty transiently) during SSE-triggered refetches.
 *
 * Two scenarios:
 *  1. Happy non-flicker: SSE triggers refetch while previous data is held as
 *     placeholder — running card stays visible during the in-flight refetch.
 *  2. DB-error non-flicker: background refetch rejects once; with `placeholderData`
 *     semantics (previous data persists in query state on background error), the
 *     running card stays visible throughout. A second SSE event recovers and the
 *     card is still present after settlement.
 *
 * Non-flicker assertion strategy:
 *  - Test 1: Freeze the second queueList call in a deferred promise; assert the
 *    running card is visible WHILE the refetch is in-flight (`isFetching=true`).
 *    Then resolve and assert card still present.
 *  - Test 2: Reject the second queueList call (simulating a transient DB error).
 *    Assert the running card is visible immediately after the error settles (not
 *    replaced by the full-screen error state). Then emit a second SSE event to
 *    trigger a successful recovery refetch and assert card still present.
 *
 * TanStack Query v5 behaviour relied upon:
 *  - `placeholderData: (prev) => prev` in KanbanPage's useQuery is already wired.
 *  - During in-flight refetch: `data` keeps the previous value → no skeleton.
 *  - On background refetch error: query state spreads previous `data`, so
 *    `queueQuery.data` stays non-undefined even when `isError=true`.
 *  - KanbanPage error check is therefore guarded by `!queueQuery.data` so the
 *    full-screen error is ONLY shown on initial load failure (no stale data).
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode, JSX } from 'react';
import { KanbanPage } from './KanbanPage.js';
import {
  installMockEventSource,
  getLastMockEventSource,
} from '../hooks/use-sse-events-fixtures.js';
import { ApiClientContext } from '../api/api-client-context.js';
import { TokenGateContext } from '../auth/token-gate-context.js';
import type { ApiClient } from '../api/client.js';
import type { QueueItemDto } from '@orch/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a QueryClient with retry disabled for deterministic test behaviour.
 * The `staleTime: 0` ensures queries are always considered stale so refetches
 * happen on cache invalidation.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

/** Builds a single running QueueItemDto for use as the fixture. */
function makeRunningItem(id = 'run-1'): QueueItemDto {
  return {
    id,
    projectId: `proj-${id}`,
    planPath: `/workspace/plans/${id}-task.md`,
    priority: 0,
    state: 'running',
    sessionId: `sess-${id}`,
    enqueuedAt: '2026-01-01T00:00:00Z',
    startedAt: '2026-01-01T10:00:00Z',
    endedAt: null,
  };
}

/**
 * Minimal ApiClient mock. `queueList` is required; other methods are no-ops.
 */
function makeApiClientMock(queueList: ReturnType<typeof vi.fn>): ApiClient {
  return {
    queue: {
      list: queueList,
      enqueue: vi.fn(),
    },
    sessions: {
      active: vi.fn().mockResolvedValue(null),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    projects: {
      list: vi.fn(),
    },
  } as unknown as ApiClient;
}

interface WrapperProps {
  client: ApiClient;
  qc: QueryClient;
  children: ReactNode;
}

function Wrapper({ client, qc, children }: WrapperProps): JSX.Element {
  return (
    <QueryClientProvider client={qc}>
      <ApiClientContext.Provider value={client}>
        <TokenGateContext.Provider value={{ token: 'test-token', onUnauthorized: () => undefined }}>
          {children as JSX.Element}
        </TokenGateContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>
  );
}

function renderKanban(client: ApiClient, qc: QueryClient) {
  return render(
    <Wrapper client={client} qc={qc}>
      <KanbanPage />
    </Wrapper>,
  );
}

// ── MockEventSource lifecycle ─────────────────────────────────────────────────

let restoreEventSource: () => void;

beforeEach(() => {
  restoreEventSource = installMockEventSource();
});

afterEach(() => {
  restoreEventSource();
  vi.clearAllMocks();
});

// ── SSE helper ────────────────────────────────────────────────────────────────

/**
 * Emits a `queue.state_changed` SSE envelope through the most recently created
 * MockEventSource. Wraps both open and message in act() as required.
 *
 * Carryover note (spec line 441 / Task 1.10): the original carryover concern was
 * about a `hook.received` webhook event arriving concurrently with a queue-list
 * failure. In the full system, `hook.received` is a backend webhook event that
 * propagates downstream into `queue.state_changed` or `session.*` events.
 * KanbanPage's SSE filter only handles `queue.*` and `session.*` event types —
 * emitting `hook.received` directly through the filter would be silently dropped.
 * The test therefore simulates the observable consequence at the KanbanPage level:
 * a `queue.state_changed` event arrives (as it would after a hook triggers a queue
 * state transition), and the running card must not flicker.
 */
function emitQueueStateChanged(
  es: ReturnType<typeof getLastMockEventSource>,
): void {
  act(() => {
    es._emitOpen();
  });

  const envelope = JSON.stringify({
    type: 'queue.state_changed',
    payload: {},
    ts: new Date().toISOString(),
  });

  act(() => {
    es._emitMessage(envelope);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KanbanPage — non-flicker: happy path (concurrent refetch)', () => {
  it(
    'running card stays visible during an in-flight SSE-triggered background refetch',
    async () => {
      const runningItem = makeRunningItem('run-happy');

      // Deferred second call — lets us inspect the UI while the refetch is in-flight.
      let resolveSecondCall!: (v: QueueItemDto[]) => void;
      const secondCallPromise = new Promise<QueueItemDto[]>((res) => {
        resolveSecondCall = res;
      });

      const queueList = vi
        .fn()
        .mockResolvedValueOnce([runningItem]) // call 1: initial load
        .mockReturnValueOnce(secondCallPromise); // call 2: background refetch (deferred)

      const client = makeApiClientMock(queueList);
      const qc = makeQueryClient();

      renderKanban(client, qc);

      // ── Step 1: initial load resolves; running card visible ───────────────────
      await waitFor(() => {
        expect(
          screen.getByTestId(`queue-card-run-happy`),
        ).toBeInTheDocument();
      });

      // ── Step 2: SSE event triggers cache invalidation → background refetch ───
      const es = getLastMockEventSource();
      emitQueueStateChanged(es);

      // Wait for TanStack to fire the second queueList call
      await waitFor(() => {
        expect(queueList).toHaveBeenCalledTimes(2);
      });

      // ── Step 3: While refetch is still in-flight, running card MUST be visible
      // (placeholderData: (prev) => prev keeps previous data during isFetching)
      // Assert: no skeleton, no error state, running card present
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('kanban-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('queue-card-run-happy')).toBeInTheDocument();

      // ── Step 4: Resolve refetch; card still present after settlement ─────────
      act(() => {
        resolveSecondCall([runningItem]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('queue-card-run-happy')).toBeInTheDocument();
      });

      // Confirm no loading/error states appeared post-settlement
      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('kanban-error')).not.toBeInTheDocument();
    },
  );
});

describe('KanbanPage — non-flicker: DB-error recovery (transient error then success)', () => {
  it(
    'running card stays visible when background refetch rejects once then succeeds',
    async () => {
      const runningItem = makeRunningItem('run-dberr');

      const queueList = vi
        .fn()
        .mockResolvedValueOnce([runningItem]) // call 1: initial load
        .mockRejectedValueOnce(new Error('transient DB error')) // call 2: background refetch error
        .mockResolvedValue([runningItem]); // call 3+: recovery

      const client = makeApiClientMock(queueList);
      const qc = makeQueryClient();

      renderKanban(client, qc);

      // ── Step 1: initial load; running card visible ────────────────────────────
      await waitFor(() => {
        expect(
          screen.getByTestId('queue-card-run-dberr'),
        ).toBeInTheDocument();
      });

      // ── Step 2: SSE triggers a refetch that REJECTS (transient DB error) ─────
      const es = getLastMockEventSource();
      emitQueueStateChanged(es);

      // ── Step 3: Wait for TanStack to fully process the error state.
      // We poll the QueryClient directly to confirm the internal query status
      // has transitioned to "error" — this is a stronger synchronization than
      // merely checking queueList.mock.calls.length, because it confirms that
      // the rejected promise has propagated all the way through TanStack's
      // retryer and the query state has been dispatched.
      await waitFor(() => {
        const state = qc.getQueryState<QueueItemDto[], Error>(['queue']);
        // status "error" confirms TanStack has processed the rejection
        expect(state?.status).toBe('error');
      });

      // ── Step 4: With `placeholderData: (prev) => prev`, the query state
      // preserves `data = [runningItem]` even when `status = "error"`.
      // KanbanPage guards the full-screen error with `!queueQuery.data` so the
      // running card stays visible and the error banner is NOT shown.
      // If this assertion fails, it means KanbanPage does NOT guard the error
      // check by data presence → production fix required.
      expect(screen.queryByTestId('kanban-error')).not.toBeInTheDocument();
      expect(
        screen.getByTestId('queue-card-run-dberr'),
      ).toBeInTheDocument();

      // ── Step 5: Second SSE event triggers a successful recovery refetch ──────
      emitQueueStateChanged(es);

      // Wait for TanStack to process the successful recovery
      await waitFor(() => {
        const state = qc.getQueryState<QueueItemDto[], Error>(['queue']);
        expect(state?.status).toBe('success');
        // Must have made at least 3 calls (initial + error + recovery)
        expect(queueList).toHaveBeenCalledTimes(3);
      });

      // ── Step 6: Running card still present after successful recovery ──────────
      expect(
        screen.getByTestId('queue-card-run-dberr'),
      ).toBeInTheDocument();

      expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('kanban-error')).not.toBeInTheDocument();
    },
  );
});
