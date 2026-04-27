/**
 * EventBusService spec
 *
 * Covers:
 *  - emit → on receives payload
 *  - unsubscribe stops further delivery
 *  - once resolves exactly once even if channel fires multiple times
 *  - Logger.log is called on every emit (I-11)
 *  - Type-narrowing: wrong payload shape is rejected at compile time
 *    (verified via pnpm typecheck — see the deliberate @ts-expect-error blocks below)
 */

import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service.js';
import { EVENT_CHANNELS } from './event-channels.js';
import type { EventPayloadMap } from './event-channels.js';

// ── Factory helpers ───────────────────────────────────────────────────────────

function createService(): { service: EventBusService; logSpy: jest.SpyInstance } {
  const emitter = new EventEmitter2({ wildcard: true, maxListeners: 50 });
  const service = new EventBusService(emitter);
  const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  return { service, logSpy };
}

function makeProfile(projectId = 'test-project') {
  return {
    projectId,
    rootPath: `/tmp/${projectId}`,
    sessionTypes: [{ name: 'impl', promptTemplate: 'do it', maxConcurrent: 1 }],
    hookTargets: [],
    queueSources: [],
    ccsProfile: 'default',
    maxConcurrentSessions: 1,
    langfuseEnabled: false,
    disableSecretRedaction: false,
  } as const;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EventBusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── emit → on ────────────────────────────────────────────────────────────────

  describe('emit / on', () => {
    it('delivers typed payload to subscriber', () => {
      const { service } = createService();
      const received: EventPayloadMap['project.registered'][] = [];

      service.on(EVENT_CHANNELS.project.registered, (p) => received.push(p));

      const profile = makeProfile();
      service.emit(EVENT_CHANNELS.project.registered, { project: profile });

      expect(received).toHaveLength(1);
      expect(received[0]?.project.projectId).toBe('test-project');
    });

    it('delivers payload to multiple subscribers on the same channel', () => {
      const { service } = createService();
      const calls1: unknown[] = [];
      const calls2: unknown[] = [];

      service.on(EVENT_CHANNELS.project.removed, (p) => calls1.push(p));
      service.on(EVENT_CHANNELS.project.removed, (p) => calls2.push(p));

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'proj-x' });

      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
    });
  });

  // ── unsubscribe ───────────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('stops delivery after unsubscribe()', () => {
      const { service } = createService();
      const received: unknown[] = [];

      const unsub = service.on(EVENT_CHANNELS.project.removed, (p) => received.push(p));

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'proj-a' });
      expect(received).toHaveLength(1);

      unsub();

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'proj-b' });
      expect(received).toHaveLength(1); // still 1 — not called again
    });

    it('does not affect other subscribers when one unsubscribes', () => {
      const { service } = createService();
      const calls1: unknown[] = [];
      const calls2: unknown[] = [];

      const unsub1 = service.on(EVENT_CHANNELS.project.removed, (p) => calls1.push(p));
      service.on(EVENT_CHANNELS.project.removed, (p) => calls2.push(p));

      unsub1();

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'proj-z' });

      expect(calls1).toHaveLength(0); // unsubscribed
      expect(calls2).toHaveLength(1); // still active
    });
  });

  // ── once ─────────────────────────────────────────────────────────────────────

  describe('once', () => {
    it('resolves with the first payload', async () => {
      const { service } = createService();

      const p = makeProfile('once-project');
      const promise = service.once(EVENT_CHANNELS.project.registered);

      service.emit(EVENT_CHANNELS.project.registered, { project: p });

      const result = await promise;
      expect(result.project.projectId).toBe('once-project');
    });

    it('does not fire a second time after resolving', async () => {
      const { service } = createService();
      const onceResults: unknown[] = [];

      const promise = service.once(EVENT_CHANNELS.project.registered).then((v) => {
        onceResults.push(v);
        return v;
      });

      const p1 = makeProfile('first');
      const p2 = makeProfile('second');

      service.emit(EVENT_CHANNELS.project.registered, { project: p1 });
      service.emit(EVENT_CHANNELS.project.registered, { project: p2 });

      await promise;
      // Give a tick for any possible second invocation to arrive
      await new Promise((r) => setTimeout(r, 10));

      expect(onceResults).toHaveLength(1);
      expect((onceResults[0] as EventPayloadMap['project.registered']).project.projectId).toBe('first');
    });
  });

  // ── Logger I-11 ───────────────────────────────────────────────────────────────

  describe('structured log on emit (I-11)', () => {
    it('calls Logger.log on every emit', () => {
      const { service, logSpy } = createService();

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'p1' });
      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'p2' });

      expect(logSpy).toHaveBeenCalledTimes(2);
    });

    it('includes channel in log payload', () => {
      const { service, logSpy } = createService();

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'p3' });

      const logArg = logSpy.mock.calls[0]?.[0] as { channel?: string } | undefined;
      expect(logArg?.channel).toBe('project.removed');
    });

    it('includes a summary in log payload', () => {
      const { service, logSpy } = createService();

      service.emit(EVENT_CHANNELS.project.removed, { projectId: 'p4' });

      const logArg = logSpy.mock.calls[0]?.[0] as { summary?: string } | undefined;
      expect(logArg?.summary).toContain('p4');
    });
  });

  // ── Type-level test ───────────────────────────────────────────────────────────

  /**
   * Type-level verification: the compile-time shape must be enforced.
   *
   * The blocks below use @ts-expect-error to assert that wrong payloads
   * are rejected by TypeScript. If a @ts-expect-error is not triggered by
   * a real error, tsc --noEmit will fail — making this a live type-level test.
   *
   * Run `pnpm --filter @orch/core run typecheck` to verify.
   */
  it('compile-time type guard: wrong payload type produces TS error', () => {
    const { service } = createService();

    // Correct usage — should compile
    service.emit(EVENT_CHANNELS.project.removed, { projectId: 'correct' });

    // Wrong payload — @ts-expect-error must be present or tsc will fail
    // @ts-expect-error: payload is missing projectId
    service.emit(EVENT_CHANNELS.project.removed, { wrongField: 'oops' });

    // @ts-expect-error: wrong channel literal
    service.emit('nonexistent.channel' as never, { projectId: 'x' });

    expect(true).toBe(true); // runtime assertion always passes; type-check is the real gate
  });
});
