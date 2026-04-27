/**
 * QueueService — public API for the Orch plan queue.
 *
 * Responsibilities:
 *  - Idempotent enqueue with dedup (I-8) via (projectId, dedupKey) unique constraint
 *  - Atomic "pick next and activate" via prisma.$transaction (SYNTHESIS §D2)
 *  - State transitions validated against QUEUE_ITEM_TRANSITIONS (I-11)
 *  - Event emission on every state change (I-11: no silent transitions)
 *  - Span wrapping for traceability (I-9)
 *  - zod validation at enqueue boundary (I-10)
 *  - Retry logic: after maxAttempts failures → Quarantined
 *
 * I-14: Imports only from domain (types) and sibling modules via DI.
 * I-2:  No project-specific logic or hardcoded project names.
 * P2:   No job-queue library. Single-daemon single-process model.
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import type { QueueItem } from '../../domain/queue-item.js';
import {
  QueueItemState,
  isValidQueueItemTransition,
} from '../../domain/queue-item.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { TracingService } from '../tracing/tracing.service.js';
import { PrismaService } from '../db/prisma.service.js';
import { QueueRepository } from './queue.repository.js';
import { QueueDedupError, QueueStateTransitionError } from './queue.errors.js';

// ── Zod schema for enqueue input (I-10) ───────────────────────────────────────

const EnqueueInputSchema = z.object({
  projectId: z.string().min(1),
  planPath: z.string().min(1),
  priority: z.number().int().min(0).max(100).optional(),
  dedupKey: z.string().min(1),
  mtime: z.number().int().positive(),
  sessionKey: z.string().min(1).optional(),
  sessionType: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type EnqueueInput = z.input<typeof EnqueueInputSchema>;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly repo: QueueRepository,
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly tracing: TracingService,
  ) {}

  /** Global pause flag — when true, the queue watcher does not dispatch new items. */
  private _paused = false;

  /** Returns true if the queue is globally paused. */
  get isPaused(): boolean {
    return this._paused;
  }

  onModuleInit(): void {
    this.logger.log('QueueService initialised');
  }

  onModuleDestroy(): void {
    this.logger.log('QueueService destroyed');
  }

  // ── Global pause / resume (in-memory flag) ─────────────────────────────────

  /**
   * Pause queue processing globally.
   *
   * Sets an in-memory flag that the queue watcher checks before dispatching.
   * This is a lightweight operator control; it does NOT modify item states.
   * No event emitted (in-memory flag only; not a state transition of a specific item).
   */
  pauseGlobal(): void {
    this._paused = true;
    this.logger.log('QueueService: global pause activated');
  }

  /**
   * Resume queue processing globally.
   *
   * Clears the in-memory pause flag.
   * No event emitted (in-memory flag only).
   */
  resumeGlobal(): void {
    this._paused = false;
    this.logger.log('QueueService: global pause deactivated');
  }

  // ── Enqueue ────────────────────────────────────────────────────────────────

  /**
   * Enqueue a plan file for processing.
   *
   * Atomic: dedup check + insert in the same transaction.
   * If an item with the same (projectId, dedupKey) already exists, the existing
   * item is returned without modification (idempotent — I-8).
   *
   * Emits `queue.enqueued` on new insert.
   * Wraps in `withSpan('queue.enqueue')`.
   *
   * @throws {ZodError} if input fails schema validation (I-10)
   */
  async enqueue(rawInput: EnqueueInput): Promise<QueueItem> {
    // I-10: validate all external input through zod before touching domain logic
    const input = EnqueueInputSchema.parse(rawInput);

    return this.tracing.withSpan('queue.enqueue', async (span) => {
      span.setAttribute('queue.projectId', input.projectId);
      span.setAttribute('queue.dedupKey', input.dedupKey);

      return this.prisma.$transaction(async (tx) => {
        // Idempotent dedup check inside the same tx
        const existing = await this.repo.findByDedupKey(
          input.projectId,
          input.dedupKey,
          tx,
        );
        if (existing !== null) {
          this.logger.debug({
            msg: 'queue.enqueue:dedup-hit',
            itemId: existing.id,
            dedupKey: input.dedupKey,
          });
          return existing;
        }

        // Build sessionKey: if provided use it, else derive from projectId
        const sessionKey =
          input.sessionKey ??
          `${input.projectId}:${input.sessionType ?? 'default'}:1`;

        const item = await this.repo.create(
          {
            projectId: input.projectId,
            sessionKey,
            priority: input.priority ?? 5,
            dedupKey: input.dedupKey,
            payload: {
              ...(input.payload ?? {}),
              planPath: input.planPath,
              mtime: input.mtime,
            },
          },
          tx,
        );

        this.eventBus.emit(EVENT_CHANNELS.queue.enqueued, { item });
        span.setAttribute('queue.itemId', item.id);
        return item;
      });
    });
  }

  // ── Next ───────────────────────────────────────────────────────────────────

  /**
   * Atomically select the next Pending item for a project and activate it.
   *
   * Uses `prisma.$transaction` to ensure the pick + state-flip is atomic (SYNTHESIS §D2).
   * Emits `queue.started` when an item is successfully activated.
   *
   * Returns null if no Pending items exist for the project.
   */
  async next(projectId: string): Promise<QueueItem | null> {
    return this.tracing.withSpan('queue.next', async (span) => {
      span.setAttribute('queue.projectId', projectId);

      const item = await this.prisma.$transaction(async (tx) => {
        return this.repo.nextForProject(projectId, tx);
      });

      if (item !== null) {
        this.eventBus.emit(EVENT_CHANNELS.queue.started, { item });
        span.setAttribute('queue.itemId', item.id);
      }
      return item;
    });
  }

  // ── Complete ───────────────────────────────────────────────────────────────

  /**
   * Transition a queue item to Completed.
   *
   * Validates the transition (Active → Completed) before persisting.
   * Emits `queue.completed`.
   */
  async complete(
    itemId: string,
    result?: Record<string, unknown>,
  ): Promise<QueueItem> {
    return this.tracing.withSpan('queue.complete', async (span) => {
      span.setAttribute('queue.itemId', itemId);

      const item = await this.prisma.$transaction(async (tx) => {
        const current = await this.requireItem(itemId, tx);
        this.assertTransition(current, QueueItemState.Completed);

        return this.repo.updateState(
          itemId,
          QueueItemState.Completed,
          {
            endedAt: new Date(),
            ...(result !== undefined
              ? { payload: { ...current.payload, _result: result } }
              : {}),
          },
          tx,
        );
      });

      this.eventBus.emit(EVENT_CHANNELS.queue.completed, { item });
      return item;
    });
  }

  // ── Fail ───────────────────────────────────────────────────────────────────

  /**
   * Record a failure for a queue item.
   *
   * Increments attempt count. If `attempts >= maxAttempts`, transitions to
   * Quarantined (charter principle: "Fail loud, recover gracefully").
   * Otherwise transitions back to Pending for retry.
   *
   * Emits `queue.quarantined` or `queue.failed` accordingly.
   */
  async fail(itemId: string, errorMessage: string): Promise<QueueItem> {
    return this.tracing.withSpan('queue.fail', async (span) => {
      span.setAttribute('queue.itemId', itemId);
      span.setAttribute('queue.errorMessage', errorMessage);

      const item = await this.prisma.$transaction(async (tx) => {
        const current = await this.requireItem(itemId, tx);
        // Must be Active to fail
        this.assertTransition(current, QueueItemState.Failed);

        // Step 1: transition Active → Failed + increment attempts
        await this.repo.updateState(itemId, QueueItemState.Failed, {}, tx);
        const withAttempts = await this.repo.incrementAttempts(
          itemId,
          errorMessage,
          tx,
        );

        if (withAttempts.attempts >= withAttempts.maxAttempts) {
          // Step 2a: Failed → Quarantined (max retries exceeded)
          this.assertTransition(withAttempts, QueueItemState.Quarantined);
          return this.repo.updateState(
            itemId,
            QueueItemState.Quarantined,
            { endedAt: new Date() },
            tx,
          );
        } else {
          // Step 2b: Failed → Pending (eligible for retry)
          this.assertTransition(withAttempts, QueueItemState.Pending);
          return this.repo.updateState(itemId, QueueItemState.Pending, {}, tx);
        }
      });

      const err = new Error(errorMessage);
      if (item.state === QueueItemState.Quarantined) {
        this.eventBus.emit(EVENT_CHANNELS.queue.quarantined, {
          item,
          error: err,
        });
        span.setAttribute('queue.quarantined', true);
      } else {
        this.eventBus.emit(EVENT_CHANNELS.queue.failed, { item, error: err });
      }

      return item;
    });
  }

  // ── Pause ──────────────────────────────────────────────────────────────────

  /**
   * Pause all Pending items for a project.
   *
   * Transitions: Pending → Paused.
   * Emits `queue.paused` for each affected item.
   */
  async pause(projectId: string): Promise<void> {
    return this.tracing.withSpan('queue.pause', async (span) => {
      span.setAttribute('queue.projectId', projectId);

      const items = await this.prisma.$transaction(async (tx) => {
        const pending = await this.repo.list(
          projectId,
          QueueItemState.Pending,
          undefined,
          tx,
        );

        const updated: QueueItem[] = [];
        for (const item of pending) {
          if (isValidQueueItemTransition(item.state, QueueItemState.Paused)) {
            const u = await this.repo.updateState(
              item.id,
              QueueItemState.Paused,
              {},
              tx,
            );
            updated.push(u);
          }
        }
        return updated;
      });

      for (const item of items) {
        this.eventBus.emit(EVENT_CHANNELS.queue.paused, { item });
      }
      span.setAttribute('queue.pausedCount', items.length);
    });
  }

  // ── Resume ─────────────────────────────────────────────────────────────────

  /**
   * Resume all Paused items for a project.
   *
   * Transitions: Paused → Pending.
   * Emits `queue.resumed` for each affected item.
   */
  async resume(projectId: string): Promise<void> {
    return this.tracing.withSpan('queue.resume', async (span) => {
      span.setAttribute('queue.projectId', projectId);

      const items = await this.prisma.$transaction(async (tx) => {
        const paused = await this.repo.list(
          projectId,
          QueueItemState.Paused,
          undefined,
          tx,
        );

        const updated: QueueItem[] = [];
        for (const item of paused) {
          if (isValidQueueItemTransition(item.state, QueueItemState.Pending)) {
            const u = await this.repo.updateState(
              item.id,
              QueueItemState.Pending,
              {},
              tx,
            );
            updated.push(u);
          }
        }
        return updated;
      });

      for (const item of items) {
        this.eventBus.emit(EVENT_CHANNELS.queue.resumed, { item });
      }
      span.setAttribute('queue.resumedCount', items.length);
    });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Fetch item by id or throw DomainError if not found. */
  private async requireItem(
    itemId: string,
    tx?: Parameters<typeof this.repo.findById>[1],
  ): Promise<QueueItem> {
    const item = await this.repo.findById(itemId, tx);
    if (item === null) {
      throw new QueueDedupError(`QueueItem "${itemId}" not found`);
    }
    return item;
  }

  /** Assert a transition is valid; throw QueueStateTransitionError if not (I-11). */
  private assertTransition(item: QueueItem, toState: QueueItemState): void {
    if (!isValidQueueItemTransition(item.state, toState)) {
      throw new QueueStateTransitionError(item.id, item.state, toState);
    }
  }
}

export { QueueDedupError };
