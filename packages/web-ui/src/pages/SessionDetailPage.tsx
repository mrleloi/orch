/**
 * SessionDetailPage — Detail view for a single session at route `/sessions/:id`.
 *
 * Part B signature (verbatim): export function SessionDetailPage(): JSX.Element
 *
 * Sections:
 *   1. Metadata card — sourced from sessions.active(), filtered by id.
 *      Trace ID link is a real deep link using ORCH_TRACE_BACKEND_UI_URL from /api/v1/config.
 *   2. Tail panel — TanStack Query calling sessions.tail(id, 50). Refetch button.
 *      Error fallback: "Tail unavailable; try full logs." with "Load full logs" button.
 *   3. Token/cost chart — fetched from /api/v1/sessions/:id/usage. Charter F6, O3.
 *   4. Full logs (lazy) — triggered by "Load full logs" button.
 *
 * Per-session SSE filter: subscribes to all events, filters inline for
 * type.startsWith('session.') AND payload.sessionId === id → calls tailQuery.refetch().
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 * I-6: NO Stop button on this page — stop lives on Kanban only.
 * I-10: All responses zod-validated inside ApiClient.
 *
 * Task 3.8: Adds UsageChart + CostSummaryCard + trace deep link.
 * Task 3.9: Backend-aware trace URL branching (langfuse vs OTLP) lands there.
 */

import { useState, useCallback, type JSX } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SseEnvelope } from '@orch/shared';
import { useApiClient } from '../api/api-client-context.js';
import { useSseEvents } from '../hooks/use-sse-events.js';
import { useTokenGate } from '../auth/token-gate-context.js';
import { buildSseStreamUrl } from '../lib/sse-url.js';
import { UsageChart } from '../components/UsageChart.js';

export function SessionDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();

  if (id === undefined) {
    return <main data-testid="page-session-detail"><p>No session ID</p></main>;
  }

  return <SessionDetailContent id={id} />;
}

// ── Inner component (id is guaranteed defined) ─────────────────────────────

interface SessionDetailContentProps {
  id: string;
}

function SessionDetailContent({ id }: SessionDetailContentProps): JSX.Element {
  const client = useApiClient();
  const { token } = useTokenGate();

  const [showFullLogs, setShowFullLogs] = useState(false);

  // ── Section 1: Metadata — sourced from sessions.active() filtered by id ──

  const metaQuery = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => client.sessions.active(),
  });

  const session = metaQuery.data?.id === id ? metaQuery.data : null;
  const sessionNotActive = !metaQuery.isLoading && session === null;

  // ── Config: trace backend UI URL (for trace deep link) ────────────────────
  // Fetched once on mount via /api/v1/config. Error is non-fatal — falls back
  // to empty string (trace link hidden). Task 3.9 adds backend-type branching.

  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => client.config.get(),
    staleTime: 300_000, // 5 minutes — config rarely changes
    retry: false,
  });

  const traceBackendUiUrl = configQuery.data?.traceBackendUiUrl ?? '';
  const traceBackend = configQuery.data?.traceBackend ?? 'otlp';

  // ── Section 2: Tail panel ─────────────────────────────────────────────────

  const tailQuery = useQuery({
    queryKey: ['sessions', 'tail', id],
    queryFn: () => client.sessions.tail(id, 50),
    retry: false,
  });

  // ── Section 3: Token/cost usage chart (charter F6, O3) ───────────────────

  const usageQuery = useQuery({
    queryKey: ['sessions', 'usage', id],
    queryFn: () => client.sessions.usage(id),
    retry: false,
    // Poll every 10s while the session is active so the chart updates live.
    refetchInterval: session !== null ? 10_000 : false,
  });

  // ── Section 4: Full logs (lazy) ───────────────────────────────────────────

  const logsQuery = useQuery({
    queryKey: ['sessions', 'logs', id],
    queryFn: () => client.sessions.logs(id),
    enabled: showFullLogs,
    retry: false,
  });

  // ── Per-session SSE filter ────────────────────────────────────────────────
  // No hook-level filter — inline payload filter for session.* + sessionId match.

  const handleSseEvent = useCallback(
    (envelope: SseEnvelope): void => {
      // R7: type-filter to session.* first, then sessionId match
      if (!envelope.type.startsWith('session.')) {
        return;
      }
      const payload = envelope.payload as Record<string, unknown> | null | undefined;
      if (payload?.sessionId !== id) {
        return;
      }
      void tailQuery.refetch();
      void metaQuery.refetch();
    },
    [id, tailQuery, metaQuery],
  );

  useSseEvents({
    url: buildSseStreamUrl(token),
    // No filter arg — inline payload filtering handles session ID match (R7)
    onEvent: handleSseEvent,
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main data-testid="page-session-detail" className="p-6 space-y-6">
      {/* Back link */}
      <Link
        to="/activity"
        data-testid="back-to-activity"
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; Back to Activity
      </Link>

      <h1 className="text-2xl font-bold">Session {id}</h1>

      {/* Section 1: Metadata card */}
      {sessionNotActive ? (
        <div data-testid="session-not-active-banner" className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm">
          Session {id} not active
        </div>
      ) : session !== null ? (
        <div data-testid="session-metadata-card" className="rounded border p-4 space-y-2 text-sm">
          <div><span className="font-semibold">ID:</span> {session.id}</div>
          <div>
            <span className="font-semibold">State:</span>{' '}
            <span data-testid="session-state-badge" className="rounded-full px-2 py-0.5 bg-green-100 text-green-800 text-xs">
              {session.state}
            </span>
          </div>
          <div><span className="font-semibold">Project:</span> {session.projectId}</div>
          <div><span className="font-semibold">Plan:</span> {session.planPath}</div>
          {session.startedAt !== null && (
            <div>
              <span className="font-semibold">Started:</span>{' '}
              {new Date(session.startedAt).toLocaleString()}
            </div>
          )}
          {session.traceId !== null && (
            <div>
              <span className="font-semibold">Trace:</span>{' '}
              {traceBackend === 'none' || !traceBackendUiUrl ? (
                /* none backend or no UI URL: plain text, no link */
                <span data-testid="trace-id-plain" className="font-mono text-xs text-gray-600">
                  {session.traceId}
                </span>
              ) : traceBackend === 'langfuse' ? (
                /* Langfuse: /trace/<traceId> path (same as OTLP pattern; both use /trace/:id) */
                <a
                  data-testid="trace-deep-link"
                  data-trace-backend="langfuse"
                  href={`${traceBackendUiUrl}/trace/${session.traceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline text-xs"
                >
                  {session.traceId}
                </a>
              ) : (
                /* otlp (default): Grafana Tempo /trace/<traceId> path */
                <a
                  data-testid="trace-deep-link"
                  data-trace-backend="otlp"
                  href={`${traceBackendUiUrl}/trace/${session.traceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline text-xs"
                >
                  {session.traceId}
                </a>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Section 3: Token/cost usage chart (charter F6, O3) */}
      <section data-testid="usage-section">
        <h2 className="text-lg font-semibold mb-2">Token & Cost Usage</h2>
        {usageQuery.isLoading && (
          <div data-testid="usage-loading-skeleton" className="animate-pulse h-32 bg-gray-100 rounded" />
        )}
        {usageQuery.isError && (
          <p data-testid="usage-error" className="text-sm text-gray-500">Usage data unavailable.</p>
        )}
        {usageQuery.isSuccess && (
          <UsageChart data={usageQuery.data} />
        )}
      </section>

      {/* Section 2: Tail panel */}
      <section data-testid="tail-panel">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold">Tail (last 50 lines)</h2>
          <button
            data-testid="tail-refetch-button"
            onClick={() => void tailQuery.refetch()}
            className="text-sm text-blue-600 hover:underline"
          >
            Refetch
          </button>
        </div>

        {tailQuery.isLoading && (
          <div data-testid="tail-loading-skeleton" className="animate-pulse space-y-1">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        )}

        {tailQuery.isError && (
          <div data-testid="tail-error-fallback" className="rounded border border-red-200 bg-red-50 p-4 text-sm space-y-2">
            <p>Tail unavailable; try full logs.</p>
            <button
              data-testid="load-full-logs-button"
              onClick={() => setShowFullLogs(true)}
              className="text-blue-600 hover:underline"
            >
              Load full logs
            </button>
          </div>
        )}

        {tailQuery.isSuccess && (
          <>
            {tailQuery.data.truncated && (
              <div data-testid="tail-truncated-banner" className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mb-1">
                Output truncated — showing last 50 lines. Load full logs for complete output.
              </div>
            )}
            <pre
              data-testid="tail-pre"
              className="overflow-auto rounded bg-gray-900 text-gray-100 p-4 text-xs font-mono max-h-96"
            >
              {tailQuery.data.lines.join('\n')}
            </pre>
          </>
        )}
      </section>

      {/* Section 3: Full logs (lazy) */}
      {!showFullLogs && !tailQuery.isError && (
        <button
          data-testid="load-full-logs-button"
          onClick={() => setShowFullLogs(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          Load full logs
        </button>
      )}

      {showFullLogs && (
        <section data-testid="full-logs-panel">
          <h2 className="text-lg font-semibold mb-2">Full Logs</h2>

          {logsQuery.isLoading && (
            <div data-testid="logs-loading-skeleton" className="animate-pulse space-y-1">
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
            </div>
          )}

          {logsQuery.isError && (
            <p data-testid="logs-error" className="text-sm text-red-600">Failed to load full logs.</p>
          )}

          {logsQuery.isSuccess && (
            <pre
              data-testid="logs-pre"
              className="overflow-auto rounded bg-gray-900 text-gray-100 p-4 text-xs font-mono max-h-[32rem]"
            >
              {logsQuery.data}
            </pre>
          )}
        </section>
      )}
    </main>
  );
}
