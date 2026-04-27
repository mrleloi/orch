/**
 * timing-safe-compare spec
 *
 * Verifies correctness of the shared timingSafeCompare helper.
 *
 *  - Returns true when strings are identical
 *  - Returns false when strings differ in content
 *  - Returns false when strings have different lengths
 *  - Never throws
 */

import { timingSafeCompare } from './timing-safe-compare.js';

describe('timingSafeCompare', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompare('hello-world', 'hello-world')).toBe(true);
  });

  it('returns true for empty strings', () => {
    expect(timingSafeCompare('', '')).toBe(true);
  });

  it('returns false when strings differ in content (same length)', () => {
    expect(timingSafeCompare('aaaa', 'aaab')).toBe(false);
  });

  it('returns false when strings differ in length (provided shorter)', () => {
    expect(timingSafeCompare('longer-token', 'short')).toBe(false);
  });

  it('returns false when strings differ in length (provided longer)', () => {
    expect(timingSafeCompare('short', 'longer-token')).toBe(false);
  });

  it('returns false when expected is non-empty and provided is empty', () => {
    expect(timingSafeCompare('secret', '')).toBe(false);
  });

  it('returns false when expected is empty and provided is non-empty', () => {
    expect(timingSafeCompare('', 'secret')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(timingSafeCompare('Secret', 'secret')).toBe(false);
  });

  it('handles unicode characters', () => {
    expect(timingSafeCompare('café', 'café')).toBe(true);
    expect(timingSafeCompare('café', 'cafe')).toBe(false);
  });
});
