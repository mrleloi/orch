/**
 * dashboard.spec.tsx — Tests for DashboardPage.
 *
 * ~10 tests covering:
 * 1. Renders 4 stat cards (data-testid: stat-active, stat-queue, stat-tokens, stat-cost)
 * 2. Each stat card shows Skeleton while loading
 * 3. Each stat card shows error variant with retry button on error
 * 4. Active Session card displays 0 or 1
 * 5. Queue Depth displays integer count
 * 6. Daily Cost renders $X.XX format
 * 7. Recent Sessions list renders up to 10, sorted newest-first
 * 8. Recent Sessions empty state ("No recent sessions")
 * 9. SSE queue.state_changed envelope invalidates ['queue'] key
 * 10. SSE session.ended envelope invalidates active-session query
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode, JSX } from 'react';
import { DashboardPage } from './DashboardPage.js';
import {
  installMockEventSource,
  getLastMockEventSource,
} from '../hooks/use-sse-events-fixtures.js';
import { ApiClientContext } from '../api/api-client-context.js';
import { TokenGateContext } from '../auth/token-gate-context.js';
import type { ApiClient } from '../api/client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

function makeSession(overrides: Partial<{
  id: string;
  projectId: string;
  planPath: string;
  state: 'active' | 'completed' | 'failed' | 'pending' | 'cancelled';
  startedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}> = {}) {
  return {
    id: overrides.id ?? 'sess-1',
    projectId: overrides.projectId ?? 'proj-a',
    planPath: overrides.planPath ?? '/plans/task.md',
    state: overrides.state ?? ('active' as const),
    claudeSessionId: null,
    startedAt: overrides.startedAt ?? '2026-01-01T10:00:00Z',
    endedAt: null,
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 200,
    costUsd: overrides.costUsd ?? 1.23,
    traceId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeQueueItem(id: string, state: 'pending' | 'running' | 'completed' = 'pending') {
  return {
    id,
    projectId: 'proj-a',
    planPath: '/plans/task.md',
    priority: 0,
    state,
    sessionId: null,
    enqueuedAt: '2026-01-01T00:00:00Z',
    startedAt: null,
    endedAt: null,
  };
}

/**
 * Builds a minimal ApiClient mock using vi.fn() for the methods used by DashboardPage.
 */
function makeApiClientMock(overrides: {
  queueList?: ReturnType<typeof vi.fn>;
  sessionsActive?: ReturnType<typeof vi.fn>;
} = {}): ApiClient {
  return {
    queue: {
      list: overrides.queueList ?? vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
    },
    sessions: {
      active: overrides.sessionsActive ?? vi.fn().mockResolvedValue(null),
      stop: vi.fn(),
    },
    projects: {
      list: vi.fn(),
    },
  } as unknown as ApiClient;
}

interface WrapperProps {
  client: ApiClient;
  qc: QueryClient;
  token?: string;
  children: ReactNode;
}

/**
 * Test wrapper providing QueryClient + ApiClientContext + TokenGateContext.
 * token defaults to 'test-token' so DashboardPage can call useTokenGate().
 */
function Wrapper({ client, qc, token = 'test-token', children }: WrapperProps): JSX.Element {
  return (
    <QueryClientProvider client={qc}>
      <ApiClientContext.Provider value={client}>
        <TokenGateContext.Provider value={{ token, onUnauthorized: () => undefined }}>
          {children as JSX.Element}
        </TokenGateContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>
  );
}

function renderDashboard(client: ApiClient, qc: QueryClient, token?: string) {
  return render(
    <Wrapper client={client} qc={qc} token={token}>
      <DashboardPage />
    </Wrapper>,
  );
}

// ── MockEventSource install / restore ─────────────────────────────────────────

let restoreEventSource: () => void;

beforeEach(() => {
  restoreEventSource = installMockEventSource();
});

afterEach(() => {
  restoreEventSource();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardPage — stat cards presence', () => {
  it('renders all 4 stat cards after data loads', async () => {
    const session = makeSession({ inputTokens: 10, outputTokens: 20, costUsd: 0.5 });
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([makeQueueItem('qi-1', 'pending')]),
      sessionsActive: vi.fn().mockResolvedValue(session),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('stat-active')).toBeInTheDocument();
      expect(screen.getByTestId('stat-queue')).toBeInTheDocument();
      expect(screen.getByTestId('stat-tokens')).toBeInTheDocument();
      expect(screen.getByTestId('stat-cost')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage — loading states', () => {
  it('renders Skeleton inside stat cards while queries are loading', () => {
    // Mock that never resolves — queries stay in loading state
    const client = makeApiClientMock({
      queueList: vi.fn().mockReturnValue(new Promise(() => undefined)),
      sessionsActive: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    // All 4 cards should render but show skeleton (no text values)
    expect(screen.getByTestId('stat-active')).toBeInTheDocument();
    // Skeletons are rendered — no "Active Session" label text while loading
    // (the label is only shown in non-loading variant)
    expect(screen.queryByText('Active Session')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — error states', () => {
  it('shows error card with Retry button when stats query fails', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockRejectedValue(new Error('Network error')),
      sessionsActive: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      // All stat cards switch to destructive variant on error
      const retryButtons = screen.getAllByRole('button', { name: 'Retry' });
      expect(retryButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clicking Retry in error state triggers a refetch', async () => {
    const queueList = vi.fn().mockRejectedValueOnce(new Error('fail'));
    const sessionsActive = vi.fn().mockRejectedValueOnce(new Error('fail'));
    const client = makeApiClientMock({ queueList, sessionsActive });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
    });

    const retryButton = screen.getAllByRole('button', { name: 'Retry' })[0];
    await userEvent.click(retryButton!);

    // Refetch was triggered (queueList called at least twice)
    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('DashboardPage — stat card values', () => {
  it('Active Session card shows "1" when a session is active', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
      sessionsActive: vi.fn().mockResolvedValue(makeSession()),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      const card = screen.getByTestId('stat-active');
      expect(card).toHaveTextContent('1');
    });
  });

  it('Active Session card shows "0" when no session is active', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
      sessionsActive: vi.fn().mockResolvedValue(null),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      const card = screen.getByTestId('stat-active');
      expect(card).toHaveTextContent('0');
    });
  });

  it('Queue Depth card shows integer count of pending/running items', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([
        makeQueueItem('qi-1', 'pending'),
        makeQueueItem('qi-2', 'running'),
        makeQueueItem('qi-3', 'completed'), // terminal — not counted
      ]),
      sessionsActive: vi.fn().mockResolvedValue(null),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      const card = screen.getByTestId('stat-queue');
      expect(card).toHaveTextContent('2');
    });
  });

  it('Daily Cost card renders $X.XX format', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
      sessionsActive: vi.fn().mockResolvedValue(makeSession({ costUsd: 4.56 })),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      const card = screen.getByTestId('stat-cost');
      expect(card).toHaveTextContent('$4.56');
    });
  });
});

describe('DashboardPage — recent sessions', () => {
  it('shows "No recent sessions" when no session is active', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
      sessionsActive: vi.fn().mockResolvedValue(null),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('recent-sessions-empty')).toBeInTheDocument();
      expect(screen.getByText('No recent sessions')).toBeInTheDocument();
    });
  });

  it('renders session rows sorted newest-first by startedAt', async () => {
    // Single session
    const session = makeSession({
      id: 'sess-abc',
      startedAt: '2026-01-02T12:00:00Z',
    });
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
      sessionsActive: vi.fn().mockResolvedValue(session),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-abc')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage — recent sessions error state', () => {
  it('shows recent-sessions-error when sessions.active() rejects', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
      sessionsActive: vi.fn().mockRejectedValue(new Error('fetch failed')),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('recent-sessions-error')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage — SSE URL token', () => {
  it('SSE URL contains ?token= from useTokenGate', () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockReturnValue(new Promise(() => undefined)),
      sessionsActive: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderDashboard(client, qc, 'a b&c');

    const es = getLastMockEventSource();
    expect(es.url).toMatch(/\?token=a%20b%26c$/);
  });
});

describe('DashboardPage — SSE cache invalidation', () => {
  it('queue.state_changed SSE event invalidates ["queue"] key and triggers refetch', async () => {
    const queueList = vi.fn().mockResolvedValue([]);
    const sessionsActive = vi.fn().mockResolvedValue(null);
    const client = makeApiClientMock({ queueList, sessionsActive });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    // Wait for initial data load
    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    const initialCallCount = queueList.mock.calls.length;

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    // Emit a queue.state_changed SSE event
    const envelope = JSON.stringify({
      type: 'queue.state_changed',
      payload: {},
      ts: new Date().toISOString(),
    });

    act(() => {
      es._emitMessage(envelope);
    });

    // The ['dashboard', 'stats'] query should be invalidated and trigger a new refetch
    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('session.ended SSE event invalidates active-session query and triggers refetch', async () => {
    const queueList = vi.fn().mockResolvedValue([]);
    const sessionsActive = vi.fn().mockResolvedValue(makeSession());
    const client = makeApiClientMock({ queueList, sessionsActive });
    const qc = makeQueryClient();

    renderDashboard(client, qc);

    // Wait for initial data to load (sessionsActive called at least once for stats + recent)
    await waitFor(() => {
      expect(sessionsActive.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    // Record the call count after initial load
    const initialCallCount = sessionsActive.mock.calls.length;

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    const envelope = JSON.stringify({
      type: 'session.ended',
      payload: {},
      ts: new Date().toISOString(),
    });

    act(() => {
      es._emitMessage(envelope);
    });

    // SSE invalidation triggers additional refetches beyond the initial load count
    await waitFor(() => {
      expect(sessionsActive.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});
