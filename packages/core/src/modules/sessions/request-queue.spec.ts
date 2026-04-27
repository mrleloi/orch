/**
 * RequestQueue spec — per-session FIFO serialization layer.
 *
 * Coverage targets:
 *  - Single enqueue runs the task and resolves
 *  - Two enqueues on same key run serially (ordered side effects)
 *  - Two enqueues on different keys run in parallel
 *  - Throwing task propagates error to its caller; queue continues
 *  - cancel() drains pending, rejects with QueueCancelledError, leaves in-flight alone
 *  - hasActive() / getPending() / getActiveKeys() return correct values
 *  - EventBusService receives rqueue.* events in order
 *  - Microtask ordering: enqueue during running task does not start before current resolves
 *  - Memory cleanup: getActiveKeys() empty after all queues drain
 *  - Enqueue on cancelled key is immediately rejected
 *
 * I-13: All tests use a mocked EventBusService — no real EventEmitter.
 */

import { Logger } from '@nestjs/common';
import { RequestQueue } from './request-queue.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { QueueCancelledError } from '../../domain/errors.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a mock EventBusService that records emit calls. */
function makeMockEventBus() {
  const calls: Array<{ channel: string; payload: unknown }> = [];
  const mock = {
    emit: jest.fn((channel: string, payload: unknown) => {
      calls.push({ channel, payload });
    }),
    on: jest.fn(),
    once: jest.fn(),
  } as unknown as EventBusService;

  return { mock, calls };
}

/** Create a RequestQueue instance with a mock event bus. */
function makeQueue() {
  const { mock: eventBus, calls: emittedEvents } = makeMockEventBus();
  const queue = new RequestQueue(eventBus);
  return { queue, eventBus, emittedEvents };
}

/** Returns a deferred (externally resolvable) promise + controller. */
function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Silence logger in tests ───────────────────────────────────────────────────

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RequestQueue', () => {
  // ── Basic functionality ─────────────────────────────────────────────────────

  describe('single enqueue', () => {
    it('runs the task and resolves the caller promise', async () => {
      const { queue } = makeQueue();
      let ran = false;
      await queue.enqueue('sess-1', async () => {
        ran = true;
      });
      expect(ran).toBe(true);
    });

    it('resolves with void when task returns', async () => {
      const { queue } = makeQueue();
      const result = await queue.enqueue('sess-1', async () => undefined);
      expect(result).toBeUndefined();
    });
  });

  // ── Serial ordering on same key ─────────────────────────────────────────────

  describe('two enqueues on the same key', () => {
    it('runs tasks serially in FIFO order', async () => {
      const { queue } = makeQueue();
      const order: number[] = [];
      const { promise: barrier, resolve: openBarrier } = deferred();

      // Task 1 blocks on the barrier — task 2 must wait until it releases.
      const p1 = queue.enqueue('sess-a', async () => {
        await barrier;
        order.push(1);
      });
      const p2 = queue.enqueue('sess-a', async () => {
        order.push(2);
      });

      // At this point task 1 is processing (blocked); task 2 is pending.
      expect(queue.hasActive('sess-a')).toBe(true);
      expect(queue.getPending('sess-a')).toBe(1);

      openBarrier();
      await Promise.all([p1, p2]);

      expect(order).toEqual([1, 2]);
    });

    it('second task does not start before first resolves', async () => {
      const { queue } = makeQueue();
      const started: number[] = [];
      const completed: number[] = [];

      const { promise: hold, resolve: releaseHold } = deferred();

      const p1 = queue.enqueue('sess-b', async () => {
        started.push(1);
        await hold;
        completed.push(1);
      });

      // Enqueue task 2 while task 1 is in-flight.
      const p2 = queue.enqueue('sess-b', async () => {
        started.push(2);
        completed.push(2);
      });

      // Before releasing: only task 1 should have started.
      expect(started).toEqual([1]);
      expect(completed).toEqual([]);

      releaseHold();
      await Promise.all([p1, p2]);

      // Task 2 starts only after task 1 finishes.
      expect(completed).toEqual([1, 2]);
    });
  });

  // ── Parallel on different keys ──────────────────────────────────────────────

  describe('two enqueues on different keys', () => {
    it('runs tasks in parallel', async () => {
      const { queue } = makeQueue();
      const started: string[] = [];

      const { promise: barrier1, resolve: open1 } = deferred();
      const { promise: barrier2, resolve: open2 } = deferred();

      const p1 = queue.enqueue('key-x', async () => {
        started.push('x');
        await barrier1;
      });
      const p2 = queue.enqueue('key-y', async () => {
        started.push('y');
        await barrier2;
      });

      // Both tasks should have started immediately (different keys).
      // Give microtasks a tick to settle.
      await Promise.resolve();

      expect(started).toContain('x');
      expect(started).toContain('y');
      expect(queue.hasActive('key-x')).toBe(true);
      expect(queue.hasActive('key-y')).toBe(true);

      open1();
      open2();
      await Promise.all([p1, p2]);
    });
  });

  // ── Error propagation ───────────────────────────────────────────────────────

  describe('throwing task', () => {
    it('propagates the error to the caller promise', async () => {
      const { queue } = makeQueue();
      const boom = new Error('boom');
      await expect(
        queue.enqueue('sess-err', async () => {
          throw boom;
        }),
      ).rejects.toThrow('boom');
    });

    it('lets the queue continue after a throwing task', async () => {
      const { queue } = makeQueue();
      let secondRan = false;

      await queue
        .enqueue('sess-err', async () => {
          throw new Error('first task fails');
        })
        .catch(() => {
          /* expected */
        });

      await queue.enqueue('sess-err', async () => {
        secondRan = true;
      });

      expect(secondRan).toBe(true);
    });

    it('wraps non-Error throws into an Error', async () => {
      const { queue } = makeQueue();
      await expect(
        queue.enqueue('sess-err', async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error';
        }),
      ).rejects.toBeInstanceOf(Error);
    });
  });

  // ── Cancel ──────────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('rejects all pending tasks with QueueCancelledError', async () => {
      const { queue } = makeQueue();
      const { promise: inFlight, resolve: finishInFlight } = deferred();

      // Task 1: in-flight, blocked.
      const p1 = queue.enqueue('sess-cancel', async () => {
        await inFlight;
      });

      // Tasks 2 and 3: pending.
      const p2 = queue.enqueue('sess-cancel', async () => undefined);
      const p3 = queue.enqueue('sess-cancel', async () => undefined);

      // Cancel — should drain p2 and p3 without touching p1.
      await queue.cancel('sess-cancel');

      await expect(p2).rejects.toBeInstanceOf(QueueCancelledError);
      await expect(p3).rejects.toBeInstanceOf(QueueCancelledError);

      // p1 (in-flight) is still running — finish it.
      finishInFlight();
      await p1; // should resolve normally
    });

    it('QueueCancelledError carries the sessionKey', async () => {
      const { queue } = makeQueue();

      const { promise: inFlight, resolve: finishInFlight } = deferred();
      queue.enqueue('key-a', async () => { await inFlight; }).catch(() => undefined);
      const pending = queue.enqueue('key-a', async () => undefined);

      await queue.cancel('key-a');
      finishInFlight();

      try {
        await pending;
        throw new Error('should have rejected');
      } catch (err) {
        expect(err).toBeInstanceOf(QueueCancelledError);
        expect((err as QueueCancelledError).sessionKey).toBe('key-a');
      }
    });

    it('does NOT abort the in-flight task', async () => {
      const { queue } = makeQueue();
      let inFlightCompleted = false;

      const { promise: hold, resolve: releaseHold } = deferred();

      const p1 = queue.enqueue('sess-iflight', async () => {
        await hold;
        inFlightCompleted = true;
      });

      await queue.cancel('sess-iflight');
      expect(inFlightCompleted).toBe(false); // still running

      releaseHold();
      await p1;
      expect(inFlightCompleted).toBe(true);
    });

    it('re-enqueue after cancel succeeds (cancelled flag clears after draining)', async () => {
      // Fix C: cancelledKeys is cleared after all pending tasks are rejected, so
      // the NEXT enqueue on the same key should succeed, not be rejected forever.
      const { queue } = makeQueue();
      let ran = false;

      await queue.cancel('sess-re-enqueue');

      // First enqueue after cancel: should succeed (flag was cleared by cancel)
      await queue.enqueue('sess-re-enqueue', async () => {
        ran = true;
      });

      expect(ran).toBe(true);
    });
  });

  // ── State inspection ────────────────────────────────────────────────────────

  describe('hasActive()', () => {
    it('returns false when no task is running', () => {
      const { queue } = makeQueue();
      expect(queue.hasActive('no-such-key')).toBe(false);
    });

    it('returns true while a task is executing', async () => {
      const { queue } = makeQueue();
      const { promise: hold, resolve } = deferred();

      const p = queue.enqueue('sess-active', async () => { await hold; });

      expect(queue.hasActive('sess-active')).toBe(true);

      resolve();
      await p;

      expect(queue.hasActive('sess-active')).toBe(false);
    });
  });

  describe('getPending()', () => {
    it('returns 0 when nothing is queued', () => {
      const { queue } = makeQueue();
      expect(queue.getPending('empty-key')).toBe(0);
    });

    it('returns the count of tasks waiting (not counting in-flight)', async () => {
      const { queue } = makeQueue();
      const { promise: hold, resolve } = deferred();

      const p1 = queue.enqueue('sess-p', async () => { await hold; });
      queue.enqueue('sess-p', async () => undefined).catch(() => undefined);
      queue.enqueue('sess-p', async () => undefined).catch(() => undefined);

      // 1 in-flight, 2 pending.
      expect(queue.getPending('sess-p')).toBe(2);
      expect(queue.hasActive('sess-p')).toBe(true);

      resolve();
      await p1;
    });
  });

  describe('getActiveKeys()', () => {
    it('returns empty array when no sessions are active', () => {
      const { queue } = makeQueue();
      expect(queue.getActiveKeys()).toEqual([]);
    });

    it('returns all sessionKeys currently processing', async () => {
      const { queue } = makeQueue();
      const { promise: h1, resolve: r1 } = deferred();
      const { promise: h2, resolve: r2 } = deferred();

      const p1 = queue.enqueue('alpha', async () => { await h1; });
      const p2 = queue.enqueue('beta', async () => { await h2; });

      await Promise.resolve(); // let microtasks settle

      const active = queue.getActiveKeys();
      expect(active).toContain('alpha');
      expect(active).toContain('beta');
      expect(active).toHaveLength(2);

      r1();
      r2();
      await Promise.all([p1, p2]);

      expect(queue.getActiveKeys()).toEqual([]);
    });
  });

  // ── Event emission ──────────────────────────────────────────────────────────

  describe('event bus emissions', () => {
    it('emits rqueue.enqueued when a task is enqueued', async () => {
      const { queue, emittedEvents } = makeQueue();

      await queue.enqueue('evt-key', async () => undefined);

      const enqueuedEvt = emittedEvents.find(
        (e) => e.channel === EVENT_CHANNELS.rqueue.enqueued,
      );
      expect(enqueuedEvt).toBeDefined();
      expect(enqueuedEvt?.payload).toMatchObject({ sessionKey: 'evt-key' });
    });

    it('emits rqueue.started when the task begins', async () => {
      const { queue, emittedEvents } = makeQueue();

      await queue.enqueue('evt-key', async () => undefined);

      expect(emittedEvents.some((e) => e.channel === EVENT_CHANNELS.rqueue.started)).toBe(true);
    });

    it('emits rqueue.completed when the task succeeds', async () => {
      const { queue, emittedEvents } = makeQueue();

      await queue.enqueue('evt-key', async () => undefined);

      expect(emittedEvents.some((e) => e.channel === EVENT_CHANNELS.rqueue.completed)).toBe(true);
    });

    it('emits rqueue.failed when the task throws', async () => {
      const { queue, emittedEvents } = makeQueue();

      await queue
        .enqueue('evt-key', async () => {
          throw new Error('fail');
        })
        .catch(() => undefined);

      expect(emittedEvents.some((e) => e.channel === EVENT_CHANNELS.rqueue.failed)).toBe(true);
    });

    it('emits rqueue.cancelled when cancel() is called', async () => {
      const { queue, emittedEvents } = makeQueue();

      await queue.cancel('evt-key');

      const cancelledEvt = emittedEvents.find(
        (e) => e.channel === EVENT_CHANNELS.rqueue.cancelled,
      );
      expect(cancelledEvt).toBeDefined();
      expect(cancelledEvt?.payload).toMatchObject({
        sessionKey: 'evt-key',
        rejectedCount: 0,
      });
    });

    it('emits events in the correct order: enqueued → started → completed', async () => {
      const { queue, emittedEvents } = makeQueue();

      await queue.enqueue('order-key', async () => undefined);

      const channels = emittedEvents.map((e) => e.channel);
      const enqueuedIdx = channels.indexOf(EVENT_CHANNELS.rqueue.enqueued);
      const startedIdx = channels.indexOf(EVENT_CHANNELS.rqueue.started);
      const completedIdx = channels.indexOf(EVENT_CHANNELS.rqueue.completed);

      expect(enqueuedIdx).toBeLessThan(startedIdx);
      expect(startedIdx).toBeLessThan(completedIdx);
    });

    it('rqueue.enqueued payload includes correct queueDepth for pending tasks', async () => {
      const { queue, emittedEvents } = makeQueue();
      const { promise: hold, resolve } = deferred();

      // Task 1 blocks; task 2 will be depth=1 in the pending queue (the blocked first
      // task is already removed from queue and is in-flight).
      const p1 = queue.enqueue('depth-key', async () => { await hold; });

      emittedEvents.length = 0; // clear after first enqueue
      const p2 = queue.enqueue('depth-key', async () => undefined);

      const secondEnqueue = emittedEvents.find(
        (e) => e.channel === EVENT_CHANNELS.rqueue.enqueued,
      );
      // After task-1 is in-flight (shifted off queue), task-2 arrives and queue depth = 1.
      expect(secondEnqueue?.payload).toMatchObject({ queueDepth: 1 });

      resolve();
      await Promise.all([p1, p2]);
    });

    it('rqueue.cancelled payload carries the number of rejected tasks', async () => {
      const { queue, emittedEvents } = makeQueue();
      const { promise: hold, resolve } = deferred();

      const p1 = queue.enqueue('cnt-key', async () => { await hold; });
      queue.enqueue('cnt-key', async () => undefined).catch(() => undefined);
      queue.enqueue('cnt-key', async () => undefined).catch(() => undefined);

      emittedEvents.length = 0;
      await queue.cancel('cnt-key');

      const cancelledEvt = emittedEvents.find(
        (e) => e.channel === EVENT_CHANNELS.rqueue.cancelled,
      );
      expect(cancelledEvt?.payload).toMatchObject({ rejectedCount: 2 });

      resolve();
      await p1;
    });
  });

  // ── Microtask ordering ──────────────────────────────────────────────────────

  describe('microtask ordering', () => {
    it('task enqueued during another task does not start until current resolves', async () => {
      const { queue } = makeQueue();
      const order: string[] = [];

      await queue.enqueue('micro-key', async () => {
        order.push('task1-start');
        // Enqueue task 2 from inside task 1 — it must NOT start before task 1 returns.
        const p2 = queue.enqueue('micro-key', async () => {
          order.push('task2-start');
        });
        order.push('task1-end');
        // Await task 2 inside task 1 would deadlock (FIFO: task 2 waits for task 1 to finish).
        // So we fire-and-forget and let the queue drain naturally.
        void p2;
      });

      // Let the queue drain completely.
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(order[0]).toBe('task1-start');
      expect(order[1]).toBe('task1-end');
      expect(order[2]).toBe('task2-start');
    });
  });

  // ── Memory cleanup ──────────────────────────────────────────────────────────

  describe('memory cleanup', () => {
    it('getActiveKeys() is empty after all queues drain', async () => {
      const { queue } = makeQueue();

      await queue.enqueue('clean-1', async () => undefined);
      await queue.enqueue('clean-2', async () => undefined);
      await queue.enqueue('clean-1', async () => undefined);

      expect(queue.getActiveKeys()).toEqual([]);
    });

    it('getPending() is zero after queue drains', async () => {
      const { queue } = makeQueue();

      await queue.enqueue('drain-1', async () => undefined);

      expect(queue.getPending('drain-1')).toBe(0);
    });

    it('hasActive() is false after queue drains', async () => {
      const { queue } = makeQueue();

      await queue.enqueue('drain-2', async () => undefined);

      expect(queue.hasActive('drain-2')).toBe(false);
    });

    it('does not accumulate stale entries across many sessions', async () => {
      const { queue } = makeQueue();

      // Run 10 different session keys.
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          queue.enqueue(`session-${i}`, async () => undefined),
        ),
      );

      expect(queue.getActiveKeys()).toEqual([]);
    });
  });

  // ── QueueCancelledError ─────────────────────────────────────────────────────

  describe('QueueCancelledError', () => {
    it('is a DomainError', async () => {
      const { queue } = makeQueue();
      const { promise: hold, resolve } = deferred();

      queue.enqueue('qce-key', async () => { await hold; }).catch(() => undefined);
      const pending = queue.enqueue('qce-key', async () => undefined);

      await queue.cancel('qce-key');
      resolve();

      const err = await pending.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(QueueCancelledError);
      // DomainError.code check
      expect((err as QueueCancelledError).code).toBe('QUEUE_CANCELLED_ERROR');
    });
  });
});
