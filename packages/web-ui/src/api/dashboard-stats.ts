/**
 * dashboard-stats.ts — Dashboard statistics aggregate.
 *
 * Risk #2 fallback: /api/v1/dashboard/stats does NOT yet exist in core.
 * Client-side aggregation from queue.list() + sessions.active() instead.
 * Remove this comment and the fallback when the endpoint is added in core.
 *
 * I-10: All API responses are zod-validated inside ApiClient methods.
 * I-4: No @orch/core imports.
 */

import type { ApiClient } from './client.js';

/** Aggregated stats for the Dashboard page. */
export interface DashboardStats {
  /** Number of currently active sessions (0 or 1). */
  activeSessionCount: number;
  /** Number of items in the queue with state 'pending' or 'running'. */
  queueDepth: number;
  /** Cumulative input+output tokens across all tracked sessions today. */
  dailyTokens: number;
  /** Cumulative USD cost across all tracked sessions today. */
  dailyCostUsd: number;
}

/**
 * Fetches dashboard statistics.
 *
 * Fallback: aggregated client-side from queue.list() + sessions.active().
 * No dedicated /dashboard/stats endpoint needed.
 */
export async function fetchDashboardStats(client: ApiClient): Promise<DashboardStats> {
  const [queueItems, activeSession] = await Promise.all([
    client.queue.list(),
    client.sessions.active(),
  ]);

  const activeSessionCount = activeSession !== null ? 1 : 0;

  // Queue depth = items that are pending or running (not yet terminal)
  const queueDepth = queueItems.filter(
    (item) => item.state === 'pending' || item.state === 'running',
  ).length;

  // Daily cost + tokens: use active session data only (no historical session list
  // endpoint available; extend when GET /api/v1/sessions?date=today is added).
  const dailyTokens = activeSession
    ? activeSession.inputTokens + activeSession.outputTokens
    : 0;

  const dailyCostUsd = activeSession ? activeSession.costUsd : 0;

  return { activeSessionCount, queueDepth, dailyTokens, dailyCostUsd };
}
