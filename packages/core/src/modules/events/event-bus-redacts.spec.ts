/**
 * event-bus-redacts.spec.ts
 *
 * Verifies that EventBusService deep-redacts string fields on payloads before
 * delivering them to subscribers, so no secret ever propagates through the bus.
 *
 * Uses a real EventEmitter2 instance (no NestJS DI needed for this test).
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service.js';
import { EVENT_CHANNELS } from './event-channels.js';

const LEAKY_KEY = 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv';

function buildBus(): EventBusService {
  const emitter = new EventEmitter2({ wildcard: false });
  return new EventBusService(emitter);
}

describe('EventBusService — payload redaction at emit time', () => {
  it('redacts a secret string field in the payload before delivering to subscriber', () => {
    const bus = buildBus();

    let received: { event: string; sessionId: string; timestamp: string } | null =
      null;
    bus.on(EVENT_CHANNELS.hook.received, (p) => {
      received = p;
    });

    bus.emit(EVENT_CHANNELS.hook.received, {
      event: 'SessionStart',
      sessionId: LEAKY_KEY,
      timestamp: new Date().toISOString(),
    });

    expect(received).not.toBeNull();
    expect(received!['sessionId']).not.toContain(LEAKY_KEY);
    expect(received!['sessionId']).toContain('[REDACTED]');
  });

  it('passes non-secret string fields through unchanged', () => {
    const bus = buildBus();

    let received: { event: string; sessionId: string; dedupKey: string } | null =
      null;
    bus.on(EVENT_CHANNELS.hook.deduped, (p) => {
      received = p;
    });

    bus.emit(EVENT_CHANNELS.hook.deduped, {
      event: 'PreCompact',
      sessionId: 'session-abc-123',
      dedupKey: 'session-abc-123-compact-uuid-xyz',
    });

    expect(received).not.toBeNull();
    expect(received!['sessionId']).toBe('session-abc-123');
    expect(received!['dedupKey']).toBe('session-abc-123-compact-uuid-xyz');
  });

  it('redacts secret in a nested payload field', () => {
    const bus = buildBus();

    let received: { sessionId: string; reason: string } | null = null;
    bus.on(EVENT_CHANNELS.session.warned, (p) => {
      received = p;
    });

    bus.emit(EVENT_CHANNELS.session.warned, {
      sessionId: 'sess-1',
      reason: `Watchdog: token=${LEAKY_KEY} caused timeout`,
    });

    expect(received).not.toBeNull();
    expect(received!['reason']).not.toContain(LEAKY_KEY);
    expect(received!['reason']).toContain('[REDACTED]');
  });

  it('does not affect non-string payload fields (numbers, booleans)', () => {
    const bus = buildBus();

    let received: { sessionKey: string; queueDepth: number } | null = null;
    bus.on(EVENT_CHANNELS.rqueue.enqueued, (p) => {
      received = p;
    });

    bus.emit(EVENT_CHANNELS.rqueue.enqueued, {
      sessionKey: 'proj/main',
      queueDepth: 5,
    });

    expect(received).not.toBeNull();
    expect(received!['queueDepth']).toBe(5);
    expect(received!['sessionKey']).toBe('proj/main');
  });
});
