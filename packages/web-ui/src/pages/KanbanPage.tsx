/**
 * KanbanPage — real implementation for route `/kanban`.
 *
 * Part B signature (verbatim): export function KanbanPage(): JSX.Element
 *
 * Features:
 *   - 4 columns: Pending, Running, Completed, Failed
 *   - Queue cards (projectId + planPath basename + relative startedAt + conditional Stop button)
 *   - I-6-compliant Stop flow: Stop button → StopSessionDialog → confirm → sessions.stop(id, true)
 *   - SSE-driven TanStack Query cache invalidation
 *   - Loading / error / empty states
 *
 * SSE auth: URL includes ?token= query-param fallback accepted by BearerAuthGuard.
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 * I-6: Stop action gated by StopSessionDialog confirmation. Never bypass.
 * I-10: All responses zod-validated inside ApiClient.
 */

import { useState, useCallback, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SseEnvelope, QueueItemDto } from '@orch/shared';
import { useApiClient } from '../api/api-client-context.js';
import { useSseEvents } from '../hooks/use-sse-events.js';
import { useTokenGate } from '../auth/token-gate-context.js';
import { buildSseStreamUrl } from '../lib/sse-url.js';
import { groupByState } from '../lib/kanban-grouping.js';
import { KanbanColumn } from '../components/kanban-column.js';
import { QueueCard } from '../components/queue-card.js';
import { StopSessionDialog } from '../components/stop-session-dialog.js';
import { Skeleton } from '../components/ui/skeleton.js';

// ── Dialog state ───────────────────────────────────────────────────────────────

interface StopDialogState {
  open: boolean;
  targetSessionId: string | null;
}

const CLOSED_DIALOG: StopDialogState = { open: false, targetSessionId: null };

// ── KanbanPage ─────────────────────────────────────────────────────────────────

/**
 * KanbanPage — renders 4 Kanban columns driven by ApiClient.queue.list().
 * Subscribes to SSE events to invalidate the queue cache automatically.
 */
export function KanbanPage(): JSX.Element {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { token } = useTokenGate();

  // ── Controlled dialog state (I-6) ─────────────────────────────────────────

  const [dialog, setDialog] = useState<StopDialogState>(CLOSED_DIALOG);

  // ── Queue query ────────────────────────────────────────────────────────────

  const queueQuery = useQuery({
    queryKey: ['queue'],
    queryFn: () => apiClient.queue.list(),
    // Keep previous data visible on refetch to prevent flickering (2.7.e / spec line 441)
    placeholderData: (prev) => prev,
  });

  // ── SSE invalidation ───────────────────────────────────────────────────────

  const handleSseEvent = useCallback(
    (envelope: SseEnvelope) => {
      switch (envelope.type) {
        case 'queue.enqueued':
        case 'queue.state_changed':
        case 'session.started':
        case 'session.ended':
          void queryClient.invalidateQueries({ queryKey: ['queue'] });
          break;
        default:
          break;
      }
    },
    [queryClient],
  );

  useSseEvents({
    url: buildSseStreamUrl(token),
    filter: ['queue.enqueued', 'queue.state_changed', 'session.started', 'session.ended'],
    onEvent: handleSseEvent,
  });

  // ── Stop-button handler (I-6) ──────────────────────────────────────────────

  /**
   * Opens the confirmation dialog for the given queue item id.
   * Sessions.stop is NOT called here — only after dialog confirms.
   */
  const handleStopRequest = useCallback((itemId: string): void => {
    setDialog({ open: true, targetSessionId: itemId });
  }, []);

  /**
   * Confirmed stop: calls sessions.stop(id, true) then invalidates queue cache.
   * I-6: only reachable via StopSessionDialog confirmation path.
   */
  const handleStopConfirm = useCallback((): void => {
    const sessionId = dialog.targetSessionId;
    if (sessionId === null) return;

    void apiClient.sessions.stop(sessionId, true).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['queue'] });
    });

    setDialog(CLOSED_DIALOG);
  }, [apiClient, dialog.targetSessionId, queryClient]);

  const handleDialogOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      setDialog(CLOSED_DIALOG);
    }
  }, []);

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderCard(item: QueueItemDto): JSX.Element {
    return (
      <QueueCard
        key={item.id}
        item={item}
        onStopRequest={handleStopRequest}
      />
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (queueQuery.isLoading) {
    return (
      <main data-testid="page-kanban" className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Kanban</h1>
        <div data-testid="kanban-loading" className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  // Guard: only show full-screen error when there is no stale data to fall back on.
  // On a background-refetch error (isRefetchError=true), stale data is still
  // present in queueQuery.data — the running card MUST remain visible (2.7.e / spec line 441).
  // `isLoadingError` = isError && !hasData; avoids the flicker on transient failures.

  if (queueQuery.isLoadingError) {
    return (
      <main data-testid="page-kanban" className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Kanban</h1>
        <div data-testid="kanban-error" className="rounded-md border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load queue. Please try again.</p>
          <button
            className="mt-2 text-sm underline text-destructive"
            onClick={() => void queueQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // ── Happy path ─────────────────────────────────────────────────────────────

  const items = queueQuery.data ?? [];
  const groups = groupByState(items);

  return (
    <main data-testid="page-kanban" className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Kanban</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KanbanColumn
          title="Pending"
          count={groups.pending.length}
          items={groups.pending}
          renderItem={renderCard}
          emptyCopy="No pending items"
        />

        <KanbanColumn
          title="Running"
          count={groups.running.length}
          items={groups.running}
          renderItem={renderCard}
          emptyCopy="No running items"
        />

        <KanbanColumn
          title="Completed"
          count={groups.completed.length}
          items={groups.completed}
          renderItem={renderCard}
          emptyCopy="No completed items"
        />

        <KanbanColumn
          title="Failed"
          count={groups.failed.length}
          items={groups.failed}
          renderItem={renderCard}
          emptyCopy="No failed items"
        />
      </div>

      {/* I-6: Confirmation dialog — MUST be opened before calling sessions.stop */}
      <StopSessionDialog
        sessionId={dialog.targetSessionId ?? ''}
        open={dialog.open}
        onOpenChange={handleDialogOpenChange}
        onConfirm={handleStopConfirm}
      />
    </main>
  );
}
