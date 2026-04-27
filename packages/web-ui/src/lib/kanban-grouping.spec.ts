/**
 * kanban-grouping.spec.ts — Pure unit tests for groupByState.
 *
 * No React, no DOM — pure function tests.
 *
 * 5 cases:
 *  1. Empty input → 4 empty arrays
 *  2. All four canonical states map to correct columns
 *  3. 'cancelled' state maps to 'failed' column (Risk #7 regression guard)
 *  4. Ordering within each column is preserved
 *  5. Multiple cancelled items all land in failed column
 */

import { describe, it, expect } from 'vitest';
import { groupByState } from './kanban-grouping.js';
import type { QueueItemDto } from '@orch/shared';

function makeItem(id: string, state: QueueItemDto['state']): QueueItemDto {
  return {
    id,
    projectId: 'proj-a',
    planPath: `/plans/${id}.md`,
    priority: 0,
    state,
    sessionId: null,
    enqueuedAt: '2026-01-01T00:00:00Z',
    startedAt: null,
    endedAt: null,
  };
}

describe('groupByState', () => {
  // ── Case 1: Empty input ────────────────────────────────────────────────────

  it('returns 4 empty arrays for empty input', () => {
    const result = groupByState([]);
    expect(result.pending).toHaveLength(0);
    expect(result.running).toHaveLength(0);
    expect(result.completed).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  // ── Case 2: Canonical states map to correct columns ────────────────────────

  it('maps pending, running, completed, failed items to correct columns', () => {
    const items: QueueItemDto[] = [
      makeItem('a', 'pending'),
      makeItem('b', 'running'),
      makeItem('c', 'completed'),
      makeItem('d', 'failed'),
    ];
    const result = groupByState(items);

    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]!.id).toBe('a');

    expect(result.running).toHaveLength(1);
    expect(result.running[0]!.id).toBe('b');

    expect(result.completed).toHaveLength(1);
    expect(result.completed[0]!.id).toBe('c');

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.id).toBe('d');
  });

  // ── Case 3: cancelled → failed column (Risk #7 regression guard) ─────────

  it('maps cancelled state to the failed column', () => {
    const items: QueueItemDto[] = [makeItem('x', 'cancelled')];
    const result = groupByState(items);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.id).toBe('x');

    // Must not appear in any other column
    expect(result.pending).toHaveLength(0);
    expect(result.running).toHaveLength(0);
    expect(result.completed).toHaveLength(0);
  });

  // ── Case 4: Ordering within column is preserved ───────────────────────────

  it('preserves insertion order within each column', () => {
    const items: QueueItemDto[] = [
      makeItem('p1', 'pending'),
      makeItem('p2', 'pending'),
      makeItem('p3', 'pending'),
    ];
    const result = groupByState(items);

    expect(result.pending.map((i) => i.id)).toEqual(['p1', 'p2', 'p3']);
  });

  // ── Case 5: Multiple cancelled → all in failed column ─────────────────────

  it('maps multiple cancelled items all to the failed column', () => {
    const items: QueueItemDto[] = [
      makeItem('f1', 'failed'),
      makeItem('c1', 'cancelled'),
      makeItem('c2', 'cancelled'),
    ];
    const result = groupByState(items);

    expect(result.failed).toHaveLength(3);
    expect(result.failed.map((i) => i.id)).toEqual(['f1', 'c1', 'c2']);
  });
});
