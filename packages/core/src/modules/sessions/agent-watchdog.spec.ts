/**
 * AgentWatchdog unit tests.
 *
 * I-13: Uses jest.useFakeTimers() to control setInterval ticks without wall-clock waits.
 * I-11: Verifies events are emitted for every non-ok action.
 * I-12: Verifies terminator errors are swallowed (watchdog does not crash).
 *
 * Mocks:
 *  - ISessionRegistry   — controls which sessions the watchdog sees
 *  - ISessionTerminator — spy to verify terminate() calls
 *  - EventBusService    — spy to verify event emissions
 */

import { SessionState } from '../../domain/session.js';
import type { WatchdogSession } from '../../domain/watchdog/decide-action.js';
import type { ISessionRegistry } from '../../domain/ports/session-registry.port.js';
import type { ISessionTerminator } from '../../domain/ports/session-terminator.port.js';
import {
  AgentWatchdog,
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_ABSOLUTE_CEILING_MS,
  DEFAULT_SOFT_WARN_GRACE_MS,
} from './agent-watchdog.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<WatchdogSession> = {}): WatchdogSession {
  return {
    id: 'sess-1',
    state: SessionState.Running,
    startedAt: Date.now() - 1_000, // 1s old — healthy by default
    lastHeartbeatAt: Date.now() - 500, // 500ms ago — healthy
    ...overrides,
  };
}

function makeRegistry(sessions: WatchdogSession[] = []): ISessionRegistry {
  return {
    getActive: jest.fn().mockReturnValue(sessions),
  };
}

function makeTerminator(): jest.Mocked<ISessionTerminator> {
  return {
    terminate: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEventBus() {
  return {
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
  };
}

function makeWatchdog(
  options: {
    sessions?: WatchdogSession[];
    registry?: ISessionRegistry;
    terminator?: jest.Mocked<ISessionTerminator>;
    eventBus?: ReturnType<typeof makeEventBus>;
  } = {},
) {
  const registry = options.registry ?? makeRegistry(options.sessions ?? []);
  const terminator = options.terminator ?? makeTerminator();
  const eventBus = options.eventBus ?? makeEventBus();

  const watchdog = new AgentWatchdog(
    registry,
    terminator,
    eventBus as never,
    {
      heartbeatTimeoutMs: 180_000,
      absoluteCeilingMs: 1_800_000,
      softWarnGraceMs: 60_000,
      intervalMs: 1_000, // short interval for tick tests
    },
  );

  return { watchdog, registry, terminator, eventBus };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentWatchdog — check() action dispatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── ok case ────────────────────────────────────────────────────────────────

  it('ok: no events emitted and terminator not called for healthy session', async () => {
    const session = makeSession({
      startedAt: Date.now() - 1_000,
      lastHeartbeatAt: Date.now() - 500,
    });
    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [session],
    });

    await watchdog.check();

    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(terminator.terminate).not.toHaveBeenCalled();
  });

  // ── soft-warn: null heartbeat path ────────────────────────────────────────

  it('soft-warn: emits session.warned when no heartbeat after timeout', async () => {
    const now = Date.now();
    const session = makeSession({
      startedAt: now - DEFAULT_HEARTBEAT_TIMEOUT_MS - 1,
      lastHeartbeatAt: null,
    });
    // Freeze time so Date.now() in check() matches our `now`
    jest.setSystemTime(now);

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [session],
    });

    await watchdog.check();

    expect(eventBus.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.warned,
      expect.objectContaining({ sessionId: session.id }),
    );
    expect(terminator.terminate).not.toHaveBeenCalled();
  });

  it('soft-warn: emits session.warned when heartbeat is stale (past timeout)', async () => {
    const now = Date.now();
    const session = makeSession({
      startedAt: now - DEFAULT_HEARTBEAT_TIMEOUT_MS * 2,
      lastHeartbeatAt: now - DEFAULT_HEARTBEAT_TIMEOUT_MS - 1,
    });
    jest.setSystemTime(now);

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [session],
    });

    await watchdog.check();

    expect(eventBus.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.warned,
      expect.objectContaining({ sessionId: session.id }),
    );
    expect(terminator.terminate).not.toHaveBeenCalled();
  });

  // ── hard-kill: absolute ceiling ───────────────────────────────────────────

  it('hard-kill: emits session.killed and calls terminator when past ceiling', async () => {
    const now = Date.now();
    const session = makeSession({
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: now - 500, // recent heartbeat — ceiling still wins
    });
    jest.setSystemTime(now);

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [session],
    });

    await watchdog.check();

    expect(eventBus.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.killed,
      expect.objectContaining({ sessionId: session.id }),
    );
    expect(terminator.terminate).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('ceiling'),
    );
  });

  // ── hard-kill: stuck after warn ───────────────────────────────────────────

  it('hard-kill: emits session.killed and calls terminator when stuck past warn+grace', async () => {
    const now = Date.now();
    const session = makeSession({
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS / 2,
      lastHeartbeatAt: now - (DEFAULT_HEARTBEAT_TIMEOUT_MS + DEFAULT_SOFT_WARN_GRACE_MS + 1),
    });
    jest.setSystemTime(now);

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [session],
    });

    await watchdog.check();

    expect(eventBus.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.killed,
      expect.objectContaining({ sessionId: session.id }),
    );
    expect(terminator.terminate).toHaveBeenCalledWith(
      session.id,
      expect.stringContaining('heartbeat'),
    );
  });

  // ── event emission order ──────────────────────────────────────────────────

  it('hard-kill: session.killed event is emitted BEFORE terminate() is called', async () => {
    const now = Date.now();
    const callOrder: string[] = [];

    const session = makeSession({
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: null,
    });
    jest.setSystemTime(now);

    const eventBus = makeEventBus();
    eventBus.emit.mockImplementation(() => {
      callOrder.push('emit');
    });

    const terminator = makeTerminator();
    terminator.terminate.mockImplementation(async () => {
      callOrder.push('terminate');
    });

    const { watchdog } = makeWatchdog({ sessions: [session], terminator, eventBus });

    await watchdog.check();

    expect(callOrder).toEqual(['emit', 'terminate']);
  });

  // ── terminal state filtering ──────────────────────────────────────────────

  it('skips terminal sessions (Ended, Failed) in check()', async () => {
    const now = Date.now();
    const endedSession = makeSession({
      state: SessionState.Ended,
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: null,
    });
    jest.setSystemTime(now);

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [endedSession],
    });

    await watchdog.check();

    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(terminator.terminate).not.toHaveBeenCalled();
  });

  it('skips Failed state sessions', async () => {
    const now = Date.now();
    const failedSession = makeSession({
      state: SessionState.Failed,
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: null,
    });
    jest.setSystemTime(now);

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [failedSession],
    });

    await watchdog.check();

    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(terminator.terminate).not.toHaveBeenCalled();
  });

  // ── error isolation ───────────────────────────────────────────────────────

  it('error isolation: if terminator throws, watchdog logs and continues to next session', async () => {
    const now = Date.now();
    const killableSession = makeSession({
      id: 'sess-kill',
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: null,
    });
    const healthySession = makeSession({
      id: 'sess-ok',
      startedAt: now - 1_000,
      lastHeartbeatAt: now - 500,
    });
    jest.setSystemTime(now);

    const terminator = makeTerminator();
    terminator.terminate.mockRejectedValue(new Error('terminate failed'));

    const { watchdog, eventBus } = makeWatchdog({
      sessions: [killableSession, healthySession],
      terminator,
    });

    // Should not throw — error is swallowed
    await expect(watchdog.check()).resolves.toBeUndefined();

    // killed event was still emitted before the error
    expect(eventBus.emit).toHaveBeenCalledWith(
      EVENT_CHANNELS.session.killed,
      expect.objectContaining({ sessionId: 'sess-kill' }),
    );

    // Healthy session was NOT affected (no events for it)
    const killedCalls = (eventBus.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.killed,
    );
    expect(killedCalls).toHaveLength(1);
    expect(killedCalls[0][1]).toMatchObject({ sessionId: 'sess-kill' });
  });

  it('error isolation: multiple sessions — second processed even if first kill fails', async () => {
    const now = Date.now();
    const sessions = [
      makeSession({ id: 'sess-1', startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1, lastHeartbeatAt: null }),
      makeSession({ id: 'sess-2', startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1, lastHeartbeatAt: null }),
    ];
    jest.setSystemTime(now);

    const terminator = makeTerminator();
    terminator.terminate.mockRejectedValue(new Error('always fails'));

    const { watchdog, eventBus } = makeWatchdog({ sessions, terminator });

    await expect(watchdog.check()).resolves.toBeUndefined();

    // Both sessions should have emitted killed events
    const killedCalls = (eventBus.emit as jest.Mock).mock.calls.filter(
      ([ch]: [string]) => ch === EVENT_CHANNELS.session.killed,
    );
    expect(killedCalls).toHaveLength(2);
  });
});

// ── Tick cadence tests ────────────────────────────────────────────────────────

describe('AgentWatchdog — setInterval tick cadence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('onModuleInit starts interval; check() is called on each tick', async () => {
    const { watchdog } = makeWatchdog({ sessions: [] });
    const checkSpy = jest.spyOn(watchdog, 'check').mockResolvedValue(undefined);

    watchdog.onModuleInit();

    expect(checkSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_000);
    // Flush the microtask queue so async check() body can execute
    await Promise.resolve();
    expect(checkSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(checkSpy).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(checkSpy).toHaveBeenCalledTimes(3);

    watchdog.onModuleDestroy();
  });

  it('onModuleDestroy stops interval — no more ticks after destroy', async () => {
    const { watchdog } = makeWatchdog({ sessions: [] });
    const checkSpy = jest.spyOn(watchdog, 'check').mockResolvedValue(undefined);

    watchdog.onModuleInit();
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(checkSpy).toHaveBeenCalledTimes(1);

    watchdog.onModuleDestroy();

    jest.advanceTimersByTime(5_000); // advance well past the interval
    await Promise.resolve();
    expect(checkSpy).toHaveBeenCalledTimes(1); // still 1 — no new ticks
  });

  it('onModuleDestroy is idempotent — calling twice does not throw', () => {
    const { watchdog } = makeWatchdog({ sessions: [] });

    watchdog.onModuleInit();
    expect(() => {
      watchdog.onModuleDestroy();
      watchdog.onModuleDestroy();
    }).not.toThrow();
  });
});

// ── Default config tests ──────────────────────────────────────────────────────

describe('AgentWatchdog — default configuration', () => {
  it('exports correct default threshold constants', () => {
    expect(DEFAULT_HEARTBEAT_TIMEOUT_MS).toBe(180_000);
    expect(DEFAULT_ABSOLUTE_CEILING_MS).toBe(1_800_000);
    expect(DEFAULT_SOFT_WARN_GRACE_MS).toBe(60_000);
  });
});

// ── Re-entrant tick guard ─────────────────────────────────────────────────────

describe('AgentWatchdog — re-entrant tick guard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('check() is re-entrant safe — second concurrent call logs tick-skipped and returns immediately', async () => {
    const now = Date.now();
    const session = makeSession({
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: null,
    });

    // Terminator that takes ~100ms (real timers — no fake timers in this describe)
    const terminator = makeTerminator();
    terminator.terminate.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
    );

    const eventBus = makeEventBus();
    const { watchdog } = makeWatchdog({ sessions: [session], terminator, eventBus });

    // Spy on logger.warn to capture tick-skipped log
    const warnSpy = jest.spyOn((watchdog as unknown as { logger: { warn: jest.Mock } }).logger, 'warn');

    // Launch two concurrent ticks
    await Promise.all([watchdog.check(), watchdog.check()]);

    // Terminator must only be called once (from the first tick)
    expect(terminator.terminate).toHaveBeenCalledTimes(1);

    // logger.warn must have been called with tick-skipped
    const tickSkippedCalls = warnSpy.mock.calls.filter(
      ([arg]: [unknown]) =>
        typeof arg === 'object' &&
        arg !== null &&
        (arg as Record<string, unknown>)['msg'] === 'watchdog:tick-skipped',
    );
    expect(tickSkippedCalls).toHaveLength(1);
    expect(tickSkippedCalls[0][0]).toMatchObject({ msg: 'watchdog:tick-skipped', reason: 're-entrant' });
  });
});

// ── Multi-session dispatch ────────────────────────────────────────────────────

describe('AgentWatchdog — multi-session dispatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('processes all sessions in a single tick — mix of ok, warn, kill', async () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const okSession = makeSession({
      id: 'ok',
      startedAt: now - 1_000,
      lastHeartbeatAt: now - 500,
    });
    const warnSession = makeSession({
      id: 'warn',
      startedAt: now - DEFAULT_HEARTBEAT_TIMEOUT_MS - 1,
      lastHeartbeatAt: null,
    });
    const killSession = makeSession({
      id: 'kill',
      startedAt: now - DEFAULT_ABSOLUTE_CEILING_MS - 1,
      lastHeartbeatAt: null,
    });

    const { watchdog, terminator, eventBus } = makeWatchdog({
      sessions: [okSession, warnSession, killSession],
    });

    await watchdog.check();

    const emitCalls = (eventBus.emit as jest.Mock).mock.calls as [string, unknown][];
    const channels = emitCalls.map(([ch]) => ch);

    expect(channels).toContain(EVENT_CHANNELS.session.warned);
    expect(channels).toContain(EVENT_CHANNELS.session.killed);
    expect(channels).not.toContain(EVENT_CHANNELS.session.started); // ok session has no events

    // warned for warnSession
    const warnedCalls = emitCalls.filter(([ch]) => ch === EVENT_CHANNELS.session.warned);
    expect(warnedCalls).toHaveLength(1);
    expect(warnedCalls[0][1]).toMatchObject({ sessionId: 'warn' });

    // killed for killSession
    const killedCalls = emitCalls.filter(([ch]) => ch === EVENT_CHANNELS.session.killed);
    expect(killedCalls).toHaveLength(1);
    expect(killedCalls[0][1]).toMatchObject({ sessionId: 'kill' });

    // terminate only called for kill session
    expect(terminator.terminate).toHaveBeenCalledTimes(1);
    expect(terminator.terminate).toHaveBeenCalledWith('kill', expect.any(String));
  });

  it('empty registry: check() completes without any events or terminator calls', async () => {
    const { watchdog, terminator, eventBus } = makeWatchdog({ sessions: [] });

    await expect(watchdog.check()).resolves.toBeUndefined();

    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(terminator.terminate).not.toHaveBeenCalled();
  });
});
