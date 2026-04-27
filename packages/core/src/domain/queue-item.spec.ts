/**
 * Unit tests for QueueItem entity and helper functions.
 */

import {
  QueueItemState,
  QUEUE_ITEM_TRANSITIONS,
  isQueueItemTerminal,
  isValidQueueItemTransition,
} from './queue-item';

describe('QueueItemState', () => {
  it('defines all expected states', () => {
    expect(QueueItemState.Pending).toBe('Pending');
    expect(QueueItemState.Active).toBe('Active');
    expect(QueueItemState.Completed).toBe('Completed');
    expect(QueueItemState.Failed).toBe('Failed');
    expect(QueueItemState.Paused).toBe('Paused');
    expect(QueueItemState.Quarantined).toBe('Quarantined');
  });

  it('has exactly 6 states', () => {
    expect(Object.keys(QueueItemState)).toHaveLength(6);
  });
});

describe('QUEUE_ITEM_TRANSITIONS', () => {
  it('covers all states', () => {
    const allStates = Object.values(QueueItemState);
    for (const state of allStates) {
      expect(QUEUE_ITEM_TRANSITIONS).toHaveProperty(state);
    }
  });

  it('Pending can transition to Active and Paused', () => {
    expect(QUEUE_ITEM_TRANSITIONS[QueueItemState.Pending]).toContain(QueueItemState.Active);
    expect(QUEUE_ITEM_TRANSITIONS[QueueItemState.Pending]).toContain(QueueItemState.Paused);
  });

  it('Active can transition to Completed, Failed, and Paused', () => {
    const targets = QUEUE_ITEM_TRANSITIONS[QueueItemState.Active];
    expect(targets).toContain(QueueItemState.Completed);
    expect(targets).toContain(QueueItemState.Failed);
    expect(targets).toContain(QueueItemState.Paused);
  });

  it('Failed can transition to Pending (retry) and Quarantined', () => {
    const targets = QUEUE_ITEM_TRANSITIONS[QueueItemState.Failed];
    expect(targets).toContain(QueueItemState.Pending);
    expect(targets).toContain(QueueItemState.Quarantined);
  });

  it('Paused can only transition to Pending (resume)', () => {
    const targets = QUEUE_ITEM_TRANSITIONS[QueueItemState.Paused];
    expect(targets).toEqual([QueueItemState.Pending]);
  });

  it('Completed is terminal (empty transitions)', () => {
    expect(QUEUE_ITEM_TRANSITIONS[QueueItemState.Completed]).toHaveLength(0);
  });

  it('Quarantined is terminal (empty transitions)', () => {
    expect(QUEUE_ITEM_TRANSITIONS[QueueItemState.Quarantined]).toHaveLength(0);
  });
});

describe('isQueueItemTerminal', () => {
  it('returns true for Completed', () => {
    expect(isQueueItemTerminal(QueueItemState.Completed)).toBe(true);
  });

  it('returns true for Quarantined', () => {
    expect(isQueueItemTerminal(QueueItemState.Quarantined)).toBe(true);
  });

  it('returns false for Pending', () => {
    expect(isQueueItemTerminal(QueueItemState.Pending)).toBe(false);
  });

  it('returns false for Active', () => {
    expect(isQueueItemTerminal(QueueItemState.Active)).toBe(false);
  });

  it('returns false for Failed', () => {
    expect(isQueueItemTerminal(QueueItemState.Failed)).toBe(false);
  });

  it('returns false for Paused', () => {
    expect(isQueueItemTerminal(QueueItemState.Paused)).toBe(false);
  });
});

describe('isValidQueueItemTransition', () => {
  it('Pending → Active is valid', () => {
    expect(isValidQueueItemTransition(QueueItemState.Pending, QueueItemState.Active)).toBe(true);
  });

  it('Pending → Completed is invalid', () => {
    expect(isValidQueueItemTransition(QueueItemState.Pending, QueueItemState.Completed)).toBe(false);
  });

  it('Active → Completed is valid', () => {
    expect(isValidQueueItemTransition(QueueItemState.Active, QueueItemState.Completed)).toBe(true);
  });

  it('Active → Failed is valid', () => {
    expect(isValidQueueItemTransition(QueueItemState.Active, QueueItemState.Failed)).toBe(true);
  });

  it('Active → Paused is valid', () => {
    expect(isValidQueueItemTransition(QueueItemState.Active, QueueItemState.Paused)).toBe(true);
  });

  it('Completed → Pending is invalid (terminal)', () => {
    expect(isValidQueueItemTransition(QueueItemState.Completed, QueueItemState.Pending)).toBe(false);
  });

  it('Quarantined → Pending is invalid (terminal)', () => {
    expect(isValidQueueItemTransition(QueueItemState.Quarantined, QueueItemState.Pending)).toBe(false);
  });

  it('Failed → Pending is valid (retry path)', () => {
    expect(isValidQueueItemTransition(QueueItemState.Failed, QueueItemState.Pending)).toBe(true);
  });

  it('Failed → Quarantined is valid', () => {
    expect(isValidQueueItemTransition(QueueItemState.Failed, QueueItemState.Quarantined)).toBe(true);
  });

  it('Paused → Pending is valid (resume)', () => {
    expect(isValidQueueItemTransition(QueueItemState.Paused, QueueItemState.Pending)).toBe(true);
  });

  it('Paused → Active is invalid (must go through Pending)', () => {
    expect(isValidQueueItemTransition(QueueItemState.Paused, QueueItemState.Active)).toBe(false);
  });
});
