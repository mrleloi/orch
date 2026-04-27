/**
 * RequestQueue — per-session FIFO serialization layer.
 *
 * Ensures that tasks submitted for the same sessionKey are processed one at a
 * time in FIFO order. Tasks for different sessionKeys run in parallel.
 *
 * Ported near-verbatim from claudegram/src/claude/request-queue.ts (BORROW-1).
 * Substitutions from the reference:
 *  - Module-level Maps → instance Maps (NestJS singleton injectable).
 *  - `Query` type → `() => Promise<void>` task callback.
 *  - `q.interrupt()` → `handle.abort()` (wired by SessionManager 1.9d, not here).
 *  - Error type for cancel: `QueueCancelledError` (I-12).
 *  - Lifecycle events emitted via `EventBusService` (I-11).
 *
 * Concurrency model:
 *  Node.js runs on a single event-loop thread. The `processingFlags` map
 *  provides atomicity at the microtask boundary: processQueue() returns
 *  immediately if the flag is already set, so concurrent calls to enqueue()
 *  are safe without additional locking.
 *
 * Cancel semantics (soft-cancel):
 *  `cancel(sessionKey)` rejects all PENDING tasks (those waiting in the queue)
 *  with `QueueCancelledError`. The currently PROCESSING task is NOT affected —
 *  it runs to completion. The caller (SessionManager 1.9d or the /cancel handler
 *  in Phase 2) is responsible for calling the adapter's `handle.abort()` to
 *  interrupt the in-flight Claude process independently.
 *
 * Memory cleanup:
 *  After the last task drains for a sessionKey, both the pending queue entry and
 *  the processing flag entry are removed from their Maps so the key does not
 *  accumulate stale entries over time.
 *
 * I-3: No Agent SDK imports — zero tolerance.
 * I-12: QueueCancelledError extends DomainError.
 * I-14: Only @nestjs/common used (Injectable, Logger). No domain layer reverse-import.
 */

import { Injectable, Logger } from '@nestjs/common';
import { QueueCancelledError } from '../../domain/errors.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';

// ── Internal types ─────────────────────────────────────────────────────────────

/** A task waiting in the per-session FIFO queue. */
interface QueuedTask {
  /** The actual work unit — resolves or rejects when done. */
  task: () => Promise<void>;
  /** Resolve this caller's promise when the task completes successfully. */
  resolve: () => void;
  /** Reject this caller's promise when the task throws or is cancelled. */
  reject: (err: Error) => void;
}

// ── RequestQueue ───────────────────────────────────────────────────────────────

@Injectable()
export class RequestQueue {
  private readonly logger = new Logger(RequestQueue.name);

  /** Pending (not yet started) tasks per sessionKey. */
  private readonly pendingQueues = new Map<string, QueuedTask[]>();

  /** True while a task is actively executing for the given sessionKey. */
  private readonly processingFlags = new Map<string, boolean>();

  /** sessionKeys whose pending tasks should be rejected on next drain. */
  private readonly cancelledKeys = new Set<string>();

  constructor(private readonly eventBus: EventBusService) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Enqueue a task for the given sessionKey.
   *
   * Returns a promise that resolves/rejects when THIS caller's task completes.
   * If the key is not currently processing, the task starts immediately.
   * If another task is in-flight, this task waits in the FIFO queue.
   *
   * If the sessionKey was already cancelled, this task is rejected immediately
   * with `QueueCancelledError` (before any processing attempt).
   */
  enqueue(sessionKey: string, task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // If already cancelled, reject this new task immediately.
      if (this.cancelledKeys.has(sessionKey)) {
        reject(new QueueCancelledError(sessionKey));
        return;
      }

      const queued: QueuedTask = { task, resolve, reject };

      let queue = this.pendingQueues.get(sessionKey);
      if (!queue) {
        queue = [];
        this.pendingQueues.set(sessionKey, queue);
      }
      queue.push(queued);

      const depth = queue.length;
      this.eventBus.emit(EVENT_CHANNELS.rqueue.enqueued, {
        sessionKey,
        queueDepth: depth,
      });

      this.logger.debug({
        msg: 'rqueue:enqueued',
        sessionKey,
        queueDepth: depth,
      });

      // Kick off processing if not already running.
      void this.processQueue(sessionKey);
    });
  }

  /**
   * Soft-cancel all PENDING tasks for the given sessionKey.
   *
   * Any tasks currently waiting in the queue are rejected immediately with
   * `QueueCancelledError`. The currently PROCESSING task (if any) is NOT
   * affected — it will run to completion.
   *
   * The sessionKey is marked cancelled so any new tasks enqueued after this
   * call are also immediately rejected.
   *
   * Returns a promise that resolves when the cancellation bookkeeping is done
   * (synchronous, but returns Promise for a uniform async API).
   */
  cancel(sessionKey: string): Promise<void> {
    this.cancelledKeys.add(sessionKey);

    const queue = this.pendingQueues.get(sessionKey);
    const pending = queue ? queue.splice(0) : [];

    const rejectedCount = pending.length;
    for (const item of pending) {
      item.reject(new QueueCancelledError(sessionKey));
    }

    // Clear the cancelled flag once all pending tasks have been rejected.
    // This allows future enqueues on the same key to proceed normally (Fix C).
    // The currently-processing task (if any) continues to completion unaffected.
    this.cancelledKeys.delete(sessionKey);

    this.eventBus.emit(EVENT_CHANNELS.rqueue.cancelled, {
      sessionKey,
      rejectedCount,
    });

    this.logger.log({
      msg: 'rqueue:cancelled',
      sessionKey,
      rejectedCount,
    });

    return Promise.resolve();
  }

  /**
   * Returns true if a task is currently processing for the given sessionKey.
   *
   * "Active" means the task function itself is executing (the in-flight task),
   * NOT that there are tasks waiting in the queue.
   */
  hasActive(sessionKey: string): boolean {
    return this.processingFlags.get(sessionKey) === true;
  }

  /**
   * Returns the number of tasks waiting in the queue for the given sessionKey.
   *
   * Does NOT count the currently processing task (that one is active, not pending).
   */
  getPending(sessionKey: string): number {
    return this.pendingQueues.get(sessionKey)?.length ?? 0;
  }

  /**
   * Returns the set of sessionKeys that currently have an active (processing) task.
   *
   * Read-only snapshot — modifications to the returned array do not affect
   * internal state.
   */
  getActiveKeys(): readonly string[] {
    const keys: string[] = [];
    for (const [key, active] of this.processingFlags) {
      if (active) keys.push(key);
    }
    return keys;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Drain the next task from the queue for the given sessionKey.
   *
   * If the processing flag is already set, returns immediately (another drain
   * loop is already running — this is the re-entrancy guard).
   *
   * This is the core FIFO loop from claudegram BORROW-1, adapted for typed
   * events and soft-cancel support.
   */
  private async processQueue(sessionKey: string): Promise<void> {
    // Re-entrancy guard (atomic at microtask boundary in single-threaded Node.js).
    if (this.processingFlags.get(sessionKey)) {
      return;
    }

    const queue = this.pendingQueues.get(sessionKey);
    if (!queue || queue.length === 0) {
      return;
    }

    // Check if this key was cancelled; if so, drain remaining pending items.
    if (this.cancelledKeys.has(sessionKey)) {
      const pending = queue.splice(0);
      for (const item of pending) {
        item.reject(new QueueCancelledError(sessionKey));
      }
      // Clear the cancelled flag after draining so new enqueues can proceed.
      this.cancelledKeys.delete(sessionKey);
      this.cleanup(sessionKey);
      return;
    }

    this.processingFlags.set(sessionKey, true);
    const item = queue.shift()!;

    this.eventBus.emit(EVENT_CHANNELS.rqueue.started, { sessionKey });
    this.logger.debug({ msg: 'rqueue:started', sessionKey });

    try {
      await item.task();
      item.resolve();
      this.eventBus.emit(EVENT_CHANNELS.rqueue.completed, { sessionKey });
      this.logger.debug({ msg: 'rqueue:completed', sessionKey });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      item.reject(error);
      this.eventBus.emit(EVENT_CHANNELS.rqueue.failed, { sessionKey, error });
      this.logger.debug({
        msg: 'rqueue:failed',
        sessionKey,
        error: error.message,
      });
    } finally {
      this.processingFlags.set(sessionKey, false);

      const remaining = this.pendingQueues.get(sessionKey);
      if (!remaining || remaining.length === 0) {
        // No more work for this key — clean up Maps to prevent stale entries.
        this.cleanup(sessionKey);
      } else {
        // Tail-recurse: process the next item.
        void this.processQueue(sessionKey);
      }
    }
  }

  /**
   * Remove internal Map entries for a sessionKey once its queue is fully drained.
   *
   * This ensures getActiveKeys() returns an empty array after all work completes
   * and prevents unbounded Map growth over the lifetime of the daemon.
   */
  private cleanup(sessionKey: string): void {
    const queue = this.pendingQueues.get(sessionKey);
    if (!queue || queue.length === 0) {
      this.pendingQueues.delete(sessionKey);
    }
    if (!this.processingFlags.get(sessionKey)) {
      this.processingFlags.delete(sessionKey);
    }
  }
}
