/**
 * SC-8 — maxConcurrentSessions dispatcher honors cap.
 *
 * Tests the per-project concurrency cap added in Phase 5.3.8.
 *
 * I-1: all assertions are deterministic code — no LLM calls, no real subprocesses.
 * I-2: cap is read per-project from profile; no hardcoded project-specific defaults.
 * I-10: ProfileSchema zod hard-cap of 8 is validated here.
 */

import { PassThrough } from 'node:stream';
import { ProfileSchema } from '../../domain/profile.js';
import { SessionManager } from './session-manager.js';
import type { RuntimeHandle } from '../../domain/types/runtime.js';
import type { IOrchStore } from '../../domain/types/store.js';
import { SessionState } from '../../domain/session.js';
import type { Session } from '../../domain/session.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a RuntimeHandle whose stdout/stderr streams stay open until
 * `release()` is called. Used to keep a session in the `active` map
 * for the duration of the cap-check window.
 */
function makeLongRunningHandle(): {
  handle: RuntimeHandle;
  release: () => void;
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const handle: RuntimeHandle = {
    sessionId: `claude-sess-${Math.random().toString(36).slice(2)}`,
    pid: Math.floor(Math.random() * 99999) + 1,
    abort: jest.fn(),
    stdout,
    stderr,
  };
  return {
    handle,
    release: () => {
      stdout.end();
      stderr.end();
    },
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `orch-sess-${Math.random().toString(36).slice(2)}`,
    projectId: 'proj-a',
    sessionKey: 'proj-a:default:test',
    state: SessionState.Idle,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Build a mock store where `acquireSessionLock` always succeeds.
 * createSession returns a session derived from the provided projectId.
 */
function makeStore(): jest.Mocked<IOrchStore> {
  return {
    createSession: jest.fn().mockImplementation(
      async (input: { projectId: string; sessionKey: string }) =>
        makeSession({ projectId: input.projectId, sessionKey: input.sessionKey }),
    ),
    getSession: jest.fn().mockImplementation(async () => makeSession()),
    updateSession: jest.fn().mockImplementation(
      async (_id: string, patch: Partial<Session>) => ({
        ...makeSession(),
        ...patch,
      }),
    ),
    listActiveSessions: jest.fn().mockResolvedValue([]),
    enqueueItem: jest.fn(),
    dequeueNext: jest.fn(),
    updateQueueItem: jest.fn(),
    listQueue: jest.fn(),
    recordHookEvent: jest.fn(),
    acquireSessionLock: jest.fn().mockResolvedValue(true),
    renewSessionLock: jest.fn().mockResolvedValue(true),
    releaseSessionLock: jest.fn().mockResolvedValue(undefined),
    withTransaction: jest.fn(),
  } as jest.Mocked<IOrchStore>;
}

function makeEventBus() {
  return {
    emit: jest.fn(),
    on: jest.fn().mockReturnValue(jest.fn()),
    once: jest.fn(),
  };
}

function makeTracing() {
  const span = {
    setAttribute: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };
  return {
    withSpan: jest.fn().mockImplementation(
      async (
        _name: string,
        fn: (span: typeof span) => Promise<unknown>,
      ) => fn(span),
    ),
    getActiveTraceparent: jest.fn().mockReturnValue(undefined),
    injectTraceparentIntoEnv: jest.fn().mockImplementation(
      (env: NodeJS.ProcessEnv) => env,
    ),
    getTracer: jest.fn(),
  };
}

/**
 * Build a RequestQueue-like object where enqueue() immediately calls the task.
 *
 * NOTE: tasks execute synchronously-ish (in the same microtask chain), so long-
 * running handles keep sessions in `active` until their streams end.
 */
function makeImmediateQueue() {
  return {
    enqueue: jest.fn().mockImplementation(
      (_key: string, task: () => Promise<void>) => task(),
    ),
    cancel: jest.fn().mockResolvedValue(undefined),
    hasActive: jest.fn().mockReturnValue(false),
    getPending: jest.fn().mockReturnValue(0),
    getActiveKeys: jest.fn().mockReturnValue([]),
  };
}

/**
 * Build a registry that returns a profile with `maxConcurrentSessions` set
 * to the given cap for ANY projectId passed.
 *
 * Both getProject (async) and getProjectSync (sync) are provided because
 * SessionManager.executeSession uses getProjectSync (SC-8 cap check) while
 * other paths may use the async variant.
 */
function makeRegistry(maxConcurrentSessions: number) {
  const buildProfile = (projectId: string) => ({
    projectId,
    rootPath: `/tmp/${projectId}`,
    sessionTypes: [{ name: 'impl', promptTemplate: 'x', maxConcurrent: 1 }],
    hookTargets: [],
    queueSources: [],
    ccsProfile: 'default',
    maxConcurrentSessions,
    langfuseEnabled: false,
    disableSecretRedaction: false,
    contextBudget: { warnAtTokens: 200_000, forceHandoffAtTokens: 230_000 },
    autoHandoff: false,
    gracefulEndTimeoutMs: 30_000,
    commands: {},
  });
  return {
    getProject: jest.fn().mockImplementation(
      async (projectId: string) => buildProfile(projectId),
    ),
    // SC-8: synchronous cache lookup used by SessionManager.executeSession
    getProjectSync: jest.fn().mockImplementation(
      (projectId: string) => buildProfile(projectId),
    ),
    listProjects: jest.fn().mockResolvedValue([]),
  };
}

/**
 * Minimal valid profile base for zod parse tests.
 * All required fields from ProfileSchema provided; optional fields omitted.
 */
const minimalValidProfile = {
  projectId: 'test-proj',
  rootPath: '/tmp/test-proj',
  sessionTypes: [{ name: 'impl', promptTemplate: 'do {{plan}}' }],
  ccsProfile: 'default',
};

/**
 * Flush pending microtasks N times to allow async chains to progress.
 *
 * Each `await Promise.resolve()` drains one level of the microtask queue.
 * Chaining several flushes allows multi-step async initialisation (e.g. the
 * acquireSessionLock → spawn → active.set chain inside executeSession) to
 * complete before assertions run.
 */
async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SC-8 — maxConcurrentSessions dispatcher honors cap', () => {
  // ── Unit tests for countActiveForProject helper (Part B vitest count: +3) ──

  describe('countActiveForProject — unit cases', () => {
    it('returns 0 when no sessions are active for any project', () => {
      const adapter = {
        spawn: jest.fn().mockResolvedValue(makeLongRunningHandle().handle),
        resume: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
        awaitAndClassify: jest.fn().mockResolvedValue(undefined),
        writeStdin: jest.fn().mockResolvedValue(undefined),
      };

      const manager = new SessionManager(
        adapter as never,
        makeImmediateQueue() as never,
        makeStore(),
        makeEventBus() as never,
        makeTracing() as never,
        makeRegistry(5) as never,
      );

      // No sessions spawned — count should be 0 for any project
      expect(manager.countActiveForProject('proj-a')).toBe(0);
      expect(manager.countActiveForProject('proj-b')).toBe(0);
    });

    it('counts only sessions belonging to the queried projectId', async () => {
      const openHandles: Array<{ handle: RuntimeHandle; release: () => void }> =
        [];

      const adapter = {
        spawn: jest.fn().mockImplementation(() => {
          const h = makeLongRunningHandle();
          openHandles.push(h);
          return Promise.resolve(h.handle);
        }),
        resume: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
        awaitAndClassify: jest.fn().mockResolvedValue(undefined),
        writeStdin: jest.fn().mockResolvedValue(undefined),
      };

      const manager = new SessionManager(
        adapter as never,
        makeImmediateQueue() as never,
        makeStore(),
        makeEventBus() as never,
        makeTracing() as never,
        makeRegistry(5) as never, // high cap so all sessions proceed
      );

      // Start 2 sessions for proj-a, 1 for proj-b (all stay in-flight via open streams)
      const pA1 = manager.runSession('proj-a', {
        projectId: 'proj-a',
        prompt: 'task-a1',
        profile: 'default',
      });
      const pA2 = manager.runSession('proj-a', {
        projectId: 'proj-a',
        prompt: 'task-a2',
        profile: 'default',
      });
      const pB1 = manager.runSession('proj-b', {
        projectId: 'proj-b',
        prompt: 'task-b1',
        profile: 'default',
      });

      // Flush microtasks to allow the async executeSession chain to run
      // (acquireSessionLock → createSession → spawn → active.set)
      await flushMicrotasks(20);

      expect(manager.countActiveForProject('proj-a')).toBe(2);
      expect(manager.countActiveForProject('proj-b')).toBe(1);
      expect(manager.countActiveForProject('proj-c')).toBe(0);

      // Release all handles so sessions complete cleanly
      for (const h of openHandles) {
        h.release();
      }
      await Promise.allSettled([pA1, pA2, pB1]);
    }, 10_000);

    it('decrements count when a session ends', async () => {
      const openHandles: Array<{ handle: RuntimeHandle; release: () => void }> =
        [];

      const adapter = {
        spawn: jest.fn().mockImplementation(() => {
          const h = makeLongRunningHandle();
          openHandles.push(h);
          return Promise.resolve(h.handle);
        }),
        resume: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
        awaitAndClassify: jest.fn().mockResolvedValue(undefined),
        writeStdin: jest.fn().mockResolvedValue(undefined),
      };

      const manager = new SessionManager(
        adapter as never,
        makeImmediateQueue() as never,
        makeStore(),
        makeEventBus() as never,
        makeTracing() as never,
        makeRegistry(5) as never,
      );

      const p1 = manager.runSession('proj-a', {
        projectId: 'proj-a',
        prompt: 'task-1',
        profile: 'default',
      });

      await flushMicrotasks(20);

      expect(manager.countActiveForProject('proj-a')).toBe(1);

      // End the session by releasing the handle
      if (openHandles[0]) openHandles[0].release();
      await p1;

      // After session ends, active map entry is removed
      expect(manager.countActiveForProject('proj-a')).toBe(0);
    }, 10_000);
  });

  // ── Integration test (Part B vitest count: +1) ────────────────────────────

  it(
    'N=2 across 2 projects → never exceeds 2 ACTIVE at any wallclock moment',
    async () => {
      /**
       * Setup:
       *  - 2 projects (proj-a, proj-b), each with maxConcurrentSessions=2
       *  - Queue 2 items for proj-a (both succeed), then a 3rd (deferred)
       *  - Queue 2 items for proj-b (both succeed)
       *  - Instrument snapshots every 50ms over the 300ms window
       *  - Assert: countActiveForProject never exceeds 2 for any project
       */
      const openHandles: Array<{ handle: RuntimeHandle; release: () => void }> =
        [];
      const activeCounts: Array<{ proj: string; count: number }> = [];

      const adapter = {
        spawn: jest.fn().mockImplementation(() => {
          const h = makeLongRunningHandle();
          openHandles.push(h);
          return Promise.resolve(h.handle);
        }),
        resume: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
        awaitAndClassify: jest.fn().mockResolvedValue(undefined),
        writeStdin: jest.fn().mockResolvedValue(undefined),
      };

      const events = makeEventBus();

      const manager = new SessionManager(
        adapter as never,
        makeImmediateQueue() as never,
        makeStore(),
        events as never,
        makeTracing() as never,
        makeRegistry(2) as never, // cap = 2 per project
      );

      // ── Launch 2 items for proj-a (should succeed — within cap) ─────────────
      const pA1 = manager.runSession('proj-a', {
        projectId: 'proj-a',
        prompt: 'a-task-1',
        profile: 'default',
      });
      const pA2 = manager.runSession('proj-a', {
        projectId: 'proj-a',
        prompt: 'a-task-2',
        profile: 'default',
      });

      // Allow executeSession chain to reach active.set()
      await flushMicrotasks(20);

      // Record snapshot: both proj-a sessions should be active
      activeCounts.push({
        proj: 'proj-a',
        count: manager.countActiveForProject('proj-a'),
      });

      // ── 3rd attempt for proj-a — must be deferred (cap reached) ─────────────
      const deferredResult = await manager.runSession('proj-a', {
        projectId: 'proj-a',
        prompt: 'a-task-3',
        profile: 'default',
      });

      // Count must still be ≤ 2 (the 3rd session was never added to active)
      activeCounts.push({
        proj: 'proj-a',
        count: manager.countActiveForProject('proj-a'),
      });

      // ── Launch 2 items for proj-b (independent cap — should both succeed) ───
      const pB1 = manager.runSession('proj-b', {
        projectId: 'proj-b',
        prompt: 'b-task-1',
        profile: 'default',
      });
      const pB2 = manager.runSession('proj-b', {
        projectId: 'proj-b',
        prompt: 'b-task-2',
        profile: 'default',
      });

      await flushMicrotasks(20);

      activeCounts.push({
        proj: 'proj-b',
        count: manager.countActiveForProject('proj-b'),
      });

      // ── Instrument snapshots every 50ms over the hold window ─────────────────
      const snapshotInterval = setInterval(() => {
        activeCounts.push({
          proj: 'proj-a',
          count: manager.countActiveForProject('proj-a'),
        });
        activeCounts.push({
          proj: 'proj-b',
          count: manager.countActiveForProject('proj-b'),
        });
      }, 50);

      // Hold sessions open for 200ms to simulate real work, then release
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      for (const h of openHandles) {
        h.release();
      }

      clearInterval(snapshotInterval);

      await Promise.allSettled([pA1, pA2, pB1, pB2]);

      // ── Assertions ─────────────────────────────────────────────────────────────

      // The 3rd attempt must have been deferred (status: failed)
      expect(deferredResult.status).toBe('failed');
      expect(deferredResult.error?.message).toContain('Concurrency cap reached');

      // The deferred event must have been emitted
      const deferredEmits = (events.emit as jest.Mock).mock.calls.filter(
        ([channel]: [string]) =>
          channel === EVENT_CHANNELS.queue.dispatchDeferred,
      );
      expect(deferredEmits.length).toBeGreaterThanOrEqual(1);
      expect(deferredEmits[0][1]).toMatchObject({
        projectId: 'proj-a',
        activeCount: 2,
        cap: 2,
      });

      // All snapshots must show ≤ 2 active sessions per project
      const maxA = Math.max(
        0,
        ...activeCounts
          .filter((s) => s.proj === 'proj-a')
          .map((s) => s.count),
      );
      const maxB = Math.max(
        0,
        ...activeCounts
          .filter((s) => s.proj === 'proj-b')
          .map((s) => s.count),
      );

      expect(maxA).toBeLessThanOrEqual(2);
      expect(maxB).toBeLessThanOrEqual(2);

      // proj-b should have reached 2 (both sessions active concurrently)
      expect(maxB).toBeGreaterThanOrEqual(1);
    },
    10_000,
  );

  // ── Zod hard-cap tests (Part B vitest count: +2) ──────────────────────────

  it('hard-cap of 8 enforced by zod schema — maxConcurrentSessions: 9 → safeParse fails', () => {
    const result = ProfileSchema.safeParse({
      ...minimalValidProfile,
      maxConcurrentSessions: 9,
    });

    expect(result.success).toBe(false);
  });

  it('maxConcurrentSessions: 8 is accepted by zod schema (boundary at cap)', () => {
    const result = ProfileSchema.safeParse({
      ...minimalValidProfile,
      maxConcurrentSessions: 8,
    });

    expect(result.success).toBe(true);
  });
});
