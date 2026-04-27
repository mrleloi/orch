/**
 * kanban.spec.tsx — Tests for KanbanPage.
 *
 * ~13 tests:
 *  1.  KanbanPage renders 4 column headings exactly (Pending, Running, Completed, Failed)
 *  2.  Cards render projectId in the card
 *  3.  Cards render planPath basename (strips directories)
 *  4.  Cards render relative startedAt string
 *  5.  Stop button hidden when state !== 'running'
 *  6.  Stop button visible when state === 'running'
 *  7.  Click Stop → AlertDialog opens; sessions.stop NOT called (I-6 negative)
 *  8.  Click Stop → Cancel in dialog → sessions.stop NOT called (I-6 negative)
 *  9.  Click Stop → Confirm in dialog → sessions.stop called with (sessionId, true)
 *  10. SSE queue.state_changed invalidates ['queue'] (assert refetch)
 *  11. SSE session.ended invalidates ['queue'] (assert refetch)
 *  12. Empty column shows placeholder copy
 *  13. KanbanPage loading state shows skeleton
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

function makeQueueItem(
  id: string,
  state: QueueItemDto['state'],
  overrides: Partial<QueueItemDto> = {},
): QueueItemDto {
  return {
    id,
    projectId: `proj-${id}`,
    planPath: `/workspace/plans/${id}-task.md`,
    priority: 0,
    state,
    sessionId: null,
    enqueuedAt: '2026-01-01T00:00:00Z',
    startedAt: state === 'running' ? '2026-01-01T10:00:00Z' : null,
    endedAt: null,
    ...overrides,
  };
}

/**
 * Builds a minimal ApiClient mock. sessions.stop MUST be called with (id, true).
 */
function makeApiClientMock(overrides: {
  queueList?: ReturnType<typeof vi.fn>;
  sessionsStop?: ReturnType<typeof vi.fn>;
} = {}): ApiClient {
  return {
    queue: {
      list: overrides.queueList ?? vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
    },
    sessions: {
      active: vi.fn().mockResolvedValue(null),
      stop: overrides.sessionsStop ?? vi.fn().mockResolvedValue(undefined),
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

function renderKanban(client: ApiClient, qc: QueryClient, token?: string) {
  return render(
    <Wrapper client={client} qc={qc} token={token}>
      <KanbanPage />
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

describe('KanbanPage — 4 column headings', () => {
  it('renders all 4 column headings: Pending, Running, Completed, Failed', async () => {
    const client = makeApiClientMock();
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-heading-pending')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-heading-running')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-heading-completed')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-heading-failed')).toBeInTheDocument();
    });

    // Check heading text includes column name
    expect(screen.getByTestId('kanban-column-heading-pending')).toHaveTextContent('Pending');
    expect(screen.getByTestId('kanban-column-heading-running')).toHaveTextContent('Running');
    expect(screen.getByTestId('kanban-column-heading-completed')).toHaveTextContent('Completed');
    expect(screen.getByTestId('kanban-column-heading-failed')).toHaveTextContent('Failed');
  });
});

describe('KanbanPage — card content', () => {
  it('renders projectId in the card', async () => {
    const item = makeQueueItem('qi-1', 'pending', { projectId: 'my-project' });
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([item]),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('queue-card-project-qi-1')).toHaveTextContent('my-project');
    });
  });

  it('renders planPath basename (strips directory prefix)', async () => {
    const item = makeQueueItem('qi-2', 'pending', {
      planPath: '/deep/nested/dir/my-plan.md',
    });
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([item]),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      // Should show basename only, not full path
      expect(screen.getByTestId('queue-card-plan-qi-2')).toHaveTextContent('my-plan.md');
      expect(screen.getByTestId('queue-card-plan-qi-2')).not.toHaveTextContent('/deep/nested/dir/');
    });
  });

  it('renders relative startedAt time string', async () => {
    const item = makeQueueItem('qi-3', 'running', {
      startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    });
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([item]),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      const timeEl = screen.getByTestId('queue-card-time-qi-3');
      // Should contain a relative time string, not the raw ISO
      expect(timeEl).not.toHaveTextContent('2026-01-01T');
      // Should contain "min" or similar relative indicator
      expect(timeEl.textContent).toMatch(/min|ago|hr|day|sec/i);
    });
  });
});

describe('KanbanPage — Stop button visibility', () => {
  it('does NOT render Stop button when item.state !== "running"', async () => {
    const items: QueueItemDto[] = [
      makeQueueItem('p1', 'pending'),
      makeQueueItem('c1', 'completed'),
      makeQueueItem('f1', 'failed'),
    ];
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue(items),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('queue-card-p1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('queue-card-stop-p1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('queue-card-stop-c1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('queue-card-stop-f1')).not.toBeInTheDocument();
  });

  it('renders Stop button ONLY for item.state === "running"', async () => {
    const items: QueueItemDto[] = [
      makeQueueItem('r1', 'running'),
      makeQueueItem('p1', 'pending'),
    ];
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue(items),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('queue-card-stop-r1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('queue-card-stop-p1')).not.toBeInTheDocument();
  });
});

describe('KanbanPage — I-6 Stop confirmation flow', () => {
  it('clicking Stop opens AlertDialog but does NOT call sessions.stop', async () => {
    const user = userEvent.setup();
    const sessionsStop = vi.fn().mockResolvedValue(undefined);
    const item = makeQueueItem('r1', 'running');
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([item]),
      sessionsStop,
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('queue-card-stop-r1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('queue-card-stop-r1'));

    // Dialog should be open
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    // sessions.stop must NOT have been called (I-6 negative)
    expect(sessionsStop).not.toHaveBeenCalled();
  });

  it('clicking Stop then Cancel in dialog does NOT call sessions.stop (I-6 negative)', async () => {
    const user = userEvent.setup();
    const sessionsStop = vi.fn().mockResolvedValue(undefined);
    const item = makeQueueItem('r2', 'running');
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([item]),
      sessionsStop,
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('queue-card-stop-r2')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('queue-card-stop-r2'));

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    // Click Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // sessions.stop must NOT have been called (I-6 negative)
    expect(sessionsStop).not.toHaveBeenCalled();
  });

  it('clicking Stop then Confirm calls sessions.stop(sessionId, true) exactly once (I-6 positive)', async () => {
    const user = userEvent.setup();
    const sessionsStop = vi.fn().mockResolvedValue(undefined);
    const item = makeQueueItem('r3', 'running');
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([item]),
      sessionsStop,
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('queue-card-stop-r3')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('queue-card-stop-r3'));

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    // Click Confirm Stop
    await user.click(screen.getByRole('button', { name: 'Confirm Stop' }));

    // sessions.stop must have been called with (item.id, true)
    expect(sessionsStop).toHaveBeenCalledTimes(1);
    expect(sessionsStop).toHaveBeenCalledWith('r3', true);
  });
});

describe('KanbanPage — SSE URL token', () => {
  it('SSE URL contains ?token= from useTokenGate', () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc, 'a b&c');

    const es = getLastMockEventSource();
    expect(es.url).toMatch(/\?token=a%20b%26c$/);
  });
});

describe('KanbanPage — SSE cache invalidation', () => {
  it('queue.state_changed SSE event invalidates ["queue"] and triggers refetch', async () => {
    const queueList = vi.fn().mockResolvedValue([]);
    const client = makeApiClientMock({ queueList });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    // Wait for initial data load
    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    const initialCallCount = queueList.mock.calls.length;

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    const envelope = JSON.stringify({
      type: 'queue.state_changed',
      payload: {},
      ts: new Date().toISOString(),
    });

    act(() => {
      es._emitMessage(envelope);
    });

    // ['queue'] should be invalidated triggering a new refetch
    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('session.ended SSE event invalidates ["queue"] and triggers refetch', async () => {
    const queueList = vi.fn().mockResolvedValue([]);
    const client = makeApiClientMock({ queueList });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    const initialCallCount = queueList.mock.calls.length;

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

    await waitFor(() => {
      expect(queueList.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});

describe('KanbanPage — empty column placeholder', () => {
  it('shows placeholder copy in each empty column when queue is empty', async () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockResolvedValue([]),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-empty-pending')).toBeInTheDocument();
    });

    expect(screen.getByTestId('kanban-column-empty-pending')).toHaveTextContent('No pending items');
  });
});

describe('KanbanPage — loading state', () => {
  it('shows loading skeleton while queue query is in-flight', () => {
    const client = makeApiClientMock({
      queueList: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    expect(screen.getByTestId('kanban-loading')).toBeInTheDocument();
  });
});

describe('KanbanPage — error state', () => {
  it('shows error state with Retry button when queue query fails', async () => {
    const queueList = vi.fn().mockRejectedValue(new Error('boom'));
    const client = makeApiClientMock({ queueList });
    const qc = makeQueryClient();

    renderKanban(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
