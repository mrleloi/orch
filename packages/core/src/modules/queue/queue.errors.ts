/**
 * Queue-specific domain errors.
 *
 * I-12: All queue errors extend DomainError so callers can use a single
 * `instanceof DomainError` catch while still narrowing the specific failure mode.
 */

import { DomainError } from '../../domain/errors.js';

/**
 * Thrown when a queue item enqueue attempt is rejected because an item with
 * the same (projectId, dedupKey) already exists.
 *
 * I-8: dedup enforced at DB level; this error wraps the Prisma unique violation.
 */
export class QueueDedupError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('QUEUE_DEDUP_ERROR', message, options);
  }
}

/**
 * Thrown when a queue item state transition is requested but the current state
 * does not permit the target state (per QUEUE_ITEM_TRANSITIONS table).
 *
 * I-11: No silent transitions — callers must handle this explicitly.
 */
export class QueueStateTransitionError extends DomainError {
  readonly fromState: string;
  readonly toState: string;
  readonly itemId: string;

  constructor(
    itemId: string,
    fromState: string,
    toState: string,
    options?: { cause?: unknown },
  ) {
    super(
      'QUEUE_STATE_TRANSITION_ERROR',
      `Queue item "${itemId}": illegal transition ${fromState} → ${toState}`,
      options,
    );
    this.itemId = itemId;
    this.fromState = fromState;
    this.toState = toState;
  }
}
