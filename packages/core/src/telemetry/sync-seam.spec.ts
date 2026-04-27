/**
 * Unit tests for TelemetrySyncSeam — opt-in telemetry forwarding seam.
 *
 * Covers Part-C gates C1–C9; 8 tests satisfy the ≥6 minimum.
 *
 * Key properties verified:
 *   - Default OFF (no env var → disabled; NoOpSink injected)
 *   - ORCH_TELEMETRY_SYNC=true enables the seam
 *   - emit() with disabled=false does NOT call sink.send
 *   - emit() with enabled=true calls sink.send exactly once with the event
 *   - NoOpSink.send() resolves without error or side effect
 *   - HttpsNdjsonSink.send() resolves (stub; no real network call)
 *   - Sink errors are swallowed (graceful degradation per Decision 031 §"Consequences" 8)
 *   - Timestamps can be injected; ISO format is preserved end-to-end
 */

import {
  TelemetrySyncSeam,
  NoOpSink,
  HttpsNdjsonSink,
  type TelemetryEvent,
  type TelemetrySink,
} from './sync-seam.js';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    timestamp: '2026-04-27T10:00:00.000Z',
    domain: 'coding',
    event_type: 'orch.task.completed',
    attributes: { phase: '8', substage: '8.7.3' },
    ...overrides,
  };
}

// ── Test 1: Default constructor → disabled, NoOpSink ─────────────────────────

describe('TelemetrySyncSeam — default constructor (no env var)', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['ORCH_TELEMETRY_SYNC'];
    delete process.env['ORCH_TELEMETRY_SYNC'];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['ORCH_TELEMETRY_SYNC'];
    } else {
      process.env['ORCH_TELEMETRY_SYNC'] = originalEnv;
    }
  });

  it('is disabled when no opts and env var is absent', () => {
    const seam = new TelemetrySyncSeam();
    expect(seam.isEnabled()).toBe(false);
  });

  it('emit() on disabled seam returns without calling any sink', async () => {
    const mockSink: TelemetrySink = { send: jest.fn().mockResolvedValue(undefined) };
    const seam = new TelemetrySyncSeam({ sink: mockSink });
    // enabled is false (no ORCH_TELEMETRY_SYNC, no opts.enabled)
    await seam.emit(makeEvent());
    expect((mockSink.send as jest.Mock).mock.calls).toHaveLength(0);
  });
});

// ── Test 2: ORCH_TELEMETRY_SYNC=true → enabled ────────────────────────────────

describe('TelemetrySyncSeam — ORCH_TELEMETRY_SYNC=true', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['ORCH_TELEMETRY_SYNC'];
    process.env['ORCH_TELEMETRY_SYNC'] = 'true';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['ORCH_TELEMETRY_SYNC'];
    } else {
      process.env['ORCH_TELEMETRY_SYNC'] = originalEnv;
    }
  });

  it('is enabled when ORCH_TELEMETRY_SYNC=true', () => {
    const seam = new TelemetrySyncSeam();
    expect(seam.isEnabled()).toBe(true);
  });
});

// ── Test 3: emit() disabled → sink NOT called ─────────────────────────────────

describe('TelemetrySyncSeam — emit() when disabled', () => {
  it('does not call sink.send when enabled is false', async () => {
    const mockSink: TelemetrySink = { send: jest.fn().mockResolvedValue(undefined) };
    const seam = new TelemetrySyncSeam({ enabled: false, sink: mockSink });
    await seam.emit(makeEvent());
    expect((mockSink.send as jest.Mock).mock.calls).toHaveLength(0);
  });
});

// ── Test 4: emit() enabled + custom sink → called once ───────────────────────

describe('TelemetrySyncSeam — emit() when enabled', () => {
  it('calls sink.send exactly once with the event when enabled', async () => {
    const capturedEvents: TelemetryEvent[] = [];
    const mockSink: TelemetrySink = {
      send: jest.fn().mockImplementation((ev: TelemetryEvent) => {
        capturedEvents.push(ev);
        return Promise.resolve();
      }),
    };
    const seam = new TelemetrySyncSeam({ enabled: true, sink: mockSink });
    const event = makeEvent();
    await seam.emit(event);
    expect((mockSink.send as jest.Mock).mock.calls).toHaveLength(1);
    expect(capturedEvents[0]).toStrictEqual(event);
  });
});

// ── Test 5: NoOpSink.send() resolves without side effect ─────────────────────

describe('NoOpSink', () => {
  it('send() resolves without error', async () => {
    const sink = new NoOpSink();
    await expect(sink.send(makeEvent())).resolves.toBeUndefined();
  });

  it('send() does not produce any observable side effect (console is not called)', async () => {
    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const sink = new NoOpSink();
    await sink.send(makeEvent());
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ── Test 6: HttpsNdjsonSink.send() resolves (stub, no network call) ───────────

describe('HttpsNdjsonSink (stub)', () => {
  it('send() resolves without throwing for stub endpoint', async () => {
    const sink = new HttpsNdjsonSink('https://telemetry.orch.local/v1/events');
    // Silence the debug log during test
    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    await expect(sink.send(makeEvent())).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });
});

// ── Test 7: emit() swallows sink errors (graceful degradation) ────────────────

describe('TelemetrySyncSeam — graceful degradation', () => {
  it('emit() does not throw when sink.send rejects', async () => {
    const failingSink: TelemetrySink = {
      send: jest.fn().mockRejectedValue(new Error('network failure')),
    };
    const seam = new TelemetrySyncSeam({ enabled: true, sink: failingSink });
    // Must not throw — telemetry failures are non-blocking per Decision 031 §"Consequences" 8
    await expect(seam.emit(makeEvent())).resolves.toBeUndefined();
  });
});

// ── Test 8: ISO 8601 timestamp is preserved end-to-end ───────────────────────

describe('TelemetrySyncSeam — timestamp passthrough', () => {
  it('preserves the caller-supplied ISO 8601 timestamp verbatim', async () => {
    const capturedEvents: TelemetryEvent[] = [];
    const recordingSink: TelemetrySink = {
      send: jest.fn().mockImplementation((ev: TelemetryEvent) => {
        capturedEvents.push(ev);
        return Promise.resolve();
      }),
    };
    const seam = new TelemetrySyncSeam({ enabled: true, sink: recordingSink });
    const isoTimestamp = new Date(0).toISOString(); // "1970-01-01T00:00:00.000Z"
    await seam.emit(makeEvent({ timestamp: isoTimestamp }));
    const received = capturedEvents[0];
    expect(received).toBeDefined();
    // Narrow the type so TS knows it is not undefined
    if (received === undefined) throw new Error('no event captured');
    expect(received.timestamp).toBe(isoTimestamp);
    // Confirm it is a valid ISO 8601 date string
    expect(new Date(received.timestamp).toISOString()).toBe(isoTimestamp);
  });
});
