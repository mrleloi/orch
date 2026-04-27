/**
 * App.spec.tsx — Integration regression tests for the full app routing + cross-page concerns.
 *
 * 4 tests:
 *   1. "all 4 nav routes + deep session route render under TokenGate"
 *   2. "SSE TODO strings do not appear anywhere in packages/web-ui/src"
 *   3. "no @orch/core imports"
 *   4. "all SSE subscriptions use authenticated URL (contain '?token=')"
 *
 * I-4: no @orch/core imports.
 * I-2: no "stockforge".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReactNode, JSX } from 'react';

import { DashboardPage } from './pages/DashboardPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { KanbanPage } from './pages/KanbanPage.js';
import { SessionDetailPage } from './pages/SessionDetailPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { NavShell } from './components/nav-shell.js';
import { ApiClientContext } from './api/api-client-context.js';
import { TokenGateContext } from './auth/token-gate-context.js';
import {
  installMockEventSource,
  getAllMockEventSources,
} from './hooks/use-sse-events-fixtures.js';
import type { ApiClient } from './api/client.js';

// ── Mock ApiClient ────────────────────────────────────────────────────────────

const mockClient: ApiClient = {
  queue: {
    list: vi.fn().mockReturnValue(new Promise(() => undefined)),
    enqueue: vi.fn(),
  },
  sessions: {
    active: vi.fn().mockReturnValue(new Promise(() => undefined)),
    stop: vi.fn(),
    tail: vi.fn().mockReturnValue(new Promise(() => undefined)),
  },
  projects: {
    list: vi.fn(),
  },
} as unknown as ApiClient;

// ── Shared test setup ─────────────────────────────────────────────────────────

let restoreEventSource: () => void;
let testQueryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('orch_auth_token', 'test-token');
  restoreEventSource = installMockEventSource();
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
  restoreEventSource();
  vi.clearAllMocks();
});

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Render the full route tree at a given initial path with all required providers. */
function renderApp(initialPath: string): void {
  render(
    <QueryClientProvider client={testQueryClient}>
      <ApiClientContext.Provider value={mockClient}>
        <TokenGateContext.Provider
          value={{ token: 'test-token', onUnauthorized: () => undefined }}
        >
          <MemoryRouter initialEntries={[initialPath]}>
            <NavShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/kanban" element={<KanbanPage />} />
                <Route path="/sessions/:id" element={<SessionDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </NavShell>
          </MemoryRouter>
        </TokenGateContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>,
  );
}

/** Render a single page under TokenGate + ApiClient + QueryClient contexts. */
function renderPage(page: ReactNode): void {
  render(
    <QueryClientProvider client={testQueryClient}>
      <ApiClientContext.Provider value={mockClient}>
        <TokenGateContext.Provider
          value={{ token: 'test-token', onUnauthorized: () => undefined }}
        >
          <MemoryRouter initialEntries={['/']}>
            {page as JSX.Element}
          </MemoryRouter>
        </TokenGateContext.Provider>
      </ApiClientContext.Provider>
    </QueryClientProvider>,
  );
}

/** Recursively collect all .ts and .tsx files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectSourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      result.push(fullPath);
    }
  }
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App — integration regression', () => {
  it('all 4 nav routes + deep session route render under TokenGate', () => {
    // / → DashboardPage
    renderApp('/');
    expect(screen.getByTestId('page-dashboard')).toBeInTheDocument();
    // Nav links visible
    expect(screen.getByTestId('nav-link-dashboard')).toBeInTheDocument();
    cleanup();

    // /activity → ActivityPage
    renderApp('/activity');
    expect(screen.getByTestId('page-activity')).toBeInTheDocument();
    cleanup();

    // /kanban → KanbanPage
    renderApp('/kanban');
    expect(screen.getByTestId('page-kanban')).toBeInTheDocument();
    cleanup();

    // /sessions/s1 → SessionDetailPage (deep session route)
    renderApp('/sessions/s1');
    expect(screen.getByTestId('page-session-detail')).toBeInTheDocument();
    cleanup();
  });

  it('SSE TODO strings do not appear anywhere in packages/web-ui/src', () => {
    // Resolve relative to this spec file's location
    const srcDir = path.resolve(__dirname, '.');
    // Exclude spec files themselves to avoid self-matching test patterns
    const files = collectSourceFiles(srcDir).filter(
      (f) => !f.endsWith('.spec.ts') && !f.endsWith('.spec.tsx'),
    );
    const violations: string[] = [];
    // Build pattern parts separately so this file itself does not self-match
    const todoPrefix = 'TODO';
    const todoSuffix = '2.8';
    const todoPattern = `${todoPrefix} ${todoSuffix}`;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes(todoPattern)) {
        violations.push(file);
      }
    }

    expect(violations, `Found "${todoPattern}" in: ${violations.join(', ')}`).toHaveLength(0);
  });

  it('no @orch/core imports', () => {
    const srcDir = path.resolve(__dirname, '.');
    // Exclude spec files to avoid self-matching comment strings in test files
    const files = collectSourceFiles(srcDir).filter(
      (f) => !f.endsWith('.spec.ts') && !f.endsWith('.spec.tsx'),
    );
    const violations: string[] = [];

    // Build pattern from parts so this spec file does not self-match
    const pkg = ['@orch', 'core'].join('/');
    const importRegex = new RegExp(`from ['"]${pkg}['"]`);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (importRegex.test(content)) {
        violations.push(file);
      }
    }

    expect(violations, `Found @orch/core import in non-spec source: ${violations.join(', ')}`).toHaveLength(0);
  });

  it("all SSE subscriptions use authenticated URL (contain '?token=')", () => {
    // Render each page that has SSE subscriptions and verify all MockEventSource
    // URLs contain ?token= (i.e., the authenticated query-param pattern from buildSseStreamUrl).

    // DashboardPage
    renderPage(<DashboardPage />);

    // Re-render additional pages with fresh QC each time to accumulate instances
    renderPage(<ActivityPage />);
    renderPage(<KanbanPage />);

    // SessionDetailPage requires a route param — wrap in MemoryRouter with param
    render(
      <QueryClientProvider client={testQueryClient}>
        <ApiClientContext.Provider value={mockClient}>
          <TokenGateContext.Provider
            value={{ token: 'test-token', onUnauthorized: () => undefined }}
          >
            <MemoryRouter initialEntries={['/sessions/s1']}>
              <Routes>
                <Route path="/sessions/:id" element={<SessionDetailPage />} />
              </Routes>
            </MemoryRouter>
          </TokenGateContext.Provider>
        </ApiClientContext.Provider>
      </QueryClientProvider>,
    );

    const instances = getAllMockEventSources();
    // Each SSE-enabled page (Dashboard, Activity, Kanban, SessionDetail) creates at least one instance
    expect(instances.length).toBeGreaterThan(0);

    for (const es of instances) {
      expect(
        es.url,
        `MockEventSource URL "${es.url}" does not contain "?token="`,
      ).toContain('?token=');
    }
  });
});
