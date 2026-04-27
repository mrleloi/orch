/**
 * App.tsx — Root application component with React Router + TokenGate + TanStack Query.
 *
 * Routes:
 *   /              → DashboardPage
 *   /activity      → ActivityPage
 *   /kanban        → KanbanPage
 *   /sessions/:id  → SessionDetailPage
 *   /settings      → SettingsPage
 *
 * I-4: no @orch/core imports.
 * I-7: dev server binds 127.0.0.1:4142 (see vite.config.ts).
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TokenGate } from './auth/token-gate.js';
import { ApiClientProvider } from './api/api-client-context.js';
import { queryClient } from './lib/query-client.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { KanbanPage } from './pages/KanbanPage.js';
import { SessionDetailPage } from './pages/SessionDetailPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { NavShell } from './components/nav-shell.js';

export default function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <TokenGate>
        <ApiClientProvider>
          <BrowserRouter>
            <NavShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/kanban" element={<KanbanPage />} />
                <Route path="/sessions/:id" element={<SessionDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </NavShell>
          </BrowserRouter>
        </ApiClientProvider>
      </TokenGate>
    </QueryClientProvider>
  );
}
