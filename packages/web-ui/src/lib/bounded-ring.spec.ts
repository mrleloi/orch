/**
 * bounded-ring.spec.ts — Unit tests for appendBounded utility.
 *
 * 6 tests covering the full contract defined in the Part B spec.
 */

import { describe, it, expect } from 'vitest';
import { appendBounded } from './bounded-ring.js';

describe('appendBounded', () => {
  it('appends to empty array', () => {
    const result = appendBounded([], 'a', 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('a');
  });

  it('prepends — newest at index 0', () => {
    let arr: string[] = [];
    arr = appendBounded(arr, 'a', 10);
    arr = appendBounded(arr, 'b', 10);
    arr = appendBounded(arr, 'c', 10);
    // Most recent (c) must be at index 0
    expect(arr).toEqual(['c', 'b', 'a']);
  });

  it('caps at maxSize', () => {
    let arr: number[] = [];
    for (let i = 0; i < 205; i++) {
      arr = appendBounded(arr, i, 200);
    }
    expect(arr).toHaveLength(200);
    // Index 0 is the last (newest) item: 204
    expect(arr[0]).toBe(204);
  });

  it('does not mutate input', () => {
    const original = [1, 2, 3];
    const snapshot = [...original];
    appendBounded(original, 4, 10);
    expect(original).toEqual(snapshot);
  });

  it('throws RangeError on maxSize <= 0', () => {
    expect(() => appendBounded([], 'x', 0)).toThrow(RangeError);
    expect(() => appendBounded([], 'x', -1)).toThrow(RangeError);
  });

  it('throws RangeError on non-finite maxSize (NaN, Infinity)', () => {
    expect(() => appendBounded([], 'x', Number.NaN)).toThrow(RangeError);
    expect(() => appendBounded([], 'x', Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('maxSize 1 keeps only newest', () => {
    let arr: string[] = [];
    arr = appendBounded(arr, 'first', 1);
    arr = appendBounded(arr, 'second', 1);
    arr = appendBounded(arr, 'third', 1);
    expect(arr).toHaveLength(1);
    expect(arr[0]).toBe('third');
  });
});
