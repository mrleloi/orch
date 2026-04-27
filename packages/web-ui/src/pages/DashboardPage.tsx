/**
 * DashboardPage — real implementation for route `/`.
 *
 * Part B signature (verbatim): export function DashboardPage(): JSX.Element
 *
 * Features:
 *   - 4 stat cards: Active Session, Queue Depth, Daily Tokens, Daily Cost
 *   - Recent sessions list (up to 10, newest-first)
 *   - SSE-driven TanStack Query cache invalidation
 *
 * SSE auth: URL includes ?token= query-param fallback accepted by BearerAuthGuard.
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 * I-10: All responses zod-validated inside ApiClient + recent-sessions.ts.
 */

import { useCallback, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ListOrdered, Coins, DollarSign } from 'lucide-react';
import type { SseEnvelope } from '@orch/shared';
import { useApiClient } from '../api/api-client-context.js';
import { fetchDashboardStats } from '../api/dashboard-stats.js';
import { fetchRecentSessions } from '../api/recent-sessions.js';
import { useSseEvents } from '../hooks/use-sse-events.js';
import { useTokenGate } from '../auth/token-gate-context.js';
import { buildSseStreamUrl } from '../lib/sse-url.js';
import { StatCard } from '../components/stat-card.js';
import { RecentSessionsList } from '../components/recent-sessions-list.js';

/**
 * DashboardPage — renders 4 stat cards and a recent-sessions list.
 * Subscribes to SSE events to invalidate stale query caches automatically.
 */
export function DashboardPage(): JSX.Element {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { token } = useTokenGate();

  // ── Queries ────────────────────────────────────────────────────────────────

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetchDashboardStats(client),
  });

  const recentQuery = useQuery({
    queryKey: ['sessions', 'recent'],
    queryFn: () => fetchRecentSessions(client),
  });

  // ── SSE invalidation ───────────────────────────────────────────────────────

  const handleSseEvent = useCallback(
    (envelope: SseEnvelope) => {
      switch (envelope.type) {
        case 'queue.state_changed':
        case 'queue.enqueued':
          void queryClient.invalidateQueries({ queryKey: ['queue'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
        case 'session.started':
          void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
          void queryClient.invalidateQueries({ queryKey: ['sessions', 'recent'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
        case 'session.ended':
          void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
          void queryClient.invalidateQueries({ queryKey: ['sessions', 'recent'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          break;
        default:
          break;
      }
    },
    [queryClient],
  );

  useSseEvents({
    url: buildSseStreamUrl(token),
    filter: ['queue.state_changed', 'queue.enqueued', 'session.started', 'session.ended'],
    onEvent: handleSseEvent,
  });

  // ── Derived values ─────────────────────────────────────────────────────────

  const stats = statsQuery.data;

  const activeValue = stats != null ? String(stats.activeSessionCount) : '—';
  const queueValue = stats != null ? String(stats.queueDepth) : '—';
  const tokensValue = stats != null ? stats.dailyTokens.toLocaleString() : '—';
  const costValue =
    stats != null
      ? `$${stats.dailyCostUsd.toFixed(2)}`
      : '—';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main data-testid="page-dashboard" className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* 4 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          testId="stat-active"
          label="Active Session"
          value={activeValue}
          icon={<Activity size={16} />}
          isLoading={statsQuery.isLoading}
          isError={statsQuery.isError}
          onRetry={() => void statsQuery.refetch()}
        />

        <StatCard
          testId="stat-queue"
          label="Queue Depth"
          value={queueValue}
          icon={<ListOrdered size={16} />}
          isLoading={statsQuery.isLoading}
          isError={statsQuery.isError}
          onRetry={() => void statsQuery.refetch()}
        />

        <StatCard
          testId="stat-tokens"
          label="Daily Tokens"
          value={tokensValue}
          icon={<Coins size={16} />}
          isLoading={statsQuery.isLoading}
          isError={statsQuery.isError}
          onRetry={() => void statsQuery.refetch()}
        />

        <StatCard
          testId="stat-cost"
          label="Daily Cost"
          value={costValue}
          icon={<DollarSign size={16} />}
          isLoading={statsQuery.isLoading}
          isError={statsQuery.isError}
          onRetry={() => void statsQuery.refetch()}
        />
      </div>

      {/* Recent sessions */}
      <RecentSessionsList
        sessions={recentQuery.data ?? []}
        isLoading={recentQuery.isLoading}
        isError={recentQuery.isError}
      />
    </main>
  );
}
