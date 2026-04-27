/**
 * session-usage.spec.tsx — Tests for SessionDetailPage usage + trace link additions.
 *
 * Tests (8 total):
 *  1. renders usage chart when usage data has samples
 *  2. renders "No usage data yet" empty state when usage samples empty
 *  3. trace deep link href matches expected pattern when traceBackendUiUrl set
 *  4. renders trace ID as plain text (no link) when traceBackendUiUrl is empty
 *  5. renders usage loading skeleton while fetching
 *  6. shows "Usage data unavailable" on usage fetch error
 *  7. ApiClient sessions.usage() method sends correct path
 *  8. ApiClient config.get() method returns traceBackendUiUrl
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode, JSX } from 'react';
import { SessionDetailPage } from './SessionDetailPage.js';
import {
  installMockEventSource,
} from '../hooks/use-sse-events-fixtures.js';
import { ApiClientContext } from '../api/api-client-context.js';
import { TokenGateContext } from '../auth/token-gate-context.js';
import type { ApiClient, SessionUsageData, OrchdConfig } from '../api/client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_ID = 's-usage-1';
const TRACE_ID = 'abc123tracedef456';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

function makeSession(id: string = SESSION_ID, traceId: string | null = null) {
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
    traceId,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeEmptyUsage(): SessionUsageData {
  return {
    samples: [],
    totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 },
  };
}

function makeUsageWithSamples(): SessionUsageData {
  return {
    samples: [
      {
        ts: '2026-04-25T10:00:00.000Z',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        model: 'claude-sonnet-4-6',
        costUsd: 0.0105,
      },
    ],
    totals: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, costUsd: 0.0105 },
  };
}

function makeConfig(
  traceBackendUiUrl: string = '',
  traceBackend: 'otlp' | 'langfuse' | 'none' = 'otlp',
): OrchdConfig {
  return { traceBackendUiUrl, traceBackend };
}

function makeApiClientMock(overrides: {
  sessionsActive?: ReturnType<typeof vi.fn>;
  sessionsTail?: ReturnType<typeof vi.fn>;
  sessionsUsage?: ReturnType<typeof vi.fn>;
  configGet?: ReturnType<typeof vi.fn>;
} = {}): ApiClient {
  return {
    queue: { list: vi.fn().mockResolvedValue([]), enqueue: vi.fn() },
    sessions: {
      active: overrides.sessionsActive ?? vi.fn().mockResolvedValue(makeSession()),
      stop: vi.fn(),
      tail: overrides.sessionsTail ?? vi.fn().mockResolvedValue({ lines: [], truncated: false }),
      logs: vi.fn().mockResolvedValue(''),
      usage: overrides.sessionsUsage ?? vi.fn().mockResolvedValue(makeEmptyUsage()),
    },
    projects: { list: vi.fn() },
    config: {
      get: overrides.configGet ?? vi.fn().mockResolvedValue(makeConfig()),
    },
  } as unknown as ApiClient;
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function Wrapper({ client, qc, children }: { client: ApiClient; qc: QueryClient; children: ReactNode }): JSX.Element {
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

function renderDetail(client: ApiClient, qc: QueryClient, sessionId: string = SESSION_ID) {
  return render(
    <Wrapper client={client} qc={qc}>
      <MemoryRouter initialEntries={[`/sessions/${sessionId}`]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
}

// ── MockEventSource install ────────────────────────────────────────────────────

let restoreEventSource: () => void;
beforeEach(() => { restoreEventSource = installMockEventSource(); });
afterEach(() => { restoreEventSource(); vi.clearAllMocks(); });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionDetailPage — usage chart integration', () => {
  it('renders "No usage data yet" when usage samples are empty', async () => {
    const client = makeApiClientMock({
      sessionsUsage: vi.fn().mockResolvedValue(makeEmptyUsage()),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('usage-chart-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('usage-chart-empty')).toHaveTextContent('No usage data yet');
  });

  it('renders usage chart with samples when usage data present', async () => {
    const client = makeApiClientMock({
      sessionsUsage: vi.fn().mockResolvedValue(makeUsageWithSamples()),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('usage-chart-container')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cost-summary-card')).toBeInTheDocument();
  });

  it('renders usage loading skeleton while usage is fetching', () => {
    const client = makeApiClientMock({
      sessionsUsage: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    expect(screen.getByTestId('usage-loading-skeleton')).toBeInTheDocument();
  });

  it('shows "Usage data unavailable" on usage fetch error', async () => {
    const client = makeApiClientMock({
      sessionsUsage: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('usage-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('usage-error')).toHaveTextContent('Usage data unavailable');
  });
});

describe('SessionDetailPage — trace deep link', () => {
  it('renders trace deep link with correct href when traceBackendUiUrl is set', async () => {
    const backendUrl = 'http://grafana.local:3000';
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession(SESSION_ID, TRACE_ID)),
      configGet: vi.fn().mockResolvedValue(makeConfig(backendUrl)),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('trace-deep-link')).toBeInTheDocument();
    });
    const link = screen.getByTestId('trace-deep-link');
    expect(link).toHaveAttribute('href', `${backendUrl}/trace/${TRACE_ID}`);
    expect(link).toHaveTextContent(TRACE_ID);
  });

  it('renders trace ID as plain text when traceBackendUiUrl is empty', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession(SESSION_ID, TRACE_ID)),
      configGet: vi.fn().mockResolvedValue(makeConfig('')),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('trace-id-plain')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trace-id-plain')).toHaveTextContent(TRACE_ID);
    expect(screen.queryByTestId('trace-deep-link')).toBeNull();
  });

  it('hides trace section when session has no traceId', async () => {
    const client = makeApiClientMock({
      sessionsActive: vi.fn().mockResolvedValue(makeSession(SESSION_ID, null)),
      configGet: vi.fn().mockResolvedValue(makeConfig('http://grafana.local:3000')),
    });
    const qc = makeQueryClient();

    renderDetail(client, qc);

    await waitFor(() => {
      expect(screen.getByTestId('session-metadata-card')).toBeInTheDocument();
    });
    // Neither link variant should appear
    expect(screen.queryByTestId('trace-deep-link')).toBeNull();
    expect(screen.queryByTestId('trace-id-plain')).toBeNull();
  });
});
