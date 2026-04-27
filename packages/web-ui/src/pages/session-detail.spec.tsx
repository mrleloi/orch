/**
 * session-detail.spec.tsx — Tests for SessionDetailPage.
 *
 * 12 original tests:
 *  1.  renders metadata when session is active
 *  2.  renders 'not active' banner when session missing from active list
 *  3.  renders tail lines in <pre>
 *  4.  renders truncated banner when tail.truncated=true
 *  5.  clicking Load full logs triggers logs query
 *  6.  logs render in <pre>
 *  7.  SSE event matching sessionId triggers tail refetch
 *  8.  SSE event with different sessionId does NOT trigger refetch
 *  9.  SSE URL includes ?token=
 * 10.  tail loading state shows skeleton
 * 11.  tail error shows fallback with 'Load full logs' button
 * 12.  back-to-activity link present
 *
 * Task 3.9 additions (3 tests):
 * 13.  trace deep link renders with data-trace-backend="otlp" for OTLP backend
 * 14.  trace deep link renders with data-trace-backend="langfuse" for Langfuse backend
 * 15.  trace ID renders as plain text (no link) when backend is 'none'
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode, JSX } from 'react';
import { SessionDetailPage } from './SessionDetailPage.js';
import {
  installMockEventSource,
  getLastMockEventSource,
} from '../hooks/use-sse-events-fixtures.js';
import { ApiClientContext } from '../api/api-client-context.js';
import { TokenGateContext } from '../auth/token-gate-context.js';
import type { ApiClient } from '../api/client.js';
import { ApiClientError } from '../api/client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_ID = 's1';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

function makeSession(id: string = SESSION_ID) {
  return {
    id,
    projectId: 'proj-a',
    planPath: '/workspace/plans/task.md',
    state: 'active' as const,
    claudeSessionId: null,
    startedAt: '2026-01-01T10:00:00Z',
    endedAt: null,
    inputTokens: 100,
    outputTokens: 200,
    costUsd: 1.23,
    traceId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

type OrchdConfigOverride = {
  traceBackendUiUrl?: string;
  traceBackend?: 'otlp' | 'langfuse' | 'none';
};

function makeApiClientMock(overrides: {
  sessionsActive?: ReturnType<typeof vi.fn>;
  sessionsTail?: ReturnType<typeof vi.fn>;
  sessionsLogs?: ReturnType<typeof vi.fn>;
  configGet?: ReturnType<typeof vi.fn>;
  config?: OrchdConfigOverride;
} = {}): ApiClient {
  const defaultConfig = {
    traceBackendUiUrl: overrides.config?.traceBackendUiUrl ?? '',
    traceBackend: overrides.config?.traceBackend ?? 'otlp',
  };
  return {
    queue: {
      list: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
    },
    sessions: {
      active: overrides.sessionsActive ?? vi.fn().mockResolvedValue(makeSession()),
      stop: vi.fn(),
      tail: overrides.sessionsTail ?? vi.fn().mockResolvedValue({ lines: [], truncated: false }),
      logs: overrides.sessionsLogs ?? vi.fn().mockResolvedValue(''),
      usage: vi.fn().mockResolvedValue({ samples: [], totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 } }),
    },
    projects: {
      list: vi.fn(),
    },
    config: {
      get: overrides.configGet ?? vi.fn().mockResolvedValue(defaultConfig),
    },
  } as unknown as ApiClient;
}

// ── Render helpers ─────────────────────────────────────────────────────────────

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

function renderDetail(
  client: ApiClient,
  qc: QueryClient,
  sessionId: string = SESSION_ID,
  token: string = 'test-token',
) {
  return render(
    <Wrapper client={client} qc={qc} token={token}>
      <MemoryRouter initialEntries={[`/sessions/${sessionId}`]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
}

// ── SSE helpers ────────────────────────────────────────────────────────────────

function makeSessionEnvelopeJson(
  sessionId: string,
  ts: string = new Date().toISOString(),
): string {
  return JSON.stringify({
    type: 'session.state_changed',
    payload: { sessionId },
    ts,
  });
}

// ── MockEventSource install / restore ──────────────────────────────────────────

let restoreEventSource: () => void;

beforeEach(() => {
  restoreEventSource = installMockEventSource();
});

afterEach(() => {
  restoreEventSource();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionDetailPage — metadata', () => {
  it('renders metadata when session is active', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession(SESSION_ID)),
      sessionsTail: vi.fn().mockResolvedValue({ lines: [], truncated: false }),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('session-metadata-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-state-badge')).toHaveTextContent('active');
    expect(screen.queryByTestId('session-not-active-banner')).toBeNull();
  });

  it("renders 'not active' banner when session missing from active list", async () => {
    // active() returns a session with a DIFFERENT id
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession('other-session-id')),
      sessionsTail: vi.fn().mockResolvedValue({ lines: [], truncated: false }),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('session-not-active-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-not-active-banner')).toHaveTextContent(
      `Session ${SESSION_ID} not active`,
    );
    expect(screen.queryByTestId('session-metadata-card')).toBeNull();
  });
});

describe('SessionDetailPage — tail panel', () => {
  it('renders tail lines in <pre>', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession()),
      sessionsTail: vi.fn().mockResolvedValue({
        lines: ['line A', 'line B', 'line C'],
        truncated: false,
      }),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('tail-pre')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tail-pre')).toHaveTextContent('line A');
    expect(screen.getByTestId('tail-pre')).toHaveTextContent('line B');
    expect(screen.getByTestId('tail-pre')).toHaveTextContent('line C');
  });

  it('renders truncated banner when tail.truncated=true', async () => {
    const client = makeApiClientMock({
      sessionsTail: vi.fn().mockResolvedValue({
        lines: ['only line'],
        truncated: true,
      }),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('tail-truncated-banner')).toBeInTheDocument();
    });
  });

  it('tail loading state shows skeleton', () => {
    // Use a never-resolving promise to keep the query in loading state
    const client = makeApiClientMock({
      sessionsTail: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    expect(screen.getByTestId('tail-loading-skeleton')).toBeInTheDocument();
  });

  it('tail error shows fallback with Load full logs button', async () => {
    const client = makeApiClientMock({
      sessionsTail: vi.fn().mockRejectedValue(new ApiClientError(404, 'not found')),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('tail-error-fallback')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tail-error-fallback')).toHaveTextContent(
      'Tail unavailable; try full logs.',
    );
    expect(screen.getByTestId('load-full-logs-button')).toBeInTheDocument();
  });
});

describe('SessionDetailPage — full logs', () => {
  it('clicking Load full logs triggers logs query', async () => {
    const user = userEvent.setup();
    const logsFn = vi.fn().mockResolvedValue('full log content here');
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession()),
      sessionsTail: vi.fn().mockResolvedValue({ lines: ['some line'], truncated: false }),
      sessionsLogs: logsFn,
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    // Wait for tail to finish loading first
    await waitFor(() => {
      expect(screen.getByTestId('tail-pre')).toBeInTheDocument();
    });

    // The "Load full logs" button outside the error fallback
    const btn = screen.getByTestId('load-full-logs-button');
    await user.click(btn);

    await waitFor(() => {
      expect(logsFn).toHaveBeenCalledOnce();
    });
  });

  it('logs render in <pre>', async () => {
    const user = userEvent.setup();
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession()),
      sessionsTail: vi.fn().mockResolvedValue({ lines: ['line1'], truncated: false }),
      sessionsLogs: vi.fn().mockResolvedValue('full log line 1\nfull log line 2\n'),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => screen.getByTestId('tail-pre'));

    const btn = screen.getByTestId('load-full-logs-button');
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByTestId('logs-pre')).toBeInTheDocument();
    });
    expect(screen.getByTestId('logs-pre')).toHaveTextContent('full log line 1');
  });
});

describe('SessionDetailPage — SSE per-session filter', () => {
  it('SSE event matching sessionId triggers tail refetch', async () => {
    const tailFn = vi.fn().mockResolvedValue({ lines: [], truncated: false });
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession()),
      sessionsTail: tailFn,
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    // Wait for initial load
    await waitFor(() => {
      expect(tailFn).toHaveBeenCalledTimes(1);
    });

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    act(() => {
      es._emitMessage(makeSessionEnvelopeJson(SESSION_ID));
    });

    await waitFor(() => {
      // Initial call + at least one refetch
      expect(tailFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('SSE event with different sessionId does NOT trigger refetch', async () => {
    const tailFn = vi.fn().mockResolvedValue({ lines: [], truncated: false });
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession()),
      sessionsTail: tailFn,
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    // Wait for initial tail query
    await waitFor(() => {
      expect(tailFn).toHaveBeenCalledTimes(1);
    });

    const callCountBefore = tailFn.mock.calls.length;

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    act(() => {
      // Emit event for a DIFFERENT session
      es._emitMessage(makeSessionEnvelopeJson('completely-different-session'));
    });

    // Negative-assertion via waitFor: retry up to 200ms — if a refetch sneaks
    // in during that window the call count would tick up and the inner
    // expectation would pass on a later attempt, failing the test reliably.
    // Using waitFor over real-timer setTimeout(50) eliminates CI flake risk.
    await waitFor(
      () => {
        expect(tailFn.mock.calls.length).toBe(callCountBefore);
      },
      { timeout: 200, interval: 25 },
    );
  });

  it('SSE URL includes ?token=', () => {
    const client = makeApiClientMock({
      sessionsTail: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc, SESSION_ID, 'my-token');

    const es = getLastMockEventSource();
    expect(es.url).toContain('?token=my-token');
  });
});

describe('SessionDetailPage — navigation', () => {
  it('back-to-activity link present', async () => {
    const client = makeApiClientMock({
      sessionsTail: vi.fn().mockResolvedValue({ lines: [], truncated: false }),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    const link = screen.getByTestId('back-to-activity');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/activity');
  });
});

// ── Task 3.9 — trace URL branching by backend type ────────────────────────────

describe('SessionDetailPage — trace URL branching (Task 3.9)', () => {
  function makeSessionWithTrace(id: string = SESSION_ID) {
    return { ...makeSession(id), traceId: 'abc123traceId' };
  }

  it('renders trace deep link with data-trace-backend="otlp" for OTLP backend', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSessionWithTrace()),
      sessionsTail: vi.fn().mockResolvedValue({ lines: [], truncated: false }),
      config: {
        traceBackendUiUrl: 'http://grafana.local:3000',
        traceBackend: 'otlp',
      },
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('trace-deep-link')).toBeInTheDocument();
    });

    const link = screen.getByTestId('trace-deep-link');
    expect(link).toHaveAttribute('data-trace-backend', 'otlp');
    expect(link).toHaveAttribute('href', 'http://grafana.local:3000/trace/abc123traceId');
  });

  it('renders trace deep link with data-trace-backend="langfuse" for Langfuse backend', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSessionWithTrace()),
      sessionsTail: vi.fn().mockResolvedValue({ lines: [], truncated: false }),
      config: {
        traceBackendUiUrl: 'https://cloud.langfuse.com',
        traceBackend: 'langfuse',
      },
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('trace-deep-link')).toBeInTheDocument();
    });

    const link = screen.getByTestId('trace-deep-link');
    expect(link).toHaveAttribute('data-trace-backend', 'langfuse');
    expect(link).toHaveAttribute('href', 'https://cloud.langfuse.com/trace/abc123traceId');
  });

  it('renders trace ID as plain text with no link when backend is "none"', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSessionWithTrace()),
      sessionsTail: vi.fn().mockResolvedValue({ lines: [], truncated: false }),
      config: {
        traceBackendUiUrl: 'http://grafana.local:3000',
        traceBackend: 'none',
      },
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('trace-id-plain')).toBeInTheDocument();
    });

    expect(screen.getByTestId('trace-id-plain')).toHaveTextContent('abc123traceId');
    expect(screen.queryByTestId('trace-deep-link')).toBeNull();
  });
});
