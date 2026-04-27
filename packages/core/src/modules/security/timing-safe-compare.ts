/**
 * timing-safe-compare.ts — shared helper for constant-time string comparison.
 *
 * Extracted from HookSecretMiddleware for reuse in BearerAuthMiddleware and
 * any future middleware that needs timing-safe token comparison.
 *
 * Security contract (D12):
 *  - Uses crypto.timingSafeEqual to prevent timing attacks.
 *  - Both buffers must be the same byte length for timingSafeEqual.
 *  - When lengths differ a dummy comparison of equal length is performed
 *    so the function always takes roughly the same time regardless of
 *    whether the lengths match (prevents length-oracle leakage).
 *  - Never throws; returns false on any internal error.
 *
 * No NestJS imports (I-14 — framework-agnostic utility).
 */

import * as crypto from 'node:crypto';

/**
 * Compare `provided` against `expected` using a timing-safe byte comparison.
 *
 * @param expected  The known-good secret (from env var or config).
 * @param provided  The value supplied by the caller (from HTTP header, etc.).
 * @returns `true` if both UTF-8 byte sequences are identical, `false` otherwise.
 */
export function timingSafeCompare(expected: string, provided: string): boolean {
  try {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      // Perform a dummy comparison of equal length to prevent timing leakage
      // of the expected buffer length.
      const dummy = Buffer.alloc(expectedBuf.length);
      crypto.timingSafeEqual(expectedBuf, dummy);
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
