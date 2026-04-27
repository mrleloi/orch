/**
 * flood-control.spec.ts — Tests for the withFloodControl wrapper.
 *
 * Tests:
 *  5. Normal reply succeeds first try → returns result
 *  6. 429 retry_after=2 → backs off 2s, retries, succeeds on retry
 *  7. 429 × 3 → returns null + logger.error (no throw)
 *  8. max 30s backoff clamp (retry_after=60 → actual backoff ≤ 30s)
 *  + Non-429 error → re-thrown immediately
 *  + Partial retry: first 429, second success
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { GrammyError } from 'grammy';
import { withFloodControl } from './flood-control.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

/**
 * Build a fake GrammyError that resembles a Telegram 429 response.
 */
function make429Error(retryAfterSeconds: number): GrammyError {
  const err = new GrammyError(
    `Too Many Requests: retry after ${retryAfterSeconds}`,
    {
      ok: false,
      error_code: 429,
      description: `Too Many Requests: retry after ${retryAfterSeconds}`,
      parameters: { retry_after: retryAfterSeconds },
    },
    '',
    {},
  );
  return err;
}

function makeNonFloodError(): Error {
  return new Error('Network timeout');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('withFloodControl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Test 5: Normal reply succeeds first try → returns result
  it('test-5: normal fn succeeds first try → returns result', async () => {
    const logger = makeSilentLogger();
    const fn = vi.fn().mockResolvedValue('hello');

    const result = await withFloodControl(fn, logger);

    expect(result).toBe('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // Test 6: 429 retry_after=2 → backs off 2s, retries, succeeds on retry
  it('test-6: 429 with retry_after=2 → backs off, retries, succeeds on second attempt', async () => {
    const logger = makeSilentLogger();
    const warnSpy = vi.spyOn(logger, 'warn');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(make429Error(2))
      .mockResolvedValueOnce('success');

    const resultPromise = withFloodControl(fn, logger);

    // Advance timers by 2s to let backoff complete
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ backoffMs: 2000 }),
      expect.any(String),
    );
  });

  // Test 7: 429 × 3 → returns null + logger.error (no throw)
  it('test-7: 429 three times → returns null, calls logger.error, does not throw', async () => {
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const fn = vi.fn().mockRejectedValue(make429Error(1));

    const resultPromise = withFloodControl(fn, logger);

    // Advance timers enough to exhaust all 3 retries (1s + 1s + 1s)
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await resultPromise;

    expect(result).toBeNull();
    // fn called: 1 initial + 3 retries = 4 times? No: initial (attempt=0) + retry 1,2,3
    // Loop: attempt starts at 0. On 429: attempt++ (→1). attempt>3? No. Retry.
    //       Again: attempt++ (→2). Retry.
    //       Again: attempt++ (→3). Retry.
    //       Again: attempt++ (→4 > 3). Error + return null.
    expect(fn).toHaveBeenCalledTimes(4);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // Should not throw (resolved null above)
  });

  // Test 8: max 30s backoff clamp (retry_after=60 → actual backoff ≤ 30s)
  it('test-8: retry_after=60 → backoff clamped to 30s', async () => {
    const logger = makeSilentLogger();
    const warnSpy = vi.spyOn(logger, 'warn');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(make429Error(60))
      .mockResolvedValueOnce('ok');

    const resultPromise = withFloodControl(fn, logger);

    // Advance by 30s (max clamp)
    await vi.advanceTimersByTimeAsync(30_000);

    const result = await resultPromise;

    expect(result).toBe('ok');
    // Verify the backoff was clamped
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ backoffMs: 30_000 }),
      expect.any(String),
    );
  });

  it('non-429 error is re-thrown immediately without retry', async () => {
    const logger = makeSilentLogger();
    const networkErr = makeNonFloodError();
    const fn = vi.fn().mockRejectedValue(networkErr);

    await expect(withFloodControl(fn, logger)).rejects.toThrow('Network timeout');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('first attempt 429, second attempt succeeds', async () => {
    const logger = makeSilentLogger();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(make429Error(1))
      .mockResolvedValueOnce('result');

    const resultPromise = withFloodControl(fn, logger);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('GrammyError with "Too Many Requests" description (error_code not 429) is treated as flood', async () => {
    const logger = makeSilentLogger();
    const err = new GrammyError(
      'Too Many Requests: retry after 5',
      {
        ok: false,
        error_code: 400, // wrong code but has TooManyRequests in description
        description: 'Too Many Requests: retry after 5',
        parameters: { retry_after: 5 },
      },
      '',
      {},
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('done');

    const resultPromise = withFloodControl(fn, logger);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
