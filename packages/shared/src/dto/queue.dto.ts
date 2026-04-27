/**
 * queue.dto.ts — Typed DTOs for QueueItem-related REST responses.
 *
 * I-4: consumers call HTTP API only; no @orch/core imports.
 */

/** Valid queue item state values. */
export type QueueItemState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** DTO returned by GET /api/v1/queue */
export interface QueueItemDto {
  id: string;
  projectId: string;
  planPath: string;
  priority: number;
  state: QueueItemState;
  sessionId: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

/** DTO for queue status summary */
export interface QueueStatusDto {
  pending: number;
  running: number;
  paused: boolean;
  items: QueueItemDto[];
}
