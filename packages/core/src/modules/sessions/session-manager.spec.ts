/**
 * SessionManager unit tests.
 *
 * I-13: Adapter, store, queue (or real), events, and tracing are mocked — no real subprocess.
 * I-11: Verifies events are emitted on every lifecycle transition.
 * I-12: Verifies DomainError subclasses (SessionLockHeldError, RateLimitError, etc.).
 *
 * Strategy for "in-flight" tests:
 *   Use a real queue + adapter whose streams never end (passthrough that we control),
 *   so the session stays in the active map while we assert state.
 */

import * as nodeCrypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import { Readable } from 'node:stream';
import type { RuntimeHandle } from '../../domain/types/runtime.js';
import { parseProfile } from '../../domain/profile.js';
import {
  ContextFullError,
  RateLimitError,
  RuntimeSpawnError,
  SessionLockHeldError,
} from '../../domain/errors.js';
import { SessionState } from '../../domain/session.js';
import type { Session } from '../../domain/session.js';
import type { IOrchStore } from '../../domain/types/store.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { SessionManager } from './session-manager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a Readable that immediately ends (for sessions that complete instantly). */
function makeEndedReadable(content = ''): Readable {
  const r = new Readable({ read() {} });
  if (content) r.push(content);
  r.push(null);
  return r;
}

/**
 * Create a handle whose streams stay open until `release()` is called.
 * Used for testing "in-flight" session state.
 */
function makePendingHandle(): {
  handle: RuntimeHandle;
  releaseStreams: () => void;
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return {
    handle: {
      sessionId: 'claude-sess-pending',
      pid: 99999,
      abort: jest.fn(),
      stdout,
      stderr,
    },
    releaseStreams: () => {
      stdout.end();
      stderr.end();
    },
  };
}

/** Create an immediately-finishing handle. */
function makeFinishedHandle(): RuntimeHandle {
  return {
    sessionId: 'claude-sess-done',
    pid: 12345,
    abort: jest.fn(),
    stdout: makeEndedReadable(),
    stderr: makeEndedReadable(),
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'orch-sess-1',
    projectId: 'proj-1',
    sessionKey: 'proj-1:default:do something',
    state: SessionState.Idle,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeStore(overrides: Partial<IOrchStore> = {}): jest.Mocked<IOrchStore> {
  const session = makeSession();
  return {
    createSession: jest.fn().mockResolvedValue(session),
    getSession: jest.fn().mockResolvedValue(session),
    updateSession: jest.fn().mockImplementation(
      async (_id: string, patch: Partial<Session>) => ({ ...session, ...patch }),
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
    ...overrides,
  } as jest.Mocked<IOrchStore>;
}

function makeEventBus() {
  return {
    emit: jest.fn(),
    on: jest.fn().mockReturnValue(jest.fn()),
    once: jest.fn(),
  };
}

function makeSpan() {
  return {
    setAttribute: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };
}

function makeTracing() {
  const span = makeSpan();
  return {
    withSpan: jest.fn().mockImplementation(
      async (_name: string, fn: (span: ReturnType<typeof makeSpan>) => Promise<unknown>) => fn(span),
    ),
    getActiveTraceparent: jest.fn().mockReturnValue(undefined),
    injectTraceparentIntoEnv: jest.fn().mockImplementation(
      (env: NodeJS.ProcessEnv) => env,
    ),
    getTracer: jest.fn(),
    _span: span, // exposed for assertions
  };
}

/** Create a real queue-like object that immediately calls the task. */
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

function makeRegistry(projectProfile?: Partial<import('../../domain/profile.js').Profile>) {
  const profile =
    projectProfile !== undefined
      ? {
          projectId: 'proj-1',
          rootPath: '/tmp/proj-1',
          sessionTypes: [{ name: 'impl', promptTemplate: 'x', maxConcurrent: 1 }],
          hookTargets: [],
          queueSources: [],
          ccsProfile: 'default',
          maxConcurrentSessions: 1,
          langfuseEnabled: false,
          disableSecretRedaction: false,
          contextBudget: { warnAtTokens: 200_000, forceHandoffAtTokens: 230_000 },
          autoHandoff: false,
          gracefulEndTimeoutMs: 30_000,
          commands: {},
          ...projectProfile,
        }
      : undefined;
  return {
    getProject: jest.fn().mockResolvedValue(profile),
    // SC-8: synchronous cache lookup used by SessionManager.executeSession
    getProjectSync: jest.fn().mockReturnValue(profile),
    listProjects: jest.fn().mockResolvedValue([]),
  };
}

function makeManager(options: {
  store?: jest.Mocked<IOrchStore>;
  events?: ReturnType<typeof makeEventBus>;
  tracing?: ReturnType<typeof makeTracing>;
  registry?: ReturnType<typeof makeRegistry>;
} = {}) {
  // Spawn always returns a FRESH handle (fresh streams) on each call.
  // awaitAndClassify defaults to clean exit (resolves void) — override per-test
  // to simulate rate-limit / context-full post-spawn exits.
  const adapter = {
    spawn: jest.fn().mockImplementation(() => Promise.resolve(makeFinishedHandle())),
    resume: jest.fn().mockImplementation(() => Promise.resolve(makeFinishedHandle())),
    terminate: jest.fn().mockResolvedValue(undefined),
    awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    writeStdin: jest.fn().mockResolvedValue(undefined),
  };

  const queue = makeImmediateQueue();
  const store = options.store ?? makeStore();
  const events = options.events ?? makeEventBus();
  const tracing = options.tracing ?? makeTracing();
  const registry = options.registry ?? makeRegistry();

  const manager = new SessionManager(
    adapter as never,
    queue as never,
    store,
    events as never,
    tracing as never,
    registry as never,
  );

  return { manager, adapter, queue, store, events, tracing, registry };
}

const basePlan = {
  projectId: 'proj-1',
  prompt: 'do something',
  profile: 'default',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionManager — runSession happy path', () => {
  it('spawns via adapter and emits session.started + session.ended on completion', async () => {
    const { manager, adapter, events } = makeManager();

    const result = await manager.runSession('proj-1', basePlan);

    expect(adapter.spawn).toHaveBeenCalledTimes(1);
    expect(adapter.resume).not.toHaveBeenCalled();

    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.started,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.ended,
      expect.objectContaining({ session: expect.any(Object) }),
    );

    expect(result.status).toBe('ended');
  });

  it('acquires and releases DB lock on successful run', async () => {
    const { manager, store } = makeManager();

    await manager.runSession('proj-1', basePlan);

    expect(store.acquireSessionLock).toHaveBeenCalledTimes(1);
    expect(store.releaseSessionLock).toHaveBeenCalledTimes(1);
  });

  it('creates a DB session record', async () => {
    const { manager, store } = makeManager();

    await manager.runSession('proj-1', basePlan);

    expect(store.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1' }),
    );
  });

  it('active map is empty after session completes normally', async () => {
    const { manager } = makeManager();

    await manager.runSession('proj-1', basePlan);

    expect(manager.getActive()).toHaveLength(0);
    expect(manager.getActiveSessions()).toHaveLength(0);
  });
});

describe('SessionManager — runSession with resumeSessionId', () => {
  it('calls adapter.resume instead of spawn when resumeSessionId is set', async () => {
    const { manager, adapter } = makeManager();

    await manager.runSession('proj-1', {
      ...basePlan,
      resumeSessionId: 'default/claude-abc-123',
    });

    expect(adapter.resume).toHaveBeenCalledWith('default/claude-abc-123', basePlan.prompt);
    expect(adapter.spawn).not.toHaveBeenCalled();
  });
});

describe('SessionManager — wake-dedup', () => {
  it('returns existing promise for same sessionKey when in-flight', async () => {
    // Use a custom queue that records the call but returns a controllable promise
    let resolveQueueTask!: () => void;
    const blockingPromise = new Promise<void>((res) => { resolveQueueTask = res; });

    const queue = {
      enqueue: jest.fn()
        .mockReturnValueOnce(blockingPromise)   // first call: returns in-flight
        .mockReturnValue(Promise.resolve()),    // second call (should not happen)
      cancel: jest.fn().mockResolvedValue(undefined),
      hasActive: jest.fn().mockReturnValue(true),
      getPending: jest.fn().mockReturnValue(0),
      getActiveKeys: jest.fn().mockReturnValue([]),
    };

    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(makeFinishedHandle()),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    // Both calls happen before the first resolves
    const p1 = manager.runSession('proj-1', basePlan);
    const p2 = manager.runSession('proj-1', basePlan);

    // Wake-dedup: same promise reference
    expect(p1).toBe(p2);

    // Resolve the blocking promise
    resolveQueueTask();
    await p1;

    // Queue was only called once
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('clears wake-dedup entry after completion so second call re-enqueues', async () => {
    const { manager, adapter } = makeManager();

    await manager.runSession('proj-1', basePlan);
    await manager.runSession('proj-1', basePlan);

    // Two independent runs
    expect(adapter.spawn).toHaveBeenCalledTimes(2);
  });
});

describe('SessionManager — DB lock held', () => {
  it('throws SessionLockHeldError when DB lock cannot be acquired', async () => {
    const store = makeStore({
      acquireSessionLock: jest.fn().mockResolvedValue(false),
    });
    const { manager } = makeManager({ store });

    await expect(manager.runSession('proj-1', basePlan)).rejects.toThrow(
      SessionLockHeldError,
    );
  });

  it('does not release lock when lock was never acquired', async () => {
    const store = makeStore({
      acquireSessionLock: jest.fn().mockResolvedValue(false),
    });
    const { manager } = makeManager({ store });

    await manager.runSession('proj-1', basePlan).catch(() => {/* expected */});

    expect(store.releaseSessionLock).not.toHaveBeenCalled();
  });
});

describe('SessionManager — cancelSession', () => {
  it('cancelSession on unknown key is a no-op (no throw)', async () => {
    const { manager } = makeManager();
    await expect(manager.cancelSession('does-not-exist')).resolves.toBeUndefined();
  });

  it('cancelSession aborts handle and releases lock for active session', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();
    const abort = pendingHandle.abort as jest.Mock;

    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    // Start the session — it will block on stream completion
    const runPromise = manager.runSession('proj-1', basePlan);

    // Flush microtask queue until executeSession reaches active.set()
    // (acquireLock + createSession + withSpan + spawn ≈ 6 awaits deep)
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Determine sessionKey to cancel
    const activeSessions = manager.getActiveSessions();
    expect(activeSessions).toHaveLength(1);
    const { sessionKey } = activeSessions[0];

    // Cancel by key
    await manager.cancelSession(sessionKey);

    // Release streams so runPromise can settle
    releaseStreams();
    await runPromise.catch(() => {/* may fail after cancel */});

    expect(abort).toHaveBeenCalled();
    expect(store.releaseSessionLock).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.ended,
      expect.any(Object),
    );
  });
});

describe('SessionManager — terminate(sessionId)', () => {
  it('terminate is idempotent — call on unknown id is a no-op', async () => {
    const { manager } = makeManager();

    await expect(manager.terminate('non-existent-id', 'reason')).resolves.toBeUndefined();
    await expect(manager.terminate('non-existent-id', 'reason')).resolves.toBeUndefined();
  });

  it('terminate aborts and emits session.ended for active session', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();
    const abort = pendingHandle.abort as jest.Mock;

    const session = makeSession({ id: 'orch-target-sess' });
    const queue = makeImmediateQueue();
    const store = makeStore({
      createSession: jest.fn().mockResolvedValue(session),
      getSession: jest.fn().mockResolvedValue(session),
    });
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    // Start session and let it block
    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Terminate by sessionId
    await manager.terminate('orch-target-sess', 'watchdog-kill');

    releaseStreams();
    await runPromise.catch(() => {/* ok */});

    expect(abort).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.ended,
      expect.objectContaining({ endReason: 'watchdog-kill' }),
    );
  });
});

describe('SessionManager — getActive() WatchdogSession mapping', () => {
  it('returns WatchdogSession[] with numeric startedAt while session in-flight', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();

    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const active = manager.getActive();

    expect(active).toHaveLength(1);
    expect(typeof active[0].startedAt).toBe('number');
    expect(active[0].startedAt).toBeGreaterThan(0);
    expect(active[0].lastHeartbeatAt).toBeNull();
    expect(active[0].state).toBe(SessionState.Running);

    releaseStreams();
    await runPromise;
  });

  it('returns empty array when no sessions active', () => {
    const { manager } = makeManager();
    expect(manager.getActive()).toHaveLength(0);
  });
});

describe('SessionManager — getActiveSessions()', () => {
  it('returns ActiveSession[] with all expected fields', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();

    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessions = manager.getActiveSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      projectId: 'proj-1',
      startedAt: expect.any(Number),
      lastHeartbeatAt: null,
    });

    releaseStreams();
    await runPromise;
  });
});

describe('SessionManager — recordHeartbeat', () => {
  it('updates lastHeartbeatAt for active session', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();

    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessions = manager.getActiveSessions();
    expect(sessions).toHaveLength(1);
    const { sessionKey } = sessions[0];

    // Before heartbeat
    expect(manager.getActive()[0].lastHeartbeatAt).toBeNull();

    // Record heartbeat
    const heartbeatTime = Date.now();
    manager.recordHeartbeat(sessionKey, heartbeatTime);

    // After heartbeat
    expect(manager.getActive()[0].lastHeartbeatAt).toBe(heartbeatTime);

    releaseStreams();
    await runPromise;
  });

  it('recordHeartbeat on unknown key is a no-op (no throw)', () => {
    const { manager } = makeManager();
    expect(() => manager.recordHeartbeat('unknown-key', Date.now())).not.toThrow();
  });
});

describe('SessionManager — error cases', () => {
  it('RateLimitError → session.rate-limited event emitted, result status rate-limited', async () => {
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockRejectedValue(new RateLimitError('rate limit hit')),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const result = await manager.runSession('proj-1', basePlan);

    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.rateLimited,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(result.status).toBe('rate-limited');
  });

  it('ContextFullError → session.context-full event emitted', async () => {
    const adapter = {
      spawn: jest.fn().mockRejectedValue(new ContextFullError('context full')),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      makeStore(),
      makeEventBus() as never,
      makeTracing() as never,
      makeRegistry() as never,
    );

    const result = await manager.runSession('proj-1', basePlan);

    const emitCalls = (result as { status: string });
    expect(emitCalls.status).toBe('context-full');
  });

  it('ContextFullError → session.context-full event emitted via events', async () => {
    const events = makeEventBus();
    const adapter = {
      spawn: jest.fn().mockRejectedValue(new ContextFullError('context full')),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      makeStore(),
      events as never,
      makeTracing() as never,
      makeRegistry() as never,
    );

    await manager.runSession('proj-1', basePlan);

    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.contextFull,
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  it('RuntimeSpawnError → session.failed event emitted', async () => {
    const events = makeEventBus();
    const adapter = {
      spawn: jest.fn().mockRejectedValue(new RuntimeSpawnError('binary not found')),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      makeStore(),
      events as never,
      makeTracing() as never,
      makeRegistry() as never,
    );

    const result = await manager.runSession('proj-1', basePlan);

    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.failed,
      expect.objectContaining({ session: expect.any(Object), error: expect.any(Error) }),
    );
    expect(result.status).toBe('failed');
  });

  it('lock is released in error path (finally)', async () => {
    const store = makeStore();
    const adapter = {
      spawn: jest.fn().mockRejectedValue(new Error('unexpected crash')),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      store,
      makeEventBus() as never,
      makeTracing() as never,
      makeRegistry() as never,
    );

    await manager.runSession('proj-1', basePlan);

    expect(store.releaseSessionLock).toHaveBeenCalledTimes(1);
  });

  it('lock is released when createSession throws (DB error after lock acquired)', async () => {
    const store = makeStore({
      createSession: jest.fn().mockRejectedValue(new Error('DB unique violation')),
    });
    const adapter = {
      spawn: jest.fn(),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      store,
      makeEventBus() as never,
      makeTracing() as never,
      makeRegistry() as never,
    );

    await manager.runSession('proj-1', basePlan);

    // Lock was acquired, so it must be released despite createSession failing
    expect(store.acquireSessionLock).toHaveBeenCalledTimes(1);
    expect(store.releaseSessionLock).toHaveBeenCalledTimes(1);
    // spawn was never called (createSession failed before it)
    expect(adapter.spawn).not.toHaveBeenCalled();
  });

  it('RateLimitError with retryAfterSecs included in event', async () => {
    const events = makeEventBus();
    const adapter = {
      spawn: jest.fn().mockRejectedValue(
        new RateLimitError('rate limit', { retryAfterSecs: 60 }),
      ),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      makeStore(),
      events as never,
      makeTracing() as never,
      makeRegistry() as never,
    );

    await manager.runSession('proj-1', basePlan);

    const rateLimitedCall = (events.emit as jest.Mock).mock.calls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.rateLimited,
    );
    expect(rateLimitedCall).toBeDefined();
    expect(rateLimitedCall[1]).toMatchObject({ retryAfterSecs: 60 });
  });
});

describe('SessionManager — concurrent different keys', () => {
  it('two different sessionKeys run concurrently without interference', async () => {
    const { manager, adapter } = makeManager();

    // Two plans with distinct keys (different profile or prompt)
    const plan1 = { ...basePlan, prompt: 'task-one' };
    const plan2 = { ...basePlan, prompt: 'task-two', profile: 'alt' };

    await Promise.all([
      manager.runSession('proj-1', plan1),
      manager.runSession('proj-1', plan2),
    ]);

    // Both were spawned independently
    expect(adapter.spawn).toHaveBeenCalledTimes(2);
  });
});

describe('SessionManager — ISessionRegistry contract', () => {
  it('active sessions removed from getActive() after session ends', async () => {
    const { manager } = makeManager();

    await manager.runSession('proj-1', basePlan);

    expect(manager.getActive()).toHaveLength(0);
    expect(manager.getActiveSessions()).toHaveLength(0);
  });
});

describe('SessionManager — errors.ts SessionLockHeldError', () => {
  it('SessionLockHeldError has correct code and sessionKey', () => {
    const err = new SessionLockHeldError('my-session-key');
    expect(err.code).toBe('SESSION_LOCK_HELD');
    expect(err.sessionKey).toBe('my-session-key');
    expect(err.message).toContain('my-session-key');
    expect(err instanceof Error).toBe(true);
  });

  it('SessionLockHeldError instanceof check works correctly', () => {
    const err = new SessionLockHeldError('key-123');
    expect(err instanceof SessionLockHeldError).toBe(true);
  });
});

// ── Fix A: Post-spawn exit classification ─────────────────────────────────────
//
// Tests verify that when awaitAndClassify throws a typed DomainError (simulating
// a post-spawn rate-limit or context-full), the session ends with the correct DB
// state and event — not silently as 'Ended'.

describe('SessionManager — post-spawn exit classification (Fix A)', () => {
  it('post-spawn rate-limit exit → DB RateLimited + session.rate-limited event', async () => {
    const store = makeStore();
    const events = makeEventBus();
    const queue = makeImmediateQueue();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockImplementation(() => Promise.resolve(makeFinishedHandle())),
      resume: jest.fn(),
      terminate: jest.fn(),
      // Simulate subprocess exiting with rate-limit signal after streams drain
      awaitAndClassify: jest
        .fn()
        .mockRejectedValue(new RateLimitError('rate limit hit post-spawn')),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const result = await manager.runSession('proj-1', basePlan);

    // Session result must reflect rate-limited status
    expect(result.status).toBe('rate-limited');

    // DB state must be RateLimited (not Ended)
    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const stateUpdate = updateCalls.find(
      ([, patch]: [string, Partial<{ state: string }>]) =>
        patch.state === SessionState.RateLimited,
    );
    expect(stateUpdate).toBeDefined();

    // Event must be session.rate-limited (not session.ended)
    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.rateLimited,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      EVENT_CHANNELS.session.ended,
      expect.any(Object),
    );
  });

  it('post-spawn context-full exit → DB ContextFull + session.context-full event', async () => {
    const store = makeStore();
    const events = makeEventBus();
    const queue = makeImmediateQueue();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockImplementation(() => Promise.resolve(makeFinishedHandle())),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest
        .fn()
        .mockRejectedValue(new ContextFullError('context window exhausted post-spawn')),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const result = await manager.runSession('proj-1', basePlan);

    expect(result.status).toBe('context-full');

    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const stateUpdate = updateCalls.find(
      ([, patch]: [string, Partial<{ state: string }>]) =>
        patch.state === SessionState.ContextFull,
    );
    expect(stateUpdate).toBeDefined();

    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.contextFull,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      EVENT_CHANNELS.session.ended,
      expect.any(Object),
    );
  });

  it('post-spawn clean exit (code 0) → DB Ended + session.ended event', async () => {
    const store = makeStore();
    const events = makeEventBus();
    const queue = makeImmediateQueue();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockImplementation(() => Promise.resolve(makeFinishedHandle())),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined), // clean exit
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    const result = await manager.runSession('proj-1', basePlan);

    expect(result.status).toBe('ended');

    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const stateUpdate = updateCalls.find(
      ([, patch]: [string, Partial<{ state: string; endReason: string }>]) =>
        patch.state === SessionState.Ended && patch.endReason === 'process_exit',
    );
    expect(stateUpdate).toBeDefined();

    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.ended,
      expect.objectContaining({ endReason: 'process_exit' }),
    );
  });
});

// ── Task 3.0 — Carryover #2: Tracing span PII — session.key must be redacted ──

describe('SessionManager — span attribute session.key is redacted (Task 3.0)', () => {
  it('withSpan receives redacted session.key, not the raw sessionKey', async () => {
    const { manager, tracing } = makeManager();

    // basePlan drives the sessionKey: 'proj-1:default:do something'
    const rawKey = 'proj-1:default:do something';
    await manager.runSession('proj-1', basePlan);

    // Locate the withSpan call for session.spawn (the one that carries session.key)
    const withSpanCalls = (tracing.withSpan as jest.Mock).mock.calls as [
      string,
      unknown,
      Record<string, unknown>,
    ][];
    const spawnCall = withSpanCalls.find(([name]) =>
      name === 'session.spawn' || name === 'session.resume',
    );

    expect(spawnCall).toBeDefined();
    const attrs = spawnCall![2];

    // The raw key must NOT appear in the span attribute
    expect(attrs['session.key']).not.toBe(rawKey);

    // The value must match the redacted form produced by redactSessionKey():
    // sha256(raw).hex.slice(0, 12)
    const expected = nodeCrypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex')
      .slice(0, 12);
    expect(attrs['session.key']).toBe(expected);
  });
});

// ── Fix B: onModuleDestroy ────────────────────────────────────────────────────

describe('SessionManager — onModuleDestroy (Fix B)', () => {
  it('aborts all active sessions, updates DB to Failed, releases locks, clears active map', async () => {
    // Set up 2 simultaneous in-flight sessions
    const { handle: handle1, releaseStreams: release1 } = makePendingHandle();
    const { handle: handle2, releaseStreams: release2 } = makePendingHandle();

    const abort1 = handle1.abort as jest.Mock;
    const abort2 = handle2.abort as jest.Mock;

    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    let spawnCount = 0;
    const adapter = {
      spawn: jest.fn().mockImplementation(() => {
        spawnCount++;
        return Promise.resolve(spawnCount === 1 ? handle1 : handle2);
      }),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const queue = makeImmediateQueue();
    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    // Start two sessions with different keys (different prompts)
    const run1 = manager.runSession('proj-1', { ...basePlan, prompt: 'task-alpha' });
    const run2 = manager.runSession('proj-1', { ...basePlan, prompt: 'task-beta' });

    // Let them progress to the active map
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(manager.getActiveSessions()).toHaveLength(2);

    // Trigger graceful shutdown
    await manager.onModuleDestroy();

    // Both handles aborted
    expect(abort1).toHaveBeenCalled();
    expect(abort2).toHaveBeenCalled();

    // DB updated to Failed with daemon_shutdown for both sessions
    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const shutdownUpdates = updateCalls.filter(
      ([, patch]: [string, Partial<{ endReason: string }>]) =>
        patch.endReason === 'daemon_shutdown',
    );
    expect(shutdownUpdates).toHaveLength(2);

    // Locks released (at least once per session from onModuleDestroy;
    // executeSession's finally may add more calls after streams drain)
    expect(store.releaseSessionLock).toHaveBeenCalled();

    // Active map cleared immediately by onModuleDestroy
    expect(manager.getActiveSessions()).toHaveLength(0);

    // Release streams so the dangling run promises can settle (test cleanup)
    release1();
    release2();
    await Promise.allSettled([run1, run2]);
  });
});

// ── Fix D: No double session.ended emission ───────────────────────────────────

describe('SessionManager — double session.ended prevention (Fix D)', () => {
  it('cancelSession mid-stream emits session.ended exactly once with reason user_cancel', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();

    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      makeRegistry() as never,
    );

    // Start session and wait until it is in-flight
    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const activeSessions = manager.getActiveSessions();
    expect(activeSessions).toHaveLength(1);
    const { sessionKey } = activeSessions[0];

    // Cancel mid-stream — this calls _terminateInternal which sets terminating=true
    await manager.cancelSession(sessionKey);

    // Release streams so _awaitHandleCompletion can resolve
    releaseStreams();
    await runPromise.catch(() => {/* cancelled sessions may reject */});

    // session.ended must be emitted exactly once (by _terminateInternal, not again by executeSession)
    const endedEmits = (events.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.ended,
    );
    expect(endedEmits).toHaveLength(1);
    expect(endedEmits[0][1]).toMatchObject({ endReason: 'user_cancel' });
  });
});

// ── Task 3.3: Graceful Session End tests ─────────────────────────────────────

describe('SessionManager — handleForceHandoff (autoHandoff=false, default)', () => {
  it('emits session.handoffPending and does NOT terminate when autoHandoff=false', async () => {
    // Registry returns a profile with autoHandoff=false (default)
    const registry = makeRegistry({ autoHandoff: false });
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn(),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    // Start session and wait until active
    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const activeSessions = manager.getActiveSessions();
    expect(activeSessions).toHaveLength(1);

    // Simulate forceHandoff event (as ContextBudgetService would emit)
    const forceHandoffPayload = {
      sessionKey: activeSessions[0].sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    };

    // Trigger via the on() mock — get the registered callback and call it
    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: typeof forceHandoffPayload) => void) | undefined;
    expect(handoffCb).toBeDefined();

    await handoffCb!(forceHandoffPayload);

    // Should emit handoffPending — NOT terminate
    expect(adapter.terminate).not.toHaveBeenCalled();
    expect(adapter.writeStdin).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.handoffPending,
      expect.objectContaining({
        sessionKey: activeSessions[0].sessionKey,
        sessionId: expect.any(String),
        projectId: 'proj-1',
        currentTokens: 235_000,
      }),
    );

    // Clean up
    releaseStreams();
    await runPromise.catch(() => {/* ok */});
  });
});

/** Helper: wait N ms using real timers (works independently of fake-timer state). */
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

describe('SessionManager — handleForceHandoff (autoHandoff=true, graceful path)', () => {
  it('writes slash-command and emits session.ended with reason CONTEXT_FULL when process exits within timeout', async () => {
    const { handle: pendingHandle, releaseStreams } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockResolvedValue(undefined),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockImplementation(async () => {
        // Simulate process exit after receiving stdin command
        setImmediate(() => releaseStreams());
      }),
    };
    const registry = makeRegistry({
      autoHandoff: true,
      gracefulEndTimeoutMs: 2_000,
      commands: { sessionEnd: '/session-end' },
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const activeSessions = manager.getActiveSessions();
    const sessionKey = activeSessions[0].sessionKey;

    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;
    expect(handoffCb).toBeDefined();

    // Start graceful end — writeStdin mock will emit stdout.end() via nextTick
    const gracefulPromise = handoffCb!({
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });

    await gracefulPromise;
    await runPromise.catch(() => {/* ok */});

    // Verify slash-command was written to stdin
    expect(adapter.writeStdin).toHaveBeenCalledWith(
      pendingHandle,
      '/session-end\n',
    );

    // Check session.ended was emitted with CONTEXT_FULL reason
    const endedCalls = (events.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.ended,
    );
    const contextFullEnded = endedCalls.find(
      ([, payload]: [string, { endReason?: string }]) =>
        payload.endReason === 'CONTEXT_FULL',
    );
    expect(contextFullEnded).toBeDefined();

    // terminate() must NOT have been called (process exited naturally)
    expect(adapter.terminate).not.toHaveBeenCalled();
  }, 10_000);

  it('escalates to SIGTERM→SIGKILL (adapter.terminate) on gracefulEndTimeout', async () => {
    const { handle: pendingHandle, releaseStreams: releaseStreamsTimeout } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockImplementation(async () => {
        // Simulate process exit after SIGTERM/SIGKILL: end the streams
        setImmediate(() => releaseStreamsTimeout());
      }),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      // writeStdin does NOT emit end — simulating unresponsive process
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };
    const registry = makeRegistry({
      autoHandoff: true,
      // Very short timeout so the test doesn't take long
      gracefulEndTimeoutMs: 50,
      commands: { sessionEnd: '/session-end' },
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessionKey = manager.getActiveSessions()[0].sessionKey;

    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    const gracefulPromise = handoffCb!({
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });

    // Wait for the 50ms timeout to fire
    await waitMs(100);
    await gracefulPromise;
    await runPromise.catch(() => {/* ok */});

    // adapter.terminate must have been called with 'context_full'
    expect(adapter.terminate).toHaveBeenCalledWith(
      pendingHandle,
      'context_full',
    );

    // session.ended emitted with CONTEXT_FULL_FORCED reason
    const endedCalls = (events.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.ended,
    );
    const forcedEnded = endedCalls.find(
      ([, payload]: [string, { endReason?: string }]) =>
        payload.endReason === 'CONTEXT_FULL_FORCED',
    );
    expect(forcedEnded).toBeDefined();
  }, 10_000);

  it('proceeds without stdin write when no sessionEnd command is configured', async () => {
    const { handle: pendingHandle, releaseStreams: releaseStreamsNoCmd } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockImplementation(async () => {
        setImmediate(() => releaseStreamsNoCmd());
      }),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };
    // No commands.sessionEnd; short timeout so the test completes quickly
    const registry = makeRegistry({
      autoHandoff: true,
      gracefulEndTimeoutMs: 50,
      commands: {},
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessionKey = manager.getActiveSessions()[0].sessionKey;
    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    const gracefulPromise = handoffCb!({
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });

    // Wait for the 50ms timeout to fire
    await waitMs(100);
    await gracefulPromise;
    await runPromise.catch(() => {/* ok */});

    // writeStdin must NOT have been called (no command configured)
    expect(adapter.writeStdin).not.toHaveBeenCalled();
  }, 10_000);

  it('is a no-op when sessionKey is not in active map', async () => {
    const registry = makeRegistry({ autoHandoff: true });
    const { manager, adapter, events } = makeManager({ registry });
    manager.onModuleInit();

    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    // No session is active — should be a no-op
    await handoffCb!({
      sessionKey: 'ghost:key:xyz',
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });

    expect(adapter.terminate).not.toHaveBeenCalled();
    expect(adapter.writeStdin).not.toHaveBeenCalled();
  });

  it('does not double-terminate when terminating flag is already true', async () => {
    const { handle: pendingHandle, releaseStreams: releaseStreamsDbl } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockImplementation(async () => {
        setImmediate(() => releaseStreamsDbl());
      }),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };
    const registry = makeRegistry({
      autoHandoff: true,
      gracefulEndTimeoutMs: 50,
      commands: { sessionEnd: '/session-end' },
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessionKey = manager.getActiveSessions()[0].sessionKey;
    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    const payload = {
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    };

    // Call twice — second should be no-op because terminating=true
    const p1 = handoffCb!(payload);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const p2 = handoffCb!(payload);

    // Wait for the 50ms timeout to fire for p1
    await waitMs(100);
    await Promise.all([p1, p2]);
    await runPromise.catch(() => {/* ok */});

    // terminate should only be called once despite two handoff events
    expect(adapter.terminate).toHaveBeenCalledTimes(1);
  }, 10_000);
});

describe('SessionManager — onModuleInit subscribes to forceHandoff', () => {
  it('subscribes to session.force-handoff on init', () => {
    const { manager, events } = makeManager();
    manager.onModuleInit();

    const onCalls = (events.on as jest.Mock).mock.calls;
    const subscribed = onCalls.some(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    );
    expect(subscribed).toBe(true);
  });
});

describe('SessionManager — state machine: ENDING state', () => {
  it('updates DB to Ending state before final ENDED transition', async () => {
    const { handle: pendingHandle, releaseStreams: rsEnding } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockImplementation(async () => {
        setImmediate(() => rsEnding());
      }),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };
    const registry = makeRegistry({
      autoHandoff: true,
      gracefulEndTimeoutMs: 50,
      commands: {},
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessionKey = manager.getActiveSessions()[0].sessionKey;
    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    const gracefulPromise = handoffCb!({
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });
    // Give the graceful-end handler time to set the Ending state before the timeout fires
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // Check that updateSession was called with Ending state
    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const endingUpdate = updateCalls.find(
      ([, patch]: [string, { state?: string }]) => patch.state === 'Ending',
    );
    expect(endingUpdate).toBeDefined();

    await waitMs(100);
    await gracefulPromise;
    await runPromise.catch(() => {/* ok */});
  }, 10_000);

  it('session.ended payload includes endReason field', async () => {
    const { handle: pendingHandle, releaseStreams: rsEndReason } = makePendingHandle();
    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const adapter = {
      spawn: jest.fn().mockResolvedValue(pendingHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockImplementation(async () => {
        setImmediate(() => rsEndReason());
      }),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };
    // Short timeout so CONTEXT_FULL_FORCED fires quickly
    const registry = makeRegistry({
      autoHandoff: true,
      gracefulEndTimeoutMs: 50,
      commands: { sessionEnd: '/end' },
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessionKey = manager.getActiveSessions()[0].sessionKey;
    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    const gracefulPromise = handoffCb!({
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });

    await waitMs(100);
    await gracefulPromise;
    await runPromise.catch(() => {/* ok */});

    const endedCalls = (events.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.ended,
    );
    // Every ended call must have an endReason field
    for (const [, payload] of endedCalls) {
      expect((payload as { endReason?: string }).endReason).toBeDefined();
    }
  }, 10_000);
});

describe('SessionManager — profile schema: new Task 3.3 fields', () => {
  it('ProfileSchema accepts autoHandoff, gracefulEndTimeoutMs, and commands.sessionEnd', () => {
    const result = parseProfile({
      projectId: 'test-proj',
      rootPath: '/tmp/test',
      sessionTypes: [{ name: 'impl', promptTemplate: 'x' }],
      ccsProfile: 'default',
      autoHandoff: true,
      gracefulEndTimeoutMs: 45_000,
      commands: { sessionEnd: '/my-end-command' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoHandoff).toBe(true);
      expect(result.data.gracefulEndTimeoutMs).toBe(45_000);
      expect(result.data.commands.sessionEnd).toBe('/my-end-command');
    }
  });

  it('ProfileSchema defaults autoHandoff=false, gracefulEndTimeoutMs=30000, commands={}', () => {
    const result = parseProfile({
      projectId: 'test-proj',
      rootPath: '/tmp/test',
      sessionTypes: [{ name: 'impl', promptTemplate: 'x' }],
      ccsProfile: 'default',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoHandoff).toBe(false);
      expect(result.data.gracefulEndTimeoutMs).toBe(30_000);
      expect(result.data.commands).toEqual({});
    }
  });

  it('ProfileSchema rejects gracefulEndTimeoutMs below 1000ms', () => {
    const result = parseProfile({
      projectId: 'test-proj',
      rootPath: '/tmp/test',
      sessionTypes: [{ name: 'impl', promptTemplate: 'x' }],
      ccsProfile: 'default',
      gracefulEndTimeoutMs: 500,
    });
    expect(result.success).toBe(false);
  });
});

// ── Phase 6.3 — Worktree isolation wiring ─────────────────────────────────────

describe('SessionManager — worktree isolation wiring (Phase 6.3)', () => {
  it('T1: worktreeIsolation=true → spawnConfig carries flag; store.updateSession persists worktreePath', async () => {
    const worktreePath = '/tmp/.git/worktrees/orch-sid';
    const store = makeStore();
    const registry = makeRegistry({ worktreeIsolation: true, baseBranch: 'main' });

    const handleWithWorktree: RuntimeHandle = {
      sessionId: 'claude-sess-wt',
      pid: 22222,
      abort: jest.fn(),
      stdout: makeEndedReadable(),
      stderr: makeEndedReadable(),
      worktreePath,
    };

    const adapter = {
      spawn: jest.fn().mockResolvedValue(handleWithWorktree),
      resume: jest.fn(),
      terminate: jest.fn().mockResolvedValue(undefined),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      store,
      makeEventBus() as never,
      makeTracing() as never,
      registry as never,
    );

    await manager.runSession('proj-1', basePlan);

    // Assert: adapter.spawn was called with worktreeIsolation: true
    expect(adapter.spawn).toHaveBeenCalledTimes(1);
    expect(adapter.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeIsolation: true }),
    );

    // Assert: store.updateSession was called with worktreePath exactly once
    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const worktreeUpdate = updateCalls.find(
      ([, patch]: [string, Partial<import('../../domain/session.js').Session>]) =>
        patch.worktreePath === worktreePath,
    );
    expect(worktreeUpdate).toBeDefined();
  });

  it('T2: worktreeIsolation=false (default) → spawnConfig carries flag=false; store.updateSession not called with worktreePath', async () => {
    const store = makeStore();
    const registry = makeRegistry({ worktreeIsolation: false });

    const handleNoWorktree: RuntimeHandle = {
      sessionId: 'claude-sess-no-wt',
      pid: 33333,
      abort: jest.fn(),
      stdout: makeEndedReadable(),
      stderr: makeEndedReadable(),
      worktreePath: undefined,
    };

    const adapter = {
      spawn: jest.fn().mockResolvedValue(handleNoWorktree),
      resume: jest.fn(),
      terminate: jest.fn().mockResolvedValue(undefined),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockResolvedValue(undefined),
    };

    const manager = new SessionManager(
      adapter as never,
      makeImmediateQueue() as never,
      store,
      makeEventBus() as never,
      makeTracing() as never,
      registry as never,
    );

    await manager.runSession('proj-1', basePlan);

    // Assert: adapter.spawn was called with worktreeIsolation: false
    expect(adapter.spawn).toHaveBeenCalledTimes(1);
    expect(adapter.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeIsolation: false }),
    );

    // Assert: store.updateSession was NOT called with a worktreePath in the payload
    const updateCalls = (store.updateSession as jest.Mock).mock.calls;
    const worktreeUpdate = updateCalls.find(
      ([, patch]: [string, Record<string, unknown>]) =>
        'worktreePath' in patch && patch['worktreePath'] !== undefined,
    );
    expect(worktreeUpdate).toBeUndefined();
  });
});

describe('SessionManager — integration: fake subprocess exits on stdin command', () => {
  it('writes slash-command to stdin and receives CONTEXT_FULL end reason', async () => {
    // Create a PassThrough-based handle where stdout ends immediately after a short delay
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const fakeHandle: RuntimeHandle = {
      sessionId: 'claude-fake-sess',
      pid: 99001,
      abort: jest.fn(),
      stdout,
      stderr,
    };

    const writtenToStdin: string[] = [];
    const adapter = {
      spawn: jest.fn().mockResolvedValue(fakeHandle),
      resume: jest.fn(),
      terminate: jest.fn().mockResolvedValue(undefined),
      awaitAndClassify: jest.fn().mockResolvedValue(undefined),
      writeStdin: jest.fn().mockImplementation(
        async (_handle: RuntimeHandle, text: string) => {
          writtenToStdin.push(text);
          // Simulate: process receives command and exits (stdout ends)
          setImmediate(() => {
            stdout.end();
            stderr.end();
          });
        },
      ),
    };

    const queue = makeImmediateQueue();
    const store = makeStore();
    const events = makeEventBus();
    const tracing = makeTracing();
    const registry = makeRegistry({
      autoHandoff: true,
      gracefulEndTimeoutMs: 5_000,
      commands: { sessionEnd: '/session-end' },
    });

    const manager = new SessionManager(
      adapter as never,
      queue as never,
      store,
      events as never,
      tracing as never,
      registry as never,
    );
    manager.onModuleInit();

    const runPromise = manager.runSession('proj-1', basePlan);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const sessionKey = manager.getActiveSessions()[0].sessionKey;
    const onCalls = (events.on as jest.Mock).mock.calls;
    const handoffCb = onCalls.find(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.forceHandoff,
    )?.[1] as ((p: unknown) => Promise<void>) | undefined;

    // Trigger graceful end
    const gracefulPromise = handoffCb!({
      sessionKey,
      projectId: 'proj-1',
      currentTokens: 235_000,
      threshold: 230_000,
      ts: new Date().toISOString(),
    });

    await gracefulPromise;
    await runPromise.catch(() => {/* ok */});

    // Verify stdin write happened
    expect(writtenToStdin).toContain('/session-end\n');

    // Verify CONTEXT_FULL reason (graceful exit, not forced)
    const endedCalls = (events.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.ended,
    );
    const contextFullEnded = endedCalls.find(
      ([, p]: [string, { endReason?: string }]) => p.endReason === 'CONTEXT_FULL',
    );
    expect(contextFullEnded).toBeDefined();

    // terminate() must not have been called
    expect(adapter.terminate).not.toHaveBeenCalled();
  }, 10_000);
});
