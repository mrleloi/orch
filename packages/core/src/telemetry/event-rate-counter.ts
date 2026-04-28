/**
 * Sliding-window event-rate counter.
 *
 * Counts events received in the last `windowMs` milliseconds.
 * Default window: 60_000 ms (1 minute).
 *
 * Decision-binding: this counter is the SC-28 real-measurement seam.
 * Replaces the Phase 7 mtime-proxy measurement.
 *
 * Domain-pure: ZERO @nestjs/* imports. No I/O. Pure in-memory data structure.
 * Thread-safety: single-process Node.js event loop assumption (no atomics).
 */

// ── Options ───────────────────────────────────────────────────────────────────

export interface EventRateCounterOptions {
  /** Sliding window size in milliseconds. Default 60_000. */
  windowMs?: number;
  /** Clock injection seam for testing. Default Date.now. */
  now?: () => number;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * EventRateCounter — a minimal sliding-window counter for SC-28.
 *
 * Internally stores an array of timestamps (milliseconds). `record()` appends
 * the current time. `count()` lazily evicts entries older than the window
 * boundary, then returns the length. This keeps `record()` O(1) and `count()`
 * O(k) where k = number of entries evicted — amortized O(1) under steady rate.
 *
 * @example
 *   const counter = new EventRateCounter({ windowMs: 60_000 });
 *   counter.record();
 *   counter.getEventRate(); // { count: 1, ratePerSec: 1/60 }
 */
export class EventRateCounter {
  private readonly windowMs: number;
  private readonly getNow: () => number;
  private timestamps: number[];

  constructor(opts?: EventRateCounterOptions) {
    this.windowMs = opts?.windowMs ?? 60_000;
    this.getNow = opts?.now ?? Date.now;
    this.timestamps = [];
  }

  /**
   * Record an event observed at `now()` time.
   *
   * O(1) — pushes the current timestamp and returns immediately.
   * Eviction of stale entries is deferred to `count()`.
   */
  record(): void {
    this.timestamps.push(this.getNow());
  }

  /**
   * Return the number of events recorded within the last `windowMs`.
   *
   * Lazily evicts entries older than `now() - windowMs` from the head
   * of the array. Returns the remaining length.
   */
  count(): number {
    const cutoff = this.getNow() - this.windowMs;
    // Remove stale entries from the front (oldest first, since record() appends)
    let i = 0;
    while (
      i < this.timestamps.length &&
      (this.timestamps[i] as number) <= cutoff
    ) {
      i++;
    }
    if (i > 0) {
      this.timestamps = this.timestamps.slice(i);
    }
    return this.timestamps.length;
  }

  /**
   * Events-per-second derived from `count() / (windowMs / 1000)`.
   *
   * Returns 0 when no events have been recorded in the window.
   */
  rate(): number {
    const n = this.count();
    if (n === 0) return 0;
    return n / (this.windowMs / 1000);
  }

  /**
   * Reset all state.
   *
   * After `reset()`, `count()` returns 0 and `rate()` returns 0.
   */
  reset(): void {
    this.timestamps = [];
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a default EventRateCounter with a 60-second window.
 *
 * Convenience factory; equivalent to `new EventRateCounter()`.
 */
export function createEventRateCounter(
  opts?: EventRateCounterOptions,
): EventRateCounter {
  return new EventRateCounter(opts);
}
