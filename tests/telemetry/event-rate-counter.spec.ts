/**
 * Unit tests for EventRateCounter — SC-28 sliding-window event-rate counter.
 *
 * Uses clock injection (opts.now) — NO vi.useFakeTimers() globals.
 * This ensures test isolation and deterministic behaviour.
 *
 * Cases (≥4 required by §B.3.3):
 *   1. Empty window returns 0
 *   2. record() then count() returns 1
 *   3. Sliding-window expiry — event recorded at t=0 is evicted after windowMs
 *   4. Boundary — event at t=0 survives at windowMs-1, evicted at windowMs+1
 *   5. rate() math — 60 events over 60_000 ms window → ~1.0 events/sec
 *   6. reset() clears all state
 *   7. getEventRate() is idempotent — two calls return consistent results
 *   8. Integration: TelemetrySyncSeam.getEventRate().count === N after N emit() calls
 */

import { describe, it, expect } from 'vitest';
import { EventRateCounter } from '../../packages/core/src/telemetry/event-rate-counter.js';
import {
  TelemetrySyncSeam,
  type TelemetryEvent,
} from '../../packages/core/src/telemetry/sync-seam.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Controlled clock: returns whatever `currentMs` is set to. */
function makeControlledClock(initialMs: number): { now: () => number; advance: (ms: number) => void; set: (ms: number) => void } {
  let currentMs = initialMs;
  return {
    now: () => currentMs,
    advance: (ms: number) => { currentMs += ms; },
    set: (ms: number) => { currentMs = ms; },
  };
}

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    timestamp: '2026-04-27T10:00:00.000Z',
    domain: 'coding',
    event_type: 'orch.task.completed',
    attributes: {},
    ...overrides,
  };
}

// ── Test 1: Empty window returns 0 ───────────────────────────────────────────

describe('EventRateCounter — empty window', () => {
  it('count() returns 0 before any events are recorded', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ now: clock.now });
    expect(counter.count()).toBe(0);
  });

  it('rate() returns 0 before any events are recorded', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ now: clock.now });
    expect(counter.rate()).toBe(0);
  });
});

// ── Test 2: record() then count() returns 1 ──────────────────────────────────

describe('EventRateCounter — single record', () => {
  it('count() returns 1 after one record()', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ now: clock.now });
    counter.record();
    expect(counter.count()).toBe(1);
  });
});

// ── Test 3: Sliding-window expiry ────────────────────────────────────────────

describe('EventRateCounter — sliding window expiry', () => {
  it('count() returns 0 after clock advances past windowMs', () => {
    const clock = makeControlledClock(0);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });

    // Record at t=0
    counter.record();
    expect(counter.count()).toBe(1);

    // Advance past the window (t = 60_001)
    clock.advance(60_001);
    expect(counter.count()).toBe(0);
  });

  it('rate() returns 0 after all events have been evicted', () => {
    const clock = makeControlledClock(0);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });

    counter.record();
    clock.advance(70_000);
    expect(counter.rate()).toBe(0);
  });
});

// ── Test 4: Boundary exactness ────────────────────────────────────────────────

describe('EventRateCounter — window boundary', () => {
  it('event at t=0 survives when clock is at windowMs-1', () => {
    const clock = makeControlledClock(0);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });

    counter.record(); // t=0
    clock.advance(59_999); // t=59_999; cutoff = 59_999 - 60_000 = -1; ts[0]=0 > -1 → survives
    expect(counter.count()).toBe(1);
  });

  it('event at t=0 is evicted when clock advances to windowMs+1', () => {
    const clock = makeControlledClock(0);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });

    counter.record(); // t=0
    clock.advance(60_001); // t=60_001; cutoff = 60_001 - 60_000 = 1; ts[0]=0 <= 1 → evicted
    expect(counter.count()).toBe(0);
  });
});

// ── Test 5: rate() math ───────────────────────────────────────────────────────

describe('EventRateCounter — rate() math', () => {
  it('60 instantaneous events over 60_000 ms window → rate() ≈ 1.0', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });

    // Record 60 events at the same instant
    for (let i = 0; i < 60; i++) {
      counter.record();
    }

    // rate() = count / (windowMs / 1000) = 60 / 60 = 1.0
    expect(counter.rate()).toBeCloseTo(1.0);
    expect(counter.count()).toBe(60);
  });

  it('120 events over 60_000 ms window → rate() ≈ 2.0', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });

    for (let i = 0; i < 120; i++) {
      counter.record();
    }
    expect(counter.rate()).toBeCloseTo(2.0);
  });
});

// ── Test 6: reset() clears all state ─────────────────────────────────────────

describe('EventRateCounter — reset()', () => {
  it('reset() causes count() to return 0', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ now: clock.now });
    counter.record();
    counter.record();
    counter.record();
    expect(counter.count()).toBe(3);

    counter.reset();
    expect(counter.count()).toBe(0);
  });

  it('reset() causes rate() to return 0', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });
    for (let i = 0; i < 10; i++) counter.record();
    expect(counter.rate()).toBeGreaterThan(0);

    counter.reset();
    expect(counter.rate()).toBe(0);
  });
});

// ── Test 7: getEventRate() idempotency ────────────────────────────────────────

describe('EventRateCounter — idempotency', () => {
  it('count() is idempotent — calling twice returns same result', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ now: clock.now });
    counter.record();
    counter.record();
    const first = counter.count();
    const second = counter.count();
    expect(first).toBe(second);
    expect(first).toBe(2);
  });

  it('rate() is idempotent — calling twice returns same result', () => {
    const clock = makeControlledClock(1_000_000);
    const counter = new EventRateCounter({ windowMs: 60_000, now: clock.now });
    counter.record();
    const r1 = counter.rate();
    const r2 = counter.rate();
    expect(r1).toBe(r2);
  });
});

// ── Test 8: TelemetrySyncSeam.getEventRate() integration ─────────────────────

describe('TelemetrySyncSeam — getEventRate() integration (SC-28)', () => {
  it('getEventRate().count === 3 after 3 emit() calls', async () => {
    const seam = new TelemetrySyncSeam(); // disabled by default
    await seam.emit(makeEvent());
    await seam.emit(makeEvent());
    await seam.emit(makeEvent());
    const result = seam.getEventRate();
    expect(result.count).toBe(3);
  });

  it('getEventRate().count counts events emitted even when sync is disabled', async () => {
    const seam = new TelemetrySyncSeam({ enabled: false });
    await seam.emit(makeEvent());
    await seam.emit(makeEvent());
    const result = seam.getEventRate();
    // Counter records BEFORE the disabled guard — so both events are counted
    expect(result.count).toBe(2);
  });

  it('getEventRate().ratePerSec is non-negative', async () => {
    const seam = new TelemetrySyncSeam();
    await seam.emit(makeEvent());
    const result = seam.getEventRate();
    expect(result.ratePerSec).toBeGreaterThanOrEqual(0);
  });
});
