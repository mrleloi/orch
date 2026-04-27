/**
 * bounded-ring.ts — Immutable prepend-and-cap utility for live-append lists.
 *
 * Design intent: most-recent-FIRST rendering. Prepend semantics keep index 0
 * as newest. Drop from tail when length exceeds maxSize.
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

/**
 * Append one item to the front of an array and cap the result at maxSize.
 *
 * Returns a NEW array — never mutates input. Pure. No logging.
 * Index 0 of the result is always the most recent item.
 *
 * @throws RangeError if maxSize is not a finite number > 0
 */
export function appendBounded<T>(existing: readonly T[], next: T, maxSize: number): T[] {
  // NaN/Infinity guard: slice(0, NaN) silently returns [], dropping the new item.
  if (!Number.isFinite(maxSize) || maxSize <= 0) {
    throw new RangeError('maxSize must be a finite number > 0');
  }
  return [next, ...existing].slice(0, maxSize);
}
