/**
 * flood-control.ts — Wrapper for Grammy ctx.reply calls that handles Telegram 429.
 *
 * Catches GrammyError with "Too Many Requests" / error_code 429.
 * Reads retry_after from error parameters; backs off bounded to max 30s.
 * Max 3 retries; then logger.error + returns null (no throw).
 *
 * I-4: no @orch/core imports.
 *
 * Usage:
 *   const result = await withFloodControl(() => ctx.reply('hello'), logger);
 *   if (result === null) { /* reply dropped * / }
 */

import type { Logger } from 'pino';
import { GrammyError } from 'grammy';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * Wrap a Grammy API call with Telegram flood-control (429) retry logic.
 *
 * - Catches GrammyError with description containing "Too Many Requests" or error_code 429
 * - Reads `retry_after` from error parameters; backoff: `retry_after * 1000` ms (clamped to 30s)
 * - Max 3 retries; then logger.error + returns null (never throws)
 * - Non-429 errors are re-thrown immediately
 *
 * @param fn     Async function to execute (typically a ctx.reply call)
 * @param logger pino logger for error reporting
 * @returns The result of fn, or null if all retries exhausted
 */
export async function withFloodControl<T>(
  fn: () => Promise<T>,
  logger: Logger,
): Promise<T | null> {
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isFloodError(err)) {
        // Non-429 error: re-throw immediately
        throw err;
      }

      attempt++;
      if (attempt > MAX_RETRIES) {
        logger.error(
          { err, attempt },
          'telegram:flood-control:max-retries-exceeded',
        );
        return null;
      }

      const retryAfterMs = extractRetryAfterMs(err);
      const backoffMs = Math.min(retryAfterMs, MAX_BACKOFF_MS);

      logger.warn(
        { attempt, backoffMs, retryAfterMs },
        'telegram:flood-control:429-backoff',
      );

      await sleep(backoffMs);
    }
  }

  // Unreachable — loop exits via return or null return above
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns true if the error is a Telegram 429 flood-control error.
 */
function isFloodError(err: unknown): err is GrammyError {
  if (!(err instanceof GrammyError)) return false;
  const is429 = err.error_code === 429;
  const hasTooMany =
    typeof err.description === 'string' &&
    err.description.includes('Too Many Requests');
  return is429 || hasTooMany;
}

/**
 * Extract `retry_after` seconds from a GrammyError's parameters.
 * Returns 1 second as default if the field is absent.
 */
function extractRetryAfterMs(err: GrammyError): number {
  // Grammy's error.parameters is typed as ResponseParameters (from Telegram API)
  // It may contain retry_after (number) when the error is 429.
  const params = err.parameters as Record<string, unknown> | undefined;
  if (params != null && typeof params['retry_after'] === 'number') {
    return params['retry_after'] * 1000;
  }
  return 1_000; // default: 1s if retry_after not provided
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
