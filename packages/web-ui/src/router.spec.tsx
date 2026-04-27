/**
 * router.spec.tsx — Shallow tests that each route resolves to its placeholder page.
 *
 * Uses MemoryRouter to simulate navigation without a browser.
 * TokenGate is stubbed to skip auth (storeToken called before render).
 * ApiClientContext is provided with a mock client so DashboardPage (2.7.c) can render.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './pages/DashboardPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { KanbanPage } from './pages/KanbanPage.js';
import { SessionDetailPage } from './pages/SessionDetailPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { ApiClientContext } from './api/api-client-context.js';
import { TokenGateContext } from './auth/token-gate-context.js';
import { installMockEventSource } from './hooks/use-sse-events-fixtures.js';
import type { ApiClient } from './api/client.js';

// ── Mock ApiClient (never-resolve mocks — router test is shallow) ─────────────

const mockClient: ApiClient = {
  queue: {
    list: vi.fn().mockReturnValue(new Promise(() => undefined)),
    enqueue: vi.fn(),
  },
  sessions: {
    active: vi.fn().mockReturnValue(new Promise(() => undefined)),
    stop: vi.fn(),
  },
  projects: {
    list: vi.fn(),
  },
} as unknown as ApiClient;

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

let restoreEventSource: () => void;

// Clean up localStorage between tests
beforeEach(() => {
  localStorage.clear();
  restoreEventSource = installMockEventSource();
});
afterEach(() => {
  localStorage.clear();
  restoreEventSource();
  vi.clearAllMocks();
});

/** Render the route tree at a given initial path */
function renderAt(path: string) {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <ApiClientContext.Provider value={mockClient}>
        <TokenGateContext.Provider value={{ token: 'test-token', onUnauthorized: () => undefined }}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/kanban" element={<KanbanPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </MemoryRouter>
        </TokenGateContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>,
  );
}

describe('Router — each route resolves to the correct placeholder page', () => {
  it('/ → DashboardPage', () => {
    renderAt('/');
    expect(screen.getByTestId('page-dashboard')).toBeInTheDocument();
  });

  it('/activity → ActivityPage', () => {
    renderAt('/activity');
    expect(screen.getByTestId('page-activity')).toBeInTheDocument();
  });

  it('/kanban → KanbanPage', () => {
    renderAt('/kanban');
    expect(screen.getByTestId('page-kanban')).toBeInTheDocument();
  });

  it('/sessions/:id → SessionDetailPage with param', () => {
    renderAt('/sessions/abc-123');
    expect(screen.getByTestId('page-session-detail')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it('/settings → SettingsPage', () => {
    renderAt('/settings');
    expect(screen.getByTestId('page-settings')).toBeInTheDocument();
  });
});
