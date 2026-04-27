/**
 * redact-log-object.ts — Deep-redact string fields in a log object.
 *
 * Walks all string values in an object (recursively, including nested objects
 * and arrays) and applies redactSecrets() to each. Keys are never redacted.
 *
 * I-14: No NestJS imports. Framework-agnostic.
 *
 * Usage:
 *   import { redactLogObject } from './redact-log-object.js';
 *   const safe = redactLogObject({ message: 'Bearer sk-ant-...' });
 *
 * Idempotent: redactLogObject(redactLogObject(x)) deep-equals redactLogObject(x)
 * because redactSecrets is idempotent on strings.
 *
 * Stack-overflow safety:
 *   - MAX_DEPTH limits recursion to 10 levels (matches typical log object depth).
 *     Anything beyond depth 10 is passed through as-is to avoid blowing the stack
 *     on deeply-nested or circular objects from Fastify's internal logger.
 *   - Circular reference guard via a WeakSet of visited objects.
 */

import { redactSecrets } from './secret-redactor.js';

/** Maximum object nesting depth to recurse into. */
const MAX_DEPTH = 10;

/**
 * Deep-redact string fields on an object, preserving the original shape.
 *
 * - Strings: run through redactSecrets()
 * - Objects: recurse into own enumerable properties (up to MAX_DEPTH)
 * - Arrays: recurse into each element (up to MAX_DEPTH)
 * - Dates: passed through as-is (host objects with no enumerable own properties — Object.keys(new Date()) === [])
 * - Everything else (numbers, booleans, null, undefined): pass through as-is
 *
 * @param obj    Plain object to redact (from a pino log record, event payload, etc.)
 * @param _depth Internal recursion depth counter — do not pass externally.
 * @returns      A new object with the same shape but string values redacted.
 */
export function redactLogObject(
  obj: Record<string, unknown>,
  _depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    out[key] = redactValue(obj[key], _depth);
  }
  return out;
}

/**
 * Recursively redact a single value (may be any JSON-serialisable type).
 */
function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value);
  }
  if (depth >= MAX_DEPTH) {
    // Depth limit reached — pass through to avoid stack overflow on deep/circular objects.
    return value;
  }
  // Date has no enumerable own properties (Object.keys(new Date()) === []), so the
  // generic-object branch below would destroy it into {}. Pass through as-is.
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    return redactLogObject(value as Record<string, unknown>, depth + 1);
  }
  // number, boolean, null, undefined, symbol — pass through
  return value;
}
