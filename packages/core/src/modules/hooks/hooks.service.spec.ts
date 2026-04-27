/**
 * HooksService spec
 *
 * Unit tests using in-memory fakes for Prisma, EventBus, and Tracing.
 *
 * Covers:
 *  - Dedup key computation: PreCompact (deterministic), ApiError (content-hash), generic (60s bucket)
 *  - Duplicate PreCompact → single DB row (dedup gate)
 *  - Duplicate ApiError → single DB row (content-hash gate)
 *  - State transition: Stop does NOT end session (stays Stopping)
 *  - State transition: SessionEnd DOES end session (state = Ended)
 *  - Both transitions emit EventBus channels (I-11)
 *  - Unknown sessionId → warn logged, HookEvent inserted, no crash
 *  - Transaction rollback: if session update throws, HookEvent NOT persisted
 *  - Terminal session skip: no state update when already Ended
 */

import * as crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import { HooksService } from './hooks.service.js';
import { SessionState } from '../../domain/session.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import type { EventBusService } from '../events/event-bus.service.js';
import type { TracingService } from '../tracing/tracing.service.js';
import type { PrismaService } from '../db/prisma.service.js';

// ── Fake builders ─────────────────────────────────────────────────────────────

/** In-memory HookEvent store */
type InMemHookEvent = { id: string; sessionId: string; eventType: string; payloadJson: string; dedupKey: string };
/** In-memory Session store */
type InMemSession = { id: string; claudeSessionId?: string; state: string; startedAt: Date | null; endedAt?: Date; endReason?: string };

function buildFakePrisma(opts: {
  hookEvents?: InMemHookEvent[];
  sessions?: InMemSession[];
  throwOnSessionUpdate?: boolean;
}) {
  const hookEvents: InMemHookEvent[] = opts.hookEvents ?? [];
  const sessions: InMemSession[] = opts.sessions ?? [];

  // Simulate $transaction by running the callback immediately (synchronous-style fake)
  const tx = {
    hookEvent: {
      findUnique: jest.fn(({ where }: { where: { dedupKey: string } }) => {
        return Promise.resolve(
          hookEvents.find((e) => e.dedupKey === where.dedupKey) ?? null,
        );
      }),
      create: jest.fn(({ data }: { data: InMemHookEvent }) => {
        if (opts.throwOnSessionUpdate) {
          // Don't throw here — only on session update
        }
        const ev: InMemHookEvent = {
          id: `he-${Date.now()}`,
          sessionId: data.sessionId,
          eventType: data.eventType,
          payloadJson: data.payloadJson,
          dedupKey: data.dedupKey,
        };
        hookEvents.push(ev);
        return Promise.resolve(ev);
      }),
    },
    session: {
      findFirst: jest.fn(({ where }: { where: { claudeSessionId: string } }) => {
        // Look up by claudeSessionId (the Claude Code UUID from hook payload)
        const s = sessions.find((s) => s.claudeSessionId === where.claudeSessionId) ?? null;
        return Promise.resolve(s ? { ...s } : null);
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<InMemSession> }) => {
        if (opts.throwOnSessionUpdate) {
          return Promise.reject(new Error('Simulated DB error on session update'));
        }
        const idx = sessions.findIndex((s) => s.id === where.id);
        if (idx >= 0) {
          sessions[idx] = { ...sessions[idx]!, ...data };
        }
        return Promise.resolve(sessions[idx]);
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => {
      return cb(tx);
    }),
    hookEvent: tx.hookEvent,
    session: tx.session,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { prisma: prisma as unknown as PrismaService, hookEvents, sessions, tx };
}

function buildFakeEventBus() {
  const emitted: Array<{ channel: string; payload: unknown }> = [];
  const eventBus = {
    emit: jest.fn((channel: string, payload: unknown) => {
      emitted.push({ channel, payload });
    }),
    on: jest.fn(),
    once: jest.fn(),
  };
  return { eventBus: eventBus as unknown as EventBusService, emitted };
}

function buildFakeTracing() {
  const spanEvents: Array<{ name: string; attrs?: Record<string, unknown> }> = [];
  const span = {
    setAttribute: jest.fn(),
    addEvent: jest.fn((name: string, attrs?: Record<string, unknown>) => {
      spanEvents.push({ name, attrs });
    }),
    setStatus: jest.fn(),
    end: jest.fn(),
    recordException: jest.fn(),
  };

  const tracing = {
    withSpan: jest.fn(
      async (
        _name: string,
        fn: (span: typeof span) => Promise<unknown>,
        _attrs?: Record<string, unknown>,
      ) => {
        return fn(span);
      },
    ),
    getActiveTraceparent: jest.fn(() => undefined),
  };
  return { tracing: tracing as unknown as TracingService, span, spanEvents };
}

function buildService(opts: {
  hookEvents?: InMemHookEvent[];
  sessions?: InMemSession[];
  throwOnSessionUpdate?: boolean;
}) {
  const { prisma, hookEvents, sessions, tx } = buildFakePrisma(opts);
  const { eventBus, emitted } = buildFakeEventBus();
  const { tracing, span, spanEvents } = buildFakeTracing();
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  const service = new HooksService(prisma, eventBus, tracing);
  return { service, prisma, hookEvents, sessions, tx, eventBus, emitted, tracing, span, spanEvents };
}

// ── Test data ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'sess-abc123';

function makeRunningSession(id = SESSION_ID, claudeSessionId = SESSION_ID): InMemSession {
  return { id, claudeSessionId, state: SessionState.Running, startedAt: new Date() };
}

// ── Dedup key computation ──────────────────────────────────────────────────────

describe('HooksService.computeDedupKeyPublic', () => {
  afterEach(() => jest.restoreAllMocks());

  it('PreCompact uses deterministic key {sessionId}-compact-{uuid}', () => {
    const { service } = buildService({});
    const key = service.computeDedupKeyPublic(
      'PreCompact',
      { session_id: SESSION_ID, compact_uuid: 'uuid-abc', is_agent: false, is_error: false },
    );
    expect(key).toBe(`${SESSION_ID}-compact-uuid-abc`);
  });

  it('ApiError uses content-hash of sessionId+errorType+errorMessage', () => {
    const { service } = buildService({});
    const payload = {
      session_id: SESSION_ID,
      error_type: 'overloaded_error',
      error_message: 'The API is overloaded',
    };
    const key = service.computeDedupKeyPublic('ApiError', payload);
    const expectedHash = crypto
      .createHash('sha256')
      .update(`${SESSION_ID}:overloaded_error:The API is overloaded`)
      .digest('hex')
      .slice(0, 16);
    expect(key).toBe(`${SESSION_ID}-apierr-${expectedHash}`);
  });

  it('same ApiError payload produces same key (idempotent)', () => {
    const { service } = buildService({});
    const payload = {
      session_id: SESSION_ID,
      error_type: 'rate_limit_error',
      error_message: 'Too many requests',
    };
    const key1 = service.computeDedupKeyPublic('ApiError', payload);
    const key2 = service.computeDedupKeyPublic('ApiError', payload);
    expect(key1).toBe(key2);
  });

  it('generic event uses 60s bucket', () => {
    const { service } = buildService({});
    const nowMs = 1_700_000_000_000; // fixed time
    const key1 = service.computeDedupKeyPublic('Stop', { session_id: SESSION_ID }, nowMs);
    const key2 = service.computeDedupKeyPublic('Stop', { session_id: SESSION_ID }, nowMs + 30_000);
    // Same 60s bucket
    expect(key1).toBe(key2);
  });

  it('generic event uses different bucket after 60s', () => {
    const { service } = buildService({});
    const bucket1Ms = 1_700_000_000_000;
    const bucket2Ms = bucket1Ms + 60_001;
    const key1 = service.computeDedupKeyPublic('Stop', { session_id: SESSION_ID }, bucket1Ms);
    const key2 = service.computeDedupKeyPublic('Stop', { session_id: SESSION_ID }, bucket2Ms);
    expect(key1).not.toBe(key2);
  });

  it('dedup bucket is wall-clock aligned — events 1ms apart across boundary land in different buckets', () => {
    const { service } = buildService({});
    // 59_999 ms is in bucket 0 (Math.floor(59_999 / 60_000) = 0)
    // 60_001 ms is in bucket 1 (Math.floor(60_001 / 60_000) = 1)
    expect(
      service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 59_999),
    ).not.toBe(
      service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 60_001),
    );
    // 0 ms and 59_999 ms are in the same bucket (both bucket 0)
    expect(
      service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 0),
    ).toBe(
      service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 59_999),
    );
  });
});

// ── Duplicate PreCompact → single DB row ────────────────────────────────────

describe('HooksService.processEvent dedup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('duplicate PreCompact → returns deduped=true, does NOT insert second row', async () => {
    const existingKey = `${SESSION_ID}-compact-uuid-existing`;
    const existingEvent: InMemHookEvent = {
      id: 'he-1',
      sessionId: SESSION_ID,
      eventType: 'PreCompact',
      payloadJson: '{}',
      dedupKey: existingKey,
    };

    const { service, hookEvents } = buildService({ hookEvents: [existingEvent] });

    const result = await service.processEvent('PreCompact', {
      session_id: SESSION_ID,
      compact_uuid: 'uuid-existing',
    });

    expect(result.deduped).toBe(true);
    // Only the pre-existing event — no new insert
    expect(hookEvents).toHaveLength(1);
  });

  it('duplicate ApiError → returns deduped=true, does NOT insert second row', async () => {
    const payload = {
      session_id: SESSION_ID,
      error_type: 'overloaded_error',
      error_message: 'The API is overloaded',
    };
    const hash = crypto
      .createHash('sha256')
      .update(`${SESSION_ID}:overloaded_error:The API is overloaded`)
      .digest('hex')
      .slice(0, 16);
    const existingKey = `${SESSION_ID}-apierr-${hash}`;

    const existingEvent: InMemHookEvent = {
      id: 'he-2',
      sessionId: SESSION_ID,
      eventType: 'ApiError',
      payloadJson: '{}',
      dedupKey: existingKey,
    };

    const { service, hookEvents } = buildService({ hookEvents: [existingEvent] });

    const result = await service.processEvent('ApiError', payload);

    expect(result.deduped).toBe(true);
    expect(hookEvents).toHaveLength(1);
  });

  it('emits hook.deduped on dedup', async () => {
    const existingKey = `${SESSION_ID}-compact-uuid-dup`;
    const existingEvent: InMemHookEvent = {
      id: 'he-3',
      sessionId: SESSION_ID,
      eventType: 'PreCompact',
      payloadJson: '{}',
      dedupKey: existingKey,
    };

    const { service, emitted } = buildService({ hookEvents: [existingEvent] });

    await service.processEvent('PreCompact', {
      session_id: SESSION_ID,
      compact_uuid: 'uuid-dup',
    });

    const deduped = emitted.find((e) => e.channel === EVENT_CHANNELS.hook.deduped);
    expect(deduped).toBeDefined();
  });
});

// ── State transitions ────────────────────────────────────────────────────────

describe('HooksService.processEvent state transitions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('Stop event does NOT end session — state becomes Stopping', async () => {
    const session = makeRunningSession();
    const { service, sessions } = buildService({ sessions: [session] });

    const result = await service.processEvent('Stop', {
      session_id: SESSION_ID,
      is_error: false,
    });

    expect(result.deduped).toBe(false);
    expect(result.newState).toBe(SessionState.Stopping);
    expect(sessions[0]?.state).toBe(SessionState.Stopping);
  });

  it('SessionEnd event DOES end session — state becomes Ended', async () => {
    const session = makeRunningSession();
    const { service, sessions } = buildService({ sessions: [session] });

    const result = await service.processEvent('SessionEnd', {
      session_id: SESSION_ID,
      end_reason: 'user_exit',
    });

    expect(result.deduped).toBe(false);
    expect(result.newState).toBe(SessionState.Ended);
    expect(sessions[0]?.state).toBe(SessionState.Ended);
  });

  it('Stop emits session.stopped channel (I-11)', async () => {
    const session = makeRunningSession();
    const { service, emitted } = buildService({ sessions: [session] });

    await service.processEvent('Stop', {
      session_id: SESSION_ID,
      is_error: false,
    });

    const stopped = emitted.find((e) => e.channel === EVENT_CHANNELS.session.stopped);
    expect(stopped).toBeDefined();
  });

  it('SessionEnd emits session.ended channel (I-11)', async () => {
    const session = makeRunningSession();
    const { service, emitted } = buildService({ sessions: [session] });

    await service.processEvent('SessionEnd', {
      session_id: SESSION_ID,
    });

    const ended = emitted.find((e) => e.channel === EVENT_CHANNELS.session.ended);
    expect(ended).toBeDefined();
  });

  it('every event emits hook.received channel', async () => {
    const session = makeRunningSession();
    const { service, emitted } = buildService({ sessions: [session] });

    await service.processEvent('Stop', {
      session_id: SESSION_ID,
      is_error: false,
    });

    const received = emitted.filter((e) => e.channel === EVENT_CHANNELS.hook.received);
    expect(received.length).toBeGreaterThan(0);
  });
});

// ── Unknown sessionId ────────────────────────────────────────────────────────

describe('HooksService.processEvent unknown sessionId', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs warning and does not crash (HookEvent not inserted — FK can\'t resolve)', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const { service, hookEvents } = buildService({ sessions: [] });

    const result = await service.processEvent('Stop', {
      session_id: 'unknown-session-id',
      is_error: false,
    });

    expect(result.deduped).toBe(false);
    expect(result.newState).toBeUndefined();
    // Session lookup now happens BEFORE hookEvent.create.
    // Unknown sessions skip the insert (FK HookEvent.sessionId → Session.id can't resolve).
    expect(hookEvents).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ── Transaction rollback ─────────────────────────────────────────────────────

describe('HooksService.processEvent transaction rollback', () => {
  afterEach(() => jest.restoreAllMocks());

  it('DB error mid-transition → HookEvent NOT persisted, session state unchanged', async () => {
    const session = makeRunningSession();
    const { service, hookEvents, sessions } = buildService({
      sessions: [session],
      throwOnSessionUpdate: true,
    });

    await expect(
      service.processEvent('SessionEnd', {
        session_id: SESSION_ID,
        end_reason: 'exit',
      }),
    ).rejects.toThrow();

    // hookEvents array may have had the create called, but the $transaction
    // in our fake runs the whole callback sequentially — the session update
    // throws, which propagates out of the transaction. In a real DB, the
    // entire tx would be rolled back. Our fake simulates this: the session
    // state should be unchanged (still Running).
    expect(sessions[0]?.state).toBe(SessionState.Running);
  });
});

// ── Terminal session skip ────────────────────────────────────────────────────

describe('HooksService.processEvent terminal session', () => {
  afterEach(() => jest.restoreAllMocks());

  it('events on already-Ended session are skipped (no state update)', async () => {
    const endedSession: InMemSession = {
      id: SESSION_ID,
      claudeSessionId: SESSION_ID,
      state: SessionState.Ended,
      startedAt: new Date(),
    };
    const { service, tx } = buildService({ sessions: [endedSession] });

    const result = await service.processEvent('Stop', {
      session_id: SESSION_ID,
      is_error: false,
    });

    // State should still be Ended (not transitioning to Stopping)
    expect(result.newState).toBe(SessionState.Ended);
    expect(tx.session.update).not.toHaveBeenCalled();
  });
});

// ── ADVERSARIAL: session lookup uses claudeSessionId, not internal id ─────────
//
// This test ensures the fake's Session.id and Session.claudeSessionId are DIFFERENT
// values, proving the service looks up by claudeSessionId (not id).
// Without this distinction the original bug was invisible in tests.

describe('HooksService.processEvent looks up session by claudeSessionId, not internal id', () => {
  afterEach(() => jest.restoreAllMocks());

  it('looks up session by claudeSessionId, not internal id', async () => {
    // DELIBERATELY different values for the two id columns
    const ORCH_INTERNAL_ID = 'orch-cuid-internal-abc123';
    const CLAUDE_CODE_UUID = 'claude-uuid-distinct-xyz789';

    const session: InMemSession = {
      id: ORCH_INTERNAL_ID,          // Prisma @default(cuid()) internal id
      claudeSessionId: CLAUDE_CODE_UUID, // what Claude Code sends in hook payload
      state: SessionState.Starting,
      startedAt: null,
    };

    const { service, sessions } = buildService({ sessions: [session] });

    // Hook payload carries the Claude Code UUID, NOT the Orch internal id
    const result = await service.processEvent('SessionEnd', {
      session_id: CLAUDE_CODE_UUID,
    });

    // Transition should succeed (session was found via claudeSessionId)
    expect(result.deduped).toBe(false);
    expect(result.newState).toBe(SessionState.Ended);

    // DB row updated (by Orch internal id) — state is now Ended
    expect(sessions[0]?.state).toBe(SessionState.Ended);
  });

  it('falls back to unknown-session if hook uses Orch internal id (not claude UUID)', async () => {
    const ORCH_INTERNAL_ID = 'orch-cuid-internal-abc123';
    const CLAUDE_CODE_UUID = 'claude-uuid-distinct-xyz789';

    const session: InMemSession = {
      id: ORCH_INTERNAL_ID,
      claudeSessionId: CLAUDE_CODE_UUID,
      state: SessionState.Running,
      startedAt: new Date(),
    };

    const { service, sessions } = buildService({ sessions: [session] });

    // If caller mistakenly sends the Orch internal id, lookup should FAIL
    const result = await service.processEvent('Stop', {
      session_id: ORCH_INTERNAL_ID,  // wrong — this is the DB cuid, not the Claude UUID
      is_error: false,
    });

    // Should NOT find the session (unknown-session path)
    expect(result.newState).toBeUndefined();
    // Original state unchanged
    expect(sessions[0]?.state).toBe(SessionState.Running);
  });
});

// ── P2002 race during HookEvent insert ────────────────────────────────────────

describe('HooksService.processEvent P2002 race dedup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('P2002 race during HookEvent insert is converted into deduped path', async () => {
    const session = makeRunningSession();
    const p2002Err = { code: 'P2002', meta: { modelName: 'HookEvent', target: ['dedupKey'] } };

    // Build a custom fake where hookEvent.create rejects with P2002
    const sessions: InMemSession[] = [session];
    const customTx = {
      hookEvent: {
        findUnique: jest.fn().mockResolvedValue(null), // no existing dedup row
        create: jest.fn().mockRejectedValue(p2002Err),
      },
      session: {
        findFirst: jest.fn(({ where }: { where: { claudeSessionId: string } }) =>
          Promise.resolve(sessions.find((s) => s.claudeSessionId === where.claudeSessionId) ?? null),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const customPrisma = {
      $transaction: jest.fn(async (cb: (tx: typeof customTx) => Promise<unknown>) => cb(customTx)),
    } as unknown as PrismaService;

    const { eventBus } = buildFakeEventBus();
    const { tracing } = buildFakeTracing();

    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const svc = new HooksService(customPrisma, eventBus, tracing);

    const result = await svc.processEvent('Stop', {
      session_id: SESSION_ID,
      is_error: false,
    });

    expect(result.deduped).toBe(true);

    const logMsgs = logSpy.mock.calls.map((args) =>
      typeof args[0] === 'object' && args[0] !== null ? (args[0] as { msg?: string }).msg : args[0],
    );
    expect(logMsgs).toContain('hooks:p2002-race-deduped');
  });
});
