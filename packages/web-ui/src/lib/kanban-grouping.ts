/**
 * kanban-grouping.ts — Pure grouping helper for KanbanPage.
 *
 * Groups QueueItem[] into the 4 Kanban columns.
 *
 * Decision (Risk #7): The `cancelled` QueueItemState rolls into the `failed`
 * column because the spec (phase-2-interfaces.md line 418) defines exactly
 * 4 columns: Pending, Running, Completed, Failed. Adding a 5th column would
 * deviate from the spec. A subtle "(cancelled)" indicator on the card is
 * preferred but left to the card renderer.
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

import type { QueueItemDto } from '@orch/shared';

/** Four Kanban columns produced by groupByState. */
export interface KanbanGroups {
  pending: QueueItemDto[];
  running: QueueItemDto[];
  completed: QueueItemDto[];
  /** Includes items with state 'failed' OR 'cancelled'. */
  failed: QueueItemDto[];
}

/**
 * Groups a flat list of QueueItem DTOs into the 4 Kanban columns.
 *
 * Mapping:
 *   - 'pending'   → pending column
 *   - 'running'   → running column
 *   - 'completed' → completed column
 *   - 'failed'    → failed column
 *   - 'cancelled' → failed column  ← Risk #7 decision: no 5th column
 *
 * Ordering within each column is preserved from the input array.
 *
 * @param items - Flat queue item array from ApiClient.queue.list()
 * @returns Object with four arrays, each typed QueueItemDto[].
 */
export function groupByState(items: QueueItemDto[]): KanbanGroups {
  const groups: KanbanGroups = {
    pending: [],
    running: [],
    completed: [],
    failed: [],
  };

  for (const item of items) {
    switch (item.state) {
      case 'pending':
        groups.pending.push(item);
        break;
      case 'running':
        groups.running.push(item);
        break;
      case 'completed':
        groups.completed.push(item);
        break;
      case 'failed':
      case 'cancelled': // Risk #7: cancelled → failed column (no 5th column per spec line 418)
        groups.failed.push(item);
        break;
      default: {
        // Exhaustive check — TypeScript narrows to `never` here if all states are covered.
        const _exhaustive: never = item.state;
        console.warn('[kanban-grouping] Unknown state — dropping item:', _exhaustive);
      }
    }
  }

  return groups;
}
